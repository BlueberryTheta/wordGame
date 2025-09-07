import { todayWord } from '../src/wotd.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }
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
