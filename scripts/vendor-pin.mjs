#!/usr/bin/env node
// vendor-pin.mjs: record the current capture.js in packages/capture/vendor/patches.mjs.
//
// Run this only after `npm run vendor:adopt -- <file> --write` has put a new version in place and
// every anchor lands. It recomputes SHIPPED.bytes / sha256 / baseSha256, so the record's "what
// ships" and "what it was derived from" describe the file that is actually committed.
//
// It refuses to pin a file the record does not fully describe, because a pin over a half-matched
// file would make vendor:verify pass on a lie.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUSE_ONLY, PATCHES, SHIPPED } from "../packages/capture/vendor/patches.mjs";
import { occurrences, sha256, unapply } from "../packages/capture/vendor/verify.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, "packages/capture", SHIPPED.file);
const record = resolve(root, "packages/capture/vendor/patches.mjs");

const shipped = readFileSync(file, "utf8");

const missing = PATCHES.filter((p) => occurrences(shipped, p.replace) !== 1);
if (missing.length) {
  console.error(`✗ ${SHIPPED.file} is not fully patched, so it cannot be pinned:\n`);
  for (const p of missing) {
    const n = occurrences(shipped, p.replace);
    console.error(`   ${p.id}: ${n === 0 ? "missing" : `appears ${n} times`}`);
    console.error(`     why: ${p.why}`);
  }
  console.error("\nRun `npm run vendor:adopt -- <upstream file> --write` first.");
  process.exit(1);
}

const base = unapply(shipped);
if (base.removed.length !== PATCHES.length) {
  console.error("✗ could not reverse every patch, so there is no base to record. Nothing written.");
  process.exit(1);
}

const smuggled = CLAUSE_ONLY.filter((token) => base.text.includes(token));
if (smuggled.length) {
  console.error(
    `✗ ${smuggled.join(", ")} survives un-patching, so an edit is not recorded in patches.mjs. ` +
      "Nothing written.",
  );
  process.exit(1);
}

const next = {
  bytes: shipped.length,
  sha256: sha256(shipped),
  baseSha256: sha256(base.text),
};

const changed =
  next.bytes !== SHIPPED.bytes ||
  next.sha256 !== SHIPPED.sha256 ||
  next.baseSha256 !== SHIPPED.baseSha256;

if (!changed) {
  console.log(`✓ already pinned: ${next.bytes} bytes, sha ${next.sha256.slice(0, 12)}`);
  process.exit(0);
}

let text = readFileSync(record, "utf8");
for (const [field, value] of [
  ["bytes", String(next.bytes)],
  ["sha256", JSON.stringify(next.sha256)],
  ["baseSha256", JSON.stringify(next.baseSha256)],
]) {
  const pattern = new RegExp(`(\\n  ${field}: )(?:\\d+|"[0-9a-f]+")`);
  if (!pattern.test(text)) {
    console.error(`✗ could not find the "${field}" field in packages/capture/vendor/patches.mjs`);
    process.exit(1);
  }
  text = text.replace(pattern, `$1${value}`);
}
writeFileSync(record, text);

console.log(
  `✓ pinned ${next.bytes} bytes, sha ${next.sha256.slice(0, 12)} ` +
    `(base ${base.text.length} bytes, sha ${next.baseSha256.slice(0, 12)})`,
);
console.log("  Now run `npm run vendor:verify` and commit both files.");
