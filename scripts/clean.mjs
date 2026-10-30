#!/usr/bin/env node
// clean.mjs — removes everything generated or machine-local, so nothing unwanted stays on disk.
//   node scripts/clean.mjs            remove .clause/ (message history), drafts/, out/, orphan exports
//   node scripts/clean.mjs --all      also figma-plugin/, ds/tokens.css and every exports/*.html (all regenerate with `npm run setup`)
import { rmSync, readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const all = process.argv.includes("--all"), gone = [];
const rm = p => { const f = resolve(root, p); if (existsSync(f)) { rmSync(f, { recursive: true, force: true }); gone.push(p); } };
["notes", ".clause", "drafts", "out"].forEach(rm);
const screens = new Set(readdirSync(resolve(root, "screens")).filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, "")));
if (existsSync(resolve(root, "exports"))) {
  for (const f of readdirSync(resolve(root, "exports"))) if (f.endsWith(".html") && (all || !screens.has(f.replace(/\.html$/, "")))) rm("exports/" + f);
  const mp = resolve(root, "exports/meta.json");
  if (existsSync(mp)) { if (all) rm("exports/meta.json"); else { const m = JSON.parse(readFileSync(mp, "utf8")); for (const k of Object.keys(m)) if (!screens.has(k)) delete m[k]; writeFileSync(mp, JSON.stringify(m)); } }
}
if (all) { rm("figma-plugin"); rm("ds/tokens.css"); }
console.log(gone.length ? "removed: " + gone.join(", ") : "nothing to remove");
