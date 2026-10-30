// messages.mjs — Clause message store with chat sessions. Local only: .clause/history.json (removed by `npm run clean`).
// Flow: plugin adds messages → "queued" → Send marks "sent" → Claude pulls with `npm run inbox` ("read") → `npm run reply` ("done").
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";

export function createStore(root) {
  const dir = resolve(root, ".clause"), file = resolve(dir, "history.json");
  let db = { sessions: [], current: null, messages: [] };
  try { if (existsSync(file)) { const raw = JSON.parse(readFileSync(file, "utf8")); db = Array.isArray(raw) ? { sessions: [], current: null, messages: raw } : Object.assign(db, raw); } } catch {}
  let seq = db.messages.reduce((m, x) => Math.max(m, x.n || 0), 0);
  const save = () => { mkdirSync(dir, { recursive: true }); db.messages = db.messages.slice(-2000); const tmp = file + ".tmp"; writeFileSync(tmp, JSON.stringify(db)); renameSync(tmp, file); };
  const newSession = title => { const s = { id: "s" + Date.now().toString(36), title: title || "New chat", created: Date.now(), updated: Date.now() }; db.sessions.unshift(s); db.current = s.id; save(); return s; };
  if (!db.sessions.length) newSession("Chat");
  for (const m of db.messages) if (!m.s) m.s = db.sessions[db.sessions.length - 1].id; // migrate pre-session messages
  if (!db.current || !db.sessions.find(s => s.id === db.current)) db.current = db.sessions[0].id;
  const cur = () => db.sessions.find(s => s.id === db.current);
  const touch = (sid, text) => { const s = db.sessions.find(x => x.id === sid); if (!s) return; s.updated = Date.now(); if ((s.title === "New chat" || s.title === "Chat") && text) s.title = String(text).replace(/\s+/g, " ").slice(0, 48); };
  const mk = o => { const m = { n: ++seq, id: "m" + seq, t: Date.now(), s: db.current, ...o }; db.messages.push(m); touch(m.s, m.from === "you" ? (m.note || m.text) : null); save(); return m; };
  let lastReadSession = null;
  return {
    state: () => ({ session: cur(), sessions: db.sessions.map(s => ({ ...s, n: db.messages.filter(m => m.s === s.id && m.from !== "system").length })) }),
    list: () => db.messages.filter(m => m.s === db.current).slice(-300),
    queued: () => db.messages.filter(m => m.s === db.current && m.status === "queued").length,
    newSession, open: id => { if (db.sessions.find(s => s.id === id)) { db.current = id; save(); return true; } return false; },
    rename: (id, title) => { const s = db.sessions.find(x => x.id === id); if (!s) return false; s.title = String(title).slice(0, 60); save(); return true; },
    deleteSession: id => { if (db.sessions.length < 2) return false; db.sessions = db.sessions.filter(s => s.id !== id); db.messages = db.messages.filter(m => m.s !== id); if (db.current === id) db.current = db.sessions[0].id; save(); return true; },
    add: ({ text, kind = "msg", title, note, targets }) => mk({ from: "you", kind, title: title || undefined, text: String(text).slice(0, 60000), note: note ? String(note).slice(0, 4000) : undefined, targets: Array.isArray(targets) ? targets.slice(0, 12).map(t => ({ id: String(t.id), name: String(t.name || "").slice(0, 80), type: t.type, component: t.component, screen: t.screen })) : undefined, status: "queued" }),
    addSystem: ({ text, title, data }) => mk({ from: "system", kind: "system", title: title || undefined, text: String(text).slice(0, 8000), data: data || undefined, status: "sent", sentAt: Date.now() }),
    remove: id => { const i = db.messages.findIndex(m => m.id === id && m.status === "queued"); if (i < 0) return false; db.messages.splice(i, 1); save(); return true; },
    edit: (id, text) => { const m = db.messages.find(x => x.id === id && x.status === "queued"); if (!m) return false; m.text = String(text).slice(0, 60000); save(); return true; },
    send: () => { const q = db.messages.filter(m => m.s === db.current && m.status === "queued"); const at = Date.now(); for (const m of q) { m.status = "sent"; m.sentAt = at; } if (q.length) save(); return q.length; },
    sendOne: id => { const m = db.messages.find(x => x.id === id && x.status === "queued"); if (!m) return 0; m.status = "sent"; m.sentAt = Date.now(); save(); return 1; },
    discardQueued: () => { const n = db.messages.filter(m => m.s === db.current && m.status === "queued").length; db.messages = db.messages.filter(m => !(m.s === db.current && m.status === "queued")); if (n) save(); return n; },
    unread: () => db.messages.filter(m => m.status === "sent"),
    markRead: () => { const u = db.messages.filter(m => m.status === "sent"); for (const m of u) { m.status = "read"; m.readAt = Date.now(); } if (u.length) { lastReadSession = u[u.length - 1].s; save(); } return u; },
    reply: (text, targets, ask) => { const answered = db.messages.filter(m => m.status === "read"); for (const m of answered) m.status = "done"; const sid = lastReadSession || db.current; const since = answered.length ? Math.min(...answered.map(m => m.sentAt || m.t)) : null; const m = { n: ++seq, id: "m" + seq, t: Date.now(), s: sid, from: "claude", kind: "msg", text: String(text).slice(0, 20000), status: "done", took: since ? Date.now() - since : undefined, answers: answered.map(m => m.id) }; if (Array.isArray(targets) && targets.length) m.targets = targets.slice(0, 12).map(t => ({ id: String(t.id), name: String(t.name || t.id).slice(0, 80), type: "FRAME" })); if (ask) m.ask = { options: Array.isArray(ask.options) ? ask.options.slice(0, 4).map(o => String(o).slice(0, 60)) : [] }; db.messages.push(m); touch(sid); save(); return m; },
    clear: () => { db.messages = db.messages.filter(m => m.s !== db.current); save(); },
  };
}
