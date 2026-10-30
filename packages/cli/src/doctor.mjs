// Doctor answers one question honestly: what can this machine do right now, and for anything it
// cannot, what is the exact next action?
//
// It never throws and never prints a stack trace. A refused connection, a port held by another
// program, a missing catalog and an old Node version are all normal states with known fixes, so each
// becomes a check with a status and a sentence. Everything is injectable, so the tests can describe
// a machine instead of needing one.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { verify as verifyCapture } from "@clause/capture/vendor/verify";
import { ERRORS } from "@clause/contract/errors";
import { negotiate } from "@clause/contract/version";
import { selectDriver } from "@clause/paste";
import { findWorkspace, learningStats, loadOverrides, workspacePaths } from "@clause/workspace";
import { DEFAULT_PORT, describeProbe, probeServer } from "./server-probe.mjs";
import { serviceLocation } from "./service.mjs";

export const VERSION = "0.1.0";

const MIN_NODE = 20;

/**
 * @typedef {{ id: string, title: string, status: "ok"|"warn"|"error"|"info", detail: string,
 *   code?: string, message?: string, hint?: string }} Check
 */

/**
 * @param {{
 *   cwd?: string,
 *   root?: string | null,
 *   port?: number,
 *   platform?: string,
 *   home?: string,
 *   nodeVersion?: string,
 *   probe?: typeof probeServer,
 *   driver?: { name: string, available: () => Promise<{ ok: boolean, reason: string }> } | null,
 *   verifyFile?: (text: string) => { ok: boolean, problems: string[], patches?: number, bytes?: number, baseBytes?: number },
 *   now?: string,
 * }} [options]
 */
