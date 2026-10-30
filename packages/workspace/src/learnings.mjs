// What Clause picks up while it works, so the user does not have to repeat themselves.
//
// A learning is one sentence, one kind, and the date. It is append-only on disk
// (.clause/learnings.jsonl), deduplicated by its own text, and recalled by simple term matching.
// No embeddings, no service, no model call: memory has to work offline and stay readable if the
// product disappears.
//
// The agent writes these as a side effect of working. The user reads and edits them like any other
// file. "Forget" rewrites the file without that line, so the user stays in control.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { workspacePaths } from "./layout.mjs";

export const LEARNING_KINDS = ["preference", "pattern", "decision", "correction", "fact"];

const MAX_TEXT = 600;
const MIN_TEXT = 8;
const MAX_TAGS = 8;

const normalize = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** A stable id, so the same observation cannot be stored twice. */
export const learningId = (text) =>
  createHash("sha1").update(normalize(text).toLowerCase()).digest("hex").slice(0, 10);

/**
 * @param {string} root
 * @returns {{ learnings: Record<string, unknown>[], skipped: number }}
 */
export function readLearnings(root = process.cwd()) {
  const { learnings } = workspacePaths(root);
  if (!existsSync(learnings)) return { learnings: [], skipped: 0 };

  const items = [];
  let skipped = 0;
  for (const line of readFileSync(learnings, "utf8").split("\n")) {
    const text = line.trim();
    if (!text) continue;
    try {
      const record = JSON.parse(text);
      if (record && typeof record === "object") items.push(record);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { learnings: items, skipped };
}

/**
 * Record one observation. Returns the existing record instead of a duplicate.
 *
 * @param {string} root
 * @param {{
 *   text: string,
 *   kind?: string,
 *   tags?: string[],
 *   source?: string,
 *   at?: string,
 * }} input
 */
export function appendLearning(root = process.cwd(), input) {
  const text = normalize(input?.text);
  if (text.length < MIN_TEXT) {
    return { ok: false, reason: `A learning needs at least ${MIN_TEXT} characters.` };
  }
  if (text.length > MAX_TEXT) {
    return { ok: false, reason: `Keep a learning under ${MAX_TEXT} characters (it is ${text.length}).` };
  }

  const kind = input.kind ?? "fact";
  if (!LEARNING_KINDS.includes(kind)) {
    return { ok: false, reason: `Unknown kind "${kind}". Use one of: ${LEARNING_KINDS.join(", ")}.` };
  }

  const tags = [...new Set((input.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
  if (tags.length > MAX_TAGS) {
    return { ok: false, reason: `Use at most ${MAX_TAGS} tags.` };
  }

  const id = learningId(text);
  const { learnings } = readLearnings(root);
  const known = learnings.find((item) => item.id === id || learningId(String(item.text)) === id);
  if (known) return { ok: false, reason: "Already learned.", learning: known };

  const record = {
    id,
    at: input.at ?? new Date().toISOString(),
    kind,
    text,
    tags,
    ...(input.source ? { source: String(input.source) } : {}),
  };

  const paths = workspacePaths(root);
  mkdirSync(paths.dir, { recursive: true });
  appendFileSync(paths.learnings, `${JSON.stringify(record)}\n`);

  return { ok: true, learning: record };
}

/**
 * The most relevant learnings for a topic, newest first when the topic is empty.
 *
 * @param {string} root
 * @param {string} [query]
 * @param {{ limit?: number, kind?: string }} [options]
 */
export function recall(root = process.cwd(), query = "", { limit = 8, kind } = {}) {
  const { learnings } = readLearnings(root);
  const terms = normalize(query)
    .toLowerCase()
    .split(" ")
    .filter((t) => t.length >= 3);

  const scored = [];
  for (const item of learnings) {
    if (kind && item.kind !== kind) continue;
    const text = String(item.text ?? "").toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.join(" ").toLowerCase() : "";
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 2;
      if (tags.includes(term)) score += 3;
    }
    if (terms.length && score === 0) continue;
    scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.item.at ?? "").localeCompare(String(a.item.at ?? ""));
  });

  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.item);
}

/** @param {string} root */
export function learningStats(root = process.cwd()) {
  const { learnings, skipped } = readLearnings(root);
  const kinds = {};
  let lastAt = null;

  for (const item of learnings) {
    const kind = typeof item.kind === "string" ? item.kind : "unknown";
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    const at = typeof item.at === "string" ? item.at : "";
    if (at && (!lastAt || at > lastAt)) lastAt = at;
  }

  return { count: learnings.length, kinds, lastAt, skipped };
}

/**
 * Remove one learning by id. Rewrites the file without it, so the user's delete is real.
 * @param {string} root
 * @param {string} id
 */
export function forgetLearning(root = process.cwd(), id) {
  const { learnings } = readLearnings(root);
  const kept = learnings.filter((item) => item.id !== id);
  if (kept.length === learnings.length) return { removed: false, count: kept.length };

  const { learnings: file } = workspacePaths(root);
  writeFileSync(file, kept.map((item) => JSON.stringify(item)).join("\n") + (kept.length ? "\n" : ""));
  return { removed: true, count: kept.length };
}
