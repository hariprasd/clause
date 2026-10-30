#!/usr/bin/env node
// vendor-adopt.mjs: put a new copy of Figma's capture script through the patch record.
//
//   npm run vendor:adopt -- <file>          check only, write nothing
//   npm run vendor:adopt -- <file> --write  check, then replace packages/capture/capture.js
//
// Figma ships the capture script unpatched. The record in packages/capture/vendor/patches.mjs
// holds the exact text each edit attaches to, so "port to a new version" is: run this, and work
// through whatever anchors it says have moved. It never half-writes a file: if one anchor is
// missing, nothing changes.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUSE_ONLY, PATCHES, SHIPPED } from "../packages/capture/vendor/patches.mjs";
import { apply, occurrences } from "../packages/capture/vendor/verify.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const input = args.find((a) => !a.startsWith("--"));

if (!input) {
  console.error("usage: npm run vendor:adopt -- <upstream capture.js> [--write]");
  process.exit(1);
}

const source = resolve(input);
const target = resolve(root, "packages/capture", SHIPPED.file);

let upstream;
try {
  upstream = readFileSync(source, "utf8");
} catch {
  console.error(`✗ cannot read ${source}`);
  process.exit(1);
}

// A file that already carries Clause's hooks is not upstream. Adopting it would either double the
// hooks or report every anchor as missing; both waste the reader's time.
const already = CLAUSE_ONLY.filter((token) => upstream.includes(token));
if (already.length) {
  console.error(
    `✗ ${input} is already patched (found ${already.join(", ")}).\n` +
      "  Adopt the unpatched file Figma serves. To re-check the shipped file, run `npm run vendor:verify`.",
  );
  process.exit(1);
}

const result = apply(upstream);

if (result.missed.length) {
  console.error(`✗ ${result.missed.length} of ${PATCHES.length} anchors are not in ${input}:\n`);
  for (const miss of result.missed) {
    const count = miss.found === 0 ? "not found" : `found ${miss.found} times, need exactly 1`;
    console.error(`   ${miss.id} (${count})`);
    console.error(`     why: ${miss.why}`);
  }
  console.error(
    "\nNothing was written. For each anchor above, find the equivalent code in the new file, update " +
      "its `find` in packages/capture/vendor/patches.mjs, and run this again.",
  );
  process.exit(1);
}

// Anchors can land on a file and still produce something wrong if two edits overlap.
for (const patch of PATCHES) {
  const n = occurrences(result.text, patch.replace);
  if (n !== 1) {
    console.error(`✗ after applying, ${patch.id} appears ${n} times instead of once`);
    console.error("  Two patches are probably editing overlapping text. Nothing was written.");
    process.exit(1);
  }
}

if (!write) {
  console.log(
    `✓ all ${PATCHES.length} anchors land on ${input} (${result.text.length} bytes).\n` +
      "  Dry run: nothing written. Re-run with --write to make it the shipped file, then run " +
      "`npm run vendor:pin`.",
  );
  process.exit(0);
}

writeFileSync(target, result.text);
console.log(
  `✓ wrote packages/capture/${SHIPPED.file}: all ${PATCHES.length} patches applied ` +
    `(${result.text.length} bytes).\n` +
    "  Next: `npm run vendor:pin` to record the new bytes, then check the anchors in " +
    "packages/capture/vendor/README.md against the new version.",
);
