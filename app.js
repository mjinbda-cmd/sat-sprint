/* =========================================================================
   SAT Sprint — standalone port of the Claude Design prototype.

   The prototype (project/SAT Prep Tool.dc.html) rendered through a proprietary
   "dc-runtime" + React-from-CDN. This is a dependency-free rebuild: the exact
   same visuals and behavior, with the business logic ported verbatim from the
   design's Component class and a tiny h()/render layer replacing the framework.
   ========================================================================= */

/* ---- tiny DOM builder (React.createElement-ish) ------------------------- */
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'line', 'polygon', 'polyline', 'circle', 'text', 'rect', 'path', 'g', 'ellipse']);

// CSS properties that take a raw number with no unit appended (mirrors React).
const UNITLESS = new Set([
  'opacity', 'fontWeight', 'lineHeight', 'zIndex', 'flex', 'flexGrow', 'flexShrink',
  'order', 'fillOpacity', 'strokeOpacity', 'strokeWidth', 'columnCount',
]);

function cssKey(k) { return k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()); }

function styleToCss(o) {
  if (typeof o === 'string') return o;
  let s = '';
  for (const k in o) {
    let v = o[k];
    if (v == null || v === '') continue;
    if (typeof v === 'number' && !UNITLESS.has(k)) v = v + 'px';
    s += cssKey(k) + ':' + v + ';';
  }
  return s;
}

