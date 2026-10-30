#!/usr/bin/env node
// inspect.mjs — reference Figma frame -> draft screen JSON + spec table. Needs `npm run live` + plugin open.
//   node scripts/inspect.mjs <figma-url | nodeId> [--raw] [--vs <url|nodeId>]
// Writes drafts/<id>.json (screen JSON skeleton: catalog keys, props that differ from defaults, texts, token-mapped
// gap/pad/radius/colors) and prints components used + unmapped instances. --vs prints geometry/prop diffs against another frame.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 8787, B = `http://localhost:${PORT}`;
const args = process.argv.slice(2), flag = f => args.includes(f), after = f => args[args.indexOf(f) + 1];
const idOf = a => { const m = String(a).match(/node-id=(\d+)[-:](\d+)/); return m ? `${m[1]}:${m[2]}` : String(a).replace("-", ":"); };

async function fetchTree(id) {
  const before = JSON.stringify(await (await fetch(B + "/result")).json());
  await fetch(`${B}/inspect/${id}`, { method: "POST" });
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 250));
    const r = await (await fetch(B + "/result")).json();
    if (r && r.name === "_inspect" && JSON.stringify(r) !== before) { if (!r.ok) throw new Error(r.error); return r.res.inspect; }
  }
  throw new Error("timeout — is the Figma plugin open? (⌘⌥P)");
}

// ---- token maps from ds/tokens.css (absent in general mode: raw px is correct then)
const hasCat = existsSync(resolve(root, "ds/components.json"));
const css = existsSync(resolve(root, "ds/tokens.css")) ? readFileSync(resolve(root, "ds/tokens.css"), "utf8") : "";
const tok = prefix => { const m = {}; for (const x of css.matchAll(new RegExp(`--${prefix}-([\\w-]+):\\s*(\\d+)px`, "g"))) if (!(x[2] in m)) m[x[2]] = x[1]; return m; };
const SP = tok("spacing"), RD = tok("radius");
const near = (map, v) => v == null ? undefined : (map[String(Math.round(v))] ?? null);
const cat = hasCat ? JSON.parse(readFileSync(resolve(root, "ds/components.json"), "utf8")) : { local: [], library: [] };
const byId = {}, bySet = {}, byVar = {};
for (const x of [...cat.local, ...cat.library]) { if (x.id) byId[x.id] = x; if (x.setKey) bySet[x.setKey] = x; if (x.variantKey) byVar[x.variantKey] = x; if (x.key && x.lib) byVar[x.key] = x; }
const find = mc => mc && (byId[mc.id] || byId[mc.setId] || bySet[mc.setKey] || byVar[mc.key] || null);
const used = {}, unmapped = [], notes = [];
const norm = s => s.replace(/[^a-z0-9]/gi, "").toLowerCase();

function toNode(n, ctx = {}) {
  if (n.hidden) return null;
  if (n.t === "INSTANCE" && hasCat) {
    const e = find(n.mc);
    if (!e) { unmapped.push(`${n.n} (${n.mc && (n.mc.setName || n.mc.name)} ${n.mc && n.mc.id}) ${n.w}x${n.h}`); return { c: "??" + (n.mc && (n.mc.setName || n.mc.name)), i: n.id, why: "not in catalog" }; }
    used[e.key] = (used[e.key] || 0) + 1;
    const o = { c: e.key, i: slug(n.n, n.id) };
    const def = Object.fromEntries((e.default || "").split(",").filter(Boolean).map(kv => kv.split("=").map(s => s.trim())));
    const p = {};
    for (const [k, v] of Object.entries(n.props || {})) { const ck = Object.keys(e.props || {}).find(x => norm(x) === norm(k)); if (!ck) continue; const sv = String(v); if (def[ck] === sv && !(e.props[ck] === "BOOLEAN")) continue; p[ck] = sv; }
    if (Object.keys(p).length) o.p = p;
    if (n.texts && n.texts.length) o.text = n.texts;
    if (ctx.parentLm && n.sh === "FILL") o.fill = ctx.parentLm === "HORIZONTAL" ? "x" : "x";
    return o;
  }
  if (n.t === "TEXT") return { t: "text", i: slug(n.n, n.id), content: n.c, style: (n.style || "").replace(/\s*\/\s*/, "/") || undefined, color: n.color || undefined, ...(n.maxLines ? { maxLines: n.maxLines } : {}) };
  const o = { t: n.lm === "HORIZONTAL" ? "row" : "stack", i: slug(n.n, n.id) };
  if (n.lm) {
    const g = near(SP, n.g); if (n.g) { if (g) o.gap = g; else if (!hasCat) o.gap = n.g; else notes.push(`${n.id} gap ${n.g}px has no token`); }
    const [pt, pr, pb, pl] = n.pad || [0, 0, 0, 0];
    const tk = v => (v ? near(SP, v) || (hasCat ? (notes.push(`${n.id} pad ${v}px has no token`), null) : v) : null);
    if (pt === pb && pl === pr && pt === pl) { if (pt) o.pad = tk(pt); } else { if (pt === pb && pt) o.py = tk(pt); else { if (pt) o.pt = tk(pt); if (pb) o.pb = tk(pb); } if (pl === pr && pl) o.px = tk(pl); else { if (pl) o.pl = tk(pl); if (pr) o.pr = tk(pr); } }
    if (n.pa && n.pa !== "MIN") o.justify = { CENTER: "center", MAX: "end", SPACE_BETWEEN: "between" }[n.pa];
    if (n.ca && n.ca !== "MIN") o.align = { CENTER: "center", MAX: "end" }[n.ca];
    if (n.wrap) o.wrap = true;
  }
  if (n.sh === "FIXED" || !n.sh) o.w = n.w; if (ctx.parentLm && n.sh === "FILL") o.fill = "x";
  if (n.sv === "FIXED") o.h = n.h;
  if (n.r) { const r = near(RD, n.r); if (r) o.radius = r; else if (!hasCat) o.radius = n.r; else notes.push(`${n.id} radius ${n.r}px has no token`); }
  if (n.fill && n.fill !== "raw") o.bg = n.fill; if (n.stroke && n.stroke !== "raw") o.border = n.stroke; if (n.dash) o.dash = true;
  const kids = (n.k || []).map(c => toNode(c, { parentLm: n.lm })).filter(Boolean);
  if (kids.length) o.children = kids;
  return o;
}
function slug(name, id) { return (String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "n") + "-" + id.split(":").pop(); }

