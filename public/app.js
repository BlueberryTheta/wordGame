const els = {
  dayKey: document.getElementById('dayKey'),
  wordLength: document.getElementById('wordLength'),
  maskedWord: document.getElementById('maskedWord'),
  qLeft: document.getElementById('qLeft'),
  gLeft: document.getElementById('gLeft'),
  streak: document.getElementById('streak'),
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
const STREAK_KEY = 'wotd:streak';

// ---- Streak helpers ----
function readStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeStreak(obj) {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(obj)); } catch {}
}
function fmtDay(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function prevDay(dayKeyStr) {
  const [y, m, d] = dayKeyStr.split('-').map(n => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m - 1), d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return fmtDay(dt);
}
function markPlayed(todayKey) {
  const rec = readStreak();
  if (!rec) { writeStreak({ lastDay: todayKey, count: 1 }); return; }
  if (rec.lastDay === todayKey) return; // already counted today
  if (rec.lastDay === prevDay(todayKey)) {
    writeStreak({ lastDay: todayKey, count: (parseInt(rec.count, 10) || 0) + 1 });
  } else {
    writeStreak({ lastDay: todayKey, count: 1 }); // reset after gap
  }
}
function getCurrentStreak(todayKey) {
  const rec = readStreak();
  if (!rec) return 0;
  if (rec.lastDay === todayKey) return parseInt(rec.count, 10) || 0;
  if (rec.lastDay === prevDay(todayKey)) return parseInt(rec.count, 10) || 0;
  return 0;
}

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
  // Pretty-format the date for display while preserving the raw key for logic
  try { els.dayKey.dataset.key = state.dayKey; } catch {}
  els.dayKey.textContent = formatDayCool(state.dayKey);
  els.wordLength.textContent = state.wordLength;
  els.qLeft.textContent = state.questionsLeft;
  els.gLeft.textContent = state.guessesLeft;
  if (els.streak) { els.streak.textContent = String(getCurrentStreak(state.dayKey)); try { applyStreakHeat(els.streak, getCurrentStreak(state.dayKey)); } catch {} }
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

let VAULT_LOCKED = false;

function getDayParam() {
  try { const u = new URL(location.href); return u.searchParams.get('day'); } catch { return null; }
}

function isCompletedLocal(day) {
  if (!day) return false;
  try {
    const raw = localStorage.getItem(storageKey(day));
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s) return false;
    if (s.gameOver) return true;
    if (typeof s.guessesLeft === 'number' && s.guessesLeft <= 0) return true;
    if (Array.isArray(s.revealed) && s.revealed.length && s.revealed.every(Boolean)) return true;
    return false;
  } catch { return false; }
}

