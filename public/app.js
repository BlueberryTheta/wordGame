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
  // Dev tools
  devToggle: document.getElementById('devToggle'),
  devPanel: document.getElementById('devPanel'),
  devToken: document.getElementById('devToken'),
  devSalt: document.getElementById('devSalt'),
  devRollBtn: document.getElementById('devRollBtn'),
  devRollMsg: document.getElementById('devRollMsg'),
};

const LIMITS = { questions: 7, guesses: 2 };
const MAX_QUESTION_LEN = 100;

function storageKey(day) { return `wotd:${day}`; }

function loadState(day, len, version) {
  const raw = localStorage.getItem(storageKey(day));
  if (raw) {
    try {
      const s = JSON.parse(raw);
      // Reset if length or version changed (e.g., dev roll same day)
      if (s.wordLength !== len) throw new Error('length changed');
      if (version && s.wordVersion && s.wordVersion !== version) throw new Error('version changed');
      return s;
    } catch {}
  }
  const state = {
    dayKey: day,
    wordLength: len,
    wordVersion: version || null,
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
  console.log('[CLIENT STATE]', s);
  const st = loadState(s.dayKey, s.wordLength, s.wordVersion);
  render(st);

  els.askBtn.addEventListener('click', () => ask(st));
  els.qInput.addEventListener('keydown', e => { if (e.key === 'Enter') ask(st); });
  els.guessBtn.addEventListener('click', () => guess(st));
  els.gInput.addEventListener('keydown', e => { if (e.key === 'Enter') guess(st); });
  // Dev panel auto open via ?dev=1
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('dev') === '1') {
      ensureDevUI();
      bindDevHandlers(true);
      showDev(true);
    } else {
      bindDevHandlers(false);
    }
  } catch { bindDevHandlers(false); }
  // Theme setup
  setupTheme();
}

async function ask(state) {
  const q = (els.qInput.value || '').trim();
  if (!q) return;
  if (q.length > MAX_QUESTION_LEN) {
    alert(`Question too long (max ${MAX_QUESTION_LEN} characters).`);
    return;
  }
  if (state.questionsLeft <= 0) return;
  els.askBtn.disabled = true;
  try {
    const resp = await fetch('/api/question', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q })
    });
    const data = await resp.json();
    console.log('[CLIENT Q]', { q, respOk: resp.ok, data });
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
    console.log('[CLIENT GUESS]', { g, respOk: resp.ok, data });
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
    if (state.guessesLeft <= 0) {
      state.gameOver = true;
      saveState(state);
      try {
        const r = await fetch('/api/reveal');
        const j = await r.json();
        const w = (j && j.word) ? String(j.word).toUpperCase() : '';
        const msg = w ? `Nice try! The word was ${w}. Come back tomorrow for a new word.` : 'Nice try! Come back tomorrow for a new word.';
        openGameOver('Out of guesses', msg);
      } catch {
        openGameOver('Out of guesses', 'Nice try! Come back tomorrow for a new word.');
      }
    }
  } catch (e) {
    const msg = (e && e.message) ? String(e.message).toLowerCase() : '';
    if (msg.includes('not a word')) {
      els.guessResult.innerHTML = '<span class="bad">Not a word.</span>';
    } else {
      alert('Failed to guess: ' + (e?.message || ''));
    }
  } finally {
    els.guessBtn.disabled = state.guessesLeft <= 0;
  }
}

init();

// Theme handling
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light') root.classList.add('theme-light');
  else root.classList.remove('theme-light');
  try { localStorage.setItem('theme', theme); } catch {}
  if (els.themeToggle) {
    const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    els.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
    els.themeToggle.setAttribute('aria-label', label);
    els.themeToggle.setAttribute('title', label);
  }
}
function setupTheme() {
  let theme = 'dark';
  try {
    theme = localStorage.getItem('theme') || theme;
    if (!localStorage.getItem('theme')) {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
    }
  } catch {}
  applyTheme(theme);
  els.themeToggle = document.getElementById('themeToggle');
  els.themeToggle?.addEventListener('click', () => {
    const next = (localStorage.getItem('theme') || 'dark') === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });
}

function showTutorial() {
  if (!els.tutorialBackdrop) return;
  // Avoid reopening if already visible
  if (!els.tutorialBackdrop.classList.contains('hidden')) return;
  els.tutorialBackdrop.classList.remove('hidden');
  document.addEventListener('keydown', onEscHideTutorial);
  // Mark tutorial as seen so we don't auto-open next visits
  try { localStorage.setItem('tutorialSeen', '1'); } catch {}
}

