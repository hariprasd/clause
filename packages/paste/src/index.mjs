// Every paste driver has the same three answers:
//
//   available()  can this driver paste right now, and if not, why not (in words a designer can act on)
//   paste()      try it; returns { ok: true } or { ok: false, code, reason, hint }
//   explain()    one sentence for the UI, without trying anything
//
// No driver ever pretends. If it cannot press the key, paste() fails with DRIVER_UNAVAILABLE and a
// hint telling the designer to press it themselves. The capture is already on the clipboard either
// way, so a failed paste is a small annoyance, not a lost capture.

import { createDarwinDriver } from "./drivers/darwin.mjs";
import { createManualDriver } from "./drivers/manual.mjs";
import { pasteFailed } from "./result.mjs";

/**
 * The driver this platform has. Always returns one: unknown platforms get `manual`, which is the
 * driver that works everywhere (the designer presses the key).
 *
 * @param {string} [platform] defaults to the running platform
 * @param {Record<string, unknown>} [options] passed to the driver, for tests
 */
export function driverFor(platform = process.platform, options = {}) {
  if (platform === "darwin") return createDarwinDriver({ platform, ...options });
  return createManualDriver({ platform, ...options });
}

/**
 * The driver to use now: the platform's own if it is available, otherwise `manual`.
 * `reason` is never empty, so the caller can always show something true.
 *
 * @param {string} [platform]
 * @param {Record<string, unknown>} [options]
 */
export async function selectDriver(platform = process.platform, options = {}) {
  const driver = driverFor(platform, options);
  const state = await driver.available();
  if (state.ok) return { driver, reason: state.reason, fallback: false };
  const manual = createManualDriver({ platform, ...options });
  return { driver: manual, reason: state.reason, fallback: true };
}

/** The shape paste() returns when it could not do the job, with the contract's words. */
export { createDarwinDriver, createManualDriver, pasteFailed };
