(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (n) => String(n).padStart(2, '0');
const fmt = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const L = 'ABCD';

function toast(m, ms = 2800) {
  const t = $('toast'); if (!t) return;
  t.textContent = m; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}
window.showToast = toast;

/* ---------- Storage (localStorage; export a backup, cache clears wipe it) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('prepdesk:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('prepdesk:' + k, JSON.stringify(v)); } catch (e) { toast('Storage blocked/full. Export a backup.'); } },
};
let tests = store.get('tests', []);
let sessions = store.get('sessions', []);
const saveTests = () => store.set('tests', tests);
const saveSessions = () => store.set('sessions', sessions);

/* ---------- Topic taxonomy: keeps tags consistent so analysis is not garbage ---------- */
const TAXONOMY = {
  'General Awareness': ['Polity', 'History', 'Geography', 'General Science', 'Economy', 'Static GK', 'Current Affairs'],
  'Reasoning': ['Number Series', 'Coding-Decoding', 'Blood Relations', 'Analogy', 'Classification', 'Syllogism', 'Direction Sense', 'Venn Diagrams'],
  'Quantitative Aptitude': ['Percentage', 'Interest', 'Profit & Loss', 'Ratio', 'Time & Work', 'Speed & Distance', 'Algebra', 'Geometry', 'Mensuration', 'Data Interpretation'],
  'English': ['Vocabulary', 'Prepositions', 'Error Spotting', 'Fill in the Blanks', 'Reading Comprehension', 'Idioms', 'Para Jumbles'],
};
document.body.insertAdjacentHTML('beforeend',
  `<datalist id="subject-list">${Object.keys(TAXONOMY).map((s) => `<option value="${s}">`).join('')}</datalist>` +
  `<datalist id="topic-list">${[...new Set(Object.values(TAXONOMY).flat())].map((t) => `<option value="${esc(t)}">`).join('')}</datalist>` +
  `<input type="file" id="backup-file" accept="application/json" hidden>`);

/* ---------- Sample test ---------- */
const mk = (id, subject, topic, text, options, answer, explanation) => ({ id, subject, topic, text, options, answer, explanation });
const SAMPLE = {
  id: 'sample', name: 'CHSL mini mock', questions: [
    mk('s1', 'General Awareness', 'Polity', 'Article 21 of the Indian Constitution deals with:', ['Right to equality', 'Protection of life and personal liberty', 'Freedom of religion', 'Right to constitutional remedies'], 1, 'Article 21 protects life and personal liberty.'),
    mk('s2', 'General Awareness', 'History', 'Who founded the Maurya Empire?', ['Ashoka', 'Bindusara', 'Chandragupta Maurya', 'Pushyamitra Shunga'], 2, 'Chandragupta Maurya founded it around 321 BCE.'),
    mk('s3', 'General Awareness', 'General Science', 'Which gas is most abundant in Earth\'s atmosphere?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], 1, 'Nitrogen is about 78% of air.'),
    mk('s4', 'Reasoning', 'Number Series', '2, 6, 12, 20, 30, ?', ['40', '42', '44', '36'], 1, 'Differences are 4, 6, 8, 10, so next is +12 = 42.'),
    mk('s5', 'Reasoning', 'Coding-Decoding', 'If CAT is coded as DBU, how is DOG coded?', ['EPH', 'EOH', 'DPH', 'FPH'], 0, 'Each letter shifts +1: D→E, O→P, G→H.'),
    mk('s6', 'Reasoning', 'Blood Relations', 'Pointing to a man, a woman says "He is the son of my mother\'s only son." The man is her:', ['Brother', 'Nephew', 'Uncle', 'Son'], 1, 'Her mother\'s only son is her brother, so the man is her brother\'s son: nephew.'),
    mk('s7', 'Quantitative Aptitude', 'Percentage', 'What is 15% of 360?', ['48', '54', '56', '60'], 1, '360 × 15/100 = 54.'),
    mk('s8', 'Quantitative Aptitude', 'Interest', 'Simple interest on ₹5000 at 8% p.a. for 3 years is:', ['₹1000', '₹1200', '₹1400', '₹1500'], 1, 'SI = 5000 × 8 × 3 / 100 = 1200.'),
    mk('s9', 'English', 'Vocabulary', 'Synonym of "ABUNDANT":', ['Scarce', 'Plentiful', 'Rare', 'Meagre'], 1, 'Abundant means existing in large quantities: plentiful.'),
    mk('s10', 'English', 'Prepositions', 'She has been working here ___ 2019.', ['for', 'since', 'from', 'by'], 1, '"Since" goes with a fixed starting point in time.'),
  ],
};
const allTests = () => [SAMPLE, ...tests];
const tkey = (q) => `${q.subject || 'General'} · ${q.topic || 'Untagged'}`;

/* ---------- Analysis: groupBy topic over attempts ---------- */
const LV = { new: 'Need data', weak: 'Weak', avg: 'Improving', strong: 'Strong' };
function analyze(list, minN = 3) {
  const m = {};
  list.forEach((s) => s.answers.forEach((a) => {
    if (a.answer == null) return; // unverified questions never count
    const k = tkey(a), r = m[k] || (m[k] = { key: k, n: 0, ok: 0, att: 0, ms: 0 });
    r.n++;
    if (a.chosen != null) { r.att++; r.ms += a.timeMs || 0; if (a.chosen === a.answer) r.ok++; }
  }));
  return Object.values(m).map((r) => {
    const acc = (r.ok / r.n) * 100;
    return { ...r, acc, avg: r.att ? r.ms / r.att / 1000 : 0, level: r.n < minN ? 'new' : acc < 50 ? 'weak' : acc < 75 ? 'avg' : 'strong' };
  }).sort((a, b) => a.acc - b.acc);
}
const recent = () => sessions.slice(-10);
const weakTopics = () => analyze(recent()).filter((x) => x.level === 'weak' || x.level === 'avg').slice(0, 3);
function analysisHTML(list, title, minN) {
  const r = analyze(list, minN);
  if (!r.length) return `<div class="empty-state"><strong>No analysis yet</strong><p>Finish a test that has answer keys and your weak topics show up here.</p></div>`;
  const w = weakTopics();
  return `<div class="ta-title">${title}</div>` + r.map((x) =>
    `<div class="ta-row"><div class="ta-head"><strong>${esc(x.key)}</strong><span class="pill ${x.level}">${LV[x.level]}</span></div>` +
    `<div class="ta-bar"><i class="${x.level}" style="width:${Math.round(x.acc)}%"></i></div>` +
    `<small>${Math.round(x.acc)}% · ${x.ok}/${x.n} correct · ${x.avg.toFixed(0)}s avg per question</small></div>`).join('') +
    (w.length ? `<div class="ta-next"><strong>Focus next:</strong> ${w.map((x) => esc(x.key)).join(', ')}<button class="button primary" data-action="practice-weak">Practice weak topics →</button></div>` : '');
}
function practiceWeak() {
  const keys = new Set(weakTopics().map((x) => x.key));
  const pool = allTests().flatMap((t) => t.questions).filter((q) => q.answer != null && keys.has(tkey(q)));
  const seen = new Set(), uniq = pool.filter((q) => !seen.has(q.id) && seen.add(q.id));
  if (!uniq.length) return toast('Add more questions for your weak topics first.');
  uniq.sort(() => Math.random() - 0.5);
  openSettings({ id: 'weak-' + uid(), name: 'Weak-topic revision', questions: uniq.slice(0, 10) });
}

/* ---------- Views ---------- */
const titles = { home: 'Overview', tests: 'Practice tests', library: 'My question bank', progress: 'My progress', exam: 'Exam', result: 'Results' };
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active-view'));
  const t = $(name + '-view'); if (t) t.classList.add('active-view');
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if ($('crumb-current')) $('crumb-current').textContent = titles[name] || name;
  window.scrollTo(0, 0);
}
const openDlg = (id) => { const d = $(id); if (d && d.showModal && !d.open) d.showModal(); };
const closeDlg = (id) => { const d = $(id); if (d && d.open) d.close(); };

/* ---------- Dashboard renders ---------- */
function renderStats() {
  let ok = 0, seen = 0, ans = 0;
  sessions.forEach((s) => { ok += s.correct; seen += s.total; ans += s.correct + s.wrong; });
  const acc = seen ? Math.round((ok / seen) * 100) : null;
  $('stat-tests').textContent = sessions.length; $('stat-questions').textContent = ans;
  $('stat-accuracy').textContent = acc ?? '—'; $('accuracy-unit').textContent = acc != null ? '%' : '';
  $('progress-tests').textContent = sessions.length; $('progress-answered').textContent = ans;
  $('progress-accuracy').textContent = acc != null ? acc + '%' : '—';
}
const rowHTML = (s) => `<div class="act-row"><div><strong>${esc(s.name)}</strong><small>${new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${fmt(s.spent)}</small></div><div class="act-score"><strong>${+s.net.toFixed(2)}</strong><small>${s.total ? Math.round((s.correct / s.total) * 100) : 0}%</small></div></div>`;
function renderActivity() {
  if (sessions.length) $('activity-list').innerHTML = sessions.slice(-5).reverse().map(rowHTML).join('');
  $('progress-history').innerHTML = sessions.length ? sessions.slice(-10).reverse().map(rowHTML).join('') : '<div class="empty-state"><p>No tests yet.</p></div>';
  let box = $('topic-analysis');
  if (!box) {
    box = document.createElement('article'); box.id = 'topic-analysis'; box.className = 'panel analysis-panel';
    $('progress-view').querySelector('.progress-grid').appendChild(box);
    box.insertAdjacentHTML('afterend', '<div class="backup-row"><button class="button outline-button" data-action="export">Export backup</button><button class="button outline-button" data-action="import-backup">Import backup</button></div>');
  }
  box.innerHTML = analysisHTML(recent(), 'Topic performance (last 10 tests)', 3);
}
function renderTests() {
  $('custom-test-list').innerHTML = tests.map((t) => `<article class="wide-test-card"><div class="wide-card-copy"><span class="tag mint-tag">${t.source === 'pdf' ? 'FROM PDF' : 'CUSTOM'}</span><h3>${esc(t.name)}</h3><p>${t.questions.length} questions · ${t.questions.filter((q) => q.answer != null).length} with answer keys</p></div><button class="button primary" data-start="${t.id}">Start test <span>→</span></button></article>`).join('');
}
function renderLibrary() {
  $('library-content').innerHTML = tests.length ? tests.map((t) => `<details class="lib-test"><summary><strong>${esc(t.name)}</strong> <small>${t.questions.length} Qs · ${t.questions.filter((q) => q.answer != null).length} verified</small></summary>
<div class="lib-actions"><button class="button primary" data-start="${t.id}">Start</button><button class="button outline-button" data-del="${t.id}">Delete</button></div>
${t.questions.map((q, i) => `<div class="lib-q"><p>${i + 1}. ${esc(q.text)}</p><small>${q.options.map((o, k) => L[k] + ') ' + esc(o)).join(' · ')}</small>
<div class="lib-fields"><select data-t="${t.id}" data-i="${i}" data-f="answer"><option value="">No answer</option>${[0, 1, 2, 3].map((k) => `<option value="${k}"${q.answer === k ? ' selected' : ''}>${L[k]}</option>`).join('')}</select>
<input list="subject-list" data-t="${t.id}" data-i="${i}" data-f="subject" placeholder="Subject" value="${esc(q.subject)}">
<input list="topic-list" data-t="${t.id}" data-i="${i}" data-f="topic" placeholder="Topic" value="${esc(q.topic)}"></div></div>`).join('')}</details>`).join('')
    : '<div class="empty-state"><strong>No questions yet</strong><p>Import a PDF or build a custom set.</p></div>';
}
const renderAll = () => { renderStats(); renderActivity(); renderTests(); renderLibrary(); };
$('library-content').addEventListener('change', (e) => {
  const el = e.target, d = el.dataset; if (!d.f) return;
  const t = tests.find((x) => x.id === d.t); if (!t) return;
  t.questions[+d.i][d.f] = d.f === 'answer' ? (el.value === '' ? null : +el.value) : el.value.trim();
  saveTests(); renderTests(); renderStats();
});

/* ---------- Settings → start ---------- */
let pending = null;
function openSettings(test) { pending = test; $('settings-title').textContent = test.name; openDlg('settings-dialog'); }
$('test-duration').addEventListener('change', (e) => $('custom-time-wrap').classList.toggle('hidden', e.target.value !== 'custom'));
$('confirm-start').addEventListener('click', () => {
  if (!pending) return;
  const v = $('test-duration').value;
  const mins = v === 'custom' ? Math.max(1, +$('custom-time').value || 20) : +v;
  const cfg = { mins, pos: +$('positive-marks').value || 0, neg: +$('negative-marks').value || 0 };
  closeDlg('settings-dialog'); startTest(pending, cfg);
});

/* ---------- Exam engine ---------- */
let S = null;
function startTest(test, cfg) {
  if (!test.questions.length) return toast('This test has no questions.');
  S = { test, cfg, idx: 0, ans: {}, startedAt: Date.now(), qStart: Date.now(), remaining: cfg.mins ? cfg.mins * 60 : null, timer: null };
  $('exam-test-name').textContent = test.name;
  $('result-review').classList.add('hidden');
  showView('exam'); paintTimer(); renderQuestion();
  if (S.remaining) S.timer = setInterval(() => { if (--S.remaining <= 0) { paintTimer(); toast('Time is up!'); finish(); } else paintTimer(); }, 1000);
}
const paintTimer = () => { $('timer').textContent = S && S.remaining != null ? fmt(Math.max(0, S.remaining)) : '--:--'; };
const curQ = () => S.test.questions[S.idx];
function commit() { // add elapsed time to current question until it is answered
  const a = (S.ans[curQ().id] ||= {});
  if (a.chosen == null) a.timeMs = (a.timeMs || 0) + Date.now() - S.qStart;
  S.qStart = Date.now();
}
function go(i) { commit(); S.idx = i; renderQuestion(); }
function renderQuestion() {
  const q = curQ(), a = S.ans[q.id] || {}, n = S.test.questions.length, done = a.chosen != null;
  $('question-subject').textContent = `${q.subject || 'General'} · ${q.topic || 'Untagged'}`.toUpperCase();
  $('question-count').textContent = `QUESTION ${pad(S.idx + 1)} OF ${pad(n)}`;
  $('question-progress-bar').style.width = ((S.idx + 1) / n) * 100 + '%';
  $('question-text').textContent = q.text;
  $('mark-button').classList.toggle('active', !!a.marked);
  $('options-list').innerHTML = q.options.map((o, i) => {
    let c = '';
    if (done) { if (q.answer == null) c = i === a.chosen ? 'selected' : ''; else if (i === q.answer) c = 'correct'; else if (i === a.chosen) c = 'wrong'; }
    return `<button class="option ${c}" data-i="${i}"><b>${L[i]}</b><span>${esc(o)}</span></button>`;
  }).join('');
  const ex = $('answer-explainer');
  ex.classList.toggle('hidden', !done);
  if (done) ex.innerHTML = q.answer == null ? '<strong>No answer key.</strong> Saved, but not scored. Set the answer in My question bank.'
    : `<strong>${a.chosen === q.answer ? 'Correct ✓' : 'Incorrect. Right answer: ' + L[q.answer] + ') ' + esc(q.options[q.answer])}</strong>${q.explanation ? '<br>' + esc(q.explanation) : ''}`;
  $('previous-question').disabled = S.idx === 0;
  $('next-question').innerHTML = S.idx === n - 1 ? 'Save &amp; finish →' : 'Save &amp; next →';
  renderPalette();
}
function renderPalette() {
  $('question-palette').innerHTML = S.test.questions.map((q, i) => { const a = S.ans[q.id] || {}; return `<button class="pal ${i === S.idx ? 'current' : ''} ${a.chosen != null ? 'answered' : ''} ${a.marked ? 'review' : ''}" data-i="${i}">${i + 1}</button>`; }).join('');
  $('palette-count').textContent = S.test.questions.length;
}
$('options-list').addEventListener('click', (e) => {
  const b = e.target.closest('.option'); if (!b || !S) return;
  const q = curQ(), a = (S.ans[q.id] ||= {}); if (a.chosen != null) return; // practice mode: locked after first pick
  commit(); a.chosen = +b.dataset.i; renderQuestion();
});
$('question-palette').addEventListener('click', (e) => { const b = e.target.closest('.pal'); if (b && S) go(+b.dataset.i); });
$('mark-button').addEventListener('click', () => { if (!S) return; const a = (S.ans[curQ().id] ||= {}); a.marked = !a.marked; renderQuestion(); });
$('previous-question').addEventListener('click', () => S && S.idx > 0 && go(S.idx - 1));
$('next-question').addEventListener('click', () => { if (!S) return; S.idx < S.test.questions.length - 1 ? go(S.idx + 1) : askFinish(); });
$('submit-test').addEventListener('click', () => S && askFinish());
function askFinish() {
  const n = S.test.questions.length, a = S.test.questions.filter((q) => (S.ans[q.id] || {}).chosen != null).length;
  $('confirm-copy').textContent = a < n ? `You answered ${a} of ${n}. ${n - a} will count as skipped.` : 'All questions answered. Ready to see your results?';
  openDlg('confirm-dialog');
}
$('keep-practicing').addEventListener('click', () => closeDlg('confirm-dialog'));
$('confirm-submit').addEventListener('click', () => { closeDlg('confirm-dialog'); finish(); });

let last = null;
function finish() {
  if (!S) return;
  clearInterval(S.timer); commit(); closeDlg('confirm-dialog');
  const { test, cfg } = S; let c = 0, w = 0, sk = 0, un = 0;
  const answers = test.questions.map((q) => {
    const a = S.ans[q.id] || {}, r = { qId: q.id, subject: q.subject, topic: q.topic, chosen: a.chosen ?? null, answer: q.answer, timeMs: a.timeMs || 0, marked: !!a.marked };
    if (q.answer == null) un++; else if (r.chosen == null) sk++; else if (r.chosen === q.answer) c++; else w++;
    return r;
  });
  const total = c + w + sk;
  const s = { id: uid(), testId: test.id, name: test.name, date: Date.now(), cfg, total, correct: c, wrong: w, skipped: sk, unscored: un, net: c * cfg.pos - w * cfg.neg, max: total * cfg.pos, spent: Math.round((Date.now() - S.startedAt) / 1000), answers };
  sessions = [...sessions, s].slice(-200); saveSessions();
  last = { s, test }; S = null;
  renderAll(); showResult(s);
}
function showResult(s) {
  showView('result');
  const pct = s.max > 0 ? Math.max(0, (s.net / s.max) * 100) : 0, net = +s.net.toFixed(2);
  $('score-value').textContent = net; $('score-total').textContent = +s.max.toFixed(2); $('result-net').textContent = net;
  $('score-ring').style.background = `conic-gradient(var(--primary) ${pct}%, var(--border) 0)`;
  $('result-correct').textContent = s.correct; $('result-wrong').textContent = s.wrong; $('result-skipped').textContent = s.skipped;
  $('result-subtitle').textContent = s.total ? `${Math.round((s.correct / s.total) * 100)}% accuracy · ${fmt(s.spent)}` + (s.unscored ? ` · ${s.unscored} unscored (no answer key)` : '') : 'This test has no answer keys, so nothing was scored.';
  let box = $('result-analysis');
  if (!box) { box = document.createElement('div'); box.id = 'result-analysis'; box.className = 'panel analysis-panel'; $('result-review').before(box); }
  box.innerHTML = analysisHTML([s], 'This test, by topic', 1);
}
$('review-test').addEventListener('click', () => {
  if (!last) return;
  const { s, test } = last, box = $('result-review');
  box.innerHTML = test.questions.map((q, i) => {
    const a = s.answers[i], st = q.answer == null ? 'unscored' : a.chosen == null ? 'skipped' : a.chosen === q.answer ? 'ok' : 'bad';
    const lbl = { unscored: 'No key', skipped: 'Skipped', ok: 'Correct', bad: 'Wrong' }[st];
    return `<div class="rv-item ${st}"><div class="rv-top"><span class="pill ${st}">${lbl}</span><small>${esc(tkey(q))}</small></div><p>${i + 1}. ${esc(q.text)}</p><small>Your answer: ${a.chosen == null ? '—' : L[a.chosen] + ') ' + esc(q.options[a.chosen])}${q.answer != null ? ` · Correct: ${L[q.answer]}) ${esc(q.options[q.answer])}` : ''}</small>${q.explanation ? `<small class="rv-exp">${esc(q.explanation)}</small>` : ''}</div>`;
  }).join('');
  box.classList.toggle('hidden');
});