export async function runDoctor({
  cwd = process.cwd(),
  root,
  port = DEFAULT_PORT,
  platform = process.platform,
  home = homedir(),
  nodeVersion = process.version,
  probe = probeServer,
  driver = null,
  verifyFile = verifyCapture,
  now = new Date().toISOString(),
} = {}) {
  /** @type {Check[]} */
  const checks = [];
  const add = (check) => checks.push(check);

  // Node is the only hard prerequisite Clause has.
  const major = Number(String(nodeVersion).replace(/^v/, "").split(".")[0]);
  if (Number.isFinite(major) && major >= MIN_NODE) {
    add({ id: "node", title: "node", status: "ok", detail: nodeVersion });
  } else {
    add({
      id: "node",
      title: "node",
      status: "error",
      detail: `${nodeVersion} is too old`,
      message: `Clause needs Node ${MIN_NODE} or newer.`,
      hint: "Install the current Node from nodejs.org, then open a new terminal.",
    });
  }

  // The workspace is where the user's rules, learnings and edits live. It is theirs, and its
  // absence is normal before `clause init`.
  const workspaceRoot = root === undefined ? findWorkspace(cwd) : root;
  const workspaceDir = workspaceRoot ? workspacePaths(workspaceRoot).dir : null;
  let learnings = null;
  let overrides = null;

  if (!workspaceRoot || !workspaceDir || !existsSync(workspaceDir)) {
    add({
      id: "workspace",
      title: "workspace",
      status: "warn",
      detail: "this folder has not been set up",
      hint: "Run `clause init` here. It creates .clause/ and never overwrites anything in it.",
    });
  } else {
    const paths = workspacePaths(workspaceRoot);
    learnings = learningStats(workspaceRoot);
    overrides = loadOverrides(workspaceRoot);

    if (overrides.problems.length) {
      add({
        id: "workspace",
        title: "workspace",
        status: "error",
        detail: `${paths.dir} has ${overrides.problems.length} problem${overrides.problems.length === 1 ? "" : "s"} in your edits`,
        message: overrides.problems.join(" "),
        hint: "Fix .clause/overrides/. Nothing is applied until every patch is readable.",
      });
    } else {
      const parts = [
        `${learnings.count} learning${learnings.count === 1 ? "" : "s"}`,
        `${overrides.patches.length} override${overrides.patches.length === 1 ? "" : "s"}`,
      ];
      add({
        id: "workspace",
        title: "workspace",
        status: "ok",
        detail: `${paths.dir} (${parts.join(", ")})`,
      });
    }
  }

  // Is Clause already running on its port? A healthy instance is good news, not a conflict.
  let probed;
  try {
    probed = await probe({ port });
  } catch (error) {
    probed = {
      state: "occupied",
      port,
      status: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const server = describeProbe(probed);
  add({
    id: "server",
    title: "server",
    status: server.status,
    detail: server.detail,
    code: server.code,
    message: server.message,
    hint: server.hint,
  });

  // A healthy server can still be an old one. The handshake turns that into a named part and a fix
  // instead of a request that mysteriously 404s halfway through a build.
  if (probed && probed.state === "clause") {
    const hello = negotiate(probed.protocol, { part: "server", version: probed.version || undefined });
    if (hello.ok) {
      add({
        id: "protocol",
        title: "protocol",
        status: "ok",
        detail: `this command and the server both speak ${hello.local}`,
      });
    } else {
      add({
        id: "protocol",
        title: "protocol",
        status: "error",
        detail:
          probed.protocol === null || probed.protocol === undefined
            ? "the server did not say which protocol it speaks"
            : `the server speaks ${probed.protocol}, this command speaks ${hello.local}`,
        code: hello.code,
        message: ERRORS[hello.code] ? ERRORS[hello.code].message : undefined,
        hint: hello.hint,
      });
    }
  }

  // The pinned capture file, when this is a checkout that has one.
  const captureFile = workspaceRoot ? join(workspaceRoot, "packages", "capture", "capture.js") : null;
  if (captureFile && existsSync(captureFile)) {
    try {
      const report = verifyFile(readFileSync(captureFile, "utf8"));
      if (report.ok) {
        add({
          id: "capture",
          title: "capture",
          status: "ok",
          detail: `${report.patches} patches, ${report.bytes} bytes`,
        });
      } else {
        add({
          id: "capture",
          title: "capture",
          status: "error",
          detail: "the pinned capture script no longer matches its record",
          code: "VENDOR_DRIFT",
          message: ERRORS.VENDOR_DRIFT.message,
          hint: "Run `npm run vendor:verify`. If you edited capture.js by hand, revert it.",
        });
      }
    } catch (error) {
      add({
        id: "capture",
        title: "capture",
        status: "error",
        detail: "the capture record could not be read",
        message: error instanceof Error ? error.message : String(error),
        hint: "Run `npm run vendor:verify`.",
      });
    }
  }

  // The plugin, when this is a checkout that builds one.
  const manifest = workspaceRoot ? join(workspaceRoot, "figma-plugin", "manifest.json") : null;
  if (manifest && existsSync(manifest)) {
    let id = null;
    try {
      id = JSON.parse(readFileSync(manifest, "utf8")).id;
    } catch {
      id = null;
    }
    if (id === "clause-assist-dev") {
      add({ id: "plugin", title: "plugin", status: "ok", detail: "built and importable" });
    } else {
      add({
        id: "plugin",
        title: "plugin",
        status: "warn",
        detail: "manifest.json is missing or has another id",
        hint: "Run `npm run plugin`, then import figma-plugin/manifest.json in Figma.",
      });
    }
  }

  // Auto-start is optional, so its absence is information, not a warning. Someone who only ever
  // runs `clause live` by hand is not doing anything wrong.
  const startup = serviceLocation({ platform, home });
  if (startup.file) {
    if (existsSync(startup.file)) {
      add({ id: "startup", title: "startup", status: "ok", detail: "starts Clause at login" });
    } else {
      add({
        id: "startup",
        title: "startup",
        status: "info",
        detail: "starts only when you run `clause live`",
        hint: "Optional: `clause service install` keeps it running in the background.",
      });
    }
  }

  // The user's catalog. Absent is normal before they extract one.
  if (workspaceRoot) {
    const catalog = join(workspaceRoot, "ds", "components.json");
    if (existsSync(catalog)) {
      add({ id: "catalog", title: "catalog", status: "ok", detail: "ds/components.json" });
    } else {
      add({
        id: "catalog",
        title: "catalog",
        status: "warn",
        detail: "no design system extracted yet",
        code: "NO_CATALOG",
        message: ERRORS.NO_CATALOG.message,
        hint: ERRORS.NO_CATALOG.hint,
      });
    }
  }

  // Pasting. Manual is a real answer, not a failure.
  try {
    const selected = driver ? { driver, fallback: false } : await selectDriver(platform);
    add({
      id: "paste",
      title: "paste",
      status: selected.driver.name === "manual" ? "info" : "ok",
      detail:
        selected.driver.name === "manual"
          ? "you press the paste key"
          : "Clause can press the paste key for you",
      hint:
        selected.driver.name === "manual"
          ? "Captures still work: they are copied, you press paste in Figma."
          : undefined,
    });
  } catch (error) {
    add({
      id: "paste",
      title: "paste",
      status: "info",
      detail: "you press the paste key",
      hint: "Captures still work: they are copied, you press paste in Figma.",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const errors = checks.filter((c) => c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warn").length;

  return {
    ok: errors === 0,
    version: VERSION,
    platform,
    port: resolvePort(port),
    generatedAt: now,
    checks,
    errors,
    warnings,
  };
}

function resolvePort(port) {
  const value = Number(port);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : DEFAULT_PORT;
}
