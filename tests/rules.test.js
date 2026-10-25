// Engine tests: exact canonical algebra, every rule with positive and negative
// cases, the both roots requirement, domain notes, and the diagnostics.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPair, prepareStep, sameStep, RULES } from '../js/rules.js';
import { Rat, Val, RF, valEqual, valSqrt, polyExactDivide, canon, canonEq } from '../js/algebra.js';
import { parseStep } from '../js/parse.js';

function ok(prev, cur, ruleId) {
  const r = checkPair(prev, cur);
  assert.equal(r.ok, true, prev + ' -> ' + cur + ' should hold: ' + (r.message || ''));
  if (ruleId) assert.equal(r.ruleId, ruleId);
  return r;
}

function rejects(prev, cur, match) {
  const r = checkPair(prev, cur);
  assert.equal(r.ok, false, prev + ' -> ' + cur + ' should be rejected');
  if (match) assert.match(r.message, match);
  return r;
}

// ---------------------------------------------------------------------------
// Exact canonical algebra
// ---------------------------------------------------------------------------

test('canonical algebra is exact across shapes', () => {
  const eq = (a, b) => {
    const pa = parseStep(a), pb = parseStep(b);
    const va = pa.kind === 'expr' ? canon(pa.ast) : canonEq(pa.ast).l;
    const vb = pb.kind === 'expr' ? canon(pb.ast) : canonEq(pb.ast).l;
    return valEqual(va, vb);
  };
  assert.equal(eq('x*x = 0', 'x^2 = 0'), true);
  assert.equal(eq('3(x + 4) = 0', '3x + 12 = 0'), true);
  assert.equal(eq('(x + 1)(x + 2) = 0', 'x^2 + 3x + 2 = 0'), true);
  assert.equal(eq('sqrt(9/4) = 0', '3/2 = 0'), true);
  assert.equal(eq('sqrt(2) = 0', '1.414 = 0'), false);
  assert.equal(eq('x/2 = 0', '0.5x = 0'), true);
});

test('radical and absolute value arithmetic collapses exactly', () => {
  assert.equal(checkPair('y = sqrt(8)*sqrt(2)', 'y = 4').ok, true);
  assert.equal(checkPair('y = (sqrt(x))^2', 'y = x').ok, true);
  assert.equal(checkPair('y = sqrt(2)*sqrt(3)', 'y = sqrt(6)').ok, true);
  assert.equal(checkPair('y = | -3 |', 'y = 3').ok, true);
});

test('polynomial exact division recognizes honest multipliers', () => {
  const a = parseStep('4a^2x^2 + 4abx = 0').ast.a;
  const b = parseStep('ax^2 + bx = 0').ast.a;
  const q = polyExactDivide(canon(a).asRF().num, canon(b).asRF().num);
  assert.ok(q);
  assert.equal(q.toPlain(), '4a');
});

test('rationals keep exact fractions', () => {
  const third = new Rat(1n, 3n);
  const sum = third.add(third).add(third);
  assert.ok(sum.isInt() && sum.n === 1n);
});

// ---------------------------------------------------------------------------
// Rule catalog coverage
// ---------------------------------------------------------------------------

test('all thirteen rules are in the catalog', () => {
  assert.equal(RULES.length, 13);
  for (const r of RULES) {
    assert.ok(r.id && r.name && r.statement, 'rule ' + r.id + ' needs metadata');
  }
});

test('addition property: positive and negative', () => {
  ok('x + 7 = 12', 'x = 5', 'add');
  ok('5x - 4 = 3x + 8', '2x - 4 = 8', 'add');
  rejects('x + 7 = 12', 'x = 4');
  rejects('x + 7 = 12', 'x = 5 = 12', /single = sign/);
});

test('multiplication property: positive, division, and negatives', () => {
  ok('3x = 15', 'x = 5', 'mul');
  ok('x/4 = 2', 'x = 8', 'mul');
  ok('4 - 2x = 10', '-2x = 6', 'add');
  rejects('3x = 15', 'x = 6');
  rejects('x + 1 = 2', '0 = 0', /zero/);
  rejects('x^2 + 7x + 12 = 0', '5 = 0');
});

