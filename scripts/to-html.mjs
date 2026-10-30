// to-html.mjs — compiled SCREEN → standalone, token-driven HTML that round-trips into Figma.
//   • layout/primitives render with CSS vars named after the Figma variables (--color-bg-primary, --spacing-2xl …)
//   • component nodes render as <div class="clause-c" data-c data-p data-i> with a thumbnail (if the plugin exported one) or a labelled placeholder
//   • the full compiled scene is embedded in <script id="clause-scene"> — the Figma plugin imports THAT, so nothing is lost
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const J = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };
const catalog = (() => { const f = resolve(root, "ds/components.json"); if (!existsSync(f)) return new Map(); const c = JSON.parse(readFileSync(f, "utf8")); return new Map([...c.local, ...c.library].map(x => [x.key, x])); })();

const sp = v => (typeof v === "number" ? `${v}px` : `var(--spacing-${v})`);
const rd = v => (typeof v === "number" ? `${v}px` : `var(--radius-${v})`);
const col = v => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : `var(--color-${v}, ${v === "bg-primary" ? "#fff" : v === "text-primary" ? "#111" : "transparent"})`);

function box(n, parentDir, thumb) {
  const dir = n.t === "row" || n.dir === "row" ? "row" : "column";
  const st = [];
  if (n.t === "row" || n.t === "stack" || n.t === "box") {
    st.push("display:flex", `flex-direction:${dir}`);
    if (n.wrap) st.push("flex-wrap:wrap");
    if (n.gap != null) st.push(`gap:${sp(n.gap)}`);
    if (n.rowGap != null) st.push(`row-gap:${sp(n.rowGap)}`);
    const pt = n.pt ?? n.py ?? n.pad, pb = n.pb ?? n.py ?? n.pad, pl = n.pl ?? n.px ?? n.pad, pr = n.pr ?? n.px ?? n.pad;
    if ([pt, pb, pl, pr].some(x => x != null)) st.push(`padding:${[pt, pr, pb, pl].map(x => (x == null ? "0" : sp(x))).join(" ")}`);
    if (n.justify) st.push(`justify-content:${J[n.justify]}`);
    if (n.align) st.push(`align-items:${J[n.align]}`);
    if (n.bg) st.push(`background:${col(n.bg)}`);
    if (n.border) st.push(`border:1px ${n.dash ? "dashed" : "solid"} ${col(n.border)}`);
    if (n.borderB) st.push(`border-bottom:1px solid ${col(n.borderB)}`);
    if (n.borderL) st.push(`border-left:1px solid ${col(n.borderL)}`);
    if (n.borderT) st.push(`border-top:1px solid ${col(n.borderT)}`);
    if (n.borderR) st.push(`border-right:1px solid ${col(n.borderR)}`);
    if (n.opacity != null) st.push(`opacity:${n.opacity}`);
    if (n.bgBlur) st.push(`backdrop-filter:blur(${n.bgBlur}px)`);
    if (n.radius != null) st.push(`border-radius:${rd(n.radius)}`);
    if (n.clip) st.push("overflow:hidden");
  }
  return layoutBits(n, parentDir, st);
}
function layoutBits(n, parentDir, st) {
  st.push("box-sizing:border-box");
  if (n.w != null) st.push(`width:${n.w}px`, "flex-shrink:0");
  if (n.h != null) st.push(`height:${n.h}px`);
  const fillX = n.fill === "x" || n.fill === "both" || (n.grow && parentDir === "row");
  const fillY = n.fill === "y" || n.fill === "both" || (n.grow && parentDir === "column");
  if (parentDir === "row") { if (fillX) st.push("flex:1 1 0", "min-width:0"); if (fillY) st.push("align-self:stretch"); }
  else if (parentDir === "column") { if (fillY) st.push("flex:1 1 0", "min-height:0"); if (fillX) st.push("align-self:stretch"); }
  if (n.abs) st.push("position:absolute", `left:${n.abs.x}px`, `top:${n.abs.y}px`);
  if (n.hidden) st.push("display:none");
  return st;
}
const attrs = (n, extra = {}) => Object.entries({ "data-i": n.i, ...extra }).filter(([, v]) => v != null).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");

