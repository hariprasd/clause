// registry.mjs — which Figma file belongs to which design-system catalog.
//
// A fresh clone has no catalog and no registry. Extraction fills them in, and everything is written
// to the user's own layer, so an update can never conflict with a catalog the user created:
//   ds/registry.json        the catalogs an extract produced
//   .clause/registry.local.json   this user's additions and choices on top
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const rd = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
export function loadRegistry(root) {
  const base = rd(resolve(root, "ds/registry.json"), { systems: [] }), local = rd(resolve(root, ".clause/registry.local.json"), { systems: [] });
  const systems = (base.systems || []).map(s => ({ ...s }));
  for (const l of local.systems || []) { const i = systems.findIndex(s => s.id === l.id); if (i < 0) systems.push({ ...l }); else systems[i] = { ...systems[i], ...l, files: [...new Set([...(systems[i].files || []), ...(l.files || [])])] }; }
  return { ...base, systems };
}
// Persist one system entry into the user's layer. Never a file an update replaces.
export function saveSystem(root, entry) {
  const p = resolve(root, ".clause/registry.local.json");
  mkdirSync(resolve(root, ".clause"), { recursive: true });
  const reg = rd(p, { systems: [] }); const i = reg.systems.findIndex(s => s.id === entry.id); if (i < 0) reg.systems.push(entry); else reg.systems[i] = entry;
  writeFileSync(p, JSON.stringify(reg, null, 2)); return p;
}
export const localRulesPath = root => resolve(root, ".clause/local-rules.md");
// Rules are always the user's, in the user's layer. There is no shared rules file to merge into.
export const rulesTargetPath = root => localRulesPath(root);
