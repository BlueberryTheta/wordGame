import { generateWord } from './openai.js';

// Simpler approach: no external storage. Always derive deterministically
// from ET day + optional secret + optional salt. Cache in-memory per
// instance to avoid repeated calls during a warm session.

// Day key in America/New_York timezone (handles DST). Rolls at 00:01 ET.
export function dayKey(date = new Date()) {
  const tz = 'America/New_York';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const partsArr = fmt.formatToParts(date);
  const parts = partsArr.reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  // Hold previous day until 00:01 ET
  if (parts.hour === '00' && Number(parts.minute) < 1) {
    const prev = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const prevFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const prevParts = prevFmt.formatToParts(prev).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
    return `${prevParts.year}-${prevParts.month}-${prevParts.day}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

let cache = { day: null, word: null };
export function resetWordCache() { cache = { day: null, word: null }; }
export async function todayWord(force = false, salt = '') {
  const today = dayKey();
  if (!force && cache.day === today && cache.word) return cache.word;
  const hint = `${today}|${process.env.WOTD_SECRET || ''}|${salt}`;
  let word = '';
  try {
    word = await generateWord(hint, []);
  } catch (e) {
    // Final fallback: deterministic local pick to avoid throwing
    word = localFallbackWord(hint);
  }
  word = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!word || word.length < 4 || word.length > 9) {
    word = localFallbackWord(hint);
  }
  cache = { day: today, word };
  return word;
}

function localFallbackWord(hint) {
  const pool = [
    'puzzle','planet','rocket','forest','bridge','circle','shadow','cobalt','nectar','marble',
    'silver','sunset','artist','quartz','candle','random','victor','safety','eleven','garden'
  ];
  let h = 2166136261 >>> 0;
  const s = String(hint || 'seed');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const idx = Math.abs(h) % pool.length;
  return pool[idx];
}
