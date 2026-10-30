#!/usr/bin/env node
// listener-check.mjs — UserPromptSubmit hook. Stays silent when the inbox listener is armed,
// and prints one reminder when it is not, so a new turn never starts deaf.
const PORT = process.env.PORT || 8787;

try {
  const res = await fetch(`http://localhost:${PORT}/status`, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) process.exit(0);
  const status = await res.json();
  if (!status.listening) {
    console.log("Clause inbox listener is NOT armed. Arm it before replying: Monitor on `node scripts/inbox.mjs --watch` (30 min), then handle any waiting messages.");
  }
} catch {}
