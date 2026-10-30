#!/usr/bin/env node
// stage-bookmarklet.mjs — what GitHub Pages serves: the bookmarklet copy of capture.js and a tiny
// landing page. The extension itself is distributed as a zip from Releases, never from Pages.
//
// Everything else in the repo stays unpublished. Pages is a door, not a mirror of the source tree.
//
// The host is never hardcoded: it comes from CLAUSE_PAGES_URL, or from GITHUB_REPOSITORY when the
// workflow runs. A fresh clone published under any account or repo name gets the right bookmarklet
// without editing a file.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".pages");
const capture = resolve(root, "packages/capture");

/** The published origin, without a trailing slash, or "" when this is a local run. */
function pagesOrigin() {
  const explicit = (process.env.CLAUSE_PAGES_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const repo = (process.env.GITHUB_REPOSITORY || "").trim(); // owner/name, set by Actions
  const [owner, name] = repo.split("/");
  if (!owner || !name) return "";

  return name.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io`
    : `https://${owner.toLowerCase()}.github.io/${name}`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

copyFileSync(resolve(capture, "capture.js"), resolve(out, "capture.js"));

const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const origin = pagesOrigin();
const repo = (process.env.GITHUB_REPOSITORY || "").trim();
const releases = repo ? `https://github.com/${repo}/releases` : "";

const bookmarklet = origin
  ? `javascript:(function(){var s=document.createElement('script');s.src='${origin}/capture.js';document.documentElement.appendChild(s)}())`
  : "";

const door = bookmarklet
  ? `<p><a class="button" href="${bookmarklet}">Capture this page</a></p>
<p>Prefer the extension? It is faster, handles iframes, and pastes into Figma for you.${releases ? ` Get it from <a href="${releases}">Releases</a>.` : ""}</p>`
  : `<p>This page has no bookmarklet yet because the host is not known. Publish the repo, or run <code>CLAUSE_PAGES_URL=https://your-host node scripts/stage-bookmarklet.mjs</code>.</p>`;

writeFileSync(resolve(out, "index.html"), `<!doctype html>
<meta charset="utf-8">
<title>Clause capture</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; max-width: 38rem; margin: 8vh auto; padding: 0 1.5rem; color: #1a1a1a; }
  code { background: #f2f2f2; padding: .15em .35em; border-radius: 4px; font-size: .9em; }
  a.button { display: inline-block; background: #111; color: #fff; padding: .6rem 1rem; border-radius: 8px; text-decoration: none; margin: 1rem 0; }
</style>
<h1>Clause capture</h1>
<p>This host exists for one thing: the no-install bookmarklet. Drag the link below to your bookmarks bar, then click it on any page to copy that page into Figma.</p>
${door}
<p><code>capture.js</code> is built from Figma's capture script. Version ${version}.</p>
`);

console.log(`→ .pages (capture.js + index.html, v${version})${origin ? ` at ${origin}` : " (no host set: bookmarklet omitted)"}`);
