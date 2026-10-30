// Is something already on Clause's port, and is it Clause?
//
// "Connection refused" and "something accepted my connection but is not Clause" are very different
// problems, so this checks the socket first and only then asks /health. That distinction is what
// keeps a second `clause live` from dying with EADDRINUSE and no explanation.

import { connect } from "node:net";
import { ERRORS } from "@clause/contract/errors";

export const DEFAULT_PORT = 8787;
export const HOST = "127.0.0.1";

/**
 * @param {number} port
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<boolean>} true when something is listening
 */
export function isPortOpen(port, { timeout = 800 } = {}) {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * @param {{
 *   port?: number,
 *   timeout?: number,
 *   fetch?: typeof fetch,
 *   portOpen?: (port: number) => Promise<boolean>,
 * }} [options]
 * @returns {Promise<
 *   | { state: "clause", port: number, screens: number | null, version: string | null, protocol: number | null }
 *   | { state: "down", port: number }
 *   | { state: "timeout", port: number }
 *   | { state: "occupied", port: number, status: number | null, detail: string }
 * >}
 */
export async function probeServer({
  port = DEFAULT_PORT,
  timeout = 1500,
  fetch = globalThis.fetch,
  portOpen = isPortOpen,
} = {}) {
  if (!(await portOpen(port))) return { state: "down", port };

  let response;
  try {
    response = await fetch(`http://${HOST}:${port}/health`, {
      signal: AbortSignal.timeout(timeout),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return { state: "timeout", port };
    }
    return {
      state: "occupied",
      port,
      status: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const body = await response.json().catch(() => null);
  if (response.ok && body && body.ok === true) {
    return {
      state: "clause",
      port,
      screens: Array.isArray(body.screens) ? body.screens.length : null,
      version: typeof body.version === "string" ? body.version : null,
      protocol: Number.isInteger(body.protocol) ? body.protocol : null,
    };
  }

  return {
    state: "occupied",
    port,
    status: response.status,
    detail: response.ok ? "the answer was not Clause's" : `it answered with HTTP ${response.status}`,
  };
}

/**
 * A login service does not start instantly. Give it a few seconds, then report what actually
 * happened instead of claiming success because the file was written.
 * @param {number} port
 * @param {{ attempts?: number, delay?: number, probe?: typeof probeServer }} [options]
 */
export async function waitForClause(port, { attempts = 12, delay = 250, probe = probeServer } = {}) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await probe({ port });
    if (last.state === "clause") return last;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return last;
}

/** What to tell the designer about a probe result. Codes come from the contract. */ export function describeProbe(
  result,
) {
  switch (result.state) {
    case "clause": {
      const screens =
        result.screens === null ? "" : `, ${result.screens} screen${result.screens === 1 ? "" : "s"}`;
      const version = result.version ? `, version ${result.version}` : "";
      return {
        status: "ok",
        detail: `already running on port ${result.port}${version}${screens}`,
      };
    }
    case "down":
      return {
        status: "warn",
        code: "SERVER_DOWN",
        detail: `nothing is listening on port ${result.port}`,
        message: ERRORS.SERVER_DOWN.message,
        hint: ERRORS.SERVER_DOWN.hint,
      };
    case "timeout":
      return {
        status: "error",
        code: "PORT_BUSY",
        detail: `something on port ${result.port} accepted a connection but did not answer`,
        message: ERRORS.PORT_BUSY.message,
        hint: "It may be a hung Clause or another program. Quit it, or run `clause live --port 8788`.",
      };
    default:
      return {
        status: "error",
        code: "PORT_BUSY",
        detail: `port ${result.port} is used by something that is not Clause (${result.detail})`,
        message: ERRORS.PORT_BUSY.message,
        hint: ERRORS.PORT_BUSY.hint,
      };
  }
}
