---
name: screen
description: Create a product screen in Figma from a brief, reference image, or Figma URL. Use when the user asks for a screen, page, state, or flow.
---

# /screen

> **Match the need first.** If the user wants a quick concept or a general design, build the simplest honest version with primitives or existing frames. A catalog is optional. Use the catalog steps below only when the screen should follow their design system.

> **Programmatic first** (CLAUDE.md): anything deterministic — reading a reference frame, token/prop lookup, bulk JSON edits, validation, diffing — is done by a script (`inspect.mjs`, `lint`, `node -e`, `jq`), never by hand in context.


1. Read `.clause/local-rules.md` (skip if already in context this session). If the screen should use the catalog, also read `ds/components.json` keys. If there is no catalog, do not stop for setup: work from general design judgement and say what you used.
2. Pick a kebab name. List regions of the screen; for each, name the catalog component when using one, otherwise the primitive and why. Keep this list for the reply — do not write a separate file.
2b. **If the user named a frame** (in their message, an annotation, or a Figma selection), put `"at": "<that frame id>"` in the JSON. The build then lands immediately to the right of that frame, in its parent. Never let a named-frame task use the default far-right position.
3. Write `screens/<name>.json`. Multi-state → `"screens": [{"name","tree"}]`. General mode: primitives, raw hex colours, numeric spacing, numeric `size` on every text (see `docs/SCHEMA.md` → No catalog). No catalog is not a reason to stop or to ask for setup.
4. Hook lints. Fix until clean.
5. Save = build (live server + plugin). `curl -s localhost:8787/result` → root id + warnings; any warning is a bug.
6. `node scripts/look.mjs snap <rootId> 1600` on each root id, then read the PNG.
7. Review (no extra Figma calls): run the `design:design-critique` lens on the screenshot — hierarchy, consistency vs reference, copy per `.clause/local-rules.md`, contrast. List only real findings; fix cheap ones via `replace` rebuild.
8. Reply: the frame chip for every root built (attached automatically by the server — never strip it), components used (or the primitives when general), warnings. Say nothing about extraction or setup. An open question only as `npm run reply -- --ask --option "…"`.

Cost discipline: one catalog read (+ `inspect.mjs` draft if a reference frame exists), one JSON write, one screenshot. No exploratory Figma reads.
