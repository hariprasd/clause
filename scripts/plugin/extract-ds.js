// Clause Assist — "Extract components": builds the whole ds/ catalog from the open file + its enabled libraries.
// Runs in code.js (and testable through use_figma). Emits parts through `emit(part, data)`; nothing is written to the file.
const dsSlug = s => String(s).split("/").pop().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const dsCut = (t, n) => { t = String(t).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const dsProps = defs => { const o = {}; for (const [k, v] of Object.entries(defs || {})) o[k.split("#")[0].replace(/^[^A-Za-z0-9]+\s*/, "")] = v.type === "VARIANT" ? v.variantOptions : v.type; return o; };
const dsVisTexts = (n, max) => n.findAll(t => t.type === "TEXT" && t.visible).slice(0, max).map(t => dsCut(t.characters, 25));
const dsNested = n => [...new Set(n.findAll(x => x.type === "INSTANCE" && x.visible).map(x => x.name))].slice(0, 6);
function dsSection(n) { for (let p = n.parent; p && p.type !== "PAGE"; p = p.parent) if (p.type === "SECTION") return p.name; return null; }
function dsUniqueKey(used, base) { let k = base, i = 2; while (used.has(k)) k = base + "-" + i++; used.add(k); return k; }

async function dsExtract(opts, emit, progress) {
  opts = opts || {}; const ignore = new Set((opts.ignoreSections || []).map(s => s.trim()).filter(Boolean));
  const say = t => { try { progress && progress(t); } catch (e) {} };
  const pages = figma.root.children; const used = new Set();
  // ---------- 1. local components (every page; sections in `ignore` are skipped)
  const local = []; const mcCache = new Map(); const libMap = new Map(); const usedStyleIds = new Set();
  for (const page of pages) {
    say("Reading page " + page.name); await page.loadAsync();
    for (const n of page.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
      if (n.type === "COMPONENT" && n.parent && n.parent.type === "COMPONENT_SET") continue;
      const sec = dsSection(n); if (sec && ignore.has(sec)) continue;
      const isSet = n.type === "COMPONENT_SET"; const main = isSet ? (n.defaultVariant || n.children[0]) : n;
      let defs = {}; try { defs = n.componentPropertyDefinitions; } catch (e) {}
      local.push({ key: dsUniqueKey(used, dsSlug(n.name)), id: n.id, name: n.name, section: sec, set: isSet, props: dsProps(defs), default: isSet ? main.name : null, size: [Math.round(main.width), Math.round(main.height)], texts: dsVisTexts(main, 6), nested: dsNested(main) });
    }
    // ---------- 2. library components = every remote main component instanced anywhere in the file
    for (const inst of page.findAllWithCriteria({ types: ["INSTANCE"] })) {
      let mc; try { mc = await inst.getMainComponentAsync(); } catch (e) { continue; }
      if (!mc || !mc.remote) continue;
      const set = mc.parent && mc.parent.type === "COMPONENT_SET" ? mc.parent : null; const id = set ? set.id : mc.id;
      if (libMap.has(id)) continue;
      let defs = {}; try { defs = set ? set.componentPropertyDefinitions : mc.componentPropertyDefinitions; } catch (e) {}
      const dv = set ? (set.defaultVariant || mc) : mc; const nm = set ? set.name : mc.name;
      const icon = !set && mc.width <= 32 && Math.abs(mc.width - mc.height) < 1 && !/\s/.test(nm.split("/").pop());
      libMap.set(id, { key: null, _base: (icon ? "icon-" : "") + dsSlug(nm), name: nm, lib: true, setKey: set ? set.key : undefined, variantKey: dv.key, variant: set ? dv.name : nm, default: set ? dv.name : null, props: dsProps(defs), texts: dsVisTexts(inst, 6) });
    }
    for (const t of page.findAllWithCriteria({ types: ["TEXT"] })) { const s = t.textStyleId; if (s && s !== figma.mixed) usedStyleIds.add(s); }
  }
  const library = [...libMap.values()].map(x => { x.key = dsUniqueKey(used, x._base); delete x._base; return x; });
  emit("components", { _source: figma.root.name + " — extracted by Clause Assist", local, library });
  say(local.length + " local + " + library.length + " library components");

  // ---------- 3. variables: local collections + every enabled library collection (imported so values/aliases resolve)
  const variables = [], collections = [], colKeyByName = {};
  const seenVar = new Set();
  const pushVar = v => { if (seenVar.has(v.id)) return; seenVar.add(v.id); variables.push({ id: v.id, name: v.name, resolvedType: v.resolvedType, key: v.key, remote: v.remote, variableCollectionId: v.variableCollectionId, valuesByMode: v.valuesByMode }); };
  const pushCol = c => { if (collections.some(x => x.id === c.id)) return; collections.push({ id: c.id, name: c.name, key: c.key, remote: c.remote, modes: c.modes, defaultModeId: c.defaultModeId }); colKeyByName[c.name] = c.key; };
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) { pushCol(c); for (const id of c.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); if (v) pushVar(v); } }
  let libCols = []; try { libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(); } catch (e) { say("teamLibrary unavailable: " + e.message); }
  for (const lc of libCols) {
    say("Importing " + lc.libraryName + " / " + lc.name);
    let list = []; try { list = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(lc.key); } catch (e) { continue; }
    for (const lv of list) { try { const v = await figma.variables.importVariableByKeyAsync(lv.key); pushVar(v); const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId); if (c) pushCol(c); } catch (e) {} }
  }
  // resolve alias targets that were not in any enabled collection (walk until closed)
  for (let round = 0; round < 4; round++) {
    const missing = new Set();
    for (const v of variables) for (const raw of Object.values(v.valuesByMode || {})) if (raw && raw.type === "VARIABLE_ALIAS" && !seenVar.has(raw.id)) missing.add(raw.id);
    if (!missing.size) break;
    for (const id of missing) { try { const v = await figma.variables.getVariableByIdAsync(id); if (v) { pushVar(v); const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId); if (c) pushCol(c); } } catch (e) {} }
  }
  emit("variables", { variables, collections, exportedAt: new Date().toISOString(), pluginVersion: "clause-extract" });

  // ---------- 4. text styles: local + every style used in the file
  const styles = new Map();
  const addStyle = s => { if (!s || styles.has(s.id)) return; styles.set(s.id, { name: s.name, key: s.key, remote: s.remote, fontFamily: s.fontName.family, fontStyle: s.fontName.style, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing }); };
  for (const s of await figma.getLocalTextStylesAsync()) addStyle(s);
  for (const id of usedStyleIds) { try { addStyle(await figma.getStyleByIdAsync(id)); } catch (e) {} }
  const textStyles = [...styles.values()];
  emit("textStyles", { textStyles });

  // ---------- 5. variable-keys: the compact maps the compiler uses
  const byPrefix = p => { const o = {}; for (const v of variables) if (v.name.indexOf(p) === 0 && v.resolvedType === "FLOAT") o[v.name] = v.key; return o; };
  const colors = {}, colorAliases = {}, fonts = {};
  const colorVars = variables.filter(v => v.resolvedType === "COLOR" && !/^palette\//i.test(v.name) && !/^_/.test(v.name));
  for (const v of colorVars) { colors[v.name] = v.key; const alias = v.name.split("/").pop().replace(/\s*\(.*\)\s*$/, "").trim(); if (alias && !(alias in colorAliases)) colorAliases[alias] = v.key; }
  for (const v of variables) if (v.resolvedType === "STRING" && /font[- ]family/i.test(v.name)) fonts[v.name.split("/").pop()] = v.key;
  const tsMap = {}; for (const s of textStyles) tsMap[s.name] = s.key;
  emit("variableKeys", { _collections: colKeyByName, spacing: byPrefix("spacing-"), radius: byPrefix("radius-"), widths: byPrefix("width-"), containers: byPrefix("container-"), fonts, colors, colorAliases, textStyles: tsMap });
  emit("meta", { file: figma.root.name, fileKey: figma.fileKey || null, currentPage: { id: figma.currentPage.id, name: figma.currentPage.name }, pages: pages.map(p => ({ id: p.id, name: p.name })), ignored: [...ignore] });
  return { local: local.length, library: library.length, variables: variables.length, collections: collections.length, textStyles: textStyles.length, colors: Object.keys(colorAliases).length };
}
