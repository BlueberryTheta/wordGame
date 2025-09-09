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
  const word = await generateWord(hint, []);
  cache = { day: today, word };
  return word;
}
