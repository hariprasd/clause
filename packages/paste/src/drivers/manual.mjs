// The driver that works everywhere: the capture is already on the clipboard, and the designer
// presses the paste key. It never claims to have done something it did not do.

import { pasteFailed } from "../result.mjs";

/**
 * @param {{ platform?: string }} [options]
 */
export function createManualDriver({ platform = process.platform } = {}) {
  const key = platform === "darwin" ? "⌘V" : "Ctrl+V";

  return {
    name: "manual",

    async available() {
      return { ok: true, reason: `The capture is copied to the clipboard. Press ${key} in Figma.` };
    },

    async paste() {
      return pasteFailed(
        "Clause does not drive the keyboard on this machine.",
        `Press ${key} in Figma. The capture is already on your clipboard.`,
      );
    },

    explain() {
      return `Copies the capture to the clipboard; you press ${key} in Figma.`;
    },
  };
}
