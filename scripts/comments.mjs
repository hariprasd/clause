#!/usr/bin/env node
// comments.mjs — read the open Figma comments of a file (REST API) with the layer each one points at.
//   node scripts/comments.mjs [--file <key|figma url>] [--all] [--json]
// Token: env FIGMA_TOKEN or the first line of .clause/figma-token (never printed, never committed).
// File key: --file, or .clause/figma-file (a key or a figma.com URL). Only unresolved comments unless --all.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const rd = f => existsSync(resolve(root, f)) ? readFileSync(resolve(root, f), "utf8").split("\n")[0].trim() : "";
const token = process.env.FIGMA_TOKEN || rd(".clause/figma-token");
if (!token) { console.error("No token: put it on the first line of .clause/figma-token (or set FIGMA_TOKEN)."); process.exit(2); }
let file = arg("--file") || rd(".clause/figma-file");
const m = file.match(/figma\.com\/(?:design|file|board)\/([A-Za-z0-9]+)/); if (m) file = m[1];
if (!file) { console.error("No file: pass --file <key|url> or put it in .clause/figma-file."); process.exit(2); }
if (arg("--file")) { mkdirSync(resolve(root, ".clause"), { recursive: true }); writeFileSync(resolve(root, ".clause/figma-file"), file + "\n"); }
const r = await fetch(`https://api.figma.com/v1/files/${file}/comments`, { headers: { "X-Figma-Token": token } });
if (!r.ok) { console.error("Figma said", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
const { comments } = await r.json();
const byId = new Map(comments.map(c => [c.id, c]));
const threads = comments.filter(c => !c.parent_id).map(c => ({ ...c, replies: comments.filter(x => x.parent_id === c.id) }));
const open = process.argv.includes("--all") ? threads : threads.filter(t => !t.resolved_at);
if (process.argv.includes("--json")) { console.log(JSON.stringify(open, null, 1)); process.exit(0); }
if (!open.length) { console.log("No open comments."); process.exit(0); }
for (const t of open) {
  const node = t.client_meta && (t.client_meta.node_id || (t.client_meta.node_offset && t.client_meta.node_id));
  console.log(`#${t.order_id || t.id} ${t.user.handle} · ${t.created_at.slice(0, 10)}${node ? " · layer " + node : ""}${t.resolved_at ? " · resolved" : ""}\n  ${t.message.replace(/\n/g, "\n  ")}`);
  for (const x of t.replies) console.log(`    ↳ ${x.user.handle}: ${x.message.replace(/\n/g, " ")}`);
}
