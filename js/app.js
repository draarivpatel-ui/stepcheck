// StepCheck application: challenge selection, the proof ladder, feedback, and
// the self verifying rule book. All state lives in memory on this page.

import { prepareStep, checkStep, sameStep, RULES, RULE_BY_ID } from './rules.js';
import { CHALLENGES, TIERS } from './challenges.js';
import { BOOK } from './book.js';
import { stepToMath } from './render.js';
import { parseStep } from './parse.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  challengeId: null, // null means free practice
  steps: [],         // {raw, step (prepared), ruleId?, note?}
  done: false,
  completed: new Set()
};

const FREE = { id: 'free', title: 'Free practice', given: null, target: null };

function currentChallenge() {
  if (state.challengeId === null) return FREE;
  return CHALLENGES.find((c) => c.id === state.challengeId) || FREE;
}

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const els = {
  challengeList: document.getElementById('challenge-list'),
  panelTitle: document.getElementById('panel-title'),
  panelGiven: document.getElementById('panel-given'),
  ladder: document.getElementById('ladder'),
  doneNote: document.getElementById('done-note'),
  doneDetail: document.getElementById('done-detail'),
  form: document.getElementById('step-form'),
  input: document.getElementById('step-input'),
  addBtn: document.getElementById('add-step'),
  undoBtn: document.getElementById('undo-step'),
  resetBtn: document.getElementById('reset-proof'),
  hintBtn: document.getElementById('show-hint'),
  hintText: document.getElementById('hint-text'),
  feedback: document.getElementById('feedback'),
  progress: document.getElementById('progress-count'),
  ruleGrid: document.getElementById('rule-grid'),
  stepLabel: document.getElementById('step-label')
};

function mathSpan(step) {
  const span = document.createElement('span');
  span.className = 'math';
  span.innerHTML = stepToMath(step);
  return span;
}

// ---------------------------------------------------------------------------
// Challenge rail
// ---------------------------------------------------------------------------

function buildChallengeList() {
  els.challengeList.innerHTML = '';

  // Free practice card first.
  const freeLi = document.createElement('li');
  freeLi.appendChild(challengeButton(FREE, 'Free practice', 'start from any statement you like'));
  els.challengeList.appendChild(freeLi);

  for (const tier of TIERS) {
    const tierLi = document.createElement('li');
    tierLi.className = 'tier-label';
    tierLi.textContent = tier.name;
    els.challengeList.appendChild(tierLi);
    for (const c of CHALLENGES.filter((x) => x.tier === tier.id)) {
      const li = document.createElement('li');
      li.appendChild(challengeButton(c, c.num ? c.num + '. ' + c.title : c.title, c.given));
      els.challengeList.appendChild(li);
    }
  }
}

function challengeButton(c, title, subtitle) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'challenge-btn';
  btn.dataset.id = c.id;
  btn.setAttribute('aria-pressed', 'false');

  const num = document.createElement('span');
  num.className = 'cnum';
  num.textContent = c.id === 'free' ? '\u221a' : String(CHALLENGES.indexOf(c) + 1);
  num.setAttribute('aria-hidden', 'true');

  const body = document.createElement('span');
  const t = document.createElement('span');
  t.className = 'ctitle';
  t.textContent = title;
  body.appendChild(t);
  if (subtitle) {
    const s = document.createElement('span');
    s.className = 'cgiven';
    s.innerHTML = mathTextOrPlain(subtitle);
    body.appendChild(s);
  }

  btn.appendChild(num);
  btn.appendChild(body);
  btn.addEventListener('click', () => selectChallenge(c.id));
  return btn;
}

// Render a short math string for the rail; fall back to plain text if the
// string does not parse (it always should).
function mathTextOrPlain(raw) {
  try {
    const step = parseStep(raw);
    return stepToMath(step);
  } catch (err) {
    const span = document.createElement('span');
    span.textContent = raw;
    return span.outerHTML;
  }
}

