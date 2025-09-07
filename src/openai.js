import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
let client = null;
if (apiKey) {
  client = new OpenAI({ apiKey });
}

const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

  const resp = await client.chat.completions.create({
    model: defaultModel,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: 'Pick today\'s word.' }
    ],
    temperature: 0.9,
    max_tokens: 5
  });

  let word = resp.choices?.[0]?.message?.content?.trim()?.toLowerCase() || '';
  word = word.replace(/[^a-z]/g, '');
  if (!word || word.length < 4 || word.length > 9) {
    // Fallback if model fails constraints
    const choice = fallback[Math.floor(Math.random() * fallback.length)];
    return choice;
  }
  return word;
}

export async function answerQuestion(secretWord, question) {
  // If no API, provide a basic rule-based hinting engine:
  if (!client) {
    const q = question.toLowerCase();
    let answer = 'I can\'t answer that.';
    const vowels = new Set(['a','e','i','o','u']);
    if (q.includes('letter') && q.includes('vowel')) {
      const hasVowel = [...secretWord].some(ch => vowels.has(ch));
      answer = hasVowel ? 'Yes, it has vowels.' : 'No, it has no vowels.';
    } else if (q.includes('length') || q.includes('long')) {
      answer = `It has ${secretWord.length} letters.`;
    } else if (q.startsWith('is it a') || q.startsWith('is it an')) {
      answer = 'I can\'t reveal its category, but keep guessing!';
    } else if (q.includes('color') || q.includes('colour')) {
      answer = 'Color is not a reliable clue here.';
    } else if (q.includes('first letter')) {
      answer = 'I won\'t reveal the first letter.';
    } else {
      answer = 'Try yes/no-style questions about properties, not the word itself.';
    }
    return answer;
  }

  const guard = `You know a secret word. Never reveal it or any exact letters.
Answer user questions as helpful short hints (max 25 words), preferably yes/no + brief rationale.
Do not output the secret word or its exact spelling. If asked directly, refuse politely.`;

  const resp = await client.chat.completions.create({
    model: defaultModel,
    messages: [
      { role: 'system', content: guard },
      { role: 'user', content: `Secret word: ${secretWord}` },
      { role: 'user', content: question }
    ],
    temperature: 0.4,
    max_tokens: 120
  });

  let text = resp.choices?.[0]?.message?.content?.trim() || '';
  // Last-resort redaction in case the model slips
  if (text.toLowerCase().includes(secretWord.toLowerCase())) {
    const re = new RegExp(secretWord, 'ig');
    text = text.replace(re, '[redacted]');
  }
  return text;
}

