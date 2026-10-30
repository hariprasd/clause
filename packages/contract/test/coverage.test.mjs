// Ratchet: the contract must describe every route the legacy code still speaks.
//
// While the server is being split out of scripts/serve.mjs, the contract is the target and the
// legacy tree is the truth. This test scans the legacy tree for path literals and fails if one is
// not represented in ROUTES, so no route can hide during the migration. It should keep passing
// with an empty ignore list, and the ignore list should only ever shrink.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ROUTES } from "../src/routes.mjs";

const root = new URL("../../../", import.meta.url);

// Files that speak the protocol. capture.js is deliberately absent: it is the pinned vendor file and
// talks to Figma's own service, not to Clause.
const LEGACY_FILES = [
  "scripts/serve.mjs",
  "scripts/webpaste.mjs",
  "scripts/inspect.mjs",
  "scripts/look.mjs",
  "scripts/setup.mjs",
  "figma-plugin/code.js",
  "figma-plugin/ui.html",
  "packages/capture/background.js",
  "packages/capture/shortcut.js",
];

// Literals that look like routes but are not Clause's, with the reason. Adding to this list needs
// a reason in the comment, and removals are always welcome.
const NOT_ROUTES = new Map([]);

function literalsIn(source) {
  const found = new Set();
  for (const match of source.matchAll(/["'`](\/[a-z0-9][a-z0-9/:_.-]*)["'`]/g)) found.add(match[1]);
  return found;
}

const covered = (literal) => ROUTES.some((r) => r.path === literal || r.path.startsWith(literal));

test("every route literal in the legacy tree exists in the contract", () => {
  const missing = [];

  for (const file of LEGACY_FILES) {
    const url = new URL(file, root);
    if (!existsSync(url)) continue; // a file that has already moved out of the legacy tree
    for (const literal of literalsIn(readFileSync(url, "utf8"))) {
      if (NOT_ROUTES.has(literal)) continue;
      if (covered(literal)) continue;
      missing.push(`${file}: ${literal}`);
    }
  }

  assert.deepEqual(
    missing,
    [],
    `routes used but not declared in packages/contract/src/routes.mjs:\n${missing.join("\n")}`,
  );
});

test("the contract does not carry routes nothing speaks", () => {
  // Not an error, just a reminder that dead routes should be deleted rather than documented.
  const unused = ROUTES.filter((r) => {
    let seen = false;
    for (const file of LEGACY_FILES) {
      const url = new URL(file, root);
      if (!existsSync(url)) continue;
      const body = readFileSync(url, "utf8");
      const stem = r.path.split("/:")[0];
      if (body.includes(stem)) seen = true;
    }
    return !seen;
  }).map((r) => `${r.name} ${r.path}`);

  assert.deepEqual(
    unused,
    [],
    `declared but nothing in the legacy tree speaks them (delete or wire up):\n${unused.join("\n")}`,
  );
});
