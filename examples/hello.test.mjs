// The example is a fixture: it proves the compile path on a fresh clone, before the user has a
// catalog. If this test fails, a new user's first screen would fail too.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "../scripts/compile.mjs";

test("the example screen compiles against the fixture catalog", () => {
  const screen = compile("examples/hello.json");

  assert.equal(screen.TITLE, "Hello Clause");
  assert.equal(screen.WIDTH, 1440);
  assert.equal(screen.SCREENS.length, 1);
  assert.ok(screen.COMPS.card, "the card component is resolved");
  assert.ok(screen.COMPS.button, "the button component is resolved");
  assert.ok(screen.VARS["bg-primary"], "a token resolves to a Figma key");
  assert.ok(screen.STYLES["Display md/Semibold"], "a text style resolves to a Figma key");
});

test("the example would fail loudly if it drifted from the fixture", () => {
  assert.throws(() => compile("examples/missing.json"), /ENOENT/);
});
