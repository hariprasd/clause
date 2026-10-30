# ds/ — your design system's catalog

This folder holds what Clause knows about *your* design system. It is yours. A fresh clone does not
have one; extraction creates it, and an update never touches it.

| file | written by | purpose |
|---|---|---|
| `components.json` | plugin → **Extract components & tokens** | local + library components: keys, variant axes, defaults, placeholder texts |
| `variable-keys.json` | extract | spacing / radius / width / color aliases / text styles → Figma keys |
| `tokens/variables.json`, `tokens/text-styles.json` | extract | raw exports (values, aliases) used to generate `tokens.css` |
| `tokens.css` | `npm run tokens` (generated) | CSS custom properties for the HTML exports |
| `config.md` | extract (starter) → you | file key, canvas page, libraries, sections to ignore |
| `registry.json` | extract / you | Figma file names → the catalog folder for each design system |

Rules and preferences do not live here. They live in `.clause/`, the part of the workspace an
update never touches:

| file | purpose |
|---|---|
| `.clause/local-rules.md` | rules you want Clause to apply, one line each, in your words |
| `.clause/learnings.jsonl` | notes Clause records as it works, recalled by topic |
| `.clause/agent.md` | your standing instructions to the agent |
| `.clause/overrides/` | your edits to Clause itself, re-applied after every update |

First run: open your design-system file in Figma, start Clause Assist, menu → **Extract components
& tokens**. Then review `ds/config.md` (canvas page) and let the agent audit the catalog.
