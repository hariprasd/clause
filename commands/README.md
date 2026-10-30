# Commands

Drop a file here to add a slash command to the Clause pane.

```
---
title: Short name for the menu
hint: One line on what it does and when to use it
---
The instruction Clause follows: intent, what to read, steps, how to finish.
```

Name the file `kebab-case.md` (lowercase letters, digits and dashes). Clause lists it under
`/name` and expands it into the instruction when the message is read. No code change needed.

This README is ignored by the command loader because its name is not lowercase kebab-case.
