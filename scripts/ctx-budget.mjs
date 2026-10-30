#!/usr/bin/env node
// ctx-budget.mjs — how much context the files every session loads cost (≈ 4 bytes per token). Prints one line; warns when over budget.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mem = resolve(process.env.HOME || "", ".claude/projects/" + root.replace(/\//g, "-") + "/memory");
const files = ["CLAUDE.md", "docs/POWER-INDEX.md", ".clause/agent.md", ".clause/local-rules.md"].map(f => resolve(root, f)).concat(existsSync(mem) ? ["MEMORY.md"].map(f => resolve(mem, f)) : []);
let bytes = 0; const rows = [];
for (const f of files) if (existsSync(f)) { const n = readFileSync(f).length; bytes += n; rows.push(`${f.split("/").pop()} ${Math.round(n / 4)}t`); }
const tokens = Math.round(bytes / 4), LIMIT = 9000;
console.log(`context at start ≈ ${tokens} tokens (${rows.join(", ")})` + (tokens > LIMIT ? ` ⚠ over ${LIMIT}: trim CLAUDE.md / .clause/agent.md or move detail into docs/ and grep it on demand` : " ✓"));
