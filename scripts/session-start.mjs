#!/usr/bin/env node
// session-start.mjs — runs from the SessionStart hook. Makes every Claude session in this repo start in the same state:
// server up, plugin/catalog/inbox status known, and the exact first actions spelled out. stdout becomes Claude's context.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, openSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 8787, B = `http://localhost:${PORT}`;
const get = async p => { try { const r = await fetch(B + p, { signal: AbortSignal.timeout(1500) }); return await r.json(); } catch { return null; } };
const out = [];
const hasDs = ["ds/components.json", "ds/variable-keys.json"].every(f => existsSync(resolve(root, f)));

let status = await get("/status"), started = false;
if (!status) {
  mkdirSync(resolve(root, ".clause"), { recursive: true });
  const log = openSync(resolve(root, ".clause", "server.log"), "a");
  try { const c = spawn(process.execPath, [resolve(root, "scripts/serve.mjs")], { cwd: root, detached: true, stdio: ["ignore", log, log], env: process.env }); c.unref(); started = true; } catch {}
  for (let i = 0; i < 12 && !status; i++) { await new Promise(r => setTimeout(r, 400)); status = await get("/status"); }
}
const term = status ? await get("/inbox?peek=1") : null;
const unread = term ? term.count : 0;

out.push("## Clause session state");
out.push(`- server: ${status ? (started ? "started just now" : "already running") + ` on :${PORT}` : "NOT running — run `node scripts/serve.mjs` in the background and tell the user if it fails"}`);
out.push(`- Figma plugin: ${status && status.plugin ? "connected" : "not connected (ask the user to open Clause Assist in Figma: ⌘⌥P; never fall back to an external Figma connector)"}`);
out.push(`- Figma writes: through this plugin (saving screens/*.json queues the build); no external connector, file link or account access is involved`);
out.push(`- design-system catalog (ds/): ${hasDs ? "present" : "not set up (optional, never a blocker)"}`);
out.push(`- unread plugin messages: ${unread}`);
out.push(`- inbox listener: ${status && status.listening ? "armed" : "NOT armed → arm it before anything else"}`);
const tok = existsSync(resolve(root, ".clause/figma-token")), fk = existsSync(resolve(root, ".clause/figma-file"));
out.push(`- Figma comments: ${tok && fk ? "ready (node scripts/comments.mjs)" : "not set up — " + (!tok ? "token missing (.clause/figma-token)" : "file key missing (re-import the plugin manifest or pass --file)") + "; see /onboard step 4b"}`);
try { const a = await (await fetch(`http://localhost:${process.env.PORT || 8787}/ds/active`)).json(); out.push(a.system ? `- active design system: ${a.system.name} (catalog ${a.system.dir}, from ${a.source}; Figma file "${a.file}")` : `- active design system: not set up${a.file ? ` for file "${a.file}"` : " (no plugin file reported yet)"} — general design is fine; use a catalog only when the request needs one`); } catch {}
try { const { execFileSync } = await import("node:child_process"); out.push("- " + execFileSync("node", [resolve(root, "scripts/ctx-budget.mjs")], { encoding: "utf8" }).trim()); } catch {}
try { const { execFileSync: ef } = await import("node:child_process"); const u = JSON.parse(ef("node", [resolve(root, "scripts/update-check.mjs"), "--json"], { encoding: "utf8", timeout: 20000 }));
  if (u.state === "updated") out.push(`- Clause updated itself (${u.behind} change${u.behind === 1 ? "" : "s"}); tell the user to restart the server and reload the plugin (⌘⌥P)`);
  else if (u.state === "behind" || u.state === "diverged") out.push(`- Clause update available: ${u.behind} behind the remote and local changes present — nudge the user once, offer: git stash, node scripts/update-check.mjs --force, git stash pop`); } catch {}
const localRules = resolve(root, ".clause/local-rules.md");
if (existsSync(localRules)) out.push(`- your rules: ${readFileSync(localRules, "utf8").split("\n").filter(l => l.startsWith("- ")).length} recorded — read .clause/local-rules.md before building`);
if (existsSync(resolve(root, ".clause/agent.md"))) out.push("- your instructions: `.clause/agent.md` — read it before replying");
try {
  const { learningStats, recall, loadOverrides } = await import("@clause/workspace");
  const s = learningStats(root);
  if (s.count) {
    out.push(`- learnings: ${s.count}${s.lastAt ? `, last ${s.lastAt.slice(0, 10)}` : ""} — recall with \`npm run learn -- --recall "<topic>"\``);
    for (const item of recall(root, "", { limit: 3 })) out.push(`  · ${item.kind}: ${item.text}`);
  } else out.push("- learnings: none yet — record one whenever the user tells you something durable");
  const o = loadOverrides(root);
  out.push(o.problems.length ? `- overrides: ${o.problems.length} problem(s) — fix .clause/overrides/, nothing is applied until it is readable` : `- overrides: ${o.patches.length} active — re-applied to the product on every build`);
} catch {}
out.push("");
out.push("## Do this now, before replying to the user (every session, no exceptions)");
out.push("1. Arm the inbox listener first: Monitor, command `cd \"" + root + "\" && node scripts/inbox.mjs --watch`, timeout_ms 1800000, description \"Clause Assist inbox\". Re-arm it immediately every time it fires or expires, before reading, building or replying. This applies with or without a catalog.");
if (unread) out.push(`2. ${unread} message(s) are already waiting — run \`npm run inbox\` and handle them with the /fix workflow before anything else.`);
else out.push("2. Nothing waiting. Tell the user in one line that you are listening, then continue with what they asked.");
out.push("A request or annotation from the pane is the go-ahead: build it through the plugin, never ask for a second confirmation, and never send the designer to Claude Code for an answer.");
out.push("Every finished design task ends with the frame chip in the reply. Frames you built since your last reply are attached automatically; add `--pill \"Name=<nodeId>\"` for any other frame. If the user named a frame (the inbox prints `frame: Name (id)`), edit it in place or put `\"at\": \"<id>\"` in the screen JSON so the build lands beside it — never in the default far-right spot.");
if (!hasDs) out.push("3. No design-system catalog yet. That is normal. Help with the request using general design judgement; run /onboard only when the user asks for setup or wants to build from their design system. Never suggest extraction, and never block general design work on it.");
out.push("Session rules: see CLAUDE.md → Session protocol.");
console.log(out.join("\n"));
