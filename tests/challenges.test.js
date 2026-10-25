// Challenge tests: every challenge parses, its intended solution path is
// accepted step by step by the engine itself, and the final step matches the
// target. Also covers the self verifying rule book examples.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStep, prepareStep, sameStep, RULES, RULE_BY_ID } from '../js/rules.js';
import { CHALLENGES, TIERS } from '../js/challenges.js';
import { BOOK } from '../js/book.js';

test('the challenge set has fifteen graded challenges in three tiers', () => {
  assert.equal(CHALLENGES.length, 15);
  assert.equal(TIERS.length, 3);
  const ids = new Set(CHALLENGES.map((c) => c.id));
  assert.equal(ids.size, 15);
  for (const c of CHALLENGES) {
    assert.ok(TIERS.some((t) => t.id === c.tier), c.id + ' has a tier');
    assert.ok(c.title && c.hint, c.id + ' has a title and hint');
  }
});

for (const c of CHALLENGES) {
  test('challenge ' + c.id + ' (' + c.title + ') parses given and target', () => {
    const given = prepareStep(c.given);
    assert.notEqual(given.kind, 'error', 'given fails to parse: ' + (given.error && given.error.message));
    const target = prepareStep(c.target);
    assert.notEqual(target.kind, 'error', 'target fails to parse: ' + (target.error && target.error.message));
  });

  test('challenge ' + c.id + ' is solvable by the engine on its intended path', () => {
    let prev = prepareStep(c.given);
    const target = prepareStep(c.target);
    assert.ok(c.path.length >= 1, c.id + ' has at least one step');
    for (let i = 0; i < c.path.length; i++) {
      const cur = prepareStep(c.path[i]);
      assert.notEqual(cur.kind, 'error',
        'step ' + (i + 1) + ' (' + c.path[i] + ') fails to parse: ' + (cur.error && cur.error.message));
      const v = checkStep(prev, cur);
      assert.equal(v.ok, true,
        'step ' + (i + 1) + ' (' + c.path[i] + ') rejected: ' + (v.message || ''));
      prev = cur;
    }
    assert.equal(sameStep(target, prev), true, c.id + ' path must end at the target');
  });
}

test('the quadratic formula derivation runs seven engine checked steps', () => {
  const c = CHALLENGES[CHALLENGES.length - 1];
  assert.equal(c.id, 'c15');
  assert.equal(c.path.length, 7);
});

test('every rule book example is accepted by the engine', () => {
  assert.equal(BOOK.length, RULES.length);
  for (const entry of BOOK) {
    const rule = RULE_BY_ID[entry.ruleId];
    assert.ok(rule, 'book entry ' + entry.ruleId + ' maps to a rule');
    const prev = prepareStep(entry.worked.prev);
    const cur = prepareStep(entry.worked.cur);
    assert.notEqual(prev.kind, 'error', entry.ruleId + ' example prev parses');
    assert.notEqual(cur.kind, 'error', entry.ruleId + ' example cur parses');
    const v = checkStep(prev, cur);
    assert.equal(v.ok, true, entry.ruleId + ' example must hold: ' + (v.message || ''));
    assert.equal(v.ruleId, entry.ruleId, entry.ruleId + ' example must cite its own rule');
  }
});
