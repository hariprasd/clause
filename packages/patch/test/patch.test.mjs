// The engine is small enough that the tests can read like the two real jobs: port a vendor file,
// and stop before writing when an anchor has moved.

import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatches, countOccurrences, unapplyPatches, validatePatches } from "../src/index.mjs";

const record = [
  { id: "a", why: "the first edit, with enough words to explain itself", find: "one", replace: "ONE" },
  { id: "b", why: "the second edit, also with enough words to explain", find: "two", replace: "TWO" },
];

test("apply then unapply returns the original bytes", () => {
  const shipped = applyPatches("one and two", record).text;
  assert.equal(shipped, "ONE and TWO");
  assert.equal(unapplyPatches(shipped, record).text, "one and two");
});

test("a missing anchor is reported with the reason it existed", () => {
  const result = applyPatches("one and THREE", record);
  assert.equal(result.text, "ONE and THREE", "the readable half still applies");
  assert.equal(result.applied.length, 1);
  assert.deepEqual(
    result.missed.map((m) => m.id),
    ["b"],
  );
  assert.match(result.missed[0].why, /second edit/);
  assert.equal(result.missed[0].found, 0);
});

test("a duplicated anchor is not applied, because guessing which one is wrong", () => {
  const result = applyPatches("one and one", record);
  assert.deepEqual(result.applied, []);
  assert.equal(result.missed[0].found, 2);
  assert.equal(result.text, "one and one");
});

test("countOccurrences counts overlapping positions the way indexOf walks them", () => {
  assert.equal(countOccurrences("aaaa", "aa"), 2, "non-overlapping, like String.replace would");
  assert.equal(countOccurrences("abc", ""), 0);
});

test("validatePatches names every incomplete record", () => {
  const problems = validatePatches([
    { id: "x", why: "short", find: "a", replace: "a" },
    { id: "x", why: "duplicate id, long enough to pass", find: "", replace: "b" },
  ]);
  assert.ok(problems.some((p) => p.includes('"x" is used twice')));
  assert.ok(problems.some((p) => p.includes("does not say why")));
  assert.ok(problems.some((p) => p.includes("changes nothing")));
  assert.ok(problems.some((p) => p.includes("has no anchor")));
});
