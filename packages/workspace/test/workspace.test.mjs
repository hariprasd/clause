// The workspace is the one thing an update must never lose, so the tests are about preservation:
// init does not overwrite, learnings do not duplicate, overrides do not write half a change.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { initWorkspace } from "../src/init.mjs";
import { findWorkspace, workspacePaths } from "../src/layout.mjs";
import { appendLearning, forgetLearning, learningStats, readLearnings, recall } from "../src/learnings.mjs";
import { applyOverrides, checkTarget, loadOverrides } from "../src/overrides.mjs";

function temp() {
  const root = mkdtempSync(join(tmpdir(), "clause-workspace-"));
  return {
    root,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("first run creates the user layer and nothing else", () => {
  const { root, clean } = temp();
  try {
    const result = initWorkspace(root, { at: "2026-01-01T00:00:00.000Z" });
    const paths = workspacePaths(root);

    for (const file of [paths.config, paths.learnings, paths.rules, paths.agent]) {
      assert.ok(existsSync(file), `${file} should exist`);
    }
    assert.ok(existsSync(join(paths.overrides, "README.md")));
    assert.equal(result.created.length, 5);

    const config = JSON.parse(readFileSync(paths.config, "utf8"));
    assert.equal(config.version, 1);
    assert.equal(config.createdAt, "2026-01-01T00:00:00.000Z");
  } finally {
    clean();
  }
});

test("a second run keeps everything the user changed", () => {
  const { root, clean } = temp();
  try {
    const paths = initWorkspace(root).paths;
    writeFileSync(paths.rules, "# Mine\n\n- Always 1440.\n");
    const again = initWorkspace(root);

    assert.equal(again.created.length, 0);
    assert.match(readFileSync(paths.rules, "utf8"), /Always 1440/);
    assert.ok(again.kept.includes(paths.rules));
  } finally {
    clean();
  }
});

test("a workspace is found from a folder inside it", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    const nested = join(root, "a", "b");
    mkdirSync(nested, { recursive: true });
    assert.equal(findWorkspace(nested), root);
    assert.equal(findWorkspace(temp().root), null);
  } finally {
    clean();
  }
});

test("a learning is stored once, however it is typed", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    const first = appendLearning(root, { text: "Body text is 14/20, never 15.", kind: "preference" });
    assert.equal(first.ok, true);

    const again = appendLearning(root, { text: "  body text is   14/20, never 15.  ", kind: "fact" });
    assert.equal(again.ok, false);
    assert.match(again.reason, /already/i);
    assert.equal(readLearnings(root).learnings.length, 1);
  } finally {
    clean();
  }
});

test("a learning has to be worth keeping", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    assert.equal(appendLearning(root, { text: "short" }).ok, false);
    assert.equal(
      appendLearning(root, { text: "A sentence with enough detail.", kind: "astrology" }).ok,
      false,
    );
    assert.equal(appendLearning(root, { text: "x".repeat(700) }).ok, false);
  } finally {
    clean();
  }
});

test("recall finds the relevant note, not everything", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    appendLearning(root, { text: "Body text is 14/20, never 15.", tags: ["type"] });
    appendLearning(root, { text: "Our dashboard is desktop only, 1440 wide.", tags: ["layout"] });
    appendLearning(root, { text: "The user prefers sentence case in buttons.", tags: ["copy"] });

    const spacing = recall(root, "type");
    assert.equal(spacing.length, 1);
    assert.match(spacing[0].text, /14\/20/);

    const layout = recall(root, "dashboard width");
    assert.equal(layout.length, 1);
    assert.match(layout[0].text, /1440/);

    assert.equal(recall(root, "nothing-matches-this").length, 0);
    assert.equal(recall(root, "", { limit: 2 }).length, 2);
    assert.equal(recall(root, "", { kind: "preference" }).length, 0);
  } finally {
    clean();
  }
});

