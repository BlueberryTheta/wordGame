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
  if (q.includes('first letter')) return "Can't say.";
  if (q.includes('applicable') || q.includes('apply')) return 'Not applicable.';
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
  if (q.startsWith('is ') || q.startsWith('are ') || q.startsWith('does ') || q.startsWith('do ')) return 'It can be both.';
  return 'Please ask a question.';
}

export async function generateWord(dayHint) {
  // Fallback list if API key is missing
  const fallback = [
    'puzzle', 'garden', 'silver', 'planet', 'sunset', 'rocket', 'candle', 'forest', 'bridge', 'circle',
    'shadow', 'eleven', 'cobalt', 'nectar', 'safety', 'random', 'victor', 'artist', 'marble', 'quartz'
  ];

  if (!client) {
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  const sys = `You are selecting a single neutral English word-of-the-day.
Rules:
- Output exactly one lowercase common English NOUN (singular), no quotes, no punctuation, no explanation.
- 4-9 letters, family-friendly.
- Avoid proper nouns, brands, slurs, or sensitive content.`;

  let word = '';
  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `Pick today's word${dayHint ? ` for ${dayHint}` : ''}.` }
      ],
      temperature: 0,
      max_tokens: 5
    });
    word = resp.choices?.[0]?.message?.content?.trim()?.toLowerCase() || '';
  } catch (e) {
    console.error('OpenAI generateWord failed, using fallback:', e?.message || e);
  }
  word = word.replace(/[^a-z]/g, '');
  if (!word || word.length < 4 || word.length > 9) {
    // Fallback if model fails constraints
    const choice = fallback[Math.floor(Math.random() * fallback.length)];
    return choice;
  }
  return word;
}

export async function answerQuestion(secretWord, question) {
  // If no API, provide a minimal rule-based engine with improved answers
  if (!client) {
    return minimalFallback(secretWord, question);
  }

  const guard = `You know a secret word. Never reveal it or any exact letters.
Answer the user's question in ONE short sentence (max 10 words). No explanations.
Style rules:
- Prefer yes/no when clear.
- If ambiguous, reply: It can be both.
- If the property does not apply, reply: Not applicable.
- For questions with options (e.g., "big or small?"), pick one option if inferable; otherwise reply: It can be both. Do NOT reply "Can't say" just because options are present.
- Only reply "Can't say" when the user asks about letters/spelling (e.g., first letter, contains letter) or answering would directly reveal the word's spelling.
- If the input is not a question, reply: Please ask a question.`;

  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: guard },
        { role: 'user', content: `Secret word: ${secretWord}` },
        { role: 'user', content: question }
      ],
      temperature: 0.35,
      max_tokens: 50
    });

    let text = resp.choices?.[0]?.message?.content?.trim() || '';
    // Redact accidental leaks in case the model slips
    if (text.toLowerCase().includes(secretWord.toLowerCase())) {
      const re = new RegExp(secretWord, 'ig');
      text = text.replace(re, '[redacted]');
    }
    text = concise(text, 10);
    // If the model is overly conservative, retry once with a nudge
    const tlow = text.toLowerCase();
    const asksLetters = /letter|starts with|spelling|contains/i.test(String(question || ''));
    if (!asksLetters && (tlow === "can't say." || tlow === "can't say" || tlow === 'cannot say.' || tlow === 'cannot say')) {
      const nudge = guard + '\nDo not reply "Can\'t say" unless the user asks about letters/spelling. Prefer Yes/No, It can be both, Not applicable, or one option.';
      const resp2 = await client.chat.completions.create({
        model: defaultModel,
        messages: [
          { role: 'system', content: nudge },
          { role: 'user', content: `Secret word: ${secretWord}` },
          { role: 'user', content: question }
        ],
        temperature: 0.35,
        max_tokens: 50
      });
      let t2 = resp2.choices?.[0]?.message?.content?.trim() || '';
      if (t2.toLowerCase().includes(secretWord.toLowerCase())) {
        const re2 = new RegExp(secretWord, 'ig');
        t2 = t2.replace(re2, '[redacted]');
      }
      return concise(t2, 10) || text;
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
