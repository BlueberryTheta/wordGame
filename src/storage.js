import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_ENABLED = !!(KV_URL && KV_TOKEN);
const IS_VERCEL = !!process.env.VERCEL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const histPath = path.join(dataDir, 'history.json');

// In-memory fallback for serverless without KV (avoids write errors on read-only FS)
const memStore = {
  used: new Set(),
  perDay: new Map(),
};

async function kvFetch(cmdPath, opts = {}) {
  const url = KV_URL.replace(/\/$/, '') + cmdPath;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    ...opts,
  });
  if (!res.ok) throw new Error(`KV error ${res.status}`);
  return res.json();
}

function ensureFile() {
  if (IS_VERCEL) return; // never write files on serverless
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(histPath)) {
    fs.writeFileSync(
      histPath,
      JSON.stringify({ used: [], usedByKind: {}, perDay: {}, puzzleState: {} }, null, 2),
      'utf8'
    );
  }
}

function readLocal() {
  if (IS_VERCEL) {
    // fall back to in-memory
    return { used: Array.from(memStore.used), perDay: Object.fromEntries(memStore.perDay), usedByKind: {}, puzzleState: {} };
  }
  ensureFile();
  return JSON.parse(fs.readFileSync(histPath, 'utf8'));
}

function writeLocal(obj) {
  if (IS_VERCEL) {
    memStore.used = new Set(obj.used || []);
    memStore.perDay = new Map(Object.entries(obj.perDay || {}));
    return;
  }
  ensureFile();
  fs.writeFileSync(histPath, JSON.stringify(obj, null, 2), 'utf8');
}

export async function getWordForDay(day, kind = 'main') {
  if (KV_ENABLED) {
    const key = `wotd:word:${kind}:${day}`;
    const out = await kvFetch(`/get/${encodeURIComponent(key)}`);
    return out.result || null;
  }
  const obj = readLocal();
  // Backward compat: legacy main stored at perDay[day]
  if (kind === 'main' && obj.perDay?.[day]) return obj.perDay[day];
  const k = `${kind}:${day}`;
  return obj.perDay?.[k] || null;
}

export async function setWordForDay(day, word, kind = 'main') {
  if (KV_ENABLED) {
    const key = `wotd:word:${kind}:${day}`;
    await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(word)}`);
    return;
  }
  const obj = readLocal();
  if (!obj.perDay) obj.perDay = {};
  if (kind === 'main') obj.perDay[day] = word; // keep legacy path populated
  obj.perDay[`${kind}:${day}`] = word;
  writeLocal(obj);
}

export async function getUsedWords(kind = 'main') {
  if (KV_ENABLED) {
    const key = `wotd:used:${kind}`;
    const out = await kvFetch(`/smembers/${encodeURIComponent(key)}`);
    const arr = out.result || [];
    return new Set(arr);
  }
  const obj = readLocal();
  // Support legacy flat list for main
  if (kind === 'main' && Array.isArray(obj.used)) return new Set(obj.used);
  const usedByKind = obj.usedByKind || {};
  return new Set(usedByKind[kind] || []);
}

export async function addUsedWord(word, kind = 'main') {
  if (KV_ENABLED) {
    const key = `wotd:used:${kind}`;
    await kvFetch(`/sadd/${encodeURIComponent(key)}/${encodeURIComponent(word)}`);
    return;
  }
  const obj = readLocal();
  if (kind === 'main') {
    const set = new Set(obj.used || []);
    set.add(word);
    obj.used = Array.from(set);
  }
  const usedByKind = obj.usedByKind || {};
  const setKind = new Set(usedByKind[kind] || []);
  setKind.add(word);
  usedByKind[kind] = Array.from(setKind);
  obj.usedByKind = usedByKind;
  writeLocal(obj);
}

// --- Puzzle state persistence (revealed indices + Q&A) ---
export async function getPuzzleState(day) {
  if (KV_ENABLED) {
    const key = `wotd:puzzle:state:${day}`;
    const out = await kvFetch(`/get/${encodeURIComponent(key)}`);
    const raw = out.result || null;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  const obj = readLocal();
  return (obj.puzzleState || {})[day] || null;
}

export async function setPuzzleState(day, state) {
  if (KV_ENABLED) {
    const key = `wotd:puzzle:state:${day}`;
    const val = encodeURIComponent(JSON.stringify(state));
    await kvFetch(`/set/${encodeURIComponent(key)}/${val}`);
    return;
  }
  const obj = readLocal();
  if (!obj.puzzleState) obj.puzzleState = {};
  obj.puzzleState[day] = state;
  writeLocal(obj);
}
