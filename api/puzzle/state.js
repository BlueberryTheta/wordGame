import { puzzleWord } from '../../src/wotd.js';
import { answerQuestion } from '../../src/openai.js';

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

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const word = await puzzleWord();
    const letters = word.split('');
    const revealCount = Math.random() < 0.5 ? 1 : 2;
    const idxs = pick(revealCount, letters.length);
    const mask = letters.map((ch, i) => (idxs.includes(i) ? ch : null));
    // Pick 2-3 sample questions; answer via AI
    const qCount = 2 + Math.floor(Math.random() * 2); // 2 or 3
    const qIdxs = pick(qCount, SAMPLE_QUESTIONS.length);
    const qas = [];
    for (const qi of qIdxs) {
      const q = SAMPLE_QUESTIONS[qi];
      try {
        const a = await answerQuestion(word, q);
        qas.push({ q, a });
      } catch {
        qas.push({ q: SAMPLE_QUESTIONS[qi], a: 'Cannot say.' });
      }
    }
    return res.status(200).json({ wordLength: letters.length, revealedMask: mask, qas });
  } catch (e) {
    console.error('[PUZZLE_STATE_ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Failed to load puzzle state' });
  }
}

