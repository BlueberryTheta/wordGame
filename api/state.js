import { todayWord, dayKey } from '../src/wotd.js';

export default async function handler(req, res) {
  try {
    const word = await todayWord();
    return res.status(200).json({ dayKey: dayKey(), wordLength: word.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to get state' });
  }
}
