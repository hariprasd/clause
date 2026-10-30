// Clause builder runtime. Runs inside Figma via the loader emitted by scripts/build.mjs.
// Locals provided by loader: figma, SCREEN. Do not edit generated copies in the Figma file — run build.mjs --install.
const { VARS, STYLES, FONTS, COMPS, PAGE_ID, TITLE, WIDTH, HEIGHT, REPLACE, SCREENS, POS, AT } = SCREEN;
const page = SCREEN.INSPECT || SCREEN.SNAP || SCREEN.PAGES ? figma.currentPage : PAGE_ID ? await figma.getNodeByIdAsync(PAGE_ID) : figma.currentPage; if (page.id !== figma.currentPage.id) await page.loadAsync(); // never switch the user's page
const C = (typeof CACHE !== "undefined" && CACHE) || {};
const vcache = C.v || (C.v = {}), scache = C.s || (C.s = {}), SETS = C.sets || (C.sets = {});
function V(name) { return vcache[name] || (vcache[name] = figma.variables.importVariableByKeyAsync(VARS[name])); }
function S(name) { return scache[name] || (scache[name] = figma.importStyleByKeyAsync(STYLES[name])); }
const FL = C.f || (C.f = {});
function lf(f) { const k = f.family + "|" + f.style; return FL[k] || (FL[k] = figma.loadFontAsync(f)); }
async function loadNodeFonts(t) { const fn = t.fontName; if (fn !== figma.mixed) { await lf(fn); return; } for (const seg of t.getStyledTextSegments(["fontName"])) await lf(seg.fontName); }
const created = [], warnings = [];
// preload every font the screen's text styles use (parallel) so text nodes never wait one by one
await Promise.all(Object.values(FONTS || {}).map(f => lf({ family: f[0], style: f[1] }).catch(() => lf({ family: f[0], style: f[1].replace(/([a-z])([A-Z])/g, "$1 $2") }).catch(() => null))));
// ---- inspect mode: SCREEN.INSPECT = node id -> structure/spec JSON (used by scripts/inspect.mjs) ----
async function inspectNode(id, maxDepth) {
  const root = await figma.getNodeByIdAsync(id); if (!root) throw new Error("node not found " + id);
  const vn = {}; const varName = async (b) => { if (!b) return null; const a = Array.isArray(b) ? b[0] : b; if (!a || !a.id) return null; if (!(a.id in vn)) { try { vn[a.id] = (await figma.variables.getVariableByIdAsync(a.id)).name.split("/").pop(); } catch { vn[a.id] = null; } } return vn[a.id]; };
  let count = 0;
  async function walk(n, depth) {
    if (++count > 1500) return null;
    const o = { id: n.id, n: n.name, t: n.type, w: Math.round(n.width), h: Math.round(n.height) };
    if (depth === 0) { o.x = Math.round(n.x); o.y = Math.round(n.y); const path = []; let q = n.parent; while (q && q.type !== "DOCUMENT") { path.unshift(q.type === "PAGE" ? "page: " + q.name : q.name); if (q.type === "PAGE") { o.pageId = q.id; break; } q = q.parent; } o.path = path; }
    if (n.visible === false) { o.hidden = true; return o; }
    const bv = n.boundVariables || {};
    if ("layoutMode" in n && n.layoutMode !== "NONE") { o.lm = n.layoutMode; o.g = n.itemSpacing; o.pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft]; o.pa = n.primaryAxisAlignItems; o.ca = n.counterAxisAlignItems; if (n.layoutWrap === "WRAP") o.wrap = true; }
    if ("layoutSizingHorizontal" in n) { o.sh = n.layoutSizingHorizontal; o.sv = n.layoutSizingVertical; }
    if (n.type === "FRAME" || n.type === "RECTANGLE") { if (n.cornerRadius && n.cornerRadius !== figma.mixed) o.r = n.cornerRadius; const f = await varName(bv.fills && bv.fills); const fl = n.fills && n.fills !== figma.mixed && n.fills[0]; if (fl && fl.visible !== false) o.fill = f || (fl.type === "SOLID" ? "raw" : fl.type); const sk = n.strokes && n.strokes[0]; if (sk) { o.stroke = (await varName(bv.strokes && bv.strokes)) || "raw"; if (n.dashPattern && n.dashPattern.length) o.dash = true; o.sw = n.strokeTopWeight; } }
    if ("explicitVariableModes" in n && n.explicitVariableModes && Object.keys(n.explicitVariableModes).length) { o.modes = []; for (const [cid, mid] of Object.entries(n.explicitVariableModes)) { try { const col = await figma.variables.getVariableCollectionByIdAsync(cid); o.modes.push({ col: col && col.name, mode: col && (col.modes.find(m => m.modeId === mid) || {}).name, modes: col && col.modes.map(m => m.name) }); } catch (e) { o.modes.push({ cid, mid }); } } }
    if (n.type === "TEXT") { o.fs = n.fontSize === figma.mixed ? "mixed" : n.fontSize; o.ff = n.fontName === figma.mixed ? "mixed" : n.fontName.family + " " + n.fontName.style; o.c = n.characters.slice(0, 120); try { const sid = n.textStyleId; if (sid && sid !== figma.mixed) { const st = await figma.getStyleByIdAsync(sid); o.style = st.name; o.styleKey = st.key; o.styleRemote = st.remote; } } catch {} o.color = await varName(bv.fills && bv.fills); if (n.textTruncation === "ENDING") o.maxLines = n.maxLines; return o; }
    if (n.type === "INSTANCE") {
      const mc = await n.getMainComponentAsync(); const set = mc && mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent : null;
      o.mc = mc && { id: mc.id, key: mc.key, name: mc.name, remote: mc.remote, setKey: set && set.key, setName: set && set.name, setId: set && set.id };
      o.props = {}; for (const [k, v] of Object.entries(n.componentProperties)) o.props[k.split("#")[0]] = v.value;
      o.texts = n.findAll(t => t.type === "TEXT" && vis(t, n)).slice(0, 12).map(t => t.characters.slice(0, 80));
      if (!(maxDepth >= 9)) return o; // depth >= 9 also expands inside instances (to find layer names for ops)
    }
    if (depth >= (maxDepth || 14) || !n.children) { if (n.children && maxDepth) o.kids = n.children.length; return o; }
    o.k = []; for (const c of n.children) { const w = await walk(c, depth + 1); if (w) o.k.push(w); }
    return o;
  }
  return { inspect: await walk(root, 0), roots: [], created: 0, warnings: [], ms: 0 };
}
if (SCREEN.SELECTION) { const out = figma.currentPage.selection.slice(0, 12).map(n => { const path = []; let q = n.parent; while (q && q.type !== "PAGE") { path.unshift(q.name); q = q.parent; } const o = { id: n.id, n: n.name, t: n.type, w: Math.round(n.width), h: Math.round(n.height), path: path.slice(-4).join(" › ") }; if (n.type === "INSTANCE") { try { o.main = n.mainComponent && n.mainComponent.name; } catch (e) {} } return o; }); return { selection: out, page: figma.currentPage.name, roots: [], warnings: [] }; }
if (SCREEN.INSPECT && !SCREEN.VARIANT && !SCREEN.SWAP && !SCREEN.MOBILIZE && SCREEN.REMOVE) { const n = await figma.getNodeByIdAsync(SCREEN.INSPECT); if (!n || !(n.getPluginData("clause:root") || /Mobile \(360\)|^TEST mobile|^NEW STATES/.test(n.name))) throw new Error("refusing: not a Clause-built frame"); n.remove(); return { removed: SCREEN.INSPECT, roots: [], warnings: [] }; }
if (SCREEN.INSPECT && !SCREEN.VARIANT && !SCREEN.SWAP && !SCREEN.MOBILIZE) return await inspectNode(SCREEN.INSPECT, SCREEN.INSPECT_DEPTH);
// ---- snapshot mode: PNG of any node of the open file (scripts/snap.mjs) — lets Claude SEE frames without MCP access to the file
if (SCREEN.SNAP) {
  const n = await figma.getNodeByIdAsync(SCREEN.SNAP.id); if (!n || !("exportAsync" in n)) throw new Error("cannot snapshot " + SCREEN.SNAP.id);
  const bytes = await n.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: Math.max(200, Math.min(3000, SCREEN.SNAP.w || 1400)) } });
  return { snap: figma.base64Encode(bytes), name: n.name, w: Math.round(n.width), h: Math.round(n.height), roots: [], created: 0, warnings: [], ms: 0 };
}
// ---- file overview: pages (+ top-level children) of the open file
if (SCREEN.PAGES) {
  const out = [];
  try { await figma.loadAllPagesAsync(); } catch (e) {} // dynamic-page mode: root.children is only readable once pages are loaded
  for (const pg of figma.root.children) { try { await pg.loadAsync(); } catch (e) {} out.push({ id: pg.id, name: pg.name, children: pg.children.slice(0, 60).map(c => ({ id: c.id, n: c.name, t: c.type, w: Math.round(c.width), h: Math.round(c.height), kids: "children" in c ? c.children.length : 0 })) }); }
  return { pages: out, file: figma.root.name, fileKey: figma.fileKey || null, current: figma.currentPage.id, roots: [], created: 0, warnings: [], ms: 0 };
}

await Promise.all([...Object.keys(VARS).map(V), ...Object.keys(STYLES).map(S)]);
const TM = {};
async function tm(k, p) { const t = Date.now(); try { return await p; } finally { TM[k] = (TM[k] || 0) + (Date.now() - t); } }

function parseVariant(s) { const o = {}; for (const kv of (s || "").split(",")) { const [k, v] = kv.split("="); if (k && v) o[k.trim()] = v.trim(); } return o; }

// ---- donors: main components reachable through instances already in the open file (works when the library is gone)
async function donorIndex() {
  if (!C.donors) C.donors = { map: new Map(), list: page.findAllWithCriteria({ types: ["INSTANCE"] }), pos: 0, seen: new Set() };
  return C.donors;
}
// incremental scan of the target page's instances until the wanted component is found (cached across screens in this session)
async function donorFor(spec) {
  const D = await donorIndex(), want = () => (spec.setKey && D.map.get("s:" + spec.setKey)) || D.map.get("c:" + spec.key) || (spec.alt && ((spec.alt.setKey && D.map.get("s:" + spec.alt.setKey)) || D.map.get("c:" + spec.alt.key))) || null;
  let hit = want();
  while (!hit && D.pos < D.list.length && D.pos < 30000) {
    const inst = D.list[D.pos++]; let mc; try { mc = await inst.getMainComponentAsync(); } catch (e) { continue; } if (!mc || D.seen.has(mc.id)) continue; D.seen.add(mc.id);
    const set = mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent : null, entry = { comp: mc, set };
    if (set && !D.map.has("s:" + set.key)) D.map.set("s:" + set.key, entry); if (!D.map.has("c:" + mc.key)) D.map.set("c:" + mc.key, entry);
    hit = want();
  }
  return hit;
}
async function component(key, props) {
  const spec = COMPS[key];
  let node;
  if (spec.lib) {
    // import by key; if the library is no longer published/enabled in this file, borrow the main component of an instance already on the page
    try {
      if (!spec.setKey) return SETS["k" + spec.key] || (SETS["k" + spec.key] = await figma.importComponentByKeyAsync(spec.key));
      node = SETS[spec.setKey] || (SETS[spec.setKey] = await figma.importComponentSetByKeyAsync(spec.setKey));
    } catch (e) {
      if (spec.alt) { try { if (!spec.alt.setKey) return (SETS["k" + spec.key] = await figma.importComponentByKeyAsync(spec.alt.key)); node = SETS[spec.alt.setKey] || (SETS[spec.alt.setKey] = await figma.importComponentSetByKeyAsync(spec.alt.setKey)); } catch (e2) { node = null; } }
      if (!node) {
      const d = await donorFor(spec); if (!d) { e.message += " [no donor instance found on the target page; scanned " + ((C.donors && C.donors.pos) || 0) + " instances]"; throw e; }
      warnings.push("imported " + key + " from an existing instance (library not available by key)");
      if (!spec.setKey) return (SETS["k" + spec.key] = d.comp);
      node = SETS[spec.setKey || spec.key] = d.set || d.comp; }
    }
  } else {
    node = await figma.getNodeByIdAsync(spec.id);
    if (!node) throw new Error("component node missing: " + key + " " + spec.id);
  }
  if (node.type !== "COMPONENT_SET") return node;
  const want = Object.assign(parseVariant(spec.def), props || {});
  const defs = node.componentPropertyDefinitions;
  const axes = Object.keys(defs).filter(k => defs[k].type === "VARIANT");
  const match = node.children.find(ch => { const pv = parseVariant(ch.name); return axes.every(a => !(a in want) || pv[a] === String(want[a])); });
  if (!match) { const dv = parseVariant(spec.def); const off = axes.filter(a => props && a in props && String(props[a]) !== dv[a]); if (off.length) warnings.push("variant not matched for " + key + ": want " + JSON.stringify(Object.fromEntries(off.map(a => [a, props[a]]))) + " -> using default variant"); }
  return match || node.defaultVariant;
}
async function setBoolProps(inst, props) {
  if (!props) return;
  let defs; try { defs = inst.componentProperties; } catch { return; }
  const out = {};
  const norm = s => s.replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase();
  for (const [k, v] of Object.entries(props)) {
    const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k));
    if (!full) continue;
    if (defs[full].type === "BOOLEAN") out[full] = (v === true || v === "true");
    else if (defs[full].type === "TEXT") out[full] = String(v);
    else if (defs[full].type === "INSTANCE_SWAP" && typeof v === "string" && v.startsWith("@")) out[full] = (await component(v.slice(1))).id;
  }
  if (Object.keys(out).length) {
    try { inst.setProperties(out); } catch (e) { warnings.push("setProperties " + inst.name + ": " + e.message); }
    try { const now = inst.componentProperties; for (const [k, v] of Object.entries(out)) { const got = now[k] && now[k].value; if (now[k] && now[k].type !== "INSTANCE_SWAP" && got !== v) warnings.push("prop not applied " + inst.name + " " + k.split("#")[0] + ": wanted " + v + " got " + got); } } catch (e) {}
  }
}
async function tintNode(inst, name) {
  const v = await V(name);
  const paint = figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", v);
  const VEC = ["VECTOR", "BOOLEAN_OPERATION", "LINE", "ELLIPSE", "STAR", "POLYGON", "RECTANGLE"];
  for (const k of inst.findAll(x => VEC.includes(x.type))) {
    if (k.strokes && k.strokes.some(s => s.visible !== false && s.type === "SOLID")) k.strokes = [paint];
    if (k.fills && k.fills !== figma.mixed && k.fills.some(s => s.visible !== false && s.type === "SOLID")) k.fills = [paint];
  }
}

