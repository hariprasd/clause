// The service command must be right on three operating systems without running on any of them.
// Every test describes a machine: a home folder, a repo, a node binary, and stubs for the one
// command the platform would run. Nothing here writes outside a temp folder.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyService,
  canInstall,
  planService,
  readInstalledPort,
  readService,
  serviceLocation,
} from "../src/service.mjs";

const base = {
  root: "/repo/clause",
  node: "/usr/local/bin/node",
  exists: () => true,
};

test("each platform gets a per-user file, never a system one", () => {
  const mac = serviceLocation({ platform: "darwin", home: "/Users/sam" });
  assert.equal(mac.kind, "launchd");
  assert.equal(mac.file, "/Users/sam/Library/LaunchAgents/dev.clause.server.plist");

  const linux = serviceLocation({ platform: "linux", home: "/home/sam" });
  assert.equal(linux.kind, "systemd");
  assert.equal(linux.file, "/home/sam/.config/systemd/user/clause.service");

  const win = serviceLocation({ platform: "win32", home: "C:\\Users\\Sam" });
  assert.equal(win.kind, "schtasks");
  assert.match(win.file, /AppData\\Local\\Clause\\clause-server\.cmd$/);

  assert.deepEqual(serviceLocation({ platform: "freebsd", home: "/home/sam" }), { kind: null, file: null });
});

test("macOS runs the server at login and survives a crash, not a clean quit", () => {
  const plan = planService({ ...base, platform: "darwin", home: "/Users/sam", port: "8788", uid: 501 });
  assert.equal(plan.ok, true);
  assert.equal(plan.port, 8788);
  assert.match(plan.files[0].content, /<string>\/usr\/local\/bin\/node<\/string>/);
  assert.match(plan.files[0].content, /<string>\/repo\/clause\/scripts\/serve\.mjs<\/string>/);
  assert.match(plan.files[0].content, /<string>8788<\/string>/);
  assert.match(plan.files[0].content, /<key>RunAtLoad<\/key>/);
  assert.match(plan.files[0].content, /SuccessfulExit/);
  assert.match(plan.files[0].content, /\.clause\/service\.log/);
  assert.deepEqual(plan.commands, [
    { cmd: "launchctl", args: ["bootout", "gui/501/dev.clause.server"], optional: true },
    {
      cmd: "launchctl",
      args: ["bootstrap", "gui/501", "/Users/sam/Library/LaunchAgents/dev.clause.server.plist"],
    },
  ]);
});

test("a path with an ampersand cannot break the plist", () => {
  const plan = planService({
    ...base,
    root: "/Users/sam/Work & Play/clause",
    platform: "darwin",
    home: "/Users/sam",
    port: 8787,
    uid: 501,
  });
  assert.match(plan.files[0].content, /Work &amp; Play/);
  assert.doesNotMatch(plan.files[0].content, /Work & Play/);
});

test("Linux uses a systemd user unit and needs no sudo", () => {
  const plan = planService({ ...base, platform: "linux", home: "/home/sam", port: 8787 });
  assert.equal(plan.ok, true);
  assert.equal(plan.file, "/home/sam/.config/systemd/user/clause.service");
  assert.match(
    plan.files[0].content,
    /ExecStart="\/usr\/local\/bin\/node" "\/repo\/clause\/scripts\/serve\.mjs"/,
  );
  assert.match(plan.files[0].content, /WorkingDirectory="\/repo\/clause"/);
  assert.match(plan.files[0].content, /Environment=PORT=8787/);
  assert.match(plan.files[0].content, /Restart=on-failure/);
  assert.equal(plan.commands[0].cmd, "systemctl");
  assert.deepEqual(plan.commands[1].args, ["--user", "enable", "--now", "clause.service"]);
});

test("Windows writes a small wrapper and schedules it at logon", () => {
  const plan = planService({
    ...base,
    node: "C:\\Program Files\\nodejs\\node.exe",
    platform: "win32",
    home: "C:\\Users\\Sam",
    port: 8787,
  });
  assert.equal(plan.ok, true);
  assert.match(plan.files[0].content, /@echo off/);
  assert.match(plan.files[0].content, /set "PORT=8787"/);
  assert.match(plan.files[0].content, /node\.exe/);
  assert.deepEqual(plan.commands[0].args.slice(0, 5), ["/Create", "/TN", "Clause", "/SC", "ONLOGON"]);
  assert.equal(plan.commands[1].args[0], "/Run");
});

test("an unsupported platform says what to do instead of pretending", () => {
  const plan = planService({ ...base, platform: "freebsd", home: "/home/sam" });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /clause live/);
});

test("a bad port or a folder without the server is refused before anything is written", () => {
  const badPort = planService({ ...base, platform: "linux", home: "/home/sam", port: "nope" });
  assert.equal(badPort.ok, false);
  assert.match(badPort.reason, /--port/);

  const missing = planService({ ...base, platform: "linux", home: "/home/sam", exists: () => false });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /serve\.mjs/);
});