/* ---------- Custom question builder ---------- */
let bq = [];
function readBuilder() {
  const text = $('builder-question').value.trim(), opts = [0, 1, 2, 3].map((i) => $('builder-option-' + i).value.trim());
  if (!text || opts.some((o) => !o)) return null;
  const p = $('builder-subject').value.split('/').map((x) => x.trim()); // "Reasoning / Blood Relations"
  return { id: uid(), text, options: opts, answer: +$('builder-answer').value, subject: p[0] || 'General', topic: p[1] || 'Untagged', explanation: '' };
}
function clearBuilder() { ['builder-question', 'builder-option-0', 'builder-option-1', 'builder-option-2', 'builder-option-3'].forEach((i) => { $(i).value = ''; }); }
$('add-builder-question').addEventListener('click', () => {
  const q = readBuilder(); if (!q) return toast('Fill the question and all 4 options.');
  bq.push(q); clearBuilder(); $('builder-added').textContent = `${bq.length} question${bq.length > 1 ? 's' : ''} added`;
});
$('save-builder').addEventListener('click', () => {
  const q = readBuilder(); if (q) bq.push(q);
  if (!bq.length) return toast('Add at least one question.');
  tests.push({ id: 't' + uid(), name: $('builder-test-name').value.trim() || 'My custom practice', source: 'custom', questions: bq });
  bq = []; clearBuilder(); $('builder-added').textContent = '';
  saveTests(); renderAll(); closeDlg('builder-dialog'); toast('Test saved.');
});

