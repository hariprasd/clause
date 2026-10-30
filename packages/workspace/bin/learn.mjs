#!/usr/bin/env node
// clause-learn — record, recall and forget what Clause picks up while working.
//
//   node packages/workspace/bin/learn.mjs --text "..." [--kind preference] [--tags a,b] [--source "inbox 42"]
//   node packages/workspace/bin/learn.mjs --recall "spacing" [--limit 5] [--json]
//   node packages/workspace/bin/learn.mjs --forget <id>
//   node packages/workspace/bin/learn.mjs --stats [--json]
//
// The agent runs the first form after it learns something durable. A person can use any of them.

import { appendLearning, forgetLearning, learningStats, recall } from "../src/index.mjs";

const argv = process.argv.slice(2);

function flag(name) {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return null;
  const value = argv[at + 1];
  return value && !value.startsWith("--") ? value : "";
}

const json = argv.includes("--json");
const root = process.cwd();
const emit = (value) => console.log(JSON.stringify(value, null, 2));

if (argv.includes("--stats")) {
  const stats = learningStats(root);
  if (json) emit(stats);
  else
    console.log(
      `${stats.count} learnings${stats.lastAt ? `, last ${stats.lastAt.slice(0, 10)}` : ""}${stats.skipped ? `, ${stats.skipped} unreadable lines` : ""}`,
    );
  process.exit(0);
}

if (argv.includes("--recall")) {
  const query = flag("recall") ?? "";
  const limit = Number(flag("limit") ?? 8);
  if (!Number.isFinite(limit) || limit < 1) {
    console.error("--limit must be a positive number");
    process.exit(2);
  }
  const items = recall(root, query, { limit, kind: flag("kind") || undefined });
  if (json) emit(items);
  else if (!items.length) console.log("Nothing learned about that yet.");
  else for (const item of items) console.log(`${String(item.at).slice(0, 10)}  ${item.kind}: ${item.text}`);
  process.exit(0);
}

if (argv.includes("--forget")) {
  const id = flag("forget");
  if (!id) {
    console.error("usage: clause-learn --forget <id>");
    process.exit(2);
  }
  const result = forgetLearning(root, id);
  console.log(result.removed ? `Forgot ${id}. ${result.count} left.` : `No learning with id ${id}.`);
  process.exit(result.removed ? 0 : 1);
}

const text = flag("text");
if (!text) {
  console.error(
    'usage: clause-learn --text "what you learned" [--kind preference] [--tags a,b] [--source "..."]',
  );
  process.exit(2);
}

const tags = (flag("tags") ?? "")
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean);

const result = appendLearning(root, {
  text,
  kind: flag("kind") || undefined,
  tags,
  source: flag("source") || undefined,
});

if (!result.ok) {
  console.error(result.reason);
  process.exit(result.learning ? 0 : 1);
}

if (json) emit(result.learning);
else console.log(`Learned (${result.learning.kind}): ${result.learning.text}`);
