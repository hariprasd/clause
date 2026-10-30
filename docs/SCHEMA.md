# Screen JSON schema

One file per screen in `screens/<kebab-name>.json`. With a catalog the compiler validates it against `ds/components.json` + `ds/variable-keys.json`; with no catalog it validates primitives and raw values, so general design works on day one.

```json
{
  "title": "Example screen",
  "height": 900,
  "tree": {
    "t": "row", "gap": "none", "clip": true,
    "children": [
      { "t": "stack", "i": "main", "grow": true, "fill": "y", "gap": "xl", "pad": "2xl", "bg": "bg-secondary",
        "children": [
          { "t": "text", "i": "title", "content": "Hello, Clause", "style": "Display md/Semibold", "color": "text-primary" },
          { "c": "card", "i": "intro", "p": { "Elevated": "false" }, "text": { "Title": "Your catalog goes here", "Body": "Extract your design system, then build for real." } },
          { "c": "button", "i": "start", "p": { "Hierarchy": "Primary", "Size": "md" }, "text": { "Button": "Start building" } }
        ] }
    ]
  }
}
```

## Nodes
- **Component** `{ "c": "<catalog key>", "i": "<unique id>", "p": {…}, "text": …, "ops": […] }`
  - `p`: Figma axis names and values verbatim from the catalog. Booleans `"true"`/`"false"`. INSTANCE_SWAP props take `"@icon-key"`.
  - `text`: array = override visible text layers in order; object = `{ "placeholder substring": "new text" }` (matched against the catalog `texts`).
  - `ops`: edit layers inside the instance — `{"hideNames":[…]}`, `{"hide":[layerIds]}`, `{"set":[[layerId,{props}]]}`, `{"icons":[[targetId,sourceId]]}`, `{"nodes":[{"name":"<layer>" | "has":"<text substring>" (nearest instance containing that text), "nth":0, "hide":true | "show":true | "icon":"@key" | "swap":"@key" | "props":{…} | "text":"new text for the first text layer in the node" | "style":"Text sm/Regular" | "color":"text-secondary" | "maxLines":2 | "align":"right" | "tint":"icon-white"}]}`.
- **Layout** `t`: `stack` (column) · `row` · `text` · `spacer` (push-apart in a row only).
  - Spacing: `gap` `rowGap` `pad` `px` `py` `pt` `pb` `pl` `pr` take token names (`"md"`, `"3xl"`). `radius` likewise.
  - Color: `bg` `border` `borderB/L/T/R` `color` `tint` take variable aliases (`bg-primary`, `border-secondary`, `text-tertiary`). `bg: "none"` clears a fill. Never hex.
  - Size: `w` `h` (px) · `fill` `"x"|"y"|"both"` · `grow` · `wrap` + `rowGap` for card grids (fixed `w` on cards) · `clip` · `dash` · `opacity` · `bgBlur`.
  - Align: `justify` start|center|end|between · `align` start|center|end.
  - `abs: {x, y}` overlays a node (needs `why`). `replace: "<frameId>"` rebuilds a frame in place.
- **Text** `{ "t": "text", "content" | "runs": [{"x":"…","b":true,"i":true,"code":true}], "style": "<text style>", "color": "<alias>", "maxLines": 2 }`. `size`/`lh` overrides need a `why`.
- Raw numbers for spacing/radius are allowed only with a `why` on the node (recorded exception).
- Multi-state: `"screens": [{ "name", "tree" }]` instead of `tree`.
- Page and placement: new screens are built on the page the user is on in Figma; a rebuild goes to the page where that screen already exists. `"page": "<pageId>"` pins it; `"section": "<sectionId>"` builds the frame inside that Section (placed to the right of its last frame, section grows to fit; rebuilds stay in the section). `"at": "<frameId>"` places the build immediately to the right of that frame, in its parent — use it whenever the user names or annotates a frame, so the result never lands somewhere else.

## No catalog (general design)
`ds/` is optional. Without it, a screen is built from primitives with raw values — no component keys, no tokens, no text styles:
```json
{
  "title": "Poster", "width": 1080, "height": 1350,
  "tree": { "t": "stack", "i": "root", "gap": 28, "pad": 72, "bg": "#0b0b0c",
    "children": [
      { "t": "text", "i": "headline", "content": "…", "size": 64, "lh": 68, "color": "#f5f5f2" },
      { "t": "box", "i": "rule", "w": 120, "h": 1, "bg": "#3a3a3d" }
    ] }
}
```
- Colour fields take `#rgb`/`#rrggbb`/`#rrggbbaa`; spacing and radius take numbers. No `why` needed — raw is the honest default here.
- Every `text` needs a numeric `size`; `lh` (px) and `tracking` (%) are optional. No `style`.
- Components (`c`) and token names fail with an explicit message: use primitives, or run Extract if the work should follow a design system.
- See `examples/general.json`.

## Lint (hard fail)
With a catalog: unknown `c` key · prop not on that component / value not in its axis · unknown token or alias · raw hex · raw px without `why` · duplicate or missing `i` · unknown text style. Without one: unknown `c` key, a token name where a raw value belongs, and text without `size`.

## Builder warnings (always a bug)
`prop not applied …` (readback after setProperties) · `variant not matched …` · `text not found in …` · `nodes: no #n <layer>` · `style …` / `font fallback …`.
