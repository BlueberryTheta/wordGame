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

function minimalFallback(secretWord, question) {
  const q = String(question || '').toLowerCase();
  const vowels = new Set(['a','e','i','o','u']);
  if (q.includes('length') || q.includes('long')) return `${secretWord.length} letters.`;
  if (q.includes('vowel')) return [...secretWord].some(ch => vowels.has(ch)) ? 'Yes.' : 'No.';
  if (q.includes('first letter')) return "Can't say.";
  if (q.startsWith('is ') || q.startsWith('are ') || q.startsWith('does ') || q.startsWith('do ')) return "Can't say.";
  return "Can't say.";
}

export async function generateWord() {
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
- Output exactly one lowercase word, no quotes, no punctuation, no explanation.
- 4-9 letters, common noun or adjective, family-friendly.
- Avoid proper nouns, brands, slurs, or sensitive content.`;

  let word = '';
  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: 'Pick today\'s word.' }
      ],
      temperature: 0.9,
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
  // If no API, provide a minimal rule-based engine with terse answers
  if (!client) {
    const q = question.toLowerCase();
    const vowels = new Set(['a','e','i','o','u']);
    if (q.includes('vowel')) return [...secretWord].some(ch => vowels.has(ch)) ? 'Yes.' : 'No.';
    if (q.includes('length') || q.includes('long')) return `${secretWord.length} letters.`;
    if (q.includes('first letter')) return "Can't say.";
    if (q.startsWith('is ') || q.startsWith('are ') || q.startsWith('does ') || q.startsWith('do ')) return "Can't say.";
    return 'Try a yes/no question.';
  }

  const guard = `You know a secret word. Never reveal it or any exact letters.
Answer the user's question in a single short sentence of at most 10 words.
No extra information, no explanations, no warnings, no emojis.
Prefer yes/no when applicable. If answering would reveal letters or the word, reply exactly: Can't say.`;

  try {
    const resp = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: 'system', content: guard },
        { role: 'user', content: `Secret word: ${secretWord}` },
        { role: 'user', content: question }
      ],
      temperature: 0.2,
      max_tokens: 40
    });

    let text = resp.choices?.[0]?.message?.content?.trim() || '';
    // Last-resort redaction in case the model slips
    if (text.toLowerCase().includes(secretWord.toLowerCase())) {
      const re = new RegExp(secretWord, 'ig');
      text = text.replace(re, "Can't say.");
    }
    return concise(text, 10);
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
