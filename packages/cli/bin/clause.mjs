#!/usr/bin/env node
// clause: the one command.
//
//   clause init            set this folder up. Creates .clause/ and never overwrites it.
//   clause setup           prepare this machine: build the plugin, the tokens, check the port
//   clause live            start the server, or attach to the one already running
//   clause service         keep the server running at login (install · uninstall · status)
//   clause doctor          check this machine, with --json for tools and --port to look elsewhere
//
// More commands (capture, update) land as the modules behind them move out of the legacy tree.
// Anything not built yet says so, in one line, instead of pretending.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { initWorkspace, workspacePaths } from "@clause/workspace";
import { runDoctor } from "../src/doctor.mjs";
import { planLive, resolveSetup } from "../src/live.mjs";
import { renderDoctor } from "../src/render.mjs";
import { DEFAULT_PORT, probeServer, waitForClause } from "../src/server-probe.mjs";
import { applyService, canInstall, planService, readInstalledPort, readService } from "../src/service.mjs";

function flag(name) {
  // Both `--port 8788` and `--port=8788`, because npm eats the first form unless a `--` separates
  // it from the script name, and nobody should have to remember that.
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);

  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return null;
  const value = process.argv[at + 1];
  return value && !value.startsWith("--") ? value : "";
}

function usage() {
  console.log(`Clause

  clause init              set up this folder (creates .clause/, never overwrites it)
  clause setup             prepare this machine and build the plugin
  clause live              start the server (or attach to the one already running)
  clause live --open       start it and open the listing in your browser
  clause service install   start the server at login, no terminal needed
  clause service status    is it installed, and is it running?
  clause service uninstall stop starting it at login
  clause doctor            check this machine
  clause doctor --json     the same report, for tools
  clause doctor --port N   check a Clause on another port (default ${DEFAULT_PORT})`);
}

/** Run a step in this terminal and wait for it. The child owns the keyboard, so Ctrl-C works. */
function run(plan) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [plan.script, ...plan.args], {
      stdio: "inherit",
      env: plan.env,
    });
    child.on("error", (error) => {
      console.error(`clause: ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function main() {
  const command = process.argv[2];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return 0;
  }

  if (command === "init") {
    const result = initWorkspace(process.cwd());
    const paths = workspacePaths(process.cwd());
    if (result.created.length) {
      console.log(`Set up ${paths.dir}.`);
      for (const file of result.created) console.log(`  created ${relative(paths.root, file)}`);
    } else {
      console.log(`${paths.dir} is already set up. Nothing was overwritten.`);
    }
    console.log("\nNext: `clause setup`. It prepares the machine and builds the plugin.");
    return 0;
  }

  if (command === "setup") {
    const plan = resolveSetup({ port: flag("port") });
    if (!plan.ok) {
      console.error(`clause: ${plan.reason}`);
      return 1;
    }
    return run(plan);
  }

  if (command === "live") {
    const plan = await planLive({ port: flag("port"), open: process.argv.includes("--open") });
    if (!plan.ok) {
      if (plan.already) {
        console.log(plan.reason);
        return 0;
      }
      console.error(`clause: ${plan.reason}${plan.hint ? `\n  ${plan.hint}` : ""}`);
      return 1;
    }
    return run(plan);
  }

  if (command === "service") {
    const raw = process.argv[3];
    const action = raw && !raw.startsWith("--") ? raw : "status";
    if (!["install", "uninstall", "status"].includes(action)) {
      console.error(`clause: "service ${action}" is not a command. Use install, uninstall or status.`);
      return 2;
    }

    const plan = planService({ action, port: flag("port") });
    if (!plan.ok) {
      console.error(`clause: ${plan.reason}`);
      return 1;
    }

    if (action === "status") {
      const state = readService(plan);
      if (!state.ok) {
        console.error(`clause: ${state.reason}`);
        return 1;
      }
      if (state.running) console.log("Clause starts when you log in, and is running now.");
      else if (state.installed)
        console.log("Clause starts when you log in. It is not running right now; `clause live` starts it.");
      else console.log("Clause does not start on its own. Run `clause service install`.");
      return 0;
    }

    if (action === "install") {
      // Installing onto a port that is already held guarantees a job that starts, fails and starts
      // again. Ask first, so the answer names the port instead of leaving a loop behind.
      const installed = existsSync(plan.file);
      const running = installed ? readService(planService({ action: "status" })).running === true : false;
      const installedPort = installed ? readInstalledPort(plan) : null;
      const ours = installed && running && installedPort === plan.port;
      const ready = canInstall(plan, {
        installed: ours,
        running,
        probe: await probeServer({ port: plan.port }),
      });
      if (!ready.ok) {
        console.error(`clause: ${ready.reason}`);
        return 1;
      }
    }

    const done = applyService(plan);
    if (!done.ok) {
      console.error(`clause: ${done.reason}`);
      return 1;
    }

    if (action === "install") {
      console.log(`Clause starts when you log in (${plan.kind}).`);
      const state = await waitForClause(plan.port);
      if (state.state === "clause") {
        console.log(`It is running now on port ${plan.port}.`);
      } else {
        // Do not leave a job that retries forever. Remove it and say what happened.
        applyService(planService({ action: "uninstall" }));
        console.error(
          `clause: it did not answer on port ${plan.port}, so the login item was removed. See .clause/service.log.`,
        );
        return 1;
      }
    } else {
      console.log("Clause no longer starts on its own. `clause live` still works.");
    }
    return 0;
  }

  if (command === "doctor") {
    const raw = flag("port");
    const port = raw === null ? DEFAULT_PORT : Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error("clause: --port must be a number between 1 and 65535");
      return 2;
    }

    const report = await runDoctor({ port });
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else console.log(renderDoctor(report));
    return report.ok ? 0 : 1;
  }

  console.error(`clause: "${command}" is not a command yet.`);
  usage();
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    // A doctor that prints a stack trace is not a doctor.
    console.error(`clause: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
