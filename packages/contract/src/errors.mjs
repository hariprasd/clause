// Error codes carry a fix. Every one of these strings is allowed to reach a designer in the Figma
// pane, so `message` says what happened and `hint` says what to do, in plain words, no ids.

/** @typedef {{ status: number, message: string, hint: string }} ErrorDef */

/** @type {Record<string, ErrorDef>} */
export const ERRORS = {
  BAD_REQUEST: {
    status: 400,
    message: "That request was incomplete.",
    hint: "Nothing was changed. Check what sent it and try again.",
  },
  UNAUTHORIZED: {
    status: 403,
    message: "Clause does not recognise this caller.",
    hint: "The part that sent this has an old token. Reload it, or run `clause doctor`.",
  },
  NOT_FOUND: {
    status: 404,
    message: "There is nothing at that address.",
    hint: "If a button in Clause did this, its version and the server's disagree. Update both.",
  },
  NO_SCREEN: {
    status: 404,
    message: "That screen does not exist yet.",
    hint: "Save a screen JSON first, or check the name.",
  },
  NO_CATALOG: {
    status: 409,
    message: "Clause does not know your design system yet.",
    hint: "Open your design-system file in Figma and run Clause Assist, then Extract components & tokens.",
  },
  NO_KEYS: {
    status: 409,
    message: "Clause has no compiled screen to borrow design-system keys from.",
    hint: "Build any screen once, then this will work.",
  },
  PORT_BUSY: {
    status: 409,
    message: "Something else is already using Clause's port.",
    hint: "Quit the other Clause (another terminal, or an old session), or run `clause live --port 8788`.",
  },
  PLUGIN_OFFLINE: {
    status: 503,
    message: "Clause Assist is not open in Figma.",
    hint: "Plugins, Development, Clause Assist. The pane can stay collapsed.",
  },
  SERVER_DOWN: {
    status: 503,
    message: "Clause's local server is not running.",
    hint: "Run `clause live`, or `clause service install` so it starts on its own.",
  },
  PROTOCOL_OLD: {
    status: 426,
    message: "One part of Clause is older than the others.",
    hint: "Update it, then try again. `clause doctor` says which part.",
  },
  PROTOCOL_NEW: {
    status: 426,
    message: "One part of Clause is newer than the others.",
    hint: "Update Clause itself, then reload Clause Assist.",
  },
  PROTOCOL_INVALID: {
    status: 426,
    message: "A part of Clause did not say which version it speaks.",
    hint: "Reload it. If it keeps happening, reinstall that part.",
  },
  DRIVER_UNAVAILABLE: {
    status: 501,
    message: "Clause cannot paste for you on this machine.",
    hint: "The page is on your clipboard. Press paste in Figma. `clause doctor` explains why.",
  },
  VENDOR_DRIFT: {
    status: 500,
    message: "The web capture script no longer matches what Clause expects.",
    hint: "Run `npm run vendor:verify`. Do not upgrade between captures.",
  },
  BUILD_FAILED: {
    status: 500,
    message: "The build stopped.",
    hint: "Read the first warning, fix it, save again. One thing at a time.",
  },
};

/**
 * Build a JSON body for a failed request.
 * @param {keyof typeof ERRORS} code
 * @param {Record<string, unknown>} [extra]
 */
export function fail(code, extra = {}) {
  const def = ERRORS[code] || ERRORS.NOT_FOUND;
  return { error: { code, ...def, ...extra } };
}

/** {"error": "text"} is the old shape. Accept both while the legacy tree is still around. */
export function messageOf(body) {
  if (!body) return "";
  if (typeof body.error === "string") return body.error;
  return (body.error && (body.error.hint || body.error.message)) || "";
}
