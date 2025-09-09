import { todayWord, dayKey } from '../src/wotd.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const url = new URL(req.url, 'http://vercel.local');
    const force = url.searchParams.get('force');
    const token = url.searchParams.get('token');
    const adminOk = !process.env.ADMIN_TOKEN || token === process.env.ADMIN_TOKEN;
    const word = await todayWord(force && adminOk);
    return res.status(200).json({ dayKey: dayKey(), wordLength: word.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to get state' });
  }
}