/* ---------- PDF import (text PDFs only; answers are never guessed) ---------- */
function parseQuestions(txt) {
  const key = {}; let main = txt;
  const ki = txt.search(/answer\s*key|answers\s*:?\s*\n/i);
  if (ki > 0) {
    main = txt.slice(0, ki);
    txt.slice(ki).replace(/(\d{1,3})\s*[.:\-)]*\s*\(?([A-Da-d])\)?(?![a-z])/g, (_, n, a) => { key[+n] = a.toUpperCase().charCodeAt(0) - 65; });
  }
  const parts = main.split(/\n\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]\s+/), out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const n = +parts[i], m = parts[i + 1].replace(/\s+/g, ' ').trim().split(/\s*\(?\b([A-Da-d])[.)]\s+/);
    if (m.length < 9 || m[1].toUpperCase() !== 'A' || m[3].toUpperCase() !== 'B') continue;
    let d = m[8], ans = key[n] ?? null;
    const im = d.match(/\s*(?:Ans(?:wer)?|Correct(?: answer)?)\s*[:\-]?\s*\(?([A-Da-d])\)?.*$/i);
    if (im) { ans = im[1].toUpperCase().charCodeAt(0) - 65; d = d.slice(0, im.index); }
    out.push({ id: uid() + n, text: m[0], options: [m[2], m[4], m[6], d].map((s) => s.trim()), answer: ans, subject: 'General', topic: 'Untagged', explanation: '' });
  }
  return out;
}
async function handlePdf(file) {
  const st = $('import-status'); if (!file) return;
  if (!window.pdfjsLib) { st.textContent = 'PDF engine failed to load. Check your internet.'; return; }
  st.textContent = 'Reading PDF…';
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; let txt = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const c = await (await pdf.getPage(p)).getTextContent(); let y = null;
      for (const it of c.items) { const yy = it.transform[5]; if (y !== null && Math.abs(yy - y) > 3) txt += '\n'; txt += it.str + ' '; y = yy; }
      txt += '\n';
    }
    const qs = parseQuestions(txt);
    if (!qs.length) { st.textContent = 'No MCQs found. Scanned PDFs need OCR, or use the manual builder.'; return; }
    tests.push({ id: 't' + uid(), name: file.name.replace(/\.pdf$/i, ''), source: 'pdf', questions: qs });
    saveTests(); renderAll();
    st.textContent = `Found ${qs.length} questions, ${qs.filter((q) => q.answer != null).length} with answers. Open "My question bank" to verify answers and tag topics.`;
  } catch (err) { console.error(err); st.textContent = 'Could not read this PDF.'; }
}
$('pdf-file').addEventListener('change', (e) => { handlePdf(e.target.files[0]); e.target.value = ''; });
const dz = $('drop-zone');
['dragover', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop') handlePdf(e.dataTransfer.files[0]); }));

/* ---------- Backup ---------- */
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ tests, sessions })], { type: 'application/json' }));
  a.download = 'prepdesk-backup.json'; a.click();
}
$('backup-file').addEventListener('change', async (e) => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(d.tests) || !Array.isArray(d.sessions)) throw 0;
    if (!confirm('Replace current data with this backup?')) return;
    tests = d.tests; sessions = d.sessions; saveTests(); saveSessions(); renderAll(); toast('Backup restored.');
  } catch (err) { toast('Invalid backup file.'); }
  e.target.value = '';
});

