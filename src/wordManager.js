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
  // YYYY-MM-DD in local time
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  const word = await generateWord();
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
  // Schedule generation at 00:01 local time next day
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 1, 0, 0); // 00:01:00.000
  const delay = Math.max(1, next.getTime() - now.getTime());
  setTimeout(async () => {
    try {
      await ensureTodayWord();
    } catch (e) {
      // log and continue; we can try again on next schedule or first request
      console.error('Failed to roll word at 00:01:', e);
    }
    scheduleNextRoll();
  }, delay);
}