function render(n, parentDir, ctx) {
  if (n.t === "spacer") return `<div class="clause-spacer" style="flex:1 1 0;min-width:0;min-height:0"></div>`;
  if (n.t === "text") {
    const st = layoutBits(n, parentDir, []);
    st.push(`color:${col(n.color || "text-primary")}`);
    if (n.size) { st.push(`font-size:${n.size}px`); if (n.lh) st.push(`line-height:${n.lh}px`); }
    if (n.tracking != null) st.push(`letter-spacing:${n.tracking / 100}em`);
    if (n.align === "center") st.push("text-align:center");
    if (n.maxLines) st.push("display:-webkit-box", `-webkit-line-clamp:${n.maxLines}`, "-webkit-box-orient:vertical", "overflow:hidden");
    const cls = "ts-" + (n.style || "Text md/Regular").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<span class="clause-t ${cls}"${attrs(n, { "data-style": n.style, "data-color": n.color })} style="${st.join(";")}">${esc(n.runs ? n.runs.map(x => x.x).join("") : n.content)}</span>`;
  }
  if (n.c) {
    const cat = catalog.get(n.c) || {};
    const st = layoutBits(n, parentDir, []);
    const url = ctx.thumb(n.i);
    const sz = cat.size && !n.fill ? cat.size : null;
    let inner;
    if (url) inner = `<img src="${url}" alt="${esc(n.c)}" style="display:block;max-width:none">`;
    else {
      if (sz) st.push(`width:${sz[0]}px`, `height:${sz[1]}px`);
      const texts = Array.isArray(n.text) ? n.text : n.text ? Object.values(n.text) : [];
      inner = `<div class="clause-ph"><b>${esc(n.c)}</b><i>${esc(Object.entries(n.p || {}).map(([k, v]) => `${k}=${v}`).join(" · "))}</i>${texts.length ? `<span>${esc(texts.join(" · "))}</span>` : ""}</div>`;
    }
    return `<div class="clause-c"${attrs(n, { "data-c": n.c, "data-p": n.p ? JSON.stringify(n.p) : null, "data-figma": cat.id || cat.setKey || cat.variantKey || null })} style="${st.join(";")}">${inner}</div>`;
  }
  const st = box(n, parentDir);
  const kids = (n.children || []).map(c => render(c, n.t === "row" || n.dir === "row" ? "row" : "column", ctx)).join("");
  return `<div class="clause-${n.t}"${attrs(n)} style="${st.join(";")}">${kids}</div>`;
}

const BASE_CSS = `
*{box-sizing:border-box}html,body{margin:0}body{background:#e9e8e6;font-family:var(--font-body,Inter,system-ui,sans-serif);color:var(--color-text-primary,#111);-webkit-font-smoothing:antialiased}
.clause-canvas{display:flex;flex-direction:column;align-items:flex-start;gap:48px;padding:32px}
.clause-frame{position:relative;display:flex;flex-direction:row;background:var(--color-bg-primary,#fff);box-shadow:0 1px 3px rgba(0,0,0,.12);flex-shrink:0}
.clause-frame-title{font:500 12px var(--font-body);color:#6b6b6b;margin:0 0 8px}
.clause-t{white-space:normal;margin:0}.clause-icon{display:inline-flex;flex-shrink:0;line-height:0}.clause-icon svg{width:100%;height:100%;display:block}button{font:inherit;color:inherit}
.clause-c{position:relative;flex-shrink:0}
.clause-ph{display:flex;flex-direction:column;gap:2px;justify-content:center;width:100%;height:100%;min-height:28px;padding:6px 10px;border:1px dashed var(--color-utility-magenta-400,#d0d);border-radius:4px;background:rgba(160,60,200,.06);font:11px/1.3 var(--font-code,ui-monospace,monospace);color:#6a2b8a;overflow:hidden}
.clause-ph b{font-weight:600}.clause-ph i{font-style:normal;opacity:.75}.clause-ph span{opacity:.9}
`;

function domToHtml(entries) {
  const rules = new Map(); let k = 0;
  const cls = st => { const css = Object.entries(st || {}).map(([a, b]) => `${a}:${b}`).join(";"); if (!css) return null; if (!rules.has(css)) rules.set(css, "e" + (++k).toString(36)); return rules.get(css); };
  const ser = n => {
    const a = Object.assign({}, n.a); const c = cls(n.s); if (c) a.class = (a.class ? a.class + " " : "") + c;
    const attrs = Object.entries(a).map(([kk, v]) => (v === "" ? ` ${kk}` : ` ${kk}="${esc(v)}"`)).join("");
    if (n.h != null) return `<${n.t}${attrs}>${n.h}</${n.t}>`;
    if (n.x != null) return `<${n.t}${attrs}>${esc(n.x).replace(/\n/g, "<br>")}</${n.t}>`;
    return `<${n.t}${attrs}>${(n.c || []).map(ser).join("")}</${n.t}>`;
  };
  const bodies = entries.map(e => ser(e.dom));
  return { bodies, css: [...rules].map(([css, c]) => `.${c}{${css}}`).join("\n") };
}

export function toHtml(name, SCREEN, { thumb = () => null, screens = null } = {}) {
  const tokens = existsSync(resolve(root, "ds/tokens.css")) ? readFileSync(resolve(root, "ds/tokens.css"), "utf8") : "";
  const ctx = { thumb };
  let domCss = "";
  const dom = screens && screens.length ? domToHtml(screens) : null;
  if (dom) domCss = dom.css;
  const frames = dom ? screens.map((e, i) => {
    const label = screens.length > 1 ? `${SCREEN.TITLE} — ${e.name}` : SCREEN.TITLE;
    return `<section data-screen="${esc(e.name)}"><h2 class="clause-frame-title">${esc(label)}</h2>${dom.bodies[i]}</section>`;
  }).join("\n") : SCREEN.SCREENS.map(([sname, tree]) => {
    const st = [`width:${SCREEN.WIDTH}px`, SCREEN.HEIGHT ? `height:${SCREEN.HEIGHT}px` : "min-height:600px", "overflow:hidden"];
    const dir = tree.t === "row" ? "row" : "column";
    st.push(`flex-direction:${dir}`);
    if (tree.bg) st.push(`background:${col(tree.bg)}`);
    const kids = (tree.children || []).map(c => render(c, dir, ctx)).join("");
    const label = SCREEN.SCREENS.length > 1 ? `${SCREEN.TITLE} — ${sname}` : SCREEN.TITLE;
    return `<section data-screen="${esc(sname)}"><h2 class="clause-frame-title">${esc(label)}</h2><div class="clause-frame" data-clause-root style="${st.join(";")}">${kids}</div></section>`;
  }).join("\n");
  const scene = JSON.stringify(Object.assign({}, SCREEN, { REPLACE: null })).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="clause-ds-export" content="1"><meta name="clause-source" content="${dom ? "figma-dom" : "approximate"}"><meta name="clause-screen" content="${esc(name)}">
<title>${esc(SCREEN.TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${tokens}${BASE_CSS}${domCss}</style></head>
<body><main class="clause-canvas">
${frames}
</main>
<!-- Figma round-trip: open the "Clause Assist" plugin and drop this file; it reads this scene (components, variable keys, text styles). -->
<script type="application/json" id="clause-scene">${scene}</script>
</body></html>
`;
}