test("install refuses a port that is already held, because that becomes a crash loop", () => {
  const plan = planService({ ...base, platform: "darwin", home: "/Users/sam", port: 8787, uid: 501 });

  assert.equal(canInstall(plan, { probe: { state: "down" } }).ok, true);
  assert.equal(canInstall(plan, { probe: null }).ok, true);

  const busy = canInstall(plan, { installed: false, running: false, probe: { state: "occupied" } });
  assert.equal(busy.ok, false);
  assert.match(busy.reason, /port 8787/);
  assert.match(busy.reason, /--port/);

  const manual = canInstall(plan, { installed: false, running: false, probe: { state: "clause" } });
  assert.equal(manual.ok, false);
  assert.match(manual.reason, /Clause is already running/);

  // Our own job may hold the port: apply stops it first, so reinstalling is safe.
  assert.equal(canInstall(plan, { installed: true, running: true, probe: { state: "clause" } }).ok, true);
  // A stale entry that is not running means the thing on the port is someone else.
  assert.equal(canInstall(plan, { installed: true, running: false, probe: { state: "clause" } }).ok, false);
});

test("the installed port can be read back on each platform", () => {
  const mac = planService({ ...base, platform: "darwin", home: "/Users/sam", port: 8788, uid: 501 });
  assert.equal(readInstalledPort(mac, { read: () => mac.files[0].content }), 8788);

  const linux = planService({ ...base, platform: "linux", home: "/home/sam", port: 8789 });
  assert.equal(readInstalledPort(linux, { read: () => linux.files[0].content }), 8789);

  const win = planService({ ...base, platform: "win32", home: "C:\\Users\\Sam", port: 8790 });
  assert.equal(readInstalledPort(win, { read: () => win.files[0].content }), 8790);

  assert.equal(readInstalledPort(mac, { read: () => "not a plist" }), null);
  assert.equal(
    readInstalledPort(mac, {
      read: () => {
        throw new Error("gone");
      },
    }),
    null,
  );
});

test("uninstall removes the entry and never fails because it was already gone", () => {
  const plan = planService({
    action: "uninstall",
    ...base,
    platform: "darwin",
    home: "/Users/sam",
    uid: 501,
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.remove, ["/Users/sam/Library/LaunchAgents/dev.clause.server.plist"]);
  assert.equal(plan.commands[0].optional, true);
});

test("install writes the file and runs the commands in order", () => {
  const plan = planService({ ...base, platform: "linux", home: "/home/sam" });
  const written = [];
  const ran = [];
  const result = applyService(plan, {
    write: (path, content) => written.push({ path, content }),
    makeDir: () => {},
    run: (cmd, args) => ran.push([cmd, ...args]),
  });

  assert.equal(result.ok, true);
  assert.equal(written.length, 1);
  assert.deepEqual(ran, [
    ["systemctl", "--user", "daemon-reload"],
    ["systemctl", "--user", "enable", "--now", "clause.service"],
  ]);
});

test("a required command that fails is reported in one sentence, not a stack trace", () => {
  const plan = planService({ ...base, platform: "linux", home: "/home/sam" });
  const result = applyService(plan, {
    write: () => {},
    makeDir: () => {},
    run: () => {
      const error = new Error("boom");
      error.stderr = "System has not been booted with systemd\nmore noise";
      throw error;
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /systemctl failed: System has not been booted/);
  assert.doesNotMatch(result.reason, /at .*\.mjs:\d+/);
});

test("an optional command can fail without stopping the install", () => {
  const plan = planService({ ...base, platform: "darwin", home: "/Users/sam", uid: 501 });
  const ran = [];
  const result = applyService(plan, {
    write: () => {},
    makeDir: () => {},
    run: (cmd, args) => {
      ran.push([cmd, ...args]);
      if (args[0] === "bootout") throw new Error("not loaded");
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    ran.map((r) => r[1]),
    ["bootout", "bootstrap"],
  );
});

test("status is honest about installed and running on every platform", () => {
  const mac = readService(
    planService({ action: "status", platform: "darwin", home: "/Users/sam", uid: 501 }),
    {
      exists: () => true,
      run: () => "gui/501/dev.clause.server = {\n\tstate = running\n}\n",
    },
  );
  assert.equal(mac.installed, true);
  assert.equal(mac.running, true);

  const linux = readService(planService({ action: "status", platform: "linux", home: "/home/sam" }), {
    exists: () => true,
    run: () => "active\n",
  });
  assert.equal(linux.running, true);

  const stopped = readService(planService({ action: "status", platform: "linux", home: "/home/sam" }), {
    exists: () => true,
    run: () => {
      const error = new Error("inactive");
      error.status = 3;
      error.stdout = "inactive\n";
      throw error;
    },
  });
  assert.equal(stopped.installed, true);
  assert.equal(stopped.running, false);
});