async function init() {
  const dayParam = getDayParam();
  const resp = await fetch('/api/state' + (dayParam ? (`?day=${encodeURIComponent(dayParam)}`) : ''));
  if (!resp.ok) {
    els.maskedWord.textContent = 'Failed to load game state.';
    return;
  }
  const s = await resp.json();
  console.log('[CLIENT STATE]', s);
  try { window.__TODAY_KEY__ = s.todayKey || s.dayKey; } catch {}
  const st = loadState(s.dayKey, s.wordLength, s.wordVersion);
  render(st);
  // Toggle Today link in menu when viewing a vault day (hide if already today's date)
  try {
    const todayLink = document.getElementById('menuToday');
    if (todayLink) {
      const todayKey = s.todayKey || s.dayKey; // fallback
      const isPastDay = (s.dayKey && todayKey) ? (s.dayKey !== todayKey) : false;
      if (isPastDay) todayLink.classList.remove('hidden');
      else todayLink.classList.add('hidden');
    }
  } catch {}
  // Hide streak UI when viewing a past day (vault mode)
  try {
    const todayKey = s.todayKey || s.dayKey;
    const isPastDay = (s.dayKey && todayKey) ? (s.dayKey !== todayKey) : false;
    const streakRow = document.querySelector('.streak-row');
    if (streakRow) streakRow.classList.toggle('hidden', !!isPastDay);
    const goStreak = document.getElementById('gameOverStreak');
    if (goStreak) goStreak.classList.toggle('hidden', !!isPastDay);
  } catch {}
  // Vault lock: if playing a past day already completed, disable play and reveal
  if (dayParam && isCompletedLocal(dayParam)) {
    VAULT_LOCKED = true;
    try {
      let url2 = '/api/reveal';
      url2 += `?day=${encodeURIComponent(dayParam)}`;
      const r = await fetch(url2);
      const j = await r.json();
      if (j && j.word) {
        st.revealed = String(j.word).split('');
        saveState(st);
        render(st);
        if (els.askBtn) els.askBtn.disabled = true;
        if (els.guessBtn) els.guessBtn.disabled = true;
        if (els.qInput) els.qInput.disabled = true;
        if (els.gInput) els.gInput.disabled = true;
        if (els.guessResult) els.guessResult.innerHTML = `<span class="ok">Already completed. The word was <b>${String(j.word).toUpperCase()}</b>.</span>`;
      }
    } catch {}
  }

    // Daily mode: persist Game Over modal on refresh
  try {
    const dayParam = getDayParam();
    const todayKey = s.todayKey || s.dayKey;
    const isDaily = !dayParam || dayParam === todayKey;
    const allRevealed = Array.isArray(st.revealed) && st.revealed.length && st.revealed.every(Boolean);
    const outOfGuesses = typeof st.guessesLeft === 'number' && st.guessesLeft <= 0;
    if (isDaily && (st.gameOver || outOfGuesses || allRevealed)) {
      let msg = getGameOverCopy(allRevealed);
      try {
        const r = await fetch('/api/reveal');
        const j = await r.json();
        const w = (j && j.word) ? String(j.word).toUpperCase() : '';
        if (w) msg = `${msg} The word was ${w}.`;
      } catch {}
      openGameOver(allRevealed ? 'You got it!' : 'Out of guesses', msg);
    }
  } catch {}
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
  setupStreakInfo();
  setupMenu();
}

function formatDayCool(key) {
  try {
    const [y, m, d] = String(key).split('-').map(n => parseInt(n, 10));
    if (!y || !m || !d) return String(key);
    // Important: use UTC noon to avoid previous-day rollover when
    // formatting in ET (UTC-5/UTC-4), which would happen at 00:00Z.
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).formatToParts(dt);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    // Example: Sat · Sep 20
    return `${map.weekday || ''} · ${map.month || ''} ${map.day || ''}`.trim();
  } catch { return String(key); }
}

async function ask(state) {
  if (VAULT_LOCKED) { return; }
  const q = (els.qInput.value || '').trim();
  if (!q) return;
  if (q.length > MAX_QUESTION_LEN) {
    alert(`Question too long (max ${MAX_QUESTION_LEN} characters).`);
    return;
  }
  if (state.questionsLeft <= 0) return;
  els.askBtn.disabled = true;
  try {
    let url = '/api/question';
    try { const u = new URL(location.href); const d = u.searchParams.get('day'); if (d) url = url + '?day=' + encodeURIComponent(d); } catch {}
    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, day: (new URL(location.href)).searchParams.get('day') || undefined })
    });
    const data = await resp.json();
    console.log('[CLIENT Q]', { q, respOk: resp.ok, data });
    if (!resp.ok) throw new Error(data.error || 'Request failed');
    state.history.push({ q, a: data.answer });
    state.questionsLeft -= 1;
    saveState(state);
    els.qInput.value = '';
    // Count streak only for today's game (not vault/past days)
    try { if (window.__TODAY_KEY__ && state.dayKey === window.__TODAY_KEY__) markPlayed(state.dayKey); } catch {}
    render(state);
  } catch (e) {
    alert('Failed to ask: ' + e.message);
  } finally {
    els.askBtn.disabled = state.questionsLeft <= 0;
  }
}

