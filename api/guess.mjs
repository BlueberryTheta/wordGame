import { todayWord } from '../src/wotd.js';

async function readJson(req) {
  return new Promise((resolve) => {
    try {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch { resolve({}); }
      });
    } catch {
      resolve({});
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = await readJson(req);
    const { guess } = body || {};
    if (!guess || typeof guess !== 'string') {
      return res.status(400).json({ error: 'Missing guess' });
    }
    const word = todayWord();
    const cleanedGuess = guess.trim().toLowerCase();
    const cleanedWord = word.toLowerCase();

    const correct = cleanedGuess === cleanedWord;
    if (correct) {
      return res.status(200).json({ correct: true, word });
    }

    const guessLetters = new Set([...cleanedGuess]);
    const revealedMask = [...cleanedWord].map(ch => guessLetters.has(ch) ? ch : null);
    const lettersInCommon = [...new Set([...cleanedWord].filter(ch => guessLetters.has(ch)))];

    return res.status(200).json({ correct: false, revealedMask, lettersInCommon });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to process guess' });
  }
}
