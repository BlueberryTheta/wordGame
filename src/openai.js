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

// Deterministic 32-bit hash (FNV-1a) used to pick from lists by seed
function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function generateWord(dayHint, exclude = []) {
  if (!client) throw new Error('OpenAI not configured');
  const seed = String(dayHint || '');

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
    console.error('OpenAI generateWord(list) failed:', e?.message || e);
    throw e;
  }

  if (!candidates.length) throw new Error('No candidates');
  // De-duplicate and remove excludes
  const seen = new Set();
  const filtered = [];
  for (const w of candidates) {
    if (!w || exclude.includes(w)) continue;
    if (!seen.has(w)) { seen.add(w); filtered.push(w); }
  }
  if (!filtered.length) throw new Error('No filtered candidates');

  // Deterministic pick from filtered using the seed
  const idx = fnv1a(seed + '|' + filtered.length) % filtered.length;
  return filtered[idx];
}

export async function answerQuestion(secretWord, question) {
  if (!client) throw new Error('OpenAI not configured');

  const guard = `You know a secret word. Never reveal it or any exact letters.
Answer the user's question in ONE short sentence (max 10 words). No explanations.
Before answering, silently classify the secret word into one: organism (animal/plant), object, place, material/substance, event/time, concept.
Style rules (be decisive):
- For yes/no questions (Is/Are/Do/Does/Did/Can/Could/Should/Would/Will/Was/Were/Has/Have/Had), answer EXACTLY "Yes." or "No." — nothing else, unless it is not applicable.
- For option questions ("X or Y?"), pick the most typical option for the secret word.
- For who/what/where/when/how questions, give a generic, high-level property or common context about the word without naming it (e.g., "Often found outdoors").
- If a question does not apply to this category, reply exactly: That is not applicable.
- Mapping hints:
  • Alive? → Yes if organism; No if object/material; That is not applicable for place/concept/event.
  • Used for/used by/has wheels/made of/owned by → For organism/place/concept/event: That is not applicable. For objects/materials: answer Yes/No.
- Avoid "Varies" or "It depends". Choose the typical case.
- Use "It can be both" only if the question explicitly suggests both.
- Only reply "Can't say" for spelling/letter questions or if answering reveals letters.
- If the input is not a question, reply: Please ask a question.

Examples:
Q: Is it a person, place, or thing?
A: Thing.
Q: Is it outside?
A: Yes.
Q: Is it green?
A: Often green.
Q: Is it alive?
A: Not alive.
Q: Is it soft?
A: No.
Q: Does it have wheels?
A: No.
Q: Is it made of metal?
A: No.
Q: Where would I find it?
A: Often found outdoors.
Q: Who uses it most?
A: Used by many people.
Q: When is it used?
A: Commonly used daily.
Q: How is it used?
A: Used for everyday tasks.
Q: When does that not apply?
A: That is not applicable.`;

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
    // Strict post-processing for yes/no questions to avoid extra info
    const qLower = String(question || '').trim().toLowerCase();
    const isOption = /\bor\b/.test(qLower);
    const isYesNo = !isOption && /^(is|are|do|does|did|can|could|should|would|will|was|were|has|have|had)\b/.test(qLower);
    if (isYesNo) {
      const t = text.toLowerCase();
      if (t.includes('not applicable')) return 'That is not applicable.';
      if (/^\s*y(es)?\b/.test(t) || /\byes\b/.test(t)) return 'Yes.';
      if (/^\s*n(o)?\b/.test(t) || /\bno\b/.test(t)) return 'No.';
      // If ambiguous, fall back to "Yes." or "No." only if strongly implied
      // Otherwise keep concise text (rare)
    }
    // If the model is overly conservative, retry once with a nudge (can't say or overusing both)
    const tlow = text.toLowerCase();
    const asksLetters = /letter|starts with|spelling|contains/i.test(String(question || ''));
    const overConservative = (!asksLetters && (tlow === "can't say." || tlow === "can't say" || tlow === 'cannot say.' || tlow === 'cannot say')) || ((tlow.includes('it can be both') || tlow.includes('varies')) && !/\bboth\b/i.test(String(question||'')));
    if (overConservative) {
      const nudge = guard + '\nReinforce: For yes/no questions return ONLY "Yes." or "No." unless not applicable. Use "That is not applicable" for questions about usage/material/wheels when the word is an organism/place/concept/event.';
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
      if (isYesNo) {
        const tt = t2.toLowerCase();
        if (tt.includes('not applicable')) return 'That is not applicable.';
        if (/^\s*y(es)?\b/.test(tt) || /\byes\b/.test(tt)) return 'Yes.';
        if (/^\s*n(o)?\b/.test(tt) || /\bno\b/.test(tt)) return 'No.';
      }
      return t2 || text;
    }
    return text;
  } catch (e) {
    console.error('OpenAI answerQuestion failed:', e?.message || e);
    throw e;
  }
}

// Deterministic variant for puzzle pre-asked hints (aim for stable answers)
export async function answerQuestionDeterministic(secretWord, question) {
  if (!client) throw new Error('OpenAI not configured');
  const guard = `You know a secret word. Never reveal it or any exact letters.
Answer the user's question in ONE short sentence (max 10 words). No explanations.
Before answering, silently classify the secret word into one: organism (animal/plant), object, place, material/substance, event/time, concept.
Style rules (be decisive):
- For yes/no questions (Is/Are/Do/Does/Did/Can/Could/Should/Would/Will/Was/Were/Has/Have/Had), answer EXACTLY "Yes." or "No." — nothing else, unless it is not applicable.
- For option questions ("X or Y?"), pick the most typical option for the secret word.
- For who/what/where/when/how questions, give a generic, high-level property or common context about the word without naming it (e.g., "Often found outdoors").
- If a question does not apply to this category, reply exactly: That is not applicable.
- Avoid "Varies" or "It depends". Choose the typical case.
- Only reply "Can't say" for spelling/letter questions or if answering reveals letters.`;
  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: guard },
        { role: 'user', content: `Secret word: ${secretWord}` },
        { role: 'user', content: question }
      ],
      temperature: 0,
      max_tokens: 70
    });
    let text = resp.choices?.[0]?.message?.content?.trim() || '';
    if (text.toLowerCase().includes(secretWord.toLowerCase())) {
      const re = new RegExp(secretWord, 'ig');
      text = text.replace(re, '[redacted]');
    }
    text = concise(text, 10);
    const qLower = String(question || '').trim().toLowerCase();
    const isOption = /\bor\b/.test(qLower);
    const isYesNo = !isOption && /^(is|are|do|does|did|can|could|should|would|will|was|were|has|have|had)\b/.test(qLower);
    if (isYesNo) {
      const t = text.toLowerCase();
      if (t.includes('not applicable')) return 'That is not applicable.';
      if (/^\s*y(es)?\b/.test(t) || /\byes\b/.test(t)) return 'Yes.';
      if (/^\s*n(o)?\b/.test(t) || /\bno\b/.test(t)) return 'No.';
    }
    return text;
  } catch (e) {
    console.error('OpenAI answerQuestionDeterministic failed:', e?.message || e);
    throw e;
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
