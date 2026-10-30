// The user's edits to the product, kept as data outside the product.
//
// A user who wants the pane wider, a different default grid, or one more menu item should not edit
// a file that the next update overwrites. They write a small patch here instead: the file, the exact
// text to find, the text to put there, and why. On every build the patches are applied to the
// current sources and checked. If an update moved an anchor, the patch is named and nothing is
// half-written, so the choice is always explicit: port the patch, or drop it.
//
// Deliberately refused: absolute paths, paths that leave the project, the user layer itself (an
// update must not be able to patch its own escape hatch), generated builds like figma-plugin/, and
// node_modules. Those are not "customizations", they are ways to lose work.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { STATE_FILES } from "@clause/contract/keys";
import { applyPatches, validatePatches } from "@clause/patch";
import { workspacePaths } from "./layout.mjs";

const REFUSED = [
  { prefix: STATE_FILES.dir, why: "the user layer is not patchable by itself" },
  { prefix: "node_modules", why: "dependencies are not ours to edit" },
  { prefix: "figma-plugin", why: "it is generated, so patch the source in scripts/plugin/ instead" },
];

/**
 * Is this a path the user is allowed to patch?
 * @param {string} file
 */
export function checkTarget(file) {
  if (typeof file !== "string" || file.trim() === "") return { ok: false, reason: "no file given" };
  if (isAbsolute(file)) return { ok: false, reason: "the file must be relative to the project" };
  if (file.split(/[\\/]/).includes(".."))
    return { ok: false, reason: "the file must stay inside the project" };

  const clean = file.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const rule of REFUSED) {
    if (clean === rule.prefix || clean.startsWith(`${rule.prefix}/`)) {
      return { ok: false, reason: rule.why };
    }
  }
  return { ok: true, file: clean };
}

/**
 * Read every .json document in .clause/overrides/. Returns patches with their target file, plus
 * every problem found while reading. It does not touch the product.
 * @param {string} [root]
 */
export function loadOverrides(root = process.cwd()) {
  const paths = workspacePaths(root);
  const patches = [];
  const problems = [];

  if (!existsSync(paths.overrides)) return { patches, problems };

  for (const name of readdirSync(paths.overrides)
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    const where = `overrides/${name}`;
    let document;
    try {
      document = JSON.parse(readFileSync(join(paths.overrides, name), "utf8"));
    } catch (error) {
      problems.push(`${where}: not valid JSON (${error instanceof Error ? error.message : error})`);
      continue;
    }

    const list = Array.isArray(document)
      ? document
      : Array.isArray(document?.patches)
        ? document.patches
        : null;
    if (!list) {
      problems.push(`${where}: expected an object with a "patches" array`);
      continue;
    }

    list.forEach((entry, index) => {
      const at = `${where}[${index}]`;
      const target = checkTarget(entry?.file);
      if (!target.ok) {
        problems.push(`${at}: ${target.reason}`);
        return;
      }
      patches.push({
        id: typeof entry?.id === "string" ? entry.id : "",
        why: typeof entry?.why === "string" ? entry.why : "",
        find: typeof entry?.find === "string" ? entry.find : "",
        replace: typeof entry?.replace === "string" ? entry.replace : "",
        file: target.file,
        from: where,
      });
    });
  }

  problems.push(...validatePatches(patches));
  return { patches, problems };
}

/**
 * Apply the user's patches to a copy in memory. `write: true` writes the result to the sources.
 * Never writes unless every patch lands, and never writes to a refused path.
 *
 * @param {string} [root]
 * @param {{ write?: boolean, readFile?: (path: string) => string }} [options]
 */
export function applyOverrides(root = process.cwd(), { write = false, readFile = readFileSync } = {}) {
  const { patches, problems } = loadOverrides(root);
  const missed = [];
  const changed = [];

  if (problems.length) return { ok: false, problems, changed, missed, written: false };

  const byFile = new Map();
  for (const patch of patches) {
    if (!byFile.has(patch.file)) byFile.set(patch.file, []);
    byFile.get(patch.file).push(patch);
  }

  for (const [file, list] of byFile) {
    const absolute = resolve(root, ...file.split("/"));
    if (!existsSync(absolute)) {
      missed.push({
        file,
        id: list[0].id,
        why: "the file this patch targets is not in this checkout",
        found: 0,
      });
      continue;
    }

    const before = String(readFile(absolute));
    const result = applyPatches(before, list);
    for (const miss of result.missed) missed.push({ ...miss, file });
    if (result.text !== before) changed.push({ file, text: result.text, applied: result.applied });
  }

  if (missed.length) return { ok: false, problems, changed: [], missed, written: false };

  if (write) {
    for (const item of changed) {
      const absolute = resolve(root, ...item.file.split("/"));
      writeFileSync(absolute, item.text);
    }
  }

  return { ok: true, problems, changed, missed, written: write && changed.length > 0 };
}
