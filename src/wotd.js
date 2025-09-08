import { generateWord } from './openai.js';

// Day key in America/New_York timezone (handles DST). Rolls at 00:01 ET.
export function dayKey(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

let cache = { day: null, word: null };
export async function todayWord() {
  const today = dayKey();
  if (cache.day === today && cache.word) return cache.word;
  const word = await generateWord(today);
  cache = { day: today, word };
  return word;
}