test("the log tolerates a bad line without losing the rest", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    appendLearning(root, { text: "The first real learning in this log." });
    const paths = workspacePaths(root);
    writeFileSync(paths.learnings, `${readFileSync(paths.learnings, "utf8")}not json\n`);
    appendLearning(root, { text: "The second real learning in this log." });

    const { learnings, skipped } = readLearnings(root);
    assert.equal(learnings.length, 2);
    assert.equal(skipped, 1);

    const stats = learningStats(root);
    assert.equal(stats.count, 2);
    assert.equal(stats.skipped, 1);
  } finally {
    clean();
  }
});

test("forget removes exactly one note", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    const one = appendLearning(root, { text: "The first learning to be forgotten." });
    appendLearning(root, { text: "The second learning that should stay." });

    const result = forgetLearning(root, one.learning.id);
    assert.equal(result.removed, true);
    assert.equal(result.count, 1);
    assert.equal(forgetLearning(root, "nope").removed, false);
  } finally {
    clean();
  }
});

test("a patch may not leave the project or touch the user layer", () => {
  assert.equal(checkTarget("scripts/plugin/pane.css").ok, true);
  assert.equal(checkTarget("../outside.js").ok, false);
  assert.equal(checkTarget("/etc/passwd").ok, false);
  assert.equal(checkTarget(".clause/overrides/x.json").ok, false);
  assert.equal(checkTarget("figma-plugin/code.js").ok, false, "generated, not a source");
  assert.equal(checkTarget("node_modules/x.js").ok, false);
});

test("a user override is applied to the current source, and preview leaves it alone", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "scripts", "pane.css"), ".pane { width: 320px; }\n");
    writeFileSync(
      join(workspacePaths(root).overrides, "pane.json"),
      JSON.stringify({
        patches: [
          {
            id: "wider-pane",
            file: "scripts/pane.css",
            why: "The default pane is too narrow for our long component names.",
            find: "width: 320px;",
            replace: "width: 380px;",
          },
        ],
      }),
    );

    const loaded = loadOverrides(root);
    assert.deepEqual(loaded.problems, []);
    assert.equal(loaded.patches.length, 1);

    const preview = applyOverrides(root);
    assert.equal(preview.ok, true);
    assert.equal(preview.written, false);
    assert.equal(preview.changed.length, 1);
    assert.match(preview.changed[0].text, /380px/);
    assert.match(readFileSync(join(root, "scripts", "pane.css"), "utf8"), /320px/, "preview must not write");

    const written = applyOverrides(root, { write: true });
    assert.equal(written.written, true);
    assert.match(readFileSync(join(root, "scripts", "pane.css"), "utf8"), /380px/);
  } finally {
    clean();
  }
});

test("a moved anchor stops the whole write and names the patch", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "scripts", "pane.css"), ".pane { width: 400px; }\n");
    writeFileSync(
      join(workspacePaths(root).overrides, "pane.json"),
      JSON.stringify({
        patches: [
          {
            id: "wider-pane",
            file: "scripts/pane.css",
            why: "The default pane is too narrow for our long component names.",
            find: "width: 320px;",
            replace: "width: 380px;",
          },
        ],
      }),
    );

    const result = applyOverrides(root, { write: true });
    assert.equal(result.ok, false);
    assert.equal(result.written, false);
    assert.equal(result.missed[0].id, "wider-pane");
    assert.match(result.missed[0].why, /too narrow/);
    assert.equal(readFileSync(join(root, "scripts", "pane.css"), "utf8"), ".pane { width: 400px; }\n");
  } finally {
    clean();
  }
});

test("a refused target stops the build before anything is read", () => {
  const { root, clean } = temp();
  try {
    initWorkspace(root);
    writeFileSync(
      join(workspacePaths(root).overrides, "bad.json"),
      JSON.stringify({
        patches: [
          {
            id: "escape",
            file: "figma-plugin/code.js",
            why: "Trying to patch a generated file should never be allowed.",
            find: "a",
            replace: "b",
          },
        ],
      }),
    );

    const result = applyOverrides(root, { write: true });
    assert.equal(result.ok, false);
    assert.match(result.problems.join("\n"), /generated/);
  } finally {
    clean();
  }
});