// ---- per-instance layer index: one findAll per instance instead of one per op (ops/texts were the slowest part of a build)
const IDX = new WeakMap();
function idx(inst) { let x = IDX.get(inst); if (!x) { const all = inst.findAll(() => true); const byName = new Map(); for (const n of all) { const a = byName.get(n.name); if (a) a.push(n); else byName.set(n.name, [n]); } x = { all, byName, texts: all.filter(n => n.type === "TEXT") }; IDX.set(inst, x); } return x; }
const dropIdx = inst => IDX.delete(inst);
function inInst(inst, id) { return idx(inst).all.find(n => n.id === id || n.id.endsWith(";" + id)) || null; }
async function applyOps(inst, ops) {
  for (const op of ops || []) {
    for (const sp of op.nodes || []) {
      let hit, htx = null;
      if (sp.has) { const tx = idx(inst).texts.filter(n => n.characters.includes(sp.has) && n.absoluteRenderBounds !== null)[sp.nth || 0]; if (tx) { htx = tx; hit = tx; let up = tx.parent; while (up && up !== inst) { if (up.type === "INSTANCE" && (!sp.name || up.name === sp.name)) { hit = up; break; } up = up.parent; } } }
      else hit = (idx(inst).byName.get(sp.name) || []).filter(n => !sp.vis || n.absoluteRenderBounds !== null)[sp.nth || 0];
      if (!hit) { warnings.push("nodes: no #" + (sp.nth || 0) + " " + (sp.name || ("has:" + sp.has))); continue; }
      if (sp.hide) hit.visible = false; if (sp.show) hit.visible = true;
      if (sp.swap) { const comp = await component(sp.swap.slice(1)); try { hit.swapComponent(comp); dropIdx(inst); } catch (e) { warnings.push("nodes swap " + sp.name + ": " + e.message); } }
      if (sp.text != null) { try { const tn = htx || (hit.type === "TEXT" ? hit : hit.findOne(n => n.type === "TEXT")); if (!tn) warnings.push("nodes text: no text layer in " + (sp.name || sp.has)); else { for (const g of tn.getStyledTextSegments(["fontName"])) await figma.loadFontAsync(g.fontName); tn.characters = String(sp.text); } } catch (e) { warnings.push("nodes text " + (sp.name || sp.has) + ": " + e.message); } }
      if (sp.props) { const tgt = hit.type === "INSTANCE" ? hit : hit.findOne(n => n.type === "INSTANCE"); try { const defs = tgt.componentProperties, out = {}; const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); for (const [k, v] of Object.entries(sp.props)) { const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k)) || k; const def = defs[full]; out[full] = def && def.type === "BOOLEAN" ? (v === true || v === "true") : def && def.type === "INSTANCE_SWAP" && typeof v === "string" && v.startsWith("@") ? (await component(v.slice(1))).id : v; } tgt.setProperties(out); dropIdx(inst); } catch (e) { warnings.push("nodes props " + (sp.name || "has:" + sp.has) + ": " + e.message); } }
      if (sp.maxLines) { const t = hit.type === "TEXT" ? hit : hit.findOne(n => n.type === "TEXT"); if (t) { t.textAutoResize = "HEIGHT"; try { if (t.parent.layoutMode) t.parent.layoutSizingHorizontal = "FILL"; t.layoutSizingHorizontal = "FILL"; } catch (e) { warnings.push("maxLines fill: " + e.message); } t.textTruncation = "ENDING"; t.maxLines = sp.maxLines; } }
      if (sp.style || sp.color) { const t = hit.type === "TEXT" ? hit : hit.findOne(n => n.type === "TEXT"); if (!t) warnings.push("nodes: no text in " + sp.name); else {
        if (sp.style) { const font = FONTS[sp.style]; if (font) for (const st of [font[1], font[1].replace(/([a-z])([A-Z])/g, "$1 $2"), "Regular"]) { try { await lf({ family: font[0], style: st }); break; } catch {} } try { await t.setTextStyleIdAsync((await S(sp.style)).id); } catch (e) { warnings.push("nodes style " + sp.style + ": " + e.message); } }
        if (sp.color) await bindFill(t, sp.color, "fill"); } }
      if (sp.align) { const t = hit.type === "TEXT" ? hit : hit.findOne(n => n.type === "TEXT"); if (t) { await loadNodeFonts(t); t.textAlignHorizontal = String(sp.align).toUpperCase(); try { if (t.parent && t.parent.layoutMode) { t.parent.layoutSizingHorizontal = "FILL"; t.parent.primaryAxisAlignItems = sp.align === "right" ? "MAX" : sp.align === "center" ? "CENTER" : "MIN"; } t.layoutSizingHorizontal = "FILL"; } catch (e) {} } }
      if (sp.tint) await tintNode(hit, sp.tint);
      if (sp.padx != null && "paddingLeft" in hit) { await bindNum(hit, "paddingLeft", sp.padx); await bindNum(hit, "paddingRight", sp.padx); } // horizontal padding override on a layer inside an instance
      if (sp.gap != null && "itemSpacing" in hit) await bindNum(hit, "itemSpacing", sp.gap); // layout tweaks on a layer inside an instance
      if (sp.cross && "counterAxisAlignItems" in hit) hit.counterAxisAlignItems = ({ start: "MIN", center: "CENTER", end: "MAX" })[sp.cross] || "MIN";
      if (sp.icon) { const ic = hit.findOne(n => n.type === "INSTANCE"); const comp = await component(sp.icon.slice(1)); if (ic) { ic.swapComponent(comp); dropIdx(inst); } else warnings.push("nodes: no icon inside " + sp.name); }
    }
    for (const nm of op.hideNames || []) for (const t of (idx(inst).byName.get(nm) || [])) t.visible = false;
    for (const id of op.hide || []) { const t = inInst(inst, id); if (t) t.visible = false; else warnings.push("hide: not found " + id); }
    if (op.icons) {
      const mains = {};
      for (const [, src] of op.icons) { const c = inInst(inst, src); const ic = c && c.findOne(n => n.type === "INSTANCE"); mains[src] = ic ? await ic.getMainComponentAsync() : null; }
      for (const [tgt, src] of op.icons) { const c = inInst(inst, tgt); const ic = c && c.findOne(n => n.type === "INSTANCE"); if (ic && mains[src]) { ic.swapComponent(mains[src]); dropIdx(inst); } else warnings.push("icons: " + tgt + " <- " + src); }
    }
    for (const [id, props] of op.set || []) { const t = inInst(inst, id); try { t.setProperties(props); dropIdx(inst); } catch (e) { warnings.push("set " + id + ": " + e.message); } }
  }
}
function vis(n, root) { for (let p = n; p && p !== root.parent; p = p.parent) if (p.visible === false) return false; return true; }
async function setTexts(inst, text) {
  if (!text) return;
  dropIdx(inst); const nodes = idx(inst).texts.filter(t => { try { return vis(t, inst); } catch (e) { return false; } });
  if (Array.isArray(text)) {
    for (let i = 0; i < text.length && i < nodes.length; i++) { if (text[i] == null) continue; await loadNodeFonts(nodes[i]); nodes[i].characters = String(text[i]); }
  } else {
    for (const [needle, val] of Object.entries(text)) {
      const t = nodes.find(n => n.characters.includes(needle));
      if (!t) { warnings.push("text not found in " + inst.name + ": " + needle); continue; }
      await loadNodeFonts(t); t.characters = String(val);
    }
  }
}
// a colour is either a variable name from the catalog or a raw hex value (general design, no catalog)
function hexPaint(name) { const s = String(name).replace(/^#/, ""); const f = s.length <= 4 ? s.split("").map(c => c + c).join("") : s; const n = i => parseInt(f.slice(i, i + 2), 16) / 255; return { type: "SOLID", color: { r: n(0), g: n(2), b: n(4) }, opacity: f.length >= 8 ? n(6) : 1 }; }
async function bindFill(node, name, kind) {
  let paint;
  if (typeof name === "string" && /^#[0-9a-fA-F]{3,8}$/.test(name)) paint = hexPaint(name);
  else { const v = await V(name); paint = figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", v); }
  if (kind === "stroke") { node.strokes = [paint]; node.strokeWeight = 1; node.strokeAlign = "INSIDE"; } else node.fills = [paint];
}
async function bindNum(node, field, name) {
  if (name == null) return;
  if (typeof name === "number") { node[field] = name; return; }
  node.setBoundVariable(field, await V(name));
}
async function applyBox(f, n) {
  f.name = n.i || n.t;
  f.layoutMode = (n.t === "row" || n.dir === "row") ? "HORIZONTAL" : "VERTICAL";
  f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO";
  f.fills = []; f.clipsContent = !!n.clip;
  if (n.imgB64) { try { const bin = atob(n.imgB64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); f.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: figma.createImage(u8).hash }]; } catch (e) { warnings.push("image " + (n.i || "") + ": " + e.message); } }
  await bindNum(f, "itemSpacing", n.gap);
  if (n.wrap) { f.layoutWrap = "WRAP"; await bindNum(f, "counterAxisSpacing", n.rowGap); }
  const pad = { pt: n.pt ?? n.py ?? n.pad, pb: n.pb ?? n.py ?? n.pad, pl: n.pl ?? n.px ?? n.pad, pr: n.pr ?? n.px ?? n.pad };
  await bindNum(f, "paddingTop", pad.pt); await bindNum(f, "paddingBottom", pad.pb); await bindNum(f, "paddingLeft", pad.pl); await bindNum(f, "paddingRight", pad.pr);
  if (n.radius != null) for (const c of ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]) await bindNum(f, c, n.radius);
  if (n.bg && n.bg !== "none") await bindFill(f, n.bg, "fill");
  if (n.border && n.border !== "none") await bindFill(f, n.border, "stroke");
  if (n.borderB) { await bindFill(f, n.borderB, "stroke"); f.strokeTopWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0; f.strokeBottomWeight = 1; }
  if (n.borderT) { await bindFill(f, n.borderT, "stroke"); f.strokeLeftWeight = 0; f.strokeBottomWeight = 0; f.strokeRightWeight = 0; f.strokeTopWeight = 1; }
  if (n.borderR) { await bindFill(f, n.borderR, "stroke"); f.strokeLeftWeight = 0; f.strokeBottomWeight = 0; f.strokeTopWeight = 0; f.strokeRightWeight = 1; }
  if (n.opacity != null) f.opacity = n.opacity;
  if (n.bgBlur) f.effects = [{ type: "BACKGROUND_BLUR", radius: n.bgBlur, visible: true }];
  if (n.borderL) { await bindFill(f, n.borderL, "stroke"); f.strokeTopWeight = 0; f.strokeBottomWeight = 0; f.strokeRightWeight = 0; f.strokeLeftWeight = 1; }
  if (n.dash) f.dashPattern = [4, 4];
  const A = { start: "MIN", center: "CENTER", end: "MAX", between: "SPACE_BETWEEN" };
  if (n.justify) f.primaryAxisAlignItems = A[n.justify] || "MIN";
  if (n.align) f.counterAxisAlignItems = A[n.align] === "SPACE_BETWEEN" ? "MIN" : (A[n.align] || "MIN");
}
function size(node, n, parent) {
  // after append: FILL/HUG legal. w/h fixed; fill:"x"|"y"|"both"; grow = fill along parent's main axis
  if (n.bg === "none" && "fills" in node) node.fills = [];
  if (n.w != null || n.h != null) {
    const uniform = node.type === "INSTANCE" && n.w && n.h && Math.abs(n.w / n.h - node.width / node.height) < 0.02;
    let done = false;
    if (uniform) { try { node.rescale(n.w / node.width); done = true; } catch (e) {} }
    if (!done) node.resize(n.w ?? node.width, n.h ?? node.height);
  }
  const horiz = parent && parent.layoutMode === "HORIZONTAL";
  const fx = n.fill === "x" || n.fill === "both" || (n.grow && horiz);
  const fy = n.fill === "y" || n.fill === "both" || (n.grow && !horiz);
  if (fx) { if (node.type !== "TEXT") node.resize(100, node.height); node.layoutSizingHorizontal = "FILL"; } else if (n.w == null && node.type === "FRAME" && node.layoutMode) node.layoutSizingHorizontal = "HUG";
  if (fy) node.layoutSizingVertical = "FILL"; else if (n.h == null && node.type === "FRAME" && node.layoutMode) node.layoutSizingVertical = "HUG";
}
async function buildText(n, parent) {
    let node = figma.createText(); node.name = n.i || "text";
    const st = n.style || "Text md/Regular";
    const styled = !!STYLES[st];
    const font = FONTS[st];
    let loaded = null;
    if (font) for (const style of [font[1], font[1].replace(/([a-z])([A-Z])/g, "$1 $2"), "Regular"]) {
      try { await lf({ family: font[0], style }); loaded = { family: font[0], style }; break; } catch {}
    }
    if (!loaded) { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); loaded = { family: "Inter", style: "Regular" }; if (styled) warnings.push("font fallback for " + st); }
    node.fontName = loaded;
    parent.appendChild(node);
    const runs = n.runs || null;
    node.characters = runs ? runs.map(x => x.x).join("") : String(n.content);
    if (styled) try { await node.setTextStyleIdAsync((await S(st)).id); } catch (e) { warnings.push("style " + st + ": " + e.message); }
    if (n.size) { node.fontSize = n.size; if (n.lh) node.lineHeight = { unit: "PIXELS", value: n.lh }; }
    if (n.tracking != null) node.letterSpacing = { unit: "PERCENT", value: n.tracking };
    if (runs) {
      const fam = (font && font[0]) || "Inter"; let pos = 0;
      for (const run of runs) {
        const a = pos, b = pos + run.x.length; pos = b;
        if (!run.b && !run.i && !run.code) continue;
        const cands = run.code ? [["Roboto Mono", "Regular"], [fam, "Regular"]] : run.i ? [[fam, "Italic"], [fam, "Light Italic"]] : [[fam, "SemiBold"], [fam, "Semi Bold"], [fam, "Bold"]];
        let ok = false;
        for (const [ff, fs] of cands) { try { await lf({ family: ff, style: fs }); node.setRangeFontName(a, b, { family: ff, style: fs }); ok = true; break; } catch {} }
        if (run.code && typeof node.fontSize === "number") node.setRangeFontSize(a, b, Math.round(node.fontSize * 0.86));
        if (!ok) warnings.push("run font unavailable: " + JSON.stringify(cands[0]));
      }
    }
    if (n.color) await bindFill(node, n.color, "fill");
    if (n.w != null) { node.textAutoResize = "HEIGHT"; node.resize(n.w, node.height); }
    else if (n.fill === "x" || n.grow) { node.textAutoResize = "HEIGHT"; }
    if (n.align === "center") node.textAlignHorizontal = "CENTER";
    if (n.maxLines) { node.textTruncation = "ENDING"; node.maxLines = n.maxLines; }
  return node;
}
async function build(n, parent) {
  const T_B = Date.now(); try { return await build0(n, parent); } finally { TM.build = (TM.build || 0) + (Date.now() - T_B); }
}

