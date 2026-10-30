// The seam between Clause's four parts is a set of bare strings: window hooks the extension
// installs, plugin data tags the plugin writes, message types. Nothing type-checks them, so this
// test checks that the contract's copy of each string is still spoken by the code that has to
// speak it. A vendor upgrade or a rename that misses one side fails here instead of at capture
// time on a designer's machine.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { PAGE_BRIDGE, PLUGIN_DATA } from "@clause/contract/keys";

const root = new URL("../../../", import.meta.url);
const captureDir = new URL("../", import.meta.url);

const read = (url) => (existsSync(url) ? readFileSync(url, "utf8") : "");

// Both sides of the capture seam. capture.js calls the hooks; frames.js and background.js
// install them.
const captureFiles = ["capture.js", "frames.js", "background.js"].map((f) => ({
  name: `packages/capture/${f}`,
  body: read(new URL(f, captureDir)),
}));

// The plugin sources, not the built plugin: check-artifacts already proves the build matches, and
// a rename here has to reach figma-plugin/ through the build rather than around it.
const pluginSources = [
  "scripts/runtime.js",
  "scripts/plugin/annotate-glue.js",
  "scripts/build-plugin.mjs",
].map((f) => ({ name: f, body: read(new URL(f, root)) }));

test("every capture hook in the contract is installed or called by capture code", () => {
  const missing = [];
  for (const [name, hook] of Object.entries(PAGE_BRIDGE)) {
    if (!captureFiles.some((f) => f.body.includes(hook))) missing.push(`${name} = "${hook}"`);
  }
  assert.deepEqual(
    missing,
    [],
    `PAGE_BRIDGE entries nothing in packages/capture speaks (vendor upgrade or rename?):\n${missing.join("\n")}`,
  );
});

test("every plugin data tag in the contract is written by the plugin sources", () => {
  const missing = [];
  for (const [name, key] of Object.entries(PLUGIN_DATA)) {
    if (!pluginSources.some((f) => f.body.includes(key))) missing.push(`${name} = "${key}"`);
  }
  assert.deepEqual(missing, [], `PLUGIN_DATA entries the plugin never writes:\n${missing.join("\n")}`);
});
