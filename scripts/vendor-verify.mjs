#!/usr/bin/env node
// vendor-verify.mjs: prove packages/capture/capture.js matches its patch record.
//
// capture.js is a minified copy of Figma's capture script with Clause's edits on top. It is not
// built, so it cannot be checked by rebuilding. Instead packages/capture/vendor/patches.mjs
// records every edit as exact find/replace text, and this proves the record still describes the
// file: same bytes, every hook present exactly once, every hook reversible, and reversing then
// re-applying returns the shipped bytes.
//
// Run in CI and before a release. Fixes are in packages/capture/vendor/README.md.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SHIPPED } from "../packages/capture/vendor/patches.mjs";
import { verify } from "../packages/capture/vendor/verify.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, "packages/capture", SHIPPED.file);

let text;
try {
  text = readFileSync(target, "utf8");
} catch {
  console.error(`✗ cannot read ${target}`);
  process.exit(1);
}

const report = verify(text);
const where = target.replace(root + "/", "");

if (report.ok) {
  console.log(
    `✓ ${where} matches its record: ${report.patches} patches, ${report.baseBytes} bytes of base`,
  );
  for (const note of report.notes) console.log(`  note: ${note}`);
  process.exit(0);
}

console.error(`✗ ${where} does not match its patch record:`);
for (const problem of report.problems) console.error(`   · ${problem}`);
if (report.notes.length) {
  console.error("");
  for (const note of report.notes) console.error(`  note: ${note}`);
}
if (report.hint) console.error(`\n${report.hint}`);
process.exit(1);
