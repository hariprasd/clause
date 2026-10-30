// Every HTTP route the server speaks, with who is allowed to call it.
//
// Path parameters use `:name`. A route marked `command` changes something on the design machine
// (the canvas, the catalog, the clipboard, the agent): those are the ones that need the install
// token once it lands, and the ones the browser must never reach.
//
// callers:
//   browser   a web page or the user's own tab
//   plugin    Clause Assist, inside Figma
//   extension the browser extension
//   agent     Claude (via the CLI or curl on the same machine)
//   cli       the `clause` binary

/** @typedef {'GET'|'POST'|'OPTIONS'} Method */

/**
 * @param {string} name
 * @param {Method[]} methods
 * @param {string} path
 * @param {('browser'|'plugin'|'extension'|'agent'|'cli')[]} callers
 * @param {{ command?: boolean }} [flags]
 */
const def = (name, methods, path, callers, flags = {}) => ({
  name,
  methods,
  path,
  callers,
  command: flags.command === true,
});

export const ROUTES = /** @type {const} */ ([
  // ---- server surface ------------------------------------------------------
  def("listing", ["GET"], "/", ["browser"]),
  def("tokensCss", ["GET"], "/tokens.css", ["browser"]),
  def("exportsIndex", ["GET"], "/exports.json", ["browser"]),
  def("exportFile", ["GET"], "/export/:name", ["browser"]),
  def("health", ["GET"], "/health", ["agent", "cli"]),
  // Every part says which protocol it speaks before it does any work. A mismatch is a version
  // problem with a named fix, not a mystery 404 halfway through a build.
  def("hello", ["GET"], "/hello", ["browser", "plugin", "extension", "agent", "cli"]),
  def("status", ["GET"], "/status", ["browser", "plugin", "extension", "agent", "cli"]),
  def("events", ["GET"], "/events", ["browser", "plugin", "extension"]),

  // ---- plugin transport (server -> Figma) ----------------------------------
  def("state", ["GET"], "/state", ["plugin"]),
  def("scene", ["GET"], "/scene", ["plugin"]),
  def("runtime", ["GET"], "/runtime", ["plugin"]),
  def("result", ["GET", "POST"], "/result", ["plugin", "agent"]),
  def("idmap", ["GET"], "/idmap", ["plugin", "agent"]),
  def("goto", ["POST"], "/goto", ["agent", "cli"], { command: true }),
  def("push", ["POST"], "/push/:name", ["agent", "cli", "plugin"], { command: true }),
  def("dom", ["POST"], "/dom/:name", ["plugin"]),
  def("domerror", ["POST"], "/domerror", ["plugin"]),

  // ---- catalog -------------------------------------------------------------
  def("dsActive", ["GET"], "/ds/active", ["plugin", "agent", "browser"]),
  def("dsFile", ["POST"], "/ds/file", ["plugin"]),
  def("dsChoose", ["POST"], "/ds/choose", ["plugin", "agent"], { command: true }),
  def("dsById", ["POST"], "/ds/:id", ["plugin", "agent"], { command: true }),
  def("extract", ["GET"], "/extract", ["agent"]),
  def("extractStart", ["POST"], "/extract/start", ["agent", "cli"], { command: true }),
  def("extractDs", ["POST"], "/extract/ds", ["plugin"]),

  // ---- build and edit ------------------------------------------------------
  def("swap", ["POST"], "/swap", ["agent", "cli"], { command: true }),
  def("mobilize", ["POST"], "/mobilize", ["agent", "cli"], { command: true }),
  def("variant", ["POST"], "/variant", ["agent", "cli"], { command: true }),
  def("inspect", ["POST"], "/inspect/:id", ["agent", "cli", "plugin"], { command: true }),
  def("snap", ["POST"], "/snap/:label", ["agent", "cli", "plugin"], { command: true }),
  def("pages", ["POST"], "/pages", ["agent", "cli", "plugin"], { command: true }),

  // ---- review (designer <-> agent) ----------------------------------------
  def("inbox", ["GET"], "/inbox", ["agent", "cli"]),
  def("term", ["GET"], "/term", ["plugin", "agent"]),
  def("termCommands", ["GET"], "/term/commands", ["plugin", "agent"]),
  def("termAdd", ["POST"], "/term/add", ["plugin"], { command: true }),
  def("termEdit", ["POST"], "/term/edit", ["plugin"], { command: true }),
  def("termRemove", ["POST"], "/term/remove", ["plugin"], { command: true }),
  def("termSend", ["POST"], "/term/send", ["plugin"], { command: true }),
  def("termReply", ["POST"], "/term/reply", ["agent", "cli"], { command: true }),
  def("termStatus", ["POST"], "/term/status", ["agent", "cli"], { command: true }),
  def("termStop", ["POST"], "/term/stop", ["plugin"], { command: true }),
  def("termDiscard", ["POST"], "/term/discard", ["plugin"], { command: true }),
  def("termNew", ["POST"], "/term/new", ["plugin"], { command: true }),
  def("termOpen", ["POST"], "/term/open", ["plugin"], { command: true }),
  def("termRename", ["POST"], "/term/rename", ["plugin"], { command: true }),
  def("termDeleteSession", ["POST"], "/term/delete-session", ["plugin"], { command: true }),
  def("termClear", ["POST"], "/term/clear", ["plugin"], { command: true }),

  // ---- capture (web -> Figma) ---------------------------------------------
  def("capture", ["GET"], "/capture", ["extension"]),
  def("capturePing", ["POST"], "/capture/ping", ["extension"]),
  def("capturePaste", ["POST"], "/capture/paste", ["extension"], { command: true }),
  def("captureStage", ["POST"], "/capture/stage", ["extension"], { command: true }),
  def("captureQueue", ["GET"], "/capture/queue", ["plugin", "extension"]),
  def("captureQueuePaste", ["POST"], "/capture/queue/paste", ["plugin"], { command: true }),
  def("captureQueueRemove", ["POST"], "/capture/queue/remove", ["plugin"], { command: true }),
  def("captureQueueClear", ["POST"], "/capture/queue/clear", ["plugin"], { command: true }),
  def("captureGo", ["POST"], "/capture/go", ["plugin"], { command: true }),
  def("captureCancel", ["POST"], "/capture/cancel", ["plugin"], { command: true }),
  def("captureSettings", ["GET", "POST"], "/capture/settings", ["plugin"], { command: true }),
  def("captureResult", ["GET"], "/capture/result", ["plugin"]),
  def("captureStatus", ["GET"], "/capture/status", ["plugin", "extension"]),
  def("captureReset", ["POST"], "/capture/reset", ["plugin"], { command: true }),
]);

const byName = new Map(ROUTES.map((r) => [r.name, r]));

/** @param {string} name */
export function route(name) {
  const r = byName.get(name);
  if (!r) throw new Error(`unknown route "${name}"`);
  return r;
}

/** @param {string} name @param {Record<string, string|number>} [params] */
export function path(name, params = {}) {
  return route(name).path.replace(/:([a-zA-Z]+)/g, (_, key) => {
    const value = params[key];
    if (value === undefined) throw new Error(`route "${name}" needs :${key}`);
    return encodeURIComponent(String(value));
  });
}
