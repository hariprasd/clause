// The protocol version is bumped whenever a route, event, key or payload shape changes in a way an
// already-installed part would not understand. Three parts are installed independently (server,
// Figma plugin, browser extension), so a mismatch is normal and must be diagnosed, not guessed at.
export const PRODUCT = "clause";

export const PROTOCOL_VERSION = 1;

// The oldest protocol this build still speaks, so a one-version upgrade does not force everyone to
// update at the same moment.
export const MIN_PROTOCOL_VERSION = 1;

export const PARTS = {
  server: "server",
  figma: "figma",
  extension: "extension",
  cli: "cli",
};

/**
 * Compare a version reported by another part against this build.
 * @param {number} remote
 * @param {{ part?: string, version?: string }} [meta]
 */
export function negotiate(remote, meta = {}) {
  const part = meta.part || "another part";
  const version = meta.version ? ` (v${meta.version})` : "";

  if (!Number.isInteger(remote) || remote < 0) {
    return {
      ok: false,
      code: "PROTOCOL_INVALID",
      hint: `${part} did not say which protocol it speaks. Reload it, and if it persists, reinstall ${part}.`,
    };
  }

  if (remote < MIN_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: "PROTOCOL_OLD",
      hint: `This ${part}${version} is too old for the rest of Clause. Update it (Clause: Update).`,
      remote,
      local: PROTOCOL_VERSION,
    };
  }

  if (remote > PROTOCOL_VERSION) {
    return {
      ok: false,
      code: "PROTOCOL_NEW",
      hint: `This ${part}${version} is newer than the rest of Clause. Update the other parts, or update Clause itself.`,
      remote,
      local: PROTOCOL_VERSION,
    };
  }

  return { ok: true, remote, local: PROTOCOL_VERSION };
}
