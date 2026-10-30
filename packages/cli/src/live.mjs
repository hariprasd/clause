// Starting Clause has one failure mode that used to happen to real people: the port was already held,
// so the process died with EADDRINUSE or, worse, fought the server that was already working.
//
// So `clause live` asks the port first:
//   · a healthy Clause is already there  -> say so, exit 0, open nothing
//   · another program is there           -> PORT_BUSY with the next port to try, exit 1
//   · nothing is there                   -> spawn the server
//
// The decision is a pure plan, so the tests can describe those three machines without opening one.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PORT, describeProbe, probeServer } from "./server-probe.mjs";

export function parsePort(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_PORT;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

/**
 * @param {{ cwd?: string, port?: string|number, open?: boolean, exists?: (path: string) => boolean, env?: Record<string, string|undefined> }} [options]
 */
export function resolveServer({
  cwd = process.cwd(),
  port,
  open = false,
  exists = existsSync,
  env = process.env,
} = {}) {
  const parsed = parsePort(port);
  if (parsed === null) return { ok: false, reason: "--port must be a number between 1 and 65535." };

  const script = join(cwd, "scripts", "serve.mjs");
  if (!exists(script)) {
    return { ok: false, reason: "no scripts/serve.mjs here. Run `clause live` from the Clause folder." };
  }

  return {
    ok: true,
    script,
    port: parsed,
    args: open ? ["--open"] : [],
    env: { ...env, PORT: String(parsed) },
  };
}

/**
 * `clause setup` prepares a machine: it checks tools, generates tokens.css and the plugin.
 * @param {{ cwd?: string, port?: string|number, exists?: (path: string) => boolean, env?: Record<string, string|undefined> }} [options]
 */
export function resolveSetup({ cwd = process.cwd(), port, exists = existsSync, env = process.env } = {}) {
  const parsed = parsePort(port);
  if (parsed === null) return { ok: false, reason: "--port must be a number between 1 and 65535." };

  const script = join(cwd, "scripts", "setup.mjs");
  if (!exists(script)) {
    return { ok: false, reason: "no scripts/setup.mjs here. Run `clause setup` from the Clause folder." };
  }

  return {
    ok: true,
    script,
    port: parsed,
    args: ["--port", String(parsed)],
    env: { ...env, PORT: String(parsed) },
  };
}

/**
 * The same plan, but it asks the port before deciding to spawn.
 * @param {{ cwd?: string, port?: string|number, open?: boolean, exists?: (path: string) => boolean, env?: Record<string, string|undefined>, probe?: typeof probeServer }} [options]
 */
export async function planLive(options = {}) {
  const resolved = resolveServer(options);
  if (!resolved.ok) return resolved;

  const probe = options.probe ?? probeServer;
  let state;
  try {
    state = await probe({ port: resolved.port });
  } catch (error) {
    state = {
      state: "occupied",
      port: resolved.port,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (state.state === "clause") {
    return {
      ok: false,
      already: true,
      port: resolved.port,
      reason: `Clause is already running on port ${resolved.port}.`,
    };
  }
  if (state.state === "occupied") {
    const described = describeProbe(state);
    return {
      ok: false,
      port: resolved.port,
      code: described.code,
      reason: described.message,
      hint: described.hint,
    };
  }

  return resolved;
}
