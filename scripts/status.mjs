#!/usr/bin/env node
// status.mjs — show a thinking state in the Clause Assist pane while Claude works on inbox items.
//   node scripts/status.mjs "Inspecting the reference frame"      (state: thinking)
//   node scripts/status.mjs --state building "Rebuilding agent-builder"
//   states: thinking · inspecting · building · built · error      (stays 'working' until reply.mjs / --state idle)
const PORT = process.env.PORT || 8787, a = process.argv.slice(2);
const state = a.includes("--state") ? a[a.indexOf("--state") + 1] : "thinking";
const text = a.filter((x, i) => x !== "--state" && a[i - 1] !== "--state").join(" ").trim();
const r = await fetch(`http://localhost:${PORT}/term/status`, { method: "POST", headers: { "content-type": "application/json", "x-clause": "1" }, body: JSON.stringify({ state, text }) });
console.log(r.ok ? "status set" : "failed " + r.status);
