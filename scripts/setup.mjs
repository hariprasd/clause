#!/usr/bin/env node
// setup.mjs — one command to make a fresh clone work on any machine (macOS / Windows / Linux). Zero npm dependencies.
//   node scripts/setup.mjs [--port 8787]     (alias: npm run setup)
// Checks the machine, generates everything that is machine-local (tokens.css, figma-plugin/), and prints the only manual steps left.
import { existsSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), PORT = Number(args.includes("--port") ? args[args.indexOf("--port") + 1] : process.env.PORT || 8787);
const ok = [], bad = [], note = [];
const check = (label, pass, fix) => (pass ? ok : bad).push(pass ? label : `${label} — ${fix}`);
const run = (f, ...a) => execFileSync(process.execPath, [resolve(root, "scripts", f), ...a], { stdio: "pipe", env: { ...process.env, PORT: String(PORT) } });

check(`node ${process.version}`, Number(process.versions.node.split(".")[0]) >= 18, "install Node 18+ (https://nodejs.org)");
for (const f of ["scripts/serve.mjs", "scripts/runtime.js", "scripts/compile-core.mjs"]) check(f, existsSync(resolve(root, f)), "missing — re-clone the repo");
const hasDs = ["ds/components.json", "ds/variable-keys.json", "ds/tokens/variables.json", "ds/tokens/text-styles.json"].every(f => existsSync(resolve(root, f)));
if (hasDs) ok.push("ds/ catalog present"); else note.push("No design-system catalog yet → after step 4 run the plugin menu “Extract components & tokens” once (writes ds/ from the open Figma file + its libraries). Claude audits it automatically if the listener is on.");
mkdirSync(resolve(root, "screens"), { recursive: true }); mkdirSync(resolve(root, "exports"), { recursive: true });
if (hasDs) { try { run("tokens-css.mjs"); ok.push("ds/tokens.css generated"); } catch (e) { bad.push("tokens-css failed: " + String(e.stderr || e.message).split("\n")[0]); } }
try { run("build-plugin.mjs"); ok.push(`figma-plugin/ generated (talks to http://localhost:${PORT})`); } catch (e) { bad.push("build-plugin failed: " + String(e.stderr || e.message).split("\n")[0]); }
const lint = readdirSync(resolve(root, "screens")).filter(f => f.endsWith(".json"));
let lintBad = 0; for (const f of lint) { try { run("lint.mjs", f.replace(/\.json$/, "")); } catch { lintBad++; } }
check(`${lint.length} screen(s) lint clean`, lintBad === 0, `${lintBad} failing — run: node scripts/lint.mjs <name>`);
const free = await new Promise(r => { const s = createServer(); s.once("error", () => r(false)); s.once("listening", () => s.close(() => r(true))); s.listen(PORT, "127.0.0.1"); });
check(`port ${PORT} free`, free, `something is on ${PORT} (is Clause already running? otherwise use --port)`);
const cfg = existsSync(resolve(root, "ds/config.md")) ? readFileSync(resolve(root, "ds/config.md"), "utf8") : ""; const key = (cfg.match(/File key: `(\w+)`/) || [])[1];
let claude = false; try { execFileSync(process.platform === "win32" ? "where" : "which", ["claude"], { stdio: "pipe" }); claude = true; } catch {}
note.push(existsSync(resolve(root, ".clause/figma-token")) ? "Figma token present (comments readable: node scripts/comments.mjs)." : "No Figma token yet (.clause/figma-token) — needed to read Figma comments.");
note.push(claude ? "Claude Code found." : "Claude Code CLI not found — install it, then open this folder (the terminal pane is just an inbox; Claude reads it from your session).");

console.log("\nClause setup\n");
for (const l of ok) console.log("  ✓ " + l); for (const l of bad) console.log("  ✗ " + l);
console.log(`
Manual steps (once per machine):
  1. Figma desktop → open your design-system file${key ? " (key " + key + ")" : ""} with your own account; enable its team libraries.
  2. Figma → Plugins → Development → Import plugin from manifest… → ${resolve(root, "figma-plugin", "manifest.json")}
  3. Start Clause:   npm run live      (or: node scripts/serve.mjs --open)
  4. Figma → Plugins → Development → Clause Assist → "Start (silent)"   (shortcut: ⌘⌥P / Ctrl+Alt+P re-runs it)
  5. Figma comments (optional but recommended): Figma → Settings → Security → Personal access tokens → generate one with comments + file read; save it as the only line of .clause/figma-token (never paste it in chat). The file key arrives from the plugin by itself.
  6. Open this folder in Claude Code and say what screen you want.
Per-machine data lives only in .clause/ (message history). \`npm run clean\` removes it and every generated file.
${note.map(n => "  · " + n).join("\n")}
`);
process.exit(bad.length ? 1 : 0);
