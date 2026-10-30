#!/usr/bin/env node
// serve.mjs — Clause live server
//   • watches screens/*.json → lint + compile → queues the scene for the Figma plugin (/state)
//   • receives the extracted DOM back from the plugin (/dom/<name>) → writes exports/<name>.html (real, token-driven website)
//   • serves the exports listing at /
//   node scripts/serve.mjs [screen-name]
import { createCommands } from "./commands.mjs";
import http from "node:http";
import { loadRegistry } from "./registry.mjs";
import { watch, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, execFile, spawn } from "node:child_process";
import { loadCatalog as loadCatalogFn } from "./compile.mjs";
import { resolve, dirname } from "node:path";
import { createStore } from "./messages.mjs";
import { createWebPaste } from "./webpaste.mjs";
import { fileURLToPath } from "node:url";
import { MIN_PROTOCOL_VERSION, PRODUCT, PROTOCOL_VERSION, negotiate } from "@clause/contract/version";
const cli = resolve(dirname(fileURLToPath(import.meta.url)), "cli.mjs");
const run = (...args) => { try { return JSON.parse(execFileSync("node", [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 })); } catch (e) { throw new Error(String(e.stderr || e.message).trim().split("\n").filter(l => !/^\s+at /.test(l)).join("\n")); } };
const toHtmlPath = resolve(dirname(fileURLToPath(import.meta.url)), "to-html.mjs");
const freshToHtml = async () => (await import("./to-html.mjs?v=" + statSync(toHtmlPath).mtimeMs)).toHtml;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const PORT = Number(process.env.PORT || 8787);
const store = createStore(root);
const commands = createCommands(root);
// agent presence for the plugin pane: reading → thinking/custom → building → built → (reply clears). Auto-clears after 15 min.
let agent = null, agentT = null, lastPoll = 0; // lastPoll = last time the inbox watcher asked for messages (Claude is listening while it keeps polling)
function setAgent(state, text, busy) { clearTimeout(agentT); if (!state) agent = null; else { const keep = agent ? agent.busy : false; agent = { state, text: text || "", at: Date.now(), busy: busy === undefined ? keep : busy }; agentT = setTimeout(() => { agent = null; broadcast({ type: "agent" }); }, 45 * 60e3); } broadcast({ type: "agent" }); }
const EXPORTS = resolve(root, "exports");
mkdirSync(EXPORTS, { recursive: true });
let state = { version: Math.floor(Date.now() / 1000), name: null, screen: null, error: null, at: null }; // version is monotonic across restarts: a plugin that missed the restart must not ignore new jobs as old
let result = null; // the last job result, whatever it was (inspect, snap, build)
let lastBuild = null; // the last successful build — the frames a reply can carry as chips
const scenes = {}, doms = {};
const metaPath = resolve(EXPORTS, "meta.json");
let meta = {}; try { meta = JSON.parse(readFileSync(metaPath, "utf8")); } catch {}
const fileKey = ((existsSync(resolve(root, "ds/config.md")) ? readFileSync(resolve(root, "ds/config.md"), "utf8") : "").match(/File key: `(\w+)`/) || [])[1];
mkdirSync(resolve(root, "screens"), { recursive: true });
const figmaUrl = name => meta[name] && fileKey ? `https://www.figma.com/design/${fileKey}/?node-id=${meta[name].roots[0].replace(":", "-")}` : null;
const stamp = () => new Date().toISOString().slice(11, 19);

async function exportHtml(name) {
  try {
    const S = scenes[name]; if (!S) return;
    const screens = doms[name] && doms[name].version === S.__v ? doms[name].screens : null;
    const html = (await freshToHtml())(name, S, { screens });
    writeFileSync(resolve(EXPORTS, name + ".html"), html);
    if (screens) console.log(`  ↳ exports/${name}.html from Figma (${(html.length / 1024).toFixed(0)}kb)`);
  } catch (e) { console.error(`  exports/${name}.html failed: ${(e && e.message) || e}`); } // an export problem must never take the server down
}

