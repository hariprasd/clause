# Clause

Describe a screen (or point at a reference) → it appears in Figma, built from your **real** design-system components with every spacing, colour and text style bound to a variable. Then annotate it in Figma and send the notes to Claude from inside the file. No code, no CSS, no manual cleanup.

Works for designers who have never opened a terminal. Claude does the setup; you do four clicks in Figma.

Clause is also a general design sidekick before any catalog exists. Ask for critique, layout, copy, flows, references or edits to an existing frame and it helps directly. A design system makes its output consistent; it does not gate what you can ask.

Once the plugin is open, the pane is the whole conversation. Replies and questions appear there, and a question shows up as a **Needs your input** card with tappable answers. You never have to switch to Claude Code.

Clause writes through that plugin, not through a separate Figma connector. There is no account access or file link to grant before it can build in the file you have open.

---

## Start here (10 minutes, once per computer)

Two ways in. Pick the one that matches where you are.

**Already downloaded this repo?**
Open Claude Code → **Open folder** → pick this folder, then type:

```
set me up
```

**Not downloaded yet?**
Paste this one prompt into Claude Code. It clones the repo, opens it, and runs the same setup:

```
Clone https://github.com/hariprasd/clause.git, open the clause folder in Claude Code, and set me up.
```

### Before either path: two apps

1. **Figma desktop app** — https://www.figma.com/downloads/ (the browser version cannot run developer plugins).
2. **Claude Code** — https://claude.com/claude-code. Install and sign in.

### What setup does

Claude checks the computer, starts Clause's local server, and tells you the only two things it cannot click for you:

1. **Import the plugin into Figma** (once): Figma menu → *Plugins* → *Development* → *Import plugin from manifest…* → choose `figma-plugin/manifest.json` inside this folder.
2. **Open your design-system file in Figma** and run *Plugins* → *Development* → **Clause Assist** → *Open Clause Assist*.

Claude sees the plugin connect and replies in the pane. If you want this file catalogued as a design system, it starts **Extract components & tokens** (1–3 min, progress shows in the pane) and tells you what it found. Not cataloguing it? It simply helps with the design.

Not ready to extract? Skip it. The pane still works for general design help, and you can run extraction whenever you want the catalog.

That is the whole setup. Every later Claude Code session in this folder starts the same way on its own: the server is started, Claude listens for your plugin messages, reads your saved preferences, and tells you in one line that it is listening. From now on you talk to Claude from the plugin pane or from Claude Code — whichever is open.

Prefer not to think about it again? `clause service install` starts the server at login on macOS, Linux and Windows, with no administrator password. `clause service status` says whether it is installed and running; `clause service uninstall` stops that.

> Something failed? Tell Claude Code: **"setup failed, here is what I see: …"** and paste the message. Claude fixes it or tells you the one thing to click.

---

## Web captures → Figma (Clause Capture extension)

Copy a web page with the Chrome extension and it lands in the Figma file you have open — no switching windows, no paste.

```
Chrome: copy (⌘⌥O)  ──▶  Clause server  ──▶  Figma comes forward, ⌘V, focus returns to Chrome
                               └──▶ Clause Assist: deselects before, selects + zooms to the new layers after
```