// ---- diff two inspected trees (geometry + instance props), matched by position
function diff(a, b, path = "", out = []) {
  const here = path + "/" + (a.n || a.t);
  for (const k of ["w", "h", "g", "r"]) if (a[k] !== undefined && b[k] !== undefined && a[k] !== b[k]) out.push(`${here} ${k}: ref ${a[k]} vs mine ${b[k]}`);
  if (JSON.stringify(a.pad) !== JSON.stringify(b.pad) && a.pad && b.pad) out.push(`${here} pad: ref [${a.pad}] vs mine [${b.pad}]`);
  if (a.t === "INSTANCE" && b.t === "INSTANCE") { if ((a.mc || {}).id !== (b.mc || {}).id) out.push(`${here} component: ref ${(a.mc || {}).setName || (a.mc || {}).name} vs mine ${(b.mc || {}).setName || (b.mc || {}).name}`); for (const k of Object.keys(a.props || {})) if (b.props && b.props[k] !== undefined && b.props[k] !== a.props[k]) out.push(`${here} prop ${k}: ref ${a.props[k]} vs mine ${b.props[k]}`); }
  const ka = (a.k || []).filter(x => !x.hidden), kb = (b.k || []).filter(x => !x.hidden);
  if (ka.length !== kb.length) out.push(`${here} children: ref ${ka.length} vs mine ${kb.length}`);
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) diff(ka[i], kb[i], here, out);
  return out;
}

const vsArg = flag("--vs") ? after("--vs") : null; const target = args.find(a => !a.startsWith("--") && a !== vsArg);
if (!target) { console.error("usage: inspect.mjs <figma-url|nodeId> [--raw] [--vs <url|nodeId>]"); process.exit(1); }
const id = idOf(target);
const tree = await fetchTree(id);
if (flag("--raw")) { console.log(JSON.stringify(tree)); process.exit(0); }
if (flag("--vs")) { const other = await fetchTree(idOf(vsArg)); const d = diff(tree, other); console.log(d.length ? d.join("\n") : "no geometry/prop differences"); process.exit(0); }
const rootNode = toNode(tree); for (const k of ["radius", "bg", "border", "w", "h"]) delete rootNode[k];
const screen = { title: tree.n, width: tree.w, height: tree.h, tree: rootNode };
mkdirSync(resolve(root, "drafts"), { recursive: true });
const file = resolve(root, "drafts", id.replace(":", "-") + ".json"); writeFileSync(file, JSON.stringify(screen, null, 1));
console.log(`draft → ${file}\ncomponents: ${Object.entries(used).map(([k, v]) => k + "×" + v).join(", ")}`);
if (unmapped.length) console.log("NOT IN CATALOG:\n  " + [...new Set(unmapped)].join("\n  "));
if (notes.length) console.log("token gaps:\n  " + [...new Set(notes)].slice(0, 20).join("\n  "));
