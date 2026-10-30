// Doctor is only useful if it is right about the machine. These tests describe machines: one that
// is ready, one with nothing listening, one where another program holds the port, and one running an
// old Node. They also prove the two promises: a healthy Clause is not an error, and a busy port is
// reported as PORT_BUSY instead of escaping as a stack trace.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PROTOCOL_VERSION } from "@clause/contract/version";
import { initWorkspace } from "@clause/workspace";
import { runDoctor } from "../src/doctor.mjs";
import { renderDoctor } from "../src/render.mjs";

const manual = { name: "manual", available: async () => ({ ok: true, reason: "you press the key" }) };
const goodVendor = () => ({ ok: true, patches: 16, bytes: 127367, baseBytes: 125241 });

function setup() {
  const root = mkdtempSync(join(tmpdir(), "clause-doctor-"));
  initWorkspace(root);
  mkdirSync(join(root, "ds"), { recursive: true });
  writeFileSync(join(root, "ds", "components.json"), "{}");
  return {
    root,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

const probe = (result) => async () => result;

test("a ready machine has no errors", async () => {
  const { root, clean } = setup();
  try {
    const report = await runDoctor({
      root,
      nodeVersion: "v24.4.1",
      probe: probe({ state: "clause", port: 8787, screens: 2, version: "0.1.0", protocol: PROTOCOL_VERSION }),
      driver: manual,
      verifyFile: goodVendor,
    });

    assert.equal(report.ok, true);
    assert.equal(report.errors, 0);
    const server = report.checks.find((c) => c.id === "server");
    assert.equal(server.status, "ok");
    assert.match(server.detail, /already running/);
    assert.equal(report.checks.find((c) => c.id === "paste").status, "info");
    assert.match(renderDoctor(report), /Everything Clause needs/);
  } finally {
    clean();
  }
});

test("a healthy Clause on the port is good news, not PORT_BUSY", async () => {
  const { root, clean } = setup();
  try {
    const report = await runDoctor({
      root,
      probe: probe({ state: "clause", port: 8787, screens: 0, version: "0.1.0", protocol: PROTOCOL_VERSION }),
      driver: manual,
      verifyFile: goodVendor,
    });
    assert.equal(report.checks.find((c) => c.id === "server").code, undefined);
    assert.equal(report.ok, true);
  } finally {
    clean();
  }
});

test("a server that speaks an older protocol is an error that names the server", async () => {
  const { root, clean } = setup();
  try {
    const report = await runDoctor({
      root,
      probe: probe({
        state: "clause",
        port: 8787,
        screens: 0,
        version: "0.0.9",
        protocol: PROTOCOL_VERSION - 1,
      }),
      driver: manual,
      verifyFile: goodVendor,
    });

    assert.equal(report.ok, false);
    const protocol = report.checks.find((c) => c.id === "protocol");
    assert.equal(protocol.status, "error");
    assert.equal(protocol.code, "PROTOCOL_OLD");
    assert.match(protocol.hint, /server/);
    assert.match(protocol.hint, /0\.0\.9/);
  } finally {
    clean();
  }
});

test("a port held by another program is a PORT_BUSY error with a fix", async () => {
  const { root, clean } = setup();
  try {
    const report = await runDoctor({
      root,
      probe: probe({ state: "occupied", port: 8787, status: 200, detail: "the answer was not Clause's" }),
      driver: manual,
      verifyFile: goodVendor,
    });

    assert.equal(report.ok, false);
    const server = report.checks.find((c) => c.id === "server");
    assert.equal(server.status, "error");
    assert.equal(server.code, "PORT_BUSY");
    assert.match(server.hint, /clause live --port 8788/);

    const text = renderDoctor(report);
    assert.match(text, /× server/);
    assert.doesNotMatch(text, /at .*\.mjs:\d+/, "no stack traces");
  } finally {
    clean();
  }
});

test("nothing listening is a warning, not a failure: Clause can be started next", async () => {
  const { root, clean } = setup();
  try {
    const report = await runDoctor({
      root,
      probe: probe({ state: "down", port: 8787 }),
      driver: manual,
      verifyFile: goodVendor,
    });
    assert.equal(report.ok, true, "a stopped server is normal before `clause live`");
    const server = report.checks.find((c) => c.id === "server");
    assert.equal(server.status, "warn");
    assert.equal(server.code, "SERVER_DOWN");
  } finally {
    clean();
  }
});

test("an old Node is an error, because nothing else will work", async () => {
  const { root, clean } = setup();
  try {
    const report = await runDoctor({
      root,
      nodeVersion: "v18.20.0",
      probe: probe({ state: "down", port: 8787 }),
      driver: manual,
      verifyFile: goodVendor,
    });
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((c) => c.id === "node").status, "error");
  } finally {
    clean();
  }
});

test("a hand-edited capture file is caught before a capture fails in the browser", async () => {
  const { root, clean } = setup();
  try {
    mkdirSync(join(root, "packages", "capture"), { recursive: true });
    writeFileSync(join(root, "packages", "capture", "capture.js"), "edited");
    const report = await runDoctor({
      root,
      probe: probe({ state: "down", port: 8787 }),
      driver: manual,
      verifyFile: () => ({ ok: false, problems: ["bytes changed"], patches: 16 }),
    });
    const capture = report.checks.find((c) => c.id === "capture");
    assert.equal(capture.status, "error");
    assert.equal(capture.code, "VENDOR_DRIFT");
  } finally {
    clean();
  }
});

test("a folder without a workspace says how to set one up", async () => {
  const root = mkdtempSync(join(tmpdir(), "clause-bare-"));
  try {
    const report = await runDoctor({
      root,
      probe: probe({ state: "down", port: 8787 }),
      driver: manual,
      verifyFile: goodVendor,
    });
    const workspace = report.checks.find((c) => c.id === "workspace");
    assert.equal(workspace.status, "warn");
    assert.match(workspace.hint, /clause init/);
    assert.equal(report.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bad override files are an error, because a build must not half-apply them", async () => {
  const { root, clean } = setup();
  try {
    writeFileSync(join(root, ".clause", "overrides", "broken.json"), "{not json");
    const report = await runDoctor({
      root,
      probe: probe({ state: "down", port: 8787 }),
      driver: manual,
      verifyFile: goodVendor,
    });
    const workspace = report.checks.find((c) => c.id === "workspace");
    assert.equal(workspace.status, "error");
    assert.equal(report.ok, false);
  } finally {
    clean();
  }
});
