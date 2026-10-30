# Clause — power-use notes

Living list of the tricks that make the loop fast. Every time we find a loophole that saves clicks, tokens or rounds, it goes here *and* into the tooling, so it survives new sessions and new machines. (Claude: read this at session start; add to it whenever a new trick lands.)

## The loop
- `npm run live` once. Save a screen JSON → Figma frame rebuilds in ~1–3s, HTML export follows. No tool calls to "build".
- Plugin **Start (silent)** stays hidden; ⌘⌥P (Ctrl+Alt+P) reruns the last plugin after any plugin change.

## Talking to Claude from Figma (costs nothing while idle)
- One chat pane. **◎ annotate** on → the Figma selection rides along as chips (multi-select OK; one comment covers all; prompt carries node id, component, props, path, screen). ⏎ queue · ⌘⏎ send now. Queue widget: hover an item for send/discard; header icons send/discard all. History is local (`.clause/history.json`), never in the Figma file.
- ⚙ in the header: build status, drop an HTML export to rebuild it, exports listing.
- **Listener**: say "listen" → Claude arms `npm run inbox -- --watch` (a blocked node process, zero tokens while idle; one normal turn when something arrives; expires after 30 min with one tiny notice). Without it, say "check ib". A `UserPromptSubmit` hook runs `scripts/listener-check.mjs` and prints one reminder whenever `/status` says `listening:false`, so a new turn never starts deaf.
- Claude answers with `npm run reply -- "…"` → shows in the Messages tab.
- **Frame chips are automatic**: the reply to a build carries a chip for every frame built since the previous reply, so a finished design task never leaves the designer hunting for it. `reply.mjs --pill "Label=<nodeId>"` (repeatable) adds a chip for any other frame (e.g. one edited in place). Server restart needed after changing serve/messages.
- `reply.mjs --ask --option "…"` (≤4): raised-hand amber card in the pane with tap-to-answer buttons; use whenever a designer decision blocks the task. A reply that ends in a question is posted as a needs-input card automatically, so it never sits in chat unanswered. Replies that tell the designer to answer in Claude Code are refused, because the pane is the whole conversation.

## Reading Figma without burning context
- `node scripts/inspect.mjs <url|nodeId>` → `drafts/<id>.json` skeleton of ANY frame: catalog keys, non-default props, texts, token-mapped spacing. Start reference screens from this, never from scratch.
- `--vs <mine>` → numeric diff (w/h/gap/pad/radius/props) instead of eyeballing screenshots. `--raw` for layer names inside instances (needed for `ops`).
- Plugin reads are small by design — prefer `inspect.mjs`; when you must read directly, ask for ids/names only.
- `node scripts/look.mjs snap <id> 1200` on the root frame is the cheapest visual check; never screenshot the page.
- `look.mjs pages|tree|snap|snaps` reads/screenshots whatever file the plugin is open in — no MCP link needed.

