---
name: fix
description: Apply messages and annotations sent from the Clause Assist Figma plugin. Use when the user says "check the inbox", "fix the notes", "see what I sent", or asks to apply Figma annotations.
---

# /fix — work the Clause inbox

> **Programmatic first** (CLAUDE.md): use `inspect.mjs --raw/--vs`, `jq`, `node -e` for every deterministic step; spend tokens only on judgement.


1. `npm run inbox` (needs `npm run live` running). Each message is either free text or an **annotations batch** (numbered items with screen, node id, name, type/component, path, props/text/layout). A message that names a frame prints `frame: Name (id)` — that is the frame the designer means; never work somewhere else.
2. For each item: the target's **JSON id** (listed in the annotation as `target: <id> [layer "<Figma name>"]`) is the screen JSON `i` id in `screens/<screen>.json`; layers inside a component instance are edited with `ops` (`nodes` → `hide`/`props`/`style`/`color`/`maxLines`/`swap`). Never hand-edit Figma. If the item is vague, run `node scripts/inspect.mjs <nodeId> --raw` first; with a reference frame, `--vs`.
   - Edit the named frame **in place** when the item is a change to it. When the item asks for something new next to it, put `"at": "<frame id>"` in the screen JSON so the build lands beside that frame instead of far right.
2b. Any correction the user gives that could apply again ("use X instead of Y", "always…", "this is misplaced") goes into `.clause/local-rules.md` the same turn, in one line. Anything else worth keeping — the pattern that worked, the decision, a fact about their product — record with `npm run learn -- --text "…" --kind pattern`. Read `.clause/local-rules.md` and the relevant learnings before building anything.
3. Before any multi-step investigation, `npm run status -- "<what you are doing>"` so the pane shows it. Edit the JSON (hook lints). When the screen uses the catalog, prefer its components/variants over primitives and use exact axis names. General design requests do not need a catalog; answer them directly.
4. Save → live rebuild. Read `curl -s localhost:8787/result`: any warning is a bug. Re-inspect the changed node / `node scripts/look.mjs snap <rootId>` and read the PNG.
5. `npm run reply -- "…"` with one line per item: done / not done + why. Keep it short — it renders in a 300px panel. Every finished design task ends with the frame chip: the server attaches the frames built this turn automatically, so do not strip them; for a frame you edited in place, add `--pill "Name=<nodeId>"`. Do not suggest extraction or setup. A decision that blocks the task goes in the pane as `npm run reply -- --ask --option "…"`; never ask the designer to answer in Claude Code.

## System events (kind: system)
- **DS extracted**: audit `ds/components.json` + `ds/variable-keys.json`: duplicate/odd keys, icons without `icon-` prefix, missing `bg-primary` / `text-primary` / `border-secondary` aliases (the builder's defaults), text styles whose font differs from the body font (note the families in `.clause/local-rules.md`), library components with no texts. Fix what is mechanical (rename keys in the JSON), note the rest in `.clause/local-rules.md`, then `npm run reply` with 2–3 lines + "build first: <screen>" suggestion. Don't dump lists in the pane.
- **STOP** (title "STOP"): the user pressed Stop in the plugin. Abandon the current task immediately — no further edits or rebuilds — make sure the last saved screen JSON lints, then `npm run reply -- "Stopped at: <one line>"`. Do not resume unless asked.