function h(tag, attrs, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'style') {
        const css = styleToCss(v);
        if (css) el.setAttribute('style', css);
      } else if (k === 'className') {
        el.setAttribute('class', v);
      } else if (k === 'checked') {
        el.checked = !!v;
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k.length > 2 && k.startsWith('on') && k[2] === k[2].toUpperCase()) {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

const INK = '#241A50';

/* ---- gamification model ---- */
const LEVEL_TITLES = ['Rookie', 'Starter', 'Grinder', 'Contender', 'Scholar', 'Strategist', 'Ace', 'Virtuoso', 'Mastermind', 'SAT Legend'];
// Cumulative XP required to reach level n (level 1 = 0, L2 = 100, L3 = 250, L4 = 450, …)
const levelThresh = (n) => 50 * (n * (n + 1) / 2 - 1);

const BADGES = [
  { id: 'first-diag', emoji: '🧭', name: 'Trailblazer', hint: 'Finish a Full Diagnostic', test: (a, r) => !!r && r.label === 'Full Diagnostic' },
  { id: 'perfect', emoji: '💯', name: 'Flawless', hint: 'Score 100% on a session of 10+ questions', test: (a, r) => !!r && r.total >= 10 && r.correct === r.total },
  { id: 'streak-7', emoji: '🔥', name: 'On Fire', hint: 'Reach a 7-day streak', test: (a) => a.curStreak() >= 7 },
  { id: 'streak-30', emoji: '🌋', name: 'Unstoppable', hint: 'Reach a 30-day streak', test: (a) => a.curStreak() >= 30 },
  {
    id: 'all-domains', emoji: '🗺️', name: 'Explorer', hint: 'Practice every one of the 8 domains', test: (a) => {
      const all = Object.keys(a.D.DOMAINS); if (!all.length) return false;
      const seen = new Set();
      (a.hist[a.cur] || []).forEach(rec => Object.keys(rec.byDom).forEach(d => seen.add(d)));
      return all.every(d => seen.has(d));
    },
  },
  { id: 'queue-clear', emoji: '🧹', name: 'Clean Slate', hint: 'Empty the mistake queue in a review session', test: (a, r) => !!r && r.label === 'Mistake review' && Object.keys(a.mistakes[a.cur] || {}).length === 0 },
  { id: 'goal-hit', emoji: '🎯', name: 'Goal Getter', hint: 'Hit your weekly question goal', test: (a) => a.weekCount() >= a.goal },
  { id: 'challenger', emoji: '💀', name: 'Giant Slayer', hint: 'Score 70%+ on a Challenge round', test: (a, r) => !!r && r.label === 'Challenge round' && r.correct / r.total >= 0.7 },
];

/* ---- per-domain study notes (strategy mini-lessons) ---- */
const STUDY_NOTES = {
  'info-ideas': {
    emoji: '🔍',
    tips: [
      'Answer in your own words FIRST, then find the choice that matches. The choices are written to sound plausible.',
      'For main-idea questions, the right answer covers the whole text. A choice that is true but only about one sentence is a decoy.',
      'For evidence questions, the correct choice must directly support the exact claim — not just mention the same topic.',
      'For inference and "logically completes" questions, stay one small step from the text. If a choice needs outside knowledge or a big leap, it\'s wrong.',
    ],
    traps: [
      'True-but-not-the-point: a real detail from the passage used as bait on a main-idea question.',
      'Extreme words — "always", "never", "only", "prove" — usually overstate what a short passage can support.',
    ],
  },
  'craft': {
    emoji: '🧩',
    tips: [
      'For vocabulary-in-context, cover the choices, reread the sentence, and predict your own word before looking.',
      'Logic clues around the blank ("however", "therefore", "not X but ___") tell you whether the word should be positive, negative, or a contrast.',
      'For purpose/function questions, ask what the sentence DOES (defines, contrasts, concedes, supports) — not what it says.',
      'For two-text questions, write each author\'s position as one short sentence before comparing them.',
    ],
    traps: [
      'The most common meaning of a word is often wrong — the SAT tests its meaning in THIS sentence.',
      'Half-right function answers: right action but wrong target, or right target but wrong action.',
    ],
  },
  'expression': {
    emoji: '✍️',
    tips: [
      'For transition questions, read the sentence before AND after, then classify the relationship: continue, contrast, cause/effect, or example.',
      'Never pick a transition because it sounds formal — pick the one whose logic matches.',
      'For "student\'s notes" questions, underline the goal in the prompt ("emphasize a difference", "introduce X to a new audience"). The right answer accomplishes exactly that goal.',
      'Check that every part of the answer is supported by the notes — wrong choices often add or drop one key detail.',
    ],
    traps: [
      '"However" vs. "therefore": opposite logic, both grammatically fine.',
      'Choices that use the notes accurately but don\'t do the specific job the question asks for.',
    ],
  },
  'conventions': {
    emoji: '📏',
    tips: [
      'Find the verb and its subject first — skip over the prepositional phrases between them ("The collection of essays WAS…").',
      'Two complete sentences need a period, a semicolon, or a comma + conjunction. A comma alone is a comma splice — always wrong.',
      'Most punctuation questions are really sentence-boundary questions. Test each choice: does it create a fragment or a run-on?',
      'Pronouns must match their antecedent in number, and the antecedent must be unambiguous.',
      'If two choices mean and punctuate the same thing, both are wrong — the answer must be grammatically unique.',
    ],
    traps: [
      'Interrupting phrases that hide subject–verb disagreement.',
      '"Its" vs. "it\'s" and "their" vs. "there" — tested constantly.',
    ],
  },
  'algebra': {
    emoji: '📐',
    tips: [
      'In word problems, define the variable in words first ("x = hours worked"), then translate sentence by sentence.',
      'Slope = rate of change; y-intercept = starting value. Most linear word problems test whether you know which is which.',
      'Systems: if the question asks only for x + y or x − y, try adding or subtracting the equations before fully solving.',
      'Plugging answer choices back in is legitimate strategy — start from the middle value.',
      'No solution = same slope, different intercepts. Infinitely many = one equation is a multiple of the other.',
    ],
    traps: [
      'Sign errors when distributing a negative — the #1 algebra mistake.',
      'Solving for x when the question asks for 2x, or for y.',
    ],
  },
  'advanced': {
    emoji: '🧠',
    tips: [
      'Know what each quadratic form shows instantly: standard form → y-intercept, factored form → roots, vertex form → max/min.',
      'The discriminant b² − 4ac gives the number of real solutions: positive → 2, zero → 1, negative → 0.',
      'Linear growth adds the same amount each step; exponential growth multiplies by the same factor.',
      'Exponent rules foggy? Expand a tiny example: x²·x³ = (xx)(xxx) = x⁵.',
      'f(g(x)) means work inside-out: evaluate g first, then feed the result to f.',
    ],
    traps: [
      'Vertex-form sign flip: y = (x − 3)² has its vertex at x = +3, not −3.',
      '(x + y)² is NOT x² + y² — forgetting the 2xy term.',
    ],
  },
  'data': {
    emoji: '📊',
    tips: [
      'Percent change = (new − old) / old. The denominator is always the ORIGINAL value.',
      'Read the axes and units on every chart before touching the question — wrong answers love misread scales.',
      'Outliers drag the mean, not the median. Adding one huge value moves the mean a lot and the median barely.',
      'Set up rates so the units cancel: miles/hour × hours = miles.',
      'In two-way tables, check which group the question restricts to ("of the students who…") — that row or column becomes your total.',
    ],
    traps: [
      '"30% of 50" vs. "30% more than 50" — different numbers.',
      'Using the grand total when the question restricted you to one row or column.',
    ],
  },
  'geo': {
    emoji: '📿',
    tips: [
      'Draw and label a figure for every problem that doesn\'t give you one.',
      'Memorize the special right triangles: 3-4-5, 5-12-13, 45-45-90 (x, x, x√2), and 30-60-90 (x, x√3, 2x).',
      'SOH-CAH-TOA — and the co-function identity sin A = cos(90° − A) shows up on almost every test.',
      'Arc length and sector area are just fractions of the circle: multiply circumference or area by angle/360.',
      'Cone and pyramid volumes are ⅓ of the matching cylinder/prism — forgetting the ⅓ is the classic error.',
    ],
    traps: [
      'Radius vs. diameter — questions love giving one and asking about the other.',
      'Assuming a figure is to scale or has right angles that aren\'t marked.',
    ],
  },
};

/* =========================================================================
   App — logic ported directly from the design's Component class.
   ========================================================================= */
class SATSprint {
  constructor(props) {
    this.LS = { names: 'satNames', cur: 'satCur', hist: 'satHist', miss: 'satMistakes', streak: 'satStreak', goal: 'satGoal', settings: 'satSettings', game: 'satGame' };
    let g = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
    // Design "Tweaks" become real, persisted settings; defaults match the prototype.
    this.props = { ...(props || {}), ...(g(this.LS.settings, {}) || {}) };
    this.names = g(this.LS.names, null) || ['TJ', 'Imani'];
    if (this.names[0] === 'Teen 1') this.names[0] = 'TJ';
    if (this.names[1] === 'Teen 2') this.names[1] = 'Imani';
    this.cur = parseInt(localStorage.getItem(this.LS.cur) || '0') || 0;
    this.hist = g(this.LS.hist, {});
    this.mistakes = g(this.LS.miss, {});
    this.streaks = g(this.LS.streak, {});
    this.goal = parseInt(localStorage.getItem(this.LS.goal) || '60') || 60;
    this.game = g(this.LS.game, null);
    if (!this.game) {
      // One-time backfill: credit pre-gamification sessions at ~20 XP per correct answer.
      this.game = {};
      Object.keys(this.hist).forEach(k => {
        this.game[k] = { xp: (this.hist[k] || []).reduce((s, rec) => s + rec.correct * 20, 0), badges: {} };
      });
    }
    this.quiz = null;
    this.lastResult = null;
    this.state = { view: 'home', tab: 'home', timed: false, openMistake: null, openNote: null };
    this._lastAnimView = null;
    this.mount();
  }

  get D() { return window.SAT_DATA || { Q: [], DOMAINS: {}, RW: [], DIFFNAME: { 1: 'Easy', 2: 'Medium', 3: 'Hard' } }; }

  mount() {
    this.root = document.getElementById('app');
    this._onKey = (e) => {
      if (this.state.view !== 'quiz' || !this.quiz) return;
      const k = e.key.toUpperCase();
      if ('ABCD'.includes(k) && this.quiz.map !== null) {
        const i = 'ABCD'.indexOf(k);
        if (this.quiz.curQ && i < this.quiz.curQ.ch.length) this.answer(i);
      }
      if (e.key === 'Enter' && this.quiz.map === null) this.nextQ();
    };
    document.addEventListener('keydown', this._onKey);
    window.__sat = this;
    this.render();
  }

  /* ---- state plumbing (replaces React setState / dc bump) ---- */
  setState(update, cb) {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...patch };
    this.render();
    if (cb) cb();
  }
  bump() { this.render(); }

  save() {
    localStorage.setItem(this.LS.names, JSON.stringify(this.names));
    localStorage.setItem(this.LS.cur, String(this.cur));
    localStorage.setItem(this.LS.hist, JSON.stringify(this.hist));
    localStorage.setItem(this.LS.miss, JSON.stringify(this.mistakes));
    localStorage.setItem(this.LS.streak, JSON.stringify(this.streaks));
    localStorage.setItem(this.LS.goal, String(this.goal));
    localStorage.setItem(this.LS.game, JSON.stringify(this.game));
  }

  /* ---- gamification ---- */
  gameFor(i) { return this.game[i] = this.game[i] || { xp: 0, badges: {} }; }
  levelInfo(xp) {
    let lv = 1;
    while (lv < LEVEL_TITLES.length && xp >= levelThresh(lv + 1)) lv++;
    const base = levelThresh(lv), next = lv < LEVEL_TITLES.length ? levelThresh(lv + 1) : null;
    return { level: lv, title: LEVEL_TITLES[lv - 1], xp, base, next, pct: next ? Math.min(100, Math.round((xp - base) / (next - base) * 100)) : 100 };
  }
  addXP(n) { this.gameFor(this.cur).xp += n; }
  checkBadges(r) {
    const g = this.gameFor(this.cur), out = [];
    BADGES.forEach(b => {
      if (!g.badges[b.id] && b.test(this, r)) { g.badges[b.id] = new Date().toISOString(); out.push(b); }
    });
    return out;
  }
  saveSettings() {
    localStorage.setItem(this.LS.settings, JSON.stringify({
      quickCount: this.props.quickCount, masteryStreak: this.props.masteryStreak, showKeyboardHints: this.props.showKeyboardHints,
    }));
  }
  curName() { return this.names[this.cur]; }
  byId(id) { return this.D.Q.find(q => q.id === id); }

  /* ---- streaks ---- */
  localDay(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  weekStart() { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return this.localDay(x); }
  curStreak() {
    const s = this.streaks[this.cur]; if (!s || !s.last) return 0;
    const today = this.localDay(), y = new Date(); y.setDate(y.getDate() - 1);
    return (s.last === today || s.last === this.localDay(y)) ? s.n : 0;
  }
  weekCount(i = this.cur) { const s = this.streaks[i]; if (!s) return 0; return s.ws === this.weekStart() ? (s.wq || 0) : 0; }
  bumpStreak(nq) {
    const s = this.streaks[this.cur] || { last: null, n: 0, ws: null, wq: 0 };
    const today = this.localDay();
    if (s.last !== today) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      s.n = (s.last === this.localDay(y)) ? (s.n + 1) : 1;
      s.last = today;
    }
    if (s.ws !== this.weekStart()) { s.ws = this.weekStart(); s.wq = 0; }
    s.wq = (s.wq || 0) + nq;
    this.streaks[this.cur] = s; this.save();
  }

  /* ---- session builders ---- */
  shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  tierPick(dom, diff, n, used) {
    const Q = this.D.Q;
    let c = this.shuffle(Q.filter(q => q.dom === dom && q.diff === diff && !used.has(q.id))).slice(0, n);
    if (c.length < n) {
      const extra = this.shuffle(Q.filter(q => q.dom === dom && !used.has(q.id) && !c.includes(q))).slice(0, n - c.length);
      c = c.concat(extra);
    }
    c.forEach(q => used.add(q.id));
    return c;
  }
  buildFixed(domList) {
    const used = new Set(); let out = [];
    domList.forEach(d => { out = out.concat(this.tierPick(d, 1, 2, used), this.tierPick(d, 2, 2, used), this.tierPick(d, 3, 1, used)); });
    return this.shuffle(out);
  }
  secBudget(q) { return q.sec === 'rw' ? 71 : 95; }
  modeLabel(m) {
    const D = this.D.DOMAINS;
    if (m === 'all') return 'Full Diagnostic'; if (m === 'rw') return 'Reading & Writing';
    if (m === 'math') return 'Math'; if (m === 'quick') return 'Quick ' + this.quickN(); if (m === 'hard') return 'Challenge round';
    if (m === 'review') return 'Mistake review';
    if (m && m.startsWith('dom:')) return D[m.slice(4)] + ' drill'; return 'Session';
  }
  quickN() { return this.props.quickCount ?? 10; }
  masteryN() { return this.props.masteryStreak ?? 2; }

  startQuiz(mode) {
    const { Q, DOMAINS, RW } = this.D;
    if (!Q.length) return;
    const timed = this.state.timed;
    let fixed = null, pool = null, n = 0, label = this.modeLabel(mode);
    if (mode === 'all') fixed = this.buildFixed(Object.keys(DOMAINS));
    else if (mode === 'rw') fixed = this.buildFixed(RW);
    else if (mode === 'math') fixed = this.buildFixed(Object.keys(DOMAINS).filter(d => !RW.includes(d)));
    else if (mode === 'quick') { pool = Q; n = this.quickN(); }
    else if (mode === 'hard') fixed = this.shuffle(Q.filter(q => q.diff === 3)).slice(0, 10);
    else if (mode === 'review') {
      const ids = Object.keys(this.mistakes[this.cur] || {});
      if (!ids.length) { alert('No missed questions saved yet. They collect here automatically as you practice.'); return; }
      fixed = this.shuffle(ids.map(id => this.byId(id)).filter(Boolean)).slice(0, 12);
    }
    else if (mode.startsWith('dom:')) { const d = mode.slice(4); pool = Q.filter(q => q.dom === d); n = 10; }
    if (fixed) n = fixed.length;
    this.quiz = { mode, label, timed, fixed, pool, n, level: 2, recent: [], askedIds: new Set(), answers: [], curQ: null, map: null, start: Date.now() };
    if (timed) {
      this.quiz.budget = fixed ? fixed.reduce((s, q) => s + this.secBudget(q), 0)
        : n * (pool.every(q => q.sec === 'rw') ? 71 : pool.every(q => q.sec === 'math') ? 95 : 83);
      this.quiz.remaining = this.quiz.budget;
      this.quiz.interval = setInterval(() => this.tick(), 1000);
    }
    this.nextQuestion();
    this.setState({ view: 'quiz' });
  }
  tick() {
    if (!this.quiz) return;
    this.quiz.remaining--;
    if (this.quiz.remaining <= 0) { clearInterval(this.quiz.interval); this.finishQuiz(true); return; }
    this.bump();
  }
  pickAdaptive() {
    const unused = this.quiz.pool.filter(q => !this.quiz.askedIds.has(q.id));
    if (!unused.length) return null;
    for (const lv of [this.quiz.level, this.quiz.level - 1, this.quiz.level + 1, this.quiz.level - 2, this.quiz.level + 2]) {
      const c = unused.filter(q => q.diff === lv);
      if (c.length) return c[Math.floor(Math.random() * c.length)];
    }
    return unused[Math.floor(Math.random() * unused.length)];
  }
  nextQuestion() {
    if (this.quiz.answers.length >= this.quiz.n) { this.finishQuiz(); return; }
    const q = this.quiz.fixed ? this.quiz.fixed[this.quiz.answers.length] : this.pickAdaptive();
    if (!q) { this.finishQuiz(); return; }
    this.quiz.curQ = q; this.quiz.askedIds.add(q.id);
    this.quiz.map = this.shuffle([0, 1, 2, 3].slice(0, q.ch.length));
    this.quiz.picked = null;
    this.bump();
  }
  answer(i) {
    const quiz = this.quiz, q = quiz && quiz.curQ;
    if (!q || quiz.map === null) return;
    const correctDisp = quiz.map.indexOf(q.a);
    const ok = (i === correctDisp);
    quiz.picked = i; quiz.correctDisp = correctDisp; quiz.lastOk = ok;
    quiz.mapFrozen = quiz.map; quiz.map = null;
    quiz.answers.push({ dom: q.dom, sec: q.sec, diff: q.diff, ok });
    let xpGain = ok ? q.diff * 10 + (quiz.timed ? 5 : 0) : 0;
    quiz.comeback = false;
    const mm = this.mistakes[this.cur] = this.mistakes[this.cur] || {};
    if (!ok) { mm[q.id] = { miss: (mm[q.id] ? mm[q.id].miss : 0) + 1, streak: 0 }; }
    else if (mm[q.id]) {
      mm[q.id].streak = (mm[q.id].streak || 0) + 1;
      if (mm[q.id].streak >= this.masteryN()) { delete mm[q.id]; xpGain += 15; quiz.comeback = true; }
    }
    quiz.xp = (quiz.xp || 0) + xpGain;
    quiz.lastXP = xpGain;
    this.save();
    quiz.recent.push(ok); if (quiz.recent.length > 3) quiz.recent.shift();
    if (quiz.recent.length === 3) {
      const c = quiz.recent.filter(x => x).length;
      if (c === 3) { quiz.level = Math.min(3, quiz.level + 1); quiz.recent = []; }
      else if (c <= 1) { quiz.level = Math.max(1, quiz.level - 1); quiz.recent = []; }
    }
    this.bump();
  }
  nextQ() { if (this.quiz) this.nextQuestion(); }
  quitQuiz() {
    if (confirm('Quit this session? Progress for it will not be saved.')) {
      if (this.quiz && this.quiz.interval) clearInterval(this.quiz.interval);
      this.quiz = null; this.showTab('home');
    }
  }
  finishQuiz(timeUp) {
    const quiz = this.quiz;
    if (quiz.interval) clearInterval(quiz.interval);
    const total = quiz.answers.length;
    if (total === 0) { this.quiz = null; this.showTab('home'); return; }
    const correct = quiz.answers.filter(a => a.ok).length;
    const secs = Math.round((Date.now() - quiz.start) / 1000);
    const byDom = {}, byDiff = {};
    quiz.answers.forEach(a => {
      byDom[a.dom] = byDom[a.dom] || { c: 0, t: 0 }; byDom[a.dom].t++; if (a.ok) byDom[a.dom].c++;
      byDiff[a.diff] = byDiff[a.diff] || { c: 0, t: 0 }; byDiff[a.diff].t++; if (a.ok) byDiff[a.diff].c++;
    });
    const rec = { date: new Date().toISOString(), mode: quiz.label, correct, total, byDom, timed: quiz.timed, secs };
    this.hist[this.cur] = this.hist[this.cur] || []; this.hist[this.cur].push(rec);
    this.bumpStreak(total);
    const xpEarned = (quiz.xp || 0) + 10;
    this.addXP(xpEarned);
    const newBadges = this.checkBadges({ label: quiz.label, correct, total });
    this.save();
    const target = quiz.answers.every(a => a.sec === 'rw') ? 71 : quiz.answers.every(a => a.sec === 'math') ? 95 : 83;
    this.lastResult = { correct, total, secs, byDom, byDiff, timed: quiz.timed, label: quiz.label, timeUp: !!timeUp, target, xpEarned, newBadges, levelAfter: this.levelInfo(this.gameFor(this.cur).xp) };
    this.quiz = null;
    this.setState({ view: 'results' });
  }

  showTab(t) {
    if (this.quiz && this.quiz.interval) clearInterval(this.quiz.interval);
    this.quiz = null;
    this.setState({ view: t, tab: t });
  }

  /* ---- render helpers ---- */
  pill(bg, col) { return { display: 'inline-block', padding: '4px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 800, background: bg, color: col }; }
  barStyle(pct, col) { return { display: 'block', height: '100%', width: pct + '%', background: col, borderRadius: 99, transition: 'width .3s' }; }
  domRow(name, c, t) {
    const pct = Math.round(c / t * 100);
    const col = pct >= 80 ? '#16A05B' : pct >= 60 ? '#EFA00B' : '#F03E68';
    return { name, pct, barStyle: this.barStyle(pct, col), tagStyle: { display: pct < 60 ? 'inline' : 'none', color: '#F03E68', fontWeight: 800, fontSize: 11.5, textTransform: 'uppercase' } };
  }

  renderVals() {
    const { Q, DOMAINS, RW, DIFFNAME } = this.D;
    const view = this.state.view;
    const quiz = this.quiz;
    const ink = INK;

    const vals = {
      showHome: view === 'home', showQuiz: view === 'quiz', showResults: view === 'results',
      showProgress: view === 'progress', showGuide: view === 'guide', showSettings: view === 'settings',
      showLearn: view === 'learn',
      timed: this.state.timed,
      onToggleTimed: () => this.setState(s => ({ timed: !s.timed })),
      showKbd: this.props.showKeyboardHints ?? true,
    };

    /* header */
    vals.students = this.names.map((n, i) => ({
      name: n,
      onClick: () => { this.cur = i; this.save(); this.bump(); },
      style: {
        fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderRadius: 999, padding: '8px 16px',
        fontSize: 14, fontWeight: 800,
        background: i === this.cur ? '#6C3BF4' : 'transparent', color: i === this.cur ? '#fff' : ink,
      },
    }));
    vals.onRename = () => {
      const a = prompt("First student's name:", this.names[0]); if (a === null) return;
      const b = prompt("Second student's name:", this.names[1]); if (b === null) return;
      this.names = [a.trim() || 'TJ', b.trim() || 'Imani']; this.save(); this.bump();
    };
    vals.tabs = [['home', 'Practice'], ['progress', 'Progress'], ['learn', 'Learn'], ['guide', 'How to use'], ['settings', 'Settings']].map(([t, label]) => ({
      label,
      onClick: () => this.showTab(t),
      style: {
        fontFamily: "'Space Grotesk',sans-serif", cursor: 'pointer', padding: '10px 18px', borderRadius: 12,
        border: '2px solid ' + ink, fontWeight: 700, fontSize: 15,
        background: this.state.tab === t ? ink : '#fff', color: this.state.tab === t ? '#fff' : ink,
        boxShadow: this.state.tab === t ? 'none' : '0 3px 0 ' + ink,
      },
    }));

    /* home */
    const st = this.curStreak(), wq = this.weekCount(), pct = Math.min(100, Math.round(wq / this.goal * 100));
    vals.streakDays = st; vals.weekQ = wq; vals.goalQ = this.goal;
    vals.lvl = this.levelInfo(this.gameFor(this.cur).xp);
    vals.xpBarStyle = this.barStyle(vals.lvl.pct, '#6C3BF4');
    const wk0 = this.weekCount(0), wk1 = this.weekCount(1);
    vals.h2h = (wk0 > 0 && wk1 > 0)
      ? `🤝 This week: ${this.names[0]} ${wk0} · ${this.names[1]} ${wk1} questions — you're both showing up!`
      : null;
    vals.goLearn = (dom) => { this.showTab('learn'); this.setState({ openNote: dom || null }); };
    vals.goalStyle = this.barStyle(pct, 'linear-gradient(90deg,#C8F135,#16A05B)');
    vals.onEditGoal = () => { const g = prompt('Weekly question goal:', this.goal); if (g && parseInt(g) > 0) { this.goal = parseInt(g); this.save(); this.bump(); } };
    const missN = Object.keys(this.mistakes[this.cur] || {}).length;
    vals.reviewText = missN ? `${missN} missed question${missN > 1 ? 's' : ''} waiting. Clear each by answering it correctly twice.` : 'No missed questions saved yet. Misses from any session land here.';
    vals.onDiag = () => this.startQuiz('all');
    vals.onReview = () => this.startQuiz('review');
    vals.onRW = () => this.startQuiz('rw');
    vals.onMath = () => this.startQuiz('math');
    vals.onQuick = () => this.startQuiz('quick');
    vals.onHard = () => this.startQuiz('hard');
    vals.domainBtns = Object.keys(DOMAINS).map(d => {
      const isRW = RW.includes(d);
      return {
        name: DOMAINS[d],
        onClick: () => this.startQuiz('dom:' + d),
        style: {
          fontFamily: 'inherit', cursor: 'pointer', border: '2px solid ' + ink, borderRadius: 999, padding: '7px 14px',
          fontSize: 13.5, fontWeight: 700, boxShadow: '0 2px 0 ' + ink,
          background: isRW ? '#ECE5FE' : '#DFF6F7', color: isRW ? '#4B21C4' : '#086F78',
        },
      };
    });

    /* quiz */
    const q = quiz && quiz.curQ;
    vals.qCounter = quiz ? `Question ${quiz.answers.length + (quiz.map !== null ? 1 : 0)} of ${quiz.n}` : '';
    vals.secName = q ? (q.sec === 'rw' ? 'Reading & Writing' : 'Math') : '';
    vals.secStyle = q ? (q.sec === 'rw' ? this.pill('#ECE5FE', '#4B21C4') : this.pill('#DFF6F7', '#086F78')) : {};
    vals.diffName = q ? DIFFNAME[q.diff] : '';
    vals.diffStyle = q ? (q.diff === 1 ? this.pill('#E0F6EA', '#0E7A44') : q.diff === 2 ? this.pill('#FEF1D6', '#B0740A') : this.pill('#FDE4EB', '#C22450')) : {};
    vals.qDomName = q ? DOMAINS[q.dom] : '';
    vals.timerOn = !!(quiz && quiz.timed);
    if (quiz && quiz.timed) {
      const m = Math.max(0, quiz.remaining || 0);
      vals.timerText = Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
      const low = m <= 60;
      vals.timerStyle = { marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 16, borderRadius: 9, padding: '4px 12px', background: low ? '#FDE4EB' : '#ECE5FE', color: low ? '#C22450' : ink };
    } else { vals.timerText = ''; vals.timerStyle = {}; }
    vals.progStyle = this.barStyle(quiz ? (quiz.answers.length - (quiz.map === null ? 1 : 0)) / quiz.n * 100 : 0, '#6C3BF4');
    vals.hasPassage = !!(q && q.passage);
    vals.qPassage = q ? (q.passage || '') : '';
    vals.qStem = q ? q.stem : '';
    const map = quiz ? (quiz.map !== null ? quiz.map : quiz.mapFrozen) : null;
    const answered = !!(quiz && quiz.map === null && q);
    vals.answered = answered;
    vals.choices = (q && map) ? map.map((orig, i) => {
      let bg = '#fff', border = '#E4DEF7', ltrBg = '#ECE5FE', ltrCol = '#4B21C4';
      if (answered) {
        if (i === quiz.correctDisp) { bg = '#E0F6EA'; border = '#16A05B'; ltrBg = '#16A05B'; ltrCol = '#fff'; }
        else if (i === quiz.picked) { bg = '#FDE4EB'; border = '#F03E68'; ltrBg = '#F03E68'; ltrCol = '#fff'; }
      }
      return {
        ltr: 'ABCD'[i], text: q.ch[orig],
        onClick: answered ? undefined : () => this.answer(i),
        style: {
          border: '2px solid ' + border, borderRadius: 12, padding: '13px 15px', cursor: answered ? 'default' : 'pointer',
          display: 'flex', gap: 12, alignItems: 'flex-start', background: bg, fontSize: 15.5, transition: '.1s',
        },
        ltrStyle: { flexShrink: 0, width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13.5, background: ltrBg, color: ltrCol },
      };
    }) : [];
    if (answered) {
      const ok = quiz.lastOk;
      vals.explainStyle = { marginTop: 10, padding: 15, borderRadius: 12, fontSize: 14.5, background: ok ? '#E0F6EA' : '#FDE4EB', border: '2px solid ' + (ok ? '#16A05B' : '#F03E68') };
      vals.explainTitle = (ok ? '✅ Correct' : '❌ Not quite') + ' — answer: ' + 'ABCD'[quiz.correctDisp]
        + (quiz.lastXP ? ` · +${quiz.lastXP} XP` : '');
      vals.explainText = q.exp;
      vals.comebackLine = quiz.comeback ? '🧹 Comeback bonus! That question just cleared the mistake queue.' : '';
      // Per-choice "why wrong" notes: learning aid only — never shown in timed mode.
      vals.whys = (!quiz.timed && q.why) ? quiz.mapFrozen
        .map((orig, i) => (i !== quiz.correctDisp && q.why[orig]) ? { ltr: 'ABCD'[i], text: q.why[orig] } : null)
        .filter(Boolean) : [];
      vals.nextLabel = quiz.answers.length === quiz.n ? 'See results 🎉' : 'Next →';
    } else { vals.explainStyle = {}; vals.explainTitle = ''; vals.explainText = ''; vals.comebackLine = ''; vals.whys = []; vals.nextLabel = 'Next →'; }
    vals.onNext = () => this.nextQ();
    vals.onQuit = () => this.quitQuiz();

    /* results */
    const r = this.lastResult;
    if (r) {
      const rp = Math.round(r.correct / r.total * 100);
      vals.resScore = r.correct; vals.resTotal = r.total; vals.resPct = rp;
      vals.resEmoji = rp >= 80 ? '🎉' : rp >= 60 ? '💪' : '📈';
      vals.resStudent = this.curName() + ' · ' + r.label + (r.timeUp ? ' · time ran out' : '');
      const avg = Math.round(r.secs / r.total);
      vals.resPace = r.timed ? `Pace: ${avg} sec/question (real-test target ≈ ${r.target} sec)` : `Untimed · averaged ${avg} sec/question`;
      vals.resStreakLine = `Streak: ${this.curStreak()} days · This week: ${this.weekCount()}/${this.goal} questions`;
      vals.resDomRows = Object.keys(r.byDom).map(d => this.domRow(DOMAINS[d], r.byDom[d].c, r.byDom[d].t));
      vals.resDiffRows = [1, 2, 3].filter(d => r.byDiff[d]).map(d => this.domRow(DIFFNAME[d], r.byDiff[d].c, r.byDiff[d].t));
      const weak = Object.keys(r.byDom).filter(d => r.byDom[d].c / r.byDom[d].t < 0.6);
      const mn = Object.keys(this.mistakes[this.cur] || {}).length;
      const good = !weak.length;
      vals.flagText = good
        ? `Strong session! No domain fell below 60%.${mn ? ` ${mn} question${mn > 1 ? 's' : ''} still in the mistake queue — clear them out.` : ' Mistake queue is empty too.'}`
        : `Focus areas: ${weak.map(d => DOMAINS[d]).join(', ')} came in under 60%. Drill them next.${mn ? ` The mistake queue now holds ${mn} question${mn > 1 ? 's' : ''} — run a review session.` : ''}`;
      vals.flagStyle = { marginTop: 18, padding: '13px 16px', borderRadius: 12, fontSize: 14, fontWeight: 500, border: '2px solid ' + ink, background: good ? '#E0F6EA' : '#FEF1D6' };
      vals.resXP = r.xpEarned || 0;
      vals.resLvl = r.levelAfter || this.levelInfo(this.gameFor(this.cur).xp);
      vals.resXpBarStyle = this.barStyle(vals.resLvl.pct, '#6C3BF4');
      vals.resNewBadges = r.newBadges || [];
    } else {
      vals.resScore = 0; vals.resTotal = 0; vals.resPct = 0; vals.resEmoji = ''; vals.resStudent = ''; vals.resPace = ''; vals.resStreakLine = '';
      vals.resDomRows = []; vals.resDiffRows = []; vals.flagText = ''; vals.flagStyle = { display: 'none' };
      vals.resXP = 0; vals.resLvl = this.levelInfo(0); vals.resXpBarStyle = {}; vals.resNewBadges = [];
    }
    vals.onBackHome = () => this.showTab('home');
    vals.onSeeProgress = () => this.showTab('progress');

    /* progress */
    vals.progName = this.curName();
    const hh = this.hist[this.cur] || [];
    vals.hasHistory = hh.length > 0; vals.noHistory = hh.length === 0;
    const x0 = 36, x1 = 630, y0 = 190, y1 = 10;
    const pts = hh.map((rec, i) => {
      const px = hh.length === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (hh.length - 1);
      const py = y0 - (y0 - y1) * (rec.correct / rec.total);
      return { cx: Math.round(px * 10) / 10, cy: Math.round(py * 10) / 10 };
    });
    vals.chartPoints = pts.map(p => p.cx + ',' + p.cy).join(' ');
    vals.chartFill = pts.length ? (pts[0].cx + ',' + y0 + ' ' + vals.chartPoints + ' ' + pts[pts.length - 1].cx + ',' + y0) : '';
    vals.chartDots = pts;
    const recent = hh.slice(-3), agg = {};
    recent.forEach(rec => Object.keys(rec.byDom).forEach(d => { agg[d] = agg[d] || { c: 0, t: 0 }; agg[d].c += rec.byDom[d].c; agg[d].t += rec.byDom[d].t; }));
    const keys = Object.keys(agg).sort((a, b) => (agg[a].c / agg[a].t) - (agg[b].c / agg[b].t));
    vals.weakRows = keys.map(d => this.domRow(DOMAINS[d], agg[d].c, agg[d].t));
    vals.hasWeak = keys.length > 0; vals.noWeak = keys.length === 0;
    const mm = this.mistakes[this.cur] || {}, mn2 = Object.keys(mm).length;
    const domCounts = {};
    Object.keys(mm).forEach(id => { const qq = this.byId(id); if (qq) domCounts[qq.dom] = (domCounts[qq.dom] || 0) + 1; });
    vals.mistakeInfo = mn2
      ? `${mn2} question${mn2 > 1 ? 's' : ''} waiting for review. Each leaves the queue after being answered correctly ${this.masteryN() === 1 ? 'once' : this.masteryN() === 2 ? 'twice' : this.masteryN() + ' times in a row'}. Tap one to study it.`
      : 'Empty. Missed questions collect here automatically.';
    /* mistake explorer */
    vals.missRows = Object.keys(mm).map(id => {
      const qq = this.byId(id); if (!qq) return null;
      const m = mm[id];
      return {
        id, q: qq, domName: DOMAINS[qq.dom], dom: qq.dom,
        secStyle: qq.sec === 'rw' ? this.pill('#ECE5FE', '#4B21C4') : this.pill('#DFF6F7', '#086F78'),
        diffName: DIFFNAME[qq.diff],
        diffStyle: qq.diff === 1 ? this.pill('#E0F6EA', '#0E7A44') : qq.diff === 2 ? this.pill('#FEF1D6', '#B0740A') : this.pill('#FDE4EB', '#C22450'),
        missN: m.miss, mastery: `${m.streak || 0}/${this.masteryN()}`,
        open: this.state.openMistake === id,
        onToggle: () => this.setState(s => ({ openMistake: s.openMistake === id ? null : id })),
      };
    }).filter(Boolean);
    /* badges */
    const gm = this.gameFor(this.cur);
    vals.badgeCells = BADGES.map(b => ({ ...b, earned: !!gm.badges[b.id] }));
    vals.badgeCount = Object.keys(gm.badges).length;
    /* learn */
    vals.learnSections = Object.keys(DOMAINS).map(d => {
      const note = STUDY_NOTES[d] || { emoji: '📚', tips: [], traps: [] };
      return {
        dom: d, name: DOMAINS[d], emoji: note.emoji, tips: note.tips, traps: note.traps,
        isRW: RW.includes(d),
        open: this.state.openNote === d,
        onToggle: () => this.setState(s => ({ openNote: s.openNote === d ? null : d })),
        onDrill: () => this.startQuiz('dom:' + d),
      };
    });
    vals.histRows = hh.slice().reverse().map(rec => {
      const d = new Date(rec.date);
      return {
        when: d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: rec.mode, timedIcon: rec.timed ? '⏱' : '—',
        score: rec.correct + '/' + rec.total, pct: Math.round(rec.correct / rec.total * 100),
      };
    });
    vals.onClearHistory = () => {
      if (confirm('Clear all saved sessions and the mistake queue for ' + this.curName() + '? This cannot be undone.')) {
        this.hist[this.cur] = []; this.mistakes[this.cur] = {}; this.save(); this.bump();
      }
    };

    /* settings */
    vals.quickCount = this.quickN();
    vals.masteryStreak = this.masteryN();
    vals.kbdOn = this.props.showKeyboardHints ?? true;
    vals.setQuick = (delta) => { this.props.quickCount = Math.max(5, Math.min(25, this.quickN() + delta)); this.saveSettings(); this.bump(); };
    vals.setMastery = (delta) => { this.props.masteryStreak = Math.max(1, Math.min(5, this.masteryN() + delta)); this.saveSettings(); this.bump(); };
    vals.toggleKbd = () => { this.props.showKeyboardHints = !(this.props.showKeyboardHints ?? true); this.saveSettings(); this.bump(); };

    return vals;
  }

  /* =========================================================================
     Render — translation of the design template into DOM.
     ========================================================================= */
  render() {
    const v = this.renderVals();
    const view = this.state.view;
    const animate = this._lastAnimView !== view;
    const anim = animate ? { animation: 'popIn .25s ease' } : {};
    this._lastAnimView = view;

    const container = h('div', { style: 'max-width:880px;margin:0 auto;padding:28px 20px 90px;' },
      this.renderHeader(v),
      this.renderTabs(v),
      v.showHome && this.renderHome(v, anim),
      v.showQuiz && this.renderQuiz(v, anim),
      v.showResults && this.renderResults(v, anim),
      v.showProgress && this.renderProgress(v, anim),
      v.showLearn && this.renderLearn(v, anim),
      v.showGuide && this.renderGuide(anim),
      v.showSettings && this.renderSettings(v, anim),
    );

    this.root.replaceChildren(container);
  }

  renderHeader(v) {
    return h('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:20px;' },
      h('div', { style: 'display:flex;align-items:center;gap:14px;' },
        h('div', { style: "width:52px;height:52px;background:#6C3BF4;border:2px solid #241A50;border-radius:14px;box-shadow:0 4px 0 #241A50;display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:24px;color:#fff;transform:rotate(-4deg);" }, '⚡'),
        h('div', null,
          h('h1', { style: "font-family:'Space Grotesk',sans-serif;font-size:30px;margin:0;letter-spacing:-0.5px;" }, 'SAT Sprint'),
          h('div', { style: 'color:#6E6693;font-size:14px;font-weight:500;' }, 'Adaptive drills · timed mode · streaks & progress'),
        ),
      ),
      h('div', { style: 'display:flex;align-items:center;gap:8px;' },
        h('div', { style: 'display:flex;background:#fff;border:2px solid #241A50;border-radius:999px;padding:4px;gap:4px;box-shadow:0 3px 0 #241A50;' },
          v.students.map(s => h('button', { onClick: s.onClick, style: s.style }, s.name)),
        ),
        h('button', { className: 'btn-lilac', onClick: v.onRename, title: 'Rename students', style: "font-family:inherit;cursor:pointer;background:#fff;border:2px solid #241A50;border-radius:999px;width:38px;height:38px;font-size:15px;box-shadow:0 3px 0 #241A50;" }, '✏️'),
      ),
    );
  }

  renderTabs(v) {
    return h('div', { style: 'display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;' },
      v.tabs.map(t => h('button', { onClick: t.onClick, style: t.style }, t.label)),
    );
  }

  renderHome(v, anim) {
    const modeCard = (opts) => h('div', { className: opts.cls, onClick: opts.onClick, style: `border:2px solid #241A50;border-radius:14px;padding:16px;cursor:pointer;background:${opts.bg};box-shadow:0 3px 0 #241A50;` },
      h('div', { style: "font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:17px;" }, opts.title),
      h('div', { style: 'font-size:13.5px;color:#544A85;margin-top:3px;' }, opts.desc),
    );

    return h('div', { style: anim },
      /* streak + level + weekly goal */
      h('div', { style: 'display:flex;gap:18px;align-items:center;flex-wrap:wrap;background:linear-gradient(100deg,#FFF3D6,#FDFBF3);border:2px solid #241A50;border-radius:18px;padding:16px 20px;margin-bottom:18px;box-shadow:0 4px 0 #241A50;' },
        h('div', { style: 'display:flex;align-items:center;gap:10px;' },
          h('span', { style: 'font-size:34px;' }, '🔥'),
          h('div', null,
            h('div', { style: "font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;line-height:1;" }, v.streakDays),
            h('div', { style: 'font-size:13px;font-weight:700;color:#6E6693;' }, 'day streak'),
          ),
        ),
        h('div', { style: 'display:flex;align-items:center;gap:10px;' },
          h('span', { style: 'font-size:30px;' }, '🏆'),
          h('div', { style: 'min-width:130px;' },
            h('div', { style: "font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;line-height:1.2;" }, `Lv ${v.lvl.level} · ${v.lvl.title}`),
            h('div', { style: 'height:9px;background:#fff;border:2px solid #241A50;border-radius:99px;overflow:hidden;margin-top:4px;' },
              h('span', { style: v.xpBarStyle }),
            ),
            h('div', { style: 'font-size:11.5px;font-weight:700;color:#6E6693;margin-top:2px;' }, v.lvl.next ? `${v.lvl.xp} / ${v.lvl.next} XP` : `${v.lvl.xp} XP · max level`),
          ),
        ),
        h('div', { style: 'flex:1;min-width:200px;cursor:pointer;', onClick: v.onEditGoal, title: 'Click to change your weekly goal' },
          h('div', { style: 'display:flex;justify-content:space-between;font-size:13.5px;font-weight:700;' },
            h('span', null, 'Weekly goal'),
            h('span', null, `${v.weekQ} / ${v.goalQ} questions ✎`),
          ),
          h('div', { style: 'height:12px;background:#fff;border:2px solid #241A50;border-radius:99px;overflow:hidden;margin-top:5px;' },
            h('span', { style: v.goalStyle }),
          ),
        ),
      ),
      /* gentle head-to-head — only when both students practiced this week */
      v.h2h && h('div', { style: 'background:#fff;border:2px solid #241A50;border-radius:12px;padding:10px 16px;margin-bottom:18px;box-shadow:0 3px 0 #241A50;font-size:14px;font-weight:700;text-align:center;' }, v.h2h),
      /* practice picker */
      h('div', { style: 'background:#fff;border:2px solid #241A50;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 4px 0 #241A50;' },
        h('h2', { style: "font-family:'Space Grotesk',sans-serif;font-size:21px;margin:0 0 4px;" }, 'Pick your practice'),
        h('p', { style: 'color:#6E6693;font-size:14px;margin:0 0 16px;' }, 'Start with the Full Diagnostic to find weak spots. Drills adapt — get questions right and they get harder, just like the real test.'),
        h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;' },
          modeCard({ cls: 'mode-card', onClick: v.onDiag, bg: '#ECE5FE', title: '🧭 Full Diagnostic', desc: '40 questions, all 8 domains. Your starting line + monthly check-in.' }),
          modeCard({ cls: 'mode-card', onClick: v.onReview, bg: '#FEF1D6', title: '🔁 Review my mistakes', desc: v.reviewText }),
          modeCard({ cls: 'mode-card mc-rw', onClick: v.onRW, bg: '#fff', title: '📖 Reading & Writing', desc: '20 questions across all 4 R&W domains.' }),
          modeCard({ cls: 'mode-card mc-math', onClick: v.onMath, bg: '#fff', title: '🧮 Math', desc: '20 questions across all 4 Math domains.' }),
          modeCard({ cls: 'mode-card mc-quick', onClick: v.onQuick, bg: '#fff', title: '⚡ Quick ' + v.quickCount, desc: 'Short adaptive mixed set. The daily warm-up.' }),
          modeCard({ cls: 'mode-card mc-hard', onClick: v.onHard, bg: '#fff', title: '💀 Challenge round', desc: '10 hard questions only. For pushing the ceiling.' }),
        ),
        h('label', { style: 'display:flex;align-items:center;gap:10px;margin:18px 0 4px;font-size:15px;font-weight:700;cursor:pointer;user-select:none;' },
          h('input', { type: 'checkbox', checked: v.timed, onChange: v.onToggleTimed, style: 'width:20px;height:20px;cursor:pointer;accent-color:#6C3BF4;' }),
          '⏱ Timed mode ',
          h('span', { style: 'color:#6E6693;font-weight:500;font-size:13.5px;' }, '· real SAT pacing (~71 sec/question R&W, ~95 sec Math)'),
        ),
        h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:20px 0 8px;" },
          'Drill one domain ',
          h('span', { style: 'color:#6E6693;font-weight:500;font-size:13px;' }, '(10 questions, adaptive)'),
        ),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;' },
          v.domainBtns.map(d => h('button', { onClick: d.onClick, style: d.style }, d.name)),
        ),
      ),
    );
  }

  renderQuiz(v, anim) {
    return h('div', { style: { background: '#fff', border: '2px solid #241A50', borderRadius: 18, padding: 24, boxShadow: '0 4px 0 #241A50', ...anim } },
      h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:13px;flex-wrap:wrap;' },
        h('span', { style: 'font-weight:800;color:#6E6693;' }, v.qCounter),
        h('span', { style: v.secStyle }, v.secName),
        h('span', { style: v.diffStyle }, v.diffName),
        h('span', { style: 'color:#6E6693;font-weight:500;' }, '· ' + v.qDomName),
        v.timerOn && h('span', { style: v.timerStyle }, v.timerText),
      ),
      h('div', { style: 'height:10px;background:#ECE5FE;border-radius:99px;overflow:hidden;margin:0 0 20px;' },
        h('span', { style: v.progStyle }),
      ),
      v.hasPassage && h('div', { style: 'background:#F7F4FF;border:2px solid #E4DEF7;border-left:4px solid #6C3BF4;padding:14px 16px;border-radius:10px;margin-bottom:16px;font-size:15px;white-space:pre-wrap;' }, v.qPassage),
      h('p', { style: 'font-size:17px;font-weight:500;margin:0 0 14px;white-space:pre-wrap;' }, v.qStem),
      h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin:14px 0;' },
        v.choices.map(c => h('div', { onClick: c.onClick, style: c.style },
          h('span', { style: c.ltrStyle }, c.ltr),
          h('span', { style: 'padding-top:3px;' }, c.text),
        )),
      ),
      v.answered && h('div', { style: v.explainStyle },
        h('b', { style: 'display:block;margin-bottom:4px;font-size:15px;' }, v.explainTitle),
        v.explainText,
        v.comebackLine && h('div', { style: 'margin-top:8px;font-weight:700;font-size:13.5px;' }, v.comebackLine),
        v.whys.length > 0 && h('div', { style: 'margin-top:12px;padding-top:10px;border-top:2px dashed rgba(36,26,80,.25);' },
          h('b', { style: 'display:block;font-size:13.5px;margin-bottom:4px;' }, 'Why the others are wrong'),
          v.whys.map(w => h('div', { style: 'font-size:13.5px;margin:3px 0;' }, h('b', null, w.ltr + ': '), w.text)),
        ),
      ),
      h('div', { style: 'display:flex;justify-content:space-between;margin-top:20px;' },
        h('button', { className: 'btn-quit', onClick: v.onQuit, style: 'font-family:inherit;cursor:pointer;background:#fff;color:#241A50;border:2px solid #241A50;border-radius:12px;font-size:15px;font-weight:700;padding:11px 20px;box-shadow:0 3px 0 #241A50;' }, 'Quit'),
        v.answered && h('button', { className: 'btn-primary', onClick: v.onNext, style: 'font-family:inherit;cursor:pointer;background:#6C3BF4;color:#fff;border:2px solid #241A50;border-radius:12px;font-size:15px;font-weight:800;padding:11px 26px;box-shadow:0 3px 0 #241A50;' }, v.nextLabel),
      ),
      v.showKbd && this.renderKbdHint(),
    );
  }

  renderKbdHint() {
    const kbd = (t) => h('b', { style: 'background:#F3F0FC;border:1px solid #E4DEF7;border-radius:5px;padding:1px 6px;font-family:monospace;' }, t);
    return h('div', { style: 'font-size:12.5px;color:#6E6693;margin-top:14px;' },
      'Keyboard: ', kbd('A'), ' ', kbd('B'), ' ', kbd('C'), ' ', kbd('D'), ' to answer · ', kbd('Enter'), ' for next',
    );
  }

  statRow(r) {
    return h('div', { className: 'srow' },
      h('span', { className: 'srow-label' }, r.name, ' ', h('span', { style: r.tagStyle }, 'weak')),
      h('span', { className: 'srow-bar' }, h('span', { style: r.barStyle })),
      h('span', { className: 'srow-pct' }, r.pct + '%'),
    );
  }

  renderResults(v, anim) {
    return h('div', { style: { background: '#fff', border: '2px solid #241A50', borderRadius: 18, padding: 26, boxShadow: '0 4px 0 #241A50', ...anim } },
      h('div', { style: 'text-align:center;' },
        h('div', { style: 'font-size:44px;' }, v.resEmoji),
        h('div', { style: "font-family:'Space Grotesk',sans-serif;font-size:54px;font-weight:700;line-height:1.1;" },
          v.resScore,
          h('span', { style: 'font-size:22px;color:#6E6693;font-weight:500;' }, ` / ${v.resTotal} · ${v.resPct}%`),
        ),
        h('div', { style: 'color:#6E6693;font-size:14.5px;margin-top:4px;' }, v.resStudent),
        h('div', { style: 'color:#6E6693;font-size:14.5px;' }, v.resPace),
        h('div', { style: 'font-size:14.5px;font-weight:700;margin-top:6px;' }, '🔥 ' + v.resStreakLine),
        h('div', { style: 'display:inline-block;margin-top:14px;background:#ECE5FE;border:2px solid #241A50;border-radius:14px;padding:12px 22px;box-shadow:0 3px 0 #241A50;text-align:left;' },
          h('div', { style: "font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:19px;" }, `⭐ +${v.resXP} XP`),
          h('div', { style: 'font-size:13px;font-weight:700;margin-top:4px;' }, `Lv ${v.resLvl.level} · ${v.resLvl.title}`),
          h('div', { style: 'width:180px;height:9px;background:#fff;border:2px solid #241A50;border-radius:99px;overflow:hidden;margin-top:4px;' },
            h('span', { style: v.resXpBarStyle }),
          ),
          h('div', { style: 'font-size:11.5px;font-weight:700;color:#6E6693;margin-top:2px;' }, v.resLvl.next ? `${v.resLvl.xp} / ${v.resLvl.next} XP to Lv ${v.resLvl.level + 1}` : `${v.resLvl.xp} XP · max level`),
        ),
        v.resNewBadges.length > 0 && h('div', { style: 'margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;' },
          v.resNewBadges.map(b => h('span', { style: 'background:#FEF1D6;border:2px solid #241A50;border-radius:999px;padding:6px 14px;font-size:13.5px;font-weight:800;box-shadow:0 2px 0 #241A50;' }, `🏅 New badge: ${b.emoji} ${b.name}`)),
        ),
      ),
      h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:22px 0 8px;" }, 'By domain'),
      v.resDomRows.map(r => this.statRow(r)),
      h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:20px 0 8px;" }, 'By difficulty'),
      v.resDiffRows.map(r => this.statRow(r)),
      h('div', { style: v.flagStyle }, v.flagText),
      h('div', { style: 'display:flex;justify-content:space-between;margin-top:22px;gap:10px;flex-wrap:wrap;' },
        h('button', { className: 'btn-ghost', onClick: v.onBackHome, style: 'font-family:inherit;cursor:pointer;background:#fff;color:#241A50;border:2px solid #241A50;border-radius:12px;font-size:15px;font-weight:700;padding:11px 20px;box-shadow:0 3px 0 #241A50;' }, 'Back to practice'),
        h('button', { className: 'btn-primary', onClick: v.onSeeProgress, style: 'font-family:inherit;cursor:pointer;background:#6C3BF4;color:#fff;border:2px solid #241A50;border-radius:12px;font-size:15px;font-weight:800;padding:11px 22px;box-shadow:0 3px 0 #241A50;' }, 'View progress'),
      ),
    );
  }

  renderProgress(v, anim) {
    const card = (style, ...kids) => h('div', { style }, ...kids);
    return h('div', { style: anim },
      /* chart card */
      card('background:#fff;border:2px solid #241A50;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 4px 0 #241A50;',
        h('h2', { style: "font-family:'Space Grotesk',sans-serif;font-size:20px;margin:0 0 12px;" }, 'Progress for ' + v.progName),
        h('div', { style: 'display:flex;gap:16px;font-size:14.5px;font-weight:700;margin-bottom:14px;flex-wrap:wrap;' },
          h('span', null, `🔥 ${v.streakDays} day streak`),
          h('span', null, `📊 This week: ${v.weekQ} / ${v.goalQ} questions`),
        ),
        v.hasHistory && this.renderChart(v),
        v.noHistory && h('div', { style: 'color:#6E6693;font-size:14px;' }, 'No sessions logged yet. Take a diagnostic to start tracking.'),
      ),
      /* weakest domains */
      card('background:#fff;border:2px solid #241A50;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 4px 0 #241A50;',
        h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;' },
          h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:0 0 8px;" }, 'Weakest domains (last 3 sessions)'),
          h('a', { onClick: () => v.goLearn(null), style: 'cursor:pointer;font-size:13.5px;' }, '📚 Study notes →'),
        ),
        v.hasWeak && v.weakRows.map(r => this.statRow(r)),
        v.noWeak && h('div', { style: 'color:#6E6693;font-size:14px;' }, 'Take a session to see domain breakdowns.'),
      ),
      /* badges */
      card('background:#fff;border:2px solid #241A50;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 4px 0 #241A50;',
        h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:0 0 10px;" }, `Badges · ${v.badgeCount}/${v.badgeCells.length}`),
        h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;' },
          v.badgeCells.map(b => h('div', { style: `border:2px solid ${b.earned ? '#241A50' : '#E4DEF7'};border-radius:12px;padding:12px;text-align:center;${b.earned ? 'background:#FEF9EC;box-shadow:0 2px 0 #241A50;' : 'background:#FAF8FE;'}` },
            h('div', { style: 'font-size:26px;' + (b.earned ? '' : 'filter:grayscale(1);opacity:.4;') }, b.emoji),
            h('div', { style: `font-weight:800;font-size:13.5px;margin-top:3px;${b.earned ? '' : 'color:#6E6693;'}` }, b.name),
            h('div', { style: 'font-size:12px;color:#6E6693;margin-top:2px;' }, b.hint),
          )),
        ),
      ),
      /* mistake explorer */
      card('background:#fff;border:2px solid #241A50;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 4px 0 #241A50;',
        h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:0 0 8px;" }, 'Mistake queue'),
        h('div', { style: 'color:#6E6693;font-size:14px;' }, v.mistakeInfo),
        v.missRows.map(m => this.renderMissRow(m, v)),
      ),
      /* session history */
      card('background:#fff;border:2px solid #241A50;border-radius:18px;padding:24px;box-shadow:0 4px 0 #241A50;',
        h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:0 0 10px;" }, 'Session history'),
        h('div', { style: 'display:flex;gap:10px;font-size:12px;font-weight:800;color:#6E6693;text-transform:uppercase;letter-spacing:.04em;padding:0 4px 8px;border-bottom:2px solid #E4DEF7;' },
          h('span', { style: 'flex:2;' }, 'Date'),
          h('span', { style: 'flex:2;' }, 'Mode'),
          h('span', { style: 'flex:1;text-align:center;' }, 'Timed'),
          h('span', { style: 'flex:1;text-align:right;' }, 'Score'),
          h('span', { style: 'width:52px;text-align:right;' }, '%'),
        ),
        v.hasHistory && v.histRows.map(hr => h('div', { style: 'display:flex;gap:10px;font-size:13.5px;padding:9px 4px;border-bottom:1px solid #EEEAF9;align-items:center;' },
          h('span', { style: 'flex:2;color:#6E6693;' }, hr.when),
          h('span', { style: 'flex:2;font-weight:500;' }, hr.mode),
          h('span', { style: 'flex:1;text-align:center;' }, hr.timedIcon),
          h('span', { style: 'flex:1;text-align:right;font-weight:700;' }, hr.score),
          h('span', { style: 'width:52px;text-align:right;font-weight:800;' }, hr.pct + '%'),
        )),
        v.noHistory && h('div', { style: 'color:#6E6693;font-size:14px;padding:10px 4px;' }, 'No sessions yet.'),
        h('div', { style: 'margin-top:16px;' },
          h('button', { className: 'btn-clear', onClick: v.onClearHistory, style: 'font-family:inherit;cursor:pointer;background:#FDE4EB;color:#C22450;border:2px solid #241A50;border-radius:10px;font-size:13px;font-weight:700;padding:8px 14px;box-shadow:0 2px 0 #241A50;' }, "Clear this student's history"),
        ),
      ),
    );
  }

  renderMissRow(m, v) {
    const q = m.q;
    return h('div', { style: 'border:2px solid #E4DEF7;border-radius:12px;margin-top:10px;overflow:hidden;' },
      h('div', { onClick: m.onToggle, style: 'display:flex;align-items:center;gap:8px;padding:11px 14px;cursor:pointer;flex-wrap:wrap;background:' + (m.open ? '#F7F4FF' : '#fff') + ';' },
        h('span', { style: m.secStyle }, m.domName),
        h('span', { style: m.diffStyle }, m.diffName),
        h('span', { style: 'font-size:13px;font-weight:700;color:#C22450;' }, `missed ×${m.missN}`),
        h('span', { style: 'font-size:13px;font-weight:700;color:#6E6693;' }, `· ${m.mastery} to clear`),
        h('span', { style: 'margin-left:auto;font-weight:800;color:#6C3BF4;' }, m.open ? '▲' : '▼'),
      ),
      m.open && h('div', { style: 'padding:14px 16px;border-top:2px solid #E4DEF7;' },
        q.passage && h('div', { style: 'background:#F7F4FF;border:2px solid #E4DEF7;border-left:4px solid #6C3BF4;padding:12px 14px;border-radius:10px;margin-bottom:12px;font-size:14px;white-space:pre-wrap;' }, q.passage),
        h('p', { style: 'font-size:15px;font-weight:500;margin:0 0 10px;white-space:pre-wrap;' }, q.stem),
        h('div', { style: 'display:flex;flex-direction:column;gap:6px;' },
          q.ch.map((text, idx) => {
            const right = idx === q.a;
            return h('div', { style: `display:flex;gap:10px;align-items:flex-start;font-size:14px;padding:8px 10px;border-radius:10px;border:2px solid ${right ? '#16A05B' : '#EEEAF9'};background:${right ? '#E0F6EA' : '#fff'};` },
              h('span', { style: `flex-shrink:0;width:24px;height:24px;border-radius:8px;display:grid;place-items:center;font-weight:800;font-size:12px;background:${right ? '#16A05B' : '#ECE5FE'};color:${right ? '#fff' : '#4B21C4'};` }, 'ABCD'[idx]),
              h('div', null,
                text,
                !right && q.why && q.why[idx] && h('div', { style: 'font-size:12.5px;color:#8A4A5E;margin-top:2px;' }, '✗ ' + q.why[idx]),
              ),
            );
          }),
        ),
        h('div', { style: 'margin-top:10px;padding:11px 13px;border-radius:10px;background:#E0F6EA;border:2px solid #16A05B;font-size:13.5px;' },
          h('b', null, 'Why: '), q.exp,
        ),
        h('div', { style: 'margin-top:10px;font-size:13.5px;' },
          h('a', { onClick: () => v.goLearn(m.dom), style: 'cursor:pointer;' }, `📚 Study notes: ${m.domName} →`),
        ),
      ),
    );
  }

  renderLearn(v, anim) {
    return h('div', { style: { background: '#fff', border: '2px solid #241A50', borderRadius: 18, padding: 26, boxShadow: '0 4px 0 #241A50', ...anim } },
      h('h2', { style: "font-family:'Space Grotesk',sans-serif;font-size:21px;margin:0 0 4px;" }, 'Study notes'),
      h('p', { style: 'color:#6E6693;font-size:14px;margin:0 0 16px;' }, 'Strategy mini-lessons for each domain — how to attack the question type and the traps it sets. Open the one giving you trouble.'),
      h('div', { style: 'display:flex;flex-direction:column;gap:10px;' },
        v.learnSections.map(s => h('div', { style: 'border:2px solid #241A50;border-radius:14px;overflow:hidden;box-shadow:0 3px 0 #241A50;' },
          h('div', { onClick: s.onToggle, style: `display:flex;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;background:${s.open ? (s.isRW ? '#ECE5FE' : '#DFF6F7') : '#fff'};` },
            h('span', { style: 'font-size:22px;' }, s.emoji),
            h('span', { style: "font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;" }, s.name),
            h('span', { style: 'margin-left:auto;font-weight:800;color:#6C3BF4;' }, s.open ? '▲' : '▼'),
          ),
          s.open && h('div', { style: 'padding:14px 18px;border-top:2px solid #241A50;font-size:14.5px;' },
            h('ul', { style: 'margin:0;padding-left:20px;display:flex;flex-direction:column;gap:7px;' },
              s.tips.map(t => h('li', null, t)),
            ),
            s.traps.length > 0 && h('div', { style: 'margin-top:12px;background:#FEF1D6;border:2px solid #241A50;border-radius:10px;padding:10px 14px;' },
              h('b', { style: 'display:block;font-size:13.5px;margin-bottom:4px;' }, '⚠️ Watch out for'),
              s.traps.map(t => h('div', { style: 'font-size:13.5px;margin:3px 0;' }, '· ' + t)),
            ),
            h('button', { className: 'btn-primary', onClick: s.onDrill, style: 'margin-top:12px;font-family:inherit;cursor:pointer;background:#6C3BF4;color:#fff;border:2px solid #241A50;border-radius:10px;font-size:13.5px;font-weight:800;padding:8px 16px;box-shadow:0 2px 0 #241A50;' }, `Drill ${s.name} →`),
          ),
        )),
      ),
    );
  }

  renderChart(v) {
    return h('svg', { viewBox: '0 0 640 220', style: 'width:100%;display:block;' },
      h('line', { x1: 36, y1: 10, x2: 36, y2: 190, stroke: '#E4DEF7', 'stroke-width': 2 }),
      h('line', { x1: 36, y1: 190, x2: 630, y2: 190, stroke: '#E4DEF7', 'stroke-width': 2 }),
      h('line', { x1: 36, y1: 100, x2: 630, y2: 100, stroke: '#EEEAF9', 'stroke-width': 1.5, 'stroke-dasharray': '4 5' }),
      h('line', { x1: 36, y1: 10, x2: 630, y2: 10, stroke: '#EEEAF9', 'stroke-width': 1.5, 'stroke-dasharray': '4 5' }),
      h('text', { x: 30, y: 194, 'font-size': 11, fill: '#6E6693', 'text-anchor': 'end' }, '0%'),
      h('text', { x: 30, y: 104, 'font-size': 11, fill: '#6E6693', 'text-anchor': 'end' }, '50%'),
      h('text', { x: 30, y: 16, 'font-size': 11, fill: '#6E6693', 'text-anchor': 'end' }, '100%'),
      h('polygon', { points: v.chartFill, fill: '#6C3BF4', opacity: '0.10' }),
      h('polyline', { points: v.chartPoints, fill: 'none', stroke: '#6C3BF4', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      v.chartDots.map(d => h('circle', { cx: d.cx, cy: d.cy, r: 5, fill: '#6C3BF4', stroke: '#fff', 'stroke-width': 2 })),
    );
  }

  renderSettings(v, anim) {
    const sectionH = (t) => h('h3', { style: "font-family:'Space Grotesk',sans-serif;font-size:16px;margin:22px 0 6px;" }, t);
    const rowWrap = (...kids) => h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid #EEEAF9;' }, ...kids);
    const label = (title, desc) => h('div', { style: 'flex:1;min-width:200px;' },
      h('div', { style: 'font-weight:700;font-size:15px;' }, title),
      h('div', { style: 'color:#6E6693;font-size:13.5px;margin-top:2px;' }, desc),
    );
    const stepBtn = (txt, onClick, disabled) => h('button', {
      onClick: disabled ? undefined : onClick,
      style: `font-family:inherit;cursor:${disabled ? 'default' : 'pointer'};width:36px;height:36px;font-size:20px;font-weight:800;line-height:1;border:2px solid #241A50;border-radius:10px;background:${disabled ? '#F3F0FC' : '#ECE5FE'};color:#4B21C4;box-shadow:0 2px 0 #241A50;opacity:${disabled ? 0.45 : 1};`,
    }, txt);
    const stepper = (value, onDec, onInc, atMin, atMax) => h('div', { style: 'display:flex;align-items:center;gap:12px;' },
      stepBtn('−', onDec, atMin),
      h('span', { style: "font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;min-width:34px;text-align:center;" }, value),
      stepBtn('+', onInc, atMax),
    );
    const toggle = (on, onClick) => h('button', {
      onClick,
      role: 'switch', 'aria-checked': on ? 'true' : 'false',
      style: `cursor:pointer;width:56px;height:32px;border:2px solid #241A50;border-radius:999px;background:${on ? '#6C3BF4' : '#fff'};box-shadow:0 2px 0 #241A50;position:relative;padding:0;transition:background .15s;`,
    }, h('span', { style: `position:absolute;top:2px;left:${on ? '26px' : '2px'};width:24px;height:24px;border-radius:999px;background:#fff;border:2px solid #241A50;transition:left .15s;` }));

    return h('div', { style: { background: '#fff', border: '2px solid #241A50', borderRadius: 18, padding: 26, boxShadow: '0 4px 0 #241A50', ...anim } },
      h('h2', { style: "font-family:'Space Grotesk',sans-serif;font-size:21px;margin:0 0 4px;" }, 'Settings'),
      h('p', { style: 'color:#6E6693;font-size:14px;margin:0;' }, 'Tune how sessions run. Changes are saved on this device.'),
      sectionH('Sessions'),
      rowWrap(
        label('Quick round length', 'Questions in the Quick warm-up round (5–25).'),
        stepper(v.quickCount, () => v.setQuick(-1), () => v.setQuick(1), v.quickCount <= 5, v.quickCount >= 25),
      ),
      rowWrap(
        label('Mistake-queue mastery', 'Correct answers in a row needed to clear a question from the mistake queue (1–5).'),
        stepper(v.masteryStreak, () => v.setMastery(-1), () => v.setMastery(1), v.masteryStreak <= 1, v.masteryStreak >= 5),
      ),
      sectionH('Interface'),
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:14px 0;' },
        label('Keyboard hints', 'Show the A / B / C / D keyboard shortcut hint during quizzes.'),
        toggle(v.kbdOn, v.toggleKbd),
      ),
    );
  }

  renderGuide(anim) {
    const steps = [
      ['1', h('span', null, 'Pick your name at the top right. Each of you has your own saved progress, streak, and mistake queue.')],
      ['2', h('span', null, 'Take the ', h('b', null, 'Full Diagnostic'), ' first (40 questions, every domain). It sets the starting line and flags weak areas.')],
      ['3', h('span', null, 'Read every explanation, even on correct answers. Understanding ', h('i', null, 'why'), ' is where the score gains come from.')],
      ['4', h('span', null, 'Drill weak domains with the adaptive drills. Get questions right and they get harder, just like the real adaptive SAT.')],
      ['5', h('span', null, 'Every question you miss goes into the ', h('b', null, 'mistake queue'), '. Run ', h('b', null, 'Review my mistakes'), ' until each one is answered correctly twice; then it leaves the queue.')],
      ['6', h('span', null, 'Once accuracy is solid, switch on ', h('b', null, 'Timed mode'), '. The clock matches real digital SAT pacing.')],
      ['7', h('span', null, 'Keep the ', h('b', null, '🔥 streak'), ' alive. One session a day, even a Quick 10, is enough. Click the weekly goal on the Practice tab to change it.')],
      ['8', h('span', null, 'Check the ', h('b', null, 'Progress'), ' tab weekly to watch the trend line move.')],
      ['9', h('span', null, 'Earn ', h('b', null, 'XP'), ' for every correct answer — harder questions pay more, and clearing a mistake pays a comeback bonus. Level up, collect ', h('b', null, 'badges'), ' (Progress tab), and hit the ', h('b', null, 'Learn'), ' tab for strategy notes on any domain that\'s fighting back.')],
    ];
    return h('div', { style: { background: '#fff', border: '2px solid #241A50', borderRadius: 18, padding: 26, boxShadow: '0 4px 0 #241A50', ...anim } },
      h('h2', { style: "font-family:'Space Grotesk',sans-serif;font-size:21px;margin:0 0 14px;" }, 'How to use this tool'),
      h('div', { style: 'display:flex;flex-direction:column;gap:12px;font-size:15px;' },
        steps.map(([n, body]) => h('div', { style: 'display:flex;gap:12px;' },
          h('span', { style: 'flex-shrink:0;width:28px;height:28px;background:#ECE5FE;border:2px solid #241A50;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:13px;' }, n),
          body,
        )),
      ),
      h('div', { style: 'margin-top:18px;background:#FEF1D6;border:2px solid #241A50;border-radius:12px;padding:14px 16px;font-size:14px;' },
        'This tool builds the habit and pinpoints weaknesses. Pair it with full-length official practice tests in the College Board ',
        h('b', null, 'Bluebook'),
        ' app — the only place to practice the real adaptive, timed digital format.',
      ),
    );
  }
}

/* ---- boot ---- */
const PROPS = { quickCount: 10, masteryStreak: 2, showKeyboardHints: true };
function boot() { new SATSprint(PROPS); }
if (window.SAT_DATA) boot();
else {
  const t = setInterval(() => { if (window.SAT_DATA) { clearInterval(t); boot(); } }, 50);
}