function hideTutorial() {
  if (!els.tutorialBackdrop) return;
  els.tutorialBackdrop.classList.add('hidden');
  document.removeEventListener('keydown', onEscHideTutorial);
  try { localStorage.setItem('tutorialSeen', '1'); } catch {}
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

// Auto-open tutorial on first visit
function maybeShowTutorialOnFirstVisit() {
  try {
    const seen = localStorage.getItem('tutorialSeen');
    if (!seen) {
      // Small delay so layout settles
      setTimeout(showTutorial, 200);
    }
  } catch {
    // If storage blocked, still try to show once
    setTimeout(showTutorial, 200);
  }
}
// Run immediately so it works even if init() fails
maybeShowTutorialOnFirstVisit();

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
  questions.setAttribute('role','img'); questions.setAttribute('aria-label', `Questions asked: ${qUsed} of 7`);
  for (let i = 0; i < 7; i++) {
    const c = document.createElement('div'); c.className = 'cell' + (i < qUsed ? ' filled' : ''); questions.appendChild(c);
  }
  frag.appendChild(guesses);
  frag.appendChild(questions);
  return frag;
}

async function shareScore({ gUsed, qUsed }) {
  const text = `Inqaily — I won!\nGuesses: ${gUsed}/2\nQuestions: ${qUsed}/7\n#Inqaily`;
  const shareData = { text, title: 'Inqaily' };
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
// Dev tools logic
function showDev(open) {
  if (!els.devPanel || !els.devToggle) return;
  if (open) {
    els.devPanel.classList.remove('hidden');
    els.devPanel.setAttribute('aria-hidden', 'false');
    els.devToggle.setAttribute('aria-expanded', 'true');
  } else {
    els.devPanel.classList.add('hidden');
    els.devPanel.setAttribute('aria-hidden', 'true');
    els.devToggle.setAttribute('aria-expanded', 'false');
  }
}
function ensureDevUI() {
  if (!document.getElementById('devToggle')) {
    const actions = document.querySelector('.titlebar .title-actions') || document.querySelector('.titlebar');
    if (actions) {
      const btn = document.createElement('button');
      btn.id = 'devToggle'; btn.className = 'dev-toggle'; btn.type = 'button'; btn.textContent = 'Dev';
      btn.setAttribute('title','Developer tools'); btn.setAttribute('aria-expanded','false');
      actions.appendChild(btn);
    }
  }
  if (!document.getElementById('devPanel')) {
    const panel = document.createElement('div');
    panel.id = 'devPanel'; panel.className = 'dev-tools hidden'; panel.setAttribute('aria-hidden','true');
    panel.innerHTML = `
      <div class="dev-inner">
        <div class="dev-row">
          <label for="devToken">Admin Token</label>
          <input id="devToken" type="password" placeholder="Enter ADMIN_TOKEN" />
        </div>
        <div class="dev-row">
          <label for="devSalt">Salt</label>
          <input id="devSalt" type="text" placeholder="optional e.g. test1" />
        </div>
        <div class="dev-actions">
          <button id="devRollBtn" class="share-btn">Roll Now</button>
          <span id="devRollMsg" class="dev-msg"></span>
        </div>
      </div>`;
    document.body.appendChild(panel);
  }
  els.devToggle = document.getElementById('devToggle');
  els.devPanel = document.getElementById('devPanel');
  els.devToken = document.getElementById('devToken');
  els.devSalt = document.getElementById('devSalt');
  els.devRollBtn = document.getElementById('devRollBtn');
  els.devRollMsg = document.getElementById('devRollMsg');
}

function bindDevHandlers() {
  ensureDevUI();
  if (els.devToggle && !els.devToggle.dataset.bound) {
    els.devToggle.addEventListener('click', () => {
      const hidden = els.devPanel?.classList.contains('hidden');
      showDev(hidden);
    });
    els.devToggle.dataset.bound = '1';
  }
  if (els.devRollBtn && !els.devRollBtn.dataset.bound) {
    els.devRollBtn.addEventListener('click', onDevRoll);
    els.devRollBtn.dataset.bound = '1';
  }
}

async function onDevRoll() {
  const token = (els.devToken?.value || localStorage.getItem('adminToken') || '').trim();
  const salt = (els.devSalt?.value || '').trim() || String(Date.now());
  if (els.devToken && token) localStorage.setItem('adminToken', token);
  els.devRollMsg.textContent = 'Rolling...';
  try {
    const url = `/api/roll?token=${encodeURIComponent(token)}&salt=${encodeURIComponent(salt)}`;
    let r = await fetch(url);
    if (r.status === 404) {
      r = await fetch(`/api/admin/roll?token=${encodeURIComponent(token)}&salt=${encodeURIComponent(salt)}`, { method: 'POST' });
    }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Failed');
  els.devRollMsg.textContent = `Rolled: ${String(j.word || '').toUpperCase()}`;
  // Clear local progress for this day so questions/guesses reset
  try {
    const day = j.dayKey || els.dayKey?.textContent || '';
    if (day) localStorage.removeItem(storageKey(day));
  } catch {}
  setTimeout(() => location.reload(), 600);
  } catch (e) {
    els.devRollMsg.textContent = `Error: ${e?.message || 'failed'}`;
  }
}
