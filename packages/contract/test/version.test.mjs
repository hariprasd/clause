import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MIN_PROTOCOL_VERSION, negotiate, PARTS, PROTOCOL_VERSION } from "../src/version.mjs";

test("a matching version is accepted", () => {
  const r = negotiate(PROTOCOL_VERSION, { part: PARTS.figma });
  assert.equal(r.ok, true);
  assert.equal(r.remote, PROTOCOL_VERSION);
});

test("a version inside the supported range is accepted", () => {
  const r = negotiate(MIN_PROTOCOL_VERSION);
  assert.equal(r.ok, true);
});

test("an older part is told to update, and says which part", () => {
  const r = negotiate(MIN_PROTOCOL_VERSION - 1, { part: PARTS.extension, version: "0.0.9" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "PROTOCOL_OLD");
  assert.match(r.hint, /extension/);
  assert.match(r.hint, /0\.0\.9/);
});

test("a newer part is told the others need updating, not that it is wrong", () => {
  const r = negotiate(PROTOCOL_VERSION + 1, { part: PARTS.server });
  assert.equal(r.ok, false);
  assert.equal(r.code, "PROTOCOL_NEW");
  assert.match(r.hint, /newer/);
});

test("the capture extension ships the protocol the contract names", () => {
  // The extension is installed by hand, so nothing can rewrite it at build time. This test is the
  // ratchet: change the protocol and the extension manifest must change in the same commit.
  const manifest = JSON.parse(readFileSync(new URL("../../capture/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.clause_protocol, PROTOCOL_VERSION);
});

test("a part that says nothing usable is not silently trusted", () => {
  for (const bad of [undefined, null, "1", 1.5, -1, Number.NaN]) {
    const r = negotiate(/** @type {number} */ (bad));
    assert.equal(r.ok, false, `accepted ${String(bad)}`);
    assert.equal(r.code, "PROTOCOL_INVALID");
  }
});