## Builder (runtime.js)
- `ops.nodes` reaches anything inside an instance by layer name + nth: `hide`, `icon`/`swap` (`@icon-key`), `props` (nested variant props), `style` + `color` (restyle a text inside a component), `maxLines`, `tint`.
- `ops.nodes` `has: "<text>"` selects the nearest instance that contains that text (hide/props it) — use when layer names repeat (menu items, list rows).
- `ops.nodes` `show: true` reveals a layer the component hides by default; text arrays then include it. Ops run BEFORE text overrides, so `has:` must match the component's original text.
- `ops.nodes` `align: right|center|left` right-aligns a text inside a component (sets textAlignHorizontal + parent MAX). Needed for table numeric columns.
- `ops.nodes` can set `gap` (token) and `cross` (start|center|end) on a layer inside an instance; the compiler registers gap tokens used there.
- Readback warnings: `prop not applied …` and `variant not matched …` — a warning is a bug, never ignore.
- `bg: "none"` on any node (instances too) clears its fill — the only way to strip a component's background.
- Instances can't be dashed/outlined differently; need a plain frame for that (record `why`).
- Big library sets import slowly once (~2 min for a large component set), then cached per plugin session.
- **Incremental rebuild**: top-level nodes whose JSON (plus catalog/runtime salt) is unchanged are moved from the previous frame instead of rebuilt (`clause:hash` plugin data). Unchanged screen ≈ 60 ms; a content edit rebuilds only `main` (nav reused). Keep the nav / overlays as separate top-level children so they stay reusable.
- Per-instance layer index (`idx`) + font preload: ops/texts no longer walk the instance per op.
- **Layer naming:** component instances keep the component's own name so the layers panel reads like the design system; frames/text are named by their JSON `i`. The JSON id of every instance is stored in plugin data `clause:id`; annotation prompts list it as `target: <id> [layer "<name>"]`, and incremental reuse keys on it.
- **Failed builds never leave frames behind**: every frame a build creates is tracked (`clause:root` plugin data + `CACHE.pending`); on failure they are removed (also inside Sections) and the previous frame regains its `clause:screen` tag; at the start of the next build Clause-made untagged leftovers are swept. Do **not** loop build retries by hand: one attempt, read the error, fix the cause.
- Files whose library keys no longer resolve: the runtime falls back (a) to the default catalog's key (`alt`), (b) to the main component of an instance already on the target page (donor scan).
- `"section"` in a screen JSON builds inside a Section; `"at": "<frameId>"` builds immediately to the right of that frame, in its parent — the way to work on the frame the user gave you; `"ds": "<catalog dir>"` selects another catalog.
- **Edit guard**: built frames carry `clause-sig` (structure fingerprint) and `clause-built`; `{checkEdited:{root}}` lists frames the designer changed since the build, and `{remove}` refuses them. Check before any rebuild of a section.
- **Programmatic revert:** `figma.triggerUndo()` is not usable. Instead every changing swap job is journaled in plugin memory: removals go to a hidden `_clause-trash` frame (not deleted), property writes record the old value (`setP`), created ids are stamped. `swap.mjs {journal:true}` lists, `{revertLast:true}` / `{revertAll:true}` undoes exactly that (skips replacements the designer edited since, refuses jobs it cannot invert). Journal is per plugin session (lost on reload); jobs that create untracked frames are flagged irreversible.
- **Quiet failures**: no red Figma toasts. Preflight in the plugin job runner imports every library component (alt key, set key, donor instances) BEFORE creating anything; if any is unavailable the build stops with nothing changed and the pane shows one line. Lint/compile errors from the server also show as a quiet pane note (10 s), not a toast. Failed builds still clean up after themselves.
- Internal job failures (`_inspect`, swap, probes) never show as "build failed"; only real screen builds surface errors, as a 6 s note.

## Design system
- Plugin ⚙ → **Extract components & tokens**: walks every page + enabled libraries → `ds/components.json`, `variable-keys.json`, `tokens/*`, `tokens.css`, a starter `config.md`. With an existing catalog it writes a preview under `.clause/` and Claude (listener on) compares and recommends the merge. One click replaces the day of manual harvesting.
- A component the catalog lacks → add it by main component id, in two lines. Prefer composed parts (`list-item*`, `form-header`, `container`) over primitives.
- Page-level specs learned from senior frames live in `.clause/local-rules.md`. Add one block per new pattern.
- Molecules exist for most "atom stacks": check the catalog for `*-menu`, `split-*`, `*-bar` before composing from atoms.
- Some components in a design file's library are not in the catalog: a build with them never returns. Compose their look from tokens with a `why` instead. Boolean props on catalog components are the strings `"true"`/`"false"` (lowercase).
- **Library dedupe**: `ds-install.mjs` keeps only a file's delta when ≥85% of its library components already exist in another catalog (`extends` in `ds/registry.json`, merged by loadCatalog). Registered files are never re-extracted (UI toast + server 409).
- **Multiple design systems**: `ds/registry.json` (file name → system → catalog dir), plugin reports `figma.root.name` on start, server resolves (`/ds/active`, `/ds/file`, `/ds/choose`), switcher icon in the composer, `context:` line at the top of every inbox read, with `.clause/local-rules.md` applying to every system. Add a system by extracting in its file and appending to the registry.