// ---- variant job: clone existing frames and vary them (texts / hide / replace / add / fill), grouped in a new Section ----
async function variantJob(spec) { let sec0 = null; try { return await variantJob0(spec, s => { sec0 = s; }); } catch (e) { warnings.push("variant step failed: " + String((e && e.message) || e).slice(0, 400)); if (sec0) { try { sec0.remove(); } catch (x) {} } return { failed: true, roots: [], warnings }; } }
async function variantJob0(spec, setSec) {
  const find = (root, q) => { const hits = root.findAll(n => (q.name == null || n.name === q.name) && (q.type == null || n.type === q.type) && (q.has == null || (n.findOne && n.findOne(t => t.type === "TEXT" && t.characters.includes(q.has))) || (n.type === "TEXT" && n.characters.includes(q.has)))); return q.all ? hits : hits[q.nth || 0] ? [hits[q.nth || 0]] : []; };
  const setChars = async (t, str) => { const segs = t.getStyledTextSegments(["fontName"]); for (const g of segs) await figma.loadFontAsync(g.fontName); t.characters = str; };
  const anchor = await figma.getNodeByIdAsync(spec.anchor); if (!anchor) throw new Error("anchor not found " + spec.anchor);
  const host = anchor.type === "SECTION" ? anchor : anchor.parent; const pg = host.type === "SECTION" ? host.parent : host;
  for (const old of pg.children.filter(n => n.type === "SECTION" && n.name === spec.section)) old.remove(); // idempotent: re-running replaces the previous result
  const sec = figma.createSection(); setSec(sec); sec.name = spec.section; pg.appendChild(sec);
  sec.x = host.type === "SECTION" ? host.x : anchor.x; sec.y = (host.type === "SECTION" ? host.y + host.height : anchor.y + anchor.height) + 300;
  const res = { section: sec.id, frames: [], roots: [] }; let x = 80, maxH = 0, step = "";
  for (const v of spec.variants) {
    step = "clone"; const src = await figma.getNodeByIdAsync(v.from); if (!src) { warnings.push("variant source missing " + v.from); continue; }
    const c = src.clone(); sec.appendChild(c); c.name = v.name; c.x = x; c.y = 160; x += c.width + 120; maxH = Math.max(maxH, c.height);
    step = "texts"; for (const [f, r, nth] of v.texts || []) { const ex = f[0] === "=", ff = ex ? f.slice(1) : f; const hit = c.findAll(n => n.type === "TEXT" && (ex ? n.characters === ff : n.characters.includes(ff)) && (function vv(x) { while (x && x !== c) { if (x.visible === false) return false; x = x.parent; } return true; })(n))[nth || 0]; if (!hit) { warnings.push(v.name + ": text not found: " + f); continue; } await setChars(hit, ex ? r : (hit.characters.replace(ff, r).length ? hit.characters.replace(ff, r) : r)); }
    step = "hide"; for (const q of v.hide || []) { const hs = find(c, q); if (!hs.length) warnings.push(v.name + ": hide target not found " + JSON.stringify(q)); hs.forEach(h => h.visible = false); }
    step = "fill"; for (const q of v.fill || []) { const hs = find(c, q); if (!hs.length) { warnings.push(v.name + ": fill target not found " + JSON.stringify(q)); continue; } const paint = figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", await V(q.bg)); hs.forEach(h => { h.fills = [paint]; }); }
    for (const q of v.replace || []) { const hs = find(c, q); if (!hs.length) { warnings.push(v.name + ": replace target not found " + JSON.stringify(q)); continue; } for (const h of hs) { const comp = await component(q.comp, q.props); const inst = comp.createInstance(); const p = h.parent, i = p.children.indexOf(h); p.insertChild(i, inst); h.remove(); if (q.text) await setTexts(inst, q.text); } }
    step = "set"; for (const q of v.set || []) { let hs; if (q.near) { const t0 = c.findAll(n => n.type === "TEXT" && n.characters.includes(q.near))[q.nearNth || 0]; hs = []; let a = t0 && t0.parent; while (a && a !== c) { const f = a.findOne(n => n.name === q.name && n.type === "INSTANCE"); if (f) { hs = [f]; break; } a = a.parent; } } else hs = find(c, q); if (!hs.length) { warnings.push(v.name + ": set target not found " + JSON.stringify(q)); continue; } const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); for (const h of hs) { const inst = h.type === "INSTANCE" ? h : h.findOne(n => n.type === "INSTANCE"); if (!inst) continue; try { const defs = inst.componentProperties, out = {}; for (const [k, val] of Object.entries(q.props || {})) { const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k)) || k; const d0 = defs[full]; out[full] = d0 && d0.type === "BOOLEAN" ? (val === true || val === "true") : d0 && d0.type === "INSTANCE_SWAP" && typeof val === "string" && val.startsWith("@") ? (await component(val.slice(1))).id : val; } inst.setProperties(out); if (q.text) await setTexts(inst, q.text); (res.log = res.log || []).push({ v: v.name.slice(0, 12), want: q.props, got: Object.fromEntries(Object.entries(inst.componentProperties).map(([k, x]) => [k.split("#")[0], x.value])) }); } catch (e) { warnings.push(v.name + ": set " + q.name + ": " + e.message); } } }
    step = "add"; for (const q of v.add || []) { try { const ps = find(c, q.parent || {}); if (!ps.length) { warnings.push(v.name + ": add parent not found " + JSON.stringify(q.parent)); continue; } const comp = await component(q.comp, q.props); const inst = comp.createInstance(); ps[0].appendChild(inst); if (ps[0].layoutMode && ps[0].layoutMode !== "NONE") inst.layoutPositioning = "ABSOLUTE"; inst.x = q.x || 0; inst.y = q.y || 0; if (q.name) inst.name = q.name; if (q.text) await setTexts(inst, q.text); } catch (e) { warnings.push(v.name + ": add " + (q.name || q.comp) + " failed: " + String((e && e.message) || e).slice(0, 200)); } }
    step = "textsAfter"; for (const [f, r, nth] of v.textsAfter || []) { const ex = f[0] === "=", ff = ex ? f.slice(1) : f; const hit = c.findAll(n => n.type === "TEXT" && (ex ? n.characters === ff : n.characters.includes(ff)) && (function vv(x) { while (x && x !== c) { if (x.visible === false) return false; x = x.parent; } return true; })(n))[nth || 0]; if (!hit) { warnings.push(v.name + ": text not found: " + f); continue; } await setChars(hit, ex ? r : (hit.characters.replace(ff, r).length ? hit.characters.replace(ff, r) : r)); }
    step = "hideAfter"; for (const q of v.hideAfter || []) { const hs = find(c, q); if (!hs.length) warnings.push(v.name + ": hideAfter target not found " + JSON.stringify(q)); hs.forEach(h => h.visible = false); }
    res.frames.push({ id: c.id, name: c.name });
  }
  sec.resizeWithoutConstraints(x - 120 + 80, maxH + 240); res.warnings = warnings;
  return res;
}
if (SCREEN.VARIANT && SCREEN.VARIANT.debug) return { dbg: Object.keys(SCREEN.VARIANT), n: (SCREEN.VARIANT.variants || []).length, roots: [], warnings: [] };
if (SCREEN.VARIANT) return await variantJob(SCREEN.VARIANT); // after helpers (setTexts, component) are initialised

