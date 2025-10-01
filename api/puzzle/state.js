import { puzzleWord, dayKey } from '../../src/wotd.js';
import { answerQuestionDeterministic } from '../../src/openai.js';
import { getPuzzleState, setPuzzleState } from '../../src/storage.js';

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seededPick(n, max, rnd) {
  const out = new Set();
  while (out.size < n && out.size < max) out.add(Math.floor(rnd() * max));
  return Array.from(out);
}

const SAMPLE_QUESTIONS = [
  'Is it usually found indoors or outdoors?',
  'Is it man-made?',
  'Is it larger than a person?',
  'Is it commonly used daily?',
  'Is it typically alive?',
  'Is it often found in a home?',
  'Is it used for work or leisure?'
];

// Bump this to force regenerating puzzle state for a day
const PUZZLE_STATE_VERSION = 4;

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const word = await puzzleWord();
    const letters = word.split('');
    const day = dayKey();
    let stored = await getPuzzleState(day);
    const needsRegen = !stored || stored.version !== PUZZLE_STATE_VERSION;
    if (needsRegen) {
      // Deterministic selection seeded by day+word
      let seed = 0;
      try { const s = (day + '|' + word); for (let i=0;i<s.length;i++){ seed = Math.imul(seed ^ s.charCodeAt(i), 2654435761) >>> 0; } } catch {}
      const rnd = mulberry32(seed || 123456789);
      const revealCount = letters.length >= 6 ? 2 : 1;
      const idxs = seededPick(revealCount, letters.length, rnd);
      const qCount = 6 + Math.floor(rnd() * 2); // 6 or 7
      const qIdxs = seededPick(qCount, SAMPLE_QUESTIONS.length, rnd);
      const qas = [];
      for (const qi of qIdxs) {
        const q = SAMPLE_QUESTIONS[qi];
        try { const a = await answerQuestionDeterministic(word, q); qas.push({ q, a }); }
        catch { qas.push({ q, a: 'Cannot say.' }); }
      }
      stored = { idxs, qas, version: PUZZLE_STATE_VERSION };
      try { await setPuzzleState(day, stored); } catch {}
    }
    const mask = letters.map((ch, i) => (stored.idxs || []).includes(i) ? ch : null);
    return res.status(200).json({ dayKey: day, wordLength: letters.length, revealedMask: mask, qas: stored.qas || [] });
  } catch (e) {
    console.error('[PUZZLE_STATE_ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Failed to load puzzle state' });
  }
}