- Needs `npm run live` running and **Clause Assist** open in Figma (Settings → **Paste web captures**, on by default).
- macOS pastes for you today. On Windows and Linux the capture lands on your clipboard and you press paste in Figma; the automatic drivers there are experimental until they are verified on those machines. On macOS, the first time, allow the app that runs the server (Terminal, iTerm, Claude…) under System Settings → Privacy & Security → **Accessibility** (and **Automation** → Figma / System Events if asked). If it is blocked, the plugin shows the exact fix.
- The page is already on your clipboard (the extension puts it there), so Figma's own importer builds the layers: full fidelity. It lands in whatever file/page is open, at the top level (the plugin clears the selection first).
- Safety: the server only accepts the paste request from the extension (`chrome-extension://` origin + `x-clause` header), only while the plugin has it switched on, one paste at a time. Web pages cannot trigger it.
- **Connection chip** (Clause Assist, bottom bar, next to Settings): a link icon with a live dot (green = extension, Clause and plugin are on the same line; amber pulsing = waiting for the extension; grey = paused; red = problem) and a counter of frames pasted so far. Click it for the connection card: Extension ⇄ Clause ⇄ Figma, last capture, frames and captures count (kept across restarts in `.clause/capture-stats.json`, Reset button), and the on/off switch. When the pane is collapsed the count rides on the corner icon.
- **In the web page itself**: the extension (`packages/capture`) shows a toast in the captured page: *Sending to Figma…* → *3 frames pasted to Figma · 12 so far* (or the exact problem and fix). It also pings `POST /capture/ping` so the plugin knows the extension is alive. Figma still comes forward for about a second: its importer only reads the clipboard on ⌘V in the focused canvas.
- **Stage, then paste all at once**: in the connection card choose *Stage, paste all*. Each ⌘⌥O copy is then saved in Clause (not pasted) and the page toast says *Added to the queue · 3 ready*. When you are done press **Paste all** in the card: Clause visits Figma once, puts each page on the clipboard in turn, pastes it, and the plugin lays the pages out in a row. The queue lives in the server's memory (restart clears it; up to 40 pages / 300 MB). Remove single pages with ×.
- **Click on the canvas**: when a paste is about to go out and Clause Assist is holding the keyboard, the pane covers itself with a full-pane overlay: *Click on the canvas to paste*. The moment you click out of the pane onto the canvas, the paste goes out (Esc or Cancel stops it). If the canvas already has the keyboard, there is no overlay. Pages land next to the frame you have selected (to its right), or where you clicked; staged pages go in a row from there.
- Turn it off in the plugin (Settings) or in the extension's Options. Server code: `scripts/webpaste.mjs`.

## Every day

| You want | Do this | What happens |
|---|---|---|
| A new screen | Tell Claude (either chat): *"build a settings page"* — add a screenshot or a Figma link of a reference if you have one | Claude drafts the screen, it appears on the Figma page you are on, Claude shows you a screenshot |
| Change something | In Figma, select the layer(s), type in the plugin pane what should change, press **⏎** | Claude edits, the frame rebuilds in place (~1 s), the pane shows ✓ sent → ✓✓ read → reply |
| Several changes at once | Type each, press **⌘⏎** to queue; press **⏎** when done | They go as one batch |
| Ask anything | Type without selecting layers | Plain message to Claude |
| Stop Claude mid-task | Press **■ Stop** next to its "working…" bubble | Claude drops the task and replies with where it stopped |
| Claude reacting without being prompted | Say **"listen"** in Claude Code | Claude wakes on every send from the plugin (costs nothing while idle) |
| A real web page of a screen | ☰ → *Open listing page* | Every screen as token-driven HTML; drop a page back onto the plugin to rebuild it |

Good references make good screens: a screenshot of the real product, or a frame a senior designer built. Claude reads exact spacing and components from a Figma frame, so a Figma link beats a screenshot.

---

## Switching to another design system

Open that design-system file in Figma and run **Clause Assist → Extract components & tokens** (or tell Claude "new design system"). Claude rebuilds the catalog and tells you what changed. Nothing else to configure. Keep each team's catalog on its own git branch, or register the file in `ds/registry.json` if you work across several.

---

## For Claude (and curious humans)

- **Contract**: `CLAUDE.md`. Schema: `docs/SCHEMA.md`. Speed tricks and loopholes: `docs/POWER-USE.md`.
- **Skills**: `/onboard` (the setup above), `/screen` (build from brief/reference), `/fix` (apply plugin messages).
- **Pipeline**: `screens/<name>.json` → `scripts/compile-core.mjs` (validates against `ds/`) → `scripts/serve.mjs` (watch, SSE, HTML export, message store) → `figma-plugin/` (builder runtime inside Figma) → frame.
- **Commands**: `npm run setup` · `npm run live` · `clause service install|status|uninstall` · `npm run inspect <url|id> [--vs <id>] [--raw]` · `npm run inbox` / `npm run reply -- "…"` / `npm run status -- "…"` · `npm run clean [--all]`.
- Node 20+, zero npm dependencies. Local-only state: `.clause/` (chat history), `exports/`, `ds/tokens.css`.

### Principles
Constrain the surface, not the intelligence · discipline lives in the repo, not the session · never refuse, always label (primitives carry a `why`) · every loophole gets logged and tooled.