function refreshRail() {
  for (const btn of els.challengeList.querySelectorAll('.challenge-btn')) {
    const active = btn.dataset.id === (state.challengeId === null ? 'free' : state.challengeId);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
    const isFree = btn.dataset.id === 'free';
    btn.classList.toggle('is-done', !isFree && state.completed.has(btn.dataset.id));
  }
  els.progress.textContent = String(state.completed.size);
}

// ---------------------------------------------------------------------------
// Ladder rendering
// ---------------------------------------------------------------------------

function renderLadder() {
  els.ladder.innerHTML = '';
  const challenge = currentChallenge();

  state.steps.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === 0 && challenge.given !== null) {
      li.className = 'given-row';
      const cite = document.createElement('div');
      cite.className = 'step-cite';
      cite.textContent = 'Given';
      li.appendChild(cite);
    }

    const no = document.createElement('span');
    no.className = 'step-no';
    no.setAttribute('aria-hidden', 'true');
    no.textContent = String(i + 1);
    li.appendChild(no);

    const math = document.createElement('div');
    math.className = 'step-math';
    math.appendChild(mathSpan(entry.step));
    li.appendChild(math);

    if (!(i === 0 && challenge.given !== null) && entry.ruleId) {
      const cite = document.createElement('div');
      cite.className = 'step-cite';
      const rule = RULE_BY_ID[entry.ruleId];
      const name = document.createElement('span');
      name.textContent = rule ? rule.name : entry.ruleId;
      cite.appendChild(name);
      if (entry.note) {
        const detail = document.createElement('span');
        detail.className = 'cite-note';
        detail.textContent = ' \u00b7 ' + entry.note;
        cite.appendChild(detail);
      }
      li.appendChild(cite);
    }

    els.ladder.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

function setFeedback(kind, verdictNode) {
  els.feedback.className = 'feedback' + (kind ? ' is-' + kind : '');
  els.feedback.innerHTML = '';
  if (verdictNode) els.feedback.appendChild(verdictNode);
}

function okVerdict(ruleId, note) {
  const rule = RULE_BY_ID[ruleId];
  const p = document.createElement('span');
  p.className = 'verdict';
  const strong = document.createElement('strong');
  strong.textContent = rule ? rule.name : 'Accepted';
  p.appendChild(document.createTextNode('Holds by '));
  p.appendChild(strong);
  if (note) p.appendChild(document.createTextNode(': ' + note + '.'));
  else p.appendChild(document.createTextNode('.'));
  return p;
}

