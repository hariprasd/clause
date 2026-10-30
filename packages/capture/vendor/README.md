# The pinned capture script

`packages/capture/capture.js` is Figma's own "copy page to Figma" script, minified, with Clause's
edits on top. It runs inside the page, not in the extension: Figma builds the toolbar and does the
serialization, and Clause attaches to the few places where the capture can be made to do more.

Those edits cannot live anywhere else. The iframe merge, the prepare/restore around serialization
and the export serializer all have to be inside the blob that Figma evaluates, so the file is
vendored and patched rather than imported.

## One record, one check

`patches.mjs` lists every edit as an exact `find`/`replace` pair plus the reason it exists. No
patterns, no line numbers: both sides are literal text, so applying the list is deterministic.

`verify.mjs` proves five things and `npm run vendor:verify` runs it in CI and in `npm run check`:

1. `capture.js` is the pinned file: same byte count, same sha256.
2. Every patch id is unique, every patch has both sides, and every patch says why.
3. Every `replace` side appears exactly once in the shipped file, so no hook can go missing or get
   duplicated by a careless edit.
4. Reversing the record produces the recorded base (`SHIPPED.baseSha256`).
5. Applying the record to that base returns the shipped bytes, unchanged.

If a check fails, it prints which patch and what to do about it. It never throws.

## Why the base is reconstructed

Figma no longer serves the unpatched script: `figma.com/capture.js` and its old paths return 404 or
403. There is no pristine copy to diff against.

So the base in `SHIPPED.baseSha256` is derived from the shipped file by reversing the patch list.
It is a diff base: the text the next port starts from. It is not a claim that this is exactly the
file Figma served. When a real upstream copy shows up, `vendor:adopt` takes it and the base stops
being reconstructed.

`CLAUSE_ONLY` is the guard that keeps the reconstruction honest: `__h2d`, `selectNav` and
`copyIn2s` can only have come from Clause. If one survives un-patching, an edit is on disk that the
record does not describe.

`h2d-release` is not on that list on purpose. It is Figma's own postMessage type, part of the same
`h2d` prefix used throughout the file. Only the `__h2d*` bridge belongs to Clause.

## Upgrading to a newer capture script

1. Get the unpatched file. Open Figma in a browser, find the capture script's source URL in devtools
   and save it. Do not use the copy in this repo: that one is already patched.
2. `npm run vendor:adopt -- ~/Downloads/capture.js`
   It reports every anchor that no longer matches, with the reason each one exists. Nothing is
   written unless all 16 land.
3. For each missed anchor, find the equivalent code in the new file, update its `find` in
   `patches.mjs`, and run step 2 again. This is usually one or two anchors per release.
4. `npm run vendor:adopt -- ~/Downloads/capture.js --write`
5. `npm run vendor:pin`
   Records the new bytes, sha256 and base sha in `patches.mjs`.
6. `npm run check`, then test a real capture in Figma: a plain page, a page with a cross-origin
   iframe, a page using icons from a font, and the arrow-key element picker.
7. Commit `capture.js` and `patches.mjs` together. A commit with one and not the other fails CI.

`vendor:adopt` refuses a file that already contains Clause's hooks, because adopting a patched file
either doubles the hooks or reports every anchor as missing.

## The patches

Anchors are shown as they appear in the upstream file. All of them are minified, so they read like
line noise. The `why` in `patches.mjs` is the authoritative description.

| id | attaches to | what it does |
|---|---|---|
| `capturing-flag` | `function Ee(){` | marks a capture as in flight, so the toolbar is not pulled down mid-serialize |
| `capture-finished-on-error` | `function ce(e){` | clears both flags when a capture fails before the clipboard write |
| `quiet-release-during-capture` | `function M(){window===window.top&&` | stops the toolbar announcing a release while a capture is running |
| `close-button-menu` | `function tt(e){` | lets the extension replace Figma's close button with its own menu, wrapping the original as fallback |
| `prepare-before-serialize` | `h.log("Serializing DOM...");` | calls `__h2dPrepare` so icons are inlined and pseudo-elements realized before Figma reads the page |
| `restore-after-serialize` | `h.log("Converting to JSON...");` | calls `__h2dRestore` so the designer's live page goes back to how it was |
| `merge-child-frames` | `let n=yield Be(r);` | calls `__h2dMerge` to graft cross-origin iframe trees under their `<iframe>` nodes |
| `validate-before-release` | `function nt(e){` | calls `__h2dValidateCopy` before Figma is told the copy succeeded, so a bad capture stays a visible error |
| `done-on-success-toast` | `i=()=>{n&&(clearTimeout(n),n=null),` | sets `__h2dDone`, which is what the extension polls |
| `serialize-export` | `window.figma.captureForDesign=lr,` | exposes the vendor serializer as `__h2dSerialize`, the whole child-frame export path |
| `copy-in-2s-definition` | `function ve(){` | defines the two second countdown capture button |
| `copy-in-2s-toolbar` | `a.appendChild(ae("icon.24.new.tab",...` | puts that button in the send-to-Figma toolbar |
| `copy-in-2s-clipboard-bar` | `e.onSelectElement)),n.push(a)` | puts it in the clipboard toolbar too |
| `select-navigation-helpers` | `function rr(e){` | defines arrow-key navigation while picking an element (up to parent, down to child, left/right between siblings) |
| `select-navigation-keys` | `if(Ce(e)\|\|e.key==="Enter"){...` | wires the arrow keys into select mode, leaving Cmd/Ctrl+Enter and Escape alone |
| `select-navigation-reset` | `function Pe(e,t){or(),` | clears the navigation stack on each new selection |

## Rules

- Never edit `capture.js` by hand. `vendor:verify` will fail, and the next person has no record of
  what changed or why.
- Never edit a `replace` side without updating `find` to match the same upstream text.
- Never add a patch without a `why`. The reason is the part that survives the next upgrade.
- `patches.mjs` is hand-owned now. The generator that produced it was a one-off and is not in the
  repo; edit the file directly.
