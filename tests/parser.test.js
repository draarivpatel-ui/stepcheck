// Parser tests: valid forms across the whole subset, and precise failures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStep, astToPlain, ParseError } from '../js/parse.js';
import { canon, canonEq } from '../js/algebra.js';

function parsed(raw) { return parseStep(raw); }

test('parses linear equations with integer coefficients', () => {
  const s = parsed('2x + 3 = 11');
  assert.equal(s.kind, 'eq');
  const e = canonEq(s.ast);
  assert.equal(e.l.toPlain(), '2x + 3');
  assert.equal(e.r.toPlain(), '11');
});

test('parses decimals as exact rationals', () => {
  const s = parsed('x = 2.5');
  assert.equal(canonEq(s.ast).r.toPlain(), '5/2');
  const t = parsed('0.5x + 1 = 2');
  assert.equal(canonEq(t.ast).l.toPlain(), '(1/2)x + 1');
});

test('parses negative coefficients and unary minus', () => {
  const s = parsed('4 - 2x = 10');
  assert.equal(s.kind, 'eq');
  const e = canonEq(s.ast);
  assert.ok(!e.l.isZero());
});

test('parses implicit multiplication in several shapes', () => {
  assert.equal(parsed('3x = 6').kind, 'eq');
  assert.equal(parsed('3(x + 4) = 21').kind, 'eq');
  assert.equal(parsed('xy = 12').kind, 'eq');
  assert.equal(parsed('(x + 1)(x + 2) = 0').kind, 'eq');
  assert.equal(parsed('4a^2x^2 = 0').kind, 'eq');
});

test('parses nested parentheses and division', () => {
  const s = parsed('x - (3 - x) = 2');
  const e = canonEq(s.ast);
  assert.equal(e.l.toPlain(), '2x - 3');
  const d = parsed('x/2 = 4');
  assert.equal(d.kind, 'eq');
});

test('parses powers with ^, superscripts, and the 1/2 exponent', () => {
  assert.equal(parsed('x^2 = 49').kind, 'eq');
  assert.equal(parsed('x\u00b2 = 49').kind, 'eq');
  assert.equal(parsed('x^3 - 8 = 0').kind, 'eq');
  const half = parsed('x^(1/2) = 3');
  assert.equal(half.ast.a.t, 'sqrt');
  const dec = parsed('x^0.5 = 3');
  assert.equal(dec.ast.a.t, 'sqrt');
});

test('parses square roots, radicals, and absolute value', () => {
  assert.equal(parsed('sqrt(2x + 3) = 5').kind, 'eq');
  assert.equal(parsed('\u221a9 = 3').kind, 'eq');
  assert.equal(parsed('|x - 3| = 5').kind, 'eq');
  assert.equal(parsed('|x| |y| = 2').kind, 'eq');
});

test('parses unicode operators', () => {
  const s = parsed('3 \u00d7 x \u2212 1 = 5');
  assert.equal(s.kind, 'eq');
  assert.equal(canonEq(s.ast).l.toPlain(), '3x - 1');
  const d = parsed('6 \u00f7 2 = 3');
  assert.equal(canonEq(d.ast).l.toPlain(), '3');
});

test('parses or steps with two equation branches', () => {
  const s = parsed('x = 7 or x = -7');
  assert.equal(s.kind, 'or');
  assert.equal(s.branches.length, 2);
  const t = parsed('X = 1 OR X = 2');
  assert.equal(t.kind, 'or');
  assert.equal(t.branches.length, 2);
});

test('parses no solution in both phrasings', () => {
  assert.equal(parsed('no solution').kind, 'none');
  assert.equal(parsed('No real solution.').kind, 'none');
});

test('parses bare expressions for simplification steps', () => {
  const s = parsed('2(3x - 1) + 4x');
  assert.equal(s.kind, 'expr');
  assert.equal(canon(s.ast).toPlain(), '10x - 2');
});

test('plain printing round trips readable forms', () => {
  assert.equal(astToPlain(parsed('x^2 - 5x + 6 = 0').ast), 'x^2 - 5x + 6 = 0');
  assert.equal(astToPlain(parsed('(x + 1)(x + 2) = 0').ast), '(x + 1)(x + 2) = 0');
});

test('rejects empty input', () => {
  assert.throws(() => parsed('   '), ParseError);
});

test('rejects an unknown character with its position', () => {
  try { parsed('2 @ 3'); assert.fail('expected throw'); }
  catch (err) { assert.match(err.message, /@/); assert.equal(err.pos, 2); }
});

test('rejects double equals', () => {
  assert.throws(() => parsed('x == 3'), /single = sign/);
});

test('rejects unbalanced parentheses, naming the opening position', () => {
  try { parsed('(x + 1'); assert.fail('expected throw'); }
  catch (err) { assert.match(err.message, /opened at position 1/); }
  assert.throws(() => parsed('x + 1)'), /no matching opening/);
});

test('rejects a trailing operator', () => {
  assert.throws(() => parsed('2x +'), /ends abruptly/);
  assert.throws(() => parsed('x ='), /ends abruptly/);
});

test('rejects malformed decimals', () => {
  assert.throws(() => parsed('1.2.3'), /single decimal point/);
  assert.throws(() => parsed('3.'), /digits after it/);
  assert.throws(() => parsed('.5'), /start decimals with a digit/);
});

test('rejects non numeric exponents', () => {
  assert.throws(() => parsed('x^y'), /plain number/);
  assert.throws(() => parsed('x^'), /needs a number/);
  assert.throws(() => parsed('x^2^3'), /nested powers/);
});

test('rejects sqrt and abs without parentheses or closers', () => {
  assert.throws(() => parsed('sqrt 9'), /needs parentheses/);
  assert.throws(() => parsed('|x - 3 = 5'), /must close with \|/);
  assert.throws(() => parsed('|x| - |y'), /missing its closing/);
});

test('rejects inequalities and stray separators', () => {
  assert.throws(() => parsed('x < 3'), /equalities only/);
  assert.throws(() => parsed('x, y = 2'), /or/);
});

test('rejects misuse of or', () => {
  assert.throws(() => parsed('x = 1 or 2'), /complete equation/);
  assert.throws(() => parsed('or x = 1'), /complete equation/);
});

test('rejects empty parentheses', () => {
  assert.throws(() => parsed('() + 1'), /empty parentheses/);
});
