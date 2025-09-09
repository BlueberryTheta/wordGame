import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
let client = null;
if (apiKey) {
  client = new OpenAI({ apiKey });
}

const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function concise(text, maxWords = 10) {
  if (!text) return '';
  let first = String(text).split(/(?<=[\.!?])\s+/)[0] || String(text);
  const words = first.trim().split(/\s+/);
  if (words.length > maxWords) first = words.slice(0, maxWords).join(' ');
  return first.trim();
}

function isQuestion(input) {
  const s = String(input || '').trim();
  if (!s) return false;
  if (s.endsWith('?')) return true;
  const lowers = s.toLowerCase();
  const starters = ['is', 'are', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'was', 'were', 'how', 'what', 'when', 'where', 'why', 'which'];
  return starters.some(w => lowers.startsWith(w + ' '));
}

function minimalFallback(secretWord, question) {
  if (!isQuestion(question)) return 'Please ask a question.';
  const q = String(question || '').toLowerCase();
  const vowels = new Set(['a','e','i','o','u']);
  if (q.includes('length') || q.includes('long') || q.includes('how many letters')) return `${secretWord.length} letters.`;
  if (q.includes('vowel')) return [...secretWord].some(ch => vowels.has(ch)) ? 'Yes.' : 'No.';
  if (q.includes('first letter') || q.includes('starts with') || /contains\s+[a-z]/.test(q)) return "Can't say.";
  if (q.includes('applicable') || q.includes('apply')) return 'Not applicable.';
  if (q.includes('person place or thing')) return 'Thing.';
  if (q.includes('a thing')) return 'Yes.';
  if (q.includes('a person')) return 'No.';
  if (q.includes('a place')) return 'No.';
  if (q.includes('outside') || q.includes('outdoors')) return 'Usually outdoors.';
  if (q.includes('inside') || q.includes('indoors')) return 'Usually indoors.';
  if (q.includes('green')) return 'Often green.';
  if (q.includes('alive')) return 'Not alive; contains living parts.';
  if (q.includes('on the ground')) return 'Usually on the ground.';
  if (/(big|small)/.test(q)) return 'Often medium-sized.';
  if (q.includes(' or ')) {
    if (q.includes('both')) return 'It can be both.';
    if (q.includes('color') || q.includes('colour')) return 'Not applicable.';
    const parts = q.split(' or ').map(x => x.replace(/[?\.]/g,'').trim()).filter(Boolean);
    if (parts.length >= 2) {
      const pick = Math.random() < 0.5 ? parts[0] : parts[1];
      const lastWord = pick.split(' ').slice(-1)[0];
      return lastWord || 'It can be both.';
    }
    return 'It can be both.';
  }
  if (q.startsWith('is ') || q.startsWith('are ') || q.startsWith('does ') || q.startsWith('do ')) return 'Varies.';
  return 'Please ask a question.';
}

export async function generateWord(dayHint, exclude = []) {
  // Fallback list if API key is missing
  const fallback = [
    'puzzle', 'garden', 'silver', 'planet', 'sunset', 'rocket', 'candle', 'forest', 'bridge', 'circle',
    'shadow', 'eleven', 'cobalt', 'nectar', 'safety', 'random', 'victor', 'artist', 'marble', 'quartz'
  ];

  if (!client) {
    // Deterministic-ish fallback based on hint; avoid garden
    const seed = String(dayHint || Date.now());
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const idx = Math.abs(h) % fallback.length;
    let pick = fallback[idx];
    if (pick === 'garden') pick = fallback[(idx + 7) % fallback.length];
    if (exclude.includes(pick)) pick = fallback[(idx + 11) % fallback.length];
    return pick;
  }

  const sys = `Generate a diverse list of lowercase common English nouns (singular).
Output only a comma-separated list, no numbers and no commentary.
Each item must be 4-9 letters and family-friendly.`;

  let candidates = [];
  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `Seed: ${seed || 'none'}\nReturn ~40 nouns. Exclude: ${(exclude||[]).slice(0,50).join(', ') || 'none'}.` }
      ],
      temperature: 0,
      max_tokens: 300
    });
    const raw = resp.choices?.[0]?.message?.content || '';
    candidates = raw
      .split(/[\n,]+/)
      .map(s => s.trim().toLowerCase())
      .map(s => s.replace(/[^a-z]/g, ''))
      .filter(s => s.length >= 4 && s.length <= 9);
  } catch (e) {
    console.error('OpenAI generateWord(list) failed, using fallback list:', e?.message || e);
  }

  if (!candidates.length) candidates = fallback.slice();
  // De-duplicate and remove excludes
  const seen = new Set();
  const filtered = [];
  for (const w of candidates) {
    if (!w || exclude.includes(w)) continue;
    if (!seen.has(w)) { seen.add(w); filtered.push(w); }
  }
  if (!filtered.length) filtered.push(...fallback.filter(w => !exclude.includes(w)));

  // Deterministic pick from filtered using the seed
  const idx = fnv1a(seed + '|' + filtered.length) % filtered.length;
  return filtered[idx];
}

