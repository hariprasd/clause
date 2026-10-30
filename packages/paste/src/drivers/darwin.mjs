// macOS: press ⌘V in whatever app has focus, which is Figma when the designer clicks a button in the
// Clause pane. Uses System Events, so the terminal or app that runs Clause needs Accessibility
// permission the first time. macOS decides that, not us; we only report it clearly.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { pasteFailed } from "../result.mjs";

const OSASCRIPT = "/usr/bin/osascript";

/** The exact AppleScript, exported so a test can assert it instead of re-typing it. */
export const PASTE_SCRIPT = 'tell application "System Events" to keystroke "v" using command down';

const KEY = "⌘V";

/**
 * Run AppleScript and always resolve. The macOS failure is in stderr, and a thrown error here would
 * lose it.
 * @param {string} script
 */
function runOsascript(script) {
  return new Promise((resolve) => {
    execFile(OSASCRIPT, ["-e", script], { timeout: 5000 }, (error, stdout, stderr) => {
      resolve({
        error,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
      });
    });
  });
}

/**
 * Turn AppleScript's failure text into something a designer can act on.
 * @param {string} text
 */
function hintFor(text) {
  if (/assistive|accessibility|not allowed|-1719|-25211/i.test(text)) {
    return (
      "Open System Settings, Privacy & Security, Accessibility, and allow the app you run Clause " +
      `from (Terminal, iTerm, or Clause itself). Then try again, or press ${KEY} in Figma.`
    );
  }
  if (/not authorized|apple events|-1743/i.test(text)) {
    return (
      "Allow the app you run Clause from to control System Events in System Settings, Privacy & " +
      `Security, Automation. Then try again, or press ${KEY} in Figma.`
    );
  }
  if (/timed out|ETIMEDOUT/i.test(text)) {
    return `System Events did not answer in time. Try again, or press ${KEY} in Figma.`;
  }
  return `Clause could not press ${KEY}. Press it yourself; the capture is on your clipboard.`;
}

/**
 * @param {{
 *   platform?: string,
 *   run?: (script: string) => Promise<{ error: unknown, stdout: string, stderr: string }>,
 *   hasOsascript?: () => boolean,
 * }} [options]
 */
export function createDarwinDriver({
  platform = "darwin",
  run = runOsascript,
  hasOsascript = () => existsSync(OSASCRIPT),
} = {}) {
  async function available() {
    if (platform !== "darwin") {
      return { ok: false, reason: "This machine is not a Mac, so macOS keystrokes are not available." };
    }
    if (!hasOsascript()) {
      return {
        ok: false,
        reason: "macOS is missing /usr/bin/osascript, so Clause cannot press keys.",
      };
    }
    return { ok: true, reason: "Clause can press ⌘V in Figma for you." };
  }

  return {
    name: "darwin",
    available,

    async paste() {
      const state = await available();
      if (!state.ok) return pasteFailed(state.reason, `Press ${KEY} in Figma.`);

      const result = await run(PASTE_SCRIPT);
      if (!result.error) return { ok: true };

      const text = `${result.stderr} ${result.error?.message ? result.error.message : ""}`.trim();
      return pasteFailed(`macOS did not deliver the keystroke. ${text}`, hintFor(text));
    },

    explain() {
      return "Presses ⌘V in Figma for you. The first time, macOS asks for Accessibility permission.";
    },
  };
}