async function guess(state) {
  if (VAULT_LOCKED) { return; }
  const g = (els.gInput.value || '').trim();
  if (!g) return;
  if (state.guessesLeft <= 0) return;
  els.guessBtn.disabled = true;
  els.guessResult.textContent = '';
  try {
    let url = '/api/guess';
    try { const u = new URL(location.href); const d = u.searchParams.get('day'); if (d) url = url + '?day=' + encodeURIComponent(d); } catch {}
    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess: g, day: (new URL(location.href)).searchParams.get('day') || undefined })
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
      try { if (window.__TODAY_KEY__ && state.dayKey === window.__TODAY_KEY__) markPlayed(state.dayKey); } catch {}
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
    try { if (window.__TODAY_KEY__ && state.dayKey === window.__TODAY_KEY__) markPlayed(state.dayKey); } catch {}
    render(state);
    if (typeof newly !== 'undefined' && newly.length) { try { animateTileSlam(newly); } catch {} }
    const letters = (data.lettersInCommon || []).map(x => x.toUpperCase()).join(', ');
    // Show the guessed word along with letters in common
    if (letters) {
      els.guessResult.innerHTML = `<span>Guess: <b>${g.toUpperCase()}</b> — Letters in common: <b>${letters}</b></span>`;
    } else {
      els.guessResult.innerHTML = `<span>Guess: <b>${g.toUpperCase()}</b> — <span class="bad">No letters in common.</span></span>`;
    }
    // Keep the incorrect guess in the input so it remains visible
    if (state.guessesLeft <= 0) {
      state.gameOver = true;
      saveState(state);
      try {
        let url2 = '/api/reveal';
        try { const u = new URL(location.href); const d = u.searchParams.get('day'); if (d) url2 = url2 + '?day=' + encodeURIComponent(d); } catch {}
        const r = await fetch(url2);
        const j = await r.json();
        const w = (j && j.word) ? String(j.word).toUpperCase() : '';
        const base = getGameOverCopy(false);
        const msg = w ? `${base} The word was ${w}.` : base;
        openGameOver('Out of guesses', msg);
      } catch {
        openGameOver('Out of guesses', getGameOverCopy(false));
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
    els.themeToggle.textContent = theme === 'light' ? '\u263E' : '\u2600';
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
  els.themeToggle = document.getElementById('themeToggle');
  applyTheme(theme);
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

// Subtitle letter-by-letter reveal
function setupSubtitleLetters() {
  const el = document.querySelector('.subtitle');
  if (!el) return;
  const text = (el.textContent || '').trim();
  if (!text || el.dataset.split === '1') return;
  el.dataset.split = '1';
  el.setAttribute('aria-label', text);
  const frag = document.createDocumentFragment();
  const baseDelay = 220; // ms
  const step = 42; // ms per char
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    span.style.animationDelay = ((baseDelay + i * step) / 1000) + 's';
    frag.appendChild(span);
  }
  el.textContent = '';
  el.appendChild(frag);
  el.classList.add('reveal-chars');
}
// Run immediately (script is at end of body)
setupSubtitleLetters();

// Streak info bubble handlers
function setupStreakInfo() {
  const btn = document.getElementById('streakInfo');
  const bubble = document.getElementById('streakInfoBubble');
  if (!btn || !bubble) return;
  let open = false;
  function openBubble() {
    bubble.classList.add('show');
    open = true;
    setTimeout(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onEsc);
    }, 0);
  }
  function closeBubble() {
    bubble.classList.remove('show');
    open = false;
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onEsc);
  }
  function onDocClick(e) {
    if (!open) return;
    const t = e.target;
    if (t === btn || btn.contains(t) || t === bubble || bubble.contains(t)) return;
    closeBubble();
  }
  function onEsc(e) { if (e.key === 'Escape') closeBubble(); }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) closeBubble(); else openBubble();
  });
}

// Align the under-word pills (letters + guesses) to the left edge of tiles
// (reverted) no JS alignment of pills

function setupModalStreakInfo() {
  const btn = document.getElementById('streakInfoModal');
  const bubble = document.getElementById('streakInfoBubbleModal');
  if (!btn || !bubble) return;
  let open = false;
  function openBubble() {
    bubble.classList.add('show');
    open = true;
    setTimeout(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onEsc);
    }, 0);
  }
  function closeBubble() {
    bubble.classList.remove('show');
    open = false;
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onEsc);
  }
  function onDocClick(e) {
    if (!open) return;
    const t = e.target;
    if (t === btn || btn.contains(t) || t === bubble || bubble.contains(t)) return;
    closeBubble();
  }
  function onEsc(e) { if (e.key === 'Escape') closeBubble(); }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) closeBubble(); else openBubble();
  });
}

