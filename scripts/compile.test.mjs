// compile.test.mjs — general design must compile with no catalog at all: primitives and raw values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { esCompile } from "./compile-core.mjs";
import { loadCatalog } from "./compile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const general = () => loadCatalog("examples/no-catalog-here");
const example = () => JSON.parse(readFileSync(resolve(root, "examples/general.json"), "utf8"));

test("a missing catalog is general mode, not an error", () => {
  const cat = general();
  assert.equal(cat.general, true);
  assert.deepEqual(cat.comps, {});
  assert.deepEqual(cat.styles, {});
});

test("general mode compiles primitives with raw values", () => {
  const s = esCompile(general(), example(), "general");
  assert.equal(s.PAGE_ID, null);
  assert.deepEqual(s.VARS, {});
  assert.deepEqual(s.STYLES, {});
  assert.equal(s.SCREENS.length, 1);
  assert.equal(s.TITLE, "General design");
});

test("general mode still refuses token names and components", () => {
  const cat = general();
  assert.throws(() => esCompile(cat, { tree: { t: "stack", i: "r", bg: "bg-primary" } }, "x"), /no design system/);
  assert.throws(() => esCompile(cat, { tree: { t: "stack", i: "r", children: [{ c: "button", i: "b" }] } }, "x"), /no catalog/);
});

test("at places the build beside the frame the user named", () => {
  const s = esCompile(general(), { ...example(), at: "564:689" }, "general");
  assert.equal(s.AT, "564:689");
  assert.equal(esCompile(general(), example(), "general").AT, null);
});
