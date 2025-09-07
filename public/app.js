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
  // Render tiles
  els.maskedWord.innerHTML = '';
  state.revealed.forEach(ch => {
    const s = document.createElement('span');
    s.className = 'tile' + (ch ? '' : ' empty');
    s.textContent = ch ? ch.toUpperCase() : '·';
    els.maskedWord.appendChild(s);
  });
  els.qaLog.innerHTML = '';
  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item';
    const q = document.createElement('div'); q.className = 'q'; q.textContent = `Q: ${item.q}`;
    const a = document.createElement('div'); a.className = 'a'; a.textContent = `A: ${item.a}`;
    div.appendChild(q); div.appendChild(a);
    els.qaLog.appendChild(div);
  });
  els.askBtn.disabled = state.questionsLeft <= 0 || state.guessesLeft <= 0;
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
      try { animateTileReveal([...Array(state.revealed.length).keys()]); } catch {}
      try { startConfetti(); } catch {}
      return;
    }

    // Merge revealed mask and collect newly revealed
    const mask = data.revealedMask || [];
    const prev = state.revealed.slice();
    const newly = [];
    for (let i = 0; i < state.revealed.length && i < mask.length; i++) {
      if (!state.revealed[i] && mask[i]) { state.revealed[i] = mask[i]; if (!prev[i]) newly.push(i); }
    }
    state.guessesLeft -= 1;
    saveState(state);
    render(state);
    if (typeof newly !== 'undefined' && newly.length) { try { animateTileReveal(newly); } catch {} }
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

// Game Over modal utilities + observers (non-invasive)
function openGameOver(title, message) {
  const backdrop = document.getElementById('gameOverBackdrop');
  if (!backdrop) return;
  const t = document.getElementById('gameOverTitle');
  const m = document.getElementById('gameOverMessage');
  if (t && title) t.textContent = title;
  if (m && message) m.textContent = message;
  // Build score if win
  try {
    const qLeft = parseInt((els.qLeft?.textContent || '0').trim(), 10);
    const gLeft = parseInt((els.gLeft?.textContent || '0').trim(), 10);
    const qUsed = isNaN(qLeft) ? null : (10 - qLeft);
    const gUsed = isNaN(gLeft) ? null : (2 - gLeft);
    const scoreWrap = document.getElementById('gameOverScore');
    const actions = document.getElementById('gameOverActions');
    if (scoreWrap) {
      scoreWrap.innerHTML = '';
      if (gUsed != null && qUsed != null && t?.textContent?.toLowerCase().includes('got')) {
        scoreWrap.classList.remove('hidden');
        actions?.classList.remove('hidden');
        scoreWrap.appendChild(renderScore(gUsed, qUsed));
        const shareBtn = document.getElementById('shareScoreBtn');
        if (shareBtn) { shareBtn.onclick = () => shareScore({ gUsed, qUsed }); }
      } else {
        scoreWrap.classList.add('hidden');
        actions?.classList.add('hidden');
      }
    }
  } catch {}
  backdrop.classList.remove('hidden');
  document.addEventListener('keydown', onEscHideGameOver);
  // Disable inputs when game is over
  if (els.askBtn) els.askBtn.disabled = true;
  if (els.guessBtn) els.guessBtn.disabled = true;
}
function hideGameOver() {
  const backdrop = document.getElementById('gameOverBackdrop');
  if (!backdrop) return;
  backdrop.classList.add('hidden');
  document.removeEventListener('keydown', onEscHideGameOver);
}
function onEscHideGameOver(e) { if (e.key === 'Escape') hideGameOver(); }
(function setupGameOverModal() {
  const b = document.getElementById('gameOverBackdrop');
  const x = document.getElementById('closeGameOver');
  x?.addEventListener('click', hideGameOver);
  b?.addEventListener('click', (e) => { if (e.target === b) hideGameOver(); });
})();

(function setupGameOverObservers() {
  let shown = false;
  const resEl = document.getElementById('guessResult') || els.guessResult;
  const gLeftEl = document.getElementById('gLeft') || els.gLeft;
  if (resEl) {
    new MutationObserver(() => {
      if (shown) return;
      const txt = resEl.textContent || '';
      if (/Correct!/i.test(txt)) {
        shown = true; openGameOver('You got it!', 'Great job! Come back tomorrow for a new word.');
      }
    }).observe(resEl, { childList: true, subtree: true, characterData: true });
  }
  if (gLeftEl) {
    new MutationObserver(() => {
      if (shown) return;
      const left = parseInt((gLeftEl.textContent || '').trim(), 10);
      if (!isNaN(left) && left <= 0) {
        shown = true; openGameOver('Out of guesses', 'Nice try! Come back tomorrow for a new word.');
      }
    }).observe(gLeftEl, { childList: true, characterData: true, subtree: true });
  }
})();

function renderScore(gUsed, qUsed) {
  const frag = document.createDocumentFragment();
  const guesses = document.createElement('div'); guesses.className = 'row guesses';
  guesses.setAttribute('role','img'); guesses.setAttribute('aria-label', `Guesses used: ${gUsed} of 2`);
  for (let i = 0; i < 2; i++) {
    const c = document.createElement('div'); c.className = 'cell' + (i < gUsed ? ' filled' : ''); guesses.appendChild(c);
  }
  const questions = document.createElement('div'); questions.className = 'row questions';
  questions.setAttribute('role','img'); questions.setAttribute('aria-label', `Questions asked: ${qUsed} of 10`);
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('div'); c.className = 'cell' + (i < qUsed ? ' filled' : ''); questions.appendChild(c);
  }
  frag.appendChild(guesses);
  frag.appendChild(questions);
  return frag;
}

async function shareScore({ gUsed, qUsed }) {
  const text = `Word of the Day — I won!\nGuesses: ${gUsed}/2\nQuestions: ${qUsed}/10\n#WordGame`;
  const shareData = { text, title: 'Word of the Day' };
  try { if (navigator.share) { await navigator.share(shareData); return; } } catch {}
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('shareScoreBtn'); if (btn) { const prev = btn.textContent; btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent=prev, 1500); }
  } catch {}
}

function animateTileReveal(indices) {
  const tiles = els.maskedWord?.querySelectorAll('.tile');
  if (!tiles) return;
  indices.forEach(i => {
    const t = tiles[i];
    if (!t) return;
    t.classList.add('reveal');
    t.addEventListener('animationend', () => t.classList.remove('reveal'), { once: true });
  });
}

function startConfetti(duration = 1500, count = 140) {
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2000 });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  function resize() { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; }
  resize();
  const colors = ['#78d9ff', '#6dd16a', '#e9ecf1', '#a7b0c3', '#ff6b6b'];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.5,
    w: 6 + Math.random() * 6,
    h: 10 + Math.random() * 10,
    vx: (-0.5 + Math.random()) * 1.2 * dpr,
    vy: (1 + Math.random() * 2.5) * dpr,
    rot: Math.random() * Math.PI,
    vr: (-0.5 + Math.random()) * 0.2,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));
  const start = performance.now();
  let raf;
  function tick(t) {
    const elapsed = t - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    if (elapsed < duration) raf = requestAnimationFrame(tick); else cleanup();
  }
  function cleanup() { cancelAnimationFrame(raf); canvas.remove(); }
  window.addEventListener('resize', resize, { once: true });
  raf = requestAnimationFrame(tick);
}