function errorVerdict(message, raw, pos) {
  const wrapEl = document.createElement('span');
  wrapEl.className = 'verdict';
  wrapEl.textContent = message;
  if (typeof pos === 'number' && pos >= 0 && raw) {
    const echo = document.createElement('span');
    echo.className = 'error-echo';
    echo.setAttribute('aria-hidden', 'true');
    const before = raw.slice(0, pos);
    const at = raw.slice(pos, pos + 1);
    const after = raw.slice(pos + 1);
    echo.appendChild(document.createTextNode(before));
    const mark = document.createElement('mark');
    mark.className = 'err-char';
    mark.textContent = at === '' ? '\u200b' : at;
    echo.appendChild(mark);
    echo.appendChild(document.createTextNode(after));
    wrapEl.appendChild(echo);
  }
  return wrapEl;
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

function selectChallenge(id) {
  state.challengeId = id === 'free' ? null : id;
  resetProof(true);
  const challenge = currentChallenge();
  els.panelTitle.textContent = challenge.title || 'Free practice';
  els.panelGiven.innerHTML = '';
  if (challenge.given) {
    const label = document.createElement('span');
    label.textContent = 'Given: ';
    els.panelGiven.appendChild(label);
    try {
      const givenStep = prepareStep(challenge.given);
      els.panelGiven.appendChild(mathSpan(givenStep));
    } catch (err) {
      els.panelGiven.appendChild(document.createTextNode(challenge.given));
    }
    els.panelGiven.appendChild(document.createTextNode(' Prove: '));
    try {
      els.panelGiven.appendChild(mathSpan(prepareStep(challenge.target)));
    } catch (err) {
      els.panelGiven.appendChild(document.createTextNode(challenge.target));
    }
  } else {
    els.panelGiven.textContent = 'Type any first statement; the engine will check every step after it.';
  }

  els.hintText.hidden = true;
  els.hintText.textContent = challenge.hint || 'There is no hint in free practice; the Rule Book below is your reference.';
  els.hintBtn.hidden = !challenge.hint;
  refreshRail();
  setFeedback('', null);
  els.input.focus();
}

function resetProof(keepChallenge) {
  const challenge = currentChallenge();
  state.steps = [];
  state.done = false;
  if (challenge.given) {
    state.steps.push({ raw: challenge.given, step: prepareStep(challenge.given) });
  }
  els.doneNote.hidden = true;
  els.input.disabled = false;
  els.addBtn.disabled = false;
  els.stepLabel.textContent = challenge.given ? 'Your next step' : 'Your first step';
  els.input.placeholder = challenge.given
    ? 'write the next step'
    : 'write a first statement, like 2x + 3 = 11';
  renderLadder();
  refreshRail();
  if (!keepChallenge) setFeedback('', null);
}

function submitStep() {
  if (state.done) return;
  const raw = els.input.value.trim();
  if (!raw) {
    setFeedback('error', errorVerdict('Type a step first, or press Undo to go back.', '', -1));
    els.input.focus();
    return;
  }
  const cur = prepareStep(raw);

  if (cur.kind === 'error') {
    setFeedback('error', errorVerdict(cur.error.message, raw, cur.error.pos));
    return;
  }

  if (state.steps.length === 0) {
    // Free practice first step: accepted as the base of the ladder.
    state.steps.push({ raw, step: cur });
    els.input.value = '';
    els.stepLabel.textContent = 'Your next step';
    renderLadder();
    setFeedback('ok', baseVerdict(cur));
    return;
  }

  const prev = state.steps[state.steps.length - 1].step;
  const verdict = checkStep(prev, cur);

  if (!verdict.ok) {
    setFeedback('error', errorVerdict(verdict.message, raw, -1));
    return;
  }

  const challenge = currentChallenge();
  const reachedTarget = challenge.target
    ? sameStep(prepareStep(challenge.target), cur)
    : false;

  state.steps.push({ raw, step: cur, ruleId: verdict.ruleId, note: verdict.note });
  els.input.value = '';
  renderLadder();

  if (reachedTarget) {
    state.done = true;
    if (challenge.id) state.completed.add(challenge.id);
    els.doneNote.hidden = false;
    els.doneDetail.textContent = 'The ladder reaches the target in '
      + (state.steps.length - 1) + ' checked step' + (state.steps.length - 1 === 1 ? '' : 's')
      + '. Choose another challenge, or reset to run it again.';
    els.input.disabled = true;
    els.addBtn.disabled = true;
    setFeedback('ok', okVerdict(verdict.ruleId, verdict.note));
    refreshRail();
  } else {
    setFeedback('ok', okVerdict(verdict.ruleId, verdict.note));
  }
}

function baseVerdict(step) {
  const p = document.createElement('span');
  p.className = 'verdict';
  p.textContent = 'Base step set. Every step after this one is checked against it.';
  return p;
}

function undoStep() {
  const challenge = currentChallenge();
  const min = challenge.given ? 1 : 0;
  if (state.steps.length <= min) return;
  state.steps.pop();
  if (state.done) {
    state.done = false;
    els.doneNote.hidden = true;
    els.input.disabled = false;
    els.addBtn.disabled = false;
  }
  renderLadder();
  setFeedback('', null);
  els.input.focus();
}

// ---------------------------------------------------------------------------
// Rule book
// ---------------------------------------------------------------------------

function buildRuleBook() {
  els.ruleGrid.innerHTML = '';
  RULES.forEach((rule, i) => {
    const entry = BOOK.find((b) => b.ruleId === rule.id);
    const card = document.createElement('details');
    card.className = 'rule-card';

    const summary = document.createElement('summary');
    const num = document.createElement('span');
    num.className = 'rnum';
    num.textContent = String(i + 1);
    num.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'rname';
    name.textContent = rule.name;
    const toggle = document.createElement('span');
    toggle.className = 'rtoggle';
    toggle.setAttribute('aria-hidden', 'true');
    summary.appendChild(num);
    summary.appendChild(name);
    summary.appendChild(toggle);
    card.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'rule-body';

    const statement = document.createElement('p');
    statement.className = 'rule-statement';
    statement.textContent = rule.statement;
    body.appendChild(statement);

    if (entry) {
      const ex = document.createElement('div');
      ex.className = 'ex-ladder';
      const rowPrev = document.createElement('div');
      rowPrev.className = 'ex-row';
      const lab1 = document.createElement('span');
      lab1.className = 'ex-label';
      lab1.textContent = 'from';
      const m1 = document.createElement('span');
      m1.className = 'ex-math';
      try { m1.innerHTML = stepToMath(prepareStep(entry.worked.prev)); }
      catch (err) { m1.textContent = entry.worked.prev; }
      rowPrev.appendChild(lab1);
      rowPrev.appendChild(m1);
      const rowCur = document.createElement('div');
      rowCur.className = 'ex-row';
      const lab2 = document.createElement('span');
      lab2.className = 'ex-label';
      lab2.textContent = 'to';
      const m2 = document.createElement('span');
      m2.className = 'ex-math';
      try { m2.innerHTML = stepToMath(prepareStep(entry.worked.cur)); }
      catch (err) { m2.textContent = entry.worked.cur; }
      rowCur.appendChild(lab2);
      rowCur.appendChild(m2);
      ex.appendChild(rowPrev);
      ex.appendChild(rowCur);
      body.appendChild(ex);

      const say = document.createElement('p');
      say.className = 'rule-say';
      say.textContent = entry.say;
      body.appendChild(say);
    }

    if (rule.notes && rule.notes.length) {
      const notes = document.createElement('ul');
      notes.className = 'rule-notes';
      rule.notes.forEach((n) => {
        const li = document.createElement('li');
        li.textContent = n;
        notes.appendChild(li);
      });
      body.appendChild(notes);
    }

    if (entry) {
      const verdict = document.createElement('p');
      verdict.className = 'rule-verdict';
      let res;
      try {
        res = checkStep(prepareStep(entry.worked.prev), prepareStep(entry.worked.cur));
      } catch (err) {
        res = { ok: false, message: err.message };
      }
      if (res.ok) {
        verdict.classList.add('is-ok');
        const strong = document.createElement('strong');
        strong.textContent = 'Engine check: accepted';
        verdict.appendChild(strong);
        verdict.appendChild(document.createTextNode(' by the ' + (RULE_BY_ID[res.ruleId] ? RULE_BY_ID[res.ruleId].name : res.ruleId) + ' on this page load.'));
      } else {
        verdict.classList.add('is-bad');
        verdict.textContent = 'Engine check failed: ' + (res.message || 'unknown');
      }
      body.appendChild(verdict);
    }

    card.appendChild(body);
    els.ruleGrid.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

buildChallengeList();
buildRuleBook();
selectChallenge(null);

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  submitStep();
});
els.undoBtn.addEventListener('click', undoStep);
els.resetBtn.addEventListener('click', () => {
  resetProof(false);
  els.input.focus();
});
els.hintBtn.addEventListener('click', () => {
  const open = els.hintText.hidden;
  els.hintText.hidden = !open;
  els.hintBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
});
