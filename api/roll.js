import { todayWord, resetWordCache, dayKey } from '../src/wotd.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const url = new URL(req.url, 'http://vercel.local');
    const token = url.searchParams.get('token');
    const salt = url.searchParams.get('salt') || String(Date.now());
    if (process.env.ADMIN_TOKEN && token !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'forbidden' });
    }
    resetWordCache();
    const word = await todayWord(true, salt);
    return res.status(200).json({ dayKey: dayKey(), word });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to roll word' });
  }
}
