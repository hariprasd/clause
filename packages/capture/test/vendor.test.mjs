// The pinned capture script is 127KB of minified vendor code with Clause's edits on top, and it is
// not built from source. These tests are the only thing standing between a hand edit and a
// silently broken capture, so they check the record from both directions: the record describes the
// file, and the file can be reconstructed from the record.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CLAUSE_ONLY, PATCHES, SHIPPED } from "../vendor/patches.mjs";
import { apply, occurrences, sha256, unapply, verify } from "../vendor/verify.mjs";

const shipped = readFileSync(new URL(`../${SHIPPED.file}`, import.meta.url), "utf8");

test("the shipped file matches its record", () => {
  const report = verify(shipped);
  assert.deepEqual(report.problems, [], `vendor:verify would fail:\n${report.problems.join("\n")}`);
  assert.equal(report.ok, true);
  assert.equal(report.patches, PATCHES.length);
  assert.equal(report.bytes, SHIPPED.bytes);
});

test("the record reverses to the base it was built against", () => {
  const base = unapply(shipped);
  assert.deepEqual(
    PATCHES.map((p) => p.id).filter((id) => !base.removed.includes(id)),
    [],
    "some patches cannot be reversed, so the base is incomplete",
  );
  assert.ok(base.text.length > 0 && base.text.length < SHIPPED.bytes, "no base to compare");
  assert.equal(sha256(base.text), SHIPPED.baseSha256, "reversed base is not the recorded base");
});

test("re-applying the record to its base returns the shipped bytes", () => {
  const base = unapply(shipped).text;
  const result = apply(base);
  assert.deepEqual(result.missed, [], "some anchors do not land on the base");
  assert.equal(result.text, shipped, "round trip changed the file");
});

test("the base carries nothing that can only have come from Clause", () => {
  const base = unapply(shipped).text;
  for (const token of CLAUSE_ONLY) {
    assert.equal(base.includes(token), false, `"${token}" survives un-patching: an edit is unrecorded`);
  }
});

test("every patch is identifiable, explains itself, and changes something", () => {
  const ids = PATCHES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "two patches share an id");

  for (const patch of PATCHES) {
    assert.ok(patch.find.length > 0, `${patch.id}: no upstream anchor`);
    assert.notEqual(patch.find, patch.replace, `${patch.id}: does nothing`);
    assert.equal(occurrences(shipped, patch.replace), 1, `${patch.id}: not in the shipped file exactly once`);
    assert.ok(
      patch.why.trim().length >= 40,
      `${patch.id}: "why" is too short to help whoever ports the next version`,
    );
  }
});

test("one changed byte is reported, not thrown", () => {
  let report;
  assert.doesNotThrow(() => {
    report = verify(`${shipped} `);
  });
  assert.equal(report.ok, false);
  assert.match(report.problems[0], /is not the file this record describes/);
  assert.match(report.hint, /vendor:adopt/);
});

test("a missing hook is reported against the patch that owns it", () => {
  const patch = PATCHES.find((p) => p.id === "prepare-before-serialize");
  assert.ok(patch, "the prepare hook should still be part of the record");

  const broken = shipped.replace(patch.replace, "");
  const report = verify(broken);
  assert.equal(report.ok, false);
  assert.ok(
    report.problems.some((p) => p.includes(patch.id) && p.includes("missing")),
    `expected a problem naming "${patch.id}", got:\n${report.problems.join("\n")}`,
  );
});
