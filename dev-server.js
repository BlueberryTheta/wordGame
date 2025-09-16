import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getTodayWord, scheduleNextRoll, ensureTodayWord, dayKey, forceRollTodayWord } from './src/wordManager.js';
import { answerQuestion, isValidEnglishWord } from './src/openai.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve logo assets that live at repo root (not in public)
// Explicit logo routes (handle various paths/encodings)
const darkLogoPath = path.join(__dirname, 'inqaily dark logo.png');
const lightLogoPath = path.join(__dirname, 'inqaily light logo.png');

app.get(['/assets/inqaily-dark-logo.png', '/inqaily-dark-logo.png', '/inqaily%20dark%20logo.png', '/inqaily dark logo.png'], (req, res) => {
  res.sendFile(darkLogoPath);
});
app.get(['/assets/inqaily-light-logo.png', '/inqaily-light-logo.png', '/inqaily%20light%20logo.png', '/inqaily light logo.png'], (req, res) => {
  res.sendFile(lightLogoPath);
});

// Ensure today word exists on startup and schedule next change at 00:01
await ensureTodayWord();
scheduleNextRoll();

// Helpers
function getMaskedState() {
  const word = getTodayWord();
  return {
    dayKey: dayKey(),
    wordLength: word.length
  };
}

// API routes
app.get('/api/state', (req, res) => {
  try {
    return res.json(getMaskedState());
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to get state' });
  }
});

app.post('/api/question', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }
    const word = getTodayWord();
    const reply = await answerQuestion(word, question);
    return res.json({ answer: reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to answer question' });
  }
});

app.post('/api/guess', (req, res) => {
  (async () => {
    try {
      const { guess } = req.body || {};
      if (!guess || typeof guess !== 'string') {
        return res.status(400).json({ error: 'Missing guess' });
      }
      // Validate guess before processing
      const cleanedGuess = String(guess).trim().toLowerCase();
      if (!/^[a-z]+$/.test(cleanedGuess) || cleanedGuess.length < 4 || cleanedGuess.length > 12) {
        return res.status(400).json({ error: 'not a word' });
      }
      const valid = await isValidEnglishWord(cleanedGuess);
      if (!valid) return res.status(400).json({ error: 'not a word' });

      const word = getTodayWord();
      const cleanedWord = word.toLowerCase();

      const correct = cleanedGuess === cleanedWord;
      if (correct) return res.json({ correct: true, word });

      const guessLetters = new Set([...cleanedGuess]);
      const revealedMask = [...cleanedWord].map(ch => guessLetters.has(ch) ? ch : null);
      const lettersInCommon = [...new Set([...cleanedWord].filter(ch => guessLetters.has(ch)))];

      return res.json({ correct: false, revealedMask, lettersInCommon });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to process guess' });
    }
  })();
});

app.post('/api/admin/roll', async (req, res) => {
  try {
    const token = req.query.token || req.headers['x-admin-token'];
    const salt = req.query.salt || '';
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const word = await forceRollTodayWord(salt);
    res.json({ dayKey: dayKey(), word });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to roll word' });
  }
});

app.get('/api/reveal', (req, res) => {
  try {
    const word = getTodayWord();
    return res.json({ word });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to reveal word' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
