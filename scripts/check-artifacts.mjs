#!/usr/bin/env node
// check-artifacts.mjs — the committed Figma plugin must match its sources.
//
// figma-plugin/ is tracked so that a clone can be imported into Figma with no build step. That is
// only safe if the tracked files cannot drift from scripts/plugin/. This builds into a scratch
// directory and compares, without touching the working tree.
//
// Run in CI and before a release. `npm run plugin` is the fix when it fails.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = resolve(root, ".clause/artifacts-check");
const committed = resolve(root, "figma-plugin");

rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });

try {
  execFileSync(process.execPath, [resolve(root, "scripts/build-plugin.mjs"), "--out", scratch], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
} catch (e) {
  console.error("✗ the plugin does not build: " + String(e.stderr || e.message).trim());
  process.exit(1);
}

const files = ["manifest.json", "code.js", "ui.html"];
const drift = [];
for (const f of files) {
  const a = resolve(committed, f);
  const b = resolve(scratch, f);
  if (!existsSync(a)) { drift.push(`${f}: missing from figma-plugin/`); continue; }
  if (!existsSync(b)) { drift.push(`${f}: the build did not produce it`); continue; }
  if (readFileSync(a, "utf8") !== readFileSync(b, "utf8")) drift.push(`${f}: differs from source`);
}

rmSync(scratch, { recursive: true, force: true });

if (drift.length) {
  console.error("✗ figma-plugin/ is out of sync with its sources:");
  for (const d of drift) console.error("   " + d);
  console.error("\nFix: npm run plugin, then commit figma-plugin/.");
  process.exit(1);
}

console.log("✓ figma-plugin/ matches its sources");
