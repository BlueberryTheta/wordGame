import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateWord } from './openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const statePath = path.join(dataDir, 'state.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function dayKey(date = new Date()) {
  // YYYY-MM-DD in America/New_York time, rolling at 00:01 ET
  const tz = 'America/New_York';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const partsArr = fmt.formatToParts(date);
  const parts = partsArr.reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  if (parts.hour === '00' && Number(parts.minute) < 1) {
    const prev = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const prevFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const prevParts = prevFmt.formatToParts(prev).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
    return `${prevParts.year}-${prevParts.month}-${prevParts.day}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function readState() {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(state) {
  ensureDataDir();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

export async function ensureTodayWord() {
  const today = dayKey();
  const existing = readState();
  if (existing && existing.day === today && existing.word) {
    return existing.word;
  }
  const word = await generateWord(today);
  writeState({ day: today, word });
  return word;
}

export function getTodayWord() {
  const state = readState();
  if (!state || state.day !== dayKey() || !state.word) {
    // Should be ensured by ensureTodayWord at startup/scheduler, but guard anyway
    throw new Error('Word for today not initialized');
  }
  return state.word;
}

export function scheduleNextRoll() {
  // Schedule generation at 00:01 America/New_York next day
  const now = new Date();
  const tz = 'America/New_York';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const partsArr = fmt.formatToParts(now);
  const parts = partsArr.reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  // Build next day components in ET
  let y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  // Create a Date in ET by using the locale string hack
  const etMidnightPlus = (yy, mm, dd, hh = 0, mi = 1) => new Date(new Date(`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mi).padStart(2,'0')}:00`).toLocaleString('en-US', { timeZone: tz }));
  // Compute tomorrow ET date by adding 24h in ET context
  const todayEt = etMidnightPlus(y, m, d, Number(parts.hour), Number(parts.minute));
  const tomorrowEt = new Date(todayEt.getTime() + 24 * 60 * 60 * 1000);
  const y2 = tomorrowEt.getFullYear();
  const m2 = tomorrowEt.getMonth() + 1;
  const d2 = tomorrowEt.getDate();
  const target = etMidnightPlus(y2, m2, d2, 0, 1);
  const delay = Math.max(1, target.getTime() - now.getTime());
  setTimeout(async () => {
    try {
      await ensureTodayWord();
    } catch (e) {
      console.error('Failed to roll word at 00:01 ET:', e);
    }
    scheduleNextRoll();
  }, delay);
}
