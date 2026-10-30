// The macOS driver is tested against a fake osascript, because CI machines do not have (or want)
// Accessibility permission. What matters is the contract: the exact script, success mapping, and
// turning each macOS refusal into a hint that names the right settings pane.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createDarwinDriver, PASTE_SCRIPT } from "../src/drivers/darwin.mjs";

const ok = () => Promise.resolve({ error: null, stdout: "", stderr: "" });
const refuses = (stderr) => () => Promise.resolve({ error: new Error("Command failed"), stdout: "", stderr });

test("it presses ⌘V with System Events", async () => {
  let asked = null;
  const driver = createDarwinDriver({
    platform: "darwin",
    hasOsascript: () => true,
    run: (script) => {
      asked = script;
      return ok();
    },
  });

  assert.deepEqual(await driver.paste(), { ok: true });
  assert.equal(asked, PASTE_SCRIPT);
});

test("it is only available on macOS", async () => {
  const state = await createDarwinDriver({ platform: "linux" }).available();
  assert.equal(state.ok, false);
  assert.match(state.reason, /not a Mac/);
});

test("a missing osascript is reported, not thrown", async () => {
  const state = await createDarwinDriver({ hasOsascript: () => false }).available();
  assert.equal(state.ok, false);
  assert.match(state.reason, /osascript/);
});

test("an Accessibility refusal points at Accessibility", async () => {
  const driver = createDarwinDriver({
    hasOsascript: () => true,
    run: refuses("osascript is not allowed assistive access. (-1719)"),
  });
  const result = await driver.paste();
  assert.equal(result.ok, false);
  assert.equal(result.code, "DRIVER_UNAVAILABLE");
  assert.match(result.hint, /Accessibility/);
  assert.match(result.hint, /System Settings/);
});

test("an Automation refusal points at Automation", async () => {
  const driver = createDarwinDriver({
    hasOsascript: () => true,
    run: refuses("Not authorized to send Apple events to System Events. (-1743)"),
  });
  const result = await driver.paste();
  assert.equal(result.ok, false);
  assert.match(result.hint, /Automation/);
});

test("an unknown failure still tells the designer to press the key", async () => {
  const driver = createDarwinDriver({
    hasOsascript: () => true,
    run: refuses("something nobody has seen before"),
  });
  const result = await driver.paste();
  assert.equal(result.ok, false);
  assert.ok(result.hint.length > 20);
  assert.match(result.hint, /⌘V/);
});

test("a driver that cannot paste does not run osascript at all", async () => {
  let ran = false;
  const driver = createDarwinDriver({
    platform: "win32",
    hasOsascript: () => true,
    run: () => {
      ran = true;
      return ok();
    },
  });
  const result = await driver.paste();
  assert.equal(result.ok, false);
  assert.equal(ran, false, "a macOS driver must not act on a non-Mac platform");
});
