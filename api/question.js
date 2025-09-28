import { todayWord, dayKey, wordForDay } from '../src/wotd.js';
import { answerQuestion } from '../src/openai.js';

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
    const { question, day } = body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }
    const q = String(question).trim();
    if (q.length > 100) {
      return res.status(400).json({ error: 'question too long (max 100 chars)' });
    }
    const word = day ? await wordForDay(day, { generateIfMissing: true }) : await todayWord();
    console.log('[QUESTION]', { dayKey: dayKey(), q, word, len: word.length });
    const reply = await answerQuestion(word, q);
    return res.status(200).json({ answer: reply });
  } catch (e) {
    console.error('QUESTION_ERROR:', e?.message || e);
    const msg = (e && e.message) ? String(e.message) : '';
    if (/openai not configured/i.test(msg)) {
      return res.status(503).json({ error: 'AI unavailable: OPENAI_API_KEY missing' });
    }
    return res.status(500).json({ error: 'Failed to answer question' });
  }
}