/* ---------- Global click routing ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action],[data-view],[data-start],[data-del]'); if (!el) return;
  const d = el.dataset;
  if (d.view) return showView(d.view);
  if (d.start) { const t = allTests().find((x) => x.id === d.start); if (t) openSettings(t); return; }
  if (d.del) { if (confirm('Delete this test?')) { tests = tests.filter((t) => t.id !== d.del); saveTests(); renderAll(); } return; }
  switch (d.action) {
    case 'open-import': openDlg('import-dialog'); break;
    case 'open-builder': closeDlg('import-dialog'); openDlg('builder-dialog'); break;
    case 'start-sample': openSettings(SAMPLE); break;
    case 'home': showView('home'); break;
    case 'exit-test': if (S) { clearInterval(S.timer); S = null; } showView('home'); break;
    case 'practice-weak': practiceWeak(); break;
    case 'export': exportData(); break;
    case 'import-backup': $('backup-file').click(); break;
  }
});

/* ---------- PWA install + init ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.promptInstall = async () => {
  if (!deferredPrompt) return toast('Use your browser menu → Install app.');
  deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; deferredPrompt = null;
  if (outcome === 'accepted') toast('Prepdesk installed!');
};
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.documentElement.classList.add('pwa-standalone');
if ($('today-date')) $('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
renderAll();
const params = new URLSearchParams(location.search);
if (params.get('view') && $(params.get('view') + '-view')) showView(params.get('view'));
if (params.get('action') === 'start-sample') openSettings(SAMPLE);
})();