// image fills: download once into .clause/img (curl follows redirects), inline as base64 for the plugin runtime
function attachImages(o) {
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) { o.forEach(attachImages); return; }
  if (typeof o.img === "string" && !o.imgB64) {
    try {
      const dir = resolve(root, ".clause/img"); mkdirSync(dir, { recursive: true });
      const f = resolve(dir, o.img.replace(/[^a-z0-9]+/gi, "_").slice(-120));
      if (!existsSync(f)) execFileSync("curl", ["-sL", "--max-time", "20", "-o", f, o.img]);
      o.imgB64 = readFileSync(f).toString("base64");
    } catch (e) { console.error("  image failed " + o.img + ": " + e.message); }
  }
  for (const k in o) if (k !== "imgB64") attachImages(o[k]);
}

// ---- which design system is the open Figma file using? (registry + manual choice) ----
let lastFile = null;
const regPath = resolve(root, "ds/registry.json"), choicePath = resolve(root, ".clause/ds-choice.json");
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
function dsResolve() {
  const reg = loadRegistry(root), choice = readJson(choicePath, {});
  const byId = id => reg.systems.find(x => x.id === id);
  let sys = null, source = "none";
  if (lastFile && choice[lastFile] && byId(choice[lastFile])) { sys = byId(choice[lastFile]); source = "choice"; }
  else if (lastFile) { sys = reg.systems.find(x => (x.files || []).includes(lastFile)) || null; if (sys) source = "registry"; }
  return { file: lastFile, system: sys, source, systems: reg.systems.map(({ id, name, dir }) => ({ id, name, dir })) };
}

// old node id -> new node id, recorded whenever a job replaces a node (chat chips follow the replacement)
const idmapPath = resolve(root, ".clause/idmap.json");
function mergeIdMap(list) { if (!Array.isArray(list) || !list.length) return; const m = readJson(idmapPath, {}); for (const r of list) if (r && r.from && r.to) m[r.from] = r.to; mkdirSync(resolve(root, ".clause"), { recursive: true }); writeFileSync(idmapPath, JSON.stringify(m, null, 1)); }

function rebuild(name) {
  try {
    // handed-over screens ("frozen": true in the JSON): the designer's frame is the source of truth, so a save never builds a second copy.
    // Changes to it are applied in place (swap.mjs ops on the live frame). A deliberate side-by-side build: set "frozen": false first.
    try { const j = JSON.parse(readFileSync(resolve(root, "screens", name + ".json"), "utf8")); if (j && j.frozen) { console.log(`[${stamp()}] ${name} frozen — not rebuilt`); return; } } catch {}
    // an editor may fire the watcher mid-write (half-written JSON): re-lint once after a short wait before calling it a failure
    const lintOnce = () => { try { execFileSync("node", [resolve(root, "scripts/lint.mjs"), name], { encoding: "utf8", stdio: "pipe" }); return null; } catch (e) { return String(e.stderr || e.stdout || e.message).trim(); } };
    let lintErr = lintOnce();
    if (lintErr) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 450); lintErr = lintOnce(); }
    if (lintErr) { const lines = lintErr.split("\n").map(l => l.trim()).filter(l => l && !/^✗/.test(l)); throw new Error(`${name}: ${lines[0] || "lint failed"}${lines.length > 1 ? ` (+${lines.length - 1} more)` : ""}\n${lintErr}`); }
    const screen = run("compile", name); screen.REPLACE = null; // plugin replaces by tag, not id
    attachImages(screen); // boxes with "img": "<url>" get their bytes inlined (the plugin cannot fetch)
    screen.__v = Date.now(); screen.FILE = lastFile; // the plugin of any other open file ignores this build
    scenes[name] = screen;
    state = { version: state.version + 1, name, screen, error: null, at: stamp() };
    console.log(`[${stamp()}] ${name} queued`);
    if (agent) setAgent("building", "Rebuilding " + name + "…");
    exportHtml(name);
    broadcast({ type: "state", version: state.version, name });
  } catch (e) {
    state = { version: state.version + 1, name, screen: null, error: String(e.message || e), at: stamp() };
    console.error(`[${stamp()}] ${name} ✗ ${state.error.split("\n")[0]}`);
    broadcast({ type: "state", version: state.version, name, error: state.error });
  }
}

