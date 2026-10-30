import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_STATES,
  CLIENT_STORAGE,
  EVENTS,
  EXTENSION_DEFAULTS,
  EXTENSION_GENERATED,
  EXTENSION_STORAGE,
  HEADERS,
  MESSAGES,
  PAGE_BRIDGE,
  PAGE_MESSAGES,
  PAGE_STORAGE,
  PLUGIN_DATA,
  STATE_FILES,
} from "../src/index.mjs";

const values = (obj) => Object.values(obj);

test("every key collection holds unique values", () => {
  for (const [name, obj] of Object.entries({
    PLUGIN_DATA,
    CLIENT_STORAGE,
    EXTENSION_STORAGE,
    PAGE_STORAGE,
    PAGE_BRIDGE,
    HEADERS,
    STATE_FILES,
    EVENTS,
    MESSAGES,
    PAGE_MESSAGES,
  })) {
    const v = values(obj);
    assert.equal(new Set(v).size, v.length, `${name} repeats a value`);
  }
});

test("plugin data keys are namespaced, so no other tool can claim them", () => {
  for (const key of values(PLUGIN_DATA)) {
    assert.match(key, /^clause:[a-z]+$/, `"${key}" is not namespaced`);
  }
});

test("the extension's defaults cover every setting it stores", () => {
  for (const key of values(EXTENSION_STORAGE)) {
    if (EXTENSION_GENERATED.includes(key)) continue;
    assert.ok(key in EXTENSION_DEFAULTS, `no default for "${key}"`);
  }
  for (const key of EXTENSION_GENERATED) {
    assert.ok(!(key in EXTENSION_DEFAULTS), `"${key}" is generated, it must not have a default`);
  }
});

test("no key contains a space or a quote", () => {
  for (const obj of [PLUGIN_DATA, CLIENT_STORAGE, EXTENSION_STORAGE, PAGE_BRIDGE, STATE_FILES]) {
    for (const v of values(obj)) assert.match(v, /^[A-Za-z0-9._:/@-]+$/);
  }
});

test("agent states are the ones the pane knows how to draw", () => {
  assert.deepEqual([...AGENT_STATES], ["idle", "thinking", "building", "built", "error", "stopped"]);
});

test("the bridge names are stable, because a vendor upgrade can silently break them", () => {
  assert.deepEqual(Object.keys(PAGE_BRIDGE).sort(), [
    "capturing",
    "done",
    "lastHtml",
    "merge",
    "prefs",
    "prepare",
    "report",
    "restore",
    "serialize",
    "toolbarHost",
    "validateCopy",
  ]);
});
