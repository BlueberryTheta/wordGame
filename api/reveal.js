import { todayWord, dayKey } from '../src/wotd.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const word = await todayWord();
    console.log('[REVEAL]', { boot: BOOT_ID, region: process.env.VERCEL_REGION, dayKey: dayKey(), word, len: word.length });
    return res.status(200).json({ word });
  } catch (e) {
    console.error('[REVEAL_ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Failed to reveal word' });
  }
}
const BOOT_ID = Math.random().toString(36).slice(2,8);
