// webpaste.mjs — Clause Capture (browser extension) → Figma, without switching windows.
//
//   Chrome extension ──POST /capture/paste──▶ this module ──osascript──▶ Figma gets focus, ⌘V, focus goes back
//                                                  │
//                                                  └─ SSE {type:"webpaste"} ─▶ Clause Assist plugin
//                                                        before: deselect (the paste lands top-level)
//                                                        after : select + zoom to the layers that arrived
//
// The captured page is already on the clipboard (the extension puts it there), so nothing big travels
// through here: the request is just "paste now". Figma's own importer then builds the layers.
//
// Safety: pressing keys on the machine is the sensitive part, so
//   • /capture/paste only accepts requests with `x-clause: 1` that are not from a web page
//     (no Origin header = a local tool, or an Origin of chrome-extension://… = the extension);
//   • it does nothing until the Clause Assist plugin has switched it on (/capture/settings, plugin only);
//   • one paste at a time, at most one per 1.5 s.
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { PROTOCOL_VERSION, negotiate } from "@clause/contract/version";

// ---- staged captures: several pages queued in Clause, pasted into Figma in one visit ----
// focus   : bring Figma forward once, clear whatever has the keyboard, return the app that was in front
// paste   : ⌘V into the canvas
// restore : give the focus back
const FOCUS = `
on run
  tell application "System Events"
    if not (exists application process "Figma") then error "Figma is not running"
    set prevName to name of first application process whose frontmost is true
  end tell
  tell application "Figma" to activate
  tell application "System Events"
    repeat 40 times
      if frontmost of application process "Figma" then exit repeat
      delay 0.05
    end repeat
    delay 0.12
  end tell
  return prevName
end run`;
// Figma's windows are not visible to System Events, so read the window bounds from the window server instead
const BOUNDS = `ObjC.import('CoreGraphics'); ObjC.import('Foundation');
function find(opt) {
  var list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(opt, 0)));
  return list.filter(function (x) { return x.kCGWindowOwnerName === 'Figma' && x.kCGWindowBounds.Width > 600 && x.kCGWindowBounds.Height > 400; })
    .sort(function (a, b) { return b.kCGWindowBounds.Width * b.kCGWindowBounds.Height - a.kCGWindowBounds.Width * a.kCGWindowBounds.Height; })[0];
}
function run() {
  var w = find($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements) || find($.kCGWindowListOptionAll);
  if (!w) return '';
  var r = w.kCGWindowBounds; return [r.X, r.Y, r.Width, r.Height].join(',');
}`;

