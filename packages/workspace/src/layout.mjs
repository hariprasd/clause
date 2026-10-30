// Where the user's layer lives.
//
// The product and the user's workspace are two different things with two different lifetimes. An
// update replaces the product. Nothing an update does may touch .clause/, which is why every path
// here is derived from the contract's STATE_FILES in one place instead of being typed into scripts.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { STATE_FILES } from "@clause/contract/keys";

/**
 * @param {string} [root] the user's project folder
 */
export function workspacePaths(root = process.cwd()) {
  const base = resolve(root);
  const at = (rel) => join(base, ...rel.split("/"));

  return {
    root: base,
    /** the workspace folder itself, created on first run */
    dir: at(STATE_FILES.dir),
    config: at(STATE_FILES.config),
    learnings: at(STATE_FILES.learnings),
    agent: at(STATE_FILES.agent),
    rules: at(STATE_FILES.localRules),
    overrides: at(STATE_FILES.overrides),
  };
}

/**
 * The nearest folder above `start` that already has a workspace, or null.
 * @param {string} [start]
 * @returns {string | null}
 */
export function findWorkspace(start = process.cwd()) {
  let dir = resolve(start);

  for (;;) {
    if (existsSync(join(dir, STATE_FILES.dir))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}
