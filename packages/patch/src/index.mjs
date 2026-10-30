// One mechanism, two jobs:
//
//   Figma's capture script is patched, and a new Figma build must be ported without losing the edits.
//   A user changes something in Clause, and a new Clause release must not lose their change.
//
// Both are the same problem, so both use the same record: an exact `find` string, an exact
// `replace` string, a `why`, and an `id`. No patterns, no line numbers, no fuzzy matching. If an
// anchor is not there, the patch does not land, and the caller gets the reason instead of a
// half-applied file.

/** @typedef {{ id: string, why: string, find: string, replace: string }} Patch */

/**
 * @param {string} haystack
 * @param {string} needle
 */
export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    n++;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return n;
}

/**
 * Problems with the record itself, before it is applied to anything.
 * @param {Patch[]} patches
 * @returns {string[]}
 */
export function validatePatches(patches) {
  const problems = [];
  const ids = patches.map((p) => p.id);

  for (const id of ids) {
    if (!id) problems.push("a patch has no id");
    else if (ids.indexOf(id) !== ids.lastIndexOf(id)) problems.push(`patch id "${id}" is used twice`);
  }

  for (const patch of patches) {
    if (typeof patch.find !== "string" || patch.find.length === 0) {
      problems.push(`patch "${patch.id}" has no anchor`);
    }
    if (typeof patch.replace !== "string" || patch.replace.length === 0) {
      problems.push(`patch "${patch.id}" has no replacement`);
    }
    if (patch.find === patch.replace) problems.push(`patch "${patch.id}" changes nothing`);
    if (typeof patch.why !== "string" || patch.why.trim().length < 20) {
      problems.push(`patch "${patch.id}" does not say why it exists`);
    }
  }

  return problems;
}

/**
 * Apply every patch whose anchor is unique. A patch whose anchor is missing or duplicated is
 * reported and skipped; nothing is guessed.
 * @param {string} text
 * @param {Patch[]} patches
 */
export function applyPatches(text, patches) {
  let next = text;
  const applied = [];
  const missed = [];

  for (const patch of patches) {
    const found = countOccurrences(next, patch.find);
    if (found === 1) {
      next = next.replace(patch.find, patch.replace);
      applied.push(patch.id);
    } else {
      missed.push({ id: patch.id, why: patch.why, found });
    }
  }

  return { text: next, applied, missed };
}

/**
 * Reverse every patch whose shipped side is unique. Used to recover the base a record was written
 * against, and to check that a record round-trips.
 * @param {string} text
 * @param {Patch[]} patches
 */
export function unapplyPatches(text, patches) {
  let next = text;
  const removed = [];

  for (const patch of patches) {
    if (countOccurrences(next, patch.replace) !== 1) continue;
    next = next.replace(patch.replace, patch.find);
    removed.push(patch.id);
  }

  return { text: next, removed };
}