const CLICK = `ObjC.import('CoreGraphics'); ObjC.import('Foundation');
function find(opt) {
  var list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(opt, 0)));
  return list.filter(function (x) { return x.kCGWindowOwnerName === 'Figma' && x.kCGWindowBounds.Width > 600 && x.kCGWindowBounds.Height > 400; })
    .sort(function (a, b) { return b.kCGWindowBounds.Width * b.kCGWindowBounds.Height - a.kCGWindowBounds.Width * a.kCGWindowBounds.Height; })[0];
}
function key(code, down) { $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateKeyboardEvent(null, code, down)); }
function run() {
  var w = find($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements) || find($.kCGWindowListOptionAll);
  if (!w) return 'nowindow';
  var r = w.kCGWindowBounds, pt = $.CGPointMake(r.X + r.Width * 0.55, r.Y + r.Height * 0.5);
  $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, pt, $.kCGMouseButtonLeft));
  $.NSThread.sleepForTimeInterval(0.03);
  $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, pt, $.kCGMouseButtonLeft));
  $.NSThread.sleepForTimeInterval(0.06);
  key(53, true); key(53, false); // Esc: drop the selection the click made
  $.NSThread.sleepForTimeInterval(0.03);
  return 'ok';
}`;
const PASTE = `tell application "System Events" to keystroke "v" using command down`;
const PASTE_BACK = `on run argv
  tell application "System Events"
    keystroke "v" using command down
    delay 0.15
    try
      set frontmost of application process (item 1 of argv) to true
    end try
  end tell
end run`;
const RESTORE = `on run argv
  tell application "System Events"
    try
      set frontmost of application process (item 1 of argv) to true
    end try
  end tell
end run`;
// put one captured page back on the clipboard as HTML (what the extension had written), straight into the system pasteboard
const CLIP = `ObjC.import('AppKit');
function run(argv) {
  var s = $.NSString.stringWithContentsOfFileEncodingError($(argv[0]), $.NSUTF8StringEncoding, null);
  var pb = $.NSPasteboard.generalPasteboard;
  pb.clearContents;
  pb.setStringForType(s, 'public.html');
  return 'ok';
}`;
const osa = (args, extra = []) => new Promise((res, rej) => {
  if (process.platform !== "darwin") return rej(new Error("Auto-paste is macOS only for now"));
  execFile("osascript", [...args, ...extra], { timeout: 20000 }, (err, out, stderr) => err ? rej(new Error(String(stderr || err.message))) : res(String(out || "").trim()));
});
const defaultSteps = {
  focus: () => osa(["-e", FOCUS]),
  bounds: async () => { const r = (await osa(["-l", "JavaScript", "-e", BOUNDS])).split(",").map(Number); return r.length === 4 && r.every((n) => isFinite(n)) ? r : null; },
  // click into the middle of the canvas so it (not a panel or the plugin pane) holds the keyboard, then Esc to drop the selection that click made
  canvas: async () => (await osa(["-l", "JavaScript", "-e", CLICK])) === "ok",
  escape: () => osa(["-e", 'tell application "System Events" to key code 53']),
  paste: () => osa(["-e", PASTE]),
  pasteBack: (prev) => osa(["-e", PASTE_BACK], [prev || ""]), // ⌘V and straight back to the browser: Figma imports on its own
  restore: (prev) => osa(["-e", RESTORE], [prev || ""]),
  clip: async (html) => { const f = join(tmpdir(), "clause-clip-" + process.pid + "-" + Date.now() + ".html"); writeFileSync(f, html); try { await osa(["-l", "JavaScript", "-e", CLIP], [f]); } finally { try { unlinkSync(f); } catch {} } }
};
export const _steps = defaultSteps; // for local diagnostics
const MAX_QUEUE = 40, MAX_BYTES = 300 * 1024 * 1024;

const hintFor = (msg) => {
  if (/^Command failed/.test(msg)) { const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean); msg = lines.length > 1 ? lines[lines.length - 1] : "macOS refused the keypress or click. Check Accessibility permission for the app running the server."; }
  if (/not allowed to send keystrokes|1002/i.test(msg)) return "macOS blocked the keypress: System Settings → Privacy & Security → Accessibility → allow the app that runs the Clause server (Terminal, iTerm, Claude…), then try again.";
  if (/not running/i.test(msg)) return "Open Figma first.";
  if (/NOLAND/.test(msg)) return "Figma did not take the paste. Click once on the canvas and try again.";
  if (/not authori[sz]ed|-1743/i.test(msg)) return "macOS asked to let this app control Figma / System Events: System Settings → Privacy & Security → Automation → allow it.";
  return msg.split("\n")[0].slice(0, 200);
};

const EXT_LIVE_MS = 90 * 1000; // the extension counts as "live" for this long after it last talked to us

