// What Clause adds to Figma's web capture script, in one place.
//
// packages/capture/capture.js is a minified build of Figma's own "copy page to Figma" script with
// edits on top. Those edits are not optional: the iframe capture path cannot work without them.
// This file is the record of every one, with the reason it exists.
//
// The `find` side is the upstream text we attach to. The `replace` side is what ships. Both are
// exact strings, not patterns, and vendor:verify proves that applying every patch to the
// reconstructed base returns the shipped file byte for byte.
//
// Source: reconstructed, see vendor/README.md. Figma no longer serves the unpatched file, so the
// base is derived from the shipped file by reversing this list. It is a diff base, not a claim
// about a file we still have.
//
// Upgrading: drop the new file somewhere, run `npm run vendor:adopt -- <file>`. It applies these
// entries and names every anchor that no longer exists, so the port is a checklist instead of
// archaeology. Then run `npm run vendor:pin` to update SHIPPED below.

export const SHIPPED = {
  file: "capture.js",
  bytes: 127367,
  sha256: "5ec6f8dea17f2e044318b32eda19b74308a3ac2150d2368c9bde63b32ebd6e92",
  baseSha256: "8a1c0c230a8108354e5e46a41ffd6abab3f72bf3386de092d6e14db3f14bb6e1",
};

// Anything that can only have come from Clause. If one of these survives un-patching, a patch is
// missing or a hand edit slipped in.
export const CLAUSE_ONLY = [
  "__h2d",
  "selectNav",
  "copyIn2s"
];

