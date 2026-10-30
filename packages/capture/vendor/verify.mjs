// The verifier for the pinned capture script.
//
// Two different failures get two different names:
//   · the file is not what SHIPPED says, which means someone edited a 127KB minified artifact or
//     dropped in a new one without recording it;
//   · a patch no longer applies cleanly, which means the record and the file disagree.
//
// Both are recoverable, so every problem carries what to do about it.
import { createHash } from "node:crypto";
import { applyPatches, countOccurrences, unapplyPatches } from "@clause/patch";
import { CLAUSE_ONLY, PATCHES, SHIPPED } from "./patches.mjs";

/** @param {string} text */
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** @type {(haystack: string, needle: string) => number} */
export const occurrences = countOccurrences;

/**
 * Remove every patch, leaving the base this list was written against.
 * @param {string} shipped
 */
export function unapply(shipped) {
  return unapplyPatches(shipped, PATCHES);
}

/**
 * Apply every patch to a base. Used by adopt, and by verify as the round trip.
 * @param {string} base
 */
export function apply(base) {
  return applyPatches(base, PATCHES);
}

const HINT =
  "If capture.js was edited by hand, revert it. If it is a newer copy of Figma's script, run " +
  "`npm run vendor:adopt -- <file>`, fix the anchors it reports, then `npm run vendor:pin`.";

/**
 * Verify the shipped file against the patch record.
 * @param {string} shipped
 */
export function verify(shipped) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const notes = [];

  if (shipped.length !== SHIPPED.bytes || sha256(shipped) !== SHIPPED.sha256) {
    problems.push(
      `capture.js is not the file this record describes (${shipped.length} bytes, sha ${sha256(shipped).slice(0, 12)}; ` +
        `expected ${SHIPPED.bytes} bytes, sha ${SHIPPED.sha256.slice(0, 12)})`,
    );
  }

  const ids = PATCHES.map((p) => p.id);
  for (const id of ids) {
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) problems.push(`patch id "${id}" is used twice`);
  }

  for (const patch of PATCHES) {
    if (!patch.find) problems.push(`patch "${patch.id}" has no upstream side`);
    if (!patch.replace) problems.push(`patch "${patch.id}" has no shipped side`);
    if (patch.why.trim().length < 20) problems.push(`patch "${patch.id}" does not say why it exists`);
    const n = occurrences(shipped, patch.replace);
    if (n !== 1) {
      problems.push(
        `patch "${patch.id}" is ${n === 0 ? "missing" : `duplicated ${n} times`}: ` +
          `${n === 0 ? "its hook is not in capture.js" : "the same text appears more than once"}`,
      );
    }
  }

  const base = unapply(shipped);
  if (base.removed.length !== PATCHES.length) {
    const missing = ids.filter((id) => !base.removed.includes(id));
    notes.push(`could not reverse: ${missing.join(", ")}`);
  } else if (sha256(base.text) !== SHIPPED.baseSha256) {
    problems.push("reversing the record does not reproduce the recorded base");
  }

  for (const token of CLAUSE_ONLY) {
    if (base.text.includes(token)) {
      problems.push(`"${token}" survives un-patching, so an edit is not recorded in patches.mjs`);
    }
  }

  const roundTrip = apply(base.text);
  if (roundTrip.text !== shipped) {
    problems.push("applying the record to its own base does not return the shipped bytes");
  }
  for (const miss of roundTrip.missed) {
    problems.push(`patch "${miss.id}" does not land on the base (${miss.found} matches)`);
  }

  return {
    ok: problems.length === 0,
    problems,
    notes,
    patches: PATCHES.length,
    bytes: shipped.length,
    baseBytes: base.text.length,
    hint: problems.length ? HINT : undefined,
  };
}
