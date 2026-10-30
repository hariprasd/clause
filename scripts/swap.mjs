#!/usr/bin/env node
// swap.mjs — replace nodes in place with instances of library components imported by raw key (company logos, icons).
//   node scripts/swap.mjs spec.json   spec: { swaps:[{ target:<node id>, key:<component key>, size?:22, name? }] }
// (derived from variant.mjs)
//   node scripts/variant.mjs scripts/variants/<spec>.json
// spec: { ds, anchor:<node id of a frame/section next to which the new Section appears>, section:"name", useComps:[catalog keys], useVars:[tokens],
//         variants:[{ from:<node id>, name, texts:[[find,replace,nth?]] ("=text" = exact match; textsAfter runs after set/add), hide:[{name,nth?,has?,all?}] (runs before add; use hideAfter for layers of added instances), fill:[{name,nth?,has?,bg:"token"}],
//                     replace:[{name,nth?,has?,comp,props?,text?}] (not inside instances), set:[{name,nth?,all?,props,text?}] (set props/texts of existing instances), add:[{parent:{name,nth?},comp,props?,text?,x,y,name?}] }] }
import { readFileSync } from "node:fs";
const B = `http://localhost:${process.env.PORT || 8787}`;
const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
async function run() {
const before = JSON.stringify(await (await fetch(B + "/result")).json());
const r = await fetch(B + "/swap", { method: "POST", headers: { "x-clause": "1", "content-type": "application/json" }, body: JSON.stringify(spec) });
if (!r.ok) { console.error(await r.text()); process.exit(1); }
for (let i = 0; i < 1600; i++) {
  await new Promise(s => setTimeout(s, 250));
  const x = await (await fetch(B + "/result")).json();
  if (x && x.name === "_inspect" && JSON.stringify(x) !== before) { if (!x.ok) return { err: x.error }; return { res: x.res }; }
}
return { err: "timed out" };
}
// Figma sometimes drops the first call after an idle spell ("Unable to establish connection"): retry a few times
for (let a = 0; a < 4; a++) { const o = await run(); if (o.res) { console.log(JSON.stringify(o.res, null, 1)); process.exit(0); } if (!/establish connection/.test(o.err || "") || a === 3) { console.error(o.err); process.exit(1); } await new Promise(s => setTimeout(s, 12000)); }
