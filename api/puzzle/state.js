import { puzzleWord, dayKey } from '../../src/wotd.js';
import { answerQuestion } from '../../src/openai.js';
import { getPuzzleState, setPuzzleState } from '../../src/storage.js';

function pick(n, max) {
  const out = new Set();
  while (out.size < n && out.size < max) out.add(Math.floor(Math.random() * max));
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
const PUZZLE_STATE_VERSION = 2;

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
      // Reveal count tied to word length: longer words get 2, short get 1
      const revealCount = letters.length >= 6 ? 2 : 1;
      const idxs = pick(revealCount, letters.length);
      const qCount = 6 + Math.floor(Math.random() * 2); // 6 or 7
      const qIdxs = pick(qCount, SAMPLE_QUESTIONS.length);
      const qas = [];
      for (const qi of qIdxs) {
        const q = SAMPLE_QUESTIONS[qi];
        try { const a = await answerQuestion(word, q); qas.push({ q, a }); }
        catch { qas.push({ q, a: 'Cannot say.' }); }
      }
      stored = { idxs, qas, version: PUZZLE_STATE_VERSION };
      try { await setPuzzleState(day, stored); } catch {}
    }
    const mask = letters.map((ch, i) => (stored.idxs || []).includes(i) ? ch : null);
    return res.status(200).json({ wordLength: letters.length, revealedMask: mask, qas: stored.qas || [] });
  } catch (e) {
    console.error('[PUZZLE_STATE_ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Failed to load puzzle state' });
  }
}
