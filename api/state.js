import { todayWord, dayKey } from '../src/wotd.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const url = new URL(req.url, 'http://vercel.local');
    const force = url.searchParams.get('force');
    const salt = url.searchParams.get('salt') || '';
    const token = url.searchParams.get('token');
    const adminOk = !process.env.ADMIN_TOKEN || token === process.env.ADMIN_TOKEN;
    const word = await todayWord(force && adminOk, (force && adminOk) ? salt : '');
    const version = fnv1a(word);
    return res.status(200).json({ dayKey: dayKey(), wordLength: word.length, wordVersion: version });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to get state' });
  }
}

function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
