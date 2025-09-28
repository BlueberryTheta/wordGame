import { todayWord, dayKey, wordForDay } from '../src/wotd.js';
const BOOT_ID = Math.random().toString(36).slice(2,8);

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    const url = new URL(req.url, 'http://vercel.local');
    const force = url.searchParams.get('force');
    const salt = url.searchParams.get('salt') || '';
    const day = url.searchParams.get('day');
    const token = url.searchParams.get('token');
    const adminOk = !process.env.ADMIN_TOKEN || token === process.env.ADMIN_TOKEN;
    let word;
    if (day) {
      word = await wordForDay(day, { generateIfMissing: true });
    } else {
      word = await todayWord(force && adminOk, (force && adminOk) ? salt : '');
    }
    const version = fnv1a(word);
    const payload = { dayKey: day || dayKey(), wordLength: word.length, wordVersion: version };
    console.log('[STATE]', { boot: BOOT_ID, region: process.env.VERCEL_REGION, query: Object.fromEntries(url.searchParams.entries()), payload });
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[STATE_ERROR]', e?.message || e);
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
