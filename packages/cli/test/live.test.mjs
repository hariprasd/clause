// The port decides three different lives for `clause live`, and getting them confused is how a
// working server gets killed or a start looks broken. These tests pin the three.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePort, planLive, resolveServer, resolveSetup } from "../src/live.mjs";

const exists = () => true;

test("a port is a number or it is a refusal", () => {
  assert.equal(parsePort(undefined), 8787);
  assert.equal(parsePort("8788"), 8788);
  assert.equal(parsePort("nope"), null);
  assert.equal(parsePort(0), null);
  assert.equal(parsePort(70000), null);
});

test("live needs the server script where it is told to look", () => {
  assert.equal(resolveServer({ cwd: "/nowhere", exists: () => false }).ok, false);
  const found = resolveServer({ cwd: "/clause", exists, port: "8788", open: true });
  assert.equal(found.ok, true);
  assert.equal(found.port, 8788);
  assert.deepEqual(found.args, ["--open"]);
  assert.equal(found.env.PORT, "8788");
});

test("setup uses the same port and refuses a folder without the script", () => {
  const plan = resolveSetup({ cwd: "/clause", exists, port: "8788" });
  assert.equal(plan.ok, true);
  assert.equal(plan.port, 8788);
  assert.deepEqual(plan.args, ["--port", "8788"]);
  assert.equal(resolveSetup({ cwd: "/nowhere", exists: () => false }).ok, false);
});

test("a healthy Clause on the port is not started twice", async () => {
  const plan = await planLive({
    port: 8787,
    exists,
    probe: async () => ({ state: "clause", port: 8787, screens: 3, version: "0.1.0" }),
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.already, true);
  assert.match(plan.reason, /already running/);
});

test("another program on the port is named, with the next port", async () => {
  const plan = await planLive({
    port: 8787,
    exists,
    probe: async () => ({ state: "occupied", port: 8787, status: 200, detail: "not Clause" }),
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.code, "PORT_BUSY");
  assert.match(plan.hint, /8788/);
});

test("nothing listening means start the server", async () => {
  const plan = await planLive({
    port: 8787,
    exists,
    probe: async () => ({ state: "down", port: 8787 }),
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.port, 8787);
});