// Simple top-right menu toggle
function setupMenu() {
  const btn = document.getElementById('menuToggle');
  const dd = document.getElementById('menuDropdown');
  if (!btn || !dd) return;
  function close() {
    dd.classList.add('hidden');
    btn.setAttribute('aria-expanded','false');
    dd.setAttribute('aria-hidden','true');
    document.removeEventListener('click', onDoc);
    document.removeEventListener('keydown', onEsc);
  }
  function onDoc(e){
    if (e.target === btn || btn.contains(e.target) || e.target === dd || dd.contains(e.target)) return;
    close();
  }
  function onEsc(e){ if (e.key === 'Escape') close(); }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const hidden = dd.classList.contains('hidden');
    if (hidden) {
      dd.classList.remove('hidden');
      btn.setAttribute('aria-expanded','true');
      dd.setAttribute('aria-hidden','false');
      setTimeout(()=>{ document.addEventListener('click', onDoc); document.addEventListener('keydown', onEsc); },0);
    } else {
      close();
    }
  });
}

// Visual intensity for streak numbers
function applyStreakHeat(el, count) {
  if (!el) return;
  try { el.classList.add('streak-count'); } catch {}
  const n = Number(count || 0);
  const heat = Math.max(0, Math.min(1, n / 10)); // scales 0..1 by 10+
  const durSec = Math.max(0.5, 1.2 - 0.06 * n); // faster flicker as streak grows
  try {
    el.style.setProperty('--heat', String(heat));
    el.style.setProperty('--flicker-duration', `${durSec}s`);
    el.setAttribute('aria-live', 'polite');
  } catch {}
  try { updateEmbers(el, n, heat); } catch {}
}

// Create/update ember particles bound to a streak element
function updateEmbers(el, n, heat) {
  if (!el) return;
  let layer = el.querySelector('.ember-layer');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'ember-layer';
    el.appendChild(layer);
  }
  // Desired ember count grows with streak, capped for perf
  const target = Math.max(4, Math.min(28, Math.round(6 + heat * 24)));
  const curr = layer.children.length;
  // Resize pool
  if (curr < target) {
    for (let i = curr; i < target; i++) {
      const e = document.createElement('span');
      e.className = 'ember';
      layer.appendChild(e);
    }
  } else if (curr > target) {
    for (let i = curr - 1; i >= target; i--) {
      layer.removeChild(layer.children[i]);
    }
  }
  // Update shared travel distance based on heat
  const travelPx = Math.round(22 + heat * 26); // 22..48px
  layer.style.setProperty('--ember-travel', travelPx + 'px');
  // Configure each ember with randomized parameters influenced by heat
  const children = layer.children;
  for (let i = 0; i < children.length; i++) {
    const e = children[i];
    const left = Math.random() * 100; // % across the number area
    const baseDur = 2.4 - heat * 1.2; // 2.4..1.2s
    const jitter = (Math.random() * 0.6) - 0.3; // -0.3..+0.3
    const dur = Math.max(0.8, baseDur + jitter);
    const scale = 0.8 + heat * 0.6 + Math.random() * 0.2; // 0.8..1.6
    const opacity = 0.55 + heat * 0.35; // .55.. .9
    const delay = -Math.random() * dur; // negative delay to desync
    e.style.left = left + '%';
    e.style.setProperty('--ember-duration', dur + 's');
    e.style.setProperty('--ember-scale', String(scale));
    e.style.setProperty('--ember-opacity', String(opacity));
    e.style.animationDelay = delay + 's';
  }
}