export const PATCHES = [
  {
    id: "capturing-flag",
    why: "Ee() starts a capture. The flag tells the toolbar close handler that a capture is in flight, so the toolbar is not pulled down mid-serialize.",
    find: "function Ee(){",
    replace: "function Ee(){window.__h2dCapturing=!0,",
  },
  {
    id: "capture-finished-on-error",
    why: "ce() shows an error toast. Clearing both flags here is the only path that ends a capture that failed before the clipboard write.",
    find: "function ce(e){",
    replace: "function ce(e){window.__h2dCapturing=!1,window.__h2dDone=1,",
  },
  {
    id: "quiet-release-during-capture",
    why: "M() closes the toolbar. While a capture is running it must not announce a release, or the extension thinks the capture was abandoned.",
    find: "function M(){window===window.top&&",
    replace: "function M(){window===window.top&&!window.__h2dCapturing&&",
  },
  {
    id: "close-button-menu",
    why: "The extension replaces Figma's close button with its own menu (include header, resolution). Wrapping tt() keeps Figma's button as the fallback.",
    find: "function tt(e){",
    replace: "function tt(e){var b=tt0(e);return window.__h2dCloseWithMenu?window.__h2dCloseWithMenu(b,p,()=>H):b}function tt0(e){",
  },
  {
    id: "prepare-before-serialize",
    why: "frames.js makes the page self-contained before Figma reads it: icons inlined, pseudo-elements realised. Without this hook captures lose their icons.",
    find: "h.log(\"Serializing DOM...\");",
    replace: "h.log(\"Serializing DOM...\");yield(window.__h2dPrepare?window.__h2dPrepare():0);",
  },
  {
    id: "restore-after-serialize",
    why: "Whatever prepare() changed on the live page has to be put back, even though Figma is about to read it. The designer keeps their page.",
    find: "h.log(\"Converting to JSON...\");",
    replace: "h.log(\"Converting to JSON...\");window.__h2dRestore&&window.__h2dRestore();",
  },
  {
    id: "merge-child-frames",
    why: "Cross-origin iframes serialize themselves. This grafts their trees under the matching <iframe> nodes in the parent payload.",
    find: "let n=yield Be(r);",
    replace: "let n=yield Be(r);window.__h2dMerge&&(n=yield window.__h2dMerge(n));",
  },
  {
    id: "validate-before-release",
    why: "The extension checks the payload against the page before Figma is told the copy succeeded: non-empty, right viewport, right frame. A bad capture stays a visible error instead of a silent one.",
    find: "function nt(e){",
    replace: "function nt(e){return nt0(e).then(function(r){return Promise.resolve(window.__h2dValidateCopy?window.__h2dValidateCopy(e):{ok:!0}).then(function(v){if(v&&!v.ok)throw new Error(v.message);window.__h2dCapturing=!1,window.__h2dDone=1,window===window.top&&window.postMessage({type:\"h2d-release\",reason:\"copied\",at:Date.now()},\"*\");return r})})}function nt0(e){",
  },
  {
    id: "done-on-success-toast",
    why: "The success toast is the point at which the extension stops waiting. __h2dDone is what it polls.",
    find: "i=()=>{n&&(clearTimeout(n),n=null),",
    replace: "i=()=>{n&&(clearTimeout(n),n=null),window.__h2dDone=1,",
  },
  {
    id: "serialize-export",
    why: "frames.js serializes a child frame by calling the vendor's own serializer. Exporting it is the whole iframe capture path.",
    find: "window.figma.captureForDesign=lr,",
    replace: "window.__h2dSerialize=de,window.figma.captureForDesign=lr,",
  },
  {
    id: "copy-in-2s-definition",
    why: "A toolbar button that counts down two seconds before capturing, so hover and menu states can be opened first. Hand-written, not Figma's.",
    find: "function ve(){",
    replace: "function copyIn2s(e){let t=ae(\"icon.24.browser\",\"Copy in 2s\",()=>{if(t.disabled)return;t.disabled=!0,t.style.cursor=\"default\";let r=t.querySelector(\"[data-toolbar-label]\"),n=2,o=()=>{r&&(r.textContent=`Copying in ${n}…`)};o();let a=setInterval(()=>{if(n--,!t.isConnected){clearInterval(a);return}n>0?o():(clearInterval(a),e())},1e3)});return t}function ve(){",
  },
  {
    id: "copy-in-2s-toolbar",
    why: "Puts the countdown button in the send-to-Figma toolbar, next to the other capture buttons.",
    find: "a.appendChild(ae(\"icon.24.new.tab\",E(\"openFile\"),e.onOpenFile))",
    replace: "a.appendChild(copyIn2s(e.onCapturePage)),a.appendChild(ae(\"icon.24.new.tab\",E(\"openFile\"),e.onOpenFile))",
  },
  {
    id: "copy-in-2s-clipboard-bar",
    why: "Same button in the clipboard toolbar, so a capture that was already copied can be redone after a two second pause.",
    find: "e.onSelectElement)),n.push(a)",
    replace: "e.onSelectElement)),a.appendChild(copyIn2s(e.onCapturePage)),n.push(a)",
  },
  {
    id: "select-navigation-helpers",
    why: "Arrow-key navigation while picking an element: up to parent, down to the child you came from, left/right between siblings. Hand-written, not Figma's.",
    find: "function rr(e){",
    replace: "var selectNavStack=[];function selectNavVisible(e){if(et(e))return!1;let t=e.getBoundingClientRect();return t.width>0&&t.height>0}function selectNavSibling(e,t){for(let r=t?e.nextElementSibling:e.previousElementSibling;r;r=t?r.nextElementSibling:r.previousElementSibling)if(selectNavVisible(r))return r;return null}function selectNav(e){let t=X,r=null;if(!t)r=document.body;else if(e===\"ArrowUp\"){let n=t.parentElement;t!==document.body&&n&&n!==document.documentElement&&(selectNavStack.push(t),r=n)}else if(e===\"ArrowDown\"){let n=selectNavStack.pop();n&&n.parentElement===t&&selectNavVisible(n)?r=n:(selectNavStack=[],r=Array.from(t.children).find(selectNavVisible)||null)}else r=selectNavSibling(t,e===\"ArrowRight\"),r&&(selectNavStack=[]);r&&(r.scrollIntoView({block:\"nearest\",inline:\"nearest\",behavior:\"instant\"}),zn(r))}function rr(e){",
  },
  {
    id: "select-navigation-keys",
    why: "Wires the arrow keys into the select-mode key handler, and leaves Cmd/Ctrl+Enter and Escape exactly as Figma had them.",
    find: "if(Ce(e)||e.key===\"Enter\"){e.preventDefault(),e.stopPropagation(),qt();return}}",
    replace: "if(Ce(e)||e.key===\"Enter\"){e.preventDefault(),e.stopPropagation(),qt();return}/^Arrow(Up|Down|Left|Right)$/.test(e.key)&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&(e.preventDefault(),e.stopPropagation(),selectNav(e.key))}",
  },
  {
    id: "select-navigation-reset",
    why: "Each new selection starts with an empty stack, or ArrowDown would walk into a previous element's children.",
    find: "function Pe(e,t){or(),",
    replace: "function Pe(e,t){or(),selectNavStack=[],",
  },
];
