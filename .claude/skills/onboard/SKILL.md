---
name: onboard
description: Set up Clause for a new user or a new design system. Use when the user says "set me up", "onboard", "new design system", "get started", or asks to build from their design system and no catalog exists. Do not run it just because a general design request has no catalog.
---

# /onboard

> **Programmatic first** (CLAUDE.md): setup, server start, extraction and the audit's counting/diffing are scripts; only the judgement calls and the user-facing words are yours.
 — Claude does everything except the Figma clicks

Goal: from a fresh clone to a first screen with the user doing only the 4 things Claude cannot (install Figma desktop + Claude Code, open their DS file, import the plugin manifest, run the plugin, and create one Figma access token for comments).

1. `node scripts/setup.mjs`. If it fails on Node/files, say exactly what to install. Ignore "port busy" if the server is already yours.
2. Start the server if not running: `node scripts/serve.mjs` in the background (Bash `run_in_background`). Confirm `curl -s localhost:8787/status`.
3. Tell the user the 2 Figma steps in one short message: import `figma-plugin/manifest.json` (Plugins → Development → Import plugin from manifest…), open their design-system file, run **Clause Assist → Open Clause Assist**. Nothing else.
4. Wait for the plugin: Monitor `until curl -sf localhost:8787/status | grep -q '"plugin":true'; do sleep 2; done` (single notification).
4b. **Figma token (comments).** Once the plugin is connected, check `.clause/figma-file` (the plugin saves the file key itself) and `.clause/figma-token`. If the token is missing, tell the user in 3 lines: Figma → account menu → Settings → Security → Personal access tokens → Generate, scope **File content: read** and **Comments: read**; save the token as the only line of `.clause/figma-token` in this folder; never paste it in chat or the pane (history is stored). When they say done, verify with `node scripts/comments.mjs` (prints the open comments or "No open comments."). If `.clause/figma-file` is still empty, the plugin was imported before it got `enablePrivatePluginApi`: ask them to re-import `figma-plugin/manifest.json` once, or send the file link (`--file <url>` saves it).
5. If `hasDs` is false: trigger extraction yourself — `curl -s -X POST localhost:8787/extract/start -H 'x-clause: 1'`. Tell the user it's running (1–3 min, progress shows in the pane). Arm the inbox listener (`npm run inbox -- --watch` as a Monitor).
6. The "DS extracted" system event arrives → audit per `/fix` → `npm run reply` with 2–3 lines + "build first: …".
7. If the user named a section to ignore or a canvas page, write it to `ds/config.md`. Mark the canvas page with `**test**` only if they want a fixed page; otherwise screens go to whatever page they're on.
8. Offer the first screen: ask for a reference (screenshot or Figma URL) and run `/screen`.

Never ask the user to run npm commands; you run them. Keep every message under 5 lines.
