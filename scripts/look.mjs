#!/usr/bin/env node
// look.mjs — Claude's eyes into WHATEVER Figma file the plugin is open in (no MCP access / file link needed).
//   node scripts/look.mjs pages                    pages of the open file + their top-level children (id, name, size)
//   node scripts/look.mjs tree <nodeId> [depth]    compact outline of a node (default depth 2)
//   node scripts/look.mjs snap <nodeId> [width]    PNG of a node → .clause/snaps/<id>.png (view it with the Read tool)
//   node scripts/look.mjs snaps <nodeId> [width]   PNG of every direct child of a section/frame
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 8787, B = `http://localhost:${PORT}`;
const [cmd, a1, a2] = process.argv.slice(2);
const nid = x => String(x || "").match(/node-id=(\d+)[-:](\d+)/) ? String(x).match(/node-id=(\d+)[-:](\d+)/).slice(1).join(":") : String(x || "").replace("-", ":");
async function job(path, attempt = 0) {
  const before = JSON.stringify(await (await fetch(B + "/result")).json());
  const r = await fetch(B + path, { method: "POST" }); if (!r.ok) throw new Error("server: " + (await r.text()));
  for (let i = 0; i < 160; i++) {
    await new Promise(s => setTimeout(s, 250));
    const x = await (await fetch(B + "/result")).json();
    if (x && x.name === "_inspect" && JSON.stringify(x) !== before) { if (!x.ok) { if (/establish connection/.test(x.error || "") && attempt < 4) { await new Promise(r => setTimeout(r, 8000)); return job(path, attempt + 1); } throw new Error(x.error); } return x.res; }
  }
  throw new Error("timeout — is the Figma plugin open in the file? (⌘⌥P)");
}
const line = (n, d = 0) => "  ".repeat(d) + `${n.n} [${n.t}] ${n.id} ${n.w}×${n.h}` + (n.kids ? ` (${n.kids} children)` : "") + (n.mc ? ` · ${n.mc.setName || n.mc.name}` : "");
function outline(n, d = 0, out = []) { out.push(line(n, d)); for (const k of n.k || []) outline(k, d + 1, out); return out; }
async function snap(id, w) { const r = await job(`/snap/${encodeURIComponent(id)}?w=${w}`); mkdirSync(resolve(root, ".clause/snaps"), { recursive: true }); const f = resolve(root, ".clause/snaps", id.replace(":", "-") + ".png"); writeFileSync(f, Buffer.from(r.snap, "base64")); return { f, name: r.name, w: r.w, h: r.h }; }

if (cmd === "pages") { const r = await job("/pages"); console.log("file:", r.file, "| current page:", r.current); for (const p of r.pages) { console.log(`\n${p.name}  ${p.id}`); for (const c of p.children.slice(0, 25)) console.log("  " + line(c)); if (p.children.length > 25) console.log(`  … +${p.children.length - 25} more`); } }
else if (cmd === "tree") { const r = await job(`/inspect/${encodeURIComponent(nid(a1))}?depth=${Number(a2) || 2}`); console.log(outline(r.inspect).join("\n")); }
else if (cmd === "snap") { const o = await snap(nid(a1), Number(a2) || 1400); console.log(`${o.f}  (${o.name} ${o.w}×${o.h})`); }
else if (cmd === "snaps") { const r = await job(`/inspect/${encodeURIComponent(nid(a1))}?depth=1`); for (const k of (r.inspect.k || []).filter(k => !k.hidden && k.w > 40)) { try { const o = await snap(k.id, Number(a2) || 1200); console.log(`${o.f}  (${o.name} ${o.w}×${o.h})`); } catch (e) { console.log(`skip ${k.id}: ${String(e.message).slice(0, 80)}`); } } }
else console.log("usage: look.mjs pages | tree <id> [depth] | snap <id> [width] | snaps <id> [width]");
