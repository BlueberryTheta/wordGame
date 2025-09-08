import { todayWord } from '../src/wotd.js';

export default function handler(req, res) {
  try {
    const word = todayWord();
    return res.status(200).json({ word });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to reveal word' });
  }
}

