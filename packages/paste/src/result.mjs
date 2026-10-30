// The one shape every driver returns when it cannot paste. Kept in its own file so both the manual
// and native drivers can use it without importing the selector (which imports them).

import { ERRORS } from "@clause/contract/errors";

/**
 * @param {string} reason what went wrong, in words for a designer
 * @param {string} [hint] what to do about it
 */
export function pasteFailed(reason, hint = ERRORS.DRIVER_UNAVAILABLE.hint) {
  return { ok: false, code: "DRIVER_UNAVAILABLE", reason, hint };
}
