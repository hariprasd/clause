// commands.mjs — slash commands for the Clause pane. One file per command in commands/<name>.md:
//   ---
//   title: Short name shown in the menu
//   hint: One line on what it does and when
//   ---
//   <the instruction Clause follows: intent, context to read, steps, finish>
// list() feeds the "/" menu in the plugin; expand(text) turns "/name args" into the full instruction when Clause reads the inbox.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function createCommands(root) {
  const dir = resolve(root, "commands");
  const parse = (name) => {
    const raw = readFileSync(resolve(dir, name + ".md"), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const meta = {}; if (m) for (const l of m[1].split("\n")) { const k = l.match(/^(\w+):\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }
    return { name, title: meta.title || name, hint: meta.hint || "", body: (m ? m[2] : raw).trim() };
  };
  const names = () => existsSync(dir) ? readdirSync(dir).filter((f) => /^[a-z0-9-]+\.md$/.test(f)).map((f) => f.slice(0, -3)).sort() : [];
  const list = () => names().map((n) => { const c = parse(n); return { name: c.name, title: c.title, hint: c.hint }; });
  // "/name some args" -> the command's instruction + what the user typed; anything else comes back unchanged
  const expand = (text) => {
    const m = String(text || "").match(/^\/([a-z0-9-]+)(?:[ \t\n]+([\s\S]*))?$/);
    if (!m || !names().includes(m[1])) return text;
    const c = parse(m[1]);
    return `SLASH COMMAND /${c.name} — ${c.title}\nFollow this instruction exactly; it was written for you, not for the designer.\n\n${c.body}\n\n--- what the designer typed after the command (may be empty; includes any attached Figma selection):\n${(m[2] || "").trim() || "(nothing: use the selection, otherwise the flow they are working in)"}`;
  };
  return { list, expand };
}
