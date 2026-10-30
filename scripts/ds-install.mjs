#!/usr/bin/env node
// ds-install.mjs — install an extracted preview as a design system WITHOUT duplicating libraries already known.
//   node scripts/ds-install.mjs <previewDir> <id> "<Display name>" "<Figma file name>"
// 1. copies the preview into ds/files/<id>/   2. finds an existing catalog sharing >=85% of its library components and, if found,
// keeps only the delta + records `extends` in ds/registry.json   3. registers the file name.  (loadCatalog merges `extends` at compile time.)
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from "node:fs";
import { loadRegistry, saveSystem } from "./registry.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [prev, id, name, file] = process.argv.slice(2);
if (!prev || !id || !name || !file) { console.error('usage: ds-install.mjs <previewDir> <id> "<name>" "<figma file name>"'); process.exit(1); }
const reg = loadRegistry(root);
const dir = `ds/files/${id}`, out = resolve(root, dir);
mkdirSync(out, { recursive: true }); if (resolve(root, prev) !== out) cpSync(resolve(root, prev), out, { recursive: true });
const cp = resolve(out, "components.json"), cat = JSON.parse(readFileSync(cp, "utf8"));
const keysOf = d => new Set(JSON.parse(readFileSync(resolve(root, d, "components.json"), "utf8")).library.map(x => x.variantKey).filter(Boolean));
const mine = new Set(cat.library.map(x => x.variantKey).filter(Boolean));
let best = null;
for (const s of reg.systems) { if (s.id === id) continue; const k = keysOf(s.dir), shared = [...mine].filter(x => k.has(x)).length, ratio = mine.size ? shared / mine.size : 0; if (!best || ratio > best.ratio) best = { s, ratio, shared }; }
let entry = reg.systems.find(s => s.id === id);
if (!entry) { entry = { id, name, dir, files: [] }; reg.systems.push(entry); }
if (!entry.files.includes(file)) entry.files.push(file);
if (best && best.ratio >= 0.85) {
  const baseK = keysOf(best.s.dir); const before = cat.library.length;
  cat.library = cat.library.filter(x => !baseK.has(x.variantKey)); entry.extends = best.s.id;
  writeFileSync(cp, JSON.stringify(cat, null, 1));
  console.log(`same library as "${best.s.name}" (${Math.round(best.ratio * 100)}% shared): kept ${cat.library.length} new of ${before} library components, extends ${best.s.id}`);
} else console.log(`own library (best overlap ${best ? Math.round(best.ratio * 100) + "% with " + best.s.id : "none"}): stored whole`);
const where = saveSystem(root, entry); console.log("registered in " + where.replace(root + "/", ""));
