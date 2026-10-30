// The selector has to be boringly predictable: every platform gets a driver, none of them is null,
// and an unavailable native driver degrades to manual instead of failing the capture.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createManualDriver, driverFor, selectDriver } from "../src/index.mjs";

test("every platform gets a driver", () => {
  assert.equal(driverFor("darwin").name, "darwin");
  assert.equal(driverFor("win32").name, "manual");
  assert.equal(driverFor("linux").name, "manual");
  assert.equal(driverFor("freebsd").name, "manual");
});

test("an unknown platform is not an error", async () => {
  const driver = driverFor("sunos");
  const state = await driver.available();
  assert.equal(state.ok, true, "manual must always be available");
  assert.match(state.reason, /Ctrl\+V/);
});

test("macOS gets ⌘V, everything else gets Ctrl+V", () => {
  assert.match(createManualDriver({ platform: "darwin" }).explain(), /⌘V/);
  assert.match(createManualDriver({ platform: "linux" }).explain(), /Ctrl\+V/);
  assert.match(createManualDriver({ platform: "win32" }).explain(), /Ctrl\+V/);
});

test("selectDriver falls back to manual when the native driver cannot paste", async () => {
  const { driver, reason, fallback } = await selectDriver("darwin", {
    hasOsascript: () => false,
  });
  assert.equal(driver.name, "manual");
  assert.equal(fallback, true);
  assert.match(reason, /osascript/);
});

test("selectDriver keeps the native driver when it can paste", async () => {
  const { driver, fallback } = await selectDriver("darwin", {
    hasOsascript: () => true,
  });
  assert.equal(driver.name, "darwin");
  assert.equal(fallback, false);
});

test("a driver is usable through the same three calls on every platform", async () => {
  for (const platform of ["darwin", "win32", "linux"]) {
    const driver = platform === "darwin" ? createManualDriver({ platform }) : driverFor(platform);
    const state = await driver.available();
    assert.equal(typeof state.ok, "boolean");
    assert.ok(state.reason.length > 10, `${platform}: available() must explain itself`);
    assert.equal(typeof driver.explain(), "string");
    const result = await driver.paste();
    assert.equal(typeof result.ok, "boolean");
  }
});