// ---- swap job: replace nodes in place with instances of library components imported by raw key (e.g. company logos) ----
// ---- edit guard: a frame this tool built carries a fingerprint of how it looked at build time (plugin data "clause-sig").
// Before anything destructive, compare: if the designer changed it since, it is THEIR version now and must not be overwritten.
function sigOf(n, d = 0) { try { const o = [n.name, n.type, Math.round(n.width), Math.round(n.height), n.visible === false ? 0 : 1]; if (n.type === "TEXT") o.push(n.characters.slice(0, 40)); if ("children" in n && d < 3) o.push(n.children.slice(0, 60).map(c => sigOf(c, d + 1))); return o; } catch (e) { return null; } }
function stamp(n) { try { n.setPluginData("clause-sig", JSON.stringify(sigOf(n))); n.setPluginData("clause-built", new Date().toISOString()); } catch (e) {} }
function editedSince(n) { try { const s0 = n.getPluginData("clause-sig"); if (!s0) return false; return s0 !== JSON.stringify(sigOf(n)); } catch (e) { return false; } }
// ---- reversible changes: removals go to a hidden trash frame instead of being deleted; property writes are recorded with their old value.
// {revertLast:true} puts it all back (trashed nodes restored, replacements removed, properties reset), refusing pieces the designer edited since.
function curJob() { return CACHE.cur || null; }
function trashOf(n) { let p = n; while (p && p.type !== "PAGE") p = p.parent; if (!p) return null; let t = p.children.find(c => c.name === "_clause-trash"); if (!t) { t = figma.createFrame(); t.name = "_clause-trash"; t.visible = false; t.x = -20000; t.y = -20000; t.resize(10, 10); p.appendChild(t); } return t; }
function discard(n) { const r = curJob(); try { const par = n.parent; if (r && par && par.type !== "PAGE" || (r && par && par.type === "PAGE")) { const rec = { id: n.id, pid: par.id, idx: par.children.indexOf(n) }; const tr = trashOf(n); if (tr && par.type !== "INSTANCE") { try { tr.appendChild(n); } catch (e) { n.visible = false; rec.hide = true; } } else { n.visible = false; rec.hide = true; } try { n.visible = false; } catch (e) {} r.trashed.push(rec); return; } } catch (e) {} try { n.remove(); } catch (e) {} }
function setP(n, k, v) { const r = curJob(); try { if (r) r.props.push({ id: n.id, k, old: n[k] }); } catch (e) {} n[k] = v; }
function recSize(n) { const r = curJob(); try { if (r) r.sizes.push({ id: n.id, w: n.width, h: n.height }); } catch (e) {} }
async function swapJobInner(spec) {
  const out = { swapped: [], roots: [], warnings, remap: [] }; // remap = [{from,to}] old node id -> replacement, merged into .clause/idmap.json by the server so chat chips follow rebuilt frames
  if (spec.probe) { // probe: fills/strokes/stroke weights/radius for given node ids (and their first-level children) — what inspect --raw misses on instances
    const D = n => { const o = { id: n.id, n: n.name }; try { o.fills = (n.fills || []).map(f => f.type === "SOLID" ? (f.boundVariables && f.boundVariables.color ? "var:" + f.boundVariables.color.id : "rgb:" + [f.color.r, f.color.g, f.color.b].map(v => Math.round(v * 255)).join(",")) + (f.visible === false ? "(hidden)" : "") : f.type); o.strokes = (n.strokes || []).length; o.sw = n.strokeWeight !== figma.mixed ? n.strokeWeight : "mixed"; if ("strokeBottomWeight" in n) o.swb = n.strokeBottomWeight; o.vis = n.visible; o.op = n.opacity; } catch (e) {} return o; };
    out.probe = []; for (const id of spec.probe) { const n = await figma.getNodeByIdAsync(id); if (!n) continue; const o = D(n); o.k = ("children" in n ? n.children.slice(0, 6).map(D) : []); if (spec.deep && "findAll" in n) o.hidden = n.findAll(x => x.visible === false).slice(0, 60).map(x => x.name + "#" + x.id.split(";").slice(-2).join(";")); out.probe.push(o); } return out; }
  if (spec.journeyRow) { // journeyRow: {section:{id}|{create:{name,fromId}}, row:{index,eyebrow,title,desc,items:[{ref}|{todo,prompt}]}} → clones screens into a Section row, adds a cover first and TO-CREATE placeholders
    const J = spec.journeyRow; let sec = J.section.id ? await figma.getNodeByIdAsync(J.section.id) : null;
    if (!sec) { const src = await figma.getNodeByIdAsync(J.section.create.fromId); sec = figma.createSection(); sec.name = J.section.create.name; sec.x = src.x + src.width + 600; sec.y = src.y; sec.resizeWithoutConstraints(400, 400); (src.parent || figma.currentPage).appendChild(sec); out.section = sec.id; }
    const PX = 1560, PY = 1400, X0 = 160, Y0 = 260, W = 1440, H = 900, y = Y0 + J.row.index * PY;
    const F = { reg: { family: "Inter", style: "Regular" }, med: { family: "Inter", style: "Medium" }, serif: { family: "Inter", style: "Regular" } };
    for (const f of Object.values(F)) { try { await figma.loadFontAsync(f); } catch (e) { warnings.push("font " + f.family + " " + f.style); } }
    const text = (parent, str, o) => { const t = figma.createText(); parent.appendChild(t); t.fontName = o.font || F.reg; t.characters = str; t.fontSize = o.size || 16; t.fills = [{ type: "SOLID", color: o.color || { r: 0.1, g: 0.1, b: 0.1 } }]; if (o.w) { t.textAutoResize = "HEIGHT"; t.resize(o.w, t.height); } t.x = o.x || 0; t.y = o.y || 0; if (o.lh) t.lineHeight = { unit: "PIXELS", value: o.lh }; return t; };
    const place = (n, i) => { sec.appendChild(n); n.x = X0 + i * PX; n.y = y; };
    // row label above the row
    const lbl = figma.createText(); lbl.fontName = F.med; lbl.characters = J.row.eyebrow + "  ·  " + J.row.title; lbl.fontSize = 44; lbl.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }]; sec.appendChild(lbl); lbl.x = X0; lbl.y = y - 90;
    // cover
    const cv = figma.createFrame(); cv.name = "Cover · " + J.row.title; cv.resize(W, H); cv.fills = [{ type: "SOLID", color: { r: 0.08, g: 0.08, b: 0.08 } }]; cv.cornerRadius = 24; place(cv, 0);
    text(cv, J.row.eyebrow.toUpperCase(), { x: 120, y: 140, size: 22, font: F.med, color: { r: 0.75, g: 0.75, b: 0.75 } });
    text(cv, J.row.title, { x: 120, y: 190, size: 84, font: F.serif, color: { r: 1, g: 1, b: 1 }, w: 1100, lh: 96 });
    text(cv, J.row.desc, { x: 120, y: 400, size: 26, color: { r: 0.85, g: 0.85, b: 0.85 }, w: 1000, lh: 38 });
    text(cv, "In this flow", { x: 120, y: 560, size: 20, font: F.med, color: { r: 0.75, g: 0.75, b: 0.75 } });
    text(cv, J.row.items.map((it, k) => (k + 1) + ".  " + (it.todo ? "TO CREATE  ·  " + it.todo : it.name)).join("\n"), { x: 120, y: 600, size: 20, color: { r: 1, g: 1, b: 1 }, w: 1200, lh: 30 });
    let i = 1; out.placed = [];
    for (const it of J.row.items) {
      if (it.ref) { const src = await figma.getNodeByIdAsync(it.ref); if (!src) { warnings.push("missing " + it.ref); i++; continue; } const c = src.clone(); place(c, i); out.placed.push(c.id); }
      else { const ph = figma.createFrame(); ph.name = "TO CREATE · " + it.todo; ph.resize(W, H); ph.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }]; ph.cornerRadius = 24; ph.strokes = [{ type: "SOLID", color: { r: 0.62, g: 0.62, b: 0.62 } }]; ph.strokeWeight = 3; ph.dashPattern = [16, 12]; place(ph, i);
        text(ph, "TO CREATE", { x: 120, y: 220, size: 22, font: F.med, color: { r: 0.7, g: 0.36, b: 0.05 } });
        text(ph, it.todo, { x: 120, y: 270, size: 64, font: F.serif, w: 1100, lh: 74 });
        text(ph, "Prompt", { x: 120, y: 470, size: 20, font: F.med, color: { r: 0.45, g: 0.45, b: 0.45 } });
        text(ph, it.prompt, { x: 120, y: 510, size: 26, w: 1100, lh: 38 }); out.placed.push(ph.id); }
      i++; }
    return out; }
  if (spec.menuIcons) { // menuIcons: [{menu, items:[{icon:<component id>, divider?:bool, danger?:bool}]}] → set leading icons (and divider/danger tint) on the first visible rows of a Dropdown Menu instance
    const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); out.done = 0;
    for (const M of spec.menuIcons) { const menu = await figma.getNodeByIdAsync(M.menu); const rows = menu.findAll(x => x.type === "INSTANCE" && x.name === "Dropdown list item" && x.parent && x.parent.name === "Menu items" && x.visible);
      for (let r = 0; r < M.items.length && r < rows.length; r++) { const it = M.items[r], row = rows[r], defs = row.componentProperties, o = {}; const key = nm => Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(nm));
        if (key("Icon")) o[key("Icon")] = true; if (key("Instance") && it.icon) o[key("Instance")] = it.icon; if (key("Divider") && it.divider != null) { const dv = defs[key("Divider")]; const opts = (dv && dv.variantOptions) || ["True", "False"]; const yes = opts.find(v => /^(true|yes)$/i.test(v)), no = opts.find(v => /^(false|no)$/i.test(v)); o[key("Divider")] = it.divider ? yes : no; }
        try { row.setProperties(o); } catch (e) { warnings.push("menu icon row " + r + ": " + e.message); }
        if (it.danger) { const txt = row.findOne(x => x.type === "TEXT" && x.name === "Text"); const wrap = row.findOne(x => x.name === "Icon Wrap"); if (txt && wrap) for (const v of wrap.findAll(x => "strokes" in x && x.strokes && x.strokes.length)) { v.strokes = txt.fills; } }
        out.done++; } }
    return out; }
  if (spec.replaceText) { // replaceText: {root, from (regex), to, only?: "^RQ-"} → rewrite matching text layers (inside instances too); reports counts and sample
    const R = spec.replaceText, root = await figma.getNodeByIdAsync(R.root), re = new RegExp(R.from); out.changed = 0; out.sample = [];
    const nodes = root.findAll(x => x.type === "TEXT" && re.test(x.characters) && !(R.only && !new RegExp(R.only).test(x.characters)));
    for (const t of nodes) { try { await figma.loadFontAsync(t.fontName); const before = t.characters; t.characters = before.replace(new RegExp(R.from, "g"), R.to); out.changed++; if (out.sample.length < 4) out.sample.push(before + " → " + t.characters); } catch (e) { warnings.push("text " + t.id + ": " + String((e && e.message) || e).slice(0, 60)); } }
    return out; }
  if (spec.splitColumns) { // splitColumns: [{column, idWidth, idName, titleName, titleHeader}] → one stacked "id + title" column becomes two columns (id muted, title main)
    out.done = [];
    for (const w of spec.splitColumns) { try { const col = await figma.getNodeByIdAsync(w.column); const par = col.parent, idx = par.children.indexOf(col); const col2 = col.clone(); par.insertChild(idx + 1, col2);
        const cells = c => c.children.filter(x => x.type === "INSTANCE" && x.name === "Table cell");
        const A = cells(col), B = cells(col2);
        for (let i = 0; i < A.length; i++) { // id column: keep the main Text, hide supporting, colour like the supporting text
          const sup = A[i].findOne(x => x.type === "TEXT" && x.name === "Supporting text"), main = A[i].findOne(x => x.type === "TEXT" && x.name === "Text");
          const idTxt = main ? main.characters : "", titleTxt = sup ? sup.characters : "";
          const k = Object.keys(A[i].componentProperties).find(d => d.split("#")[0] === "Supporting Text"); if (k) A[i].setProperties({ [k]: false });
          if (sup && main) { main.fills = sup.fills; }
          const k2 = Object.keys(B[i].componentProperties).find(d => d.split("#")[0] === "Supporting Text"); if (k2) B[i].setProperties({ [k2]: false });
          const m2 = B[i].findOne(x => x.type === "TEXT" && x.name === "Text"); if (m2) { await figma.loadFontAsync(m2.fontName); m2.characters = titleTxt; }
          const m1 = A[i].findOne(x => x.type === "TEXT" && x.name === "Text"); if (m1) { await figma.loadFontAsync(m1.fontName); m1.characters = idTxt; } }
        const hdr = col2.children.find(x => x.name === "Col Header Cell"); if (hdr) { const t = hdr.findOne(x => x.type === "TEXT"); if (t) { await figma.loadFontAsync(t.fontName); t.characters = w.titleHeader != null ? w.titleHeader : " "; } }
        col.name = w.idName || "Col / ID"; col2.name = w.titleName || "Col / Contract";
        col.layoutSizingHorizontal = "FIXED"; col.resize(w.idWidth || 100, col.height); col.layoutSizingVertical = "HUG"; col2.layoutGrow = 1; col2.layoutSizingHorizontal = "FILL";
        out.done.push({ id: col.id, id2: col2.id }); } catch (e) { warnings.push("split " + w.column + ": " + String((e && e.message) || e).slice(0, 120)); } }
    return out; }
  if (spec.dropdownMenus) { // dropdownMenus: [{target, key, type, items:[{text, mark:<icon component id>, selected}]}] → DS Dropdown Menu in place of a hand-made menu frame, right edge and y kept
    const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); out.done = [];
    for (const w of spec.dropdownMenus) { try { const n = await figma.getNodeByIdAsync(w.target); if (!n) continue; const p = n.parent, i = p.children.indexOf(n), abs = n.layoutPositioning === "ABSOLUTE", ox = n.x, oy = n.y, ow = n.width;
        const c = await figma.importComponentByKeyAsync(w.key), inst = c.createInstance(); p.insertChild(i, inst);
        if (w.type) { try { const k = Object.keys(inst.componentProperties).find(d => norm(d.split("#")[0]) === "type"); if (k) inst.setProperties({ [k]: w.type }); } catch (e) { warnings.push("menu type: " + e.message); } }
        const rows = inst.findAll(x => x.type === "INSTANCE" && x.name === "Dropdown list item" && x.parent && x.parent.name === "Menu items");
        for (let r = 0; r < rows.length; r++) { const row = rows[r], it = w.items[r]; if (!it) { row.visible = false; continue; } row.visible = true;
          if (it.dotColour) { const base = spec.dotSet ? await figma.getNodeByIdAsync(spec.dotSet) : null, set = base && base.parent; /* dotSet: id of any variant of the design system's Dot component set */ const v = set && set.children && set.children.find(c => c.name.includes("Size=sm") && c.name.includes("Outline=False") && c.name.includes("Colour=" + it.dotColour)); if (v) it.mark = v.id; else warnings.push("no dot colour " + it.dotColour); }
          const defs = row.componentProperties, o = {}; const key = nm => Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(nm));
          if (key("Icon")) o[key("Icon")] = !!it.mark; if (key("Instance") && it.mark) o[key("Instance")] = it.mark; if (key("Selected")) o[key("Selected")] = it.selected ? "On" : "Off"; if (key("Shortcut")) o[key("Shortcut")] = it.shortcut != null; if (key("Badge")) o[key("Badge")] = false;
          if (it.state && key("State")) o[key("State")] = it.state;
          try { row.setProperties(o); } catch (e) { warnings.push("menu row: " + e.message); }
          await setTexts(row, it.shortcut != null ? [it.text, String(it.shortcut)] : [it.text]); for (const pill of row.findAll(x => x.type === "INSTANCE" && /Pill/.test(x.name))) pill.visible = false; }
        if (abs) { inst.layoutPositioning = "ABSOLUTE"; inst.x = ox + ow - inst.width; inst.y = oy; }
        inst.name = n.name; out.remap.push({ from: w.target, to: inst.id }); discard(n); out.done.push({ id: inst.id, w: Math.round(inst.width), h: Math.round(inst.height) }); } catch (e) { warnings.push("menu " + w.target + ": " + String((e && e.message) || e).slice(0, 120)); } }
    return out; }
  if (spec.badgeCells) { // badgeCells: {donor, items:[{target,text,color}]} → clone the designer's "Badge single" table cell in place of each wrapper frame, retext + recolour its pill
    const d = await figma.getNodeByIdAsync(spec.badgeCells.donor); out.done = 0;
    for (const it of spec.badgeCells.items) { try { const n = await figma.getNodeByIdAsync(it.target); if (!n) continue; const p = n.parent, i = p.children.indexOf(n), k = d.clone(); p.insertChild(i, k);
        await setTexts(k, [it.text]); const pill = k.findOne(x => x.type === "INSTANCE" && /Pill/.test(x.name)); if (pill && it.color) { try { const defs = pill.componentProperties; const key = Object.keys(defs).find(q => q.split("#")[0] === "Color"); if (key) pill.setProperties({ [key]: it.color }); } catch (e) { warnings.push("pill colour: " + e.message); } }
        k.layoutSizingHorizontal = "FILL"; out.remap.push({ from: it.target, to: k.id }); discard(n); out.done++; } catch (e) { warnings.push("badge " + it.target + ": " + String((e && e.message) || e).slice(0, 100)); } }
    return out; }
  if (spec.replaceLib) { // replaceLib: [{target, key, props, text, name, hide:[layer names]}] → library instance at the target's index/size role; old node removed after success
    out.done = []; const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase();
    for (const w of spec.replaceLib) { try { const n = await figma.getNodeByIdAsync(w.target); if (!n) { warnings.push("missing " + w.target); continue; }
        const c = await figma.importComponentByKeyAsync(w.key), inst = c.createInstance(), p = n.parent, i = p.children.indexOf(n);
        p.insertChild(i, inst); if (w.name) inst.name = w.name;
        if (w.props) { const defs = inst.componentProperties, o = {}; for (const [k, v] of Object.entries(w.props)) { const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k)) || k; o[full] = defs[full] && defs[full].type === "BOOLEAN" ? (v === true || v === "true") : v; } try { inst.setProperties(o); } catch (e) { warnings.push("replaceLib props: " + e.message); } }
        for (const nm of w.hide || []) for (const h of inst.findAll(x => x.name === nm)) h.visible = false;
        if (w.bases) { const segs = inst.findAll(x => x.type === "INSTANCE" && x.name === "_Toggle group base" && x.parent === (inst.children[0] && inst.children[0].parent)); // segment instances (direct children)
          const direct = inst.children.filter(x => x.type === "INSTANCE");
          for (let si = 0; si < direct.length; si++) { const sg = direct[si], b = w.bases[si]; if (!b) { sg.visible = false; continue; }
            if (b.current != null) { try { const defs = sg.componentProperties; const k = Object.keys(defs).find(d => norm(d.split("#")[0]) === "current"); if (k) sg.setProperties({ [k]: b.current ? "True" : "False" }); } catch (e) { warnings.push("current: " + e.message); } }
            if (b.text != null) await setTexts(sg, [b.text]);
            if (b.icon) { const ph = sg.findOne(x => x.type === "INSTANCE" && x.name === "placeholder"); if (ph) { try { ph.swapComponent(await figma.getNodeByIdAsync(b.icon)); } catch (e) { warnings.push("icon swap: " + e.message); } } } } }
        if (w.text) await setTexts(inst, w.text);
        for (const k of ["layoutAlign", "layoutGrow"]) { try { inst[k] = n[k]; } catch (e) {} }
        out.remap.push({ from: w.target, to: inst.id }); discard(n); out.done.push(inst.id); } catch (e) { warnings.push("replaceLib " + w.target + ": " + String((e && e.message) || e).slice(0, 120)); } }
    return out; }
  if (spec.swapComp) { // swapComp: {to:<component id>, ids:[instance ids]} → swapComponent on existing instances (keeps size)
    const to = await figma.getNodeByIdAsync(spec.swapComp.to); out.done = 0;
    for (const id of spec.swapComp.ids) { try { const n = await figma.getNodeByIdAsync(id); if (!n || n.type !== "INSTANCE") continue; const W = n.width, H = n.height; n.swapComponent(to); n.resize(W, H); out.done++; } catch (e) { warnings.push("swapComp " + id + ": " + String((e && e.message) || e).slice(0, 80)); } }
    return out; }
  if (spec.swapMarks) { // swapMarks: {map:{"<old node name>":"<component id>"}, ids:[node ids]} → replace each hand-made frame with an instance of the mapped component, keeping index, size and layout role
    const comps = {}; for (const [nm, cid] of Object.entries(spec.swapMarks.map)) comps[nm] = await figma.getNodeByIdAsync(cid);
    out.done = 0; for (const id of spec.swapMarks.ids) { try { const n = await figma.getNodeByIdAsync(id); if (!n) continue; const c = comps[n.name]; if (!c) { warnings.push("no mapping for " + n.name); continue; }
        const p = n.parent, i = p.children.indexOf(n), W = n.width, H = n.height; const inst = c.createInstance(); p.insertChild(i, inst); if (Math.round(W) !== Math.round(inst.width)) inst.resize(W, H);
        for (const k of ["layoutAlign", "layoutGrow", "layoutPositioning"]) { try { inst[k] = n[k]; } catch (e) {} } if (n.layoutPositioning === "ABSOLUTE") { inst.x = n.x; inst.y = n.y; }
        out.remap.push({ from: id, to: inst.id }); discard(n); out.done++; } catch (e) { warnings.push("mark " + id + ": " + String((e && e.message) || e).slice(0, 80)); } }
    return out; }
  if (spec.findIn) { // findIn: {root, re, max} → matching descendants (id, name, size, parent name/id, first child type, fills)
    const root = await figma.getNodeByIdAsync(spec.findIn.root), re = new RegExp(spec.findIn.re, "i");
    out.found = root.findAll(x => { try { return re.test(x.name) && !x.removed; } catch (e) { return false; } }).slice(0, spec.findIn.max || 400).map(x => { const f = ("fills" in x && x.fills !== figma.mixed) ? x.fills.filter(q => q.type === "SOLID").map(q => [q.color.r, q.color.g, q.color.b].map(v => Math.round(v * 255)).join(",")) : []; let top = x; while (top.parent && top.parent.id !== spec.findIn.root && top.parent.type !== "PAGE") top = top.parent;
      return { id: x.id, n: x.name, t: x.type, w: Math.round(x.width), h: Math.round(x.height), p: x.parent && x.parent.name, pid: x.parent && x.parent.id, screen: top.name, f: f.slice(0, 1), c: x.children ? x.children.length : 0 }; });
    return out; }
  if (spec.fileKey) { out.fileKey = figma.fileKey || null; out.fileName = figma.root.name; return out; } // fileKey: only exposed to some plugin types
  if (spec.darkMode) { // darkMode: {target, mode?: /dark/i} → set the explicit variable mode (dark) on a node for every colour collection used inside it
    const n = await figma.getNodeByIdAsync(spec.darkMode.target), re = new RegExp(spec.darkMode.mode || "dark", "i"); const seen = new Set(); out.modes = [];
    const scan = [n, ...(n.findAll ? n.findAll(() => true) : [])];
    for (const x of scan) for (const f of [...(("fills" in x && x.fills !== figma.mixed) ? x.fills : []), ...(("strokes" in x) ? x.strokes : [])]) { const b = f.boundVariables && f.boundVariables.color; if (!b) continue;
      try { const v = await figma.variables.getVariableByIdAsync(b.id); if (!v || seen.has(v.variableCollectionId)) continue; seen.add(v.variableCollectionId); const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId); const m = col.modes.find(q => re.test(q.name));
        out.modes.push({ col: col.name, modes: col.modes.map(q => q.name), set: m ? m.name : null }); if (m) n.setExplicitVariableModeForCollection(col, m.modeId); } catch (e) { warnings.push("mode: " + String((e && e.message) || e).slice(0, 80)); } }
    return out; }
  if (spec.wrapInstances) { // wrapInstances: {section, suffix, prefix} → every top-level INSTANCE whose name ends with suffix is wrapped in a plain frame of its size at the same spot; the frame takes the cleaned name, the instance is renamed to its component name
    const R = spec.wrapInstances, sec = await figma.getNodeByIdAsync(R.section); out.wrapped = [];
    for (const n of [...sec.children]) { try { if (n.type !== "INSTANCE" || !n.name.endsWith(R.suffix)) continue; const base = n.name.slice(0, -R.suffix.length), idx = sec.children.indexOf(n), x = n.x, y = n.y, w = n.width, h = n.height;
        const f = figma.createFrame(); f.fills = []; f.clipsContent = false; f.resize(w, h); sec.insertChild(idx, f); f.x = x; f.y = y; f.name = (R.prefix || "") + base;
        f.appendChild(n); n.x = 0; n.y = 0; n.name = R.instanceName || "Instance"; stamp(f); out.remap.push({ from: n.id, to: f.id }); out.wrapped.push(f.name); } catch (e) { warnings.push("wrap " + n.id + ": " + String((e && e.message) || e).slice(0, 100)); } }
    return out; }
  if (spec.fileInfo) { // fileInfo: libraries available to this file, page names, local component/variable counts (read-only)
    out.file = figma.root.name; try { const cols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(); out.libs = [...new Set(cols.map(c => c.libraryName))]; out.collections = cols.length; } catch (e) { out.libs = ["error: " + String((e && e.message) || e).slice(0, 80)]; }
    try { out.localCollections = (await figma.variables.getLocalVariableCollectionsAsync()).map(c => c.name); } catch (e) {}
    out.pages = figma.root.children.map(p => p.name); out.fileKey = figma.fileKey || null;
    if (spec.fileInfo === "counts") try { await figma.loadAllPagesAsync(); out.localComponentSets = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET"] }).length; out.localComponents = figma.root.findAllWithCriteria({ types: ["COMPONENT"] }).length; } catch (e) {}
    return out; }
  if (spec.textProps) { const n = await figma.getNodeByIdAsync(spec.textProps); out.texts = n.findAll(x => x.type === "TEXT").map(t => ({ id: t.id, n: t.name, w: Math.round(t.width), auto: t.textAutoResize, sh: t.layoutSizingHorizontal, al: t.textAlignHorizontal, parent: t.parent && t.parent.name, pw: t.parent && Math.round(t.parent.width), plm: t.parent && t.parent.layoutMode, psh: t.parent && t.parent.layoutSizingHorizontal, pmax: t.parent && t.parent.maxWidth })); out.self = { w: Math.round(n.width), sh: n.layoutSizingHorizontal, max: n.maxWidth, min: n.minWidth, lm: n.layoutMode }; return out; }
  if (spec.setByName) { // setByName: {roots, inst, child, props:{k:v}} → set (journaled) node properties on children named `child` inside every node named `inst`
    const R = spec.setByName; out.done = 0;
    for (const rid of R.roots) { const root = await figma.getNodeByIdAsync(rid); if (!root) continue;
      for (const inst of root.findAll(x => { try { return x.name === R.inst; } catch (e) { return false; } })) { try { for (const c of inst.findAll(x => { try { return x.name === R.child; } catch (e) { return false; } })) { for (const [k, v] of Object.entries(R.props)) setP(c, k, v); } out.done++; } catch (e) { warnings.push("setByName " + inst.id + ": " + String((e && e.message) || e).slice(0, 80)); } } }
    return out; }
  if (spec.apiProbe) { out.api = { commitUndo: typeof figma.commitUndo, triggerUndo: typeof figma.triggerUndo, documentchange: typeof figma.on, loadAllPages: typeof figma.loadAllPagesAsync }; return out; }
  if (spec.textResetIn) { // textResetIn: {roots, name} → text layers inside every node with that name get alignment + sizing back from the main component (undo of textAlignIn)
    const R = spec.textResetIn; out.done = 0; out.sample = null;
    for (const rid of R.roots) { const root = await figma.getNodeByIdAsync(rid); if (!root) continue;
      for (const inst of root.findAll(x => { try { return x.type === "INSTANCE" && x.name === R.name; } catch (e) { return false; } })) { try {
          const main = await inst.getMainComponentAsync(); if (!main) continue;
          const mt = main.findAll(x => x.type === "TEXT"), it = inst.findAll(x => x.type === "TEXT");
          for (const t of it) { const m = mt.find(q => q.name === t.name); if (!m) continue; await figma.loadFontAsync(t.fontName); setP(t, "textAlignHorizontal", m.textAlignHorizontal); try { setP(t, "textAutoResize", m.textAutoResize); if (m.layoutSizingHorizontal) setP(t, "layoutSizingHorizontal", m.layoutSizingHorizontal); } catch (e) {} if (!out.sample) out.sample = { align: m.textAlignHorizontal, auto: m.textAutoResize, sh: m.layoutSizingHorizontal }; }
          out.done++; } catch (e) { warnings.push("reset " + inst.id + ": " + String((e && e.message) || e).slice(0, 80)); } } }
    return out; }
  if (spec.textAlignIn) { // textAlignIn: {roots:[ids], name, align} → text alignment (and fill width, so it is visible) for the text layers inside every node with that name
    const R = spec.textAlignIn; out.done = 0;
    for (const rid of R.roots) { const root = await figma.getNodeByIdAsync(rid); if (!root) continue;
      for (const inst of root.findAll(x => { try { return x.name === R.name; } catch (e) { return false; } })) { try { for (const t of inst.findAll(x => { try { return x.type === "TEXT" && x.visible !== false; } catch (e) { return false; } })) { await figma.loadFontAsync(t.fontName); setP(t, "textAlignHorizontal", R.align); try { if (t.parent && t.parent.layoutMode && t.parent.layoutMode !== "NONE") { setP(t, "layoutSizingHorizontal", "FILL"); setP(t, "textAutoResize", "HEIGHT"); } } catch (e) {} } out.done++; } catch (e) { warnings.push("align " + inst.id + ": " + String((e && e.message) || e).slice(0, 80)); } } }
    return out; }
  if (spec.bubbleFrom) { // bubbleFrom: {donor:<designer's user-message instance>, items:[{target,text}]} → hand-made message bubbles become clones of the donor with their text, same index and layout role
    const B = spec.bubbleFrom, d = await figma.getNodeByIdAsync(B.donor); out.done = [];
    for (const it of B.items) { try { const t = await figma.getNodeByIdAsync(it.target); if (!t) continue; const p = t.parent, i = p.children.indexOf(t);
        const c = d.clone(); p.insertChild(i, c); if (it.text != null) { try { await setTexts(c, [it.text]); } catch (e) { warnings.push("bubble text: " + e.message); } }
        for (const k of ["layoutAlign", "layoutGrow"]) { try { c[k] = t[k]; } catch (e) {} } try { c.layoutSizingHorizontal = "HUG"; } catch (e) {}
        out.remap.push({ from: it.target, to: c.id }); discard(t); out.done.push(c.id); } catch (e) { warnings.push("bubble " + it.target + ": " + String((e && e.message) || e).slice(0, 100)); } }
    return out; }
  if (spec.alertFrom) { // alertFrom: {donor:<designer's Alert instance>, items:[{target,title,action?,width?}]} → hand-made toast frames become clones of the donor Alert, retexted, same centre and layout role
    const A = spec.alertFrom, d = await figma.getNodeByIdAsync(A.donor); out.done = [];
    for (const it of A.items) { try { const t = await figma.getNodeByIdAsync(it.target); if (!t) continue; const p = t.parent, i = p.children.indexOf(t), abs = t.layoutPositioning === "ABSOLUTE", ox = t.x, oy = t.y, ow = t.width, oh = t.height;
        const c = d.clone(); p.insertChild(i, c); c.name = "Toast";
        const title = c.findOne(x => x.type === "TEXT" && x.name === "Text" && x.parent && x.parent.name === "Text and supporting text"); if (title) { await figma.loadFontAsync(title.fontName); title.characters = it.title; }
        const btns = c.findAll(x => x.type === "INSTANCE" && x.name === "Buttons/Button Brand" && x.visible);
        const actionBtn = btns.find(b => b.findOne(y => y.type === "TEXT" && y.characters)); if (actionBtn) { if (it.action) { const tx = actionBtn.findOne(y => y.type === "TEXT"); await figma.loadFontAsync(tx.fontName); tx.characters = it.action; } else actionBtn.visible = false; }
        if (it.width) { c.layoutSizingHorizontal = "FIXED"; c.resize(it.width, c.height); }
        if (abs) { c.layoutPositioning = "ABSOLUTE"; c.x = ox + (ow - c.width) / 2; c.y = oy + (oh - c.height) / 2; } else { for (const k of ["layoutAlign", "layoutGrow"]) { try { c[k] = t[k]; } catch (e) {} } }
        out.remap.push({ from: it.target, to: c.id }); discard(t); out.done.push({ id: c.id, w: Math.round(c.width), h: Math.round(c.height) }); } catch (e) { warnings.push("alert " + it.target + ": " + String((e && e.message) || e).slice(0, 100)); } }
    return out; }
  if (spec.textSegs) { // textSegs: {root, name} → for text layers with that name: their styled segments (fills + decoration), to find insertion-only text
    const root = await figma.getNodeByIdAsync(spec.textSegs.root); out.texts = [];
    for (const t of root.findAll(x => x.type === "TEXT" && x.name === spec.textSegs.name).slice(0, 80)) { try { const segs = t.getStyledTextSegments(["fills", "textDecoration"]); out.texts.push({ id: t.id, n: t.characters.length, segs: segs.length, dec: [...new Set(segs.map(q => q.textDecoration))], c: t.characters.slice(0, 40) }); } catch (e) {} }
    return out; }
  if (spec.checkEdited) { // checkEdited: {root} → built frames under root that differ from their build fingerprint (designer edited them) or have none
    const root = await figma.getNodeByIdAsync(spec.checkEdited.root); out.edited = []; out.clean = 0; out.unknown = 0;
    const walk = (n, d) => { for (const c of (n.children || [])) { try { if (c.getPluginData("clause-sig")) { if (editedSince(c)) out.edited.push({ id: c.id, n: c.name }); else out.clean++; } else if (d === 0) out.unknown++; if (d < 1 && "children" in c) walk(c, d + 1); } catch (e) {} } };
    walk(root, 0); return out; }
  if (spec.listChildren) { const n = await figma.getNodeByIdAsync(spec.listChildren); out.kids = n.children.map(c => ({ id: c.id, n: c.name, t: c.type, w: Math.round(c.width), h: Math.round(c.height), x: Math.round(c.x), y: Math.round(c.y) })); return out; }
  if (spec.ancestry) { const n = await figma.getNodeByIdAsync(spec.ancestry); out.chain = []; for (let a = n; a && a.type !== "PAGE" && out.chain.length < 14; a = a.parent) out.chain.push({ n: a.name, t: a.type, w: Math.round(a.width), lm: a.layoutMode, sh: a.layoutSizingHorizontal, pos: a.layoutPositioning, clip: a.clipsContent }); return out; }
  if (spec.listSet) { const b = await figma.getNodeByIdAsync(spec.listSet), set = b && b.parent; out.names = set && set.children ? set.children.map(c => c.name) : []; return out; }
  if (spec.find) { await figma.loadAllPagesAsync(); const re = new RegExp(spec.find, "i"); out.found = figma.root.findAll(x => (x.type === "COMPONENT_SET" || (x.type === "COMPONENT" && !(x.parent && x.parent.type === "COMPONENT_SET"))) && re.test(x.name)).slice(0, 40).map(x => ({ id: x.id, n: x.name, t: x.type, remote: x.remote, page: (function (q) { while (q && q.type !== "PAGE") q = q.parent; return q && q.name; })(x) })); return out; } // find: list components in this file by name regex
  for (const w of spec.swaps) {
    try {
      const n = await figma.getNodeByIdAsync(w.target); if (!n) { warnings.push("swap target missing " + w.target); continue; }
      if (w.table) { // table: rebuild a card's tabs + header + rows as column stacks of library instances. Build everything first, remove old children last.
        const T = w.table, norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase();
        const mk = async (key, props, text, opts = {}) => { const c = await figma.importComponentByKeyAsync(key); const i = c.createInstance();
          if (props) { const defs = i.componentProperties, o = {}; for (const [k, v] of Object.entries(props)) { const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k)) || k; o[full] = defs[full] && defs[full].type === "BOOLEAN" ? (v === true || v === "true") : v; } try { i.setProperties(o); } catch (e) { warnings.push("table props " + key.slice(0, 6) + ": " + e.message); } }
          if (text) await setTexts(i, text); if (opts.noFill) { try { i.fills = []; } catch (e) {} } return i; };
        const frame = (name, dir) => { const f = figma.createFrame(); f.name = name; f.fills = []; f.layoutMode = dir; f.itemSpacing = 0; f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = 0; f.clipsContent = false; return f; };
        const made = [];
        // tabs
        const tabsWrap = frame("Tabs", "HORIZONTAL"); tabsWrap.counterAxisAlignItems = "CENTER"; tabsWrap.paddingLeft = T.tabs.padL != null ? T.tabs.padL : T.tabs.padX; tabsWrap.paddingRight = T.tabs.padR != null ? T.tabs.padR : T.tabs.padX; tabsWrap.paddingTop = T.tabs.padT || 0;
        const tabs = await mk(T.tabs.key, T.tabs.props, T.tabs.text); tabsWrap.appendChild(tabs); tabs.layoutGrow = 1; tabs.layoutSizingHorizontal = "FILL";
        for (const nm of T.tabs.hide || []) for (const h of tabs.findAll(x => x.name === nm)) h.visible = false;
        const keepers = []; for (const id of T.tabs.keepNodes || []) { const kn = await figma.getNodeByIdAsync(id); if (kn) { tabsWrap.appendChild(kn); keepers.push(kn); } }
        // columns
        const table = frame("Table", "HORIZONTAL"); table.counterAxisAlignItems = "MIN";
        for (const col of T.columns) {
          const c = frame(col.name, "VERTICAL"); table.appendChild(c);
          if (col.fill) { c.layoutGrow = 1; c.layoutSizingHorizontal = "FILL"; } else { c.layoutSizingHorizontal = "FIXED"; c.resize(col.w, 10); c.layoutSizingVertical = "HUG"; }
          const h = await mk(T.header.key, T.header.props, [col.header], { noFill: true }); c.appendChild(h); h.layoutSizingHorizontal = "FILL";
          for (const cell of col.cells) { let n2;
            if (cell.pill) { n2 = frame("Status", "HORIZONTAL"); n2.counterAxisAlignItems = "CENTER"; n2.paddingLeft = T.pillPad || 12; n2.paddingRight = 12; n2.paddingTop = 12; n2.paddingBottom = 12; const pl = await mk(T.pill.key, { ...T.pill.props, ...cell.props }, [cell.text]); n2.appendChild(pl); }
            else { n2 = await mk(T.cell.key, { ...T.cell.props, ...(cell.props || {}) }, cell.iconText ? null : cell.text);
              if (cell.iconText) { for (const h of n2.findAll(x => x.name === "Pill squared")) h.visible = false; for (const h of n2.findAll(x => x.type === "TEXT" && x.name === "Text")) h.visible = true;
                if (T.fileIconKey) { const ph = n2.findOne(x => x.name === "placeholder" && x.type === "INSTANCE"); if (ph) { try { ph.swapComponent(await figma.importComponentByKeyAsync(T.fileIconKey)); } catch (e) { warnings.push("table icon: " + e.message); } } } await setTexts(n2, cell.text); } }
            c.appendChild(n2); n2.layoutSizingHorizontal = "FILL"; if (cell.name) n2.name = cell.name; }
        }
        // swap in: remove old children (except kept node moved above), then add new
        for (const c of [...n.children]) { out.remap.push({ from: c.id, to: n.id }); discard(c); }
        n.appendChild(tabsWrap); tabsWrap.layoutSizingHorizontal = "FILL"; tabsWrap.layoutSizingVertical = "HUG"; n.appendChild(table); table.layoutSizingHorizontal = "FILL"; table.layoutSizingVertical = "HUG"; n.layoutSizingVertical = "HUG";
        out.swapped.push({ id: n.id, table: T.columns.length + " columns", rows: T.columns[0].cells.length }); continue; }
      if (w.edit) { // edit: [{id, text?, visible?}] on layers by id (inside instances too)
        for (const e of w.edit) { const t = await figma.getNodeByIdAsync(e.id); if (!t) { warnings.push("edit target missing " + e.id); continue; }
          if (e.text != null) { const tn = t.type === "TEXT" ? t : t.findOne(x => x.type === "TEXT"); await figma.loadFontAsync(tn.fontName); setP(tn, "characters", e.text); }
          if (e.visible != null) setP(t, "visible", !!e.visible);
          if (e.copyFillFrom) { const src = await figma.getNodeByIdAsync(e.copyFillFrom); if (src && "fills" in src) { const tn = e.textOnly ? (t.type === "TEXT" ? t : t.findOne(x => x.type === "TEXT")) : t; tn.fills = src.fills; } }
          if (e.compProps) { const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); const defs = t.componentProperties, o = {}; for (const [k, v] of Object.entries(e.compProps)) { const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k)) || k; o[full] = v; } try { t.setProperties(o); } catch (er) { warnings.push("edit compProps: " + er.message); } }
          if (e.moveInto) { const par = await figma.getNodeByIdAsync(e.moveInto.parent); if (par) par.insertChild(e.moveInto.index == null ? par.children.length : e.moveInto.index, t); } }
        out.swapped.push({ id: n.id, edited: w.edit.length }); continue; }
      if (w.insert) { // insert: remove children by name, then add an instance (by raw library key) at index 0; props/text/noFill/fillX
        const I = w.insert;
        let comp; if (I.byName) { // look for a component set/component by name in this file (all pages), else fall back to a library key
          await figma.loadAllPagesAsync(); const hit = figma.root.findOne(x => (x.type === "COMPONENT_SET" || x.type === "COMPONENT") && x.name === I.byName && !(x.parent && x.parent.type === "COMPONENT_SET"));
          if (!hit) { warnings.push("insert: no component named " + I.byName + " in this file"); continue; } comp = hit.type === "COMPONENT_SET" ? hit.defaultVariant : hit; }
        else comp = await figma.importComponentByKeyAsync(I.key);
        const inst = comp.createInstance(); n.insertChild(0, inst); const __keep = inst.id;
        for (const nm of I.remove || []) for (const c of n.children.filter(x => x.name === nm && x.id !== __keep)) discard(c); // only after the instance exists (never the new one)
        if (I.name) inst.name = I.name; if (I.fillX) inst.layoutSizingHorizontal = "FILL";
        if (I.props) { const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); const defs = inst.componentProperties, o = {}; for (const [k, v] of Object.entries(I.props)) { const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k)) || k; o[full] = defs[full] && defs[full].type === "BOOLEAN" ? (v === true || v === "true") : v; } try { inst.setProperties(o); } catch (e) { warnings.push("insert props: " + e.message); } }
        if (I.text) await setTexts(inst, I.text);
        if (I.noFill) { try { inst.fills = []; for (const c of inst.children) if (c.type === "FRAME" && c.name === inst.name) c.fills = []; } catch (e) {} }
        out.swapped.push({ id: inst.id, inserted: inst.name, w: Math.round(inst.width), h: Math.round(inst.height) }); continue; }
      if (w.setProps) { for (const [k, v] of Object.entries(w.setProps)) { if (k === "__w") { recSize(n); n.resize(v, n.height); } else if (k === "__resize") { recSize(n); n.resizeWithoutConstraints(v[0], v[1]); } else setP(n, k, v); } out.swapped.push({ id: n.id, set: Object.keys(w.setProps) }); continue; } // set raw node properties (paddingTop, primaryAxisAlignItems…)
      if (w.rebuild) { // rebuild: empty `target` (a frame) and fill it with clones of donor layers; per child: grow, props (set on every instance of that set name), hide (layer names), pad, w
        for (const c of [...n.children]) discard(c);
        if (w.rebuild.fillFrom) { const f = await figma.getNodeByIdAsync(w.rebuild.fillFrom); n.fills = f.fills; }
        for (const ch of w.rebuild.children) {
          const d = await figma.getNodeByIdAsync(ch.donor); if (!d) { warnings.push("rebuild donor missing " + ch.donor); continue; }
          const k = d.clone(); n.appendChild(k); if (ch.name) k.name = ch.name;
          if (ch.fillX) k.layoutSizingHorizontal = "FILL"; if (ch.grow) { k.layoutGrow = 1; k.layoutSizingVertical = "FILL"; }
          if (ch.pad) { const [t, r, b, l] = ch.pad; k.paddingTop = t; k.paddingRight = r; k.paddingBottom = b; k.paddingLeft = l; }
          if (ch.center) { k.layoutAlign = "CENTER"; k.__center = 1; } if (ch.hide) for (const nm of ch.hide) for (const h of k.findAll(x => x.name === nm)) h.visible = false;
          for (const [setName, props] of Object.entries(ch.props || {})) for (const i of (k.type === "INSTANCE" ? [k] : k.findAll(x => { if (x.type !== "INSTANCE") return false; for (let a = x.parent; a && a !== k; a = a.parent) if (a.type === "INSTANCE") return false; return true; }))) { const mc = await i.getMainComponentAsync(); const sn = mc && mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent.name : mc && mc.name; if (sn === setName) { try { const cur = i.componentProperties; const want = { ...props }; if (setName === "Nav_menu/Main" && want.Variant === "Collapsed" && cur.State && cur.State.value === "Default") want.State = "default"; i.setProperties(want); } catch (e) { warnings.push("rebuild props " + setName + ": " + e.message); } } }
        }
        if (w.rebuild.width) { n.layoutSizingHorizontal = "FIXED"; n.resize(w.rebuild.width, n.height); for (const k of n.children) if (!k.layoutPositioning || k.layoutPositioning !== "ABSOLUTE") { try { k.layoutSizingHorizontal = k.__center ? "HUG" : "FILL"; } catch (e) {} } }
        out.swapped.push({ id: n.id, rebuilt: n.children.length }); continue; }
      if (w.newFrames) { // newFrames: [{name, dir, w?, h?, center?, count?}] appended into target; returns ids
        for (const F of w.newFrames) for (let q = 0; q < (F.count || 1); q++) { const f = figma.createFrame(); f.name = F.name; f.fills = []; f.layoutMode = F.dir || "HORIZONTAL"; f.itemSpacing = 0; f.clipsContent = false; f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = 0;
          n.appendChild(f); if (F.center) { f.primaryAxisAlignItems = "CENTER"; f.counterAxisAlignItems = "CENTER"; }
          if (F.w) { f.layoutSizingHorizontal = "FIXED"; f.resize(F.w, F.h || 10); } else f.layoutSizingHorizontal = "FILL"; if (F.h) { f.layoutSizingVertical = "FIXED"; f.resize(F.w || f.width, F.h); } else f.layoutSizingVertical = "HUG";
          out.swapped.push({ id: f.id, name: F.name }); } continue; }
      if (w.remove) { if ((editedSince(n) || !n.getPluginData("clause-sig")) && !w.force) /* no fingerprint = cannot prove the designer left it alone: never remove */ { warnings.push("not removed (edited or not provably mine): " + n.name + " " + n.id); continue; } discard(n); out.swapped.push({ id: w.target, removed: true }); continue; } // remove the target node
      if (w.moveTo) { const par = await figma.getNodeByIdAsync(w.moveTo.parent); if (par) { par.insertChild(w.moveTo.index === -1 ? par.children.length : w.moveTo.index, n); out.swapped.push({ id: n.id, moved: true }); } continue; } // reorder: move target to an index in a parent (-1 = end)
      if (w.compProps) { const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); const defs = n.componentProperties, o = {}; for (const [k, v] of Object.entries(w.compProps)) { const full = Object.keys(defs).find(d => norm(d.split("#")[0]) === norm(k)) || k; o[full] = defs[full] && defs[full].type === "BOOLEAN" ? (v === true || v === "true") : v; } try { n.setProperties(o); out.swapped.push({ id: n.id, props: Object.keys(o).length }); } catch (e) { warnings.push("compProps " + n.id + ": " + e.message); } continue; } // set component properties of an existing instance
      if (w.copyFill) { const d = await figma.getNodeByIdAsync(w.copyFill); n.fills = d.fills; if (w.strokes) { n.strokes = d.strokes; for (const k of ["strokeWeight","strokeAlign","strokeTopWeight","strokeBottomWeight","strokeLeftWeight","strokeRightWeight"]) try { if (d[k] !== figma.mixed) n[k] = d[k]; } catch (e) {} } out.swapped.push({ id: n.id, fill: "copied" }); continue; } // copy fills (+strokes) incl. bound variables from a redesigned layer
      if (w.icons) { // swap the leading icon of each rendered "Dropdown list item" (nested placeholder instance) for a component by raw key or catalog name
        const items = n.findAll(x => x.name === "Dropdown list item" && x.absoluteRenderBounds !== null && x.height > 20);
        for (const ic of w.icons) { try { const it = items[ic.item]; const ph = it && it.findOne(x => x.type === "INSTANCE" && /placeholder/i.test(x.name)); if (!ph) { warnings.push("icon slot missing for item " + ic.item); continue; } const comp = ic.comp ? await component(ic.comp) : await figma.importComponentByKeyAsync(ic.key); ph.swapComponent(comp); ph.resize(ic.size || 16, ic.size || 16); } catch (e) { warnings.push("icon " + ic.item + ": " + String((e && e.message) || e).slice(0, 120)); } }
        out.swapped.push({ id: n.id, icons: w.icons.length }); continue; }
      if (w.place) { if (n.parent.layoutMode && n.parent.layoutMode !== "NONE") n.layoutPositioning = "ABSOLUTE"; n.x = w.place.x; n.y = w.place.y; out.swapped.push({ id: n.id, placed: [n.x, n.y] }); continue; }
      if (w.move) { // move: place target so its top-left sits at an anchor's bottom-right/left (+dy), in target's parent space
        let a = w.move.anchor ? await figma.getNodeByIdAsync(w.move.anchor) : null;
        if (!a && w.move.anchorText) { const cont = await figma.getNodeByIdAsync(w.move.within); a = cont.findAll(x => x.type === "TEXT" && x.characters === w.move.anchorText && x.absoluteRenderBounds !== null)[w.move.nth || 0]; if (a) { let q = a; while (q.parent && q.parent !== cont && q.width < 40) q = q.parent; a = q; } }
        if (!a) { warnings.push("move anchor not found"); continue; }
        if (n.parent.layoutMode && n.parent.layoutMode !== "NONE") n.layoutPositioning = "ABSOLUTE";
        const ab = a.absoluteBoundingBox, pb = n.parent.absoluteTransform;
        const ax = w.move.alignRight ? ab.x + ab.width - n.width : ab.x; n.x = ax - pb[0][2]; n.y = ab.y + ab.height + (w.move.dy || 0) - pb[1][2];
        out.swapped.push({ id: n.id, moved: [n.x, n.y] }); continue; }
      const p = n.parent, i = p.children.indexOf(n), W = n.width, H = n.height, nm = n.name, wasAbs = n.layoutPositioning === "ABSOLUTE", ox = n.x, oy = n.y;
      let inst;
      if (w.donor) { // graft: replace target with a clone of an existing (redesigned) layer, then retext it
        const d = await figma.getNodeByIdAsync(w.donor); if (!d) { warnings.push("graft donor missing " + w.donor); continue; }
        inst = d.clone(); p.insertChild(i, inst); try { inst.layoutSizingHorizontal = d.layoutSizingHorizontal; } catch (e) {} if (w.keepOld) { inst.x = n.x; inst.y = n.y; }
        if (w.retext) { const tgt = inst.findOne(x => x.name === w.retext.name); if (tgt) await setTexts(tgt, w.retext.text); else warnings.push("graft retext target missing " + w.retext.name); }
        for (const nm of w.hideNames || []) for (const h of inst.findAll(x => x.name === nm)) h.visible = false;
        for (const kid of w.keep || []) { const kn = await figma.getNodeByIdAsync(kid); if (kn) inst.insertChild(inst.children.length - 1, kn); } // move nodes (e.g. a list icon) in before the last child
        if (w.props) { const norm = x => String(x).replace(/[^a-z0-9 ]/gi, "").trim().toLowerCase(); const defs = inst.componentProperties, o = {}; for (const [k, v] of Object.entries(w.props)) { const full = Object.keys(defs).find(dd => norm(dd.split("#")[0]) === norm(k)) || k; o[full] = defs[full] && defs[full].type === "BOOLEAN" ? (v === true || v === "true") : v; } try { inst.setProperties(o); } catch (e) { warnings.push("graft props: " + e.message); } }
        for (const [name, txt, nth] of w.texts || []) { const hits = inst.findAll(x => x.name === name); const h = hits[nth || 0]; if (!h) { warnings.push("graft text layer missing " + name); continue; }
          const t = h.type === "TEXT" ? h : h.findOne(x => x.type === "TEXT"); await figma.loadFontAsync(t.fontName); t.characters = txt; }
      } else {
        const comp = w.comp ? await component(w.comp, w.props) : await figma.importComponentByKeyAsync(w.key); inst = comp.createInstance();
        if (!w.comp && (w.size || (W && H))) inst.resize(w.size || W, w.size || H); p.insertChild(i, inst);
        if (w.fill) { try { inst.layoutSizingHorizontal = "FILL"; } catch (e) { warnings.push("fill " + w.target + ": " + e.message); } }
        if (w.text) await setTexts(inst, w.text);
        for (const sub of w.hideTexts || []) inst.findAll(x => x.type === "TEXT" && x.characters.includes(sub)).forEach(x => { x.visible = false; });
        for (const q of w.hide || []) { const hs = inst.findAll(x => (x.name === q.name || (q.prefix && x.name.startsWith(q.name))) && (q.w == null || Math.round(x.width) === q.w) && x.visible !== false && x.absoluteRenderBounds !== null); const tg = q.all ? hs : hs[q.nth || 0] ? [hs[q.nth || 0]] : []; if (!tg.length) warnings.push("hide: nothing for " + q.name); tg.forEach(x => { try { x.visible = false; } catch (e) { warnings.push("hide " + q.name + ": " + e.message); } }); }
        for (const q of w.show || []) { const hs = inst.findAll(x => x.name === q.name); const t = hs[q.nth || 0]; if (t) t.visible = true; }
        for (const [f, r, nth] of w.replaceTexts || []) { let ts = inst.findAll(x => x.type === "TEXT" && x.characters.includes(f) && x.absoluteRenderBounds !== null); if (!ts.length) ts = inst.findAll(x => x.type === "TEXT" && x.characters.includes(f)); const t = ts[nth || 0]; if (!t) { warnings.push("replaceTexts missing: " + f.slice(0, 30)); continue; } for (const g of t.getStyledTextSegments(["fontName"])) await figma.loadFontAsync(g.fontName); t.characters = r; }
      }
      if (!w.keepOld) { out.remap.push({ from: n.id, to: inst.id }); discard(n); } if (w.name) inst.name = w.name; if (wasAbs) { try { inst.layoutPositioning = "ABSOLUTE"; inst.x = ox; inst.y = oy; } catch (e) {} }
      out.swapped.push({ id: inst.id, name: inst.name }); (out.remap = out.remap || []).push({ from: w.target, to: inst.id }); // chips in chat that point at the old node follow it to the new one
    } catch (e) { warnings.push("swap " + w.target + " failed: " + String((e && e.message) || e).slice(0, 200)); }
  }
  return out;
}
// ---- journal: every changing swap job records what it did (trashed nodes, replaced-by ids, old property values); {revertLast:true} undoes exactly that job.
// Native figma.triggerUndo was tested and is NOT reliable (it reverted more than the last job), so this uses an explicit inverse log instead.
const READONLY = ["probe", "find", "findIn", "listSet", "listChildren", "ancestry", "textSegs", "apiProbe", "checkEdited", "fileKey", "journal", "revertLast", "revertAll"];
async function revertJob(j) {
  const rep = { restored: 0, removed: 0, props: 0, kept: [] };
  const get = id => figma.getNodeByIdAsync(id);
  for (const q of [...j.props].reverse()) { try { const n = await get(q.id); if (n) { if (q.k === "characters" && n.fontName !== figma.mixed) await figma.loadFontAsync(n.fontName); n[q.k] = q.old; rep.props++; } } catch (e) {} }
  for (const q of [...j.sizes].reverse()) { try { const n = await get(q.id); if (n) n.resize(q.w, q.h); } catch (e) {} }
  for (const id of j.created) { try { const n = await get(id); if (!n) continue; if (editedSince(n)) { rep.kept.push(n.name + " " + id); continue; } n.remove(); rep.removed++; } catch (e) {} }
  for (const q of [...j.trashed].reverse()) { try { const n = await get(q.id); if (!n) continue; if (q.hide) { n.visible = true; rep.restored++; continue; } const par = await get(q.pid); if (par) { par.insertChild(Math.min(q.idx, par.children.length), n); n.visible = true; rep.restored++; } } catch (e) {} }
  return rep;
}
async function swapJob(spec) {
  if (!CACHE.journal) CACHE.journal = [];
  if (spec.journal) return { swapped: [], roots: [], warnings: [], journal: CACHE.journal.slice(-10).map(j => ({ n: j.n, at: j.at, op: j.op, trashed: j.trashed.length, props: j.props.length, created: j.created.length, reversible: j.reversible })) };
  if (spec.revertLast || spec.revertAll) {
    const reports = []; let guard = spec.revertAll ? 30 : 1;
    while (guard-- > 0 && CACHE.journal.length) {
      const j = CACHE.journal[CACHE.journal.length - 1];
      if (!j.reversible) { reports.push({ job: j.n, op: j.op, reverted: false, reason: "this kind of job cannot be reverted automatically (" + j.why + ")" }); break; }
      const r = await revertJob(j); CACHE.journal.pop(); reports.push({ job: j.n, op: j.op, reverted: true, ...r });
    }
    if (!reports.length) reports.push({ reverted: false, reason: "no job in the journal" });
    return { swapped: [], roots: [], warnings: [], reverts: reports };
  }
  const changing = !READONLY.some(k => k in spec);
  const KNOWN = ["textAlignIn", "textResetIn", "replaceLib", "badgeCells", "dropdownMenus", "swapMarks", "alertFrom", "bubbleFrom", "wrapInstances", "journeyRow", "splitColumns", "replaceText", "swapComp", "menuIcons"];
  const opKey = Object.keys(spec).find(k => k !== "swaps" && k !== "darkMode" ) || "swaps";
  if (changing) CACHE.cur = { props: [], trashed: [], sizes: [], created: [] };
  let out;
  try { out = await swapJobInner(spec); } finally { /* keep CACHE.cur until journaled below */ }
  const nz = v => Array.isArray(v) ? v.length > 0 : typeof v === "number" ? v > 0 : !!v;
  const cur = CACHE.cur; CACHE.cur = null;
  if (changing && cur) {
    const created = new Set(); for (const r of (out.remap || [])) if (r && r.to) created.add(r.to);
    for (const id of (out.placed || [])) if (typeof id === "string") created.add(id);
    for (const d of (Array.isArray(out.done) ? out.done : [])) { if (typeof d === "string") created.add(d); else if (d && d.id) created.add(d.id); }
    if (out.section) created.add(out.section);
    for (const id of created) { try { const n = await figma.getNodeByIdAsync(id); if (n) stamp(n); } catch (e) {} }
    const ids = [...created];
    const didChange = ids.length || cur.trashed.length || cur.props.length || nz(out.swapped) || nz(out.changed);
    if (didChange) {
      // creation-only ops that do not report ids (newFrames, edit of unreported nodes...) are flagged so a revert never half-applies
      const unknownCreate = (out.swapped || []).some(x => x && x.name && x.id && !ids.includes(x.id) && /Col \/|Header spacer|Row cell/.test(x.name));
      const reversible = !unknownCreate;
      CACHE.journal.push({ n: (CACHE.seq = (CACHE.seq || 0) + 1), at: new Date().toISOString(), op: opKey, props: cur.props, trashed: cur.trashed, sizes: cur.sizes, created: ids, reversible, why: reversible ? "" : "it creates frames that are not tracked" });
      if (CACHE.journal.length > 40) CACHE.journal.shift();
    }
  }
  return out;
}
if (SCREEN.SWAP) return await swapJob(SCREEN.SWAP);

