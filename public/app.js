const els = {
  dayKey: document.getElementById('dayKey'),
  wordLength: document.getElementById('wordLength'),
  maskedWord: document.getElementById('maskedWord'),
  qLeft: document.getElementById('qLeft'),
  gLeft: document.getElementById('gLeft'),
  qInput: document.getElementById('qInput'),
  askBtn: document.getElementById('askBtn'),
  qaLog: document.getElementById('qaLog'),
  gInput: document.getElementById('gInput'),
  guessBtn: document.getElementById('guessBtn'),
  guessResult: document.getElementById('guessResult'),
  helpBtn: document.getElementById('helpBtn'),
  tutorialBackdrop: document.getElementById('tutorialBackdrop'),
  closeTutorial: document.getElementById('closeTutorial'),
};

const LIMITS = { questions: 10, guesses: 2 };

function storageKey(day) { return `wotd:${day}`; }

function loadState(day, len) {
  const raw = localStorage.getItem(storageKey(day));
  if (raw) {
    try {
      const s = JSON.parse(raw);
      // If word length changed (unlikely), reset
      if (s.wordLength !== len) throw new Error('length changed');
      return s;
    } catch {}
  }
  const state = {
    dayKey: day,
    wordLength: len,
    revealed: Array(len).fill(null),
    questionsLeft: LIMITS.questions,
    guessesLeft: LIMITS.guesses,
    history: [] // array of { q, a }
  };
  saveState(state);
  return state;
}

function saveState(state) {
  localStorage.setItem(storageKey(state.dayKey), JSON.stringify(state));
}

function render(state) {
  els.dayKey.textContent = state.dayKey;
  els.wordLength.textContent = state.wordLength;
  els.qLeft.textContent = state.questionsLeft;
  els.gLeft.textContent = state.guessesLeft;
  els.maskedWord.textContent = state.revealed.map(ch => ch ? ch.toUpperCase() : '_').join(' ');
  els.qaLog.innerHTML = '';
  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item';
    const q = document.createElement('div'); q.className = 'q'; q.textContent = `Q: ${item.q}`;
    const a = document.createElement('div'); a.className = 'a'; a.textContent = `A: ${item.a}`;
    div.appendChild(q); div.appendChild(a);
    els.qaLog.appendChild(div);
  });
  els.askBtn.disabled = state.questionsLeft <= 0;
  els.guessBtn.disabled = state.guessesLeft <= 0;
}

async function init() {
  const resp = await fetch('/api/state');
  if (!resp.ok) {
    els.maskedWord.textContent = 'Failed to load game state.';
    return;
  }
  const s = await resp.json();
  const st = loadState(s.dayKey, s.wordLength);
  render(st);

  els.askBtn.addEventListener('click', () => ask(st));
  els.qInput.addEventListener('keydown', e => { if (e.key === 'Enter') ask(st); });
  els.guessBtn.addEventListener('click', () => guess(st));
  els.gInput.addEventListener('keydown', e => { if (e.key === 'Enter') guess(st); });
}

async function ask(state) {
  const q = (els.qInput.value || '').trim();
  if (!q) return;
  if (state.questionsLeft <= 0) return;
  els.askBtn.disabled = true;
  try {
    const resp = await fetch('/api/question', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Request failed');
    state.history.push({ q, a: data.answer });
    state.questionsLeft -= 1;
    saveState(state);
    els.qInput.value = '';
    render(state);
  } catch (e) {
    alert('Failed to ask: ' + e.message);
  } finally {
    els.askBtn.disabled = state.questionsLeft <= 0;
  }
}

async function guess(state) {
  const g = (els.gInput.value || '').trim();
  if (!g) return;
  if (state.guessesLeft <= 0) return;
  els.guessBtn.disabled = true;
  els.guessResult.textContent = '';
  try {
    const resp = await fetch('/api/guess', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess: g })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Request failed');

    if (data.correct) {
      els.guessResult.innerHTML = `<span class="ok">Correct! The word was ${data.word.toUpperCase()}.</span>`;
      // Reveal fully
      state.revealed = data.word.split('');
      state.guessesLeft -= 1;
      saveState(state);
      render(state);
      return;
    }

    // Merge revealed mask
    const mask = data.revealedMask || [];
    for (let i = 0; i < state.revealed.length && i < mask.length; i++) {
      if (!state.revealed[i] && mask[i]) state.revealed[i] = mask[i];
    }
    state.guessesLeft -= 1;
    saveState(state);
    render(state);
    const letters = (data.lettersInCommon || []).map(x => x.toUpperCase()).join(', ');
    els.guessResult.innerHTML = letters
      ? `<span>Letters in common revealed: <b>${letters}</b></span>`
      : `<span class="bad">No letters in common.</span>`;
    els.gInput.value = '';
  } catch (e) {
    alert('Failed to guess: ' + e.message);
  } finally {
    els.guessBtn.disabled = state.guessesLeft <= 0;
  }
}

init();

function showTutorial() {
  if (!els.tutorialBackdrop) return;
  els.tutorialBackdrop.classList.remove('hidden');
  document.addEventListener('keydown', onEscHideTutorial);
}

function hideTutorial() {
  if (!els.tutorialBackdrop) return;
  els.tutorialBackdrop.classList.add('hidden');
  document.removeEventListener('keydown', onEscHideTutorial);
}

function onEscHideTutorial(e) {
  if (e.key === 'Escape') hideTutorial();
}

function setupTutorialListeners() {
  els.helpBtn?.addEventListener('click', showTutorial);
  els.closeTutorial?.addEventListener('click', hideTutorial);
  els.tutorialBackdrop?.addEventListener('click', (e) => {
    if (e.target === els.tutorialBackdrop) hideTutorial();
  });
  // Safety: event delegation in case button listener didn't bind
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.id === 'closeTutorial') hideTutorial();
  });
}

// Wire tutorial listeners immediately so close works even if init fails
setupTutorialListeners();

// Also handle Esc globally (defensive) and expose helpers for inline handlers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.tutorialBackdrop && !els.tutorialBackdrop.classList.contains('hidden')) {
    hideTutorial();
  }
});
window.closeTutorialModal = hideTutorial;
window.openTutorialModal = showTutorial;
