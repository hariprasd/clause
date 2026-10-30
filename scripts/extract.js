// extract.js — runs in the Figma plugin (main thread). Walks a built frame and returns a DOM description:
//   { t: tag, a: attrs, s: style, c: children, x: text }
// Variable-bound values become CSS custom properties (--color-*, --spacing-*, --radius-*) with the resolved value as fallback.
// Instances keep their identity: data-component / data-variant (and data-c / data-p / data-i when the node came from a screen JSON).
const X_VEC = new Set(["VECTOR", "BOOLEAN_OPERATION", "LINE", "ELLIPSE", "STAR", "POLYGON", "RECTANGLE"]);
const X_NAV = /^(main-nav|clause-breadcrumb|breadcrumb-bar|secondary-navigation|platform-navigation)/;
let x_cache = { alias: {}, svg: {} };
let x_warn = [];
const x_r = n => Math.round(n * 100) / 100;
const x_px = n => x_r(n) + "px";
const x_slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function x_hex(c, a) {
  const h = v => Math.round(v * 255).toString(16).padStart(2, "0");
  return a != null && a < 1 ? "rgba(" + Math.round(c.r * 255) + ", " + Math.round(c.g * 255) + ", " + Math.round(c.b * 255) + ", " + x_r(a) + ")" : "#" + h(c.r) + h(c.g) + h(c.b);
}
async function x_var(id) {
  if (id in x_cache.alias) return x_cache.alias[id];
  let out = null;
  try {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) {
      const n = v.name;
      if (/^(Colors|Component)\//.test(n)) {
        let a = n.split("/").pop().replace(/\s*\(\d+\)$/, "");
        a = a.replace("utility-teal--100", "utility-teal-100").replace("utility-mulbery-950", "utility-mulberry-950").replace("utility-warm blue-950", "utility-warm-blue-950");
        if (n.indexOf("Harbor Teal/utility-teal-950") >= 0) a = "utility-harbor-teal-950";
        out = "--color-" + a;
      } else if (/^(spacing|radius|width)-/.test(n)) out = "--" + n;
    }
  } catch (e) {}
  return (x_cache.alias[id] = out);
}
async function x_paint(p, nodeOpacity) {
  if (!p || p.type !== "SOLID" || p.visible === false) return null;
  const op = (p.opacity == null ? 1 : p.opacity) * (nodeOpacity == null ? 1 : nodeOpacity);
  const id = p.boundVariables && p.boundVariables.color && p.boundVariables.color.id;
  const v = id ? await x_var(id) : null;
  if (v) return op >= 1 ? "var(" + v + ", " + x_hex(p.color) + ")" : "color-mix(in srgb, var(" + v + ", " + x_hex(p.color) + ") " + Math.round(op * 100) + "%, transparent)";
  return x_hex(p.color, op);
}
async function x_num(n, field, value) {
  const b = n.boundVariables && n.boundVariables[field];
  const id = b && (b.id || (Array.isArray(b) && b[0] && b[0].id));
  if (id) { const v = await x_var(id); if (v) return "var(" + v + ", " + x_px(value) + ")"; }
  return x_px(value);
}
const x_firstPaint = list => (list && list !== figma.mixed ? list.find(p => p.visible !== false && p.type === "SOLID") : null);
function x_leaves(n) { return "children" in n ? n.children.filter(c => c.visible).flatMap(x_leaves) : [n]; }
// A glyph is an icon-like INSTANCE (or bare vector) made only of vector leaves — never a plain frame (those carry layout and tokens).
function x_isGlyph(n) {
  if (n.type === "TEXT") return false;
  if (X_VEC.has(n.type)) return true;
  if (n.type !== "INSTANCE" || n.width > 512 || n.height > 160) return false;
  const l = x_leaves(n);
  return l.length > 0 && l.every(k => X_VEC.has(k.type));
}
function x_hasFrameFill(n) {
  if (n.type !== "TEXT" && !X_VEC.has(n.type) && x_firstPaint(n.fills)) return true;
  return "children" in n && n.children.some(c => c.visible && x_hasFrameFill(c));
}
async function x_glyphColor(n) {
  for (const k of x_leaves(n)) {
    const p = x_firstPaint(k.strokes) || x_firstPaint(k.fills);
    if (p) return await x_paint(p, 1);
  }
  return null;
}
async function x_svg(n) {
  const main = n.type === "INSTANCE" ? await n.getMainComponentAsync() : null;
  const key = main ? main.id + ":" + Math.round(n.width) + "x" + Math.round(n.height) : null;
  if (key && x_cache.svg[key]) return x_cache.svg[key];
  let svg = await n.exportAsync({ format: "SVG_STRING" });
  const tile = n.type === "INSTANCE" && x_hasFrameFill(n);
  if (!tile) svg = svg.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,8}|rgb[^"]*)"/g, '$1="currentColor"');
  svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1").replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1");
  if (key) x_cache.svg[key] = svg;
  return svg;
}
function x_sizing(n, parent, st) {
  const pm = parent && "layoutMode" in parent ? parent.layoutMode : "NONE";
  if (!parent || n.layoutPositioning === "ABSOLUTE" || pm === "NONE") {
    if (parent) { st.position = "absolute"; st.left = x_px(n.x); st.top = x_px(n.y); }
    st.width = x_px(n.width); st.height = x_px(n.height); st["flex-shrink"] = "0";
    return;
  }
  const row = pm === "HORIZONTAL";
  const sh = n.layoutSizingHorizontal, sv = n.layoutSizingVertical;
  if (sh === "FIXED") { st.width = x_px(n.width); st["flex-shrink"] = "0"; }
  else if (sh === "FILL") { if (row) { st.flex = "1 1 0"; st["min-width"] = "0"; } else st["align-self"] = "stretch"; }
  if (sv === "FIXED") { st.height = x_px(n.height); st["flex-shrink"] = "0"; }
  else if (sv === "FILL") { if (!row) { st.flex = "1 1 0"; st["min-height"] = "0"; } else st["align-self"] = "stretch"; }
}
const X_J = { MIN: "flex-start", CENTER: "center", MAX: "flex-end", SPACE_BETWEEN: "space-between", BASELINE: "baseline" };
async function x_box(n, st) {
  st.position = st.position || "relative";
  if (n.layoutMode && n.layoutMode !== "NONE") {
    st.display = "flex"; st["flex-direction"] = n.layoutMode === "HORIZONTAL" ? "row" : "column";
    if (n.layoutWrap === "WRAP") { st["flex-wrap"] = "wrap"; if (n.counterAxisSpacing) st["row-gap"] = await x_num(n, "counterAxisSpacing", n.counterAxisSpacing); }
    if (n.itemSpacing) st.gap = await x_num(n, "itemSpacing", n.itemSpacing);
    const pads = [await x_num(n, "paddingTop", n.paddingTop || 0), await x_num(n, "paddingRight", n.paddingRight || 0), await x_num(n, "paddingBottom", n.paddingBottom || 0), await x_num(n, "paddingLeft", n.paddingLeft || 0)];
    if (pads.some(p => p !== "0px")) st.padding = pads.join(" ");
    st["justify-content"] = X_J[n.primaryAxisAlignItems] || "flex-start";
    st["align-items"] = X_J[n.counterAxisAlignItems] || "flex-start";
  }
  const nop = n.opacity === undefined ? 1 : n.opacity;
  const fill = x_firstPaint(n.fills);
  if (fill) st.background = await x_paint(fill, 1);
  const stroke = x_firstPaint(n.strokes);
  if (stroke) {
    const c = await x_paint(stroke, 1);
    const sides = ["Top", "Right", "Bottom", "Left"].map(s => n["stroke" + s + "Weight"] != null ? n["stroke" + s + "Weight"] : n.strokeWeight);
    const style = n.dashPattern && n.dashPattern.length ? "dashed" : "solid";
    if (sides.every(w => w === sides[0])) st.border = x_px(sides[0]) + " " + style + " " + c;
    else sides.forEach((w, i) => { if (w) st["border-" + ["top", "right", "bottom", "left"][i]] = x_px(w) + " " + style + " " + c; });
  }
  if (n.type === "ELLIPSE") st["border-radius"] = "50%";
  else if ("topLeftRadius" in n) {
    const r = [await x_num(n, "topLeftRadius", n.topLeftRadius), await x_num(n, "topRightRadius", n.topRightRadius), await x_num(n, "bottomRightRadius", n.bottomRightRadius), await x_num(n, "bottomLeftRadius", n.bottomLeftRadius)];
    if (r.some(v => v !== "0px")) st["border-radius"] = r.every(v => v === r[0]) ? r[0] : r.join(" ");
  }
  const blur = (n.effects || []).find(x => x.visible !== false && x.type === "BACKGROUND_BLUR");
  if (blur) st["backdrop-filter"] = "blur(" + x_px(blur.radius) + ")";
  if (n.effects && n.effects.length) {
    const sh = n.effects.filter(e => e.visible !== false && (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW")).map(e => (e.type === "INNER_SHADOW" ? "inset " : "") + x_px(e.offset.x) + " " + x_px(e.offset.y) + " " + x_px(e.radius) + " " + x_px(e.spread || 0) + " " + x_hex(e.color, e.color.a));
    if (sh.length) st["box-shadow"] = sh.join(", ");
  }
  if (nop !== 1) st.opacity = String(x_r(nop));
  if (n.clipsContent) st.overflow = "hidden";
}
async function x_text(n, parent) {
  const st = {}, a = { class: "clause-t" };
  x_sizing(n, parent, st);
  delete st.height; // text height follows line-height
  if (n.textAutoResize === "WIDTH_AND_HEIGHT") { st["white-space"] = "pre"; delete st.width; }
  if (n.textAlignHorizontal === "CENTER") st["text-align"] = "center"; else if (n.textAlignHorizontal === "RIGHT") st["text-align"] = "right";
  if (n.textTruncation === "ENDING" && n.maxLines) { st.display = "-webkit-box"; st["-webkit-line-clamp"] = String(n.maxLines); st["-webkit-box-orient"] = "vertical"; st.overflow = "hidden"; }
  const p = x_firstPaint(n.fills);
  if (p) st.color = await x_paint(p, n.opacity);
  let styleName = null;
  try { if (n.textStyleId && n.textStyleId !== figma.mixed) { const s = await figma.getStyleByIdAsync(n.textStyleId); if (s) styleName = s.name; } } catch (e) {}
  if (styleName) {
    a.class += " ts-" + x_slug(styleName); a["data-style"] = styleName;
    try { const s = await figma.getStyleByIdAsync(n.textStyleId); if (n.fontSize !== figma.mixed && s && n.fontSize !== s.fontSize) { st["font-size"] = x_px(n.fontSize); if (n.lineHeight !== figma.mixed && n.lineHeight.unit === "PIXELS") st["line-height"] = x_px(n.lineHeight.value); } } catch (e) {}
  }
  else if (n.fontName !== figma.mixed) {
    st["font-family"] = '"' + n.fontName.family + '", system-ui, sans-serif';
    st["font-size"] = x_px(n.fontSize);
    st["font-weight"] = /bold/i.test(n.fontName.style) ? "700" : /semi/i.test(n.fontName.style) ? "600" : /medium/i.test(n.fontName.style) ? "500" : "400";
    if (n.lineHeight !== figma.mixed && n.lineHeight.unit === "PIXELS") st["line-height"] = x_px(n.lineHeight.value);
  }
  if (n.textDecoration === "UNDERLINE") st["text-decoration"] = "underline";
  if (n.fontName === figma.mixed) {
    const segs = n.getStyledTextSegments(["fontName", "fontSize"]);
    const kids = segs.map(g => {
      const s2 = {}, f = g.fontName;
      if (/mono/i.test(f.family)) { s2["font-family"] = "var(--font-code)"; s2["font-size"] = "0.92em"; s2.background = "var(--color-bg-tertiary, #f2f0ee)"; s2.padding = "1px 5px"; s2["border-radius"] = "4px"; }
      if (/semi|bold/i.test(f.style)) s2["font-weight"] = "600";
      if (/italic/i.test(f.style)) s2["font-style"] = "italic";
      return { t: "span", a: {}, s: s2, x: g.characters };
    });
    return { t: "span", a, s: st, c: kids };
  }
  return { t: "span", a, s: st, x: n.characters };
}
async function x_node(n, parent, scene) {
  try { return await x_node1(n, parent, scene); }
  catch (e) { x_warn.push(n.name + " (" + n.type + "): " + ((e && e.message) || e)); return null; }
}
async function x_node1(n, parent, scene) {
  if (!n.visible) return null;
  if (n.type === "TEXT") return x_text(n, parent);
  const st = {}, a = {};
  x_sizing(n, parent, st);
  if (x_isGlyph(n)) {
    const col = await x_glyphColor(n);
    if (col) st.color = col;
    st.display = "inline-flex"; st.width = x_px(n.width); st.height = x_px(n.height); st["flex-shrink"] = "0";
    return { t: "span", a: Object.assign({ class: "clause-icon", "aria-hidden": "true" }, n.type === "INSTANCE" ? { "data-component": n.name } : {}), s: st, h: await x_svg(n) };
  }
  if (!("children" in n) && n.type !== "RECTANGLE" && n.type !== "ELLIPSE") return null;
  let tag = "div";
  if (n.type === "INSTANCE") {
    const main = await n.getMainComponentAsync();
    const setName = main ? (main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name) : n.name;
    a["data-component"] = setName;
    const props = n.componentProperties || {}, vr = {};
    for (const k of Object.keys(props)) if (props[k].type === "VARIANT") vr[k] = props[k].value;
    if (Object.keys(vr).length) a["data-variant"] = JSON.stringify(vr);
    if (/^Buttons?\b/i.test(setName)) { tag = "button"; a.type = "button"; }
    const sc = scene[n.name];
    if (sc) { a["data-c"] = sc.c; a["data-i"] = n.name; if (sc.p) a["data-p"] = JSON.stringify(sc.p); if (X_NAV.test(sc.c)) tag = "nav"; }
  } else if (scene[n.name] && scene[n.name].t) a["data-i"] = n.name;
  await x_box(n, st);
  if (tag === "button") { st.cursor = "pointer"; st.font = "inherit"; st.margin = "0"; if (!st.background) st.background = "none"; if (!st.border) st.border = "0"; }
  const kids = [];
  if ("children" in n) for (const ch of n.children) { const k = await x_node(ch, n, scene); if (k) kids.push(k); }
  return { t: tag, a, s: st, c: kids };
}
function x_sceneMap(S) {
  const m = {};
  const walk = t => { if (!t) return; if (t.i) m[t.i] = { c: t.c, p: t.p, t: t.t }; (t.children || []).forEach(walk); };
  for (const [, tree] of S.SCREENS) walk(tree);
  return m;
}
// returns [{ name, dom }] — one entry per root frame, in SCREEN order
async function extractDom(rootIds, S, CACHE) {
  if (CACHE) x_cache = CACHE.x || (CACHE.x = { alias: {}, svg: {} });
  x_warn = [];
  const scene = x_sceneMap(S), out = [];
  for (let i = 0; i < rootIds.length; i++) {
    const root = await figma.getNodeByIdAsync(rootIds[i]);
    const st = { width: x_px(root.width), height: x_px(root.height), position: "relative", overflow: "hidden" };
    await x_box(root, st);
    st.width = x_px(root.width); st.height = x_px(root.height);
    const kids = [];
    for (const ch of root.children) { const k = await x_node(ch, root, scene); if (k) kids.push(k); }
    out.push({ name: S.SCREENS[i] ? S.SCREENS[i][0] : root.name, dom: { t: "div", a: { class: "clause-frame", "data-clause-root": "", "data-frame": root.name }, s: st, c: kids } });
  }
  return { screens: out, warnings: x_warn };
}