// ---- mobilize job: clone a desktop frame and re-flow it to 360px with the rules the senior mobile reference follows ----
async function mobilizeJob(spec) {
  const W = spec.width || 360, SIDE = spec.side || 20, INNER = W - 2 * SIDE;
  const src = await figma.getNodeByIdAsync(spec.source); if (!src) throw new Error("source not found " + spec.source);
  const c = src.clone(); c.name = spec.name; c.setPluginData("clause:root", "1"); c.x = src.x + src.width + 200; c.y = src.y;
  const stats = { rows: 0, wrapped: 0, texts: 0, images: 0, widths: 0 }; const FOK = {};
  const O = new Map(); (function rec(n) { O.set(n.id, { w: n.width, h: n.height }); if ("children" in n) n.children.forEach(rec); })(c); // ORIGINAL desktop sizes: decisions must not depend on widths already shrunk by a parent
  const ow = k => (O.get(k.id) || { w: k.width }).w;
  c.layoutSizingHorizontal = "FIXED"; c.resize(W, c.height);
  const fsMap = fs => fs >= 44 ? Math.round(fs * 0.75) : fs >= 36 ? Math.round(fs * 0.75) : fs >= 28 ? Math.round(fs * 0.8) : (fs === 16 && spec.eyebrow16to14) ? fs : fs;
  const inAL = n => n.parent && "layoutMode" in n.parent && n.parent.layoutMode !== "NONE";
  const isInstanceInner = n => { let p = n.parent; while (p) { if (p.type === "INSTANCE") return true; p = p.parent; } return false; };
  async function fit(n, depth) {
    if (n.visible === false) return;
    if (n.type === "TEXT") {
      stats.texts++;
      try {
        if (!isInstanceInner(n)) {
          const segs = n.getStyledTextSegments(["fontName", "fontSize"]); let fontsOk = true; for (const g of segs) { const fk = g.fontName.family + "|" + g.fontName.style; if (!(fk in FOK)) { try { await figma.loadFontAsync(g.fontName); FOK[fk] = true; } catch (e) { FOK[fk] = false; warnings.push("font not loadable: " + fk + " — " + String(e.message).slice(0, 80)); } } if (!FOK[fk]) fontsOk = false; } if (!fontsOk) return;
          const fs = n.fontSize; if (fs !== figma.mixed) { const t = fsMap(fs); if (t !== fs) { n.fontSize = t; if (n.lineHeight !== figma.mixed && n.lineHeight.unit === "PIXELS") n.lineHeight = { unit: "PIXELS", value: Math.round(t * n.lineHeight.value / fs) }; } }
          else for (const g of segs) { const t = fsMap(g.fontSize); if (t !== g.fontSize) n.setRangeFontSize(g.start, g.end, t); }
          n.textAutoResize = "HEIGHT";
          if (inAL(n) && n.layoutPositioning !== "ABSOLUTE" && n.width > 60) n.layoutSizingHorizontal = "FILL";
        }
      } catch (e) { warnings.push("text " + n.name + ": " + e.message); }
      return;
    }
    if (n.type === "INSTANCE" && spec.detachLarge !== false && (n.height > 150 || n.width > 600) && !isInstanceInner(n)) {
      // big layout components keep their desktop structure inside: detach this clone's copy so it can be re-flowed (the desktop original stays linked)
      try { const nm = n.name; const f = n.detachInstance(); (stats.detached = stats.detached || []).push(nm); await fit(f, depth); return; } catch (e) { warnings.push("detach " + n.name + ": " + e.message); }
    }
    if (n.type === "INSTANCE" || n.type === "COMPONENT") {
      try { if (n.width > INNER && inAL(n) && n.layoutPositioning !== "ABSOLUTE") { n.layoutSizingHorizontal = "FILL"; stats.widths++; } } catch (e) {}
      return; // component internals stay as designed
    }
    if (!("children" in n)) {
      if ((n.type === "RECTANGLE" || n.type === "ELLIPSE") && n.width > INNER && n.layoutPositioning !== "ABSOLUTE") { try { const r = INNER / n.width; n.resize(INNER, Math.max(1, Math.round(n.height * r))); if (inAL(n)) n.layoutSizingHorizontal = "FILL"; stats.images++; } catch (e) {} }
      return;
    }
    if ((spec.keep || []).includes(n.name)) { try { n.clipsContent = true; if (inAL(n)) { n.layoutSizingHorizontal = "FILL"; } else n.resize(Math.min(n.width, W), n.height); if ("layoutMode" in n && n.layoutMode !== "NONE") n.layoutSizingVertical = "HUG"; stats.kept = (stats.kept || 0) + 1; } catch (e) { warnings.push("keep " + n.name + ": " + e.message); } return; } // marquee-like rows: stay as designed, clipped to the frame
    // containers
    if (n.type === "FRAME" || n.type === "GROUP" || n.type === "COMPONENT") {
      if ("layoutMode" in n && n.layoutMode !== "NONE") {
        const kids = n.children.filter(k => k.visible !== false && k.layoutPositioning !== "ABSOLUTE");
        const total = kids.reduce((a, k) => a + ow(k), 0) + n.itemSpacing * Math.max(0, kids.length - 1);
        const iconRow = n.layoutMode === "HORIZONTAL" && kids.length >= 2 && kids.some(k => ow(k) <= 28 && k.height <= 28) && kids.filter(k => ow(k) > 28).length <= 1; // bullet/icon + content stays a row
        if (iconRow) { for (const k of kids) { try { if (ow(k) > 28 && (k.type === "TEXT" || "layoutMode" in k)) k.layoutSizingHorizontal = "FILL"; } catch (e) {} } }
        else if (n.layoutMode === "HORIZONTAL" && kids.length >= 2 && total > INNER) {
          if (kids.every(k => ow(k) <= 220 && k.height <= 60)) { n.layoutWrap = "WRAP"; n.counterAxisSpacing = Math.min(n.itemSpacing || 8, 12); stats.wrapped++; }
          else { n.layoutMode = "VERTICAL"; n.primaryAxisAlignItems = "MIN"; n.counterAxisAlignItems = "MIN"; n.itemSpacing = Math.max(16, Math.min(n.itemSpacing, 24)); stats.rows++; for (const k of kids) { try { k.layoutSizingHorizontal = "FILL"; if ("layoutMode" in k && k.layoutMode !== "NONE" && k.layoutSizingVertical === "FIXED") k.layoutSizingVertical = "HUG"; } catch (e) {} } }
        }
        // content may now be taller than the desktop height: hug vertically (decorative childless boxes keep their size)
        if (n.children.length > 0 && depth > 0) { try { if (n.layoutSizingVertical === "FIXED" || n.layoutSizingVertical === "FILL") n.layoutSizingVertical = "HUG"; } catch (e) {} }
        // paddings and gaps
        const cap = (v, lim, to) => v >= lim ? to : v;
        n.paddingLeft = cap(n.paddingLeft, 48, SIDE); n.paddingRight = cap(n.paddingRight, 48, SIDE);
        n.paddingTop = n.paddingTop >= 100 ? 60 : n.paddingTop >= 60 ? 40 : n.paddingTop; n.paddingBottom = n.paddingBottom >= 100 ? 60 : n.paddingBottom >= 60 ? 40 : n.paddingBottom;
        if (n.layoutMode === "VERTICAL") n.itemSpacing = n.itemSpacing >= 100 ? 60 : n.itemSpacing >= 60 ? 40 : n.itemSpacing;
        // width
        if (n.width > W && depth > 0) { try { if (inAL(n)) { n.layoutSizingHorizontal = "FILL"; } else n.resize(W, n.height); stats.widths++; } catch (e) {} }
        else if (depth > 0 && n.width > INNER && inAL(n) && n.layoutSizingHorizontal === "FIXED") { try { n.layoutSizingHorizontal = "FILL"; stats.widths++; } catch (e) {} }
        if (n.layoutMode === "VERTICAL" && n.counterAxisSizingMode === "FIXED" && depth > 0) { /* keep */ }
      }
    }
    for (const k of [...n.children]) await fit(k, depth + 1);
  }
  await fit(c, 0);
  async function setParts(t, find, parts) {
    const segs = t.getStyledTextSegments(["fontName", "fontSize", "fills", "lineHeight", "letterSpacing"]); const full = t.characters;
    if (!full.includes(find)) { warnings.push("block text not found: " + find.slice(0, 30)); return; }
    for (const g of segs) await figma.loadFontAsync(g.fontName);
    const styleOf = i => segs[Math.min(i, segs.length - 1)];
    let out = ""; const ranges = []; for (const [txt, si] of parts) { ranges.push([out.length, out.length + txt.length, si]); out += txt; }
    t.characters = out;
    for (const [a, b, si] of ranges) { const g = styleOf(si); if (b > a) { t.setRangeFontName(a, b, g.fontName); t.setRangeFontSize(a, b, g.fontSize); t.setRangeFills(a, b, g.fills); } }
  }
  for (const q of spec.blocks || []) {
    try {
      const hits = c.findAll(n => n.name === q.name && n.visible !== false); const old = hits[q.nth || 0]; if (!old) { warnings.push("block not found: " + q.name); continue; }
      const ref = await figma.getNodeByIdAsync(q.from); if (!ref) { warnings.push("block source missing " + q.from); continue; }
      const nn = ref.clone(); const par = old.parent, idx = par.children.indexOf(old); par.insertChild(idx, nn); old.remove();
      if (par.layoutMode && par.layoutMode !== "NONE") { try { nn.layoutSizingHorizontal = "FILL"; } catch (e) {} }
      for (const [find, parts] of q.texts || []) { const t = nn.findAll(x => x.type === "TEXT" && x.characters.includes(find))[0]; if (!t) { warnings.push("block text missing: " + find.slice(0, 30)); continue; } if (typeof parts === "string") { for (const g of t.getStyledTextSegments(["fontName"])) await figma.loadFontAsync(g.fontName); t.characters = t.characters.replace(find, parts); } else await setParts(t, find, parts); }
      (stats.blocks = stats.blocks || []).push(q.name);
    } catch (e) { warnings.push("block " + q.name + ": " + String((e && e.message) || e).slice(0, 160)); }
  }
  if (spec.hide) for (const q of spec.hide) { c.findAll(n => n.name === q.name).slice(q.nth || 0, q.all ? undefined : (q.nth || 0) + 1).forEach(h => { h.visible = false; }); }
  return { id: c.id, name: c.name, stats, roots: [], warnings };
}
if (SCREEN.MOBILIZE) return await mobilizeJob(SCREEN.MOBILIZE);
async function build0(n, parent) {
  let node;
  if (n.c) {
    const comp = await tm("component", component(n.c, n.p));
    const T_I = Date.now(); node = comp.createInstance(); if (n.i) node.setPluginData("clause:id", n.i); // layer keeps the component's own name; the JSON id lives in plugin data (clause:id)
    parent.appendChild(node); TM.inst = (TM.inst || 0) + (Date.now() - T_I); TM["inst:" + (n.i || comp.name)] = Date.now() - T_I;
    await tm("props", setBoolProps(node, n.p));
    await tm("ops", applyOps(node, n.ops));
    await tm("texts", setTexts(node, n.text));
    if (n.tint) await tintNode(node, n.tint);
    if (n.bg && n.bg !== "none" && "fills" in node) await bindFill(node, n.bg, "fill"); // fill override on the instance itself (spec: setting list item header)
    if (n.border === "none" && "strokes" in node) node.strokes = []; // drop the instance's own border when the outer container has one
    if (n.radius != null && "topLeftRadius" in node) for (const c of ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]) await bindNum(node, c, n.radius);
  } else if (n.t === "text") {
    const T_T = Date.now(); try { node = await buildText(n, parent); } finally { TM.text = (TM.text || 0) + (Date.now() - T_T); }
  } else if (n.t === "spacer") {
    node = figma.createFrame(); node.name = "spacer"; node.fills = []; node.resize(100, 1); parent.appendChild(node);
    node.layoutSizingHorizontal = parent.layoutMode === "HORIZONTAL" ? "FILL" : "FIXED";
    node.layoutSizingVertical = parent.layoutMode === "VERTICAL" ? "FILL" : "FIXED";
    created.push(node.id); return node;
  } else {
    node = figma.createFrame(); await tm("box", applyBox(node, n)); parent.appendChild(node);
    for (const ch of (n.children || [])) await build(ch, node);
  }
  size(node, n, parent);
  if (n.abs) { node.layoutPositioning = "ABSOLUTE"; node.x = n.abs.x; node.y = n.abs.y; }
  if (n.hidden) node.visible = false;
  created.push(node.id);
  return node;
}
// place root frames to the right of existing content
const T_START = Date.now();
let x = 0, replaced = false;
const wanted = new Set(SCREENS.map(([nm]) => TITLE + (SCREENS.length > 1 ? " — " + nm : "")));
const T_RM = Date.now(); const OLD = new Set(SCREEN.OLD_ROOTS || []);
const stale = page.children.filter(n => n.type === "FRAME" && wanted.has(n.name) && !OLD.has(n.id));
if (stale.length) { x = Math.min(...stale.map(n => n.x)); replaced = true; for (const n of stale) n.remove(); }
// sweep leftovers of earlier FAILED builds of this screen (Clause-made, never finished/tagged, not the frame being replaced) — works even with an older plugin wrapper
{ const secN = SCREEN.SECTION ? await figma.getNodeByIdAsync(SCREEN.SECTION) : null; const pools = [page.children]; if (secN && secN.children) pools.push(secN.children); let swept = 0;
  for (const pool of pools) for (const n of [...pool]) if (n.type === "FRAME" && !OLD.has(n.id) && !n.getPluginData("clause:screen") && (n.getPluginData("clause:root") || n.getPluginData("clause:section")) && n.name === TITLE) { n.remove(); swept++; }
  if (swept) warnings.push("removed " + swept + " leftover frame(s) from earlier failed builds"); }
