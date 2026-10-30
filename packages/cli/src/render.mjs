// Doctor's human output. One line per check, then the fix for anything that needs one. No ids, no
// stack traces, no tool names unless the fix is literally a command to run.

const MARKS = { ok: "✓", warn: "!", error: "×", info: "·" };

/**
 * @param {Awaited<ReturnType<import("./doctor.mjs").runDoctor>>} report
 */
export function renderDoctor(report) {
  const width = Math.max(...report.checks.map((c) => c.title.length));
  const lines = [`Clause doctor ${report.version} ${report.platform}`, ""];

  for (const check of report.checks) {
    lines.push(`${MARKS[check.status]} ${check.title.padEnd(width)}  ${check.detail}`);
    if (check.hint) lines.push(`${" ".repeat(width + 4)}${check.hint}`);
  }

  const needs = report.errors + report.warnings;
  lines.push("");
  if (!needs) lines.push("Everything Clause needs on this machine is ready.");
  else {
    const bits = [];
    if (report.errors) bits.push(`${report.errors} to fix`);
    if (report.warnings) bits.push(`${report.warnings} worth a look`);
    lines.push(`${bits.join(", ")}.`);
  }

  return lines.join("\n");
}