export async function answerQuestion(secretWord, question) {
  // If no API, provide a minimal rule-based engine with improved answers
  if (!client) {
    return minimalFallback(secretWord, question);
  }

  const guard = `You know a secret word. Never reveal it or any exact letters.
Answer the user's question in ONE short sentence (max 10 words). No explanations.
Style rules (be decisive):
- Prefer yes/no when clear, with 1–3 word rationale (e.g., "Yes—usually outdoors").
- For option questions ("X or Y?"), pick the most typical option for the secret word.
- Use "It can be both" only if truly common; otherwise choose the typical case.
- Do NOT use the word "Varies" or "varied"; give the typical case.
- If a property does not apply, reply: Not applicable.
- Only reply "Can't say" for spelling/letter questions or if answering reveals letters.
- If the input is not a question, reply: Please ask a question.

Examples:
Q: Is it a person, place, or thing?
A: Thing.
Q: Is it outside?
A: Yes—usually outdoors.
Q: Is it green?
A: Often green.
Q: Is it alive?
A: Not alive; contains living parts.
Q: Is it big or small?
A: Small.`;

  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: guard },
        { role: 'user', content: `Secret word: ${secretWord}` },
        { role: 'user', content: question }
      ],
      temperature: 0.5,
      max_tokens: 70
    });

    let text = resp.choices?.[0]?.message?.content?.trim() || '';
    // Redact accidental leaks in case the model slips
    if (text.toLowerCase().includes(secretWord.toLowerCase())) {
      const re = new RegExp(secretWord, 'ig');
      text = text.replace(re, '[redacted]');
    }
    text = concise(text, 10);
    if (/\bvaries\b/i.test(text)) {
      // Final safeguard to avoid "Varies" in outputs
      text = text.replace(/\bvaries\b/ig, 'Usually');
    }
    // If the model is overly conservative, retry once with a nudge (can't say or overusing both)
    const tlow = text.toLowerCase();
    const asksLetters = /letter|starts with|spelling|contains/i.test(String(question || ''));
    const overConservative = (!asksLetters && (tlow === "can't say." || tlow === "can't say" || tlow === 'cannot say.' || tlow === 'cannot say')) || ((tlow.includes('it can be both') || tlow.includes('varies')) && !/\bboth\b/i.test(String(question||'')));
    if (overConservative) {
      const nudge = guard + '\nAvoid "Can\'t say", avoid "Varies", avoid "It can be both" unless the user implies both; pick the most typical option and add a 1–3 word rationale.';
      const resp2 = await client.chat.completions.create({
        model: defaultModel,
        messages: [
          { role: 'system', content: nudge },
          { role: 'user', content: `Secret word: ${secretWord}` },
          { role: 'user', content: question }
        ],
        temperature: 0.5,
        max_tokens: 70
      });
      let t2 = resp2.choices?.[0]?.message?.content?.trim() || '';
      if (t2.toLowerCase().includes(secretWord.toLowerCase())) {
        const re2 = new RegExp(secretWord, 'ig');
        t2 = t2.replace(re2, '[redacted]');
      }
      t2 = concise(t2, 10);
      if (/\bvaries\b/i.test(t2)) t2 = t2.replace(/\bvaries\b/ig, 'Usually');
      return t2 || text;
    }
    return text;
  } catch (e) {
    console.error('OpenAI answerQuestion failed, using fallback:', e?.message || e);
    return minimalFallback(secretWord, question);
    // Fallback hint
    const q = question.toLowerCase();
    const vowels = new Set(['a','e','i','o','u']);
    if (q.includes('length') || q.includes('long')) return `It has ${secretWord.length} letters.`;
    if (q.includes('vowel')) return [...secretWord].some(ch => vowels.has(ch)) ? 'Yes, it has vowels.' : 'No, it has no vowels.';
    if (q.includes('first letter')) return 'I won\'t reveal the first letter.';
    return 'I can\'t say directly—try yes/no-style property questions.';
  }
}

// Minimal word validation using OpenAI when available.
// Returns true if it's a valid common English word, false otherwise.
export async function isValidEnglishWord(word) {
  const cleaned = String(word || '').trim().toLowerCase();
  if (!/^[a-z]+$/.test(cleaned)) return false;
  // Basic length guard aligned with game: 4–12 chars
  if (cleaned.length < 4 || cleaned.length > 12) return false;

  if (!client) {
    // Fallback: heuristic only (letters + length). Without a model, allow.
    return true;
  }

  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: 'Answer ONLY YES or NO. Determine if the token is a valid standalone common English dictionary word (not a proper noun, not an abbreviation).' },
        { role: 'user', content: `Token: ${cleaned}` }
      ],
      temperature: 0,
      max_tokens: 2
    });
    const text = resp.choices?.[0]?.message?.content?.trim().toUpperCase() || '';
    return text.startsWith('Y');
  } catch (e) {
    console.error('OpenAI isValidEnglishWord failed, allowing word by fallback:', e?.message || e);
    // On failure, don’t block the user unfairly
    return true;
  }
}