test('multiplication by an expression carries the domain note', () => {
  const r = ok('ax^2 + bx + c = 0', '4a^2x^2 + 4abx + 4ac = 0', 'mul');
  assert.match(r.note, /nonzero|defined/);
});

test('symmetry of equality: positive and negative', () => {
  ok('5 = x + 2', 'x + 2 = 5', 'symmetry');
  rejects('5 = x + 2', 'x + 2 = 6');
});

test('evaluate arithmetic: positive and negative', () => {
  ok('x = 2 + 3', 'x = 5', 'evaluate');
  ok('y = sqrt(16)', 'y = 4', 'evaluate');
  rejects('x = 2 + 3', 'x = 6');
  rejects('y = sqrt(-4)', 'y = 2', /negative/);
});

test('combine like terms: positive and negative', () => {
  ok('5x + 2x = 14', '7x = 14', 'combine');
  ok('7x - 2x + 5 = 20', '5x + 5 = 20', 'combine');
  rejects('5x + 2x = 14', '8x = 14');
});

test('distributive property: positive and negative', () => {
  ok('2(x + 5) = 16', '2x + 10 = 16', 'distribute');
  ok('2(3x - 1) + 4x', '6x - 2 + 4x', 'distribute');
  rejects('2(x + 5) = 16', '2x + 5 = 16');
  rejects('2(x + 5) = 16', '3(x + 5) = 16');
});

test('factoring: trinomial, common factor, and negatives', () => {
  ok('x^2 + 7x + 12 = 0', '(x + 3)(x + 4) = 0', 'factor');
  ok('3x + 12 = 0', '3(x + 4) = 0', 'factor');
  rejects('x^2 + 7x + 12 = 0', '(x + 3)(x + 5) = 0');
  rejects('x^2 + 7x + 12 = 0', '(x + 3)(x + 4) = 1');
});

test('complete the square: positive and negative', () => {
  ok('x^2 + 6x + 9 = 4', '(x + 3)^2 = 4', 'complete-square');
  ok('4a^2x^2 + 4abx + b^2 = b^2 - 4ac', '(2ax + b)^2 = b^2 - 4ac', 'complete-square');
  rejects('x^2 + 6x + 8 = 4', '(x + 3)^2 = 4');
});

test('power rule: positive and negative', () => {
  ok('(2x)^2 = 36', '4x^2 = 36', 'power');
  ok('x^2 * x^3 = 32', 'x^5 = 32', 'power');
  ok('(x^2)^3 = 64', 'x^6 = 64', 'power');
  rejects('(2x)^2 = 36', '2x^2 = 36');
  rejects('x^6 = 64', 'x^8 = 64');
});

test('square root rule: both roots, the absolute value form, and domain notes', () => {
  ok('x^2 = 81', 'x = 9 or x = -9', 'root');
  ok('x^2 = 81', '|x| = 9', 'root');
  ok('x^2 = 2', 'x = sqrt(2) or x = -sqrt(2)', 'root');
  ok('(x - 2)^2 = 25', 'x - 2 = 5 or x - 2 = -5', 'root');
  ok('sqrt(2x + 3) = 5', '2x + 3 = 25', 'root');
  ok('x^2 = -9', 'no solution', 'root');
  rejects('x^2 = 81', 'x = 9', /only one of the two roots/);
  rejects('x^2 = -9', 'x = 3 or x = -3', /no real roots|never equal/);
  rejects('sqrt(2x + 3) = 5', '2x + 3 = 10');
});

test('square roots of negatives are rejected as a domain error', () => {
  const s = prepareStep('y = sqrt(-4)');
  assert.equal(s.kind, 'error');
  assert.match(s.error.message, /negative/);
  assert.equal(s.error.code, 'domain');
});

test('absolute value rule: both cases, no solution, negatives', () => {
  ok('|x - 2| = 7', 'x - 2 = 7 or x - 2 = -7', 'abs');
  ok('|x - 3| = 5', 'x - 3 = 5 or x - 3 = -5', 'abs');
  ok('|x + 4| = -2', 'no solution', 'abs');
  rejects('|x - 2| = 7', 'x - 2 = 7', /only one of the two cases/);
  rejects('|x + 4| = -2', 'x + 4 = -2 or x + 4 = 2', /never negative/);
});

