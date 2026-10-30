// First run creates the user's layer and never touches it again.
//
// Every file is written only if it is missing, so running this twice, or after an update, is safe.
// Nothing here contains a design system, a screen, a rule or a preference: those are the user's to
// create. The seeded text explains the mechanism in one screenful and nothing more.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { workspacePaths } from "./layout.mjs";

const CONFIG = (name, at) =>
  `${JSON.stringify(
    {
      version: 1,
      name,
      createdAt: at,
      // The user's settings for how Clause works. Safe to edit and safe to keep.
      notes: "This folder is yours. An update never touches it.",
    },
    null,
    2,
  )}\n`;

const RULES = `# Your rules

What Clause should remember when it builds and reviews for you. One line each, written in your
words. It starts empty on purpose.

- For example: "Body text is 14/20, never 15."
- For example: "Prefer the button component over a styled frame."
- For example: "No lorem ipsum in anything I show a client."

Clause adds observations to \`learnings.jsonl\` as it works. Promote the ones that become rules here.
`;

const AGENT = `# Your instructions

Clause reads this file at the start of every session, after its own instructions. It is never
overwritten by an update. Use it for how you want Clause to talk, what to check first, and anything
about your team or product it should know.

- For example: "Call me Sam. Skip the summary if the answer is short."
- For example: "Our product is a B2B dashboard. Always build desktop at 1440."
`;

const OVERRIDES = `# Your edits

Put changes to Clause's own files here, one JSON document per edit. They are re-applied after every
update and checked before anything is written, so a change is never silently lost.

\`\`\`json
{
  "patches": [
    {
      "id": "wider-plugin-pane",
      "file": "scripts/plugin/pane.css",
      "why": "The default pane is too narrow on a 13 inch screen for our long component names.",
      "find": "width: 320px;",
      "replace": "width: 380px;"
    }
  ]
}
\`\`\`

- \`file\` is a path in the product, relative to this folder.
- \`find\` and \`replace\` are exact text, not patterns.
- \`why\` is for you and for the next update. If the anchor moves, Clause names the patch and refuses
  to half-apply it.

The generated \`figma-plugin/\` folder is rebuilt from \`scripts/plugin/\`, so patches belong on the
source, not the built file.
`;

/**
 * @param {string} [root]
 * @param {{ at?: string }} [options]
 */
export function initWorkspace(root = process.cwd(), { at = new Date().toISOString() } = {}) {
  const paths = workspacePaths(root);
  const created = [];
  const kept = [];

  mkdirSync(paths.dir, { recursive: true });
  mkdirSync(paths.overrides, { recursive: true });

  const seed = (path, body) => {
    if (existsSync(path)) {
      kept.push(path);
      return;
    }
    writeFileSync(path, body);
    created.push(path);
  };

  seed(paths.config, CONFIG(basename(paths.root), at));
  seed(paths.learnings, "");
  seed(paths.rules, RULES);
  seed(paths.agent, AGENT);
  seed(join(paths.overrides, "README.md"), OVERRIDES);

  return { created, kept, paths };
}