## Journeys and states
- **Regenerating screens triggers the file watcher for ALL screens**, queueing many builds at once (latest-wins drops them mid-build, leaves partial frames). Regenerate, wait, then build one at a time with `scripts/seq.sh <name>` (push + wait for that name's result). Never edit-regenerate while a build runs.
- **Verify a build by the Designs tree, not only `/result`**: `node scripts/look.mjs tree <sectionId> 1 | grep <title>`. A result "OK" with an old frame id still in the tree means the build did not land.
- **Lint "clean" does not check text styles for alternate catalogs** — compile does: `node -e 'import("./scripts/compile.mjs").then(m=>m.compile("<name>")).catch(e=>console.log(e.message))'` prints the real error when a screen silently never builds.
- **Icons when a second file has its own catalog**: use keys present in BOTH catalogs; a key without `alt`/donor fails the whole build.
- **Layers inside an instance**: `node scripts/look.mjs tree <instanceId> 12` (depth >= 9 expands inside instances) to get layer names, then `ops.nodes` `{name, nth, hide:true}`. Donor instances can arrive in a different state (extra toolbars) than the one you looked at.
- **Delete a Clause-built frame**: `curl -X POST "localhost:8787/inspect/<id-with-dash>?remove=1"` (POST; refuses non-Clause frames). Jobs are POST-only and one at a time.
- **Bisect a failing screen**: split into chat-only / preview-only temp screens, delete them after with the remove job.
- **Add states to a design that was NOT built by Clause**: `node scripts/variant.mjs scripts/variants/<spec>.json` clones the existing frames into a new Section (re-running replaces it) and varies them: `texts`, `hide`, `fill` (token), `set` (props/text of existing instances), `add` (catalog instances incl. `cursor` for hover), `hideAfter`, `textsAfter`. Faithful to the existing styling because it starts from the real frames. Can't `replace`/insert inside instances. Figma may drop the first call after idle ("Unable to establish connection"): the CLI retries.
- **Journey states missing**: clone the nearest screen with `variant.mjs` (texts + hide by layer name), then moveTo the journey Section and set x/y at the end of the row.
- **Desktop → mobile (360)**: `node scripts/mobilize.mjs <spec>.json` clones a desktop frame and re-flows it: rows that don't fit become columns (kids FILL, gap 16–24), small tile rows wrap, icon+text rows stay rows, fixed heights hug, side padding 20, section padding 100+→60 / 60+→40, type scaled (≥44→×0.75, 36–43→×0.75, 28–35→×0.8, rest unchanged), images keep ratio at 320 wide. Spec: `keep` (marquee rows kept as designed and clipped), `blocks` (replace a block by a clone of a mobile reference: header, CTA, footer; `texts` swap copy and keep italic runs via `[[text, oldSegmentIndex],…]`).
- `scripts/seq.sh <screen…>`: build screens one at a time and print result, roots, warnings (imported-from-donor notes filtered).
- `scripts/shot.sh <screen> [w]`: build + snapshot through the plugin to `/tmp/shot-<screen>.png` (one step, no id juggling).
- Generators must only write screens whose content changed (every write wakes the watcher and queues a build; latest-wins then drops seq.sh's wait).
- **Never wait with an unbounded `until [ lines >= N ]` loop**: if a build prints nothing it spins forever as a hidden background task. Use `scripts/seq.sh` (each wait is capped at 180s) in the background, or a loop with a counter and a timeout.
- Rebuilds of an unpinned screen land at page root far from the earlier copy even if the user moved it into a section: after a rebuild, moveTo the section + setProps x/y (swap.mjs). Better: pin `"section"` in the screen JSON.
- **Real pictures**: a box node takes `"img": "<url>"` (picsum seeded urls like `https://picsum.photos/seed/<seed>/<w>/<h>.jpg`; picsum has no keyword search, only ids/seeds). The server downloads once to `.clause/img/` and inlines base64 because the plugin cannot fetch. Do not put a `bg` on an `img` box.
- **Silent mode**: eye button in the plugin composer. Silent is ON by default; builds do not scroll/zoom the canvas (`SCREEN.SILENT`, passed with each build message).

## Editing an existing design
- Existing design: edit in place, no new frames. Recipe: inspect the live frame (`inspect.mjs <id> --raw`), then one `swap.mjs` spec on those node ids (`{target, edit:[{id,text|visible|compProps|moveInto}]}`, `setProps`, `compProps`, `replaceLib`, `insert`). Screens/*.json with `"frozen": true` are never rebuilt by the watcher.
- **Redesign propagation on hand-made frames**: `swap.mjs` spec item `{target, donor, name?, texts:[[layerName,text,nth?]]}` replaces `target` with a clone of `donor` (the redesigned part) and retexts it; `{target, move:{anchor, alignRight?, dy?}}` re-anchors an overlay (menu) under a new trigger. Find old copies by scanning `look.mjs tree <frame> 12 | grep <part name>` per frame (section trees truncate at 1500 lines).
- `swap.mjs` `{target, copyFill:<donor>, strokes?:true}` copies fills (+outline) incl. bound variables from a redesigned layer — use for "same card, new colours" rollouts. Gotcha: `inspect --raw` does not report fill/stroke overrides on instances; diff two snaps too when a redesign "has no diff".
- **Frames rebuilt from a hand-made screen**: `inspect.mjs <id>` drafts a skeleton, then a throwaway generator rewrites it with catalog components. Catalog gotchas: private `_` sets fail to import in other files — use the public wrapper; text style keys come from `variable-keys.json`; `lint.mjs` merges `extends` catalogs like compile.
- **Swap catalog components into non-Clause frames**: `swap.mjs` entries accept `comp` (catalog key) + `props`, `text`, `fill`, `hideTexts`; spec needs `ds` and `useComps`.
- **Editing layers inside a swapped instance**: swap entries take `replaceTexts` `[find,new,nth]` (visible text only), `hide` `[{name,nth|all,w?,prefix?}]` (counts only rendered nodes; hidden variants' layers otherwise shift nth), `show`, `hideTexts`. Order inside swap: props → text → hide → replaceTexts.
- **Swap library components in place** (logos, icons): `node scripts/swap.mjs spec.json` with `{swaps:[{target:<node id>, key:<raw component key>, size?, name?}]}`. Get keys from `ds/components.json`, or run Extract on the library file to add them.
- **Swap icons inside an instance**: swap entry with `icons:[{item,key|comp,size?}]` swaps each rendered item's placeholder instance (`swapComponent`). Donor-graft also takes `props`: clone a library instance in place of a raw icon, then point its icon at the old icon component id (`inspect --raw` → `mc.id`).
- `swap.mjs` extra modes: `{target:<frame>, insert:{key|byName, name, fillX, remove:[child names], props, text, noFill}}` adds a library instance and removes old children only after it exists; `{target, edit:[{id, text?, visible?}]}` edits layers by id inside instances.
- Rebuilding a component variant from a reference frame: `swap.mjs` `{target, rebuild:{fillFrom, width?, children:[{donor, name, grow?, fillX?, pad?, hide?:[layer names], center?, props?}]}}` empties the frame and fills it with donor clones; `{target, setProps:{paddingTop:15,…}}` sets raw node props. Never setProperties on nested instance parts after a variant swap (stale ids).
- **Re-propagating a designer tweak**: diff with a probe (`swap.mjs {probe:[ids], deep:true}` returns fills/strokes/hidden layers that `inspect --raw` misses on instances), then apply with `copyFill`, `compProps`, `setProps`, or clone the changed frame with `donor` + `retext` + `hideNames` + `keep`; `moveTo` reorders children.
- **Replacing a hand-made mini-component everywhere**: `swap.mjs {findIn:{root,re}}` lists every match (id, screen), `{swapMarks:{map:{"<old name>":"<component id>"},ids}}` swaps frames for instances keeping index/size/layout (batch ≤50), `{swapComp:{to,ids}}` swaps existing instances keeping size. Always re-run findIn after to confirm none remain.
- `swap.mjs {replaceLib:[{target,key,props,bases:[{text,icon,current}]}]}` replaces a hand-made segmented control with a DS toggle group; read which option is current from the old frame first.
- Status cells in tables belong to the design system (a badge cell variant), never a wrapper frame around a pill. `swap.mjs {badgeCells:{donor,items:[{target,text,color}]}}` clones the designer cell per row; `{target, remove:true}` deletes a node.
- Hand-made menus → DS dropdown: `swap.mjs {dropdownMenus:[{target,key,type,items:[{text,mark,selected}]}]}` keeps the overlay right edge and y; rows beyond the item list are hidden.
- `swap.mjs {menuIcons:[{menu,items:[{icon:<component id>,danger?}]}]}` sets leading icons on a dropdown instance (rows are instance children: cannot reorder/move rows or add a divider between them).
- `swap.mjs {splitColumns:[{column,idWidth,titleHeader}]}` turns a stacked id+title column into two columns (id muted, title main), keeping row order. Gotcha: `moveTo` index is the slot BEFORE removal (moving down one needs index+2); never reorder rows the designer arranged — inspect first.
- `swap.mjs {replaceText:{root,from,to}}` rewrites matching text layers (inside instances too) under a node; used for id prefix changes.
- `swap.mjs {setByName:{roots,inst,child,props}}` sets journaled props by name; `{textResetIn:{roots,name}}` restores a component's text alignment/sizing from its main component; `{textAlignIn}` sets it.
- Menus and popovers use the catalog's dropdown: hide header/search/scroll bar and extra rows to get exactly N items. Swap entries keep an absolute position (`wasAbs`); reposition with `move` (anchor id or anchorText+within) or `place` `{x,y}`.
- **Chat chips follow replaced nodes**: swap jobs return `remap` (old id → new id); the server keeps `.clause/idmap.json` (`GET /idmap`) and the plugin resolves a chip's id through it before locating, so a chip for a replaced frame still jumps to its replacement while keeping the old chip label. Fallback in the plugin `locate`: if the id is gone, pick the same-named node on the page, preferring the one sharing most ancestor names. Chips carry `data-name`/`data-path`.
- `swap.mjs {darkMode:{target, mode?}}` sets the dark mode of every colour collection used inside a node; `{listSet:<component id>}` lists a component set's variant names.
- Toasts = the design system's alert instance in explicit dark mode; shrink with `setProps` `layoutSizingHorizontal: FIXED` + `__w`. `{alertFrom:{donor,items:[{target,title,action?,width?}]}}` clones it in place of hand-made toast frames, keeping centre and layout role. `{bubbleFrom:{donor,items:[{target,text}]}}` does the same for user-message bubbles.
- **Figma comments**: `node scripts/comments.mjs [--file <key|url>] [--all] [--json]` lists open comments (REST API). Token on the first line of `.clause/figma-token` (gitignored) or env `FIGMA_TOKEN`; file key remembered in `.clause/figma-file`. Needs scope `file_comments:read`.
- Onboarding sets up Figma comments: manifest has `enablePrivatePluginApi` so the plugin saves the file key to `.clause/figma-file`; the user saves a personal access token as the only line of `.clause/figma-token`. Checked by `session-start`, `setup.mjs` and `/onboard`; read with `node scripts/comments.mjs`.

## Plugin behaviour and layout
- Presence/stop: while Claude works the composer send button turns into ■ (Esc also stops); send icon is ↵. ⌄ collapse sits top-left (opposite ☰) and shrinks the window to just the two corner icons.
- Collapsed = ⌃ expand (left) + a bare three-dot status on the right, no container: dots wave in blue while Claude works or a build runs, sit still and grey when idle, red when the server is offline.
- Plugin window anchoring: `figma.ui.resize` keeps the top-left fixed, so collapse/expand pass `anchor:"br"` and code.js shifts the window with `figma.ui.reposition` — the bottom-right corner stays put wherever the user parked it.
- Builds never switch the user's Figma page: the screen is built on its target page in the background (page pin / existing page / current page) and the plugin shows a blue "Built <screen> on <page> — Go ›" nudge (bar when expanded, bouncing chevron when collapsed, 9 s). Only same-page builds zoom the viewport.
- **Several Figma files open with the plugin**: each plugin instance listens to the same server. Jobs carry `FILE` (the file last reported active) and a plugin ignores jobs for another file; a plugin reports its file when its tab becomes visible and every 5s while visible.
- Plugin job results carry `ts`, so two identical errors in a row are still noticed (CLIs used to time out on them). "Unable to establish connection to Figma" after heavy jobs means Figma is busy/offline: wait, do not loop.
- `build-plugin.mjs` fails the build on a syntax error in the plugin UI/code (a `//` comment inside a one-line statement once killed the whole plugin silently). After editing `scripts/plugin/ui.html` always run `node scripts/build-plugin.mjs` and read its output.
- Plugin shortcut: ⌘⌥P / Ctrl+Alt+P is handled inside the plugin window (it toggles collapse), because Figma never receives it while the window has focus; from the canvas Figma re-runs the plugin and the saved state flips.
- Collapse/expand shortcut is user-set: default Alt+Shift+C (matched by physical key), change it in the plugin menu ("Collapse / expand shortcut", press the new keys, Esc cancels); stored in `localStorage` `collapseKey`. The fixed Cmd+Shift+K clashed with a Figma shortcut.
- Each plugin run (⌘⌥P or menu "Open Clause Assist") flips the saved collapsed/expanded state (`figma.clientStorage` "clause-ui"; first run expanded), shows the window and focuses the input on expand. "Start (silent)" does not touch it.
- Plugin Preferences (Settings page switches: collapse on send, expand on complete, always open expanded) live in `scripts/plugin/ui.html` (`getPrefs`, `localStorage` "prefs"); add a new switch = one `.pref[data-pref]` row + a `getPrefs().x` check where it matters.
- Plugin iframe: `localStorage` is blocked in some contexts; persist user prefs via main thread `figma.clientStorage` (msg type "prefs"), keep an in-memory copy in ui.html.
- Plugin window resize is animated in code.js (msg.anim: 9 eased `figma.ui.resize`+reposition steps, ~16ms each); ui.html `setCollapsed` sets `anim:true`.
- Plugin window bottom clamp = viewport bottom − 12px (`WIN_MARGIN_BOTTOM` in build-plugin.mjs): chip bottom level with Figma's floating toolbar; tune MB if off.
- Plugin "locate" (chip click) fallback searches only page children + section children by name; never `page.findAll` on a big file (freezes the plugin).
- Job done: full-window blue overlay (white check + "Done"), fade in/out ~2.2 s, above the menu, in collapsed and expanded states; not on stop/error. Collapsed mode flashes the status button instead. Remove `.on` on animationend and on every collapse/expand (display none->flex restarts a lingering animation).
- Chat list always lands on the newest message: `stickBottom()` runs on render, on expand and on window resize (the list resets to the top while display:none).
- Chat bubbles: hover copy icon in the bubble header (`data-cp`, `MSG_TEXT` map), inside the bubble so never clipped; hidden until hover.
- **Listening indicator**: the inbox watcher polls `/inbox` every 1.5s; the server stamps it and `/status` returns `listening` (true if polled in the last 6s; 45s after the last poll and while working). The plugin shows the banner only after 3 consecutive not-listening checks, with a Copy link. A watcher that ends (30 min expiry) must be re-armed, or the banner appears. Restarting the server kills the watcher: re-arm it right after any restart.
- Stop state: `/term/status` and `/term/reply --working` ignored while `agent.state === "stopped"` (<10 min); only a plain reply clears "Stopping…". Needs server restart.
- Composer design-system switcher: when the file is unknown it shows a labeled "Pick design system" pill (was a dim icon users missed).

## Editing reality checks
- Figma Plugin API cannot add/clone layers inside an instance (`appendChild`/`insertChild` on nested nodes throws). To reuse a hand-edited instance, clone the whole instance and set props/texts; layers the designer deleted or added inside it come with the clone. Check the clone against the old one before removing the old part.
- Designer-made components without auto-layout cannot reflow when texts change and children's x cannot be overridden in an instance. Fine when labels fit the original widths; otherwise the component itself must be set to auto-layout in the library file. Check `inspect --raw` on the main component: no `lm` = no auto-layout.
- `remove` refuses any node without a `clause-sig` fingerprint (unknown = designer may have edited). Replace flows: build beside, never remove.
- Frames with no `clause-sig` show unknown in `checkEdited`: never delete them, place the new one beside.
- Open dropdown/overlay inside a form: make it the LAST child of the scroll container with absolute x/y, or sibling sections paint over it.
- Closed select/dropdown fields use the catalog's closed-state variant; the open list panel is a separate component.
- A failed plugin job removes the frames it created and gives the previous frame its tag back, so retrying the same `screens/*.json` is safe.
- CSS: `font: <size>/<lh> inherit` is INVALID (inherit cannot be a family in the shorthand) and the whole declaration is silently dropped. Use `font-family:inherit; font-size; line-height` separately.

## Hygiene
- `npm run clean` wipes `.clause/`, drafts, out, stale exports; `--all` also regenerated files. `npm run setup` on a new machine.
- Nothing in the repo depends on npm packages; Node 18+ only.
- **Context budget**: `scripts/ctx-budget.mjs` measures start-up context (session-start prints it); `docs/POWER-INDEX.md` (generated by power-index.mjs) replaces reading the whole POWER-USE.md. Rules for tool output and images live in CLAUDE.md → Context budget.
- Updates: `node scripts/update-check.mjs [--force]` fetches the remote, fast-forwards only when the tree is clean with no local commits (then rebuilds the plugin), else records "behind". Runs at server start, every 3h, and in session-start; `/status` carries `update`, the plugin shows a one-line nudge.
- Shared vs local: corrections → `.clause/local-rules.md`, registrations → `.clause/registry.local.json` (`scripts/registry.mjs` merges it with `ds/registry.json`), new Figma files → `ds/files/<id>/`. Everything under `.clause/` and `ds/` is the user's; updates replace the product and leave both alone.
- `inbox.mjs --watch` retries transient fetch failures (server restart, ECONNRESET) for ~2 min instead of dying.

## Slash commands (pane)
- Type `/` in the Clause composer: the menu lists `commands/*.md` (title + hint in frontmatter, body = the instruction written for Clause). The server expands `/name args` into that instruction when Clause reads the inbox, so intent, context rules, spec and finish steps arrive in the message itself. Add a command = drop a new `commands/<name>.md` (kebab-case); no code change. `GET /term/commands` lists them; `scripts/commands.mjs` holds list/expand.
