// compile.mjs — screens/<name>.json → SCREEN object (screen tree + only the token/component/style keys it uses).
import { readFileSync, existsSync } from "node:fs";
import { loadRegistry } from "./registry.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { esCompile } from "./compile-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Compact catalog = everything the compiler needs.
export function loadCatalog(dsDir) {
  const D = dsDir ? String(dsDir).replace(/\.\.|^\//g, "") : "ds"; // per-screen catalog: "ds": "ds/files/<name>"
  // No catalog is a first-class case, not an error: general design builds with primitives and raw values.
  if (!existsSync(resolve(root, D, "components.json"))) return { general: true, page: null, vars: { spacing: {}, radius: {}, colors: {} }, styles: {}, fonts: {}, comps: {} };
  const comps = JSON.parse(readFileSync(resolve(root, D, "components.json"), "utf8"));
  // a registered system may extend another one (same library, only the delta is stored here): merge the base catalog first
  try { const reg = loadRegistry(root); const me = reg.systems.find(s => s.dir === D), base = me && me.extends && reg.systems.find(s => s.id === me.extends);
    if (base) { const b = JSON.parse(readFileSync(resolve(root, base.dir, "components.json"), "utf8")); const own = new Set([...comps.local, ...comps.library].map(x => x.key)); comps.library = [...b.library.filter(x => !own.has(x.key)), ...comps.library]; comps.local = [...b.local.filter(x => !own.has(x.key)), ...comps.local]; } } catch {}
  const keys = existsSync(resolve(root, D, "variable-keys.json")) ? JSON.parse(readFileSync(resolve(root, D, "variable-keys.json"), "utf8")) : { spacing: {}, radius: {}, colors: {}, colorAliases: {}, textStyles: {} };
  const tsPath = resolve(root, D, "tokens/text-styles.json");
  const ts = existsSync(tsPath) ? (JSON.parse(readFileSync(tsPath, "utf8")).textStyles || []) : [];
  const config = existsSync(resolve(root, "ds/config.md")) ? readFileSync(resolve(root, "ds/config.md"), "utf8") : "";
  const c = {};
  for (const x of [...comps.local, ...comps.library]) c[x.key] = x.lib
    ? { lib: 1, setKey: x.setKey || null, key: x.variantKey, def: x.default || null, props: x.props || {} }
    : { id: x.id, set: x.set, def: x.default, props: x.props || {} };
  // non-default catalog: remember the default catalog's library keys as a fallback (same component key, other file's library publish)
  if (D !== "ds" && existsSync(resolve(root, "ds/components.json"))) { const base = JSON.parse(readFileSync(resolve(root, "ds/components.json"), "utf8")); for (const x of base.library) if (c[x.key] && c[x.key].lib && x.variantKey) c[x.key].alt = { setKey: x.setKey || null, key: x.variantKey }; }
  const fonts = {}; for (const s of ts) if (keys.textStyles && keys.textStyles[s.name]) fonts[s.name] = [s.fontFamily, s.fontStyle];
  return {
    page: (config.match(/`(\d+:\d+)`[^\n]*\*\*test\*\*/) || [])[1] || null, // fallback only; the plugin builds on the user's current page
    vars: { spacing: keys.spacing || {}, radius: keys.radius || {}, colors: Object.assign({}, keys.colors, keys.colorAliases) },
    styles: keys.textStyles || {}, fonts, comps: c,
  };
}
export function compile(arg, screenIdx = null) {
  const file = arg.endsWith(".json") ? resolve(arg) : resolve(root, "screens", `${arg}.json`);
  const screen = JSON.parse(readFileSync(file, "utf8"));
  return esCompile(loadCatalog(screen.ds), screen, arg, screenIdx);
}

