import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getTodayWord, scheduleNextRoll, ensureTodayWord, dayKey } from './src/wordManager.js';
import { answerQuestion } from './src/openai.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  try {
    const { guess } = req.body || {};
    if (!guess || typeof guess !== 'string') {
      return res.status(400).json({ error: 'Missing guess' });
    }
    const word = getTodayWord();
    const cleanedGuess = guess.trim().toLowerCase();
    const cleanedWord = word.toLowerCase();

    const correct = cleanedGuess === cleanedWord;
    if (correct) {
      return res.json({ correct: true, word });
    }

    const guessLetters = new Set([...cleanedGuess]);
    const revealedMask = [...cleanedWord].map(ch => guessLetters.has(ch) ? ch : null);
    const lettersInCommon = [...new Set([...cleanedWord].filter(ch => guessLetters.has(ch)))];

    return res.json({ correct: false, revealedMask, lettersInCommon });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to process guess' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
