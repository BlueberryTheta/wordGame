import { generateWord } from './openai.js';
import { getWordForDay, setWordForDay, getUsedWords, addUsedWord } from './storage.js';

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
  const hint = `${today}|${process.env.WOTD_SECRET || ''}|${salt}`;
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  // If KV is available, pin the word once per day for all instances
  if (hasKV) {
    // Always read from KV first so Dev roll (which updates KV) takes effect
    // immediately across all warm instances.
    if (!force) {
      const existing = await getWordForDay(today, 'main');
      if (existing) {
        if (!(cache.day === today && cache.word === existing)) {
          console.log('[WOTD] kv hit', { day: today, word: existing, len: existing.length });
        }
        try { await addUsedWord(existing, 'main'); } catch {}
        cache = { day: today, word: existing };
        return existing;
      }
    }
    console.log('[WOTD] generating (KV)', { day: today, force, salt, hint });
    let exclude = [];
    try { exclude = Array.from(await getUsedWords('main')); } catch {}
    const word = await generateWord(hint, exclude);
    console.log('[WOTD] generated (KV)', { day: today, word, len: String(word||'').length });
    await setWordForDay(today, word, 'main');
    try { await addUsedWord(word, 'main'); } catch {}
    cache = { day: today, word };
    return word;
  }

  // Without KV in serverless, different instances can diverge. Make this explicit.
  const onVercel = !!process.env.VERCEL;
  if (onVercel && !hasKV) {
    console.error('[WOTD_ERROR] KV not configured; multiple instances may disagree. Set KV_REST_API_URL and KV_REST_API_TOKEN.');
  }
  if (!force && cache.day === today && cache.word) {
    console.log('[WOTD] cache hit', { day: today, word: cache.word, len: cache.word.length });
    return cache.word;
  }
  console.log('[WOTD] generating (no KV)', { day: today, force, salt, hint });
  let exclude = [];
  try { exclude = Array.from(await getUsedWords('main')); } catch {}
  const word = await generateWord(hint, exclude);
  console.log('[WOTD] generated (no KV)', { day: today, word, len: String(word||'').length });
  try { await addUsedWord(word, 'main'); } catch {}
  cache = { day: today, word };
  return word;
}

// Puzzle mode variant: separate word namespace and seed
export async function puzzleWord(force = false, salt = '') {
  const today = dayKey();
  const hint = `${today}|${process.env.WOTD_SECRET || ''}|puzzle|${salt}`;
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (hasKV) {
    if (!force) {
      const existing = await getWordForDay(today, 'puzzle');
      if (existing) {
        try { await addUsedWord(existing, 'puzzle'); } catch {}
        return existing;
      }
    }
    let exclude = [];
    try { exclude = Array.from(await getUsedWords('puzzle')); } catch {}
    let word;
    if (hasOpenAI) {
      word = await generateWord(hint, exclude);
    } else {
      // Fallback deterministic selection from a small list (no OpenAI)
      const candidates = [
        'planet','forest','river','pencil','magnet','bridge','garden','window','rocket','silver',
        'basket','candle','pirate','throne','hammer','cactus','island','button','wallet','helmet',
        'pillow','tunnel','mirror','ladder','wallet','copper','fabric','library','market','valley'
      ];
      const seen = new Set(exclude);
      const base = Math.abs([...hint].reduce((h,c)=>((h<<5)-h)+c.charCodeAt(0)|0,0));
      for (let i = 0; i < candidates.length; i++) {
        const idx = (base + i) % candidates.length;
        const w = candidates[idx];
        if (!seen.has(w)) { word = w; break; }
      }
      word = word || candidates[(base) % candidates.length];
    }
    await setWordForDay(today, word, 'puzzle');
    try { await addUsedWord(word, 'puzzle'); } catch {}
    return word;
  }

  let exclude = [];
  try { exclude = Array.from(await getUsedWords('puzzle')); } catch {}
  let word;
  if (hasOpenAI) {
    word = await generateWord(hint, exclude);
  } else {
    const candidates = [
      'planet','forest','river','pencil','magnet','bridge','garden','window','rocket','silver',
      'basket','candle','pirate','throne','hammer','cactus','island','button','wallet','helmet',
      'pillow','tunnel','mirror','ladder','wallet','copper','fabric','library','market','valley'
    ];
    const seen = new Set(exclude);
    const base = Math.abs([...hint].reduce((h,c)=>((h<<5)-h)+c.charCodeAt(0)|0,0));
    for (let i = 0; i < candidates.length; i++) {
      const idx = (base + i) % candidates.length;
      const w = candidates[idx];
      if (!seen.has(w)) { word = w; break; }
    }
    word = word || candidates[(base) % candidates.length];
  }
  try { await addUsedWord(word, 'puzzle'); } catch {}
  return word;
}
