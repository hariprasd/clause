#!/usr/bin/env node
// update-check.mjs — is this checkout behind its remote? Fast-forwards automatically when that is safe.
//   node scripts/update-check.mjs [--force] [--json]
// Writes .clause/update.json {checkedAt, state: current|updated|behind|diverged|offline|no-remote, behind, ahead, from, to}.
// Auto-update (git merge --ff-only) happens when there are no local commits and none of the files the update changes
// were edited on this machine (other local changes are fine). Otherwise it reports "behind" + the blocking files. Throttled to once an hour unless --force.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, ".clause/update.json");
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }).trim();
const save = o => { mkdirSync(dirname(file), { recursive: true }); const r = { checkedAt: Date.now(), ...o }; writeFileSync(file, JSON.stringify(r, null, 1)); return r; };
const done = r => { if (process.argv.includes("--json")) console.log(JSON.stringify(r)); else console.log(r.state === "current" ? "Clause is up to date." : r.state === "updated" ? `Clause updated (${r.behind} change${r.behind === 1 ? "" : "s"} pulled). Restart the server and re-run the plugin.` : r.state === "behind" ? `Clause is ${r.behind} update${r.behind === 1 ? "" : "s"} behind; local changes present, so I left it alone.` : `Update check: ${r.state}`); process.exit(0); };
try {
  if (!process.argv.includes("--force") && existsSync(file)) { const prev = JSON.parse(readFileSync(file, "utf8")); if (Date.now() - prev.checkedAt < 3600e3) done(prev); }
  let up; try { up = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"); } catch { done(save({ state: "no-remote" })); }
  const [remote, ...br] = up.split("/");
  try { git("fetch", "--quiet", remote, br.join("/")); } catch { done(save({ state: "offline" })); }
  const [ahead, behind] = git("rev-list", "--left-right", "--count", "HEAD...@{u}").split(/\s+/).map(Number);
  if (!behind) done(save({ state: "current", behind: 0, ahead }));
  // incoming files vs files edited on this machine: only an overlap blocks the fast-forward
  const incoming = git("diff", "--name-only", "HEAD", "@{u}").split("\n").filter(Boolean);
  const mine = new Set(git("status", "--porcelain", "-uall").split("\n").filter(Boolean).map(l => l.slice(3).replace(/^"|"$/g, "").split(" -> ").pop()));
  let blockers = incoming.filter(f => mine.has(f));
  // figma-plugin/ is generated per machine (build-plugin.mjs): local rebuilds are not "edits"; restore them and rebuild after the merge
  const genOnly = blockers.length && blockers.every(f => f.startsWith("figma-plugin/"));
  if (genOnly && !ahead) { try { git("checkout", "--", "figma-plugin"); blockers = []; } catch {} }
  if (!ahead && !blockers.length) {
    const from = git("rev-parse", "--short", "HEAD"); git("merge", "--ff-only", "@{u}"); const to = git("rev-parse", "--short", "HEAD");
    try { execFileSync(process.execPath, [resolve(root, "scripts/build-plugin.mjs")], { cwd: root, stdio: "ignore", timeout: 20000 }); } catch {}
    done(save({ state: "updated", behind, ahead: 0, from, to, incoming: incoming.length }));
  }
  done(save({ state: ahead ? "diverged" : "behind", behind, ahead, blockers: blockers.slice(0, 8) }));
} catch (e) { done(save({ state: "offline", error: String(e.message || e).split("\n")[0].slice(0, 120) })); }
