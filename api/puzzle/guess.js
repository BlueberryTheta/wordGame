import { puzzleWord } from '../../src/wotd.js';
import { isValidEnglishWord } from '../../src/openai.js';

async function readJson(req) {
  return new Promise((resolve) => {
    try { let data=''; req.on('data',c=>data+=c); req.on('end',()=>{ try{ resolve(JSON.parse(data||'{}')); } catch{ resolve({}); } }); }
    catch { resolve({}); }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const body = await readJson(req);
    const { guess } = body || {};
    if (!guess || typeof guess !== 'string') return res.status(400).json({ error: 'Missing guess' });
    const g = String(guess).trim().toLowerCase();
    if (!/^[a-z]+$/.test(g) || g.length < 4 || g.length > 12) return res.status(400).json({ error: 'not a word' });
    const valid = await isValidEnglishWord(g);
    if (!valid) return res.status(400).json({ error: 'not a word' });
    const word = await puzzleWord();
    const w = word.toLowerCase();
    if (g === w) return res.status(200).json({ correct: true, word });
    const guessLetters = new Set([...g]);
    const revealedMask = [...w].map(ch => guessLetters.has(ch) ? ch : null);
    const lettersInCommon = [...new Set([...w].filter(ch => guessLetters.has(ch)))];
    return res.status(200).json({ correct: false, revealedMask, lettersInCommon });
  } catch (e) {
    console.error('[PUZZLE_GUESS_ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Failed to process guess' });
  }
}

