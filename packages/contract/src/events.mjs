// Server -> plugin events over SSE (/events). One name per thing that actually happens; the plugin
// switches on `type` and nothing else.
export const EVENTS = {
  // the scene to build changed; the plugin fetches /state
  state: "state",
  // a build finished (or failed); the plugin fetches /result
  result: "result",
  // agent presence for the pane: thinking | building | built | error | stopped | idle
  agent: "agent",
  // the review inbox changed (new message, reply, queued item)
  term: "term",
  // navigate the Figma viewport to a page/node
  goto: "goto",
  // a web capture is about to paste: clear the selection first
  webpaste: "webpaste",
  // the paste finished; select and zoom to the new layers
  webpasteDone: "webpaste-done",
  // catalog extraction progress from the plugin (parts, progress, done)
  dsProgress: "ds-progress",
  dsPart: "ds-part",
  dsDone: "ds-done",
  capture: "capture",
  extract: "extract",
  // HTML export payloads from the plugin
  dom: "dom",
  domError: "domerror",
  // runtime recolour / style refresh
  rt: "rt",
};

// Agent presence states the pane renders. `busy` keeps the working animation alive.
export const AGENT_STATES = /** @type {const} */ ([
  "idle",
  "thinking",
  "building",
  "built",
  "error",
  "stopped",
]);

// Messages the plugin UI (iframe) posts to Figma code.js, and back.
// `uiToCode` changes something in the file; `codeToUi` reports state.
export const MESSAGES = {
  uiToCode: /** @type {const} */ ([
    "cmd",
    "ready",
    "prompt",
    "sel-get",
    "locate",
    "toggle",
    "resize",
    "startState",
    "collapsedState",
    "extract",
    "capture",
    "goto",
    "prefs",
    "pos-debug",
    "webpaste-before",
    "webpaste-after",
    "webpaste-await",
    "webpaste-restore",
    "webpaste-batch",
  ]),
  codeToUi: /** @type {const} */ ([
    "cmd",
    "file",
    "sel",
    "state",
    "result",
    "agent",
    "term",
    "rt",
    "prefs",
    "startState",
    "collapsedState",
    "extract",
    "capture",
    "goto",
    "prompt",
    "locate",
    "pos-debug",
    "webpaste",
    "webpaste-done",
    "ds-progress",
    "ds-part",
    "ds-done",
    "dom",
    "domerror",
    "build",
  ]),
};

// postMessage names used inside the captured page (extension <-> capture script, MAIN world).
// These belong to the vendor bridge, not to Clause's own transport, but they cross a boundary and
// so they live here rather than in a string somewhere.
export const PAGE_MESSAGES = {
  setPref: "h2d-set-pref",
  release: "h2d-release",
  toast: "clause-toast",
};