let rtTimer = null;
for (const f of ["runtime.js", "extract.js"]) watch(resolve(root, "scripts", f), () => { clearTimeout(rtTimer); rtTimer = setTimeout(() => broadcast({ type: "rt", rtHash: rtInfo().hash }), 250); });
let timer = null;
watch(resolve(root, "screens"), (ev, file) => {
  if (!file || !file.endsWith(".json")) return;
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(file.replace(/\.json$/, "")), 200);
});

const clients = new Set();
const broadcast = o => { const d = `data: ${JSON.stringify(o)}\n\n`; for (const c of clients) c.write(d); };
setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 15000);
const rtPath = resolve(root, "scripts/runtime.js");
const rtInfo = () => { const t = readFileSync(rtPath, "utf8"), e = readFileSync(resolve(root, "scripts/extract.js"), "utf8"); return { text: t, hash: createHash("sha1").update(t + e).digest("hex").slice(0, 8) }; };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-clause", "access-control-allow-methods": "GET,POST,OPTIONS" };
const json = (res, code, b) => { res.writeHead(code, { "content-type": "application/json", ...cors }); res.end(JSON.stringify(b)); };
const body = req => new Promise(r => { let b = ""; req.on("data", d => b += d); req.on("end", () => r(b)); });

// One handshake for every part (plugin panel, capture extension, CLI). A mismatch is reported once
// per part in the log, so a half-updated install is visible without spamming every poll.
const mismatchSeen = new Set();
function handshake(url) {
  const part = url.searchParams.get("part") || "unknown";
  const raw = url.searchParams.get("protocol");
  const base = { product: PRODUCT, version: VERSION, protocol: PROTOCOL_VERSION, minProtocol: MIN_PROTOCOL_VERSION, part };
  if (raw === null) return { status: 200, body: { ok: true, ...base } };
  const result = negotiate(Number(raw), { part, version: url.searchParams.get("version") || undefined });
  if (!result.ok && !mismatchSeen.has(part)) {
    mismatchSeen.add(part);
    console.error(`[${stamp()}] ${part} speaks protocol ${raw}, this server speaks ${PROTOCOL_VERSION}: ${result.hint}`);
  }
  return { status: result.ok ? 200 : 426, body: { ...base, ...result } };
}

const webPaste = createWebPaste({ broadcast, pluginCount: () => clients.size, version: VERSION, protocol: PROTOCOL_VERSION, statsFile: resolve(root, ".clause/capture-stats.json"), log: m => console.error(`[${stamp()}] ${m}`) }); // Clause Capture → paste into Figma (see webpaste.mjs)