test('zero product property: split, constant factors, negatives', () => {
  ok('(x - 1)(x + 5) = 0', 'x - 1 = 0 or x + 5 = 0', 'zero-product');
  ok('2(x - 3) = 0', 'x - 3 = 0', 'zero-product');
  rejects('(x - 1)(x + 5) = 0', 'x - 1 = 0', /one equation per factor/);
  rejects('(x - 1)(x + 5) = 0', 'x - 1 = 0 or x + 4 = 0');
});

test('quadratic formula: positive, wrong discriminant, single root, negative D', () => {
  ok('x^2 - 5x + 6 = 0', 'x = (5 + sqrt(25 - 24))/2 or x = (5 - sqrt(25 - 24))/2', 'quad-form');
  ok('2x^2 + 3x - 2 = 0', 'x = (-3 + sqrt(9 + 16))/4 or x = (-3 - sqrt(9 + 16))/4', 'quad-form');
  rejects('x^2 - 5x + 6 = 0', 'x = (5 + sqrt(25 + 24))/2 or x = (5 - sqrt(25 + 24))/2');
  rejects('x^2 - 5x + 6 = 0', 'x = 3', /loses a solution/);
  ok('x^2 + x + 1 = 0', 'no solution', 'quad-form');
});

// ---------------------------------------------------------------------------
// Or steps, traps, and diagnostics
// ---------------------------------------------------------------------------

test('or steps are solved elementwise and may not drop a branch', () => {
  ok('x - 3 = 5 or x - 3 = -5', 'x = 8 or x = -2', 'add');
  rejects('x - 3 = 5 or x - 3 = -5', 'x = 8 or x = -2 or x = 0', /same number of branches/);
  rejects('x - 3 = 5 or x - 3 = -5', 'x - 3 = 5 or x = -2', /unchanged/);
  rejects('x - 3 = 5 or x - 3 = -5', 'x = 8');
});

test('squaring both sides is rejected with the extraneous solution warning', () => {
  rejects('x = 3', 'x^2 = 9', /squaring both sides/);
});

test('identical steps are rejected', () => {
  rejects('2x + 3 = 11', '2x + 3 = 11', /identical/);
  rejects('2(3x - 1) + 4x', '2(3x - 1) + 4x', /identical/);
});

test('a dropped solution produces a counterexample witness', () => {
  const r = rejects('2x + 3 = 11', 'x = 5');
  assert.match(r.message, /x = 4/);
  const s = rejects('3(x + 4) = 21', '3x + 4 = 21');
  assert.match(s.message, /changed by -8/);
});

test('one sided changes are named precisely', () => {
  rejects('x + 7 = 12', 'x = 5 = 12', /single = sign/);
  const r = rejects('x + 7 = 12', '2x + 7 = 12');
  assert.ok(r.message.length > 10);
});

test('kind mismatches are explained', () => {
  rejects('2x = 4', 'x', /equation/);
  rejects('2x + 4x', '6x = 0', /expression/);
});

test('target matching treats or branches as a set', () => {
  const target = prepareStep('x = 8 or x = -2');
  assert.equal(sameStep(target, prepareStep('x = -2 or x = 8')), true);
  assert.equal(sameStep(target, prepareStep('x = 8 or x = 2')), false);
  assert.equal(sameStep(prepareStep('no solution'), prepareStep('no solution')), true);
});

test('nothing follows a no solution step', () => {
  rejects('no solution', 'x = 1', /nothing follows/);
});

test('expression chains classify as distribute then combine', () => {
  ok('6x - 2 + 4x', '10x - 2', 'combine');
  ok('2(3x - 1) + 4x', '6x - 2 + 4x', 'distribute');
  rejects('2(3x - 1) + 4x', '10x - 3');
});

test('canonical value helpers behave', () => {
  const half = Val.rat(new Rat(1n, 2n));
  const sq = valSqrt(Val.rat(new Rat(9n, 4n)));
  assert.ok(valEqual(sq, Val.rat(new Rat(3n, 2n))));
  assert.ok(half.asRF() instanceof RF);
});
