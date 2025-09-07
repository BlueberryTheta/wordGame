# Word of the Day – Q&A Guessing Game

A small web game where players ask up to 10 questions and make up to 3 guesses to identify the secret word of the day. If a guess shares any letters with the word, those letters are revealed in their correct positions.

- Daily word is generated at 00:01 local time.
- Questions are answered by ChatGPT in the backend (if configured).
- Client-side enforces limits per day using `localStorage`.

## Requirements

- Node.js 18+ (ESM, fetch, and top-level `await` support)
- An OpenAI API key (optional; the game works with a basic fallback if not supplied)

## Setup

1. Install dependencies:
   - Run `npm install`
2. Configure environment:
   - Copy `.env.example` to `.env`
   - Set `OPENAI_API_KEY` to your key
   - Optionally set `OPENAI_MODEL` (default: `gpt-4o-mini`) and `PORT`
3. Start the server:
   - `npm start`
4. Open the app:
   - Visit `http://localhost:3000`

## How It Works

- Backend (`server.js`):
  - Serves static frontend from `public/`.
  - On startup, ensures today’s word exists, persisting in `data/state.json`.
  - Schedules the next roll at 00:01 local time.
  - `/api/state`: returns day key and the word length only.
  - `/api/question`: sends your question to ChatGPT with guardrails (or uses a basic fallback if no API key).
  - `/api/guess`: returns whether the guess is correct and reveals any shared letters in their positions.

- Frontend (`public/`):
  - Tracks your daily progress in `localStorage` keyed by the day.
  - Enforces 10 questions and 3 guesses per day per browser.
  - Displays masked letters, Q&A history, and remaining counts.

## Game Rules (implemented)

- Ask up to 10 questions about the word.
- Make up to 3 guesses.
- On an incorrect guess, any letters shared with the secret word are revealed at their correct positions.
- On a correct guess, the word is revealed and the game ends for the day.

## Notes on ChatGPT Integration

- The backend uses the official `openai` Node SDK. Configure `OPENAI_API_KEY` in `.env`.
- Answers are guided to avoid revealing the word directly and are post-filtered to redact accidental disclosure.
- If no API key is set, a lightweight rule-based responder handles questions.

## Project Structure

- `server.js` – Express server
- `src/openai.js` – OpenAI helpers (word generation and Q&A)
- `src/wordManager.js` – Daily word persistence and scheduler
- `public/` – Frontend (HTML/CSS/JS)
- `data/state.json` – Persisted daily word (gitignored)

## Customization

- Adjust question/guess limits in `public/app.js` (`LIMITS`).
- Tweak reveal behavior in `/api/guess` (currently reveals letters-in-common at their correct positions).
- Modify prompts and safety rules in `src/openai.js`.

## Troubleshooting

- If startup fails with “Word for today not initialized”, ensure your environment allows writing to `data/` and try again.
- If API requests fail, the app falls back to basic answers; check `.env` and network access.

## License

- For your personal use; no license file included. Add one if you plan to share.