// Game Over modal utilities + observers (non-invasive)
function openGameOver(title, message) {
  const backdrop = document.getElementById('gameOverBackdrop');
  if (!backdrop) return;
  const t = document.getElementById('gameOverTitle');
  const m = document.getElementById('gameOverMessage');
  if (t && title) t.textContent = title;
  if (m && message) m.textContent = message;
  // Always show current streak in the modal
  try {
    const day = els.dayKey?.dataset?.key || els.dayKey?.textContent || '';
    const streakNow = getCurrentStreak(day);
    const sEl = document.getElementById('gameOverStreak');
    if (sEl) {
      sEl.innerHTML = `
        <span class="streak-modal">
          <span class="streak-icon" aria-hidden="true">
            <svg class="icon" viewBox="0 0 24 24" focusable="false">
              <defs>
                <linearGradient id="streakGradModal" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#ffd166"/>
                  <stop offset="100%" stop-color="#fca311"/>
                </linearGradient>
              </defs>
              <path d="M3 14 C7 12, 9 10, 13 9" stroke="url(#streakGradModal)" stroke-width="2" stroke-linecap="round" fill="none"/>
              <polygon points="15,3 17.2,8.2 22.9,8.6 18.2,12.1 19.8,17.6 15,14.6 10.2,17.6 11.8,12.1 7.1,8.6 12.8,8.2" fill="url(#streakGradModal)"/>
            </svg>
          </span>
          Inqaily streak: <strong class=\"streak-count\">${streakNow}</strong>
          <button id="streakInfoModal" class="streak-info-btn" aria-label="About streaks" title="About streaks">
            <svg viewBox="0 0 24 24" width="14" height="14" focusable="false" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="12" cy="8" r="1.2" fill="currentColor"/>
              <path d="M11.2 11.5h1.6v5h-1.6z" fill="currentColor"/>
            </svg>
          </button>
          <div id="streakInfoBubbleModal" class="streak-info-bubble" role="tooltip">
            Play daily to grow your streak. Come back tomorrow to keep it going!
          </div>
        </span>`;
      setupModalStreakInfo();
      const modalCountEl = sEl.querySelector('.streak-count');
      try { applyStreakHeat(modalCountEl, streakNow); } catch {}
      // Hide streak section entirely when viewing a past day (vault mode)
      try { sEl.classList.toggle('hidden', isVaultMode()); } catch {}
    }
  } catch {}
  // Build score if win
  try {
    const qLeft = parseInt((els.qLeft?.textContent || '0').trim(), 10);
    const gLeft = parseInt((els.gLeft?.textContent || '0').trim(), 10);
    const qUsed = isNaN(qLeft) ? null : (LIMITS.questions - qLeft);
    const gUsed = isNaN(gLeft) ? null : (LIMITS.guesses - gLeft);
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

function isVaultMode() {
  try { const u = new URL(location.href); return !!u.searchParams.get('day'); } catch { return false; }
}
function getGameOverCopy(win) {
  if (isVaultMode()) {
    return win ? 'Great job!' : 'Nice try!';
  }
  return win ? 'Great job! Come back tomorrow for a new word.' : 'Nice try! Come back tomorrow for a new word.';
}

(function setupGameOverObservers() {
  let shown = false;
  const resEl = document.getElementById('guessResult') || els.guessResult;
  const gLeftEl = document.getElementById('gLeft') || els.gLeft;
  if (resEl) {
    new MutationObserver(() => {
      if (shown) return;
      const txt = resEl.textContent || '';
      if (/Correct!/i.test(txt)) {
        shown = true; openGameOver('You got it!', getGameOverCopy(true));
      }
    }).observe(resEl, { childList: true, subtree: true, characterData: true });
  }
  if (gLeftEl) {
    new MutationObserver(() => {
      if (shown) return;
      const left = parseInt((gLeftEl.textContent || '').trim(), 10);
      if (!isNaN(left) && left <= 0) {
        shown = true; openGameOver('Out of guesses', getGameOverCopy(false));
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

function animateTileSlam(indices) {
  const tiles = els.maskedWord?.querySelectorAll('.tile');
  if (!tiles) return;
  indices.forEach(i => {
    const t = tiles[i];
    if (!t) return;
    t.classList.add('slam');
    t.addEventListener('animationend', () => t.classList.remove('slam'), { once: true });
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
    const day = j.dayKey || els.dayKey?.dataset?.key || els.dayKey?.textContent || '';
    if (day) localStorage.removeItem(storageKey(day));
  } catch {}
  setTimeout(() => location.reload(), 600);
  } catch (e) {
    els.devRollMsg.textContent = `Error: ${e?.message || 'failed'}`;
  }
}
