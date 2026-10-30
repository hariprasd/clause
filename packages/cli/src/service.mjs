// `clause service` keeps the local server running without a terminal window.
//
// One server, three operating systems, no administrator password:
//   macOS    a LaunchAgent in ~/Library/LaunchAgents, started at login
//   Linux    a systemd user unit, started at login
//   Windows  a logon task that runs a small .cmd wrapper
//
// Everything is planned as data first. Tests describe a Mac, a Linux box and a Windows machine and
// check the exact file and commands, so none of them needs to run on that machine to be verified.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, posix, win32 } from "node:path";
import { parsePort } from "./live.mjs";

export const LAUNCHD_LABEL = "dev.clause.server";
export const SYSTEMD_UNIT = "clause.service";
export const SCHTASKS_NAME = "Clause";

/**
 * Where this platform keeps a per-user startup entry. No path is ever written outside the user's
 * own home, so installing never needs root.
 * @param {{ platform?: string, home?: string }} [options]
 */
export function serviceLocation({ platform = process.platform, home = homedir() } = {}) {
  // The planner is testable on any host, so each plan uses the path rules of the platform it
  // targets, not the one it happens to run on.
  const joinPath = platform === "win32" ? win32.join : posix.join;

  if (platform === "darwin") {
    return { kind: "launchd", file: joinPath(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`) };
  }
  if (platform === "linux") {
    return { kind: "systemd", file: joinPath(home, ".config", "systemd", "user", SYSTEMD_UNIT) };
  }
  if (platform === "win32") {
    return {
      kind: "schtasks",
      file: joinPath(home, "AppData", "Local", "Clause", "clause-server.cmd"),
    };
  }
  return { kind: null, file: null };
}

const xml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function plist({ root, node, script, port, log }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(LAUNCHD_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(script)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${port}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`;
}

function systemdUnit({ root, node, script, port }) {
  return `[Unit]
Description=Clause local server
After=network.target

[Service]
Type=simple
WorkingDirectory="${root}"
ExecStart="${node}" "${script}"
Environment=PORT=${port}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`;
}

function windowsWrapper({ node, script, port }) {
  return `@echo off
set "PORT=${port}"
"${node}" "${script}"
`;
}

/**
 * Everything the command will do, as data.
 * @param {{
 *   action?: "install"|"uninstall"|"status",
 *   platform?: string,
 *   home?: string,
 *   root?: string,
 *   node?: string,
 *   port?: string|number,
 *   uid?: number|null,
 *   exists?: (path: string) => boolean,
 * }} [options]
 */
export function planService({
  action = "install",
  platform = process.platform,
  home = homedir(),
  root = process.cwd(),
  node = process.execPath,
  port,
  uid = typeof process.getuid === "function" ? process.getuid() : null,
  exists = existsSync,
} = {}) {
  const { kind, file } = serviceLocation({ platform, home });
  if (!kind) {
    return {
      ok: false,
      reason: `Clause does not know how to start itself on ${platform}. Run \`clause live\` in a terminal instead.`,
    };
  }

  if (action === "status") {
    return { ok: true, kind, file, commands: [statusCommand(kind, { uid })] };
  }

  if (action === "uninstall") {
    return {
      ok: true,
      kind,
      file,
      commands: uninstallCommands(kind, { file, uid }),
      remove: [file],
    };
  }

  const parsed = parsePort(port);
  if (parsed === null) return { ok: false, reason: "--port must be a number between 1 and 65535." };

  const joinPath = platform === "win32" ? win32.join : posix.join;
  const script = joinPath(root, "scripts", "serve.mjs");
  if (!exists(script)) {
    return {
      ok: false,
      reason: "no scripts/serve.mjs here. Run `clause service install` from the Clause folder.",
    };
  }

  const log = joinPath(root, ".clause", "service.log");
  const content =
    kind === "launchd"
      ? plist({ root, node, script, port: parsed, log })
      : kind === "systemd"
        ? systemdUnit({ root, node, script, port: parsed })
        : windowsWrapper({ node, script, port: parsed });

  return {
    ok: true,
    kind,
    file,
    files: [{ path: file, content }],
    dirs: kind === "launchd" ? [joinPath(root, ".clause")] : [],
    commands: installCommands(kind, { file, uid }),
    port: parsed,
  };
}

function installCommands(kind, { file, uid }) {
  if (kind === "launchd") {
    const domain = uid === null ? null : `gui/${uid}`;
    return [
      ...(domain
        ? [{ cmd: "launchctl", args: ["bootout", `${domain}/${LAUNCHD_LABEL}`], optional: true }]
        : []),
      ...(domain
        ? [{ cmd: "launchctl", args: ["bootstrap", domain, file] }]
        : [{ cmd: "launchctl", args: ["load", "-w", file] }]),
    ];
  }
  if (kind === "systemd") {
    return [
      { cmd: "systemctl", args: ["--user", "daemon-reload"] },
      { cmd: "systemctl", args: ["--user", "enable", "--now", SYSTEMD_UNIT] },
    ];
  }
  return [
    { cmd: "schtasks", args: ["/Create", "/TN", SCHTASKS_NAME, "/SC", "ONLOGON", "/TR", file, "/F"] },
    { cmd: "schtasks", args: ["/Run", "/TN", SCHTASKS_NAME], optional: true },
  ];
}

function uninstallCommands(kind, { file, uid }) {
  if (kind === "launchd") {
    const domain = uid === null ? null : `gui/${uid}`;
    return domain
      ? [{ cmd: "launchctl", args: ["bootout", `${domain}/${LAUNCHD_LABEL}`], optional: true }]
      : [{ cmd: "launchctl", args: ["unload", "-w", file], optional: true }];
  }
  if (kind === "systemd") {
    return [
      { cmd: "systemctl", args: ["--user", "disable", "--now", SYSTEMD_UNIT], optional: true },
      { cmd: "systemctl", args: ["--user", "daemon-reload"], optional: true },
    ];
  }
  return [
    { cmd: "schtasks", args: ["/End", "/TN", SCHTASKS_NAME], optional: true },
    { cmd: "schtasks", args: ["/Delete", "/TN", SCHTASKS_NAME, "/F"], optional: true },
  ];
}

function statusCommand(kind, { uid }) {
  if (kind === "launchd") {
    return { cmd: "launchctl", args: ["print", `gui/${uid ?? 0}/${LAUNCHD_LABEL}`] };
  }
  if (kind === "systemd") return { cmd: "systemctl", args: ["--user", "is-active", SYSTEMD_UNIT] };
  return { cmd: "schtasks", args: ["/Query", "/TN", SCHTASKS_NAME] };
}

function firstLine(error) {
  const text = String((error && (error.stderr || error.stdout || error.message)) || error);
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0] || "the command failed"
  );
}

const defaultRun = (cmd, args, options) => execFileSync(cmd, args, { stdio: "pipe", ...options });

/**
 * Which port the installed entry was written for. A service on one port must not be mistaken for
 * permission to start a second one somewhere else.
 * @param {{ kind?: string|null, file?: string|null }} location
 * @param {{ read?: (path: string) => string }} [options]
 */
export function readInstalledPort({ kind, file } = {}, { read = (path) => readFileSync(path, "utf8") } = {}) {
  if (!kind || !file) return null;
  let content = "";
  try {
    content = read(file);
  } catch {
    return null;
  }

  const match =
    kind === "launchd"
      ? content.match(/<key>PORT<\/key>\s*<string>(\d+)<\/string>/)
      : kind === "systemd"
        ? content.match(/Environment=PORT=(\d+)/)
        : content.match(/set "PORT=(\d+)"/);

  return match ? Number(match[1]) : null;
}

/**
 * Can this install go ahead? Starting a second server on a held port produces a crash loop, so the
 * answer has to come before anything is written. Reinstalling over our own running job is fine:
 * apply stops it first, which frees the port.
 * @param {ReturnType<typeof planService>} plan
 * @param {{ installed?: boolean, running?: boolean, probe?: { state: string } | null }} [options]
 */
export function canInstall(plan, { installed = false, running = false, probe = null } = {}) {
  if (!probe || probe.state === "down") return { ok: true };
  if (installed && running) return { ok: true };

  const what = probe.state === "clause" ? "Clause is already running there" : "another program is using it";
  return {
    ok: false,
    reason: `port ${plan.port} is not free: ${what}. Stop it, then install again, or pick a free port with --port.`,
  };
}

/**
 * Write the file and run the platform commands. Every failure comes back as a sentence, never as a
 * stack trace, and a command marked optional does not stop the install.
 * @param {ReturnType<typeof planService>} plan
 * @param {{ run?: typeof defaultRun, write?: typeof writeFileSync, remove?: typeof unlinkSync, makeDir?: typeof mkdirSync }} [options]
 */
export function applyService(
  plan,
  { run = defaultRun, write = writeFileSync, remove = unlinkSync, makeDir = mkdirSync } = {},
) {
  if (!plan.ok) return plan;

  try {
    for (const dir of plan.dirs || []) makeDir(dir, { recursive: true });
    for (const item of plan.files || []) {
      makeDir(dirname(item.path), { recursive: true });
      write(item.path, item.content);
    }
  } catch (error) {
    return { ok: false, reason: `could not write ${plan.file}: ${firstLine(error)}` };
  }

  for (const command of plan.commands || []) {
    try {
      run(command.cmd, command.args);
    } catch (error) {
      if (command.optional) continue;
      return { ok: false, reason: `${command.cmd} failed: ${firstLine(error)}` };
    }
  }

  for (const file of plan.remove || []) {
    try {
      remove(file);
    } catch {
      // Already gone is the state uninstall wants.
    }
  }

  return { ok: true, kind: plan.kind, file: plan.file, port: plan.port };
}

/**
 * Ask the platform whether the entry is installed and running.
 * @param {ReturnType<typeof planService>} plan
 * @param {{ run?: typeof defaultRun, exists?: (path: string) => boolean }} [options]
 */
export function readService(plan, { run = defaultRun, exists = existsSync } = {}) {
  if (!plan.ok) return plan;

  const installed = exists(plan.file);
  let output = "";
  let code = 0;
  try {
    output = String(run(plan.commands[0].cmd, plan.commands[0].args, { encoding: "utf8" }) || "");
  } catch (error) {
    code = typeof error?.status === "number" ? error.status : 1;
    output = String(error?.stdout || "");
  }

  const running =
    plan.kind === "systemd"
      ? output.trim() === "active"
      : plan.kind === "launchd"
        ? code === 0 && /state = running/.test(output)
        : code === 0;

  return { ok: true, kind: plan.kind, file: plan.file, installed, running };
}
