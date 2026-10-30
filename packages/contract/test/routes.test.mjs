import assert from "node:assert/strict";
import { test } from "node:test";
import { path, ROUTES, route } from "../src/routes.mjs";

const KNOWN_CALLERS = new Set(["browser", "plugin", "extension", "agent", "cli"]);

test("route names are unique", () => {
  const names = ROUTES.map((r) => r.name);
  assert.equal(new Set(names).size, names.length, `duplicate route name: ${names.join(", ")}`);
});

test("no two routes share a method and a path", () => {
  const seen = new Map();
  for (const r of ROUTES) {
    for (const method of r.methods) {
      const key = `${method} ${r.path}`;
      assert.equal(seen.get(key), undefined, `${key} claimed by "${seen.get(key)}" and "${r.name}"`);
      seen.set(key, r.name);
    }
  }
});

test("paths are absolute, lower case, and declare each parameter once", () => {
  for (const r of ROUTES) {
    assert.match(r.path, /^\//, `${r.name} must start with /`);
    assert.equal(r.path, r.path.toLowerCase(), `${r.name} must be lower case`);
    assert.ok(r.path === "/" || !r.path.endsWith("/"), `${r.name} must not end with /`);
    const params = [...r.path.matchAll(/:([a-z]+)/g)].map((m) => m[1]);
    assert.equal(new Set(params).size, params.length, `${r.name} repeats a parameter`);
    for (const p of params) {
      assert.match(p, /^[a-z][a-zA-Z]*$/, `${r.name} has an odd parameter name "${p}"`);
    }
  }
});

test("every route says who calls it", () => {
  for (const r of ROUTES) {
    assert.ok(r.callers.length > 0, `${r.name} has no callers`);
    for (const c of r.callers) assert.ok(KNOWN_CALLERS.has(c), `${r.name} has unknown caller "${c}"`);
  }
});

test("routes that change the machine are POST and are not reachable from a web page", () => {
  for (const r of ROUTES.filter((x) => x.command)) {
    assert.ok(r.methods.includes("POST"), `${r.name} changes something but has no POST`);
    assert.ok(
      !r.methods.includes("GET") || r.name === "captureSettings",
      `${r.name} is a command and GET-able`,
    );
  }
});

test("path() fills parameters, encodes them, and refuses to guess", () => {
  assert.equal(path("result"), "/result");
  assert.equal(path("push", { name: "meetings page" }), "/push/meetings%20page");
  assert.equal(path("inspect", { id: "1:2" }), "/inspect/1%3A2");
  assert.throws(() => path("push"), /needs :name/);
  assert.throws(() => route("nope"), /unknown route/);
});

test("route() returns the declared record", () => {
  const r = route("events");
  assert.deepEqual(r.methods, ["GET"]);
  assert.equal(r.path, "/events");
});
