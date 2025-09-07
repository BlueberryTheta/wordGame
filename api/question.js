import { todayWord } from '../src/wotd.js';
import { answerQuestion } from '../src/openai.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }
    const { question } = body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }
    const word = todayWord();
    const reply = await answerQuestion(word, question);
    return res.status(200).json({ answer: reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to answer question' });
  }
}
