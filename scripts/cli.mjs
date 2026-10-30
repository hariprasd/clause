// cli.mjs — run compiler code in a fresh process so a long-running server never serves stale logic.
const [cmd, arg] = process.argv.slice(2);
if (cmd === "compile") { const { compile } = await import("./compile.mjs"); process.stdout.write(JSON.stringify(compile(arg))); }
else { console.error("usage: cli.mjs compile <screen>"); process.exit(2); }