const oldRoots = []; for (const id of OLD) { const n = await figma.getNodeByIdAsync(id); if (n) oldRoots.push(n); }
// reuse index: top-level children of the previous build, by name → { node, hash }
const REUSE = new Map(); for (const r of oldRoots) for (const ch of r.children) { const h = ch.getPluginData("clause:hash"); if (h) REUSE.set(ch.getPluginData("clause:id") || ch.name, { node: ch, hash: h }); }
const SALT = JSON.stringify([COMPS, VARS, STYLES]).length + ":" + (SCREEN.RT_HASH || "") + ":n4";
const hashOf = o => { const str = SALT + JSON.stringify(o); let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return String(h); };
// "at": the frame the user gave you. Build beside it, in its parent, so the result is never somewhere else.
let pos = POS || null;
if (AT && !pos) {
  const at = await figma.getNodeByIdAsync(AT);
  if (!at) warnings.push("at: frame not found " + AT);
  else if (typeof at.x !== "number" || typeof at.width !== "number") warnings.push("at: " + AT + " is a " + at.type + ", not a frame you can place beside");
  else {
    let anc = at; while (anc.parent && anc.parent.type !== "PAGE") anc = anc.parent;
    const home = anc.parent || null;
    if (home && home.id !== page.id) warnings.push("at: that frame is on page \"" + home.name + "\", not \"" + page.name + "\"");
    else {
      if (at.parent && at.parent.type === "SECTION") SCREEN.SECTION = at.parent.id;
      pos = { x: at.x + at.width + 160, y: at.y };
    }
  }
}
if (REPLACE) { const old = await figma.getNodeByIdAsync(REPLACE); if (old) { x = old.x; old.remove(); replaced = true; } }
if (pos) { x = pos.x; replaced = true; }
if (!replaced) for (const ch of page.children) x = Math.max(x, ch.x + ch.width + 200);
TM.prep = Date.now() - T_RM;
const roots = [], rootNodes = [];
for (const [name, tree] of SCREENS) {
  const rootF = figma.createFrame(); rootF.name = TITLE + (SCREENS.length > 1 ? " — " + name : ""); rootF.setPluginData("clause:root", "1"); (C.pending || (C.pending = [])).push(rootF.id); // tracked so a failed build can be cleaned up
  const SEC = SCREEN.SECTION ? await figma.getNodeByIdAsync(SCREEN.SECTION) : null;
  if (SEC && SEC.type === "SECTION") {
    // build inside a Section: positions are section-relative; new screens go to the right of the last frame; the section grows to fit
    SEC.appendChild(rootF);
    const kids = SEC.children.filter(c => c !== rootF && c.type !== "SECTION");
    rootF.x = pos ? pos.x : kids.length ? Math.max(...kids.map(c => c.x + c.width)) + 160 : 80; rootF.y = pos ? pos.y : kids.length ? Math.min(...kids.map(c => c.y)) : 80;
    rootF.setPluginData("clause:section", "1");
  } else { page.appendChild(rootF); rootF.x = x; rootF.y = pos ? pos.y : 0; }
  await applyBox(rootF, Object.assign({ t: "stack" }, tree, { i: rootF.name }));
  rootF.resize(WIDTH, HEIGHT || 900);
  rootF.primaryAxisSizingMode = HEIGHT ? "FIXED" : "AUTO"; rootF.counterAxisSizingMode = "FIXED";
  if (!tree.bg && VARS["bg-primary"]) await bindFill(rootF, "bg-primary", "fill");
  else if (!tree.bg && !Object.keys(VARS).length) rootF.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]; // general design: a blank frame still reads as paper
  for (const ch of (tree.children || [])) {
    const h = ch.i ? hashOf(ch) : null; const prev = h && REUSE.get(ch.i);
    if (prev && prev.hash === h) { const T_R = Date.now(); rootF.appendChild(prev.node); REUSE.delete(ch.i); TM.reused = (TM.reused || 0) + (Date.now() - T_R); TM["reused:" + ch.i] = 1; continue; }
    const node = await build(ch, rootF); if (node && h) node.setPluginData("clause:hash", h);
  }
  roots.push(rootF.id); rootNodes.push(rootF); x += WIDTH + 200;
  if (pos) pos = { x: pos.x + WIDTH + 200, y: pos.y };
}
const T_VP = Date.now(); if (page.id === figma.currentPage.id) { for (const rn of rootNodes) { const sp = rn.parent; if (sp && sp.type === "SECTION") sp.resizeWithoutConstraints(Math.max(sp.width, rn.x + rn.width + 80), Math.max(sp.height, rn.y + rn.height + 80)); } if (!SCREEN.SILENT) figma.viewport.scrollAndZoomIntoView(rootNodes); } TM.viewport = Date.now() - T_VP;
const T_OLD = Date.now(); for (const r of oldRoots) { try { r.remove(); } catch (e) {} } TM.removeOld = Date.now() - T_OLD;
return { roots, title: TITLE, created: created.length, warnings, removedDuplicates: stale.length, timing: Object.assign({ totalMs: Date.now() - T_START }, TM) };
