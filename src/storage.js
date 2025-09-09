import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_ENABLED = !!(KV_URL && KV_TOKEN);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const histPath = path.join(dataDir, 'history.json');

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
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(histPath)) fs.writeFileSync(histPath, JSON.stringify({ used: [], perDay: {} }, null, 2), 'utf8');
}

function readLocal() {
  ensureFile();
  return JSON.parse(fs.readFileSync(histPath, 'utf8'));
}

function writeLocal(obj) {
  ensureFile();
  fs.writeFileSync(histPath, JSON.stringify(obj, null, 2), 'utf8');
}

export async function getWordForDay(day) {
  if (KV_ENABLED) {
    const key = `wotd:word:${day}`;
    const out = await kvFetch(`/get/${encodeURIComponent(key)}`);
    return out.result || null;
  }
  const obj = readLocal();
  return obj.perDay?.[day] || null;
}

export async function setWordForDay(day, word) {
  if (KV_ENABLED) {
    const key = `wotd:word:${day}`;
    await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(word)}`);
    return;
  }
  const obj = readLocal();
  obj.perDay[day] = word;
  writeLocal(obj);
}

export async function getUsedWords() {
  if (KV_ENABLED) {
    const key = `wotd:used`;
    const out = await kvFetch(`/smembers/${encodeURIComponent(key)}`);
    const arr = out.result || [];
    return new Set(arr);
  }
  const obj = readLocal();
  return new Set(obj.used || []);
}

export async function addUsedWord(word) {
  if (KV_ENABLED) {
    const key = `wotd:used`;
    await kvFetch(`/sadd/${encodeURIComponent(key)}/${encodeURIComponent(word)}`);
    return;
  }
  const obj = readLocal();
  const set = new Set(obj.used || []);
  set.add(word);
  obj.used = Array.from(set);
  writeLocal(obj);
}

