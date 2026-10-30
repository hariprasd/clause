// Every key that survives a reload: plugin data on Figma nodes, client storage, chrome storage,
// page localStorage, and the window-level bridge installed by the capture vendor file.

// Figma plugin data on nodes. These are the tags that let Clause find its own work again.
// One namespace, no aliases: a node either carries a Clause tag or it is a stranger.
export const PLUGIN_DATA = {
  screen: "clause:screen", // the screen JSON name a frame belongs to
  root: "clause:root", // marks a frame created by a build
  id: "clause:id", // the JSON node id (`i`) behind an instance
  hash: "clause:hash", // content hash, used to reuse unchanged top-level nodes
  section: "clause:section", // section marker
};

// Figma plugin client storage (figma.clientStorage).
export const CLIENT_STORAGE = {
  prefs: "clause-prefs",
  ui: "clause-ui",
  // written once per install; used by the server to recognise this plugin
  installId: "clause-install",
};

// chrome.storage.local in the extension.
export const EXTENSION_STORAGE = {
  includeHeader: "includeHeader",
  resolution: "resolution",
  sendToClause: "sendToClause",
  clauseUrl: "clauseUrl",
  installId: "clauseInstallId",
  paused: "clausePaused",
};

// localStorage inside the captured page, written by the vendor capture script's toolbar.
export const PAGE_STORAGE = {
  preferences: "figma.capturePreferences",
};

// Defaults for settings, in one place instead of four.
export const EXTENSION_DEFAULTS = {
  [EXTENSION_STORAGE.includeHeader]: true,
  [EXTENSION_STORAGE.resolution]: { preset: "auto", width: 1440, height: 900 },
  [EXTENSION_STORAGE.sendToClause]: true,
  [EXTENSION_STORAGE.clauseUrl]: "http://localhost:8787",
  [EXTENSION_STORAGE.paused]: false,
};

// Stored like a setting but generated once per install, so it has no default to fall back to.
export const EXTENSION_GENERATED = [EXTENSION_STORAGE.installId];

// Window-level hooks the extension installs so the vendor capture script can call back into it.
// If one of these is missing after a vendor upgrade, capture breaks: check them, loudly.
export const PAGE_BRIDGE = {
  serialize: "__h2dSerialize",
  merge: "__h2dMerge",
  prepare: "__h2dPrepare",
  restore: "__h2dRestore",
  validateCopy: "__h2dValidateCopy",
  capturing: "__h2dCapturing",
  done: "__h2dDone",
  prefs: "__h2dPrefs",
  report: "__h2dReport",
  lastHtml: "__h2dLastHtml",
  toolbarHost: "__figma_capture_toolbar_host__",
};

// Request headers.
export const HEADERS = {
  // shared secret between the CLI, extension and server: proves the caller is a local Clause part
  // and not a web page. Phase P1 replaces the static "1" with a per-install token.
  command: "x-clause",
  commandValue: "1",
  // which part is calling, and which protocol it speaks
  part: "x-clause-part",
  protocol: "x-clause-protocol",
};

// Files Clause owns inside the user's project directory.
//
// `.clause/` is the user's layer. An update replaces the product, never this directory. Everything
// Clause learns, and every change the user makes to the system, lives here.
export const STATE_FILES = {
  dir: ".clause",
  config: ".clause/config.json",
  learnings: ".clause/learnings.jsonl",
  agent: ".clause/agent.md", // the user's own instructions to the agent, never overwritten
  overrides: ".clause/overrides", // user patches, re-applied after every update
  token: ".clause/token",
  figmaFile: ".clause/figma-file",
  figmaToken: ".clause/figma-token",
  history: ".clause/history.json",
  idmap: ".clause/idmap.json",
  captureStats: ".clause/capture-stats.json",
  dsChoice: ".clause/ds-choice.json",
  localRules: ".clause/local-rules.md",
  update: ".clause/update.json",
};
