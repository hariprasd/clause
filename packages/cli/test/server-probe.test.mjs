// The probe has one job that matters: tell "nothing is there" apart from "something is there and it
// is not Clause". Those two states have different fixes, so they must not collapse into one error.

import assert from "node:assert/strict";
import { test } from "node:test";
import { describeProbe, isPortOpen, probeServer, waitForClause } from "../src/server-probe.mjs";

test("a closed port is down, and no request is made", async () => {
  let fetched = false;
  const result = await probeServer({
    port: 8787,
    portOpen: async () => false,
    fetch: async () => {
      fetched = true;
      throw new Error("should not be called");
    },
  });
  assert.deepEqual(result, { state: "down", port: 8787 });
  assert.equal(fetched, false);
});

test("a healthy Clause answers /health and reports what it has", async () => {
  const result = await probeServer({
    port: 8787,
    portOpen: async () => true,
    fetch: async (url) => {
      assert.match(String(url), /\/health$/);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, screens: ["a", "b", "c"], version: "0.1.0", protocol: 1 }),
      };
    },
  });
  assert.deepEqual(result, { state: "clause", port: 8787, screens: 3, version: "0.1.0", protocol: 1 });
});

test("another program on the port is occupied, not down", async () => {
  const result = await probeServer({
    port: 8787,
    portOpen: async () => true,
    fetch: async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    }),
  });
  assert.equal(result.state, "occupied");
  assert.match(result.detail, /HTTP 404/);
});

test("a server that accepts but never answers is a timeout", async () => {
  const result = await probeServer({
    port: 8787,
    portOpen: async () => true,
    fetch: async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    },
  });
  assert.deepEqual(result, { state: "timeout", port: 8787 });
});

test("every probe result turns into something a designer can act on", () => {
  const busy = describeProbe({ state: "occupied", port: 8787, status: 200, detail: "not Clause" });
  assert.equal(busy.code, "PORT_BUSY");
  assert.match(busy.hint, /--port 8788/);

  const down = describeProbe({ state: "down", port: 8787 });
  assert.equal(down.code, "SERVER_DOWN");
  assert.equal(down.status, "warn");

  const healthy = describeProbe({ state: "clause", port: 8787, screens: 1, version: "0.1.0" });
  assert.equal(healthy.status, "ok");
  assert.match(healthy.detail, /1 screen/);
});

test("waiting for a fresh service reports what actually happened", async () => {
  const answers = [
    { state: "down", port: 8788 },
    { state: "occupied", port: 8788, status: 200, detail: "still waking" },
    { state: "clause", port: 8788, screens: 0, version: "0.1.0", protocol: 1 },
  ];
  const seen = [];
  const result = await waitForClause(8788, {
    delay: 0,
    probe: async ({ port }) => {
      const answer = answers[Math.min(seen.length, answers.length - 1)];
      seen.push(port);
      return answer;
    },
  });

  assert.equal(result.state, "clause");
  assert.equal(seen.length, 3);

  const never = await waitForClause(8788, {
    attempts: 3,
    delay: 0,
    probe: async () => ({ state: "down", port: 8788 }),
  });
  assert.equal(never.state, "down");
});

test("isPortOpen resolves false for a port nobody is on", async () => {
  // Port 1 is never a Clause server, and connecting to it fails fast.
  assert.equal(await isPortOpen(1), false);
});
