// The manual driver is the floor: it never claims to press a key, and it always tells the designer
// what to press instead. Every failing paste must carry a hint, because the capture is already on
// the clipboard and the designer is one keystroke from done.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createManualDriver } from "../src/drivers/manual.mjs";

test("manual is always available and says what to press", async () => {
  const driver = createManualDriver({ platform: "darwin" });
  const state = await driver.available();
  assert.equal(state.ok, true);
  assert.match(state.reason, /⌘V/);
});

test("manual never pretends to paste", async () => {
  const result = await createManualDriver({ platform: "darwin" }).paste();
  assert.equal(result.ok, false);
  assert.equal(result.code, "DRIVER_UNAVAILABLE");
  assert.match(result.hint, /⌘V/);
});

test("every platform's hint matches its keyboard", async () => {
  for (const [platform, key] of [
    ["darwin", "⌘V"],
    ["win32", "Ctrl+V"],
    ["linux", "Ctrl+V"],
  ]) {
    const result = await createManualDriver({ platform }).paste();
    assert.match(result.hint, new RegExp(key.replace("+", "\\+")));
  }
});
