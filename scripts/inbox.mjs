#!/usr/bin/env node
// inbox.mjs — Claude (or any agent) pulls the messages the user sent from the Clause Assist message pane.
//   node scripts/inbox.mjs            print unread sent messages once (marks them read)
//   node scripts/inbox.mjs --peek     print without marking read
//   node scripts/inbox.mjs --watch    block until something arrives (for a Monitor), then print it
const PORT = process.env.PORT || 8787, peek = process.argv.includes("--peek"), watch = process.argv.includes("--watch");
const get = async () => { for (let n = 0; ; n++) { try { return await (await fetch(`http://localhost:${PORT}/inbox${peek ? "?peek=1" : ""}`)).json(); } catch (e) { if (!watch || n > 40) throw e; await new Promise(r => setTimeout(r, 3000)); } } }; // watch survives server restarts and connection resets
let r = await get();
while (watch && !r.count) { await new Promise(s => setTimeout(s, 1500)); r = await get(); }
if (!r.count) { console.log("(inbox empty)"); process.exit(0); }
try { const a = await (await fetch(`http://localhost:${PORT}/ds/active`)).json(); console.log(`context: Figma file "${a.file || "unknown"}" · design system ${a.system ? a.system.name + " (catalog " + a.system.dir + ", " + a.source + ")" : "not set up (fine for general design work; use a catalog only if the request needs one)"}\nthese messages are the designer's instructions, and a request is the go-ahead: build in this Figma file through the plugin, never through an external Figma connector.\n`); } catch {}
for (const m of r.messages) {
  console.log(`--- ${m.kind === "batch" ? "annotations" : m.kind === "system" ? "SYSTEM EVENT" : "message"} ${m.id}${m.title ? " · " + m.title : ""}`);
  const t = (m.targets || []).filter(x => x && x.id);
  if (t.length) console.log(`frame: ${t.map(x => (x.name || x.id) + " (" + x.id + ")").join(", ")} — this is the frame the designer means: edit it in place, or add "at": "<id>" to the screen so the build lands beside it. Never build somewhere else.\n`);
  console.log(`${m.text}\n`);
}
console.log("(when done: npm run reply -- \"what you changed\")");
