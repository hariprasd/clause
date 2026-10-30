// Clause Assist — annotate = selection → context. Runs in code.js. Draws nothing on the canvas; stores nothing in the file.
const clScreen = n => { try { return n.getPluginData("clause:screen") || null; } catch (e) { return null; } };
async function clCtx(n) {
  const o = { id: n.id, name: n.name, type: n.type, w: Math.round(n.width), h: Math.round(n.height) };
  const path = []; let p = n.parent, screen = clScreen(n), inst = n.type === "INSTANCE" ? n : null;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") { path.unshift(p.name); const s = clScreen(p); if (s) screen = s; if (p.type === "INSTANCE") inst = p; p = p.parent; }
  let jid = null; for (let q = n; q && q.type !== "PAGE" && q.type !== "DOCUMENT"; q = q.parent) { let d = null; try { d = q.getPluginData("clause:id"); } catch (e) {} if (d) { jid = d; break; } if (q.type !== "INSTANCE" && !(q.parent && q.parent.type === "INSTANCE")) { /* frames/text built by Clause are named by their JSON id */ if (clScreen(q.parent || q) || (q.parent && q.parent.type === "FRAME")) { jid = jid || q.name; break; } } }
  o.jsonId = jid || n.name; o.path = path; o.screen = screen;
  try {
    if (inst) { const mc = await inst.getMainComponentAsync(); const set = mc && mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent : null; o.component = mc && (set ? set.name : mc.name); if (inst !== n) o.instance = { name: inst.name, id: inst.id }; o.props = {}; for (const [k, v] of Object.entries(inst.componentProperties)) o.props[k.split("#")[0]] = v.value; }
    if (n.type === "TEXT") { o.text = n.characters.slice(0, 200); const sid = n.textStyleId; if (sid && sid !== figma.mixed) { const st = await figma.getStyleByIdAsync(sid); o.textStyle = st && st.name; } }
    if ("layoutMode" in n && n.layoutMode !== "NONE") o.layout = { mode: n.layoutMode, gap: n.itemSpacing, pad: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft] };
  } catch (e) {}
  return o;
}
function clPrompt(items, file, page) {
  const L = ["Apply these " + items.length + " review comment" + (items.length === 1 ? "" : "s") + " from Figma (file: " + file + (FILE_KEY ? " [key " + FILE_KEY + "]" : " — key unknown: ask the user for the Figma link if you need to read it") + ", page: " + page + (PAGE_ID ? " [" + PAGE_ID + "]" : "") + "). Read CLAUDE.md first.",
    "Rules: edit screens/<screen>.json only (each target below lists its JSON id (`i`) — frames/text are named by it; component instances keep the component's own name and carry the id in plugin data; layers inside an instance → `ops`). Catalog components + tokens only, exact prop names, no raw hex. Lint clean, zero rebuild warnings, verify with `node scripts/inspect.mjs <nodeId> --raw` / `--vs`.", ""];
  items.forEach((it, i) => {
    L.push((i + 1) + ". " + it.text.replace(/\s*\n\s*/g, " ") + (it.tags.length ? "  [" + it.tags.join(", ") + "]" : ""));
    for (const t of it.targets) {
      L.push("   target: " + (t.jsonId || t.name) + (t.jsonId && t.jsonId !== t.name ? " [layer \"" + t.name + "\"]" : "") + " (" + t.type + (t.component ? " · " + t.component : "") + ") id " + t.id + " " + t.w + "×" + t.h + " · " + (t.screen ? "screen " + t.screen + " → screens/" + t.screen + ".json" : "not a Clause-built frame"));
      if (t.instance) L.push("     inside instance: " + t.instance.name + " id " + t.instance.id);
      if (t.path && t.path.length) L.push("     path: " + t.path.join(" › "));
      if (t.props && Object.keys(t.props).length) L.push("     props: " + JSON.stringify(t.props));
      if (t.text) L.push("     text: " + JSON.stringify(t.text) + (t.textStyle ? " · " + t.textStyle : ""));
      if (t.layout) L.push("     layout: " + t.layout.mode + " gap " + t.layout.gap + " pad [" + t.layout.pad + "]");
    }
  });
  return L.join("\n");
}
let selTimer = null; let FILE_KEY = null, PAGE_ID = null; try { FILE_KEY = figma.fileKey || null; } catch (e) {} const pageIdNow = () => { try { return figma.currentPage.id; } catch (e) { return null; } };
async function pushSel() {
  const sel = figma.currentPage.selection.slice(0, 12), out = [];
  for (const n of sel) out.push(await clCtx(n));
  figma.ui.postMessage({ type: "sel", nodes: out, page: figma.currentPage.name, file: figma.root.name });
}
figma.on("selectionchange", () => { clearTimeout(selTimer); selTimer = setTimeout(pushSel, 120); });
figma.on("currentpagechange", pushSel);
async function annMessage(msg) {
  if (msg.type === "sel-get") { await pushSel(); return true; }
  if (msg.type === "locate") { let n = await figma.getNodeByIdAsync(msg.id);
    if (!n && msg.name) { // the frame was rebuilt/replaced and its old id is gone: find the best same-named node on this page (most path elements in common wins, newest on ties)
      const want = String(msg.path || "").split("\u203a").filter(Boolean); let best = null, bs = -1;
      const pool = []; for (const t of figma.currentPage.children) { pool.push(t); if (t.type === "SECTION") for (const u of t.children) pool.push(u); } /* two levels only: findAll over the whole page froze the plugin on a 100k-node file */ for (const c of pool.filter(x => x.name === msg.name)) { let sc = 0; for (let a = c.parent; a && a.type !== "PAGE"; a = a.parent) if (want.includes(a.name)) sc++; if (sc >= bs) { bs = sc; best = c; } }
      n = best; }
    if (n) { figma.currentPage.selection = [n]; figma.viewport.scrollAndZoomIntoView([n]); } return true; }
  if (msg.type === "prompt") { PAGE_ID = pageIdNow(); figma.ui.postMessage({ type: "prompt", text: clPrompt(msg.items, figma.root.name, figma.currentPage.name), n: msg.items.length }); return true; }
  return false;
}