export function createWebPaste({ broadcast, pluginCount, log = () => {}, runner = null, statsFile = null, steps = {}, version = "", protocol = PROTOCOL_VERSION }) {
  const S = Object.assign({}, defaultSteps, steps);
  const st = { mode: "now", queue: [], batch: null, awaiting: null, gate: null, waiters: [], enabled: false, busy: false, lastAt: 0, last: null, extAt: 0, extWarned: false, startedAt: Date.now(), totals: { captures: 0, frames: 0, since: Date.now() } };
  // the counter survives server restarts: it is only reset on purpose
  if (statsFile) { try { const t = JSON.parse(readFileSync(statsFile, "utf8")); if (t && typeof t.captures === "number") st.totals = { captures: t.captures | 0, frames: t.frames | 0, since: t.since || Date.now() }; } catch {} }
  const saveTotals = () => { if (!statsFile) return; try { mkdirSync(dirname(statsFile), { recursive: true }); writeFileSync(statsFile, JSON.stringify(st.totals)); } catch {} };
  // one snapshot for everyone (the plugin pane, curl): what is connected and how many frames came across
  const snapshot = () => ({ enabled: st.enabled, busy: st.busy, plugin: pluginCount() > 0, extension: { seen: st.extAt > 0, live: st.extAt > 0 && Date.now() - st.extAt < EXT_LIVE_MS, at: st.extAt || null }, last: st.last, totals: st.totals, mode: st.mode, queue: st.queue.map((q) => ({ id: q.id, title: q.title, url: q.url, at: q.at, kb: Math.round(q.html.length / 1024) })), batch: st.batch, awaiting: st.awaiting, now: Date.now() });
  const emit = () => { try { broadcast({ type: "capture", status: snapshot() }); } catch {} };
  const seen = (req) => { const o = req.headers.origin; if (o && o.startsWith("chrome-extension://")) { st.extAt = Date.now(); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // wait until the plugin reports what landed (or give up): the next page must not be pasted on top of one that is still being imported
  const waitResult = (ms) => new Promise((res) => { const t = setTimeout(() => { st.waiters = st.waiters.filter((w) => w !== done); res(false); }, ms); const done = () => { clearTimeout(t); res(true); }; st.waiters.push(done); });
  const bytesOf = () => st.queue.reduce((n, q) => n + q.html.length, 0);

  // The click gate. Figma comes forward and the plugin pane covers itself with an overlay: "click on the canvas". The pane notices when the user clicks
  // out of it (its window loses focus: the canvas has the keyboard now) and tells us /capture/go. If the pane is not holding the focus there is nothing to wait for.
  // Resolves 'clicked' | 'cancel' | 'timeout' | 'skip' (no plugin connected).
  function clickGate(n) {
    if (pluginCount() === 0) return Promise.resolve("skip");
    st.awaiting = { n, since: Date.now() }; broadcast({ type: "webpaste", phase: "await", n }); emit();
    return new Promise((resolve) => {
      const finish = (how) => { clearTimeout(t); st.gate = null; st.awaiting = null; emit(); resolve(how); };
      const t = setTimeout(() => finish("timeout"), 120000);
      st.gate = finish;
    });
  }

  // items = null: paste whatever is on the clipboard now (one capture); items = [...]: staged pages, each put on the clipboard in turn
  async function run(items) {
    const batch = !!items, n = batch ? items.length : 1, real = !runner || batch;
    let prev = "", ok = 0, restored = false;
    // back to the browser as soon as the ⌘V has gone out: the plugin imports and verifies in the background
    const back = async () => { if (real && !restored) { restored = true; try { await S.restore(prev); } catch {} } };
    st.busy = true; st.lastAt = Date.now(); if (batch) st.batch = { i: 0, n, title: "" }; emit();
    const t0 = Date.now(); const marks = []; const T = (name) => marks.push(name + " " + (Date.now() - t0) + "ms");
    try {
      if (pluginCount() > 0) broadcast({ type: "webpaste", phase: batch ? "batch-start" : "start" });
      if (real) {
        prev = await S.focus(); T("focus");
        // Clause clicks the canvas itself (a click in the plugin pane and a click on the canvas cost the user the same).
        // Only when that click cannot be made does the plugin ask the user to click the canvas.
        let clicked = false;
        try { clicked = await S.canvas(); T("click"); } catch (e) { log("canvas click failed: " + String(e && e.message || e).split("\n").map((l) => l.trim()).filter(Boolean).pop().slice(0, 160)); }
        if (!clicked) {
          const gate = await clickGate(n);
          if (gate === "cancel") throw new Error("CANCEL");
          if (gate === "timeout") throw new Error("No click on the canvas for two minutes, so nothing was pasted.");
          await sleep(100); try { await S.escape(); } catch {} // their click may have selected a frame
        }
      }
      for (let k = 0; k < n; k++) {
        const last = k === n - 1;
        if (batch) { st.batch = { i: k + 1, n, title: items[k].title }; emit(); await S.clip(items[k].html); }
        if (pluginCount() > 0) broadcast({ type: "webpaste", phase: "before", batch }); // no wait: the import takes longer than the plugin needs to note the page
        if (real && last) { await S.pasteBack(prev); restored = true; T("paste+back"); } // trigger the paste and switch back, do not wait for Figma
        else if (real) { await S.paste(); await sleep(500); }
        else await runner();
        broadcast({ type: "webpaste", phase: "after", batch });
        // the plugin reports what landed: nothing within a few seconds means Figma did not take the ⌘V
        if (pluginCount() > 0 && !(await waitResult(9000))) throw new Error("NOLAND");
        if (batch) { st.queue = st.queue.filter((q) => q.id !== items[k].id); emit(); }
        ok++;
      }
      st.last = Object.assign({}, st.last, { ok: true, at: Date.now() }, batch ? { batch: ok } : {});
      log((batch ? "pasted " + ok + " staged capture(s) into Figma" : "web capture pasted into Figma") + " [" + marks.join(", ") + "]");
    } catch (e) {
      const raw = String(e && e.message || e);
      if (raw === "CANCEL") { log("paste cancelled"); }
      else {
        const hint = hintFor(raw);
        st.last = { ok: false, at: Date.now(), error: hint + (batch && ok ? " (" + ok + " of " + n + " pasted)" : "") };
        broadcast({ type: "webpaste", phase: "error", text: st.last.error });
        log("paste failed: " + hint);
      }
    } finally {
      await back();
      broadcast({ type: "webpaste", phase: batch ? "batch-end" : "end" });
      st.batch = null; st.busy = false; emit();
    }
  }

  const originOk = (req, allow) => { const o = req.headers.origin; return !o || allow(o); };

  // returns true when it handled the request
  return async function handle(req, res, p, { json, body }) {
    if (!p.startsWith("/capture/")) return false;
    if (p === "/capture/status" && req.method === "GET") { seen(req); json(res, 200, snapshot()); return true; }
    if (req.method !== "POST") { json(res, 405, { error: "POST" }); return true; }
    if (req.headers["x-clause"] !== "1") { json(res, 403, { error: "POST with header x-clause: 1" }); return true; }

    if (p === "/capture/settings") { // the plugin iframe only (its Origin is "null")
      if (!originOk(req, (o) => o === "null")) { json(res, 403, { error: "plugin only" }); return true; }
      try { const b = JSON.parse(await body(req) || "{}"); st.enabled = !!b.enabled; if (b.mode === "stage" || b.mode === "now") st.mode = b.mode; } catch {}
      emit(); json(res, 200, { ok: true, enabled: st.enabled }); return true;
    }
    if (p === "/capture/result") { // the plugin reports what landed
      if (!originOk(req, (o) => o === "null")) { json(res, 403, { error: "plugin only" }); return true; }
      try { const b = JSON.parse(await body(req) || "{}"); const n = Math.max(0, b.count | 0); st.last = Object.assign({}, st.last, { count: n, names: Array.isArray(b.names) ? b.names.slice(0, 20) : [] }); if (n) { st.totals.captures += 1; st.totals.frames += n; saveTotals(); } } catch {}
      st.waiters.splice(0).forEach((w) => w()); emit(); json(res, 200, { ok: true }); return true;
    }
    if (p === "/capture/go" || p === "/capture/cancel") { // the plugin only: the user clicked onto the canvas / gave up
      if (!originOk(req, (o) => o === "null")) { json(res, 403, { error: "plugin only" }); return true; }
      let how = p === "/capture/go" ? "clicked" : "cancel"; if (how === "clicked") { try { const b = JSON.parse(await body(req) || "{}"); if (b.auto) how = "auto"; } catch {} }
      if (st.gate) st.gate(how); json(res, 200, { ok: true, waiting: !!st.gate }); return true;
    }
    if (p === "/capture/reset") { // the plugin only: start the counter again
      if (!originOk(req, (o) => o === "null")) { json(res, 403, { error: "plugin only" }); return true; }
      st.totals = { captures: 0, frames: 0, since: Date.now() }; saveTotals(); emit(); json(res, 200, { ok: true }); return true;
    }
    if (p === "/capture/ping") { // optional: the extension says hello (popup open, page load) so the pane can show it as connected
      if (!originOk(req, (o) => o.startsWith("chrome-extension://"))) { json(res, 403, { error: "extension only" }); return true; }
      let b = {}; try { b = JSON.parse(await body(req) || "{}"); } catch {}
      // The extension says which protocol it speaks. An old copy keeps working, but the server says
      // so once instead of failing later with a request the extension cannot understand.
      const hello = b.protocol === undefined ? { ok: true } : negotiate(Number(b.protocol), { part: "extension", version: b.version });
      if (!hello.ok && !st.extWarned) { st.extWarned = true; log("extension speaks protocol " + b.protocol + ", this server speaks " + protocol + ": " + hello.hint); }
      if (hello.ok) st.extWarned = false;
      const was = st.extAt > 0 && Date.now() - st.extAt < EXT_LIVE_MS; seen(req); if (!was) emit();
      json(res, 200, Object.assign({ ok: true, protocol, version, compatible: hello.ok }, hello.ok ? {} : { mismatch: { code: hello.code, hint: hello.hint } }, snapshot())); return true;
    }
    if (p === "/capture/stage") { // the extension hands over a finished capture to wait in the queue
      if (!originOk(req, (o) => o.startsWith("chrome-extension://"))) { json(res, 403, { error: "extension only" }); return true; }
      seen(req);
      if (!st.enabled) { json(res, 409, { ok: false, reason: "off", hint: "Open Clause Assist in Figma and turn on “Paste web captures” (Settings)." }); return true; }
      let b = {}; try { b = JSON.parse(await body(req) || "{}"); } catch { json(res, 400, { error: "bad json" }); return true; }
      const html = typeof b.html === "string" ? b.html : "";
      if (html.length < 50 || !html.includes("figh2d")) { json(res, 422, { ok: false, reason: "payload", hint: "That capture did not contain the Figma payload." }); return true; }
      if (st.queue.length >= MAX_QUEUE || bytesOf() + html.length > MAX_BYTES) { json(res, 413, { ok: false, reason: "full", hint: "The queue is full: paste or clear it first." }); return true; }
      const item = { id: Math.random().toString(36).slice(2, 10), title: String(b.title || "Untitled").slice(0, 120), url: String(b.url || "").slice(0, 300), at: Date.now(), html };
      st.queue.push(item); emit(); log("staged capture: " + item.title + " (" + Math.round(html.length / 1024) + " KB, " + st.queue.length + " waiting)");
      json(res, 200, { ok: true, queued: st.queue.length, id: item.id }); return true;
    }
    if (p === "/capture/queue/remove" || p === "/capture/queue/clear" || p === "/capture/queue/paste") { // the plugin only
      if (!originOk(req, (o) => o === "null")) { json(res, 403, { error: "plugin only" }); return true; }
      if (p === "/capture/queue/clear") { st.queue = []; emit(); json(res, 200, { ok: true }); return true; }
      if (p === "/capture/queue/remove") { try { const b = JSON.parse(await body(req) || "{}"); st.queue = st.queue.filter((q) => q.id !== b.id); } catch {} emit(); json(res, 200, { ok: true }); return true; }
      if (!st.enabled) { json(res, 409, { ok: false, reason: "off" }); return true; }
      if (st.busy) { json(res, 200, { ok: true, skipped: "busy" }); return true; }
      if (!st.queue.length) { json(res, 200, { ok: true, empty: true }); return true; }
      run(st.queue.slice()); json(res, 202, { ok: true, started: true, n: st.queue.length }); return true;
    }
    if (p === "/capture/paste") { // the Chrome extension (or a local tool)
      if (!originOk(req, (o) => o.startsWith("chrome-extension://"))) { json(res, 403, { error: "extension only" }); return true; }
      seen(req); emit();
      if (!st.enabled) { json(res, 409, { ok: false, reason: "off", hint: "Open Clause Assist in Figma and turn on “Paste web captures” (Settings)." }); return true; }
      if (st.busy || Date.now() - st.lastAt < 1500) { json(res, 200, { ok: true, skipped: "busy" }); return true; }
      run(null); // runs in the background: the extension must not wait for Figma
      json(res, 202, { ok: true, started: true }); return true;
    }
    json(res, 404, { error: "unknown capture route" }); return true;
  };
}