function listExports() {
  return readdirSync(EXPORTS).filter(f => f.endsWith(".html")).map(f => {
    const name = f.replace(/\.html$/, ""), p = resolve(EXPORTS, f), st = statSync(p), html = readFileSync(p, "utf8");
    const src = (html.match(/name="clause-source" content="([^"]+)"/) || [])[1] || "approximate";
    const m = html.match(/<script type="application\/json" id="clause-scene">([\s\S]*?)<\/script>/);
    let scene = null; try { scene = JSON.parse(m[1]); } catch {}
    let comps = 0; const w = x => { if (!x) return; if (x.c) comps++; (x.children || []).forEach(w); };
    if (scene) scene.SCREENS.forEach(([, t]) => w(t));
    return { name, figmaUrl: figmaUrl(name), title: scene ? scene.TITLE : name, source: src, mtime: st.mtimeMs, kb: Math.round(st.size / 1024), components: comps, tokens: scene ? Object.keys(scene.VARS).length : 0, width: scene ? scene.WIDTH : 1440, height: scene ? (scene.HEIGHT || 900) : 900, screens: scene ? scene.SCREENS.length : 1 };
  }).sort((a, b) => b.mtime - a.mtime);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"); const p = url.pathname;
  if (req.method === "OPTIONS") {
    const o = req.headers.origin;
    if ((p.startsWith("/term") || p === "/inbox" || p.startsWith("/extract") || p === "/capture/settings" || p === "/capture/result" || p === "/capture/reset" || p === "/capture/go" || p === "/capture/cancel" || p.startsWith("/capture/queue")) && o && o !== "null") { res.writeHead(403); return res.end(); }
    if ((p === "/capture/paste" || p === "/capture/ping" || p === "/capture/stage") && o && !o.startsWith("chrome-extension://")) { res.writeHead(403); return res.end(); } // only the extension may ask for a paste
    res.writeHead(204, cors); return res.end();
  }
  if (await webPaste(req, res, p, { json, body })) return;
  if (p === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(readFileSync(resolve(root, "scripts/listing.html"), "utf8")); }
  if (p === "/tokens.css") { const f = resolve(root, "ds/tokens.css"); res.writeHead(200, { "content-type": "text/css" }); return res.end(existsSync(f) ? readFileSync(f) : ""); }
  if (p === "/exports.json") return json(res, 200, listExports());
  if ((p === "/swap" || p === "/mobilize") && req.method === "POST") {
    if (req.headers["x-clause"] !== "1") return json(res, 403, { error: "POST with header x-clause: 1" });
    try {
      const spec = JSON.parse(await body(req)); const base = Object.values(scenes)[0] || {};
      const sc = { PAGE_ID: base.PAGE_ID || "0:1", TITLE: "_job", WIDTH: 1, HEIGHT: 1, SCREENS: [], VARS: {}, STYLES: {}, FONTS: [], COMPS: {}, __v: Date.now(), INSPECT: p === "/swap" ? "swap" : "mobilize", ...(p === "/swap" ? { SWAP: spec } : { MOBILIZE: spec }), FILE: lastFile };
      if (spec.useComps) { const cat = loadCatalogFn(spec.ds); for (const k of spec.useComps) { const c = cat.comps[k]; if (!c) return json(res, 400, { error: "unknown component " + k }); sc.COMPS[k] = c.lib ? { lib: true, setKey: c.setKey || null, key: c.key, def: c.def || null, alt: c.alt || undefined } : { id: c.id, set: c.set, def: c.def }; } }
      state = { version: state.version + 1, name: "_inspect", screen: sc, error: null, at: stamp() }; broadcast({ type: "state", version: state.version, name: "_inspect" });
      return json(res, 200, { ok: true, queued: "swap" });
    } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
  }
  if (p === "/variant" && req.method === "POST") {
    if (req.headers["x-clause"] !== "1") return json(res, 403, { error: "POST with header x-clause: 1" });
    try {
      const spec = JSON.parse(await body(req)); const cat = loadCatalogFn(spec.ds);
      const base = Object.values(scenes)[0] || {};
      const sc = { PAGE_ID: base.PAGE_ID || "0:1", TITLE: "_job", WIDTH: 1, HEIGHT: 1, SCREENS: [], VARS: {}, STYLES: {}, FONTS: [], COMPS: {}, __v: Date.now(), INSPECT: "variant", VARIANT: spec, FILE: lastFile };
      for (const k of spec.useComps || []) { const c = cat.comps[k]; if (!c) return json(res, 400, { error: "unknown component " + k }); sc.COMPS[k] = c.lib ? { lib: true, setKey: c.setKey || null, key: c.key, def: c.def || null, alt: c.alt || undefined } : { id: c.id, set: c.set, def: c.def }; }
      for (const n of spec.useVars || []) { const k = cat.vars.colors[n] || cat.vars.spacing["spacing-" + n] || cat.vars.radius["radius-" + n]; if (!k) return json(res, 400, { error: "unknown token " + n }); sc.VARS[n] = k; }
      state = { version: state.version + 1, name: "_inspect", screen: sc, error: null, at: stamp() }; broadcast({ type: "state", version: state.version, name: "_inspect" });
      return json(res, 200, { ok: true, queued: "variant" });
    } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
  }
  if (p === "/goto" && req.method === "POST") {
    if (req.headers["x-clause"] !== "1") return json(res, 403, { error: "POST with header x-clause: 1" });
    let b = {}; try { b = JSON.parse(await body(req) || "{}"); } catch {}
    broadcast({ type: "goto", pageId: b.pageId, nodeId: b.nodeId, file: lastFile }); return json(res, 200, { ok: true });
  }
  if (p === "/idmap" && req.method === "GET") return json(res, 200, readJson(idmapPath, {}));
  if (p === "/ds/active" && req.method === "GET") return json(res, 200, dsResolve());
  if (p.startsWith("/ds/") && req.method === "POST") {
    if (req.headers["x-clause"] !== "1") return json(res, 403, { error: "POST with header x-clause: 1" });
    let b = {}; try { b = JSON.parse(await body(req) || "{}"); } catch {}
    if (p === "/ds/file") { lastFile = String(b.name || "").slice(0, 200) || null; if (b.key && /^[A-Za-z0-9]{10,40}$/.test(String(b.key))) { try { mkdirSync(resolve(root, ".clause"), { recursive: true }); writeFileSync(resolve(root, ".clause/figma-file"), String(b.key) + "\n"); } catch {} } return json(res, 200, dsResolve()); }
    if (p === "/ds/choose") { const c = readJson(choicePath, {}); if (lastFile && b.id) { c[lastFile] = b.id; mkdirSync(resolve(root, ".clause"), { recursive: true }); writeFileSync(choicePath, JSON.stringify(c, null, 1)); } return json(res, 200, dsResolve()); }
  }
  // listening: grace period because the watcher is re-armed a few seconds after each message; Claude counts as listening while it is working
  if (p === "/status") return json(res, 200, { file: lastFile, listening: Date.now() - lastPoll < 45000 || !!(agent && agent.busy), plugin: clients.size > 0, update: readJson(resolve(root, ".clause/update.json"), null), version: state.version, hasDs: existsSync(resolve(root, "ds/components.json")), dsAt: existsSync(resolve(root, "ds/components.json")) ? statSync(resolve(root, "ds/components.json")).mtimeMs : null });
  if (p.startsWith("/export/")) {
    const f = resolve(EXPORTS, p.slice(8));
    if (!f.startsWith(EXPORTS) || !existsSync(f)) return json(res, 404, { error: "not found" });
    const h = { "content-type": "text/html; charset=utf-8" }; if (url.searchParams.get("download")) h["content-disposition"] = `attachment; filename="${p.slice(8)}"`;
    res.writeHead(200, h); return res.end(readFileSync(f));
  }
  if (p === "/runtime") { res.writeHead(200, { "content-type": "text/plain", ...cors }); return res.end(rtInfo().text); }
  if (p === "/extract") { res.writeHead(200, { "content-type": "text/plain", ...cors }); return res.end(readFileSync(resolve(root, "scripts/extract.js"), "utf8")); }
  if (p === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...cors });
    res.write(": hi\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (p === "/scene") return json(res, 200, { name: state.name, screen: state.screen, error: state.error, version: state.version, rtHash: rtInfo().hash });
  if (p === "/state") return json(res, 200, Object.assign({}, state, { rtHash: rtInfo().hash }));
  if (p === "/hello") { const h = handshake(url); return json(res, h.status, h.body); }
  if (p === "/health") return json(res, 200, { ok: true, product: PRODUCT, version: VERSION, protocol: PROTOCOL_VERSION, screens: readdirSync(resolve(root, "screens")).filter(f => f.endsWith(".json")) });
  if (p === "/result") {
    if (req.method === "POST") { try { result = JSON.parse(await body(req)); result.ts = Date.now(); const r = result; if (r.ok && r.name && !String(r.name).startsWith("_") && r.res && Array.isArray(r.res.roots) && r.res.roots.length) lastBuild = r; mergeIdMap(result.res && result.res.remap); if (agent && r.ok && !String(r.name).startsWith("_")) setAgent("built", "Built " + r.name + " · " + (r.res.ms / 1000).toFixed(1) + "s" + (r.res.warnings.length ? " · " + r.res.warnings.length + " warning(s)" : "")); else if (agent && !r.ok) setAgent("error", "Build failed: " + String(r.error).slice(0, 80));
      if (r.ok && !r.name.startsWith("_")) { meta[r.name] = { roots: r.res.roots, at: Date.now() }; writeFileSync(metaPath, JSON.stringify(meta)); } console.log(r.ok ? `  ✓ ${r.name} ${r.res.ms}ms ${(r.res.roots || []).join(",")}${r.res.warnings.length ? "  ⚠ " + r.res.warnings.join("; ") : ""}` : `  ✗ ${r.name}: ${r.error}`); } catch {} return json(res, 200, { ok: true }); }
    return json(res, 200, result);
  }
  if (p === "/domerror" && req.method === "POST") { try { const b = JSON.parse(await body(req)); console.error(`  figma: HTML EXPORT ERROR ${b.name}: ${b.error}`); } catch {} return json(res, 200, { ok: true }); }
  if (p === "/extract/start" && req.method === "POST") {
    const o = req.headers.origin; if (o && o !== "null") { res.writeHead(403); return res.end(); }
    if (req.headers["x-clause"] !== "1") return json(res, 403, { error: "POST with header x-clause: 1" });
    if (!clients.size) return json(res, 409, { error: "plugin not connected — run Clause Assist in Figma first" });
    let b = {}; try { b = JSON.parse(await body(req)); } catch {}
    const act = dsResolve(); if (act.system && !b.force) return json(res, 409, { error: `already extracted: "${act.file}" is registered as ${act.system.name} (pass {"force":true} to redo)` });
    broadcast({ type: "extract", ignoreSections: b.ignoreSections || [] }); console.log("  ⇣ extract requested"); return json(res, 200, { ok: true });
  }
  if (p === "/extract/ds" && req.method === "POST") {
    const o = req.headers.origin; if (o && o !== "null") { res.writeHead(403); return res.end(); }
    if (req.headers["x-clause"] !== "1") return json(res, 403, { error: "POST with header x-clause: 1" });
    try {
      const b = JSON.parse(await body(req)); const d = new Date(), z = n => String(n).padStart(2, "0");
      const stamp2 = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
      const preview = b.mode === "preview";
      const dsDir = preview ? resolve(root, ".clause", "ds-extracted-" + stamp2) : resolve(root, "ds"), bk = resolve(root, ".clause", "ds-backup-" + stamp2); mkdirSync(resolve(dsDir, "tokens"), { recursive: true });
      const had = []; if (!preview) for (const f of ["components.json", "variable-keys.json", "tokens/variables.json", "tokens/text-styles.json"]) { const src = resolve(dsDir, f); if (existsSync(src)) { mkdirSync(resolve(bk, "tokens"), { recursive: true }); copyFileSync(src, resolve(bk, f)); had.push(f); } }
      const W = (f, obj) => writeFileSync(resolve(dsDir, f), JSON.stringify(obj, null, 1));
      if (b.components) W("components.json", b.components); if (b.variableKeys) W("variable-keys.json", b.variableKeys);
      if (b.variables) W("tokens/variables.json", b.variables); if (b.textStyles) W("tokens/text-styles.json", b.textStyles);
      const m = b.meta || {}; const cfg = resolve(dsDir, "config.md");
      if (!existsSync(cfg) && m.file) writeFileSync(cfg, `# Clause — Config\n\n## Figma\n- **File**: ${m.file}\n  - File key: \`${m.fileKey || "PASTE-FILE-KEY"}\`\n  - Pages: ${(m.pages || []).map(x => "`" + x.id + "` " + x.name + (m.currentPage && x.id === m.currentPage.id ? " **test**" : "")).join(" · ")}\n  - Canvas page (generated frames land here) = the page marked **test** above; change it if needed.\n\n## Notes\n- Extracted by Clause Assist on ${d.toISOString().slice(0, 10)}.\n`);
      let cssErr = null; if (!preview) { try { execFileSync("node", [resolve(root, "scripts/tokens-css.mjs")], { stdio: "pipe" }); } catch (e) { cssErr = String(e.stderr || e.message).split("\n")[0]; } }
      const c = b.components || { local: [], library: [] }, k = b.variableKeys || {};
      const summary = `${preview ? "PREVIEW (written to .clause/ds-extracted-" + stamp2 + "/, ds/ untouched) — " : ""}Extracted from ${m.file || "the file"}: ${c.local.length} local + ${c.library.length} library components, ${Object.keys(k.colorAliases || {}).length} color aliases, ${Object.keys(k.spacing || {}).length} spacing, ${Object.keys(k.radius || {}).length} radius, ${Object.keys(k.textStyles || {}).length} text styles${m.ignored && m.ignored.length ? ` (ignored sections: ${m.ignored.join(", ")})` : ""}.${had.length ? ` Previous ds/ backed up to .clause/ds-backup-${stamp2}/.` : " Fresh ds/ (no previous catalog)."}${cssErr ? " tokens.css failed: " + cssErr : ""}`;
      store.addSystem({ title: preview ? "DS extracted (preview)" : "DS extracted", text: summary + (preview ? "\nClaude: compare it with the current ds/ (keys that would change, components/tokens new or missing), fix the extractor or the catalog as needed, and reply with what you recommend merging." : "\nClaude: audit the new catalog (naming, missing bg-primary/text aliases, text-style families, icon keys), note anything odd in .clause/local-rules.md, and reply with 2–3 lines + what to build first."), data: { fresh: !had.length, preview, dir: preview ? dsDir : null } });
      broadcast({ type: "term" }); console.log(`  ⇣ ds extracted · ${summary}`);
      return json(res, 200, { ok: true, summary });
    } catch (e) { console.error("extract error", e.message); return json(res, 400, { error: e.message }); }
  }
  if (p === "/term" || p.startsWith("/term/") || p === "/inbox") {
    // message pane: only the plugin iframe (Origin "null") or a local script (no Origin) may talk to it; a custom header forces a CORS preflight for web pages.
    const o = req.headers.origin;
    if (o && o !== "null") { res.writeHead(403); return res.end(); }
    if (req.method === "GET" && p === "/term/commands") return json(res, 200, { commands: commands.list() });
    if (req.method === "GET" && p === "/term") return json(res, 200, { messages: store.list(), queued: store.queued(), agent, ...store.state() });
    if (req.method === "GET" && p === "/inbox") { const peek = url.searchParams.get("peek"); if (!peek) lastPoll = Date.now(); const u = peek ? store.unread() : store.markRead(); if (!peek && u.length) { broadcast({ type: "term" }); setAgent("thinking", "Reading your " + (u.length === 1 ? "message" : u.length + " messages"), true); } return json(res, 200, { count: u.length, messages: u.map(m => ({ id: m.id, kind: m.kind, title: m.title, text: commands.expand(m.text), targets: m.targets })) }); }
    if (req.method !== "POST" || req.headers["x-clause"] !== "1") return json(res, 403, { error: "POST with header x-clause: 1" });
    let b = {}; try { b = JSON.parse(await body(req)); } catch {}
    let out = { ok: true };
    if (p === "/term/add") { if (!String(b.text || "").trim()) return json(res, 400, { error: "empty" }); out.message = store.add(b); }
    else if (p === "/term/edit") out.ok = store.edit(b.id, b.text);
    else if (p === "/term/remove") out.ok = store.remove(b.id);
    else if (p === "/term/send") out.sent = b.id ? store.sendOne(b.id) : store.send();
    else if (p === "/term/reply") {
      const targets = Array.isArray(b.targets) ? b.targets.slice() : [];
      // every frame built since the last reply comes back as a chip: the designer never has to hunt for it
      if (!b.working && lastBuild) {
        // a build made since my last reply belongs to this reply; anything older was already shown
        const lastClaude = Math.max(0, ...store.list().filter(m => m.from === "claude").map(m => m.t));
        const name = lastBuild.res.title || lastBuild.name;
        if (!lastClaude || lastBuild.ts > lastClaude) for (const id of lastBuild.res.roots) if (!targets.some(t => String(t.id) === String(id))) targets.push({ id, name, type: "FRAME" });
      }
      out.message = store.reply(b.text || "", targets, b.ask);
      if (b.working && agent && agent.state === "stopped") { /* still stopping */ } else if (b.working) setAgent("thinking", b.working === true ? "Still working…" : String(b.working), true); else setAgent(null);
    }
    else if (p === "/term/status") { if (b.state === "idle" || b.state === "done") setAgent(null); else if (agent && agent.state === "stopped" && Date.now() - agent.at < 10 * 60e3) { /* stop requested: keep showing "Stopping…" until Claude's final reply clears it, whatever status updates arrive meanwhile */ } else setAgent(b.state || "thinking", b.text || "", true); }
    else if (p === "/term/stop") { if (agent) { store.addSystem({ title: "STOP", text: "The user pressed Stop in the plugin. Abandon the current task now, leave files in a consistent state, and reply with one line saying where you stopped." }); setAgent("stopped", "Stopping…", false); } }
    else if (p === "/term/discard") out.removed = store.discardQueued();
    else if (p === "/term/new") out.session = store.newSession();
    else if (p === "/term/open") out.ok = store.open(b.id);
    else if (p === "/term/rename") out.ok = store.rename(b.id, b.title);
    else if (p === "/term/delete-session") out.ok = store.deleteSession(b.id);
    else if (p === "/term/clear") store.clear();
    else return json(res, 404, { error: "not found" });
    broadcast({ type: "term" }); return json(res, 200, out);
  }
  if ((p.startsWith("/inspect/") || p.startsWith("/snap/") || p === "/pages") && req.method === "POST") {
    // read-only jobs run by the plugin in WHATEVER file is open — no MCP access to that file needed
    const base = Object.values(scenes)[0];
    const sc = { PAGE_ID: base ? base.PAGE_ID : null, TITLE: "_job", WIDTH: 1, HEIGHT: 1, SCREENS: [], VARS: {}, STYLES: {}, FONTS: {}, COMPS: {}, __v: Date.now(), FILE: lastFile };
    let label;
    if (p === "/pages") { sc.PAGES = true; label = "pages"; }
    else if (p.startsWith("/snap/")) { label = decodeURIComponent(p.slice(6)).replace("-", ":"); sc.SNAP = { id: label, w: Number(url.searchParams.get("w")) || 1400 }; }
    else { label = decodeURIComponent(p.slice(9)).replace("-", ":"); sc.INSPECT = label; if (url.searchParams.get("remove")) sc.REMOVE = 1; if (url.searchParams.get("selection")) sc.SELECTION = 1; if (url.searchParams.get("depth")) sc.INSPECT_DEPTH = Number(url.searchParams.get("depth")); }
    state = { version: state.version + 1, name: "_inspect", screen: sc, error: null, at: stamp() };
    broadcast({ type: "state", version: state.version, name: "_inspect" }); return json(res, 200, { ok: true, queued: label });
  }
  if (p.startsWith("/push/") && req.method === "POST") { const n = decodeURIComponent(p.slice(6)); if (!existsSync(resolve(root, "screens", n + ".json"))) return json(res, 404, { error: "no such screen" }); rebuild(n); return json(res, 200, { ok: true, queued: n }); }
  if (p.startsWith("/dom/") && req.method === "POST") {
    const n = decodeURIComponent(p.slice(5)); if (n.startsWith("_")) { await body(req); return json(res, 200, { ok: true, skipped: true }); }
    try { const b = JSON.parse(await body(req)); if (!scenes[n]) scenes[n] = Object.assign(b.scene, { __v: Date.now() }); doms[n] = { version: scenes[n].__v, screens: b.screens }; if (b.warnings && b.warnings.length) console.error(`  figma: extract warnings (${b.warnings.length}): ` + b.warnings.slice(0, 6).join(" | ")); exportHtml(n); return json(res, 200, { ok: true }); }
    catch (e) { console.error("dom error", e.message); return json(res, 400, { error: e.message }); }
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Clause live server on http://localhost:${PORT} — watching screens/*.json · listing at /`);
  const checkUpdate = () => { try { spawn(process.execPath, [resolve(root, "scripts/update-check.mjs"), "--json"], { cwd: root, stdio: "ignore", detached: true }).unref(); } catch {} }; checkUpdate(); setInterval(checkUpdate, 3 * 3600e3); // auto-update when clean, else nudge via /status
  for (const f of readdirSync(resolve(root, "screens")).filter(f => f.endsWith(".json"))) {
    const n = f.replace(/\.json$/, "");
    try { scenes[n] = Object.assign(run("compile", n), { REPLACE: null, __v: Date.now() }); if (!existsSync(resolve(EXPORTS, n + ".html"))) exportHtml(n); } catch (e) { console.error("skip", n, e.message); }
  }
  const args = process.argv.slice(2), first = args.find(a => !a.startsWith("--"));
  if (first) rebuild(first);
  if (args.includes("--open")) { const u = `http://localhost:${PORT}/`; if (process.platform === "win32") execFile("cmd", ["/c", "start", "", u], () => {}); else execFile(process.platform === "darwin" ? "open" : "xdg-open", [u], () => {}); }
});
