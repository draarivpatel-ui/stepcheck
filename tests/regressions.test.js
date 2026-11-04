import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rat, canon, evalAstRat, polyExactDivide, MPoly, Val, keyOfMons } from '../js/algebra.js';
import { parseStep, astToPlain } from '../js/parse.js';
import { checkPair, checkStep, prepareStep, sameStep } from '../js/rules.js';
import { parseAndRender, astToMath } from '../js/render.js';
import { assumptionsFor, domainFor, conditionText } from '../js/domain.js';
import { CHALLENGES } from '../js/challenges.js';

for (const power of [1, 2, 3, 4, 8, 16]) {
  test(`negative exponent -${power} raises the whole reciprocal`, () => {
    const raw = `x^(-${power})`;
    assert.equal(checkPair(raw, `1/x^${power}`).ok, true);
    const parsed = parseStep(raw);
    const expected = new Rat(1n, 2n ** BigInt(power));
    assert.ok(evalAstRat(parsed.ast, { x: Rat.int(2) }).isEqual(expected));
    assert.equal(checkPair(`2^(-${power})`, expected.toString()).ok, true);
  });
}

test('a negative square-root equation cannot be squared into a solution', () => {
  for (const pair of [['sqrt(x) = -2', 'x = 4'], ['-3 = sqrt(x + 2)', '9 = x + 2']]) {
    const verdict = checkPair(...pair);
    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /negative|introduces solutions/);
  }
  assert.equal(checkPair('sqrt(x) = -2', 'no solution').ok, true);
  assert.equal(checkPair('sqrt(x) = 2', 'x = 4').ok, true);
});

test('variable scaling is rejected without an explicitly declared assumption', () => {
  assert.equal(checkPair('x = 1', 'x^2 = x').ok, false);
  assert.equal(checkPair('x^2 = x', 'x = 1').ok, false);
  const conditional = checkPair('x = 1', 'x^2 = x', { nonzero: ['x'] });
  assert.equal(conditional.ok, true);
  assert.equal(conditional.conditional, true);
  assert.match(conditional.note, /x != 0/);
});

test('cancelled denominator and radical domains are retained, not erased', () => {
  const denominator = checkPair('x/x = 1', '1 = 1');
  assert.equal(denominator.ok, true);
  assert.equal(denominator.conditional, true);
  assert.match(denominator.note, /x != 0/);
  const radical = checkPair('sqrt(x)*sqrt(x)', 'x');
  assert.equal(radical.ok, true);
  assert.match(radical.note, /x >= 0/);
  const prev = prepareStep('x/x + 1');
  const cur = prepareStep('2');
  const verdict = checkStep(prev, cur);
  assert.equal(verdict.ok, true);
  cur.conditions = verdict.conditions;
  const next = checkStep(cur, prepareStep('1 + 1'));
  assert.match(next.note, /x != 0/);
});

test('adding a singular quantity requires a declared domain restriction', () => {
  assert.equal(checkPair('x = 1', 'x + 1/x = 1 + 1/x').ok, false);
  assert.equal(checkPair('x = 1', 'x + 1/x = 1 + 1/x', { nonzero: ['x'] }).ok, true);
});

test('an identically zero product never licenses dropping its zero factor', () => {
  assert.equal(checkPair('0(x - 3) = 0', 'x - 3 = 0').ok, false);
  assert.equal(checkPair('(x - x)(x - 3) = 0', 'x - 3 = 0').ok, false);
  assert.equal(checkPair('2(x - 3) = 0', 'x - 3 = 0').ok, true);
});

test('exact division cannot invent a missing divisor variable', () => {
  assert.equal(polyExactDivide(MPoly.rat(Rat.int(1)), MPoly.var('x')), null);
  assert.equal(polyExactDivide(MPoly.var('x'), MPoly.var('y')), null);
});

test('numeric input and polynomial budgets fail closed with useful errors', () => {
  const cases = ['x^100000000000000000000', 'x^(-1000)', '(a+b+c+d+e+f+g+h)^16', '((x^16)^16)^16', '9'.repeat(129), '('.repeat(33) + 'x' + ')'.repeat(33), '-'.repeat(513) + 'x', 'x'.repeat(2049)];
  for (const raw of cases) {
    const prepared = prepareStep(raw);
    assert.equal(prepared.kind, 'error', raw.slice(0, 70));
    assert.match(prepared.error.message, /limit|at most|too many|exceed|between|nest/);
  }
  assert.throws(() => keyOfMons([['x', Infinity]]), /degree/);
  assert.throws(() => new Val(Array(513).fill({})), /512/);
  assert.throws(() => new Rat(1, 2n), /BigInt/);
  assert.throws(() => new Rat(10n ** 4097n, 1n), /limit/);
});

test('invalid render inputs return an error and successful inputs actually render', () => {
  const good = parseAndRender('x + 2 = 5');
  assert.ok(good.html.includes('class="mv"'));
  assert.equal(good.error, undefined);
  assert.match(parseAndRender('x = <img>').error, /equalities|unexpected/);
  const html = astToMath({ t: 'var', name: '<img src=x onerror=alert(1)>' });
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('<img'), false);
});

test('invalid prepared targets never match or throw', () => {
  assert.equal(sameStep(prepareStep('x ='), prepareStep('x =')), false);
  assert.equal(sameStep(null, prepareStep('x = 2')), false);
});

test('assumptions are exact expressions and cannot be arbitrary statements', () => {
  assert.throws(() => assumptionsFor({ nonzero: ['x = 1'] }), /expression/);
  assert.throws(() => assumptionsFor({ nonzero: 'x' }), /arrays/);
  assert.throws(() => assumptionsFor({ nonzero: ['0'] }), /false constant/);
  const step = prepareStep('sqrt(x)/y');
  assert.deepEqual(domainFor(step).map(conditionText).sort(), ['x >= 0', 'y != 0']);
});

test('symbolic absolute-value splits cannot introduce unrestricted solutions', () => {
  assert.equal(checkPair('|x| = -x', 'x = -x or x = x').ok, false);
  assert.equal(checkPair('|x| = y', 'x = y or x = -y').ok, false);
  const conditional = checkPair('|x| = y', 'x = y or x = -y', { nonnegative: ['y'] });
  assert.equal(conditional.ok, true);
  assert.equal(conditional.conditional, true);
  assert.match(conditional.note, /y >= 0/);
});

test('nested powers preserve grouping in plain and HTML mathematics', () => {
  const ast = parseStep('(x^2)^3 = 64').ast;
  assert.equal(astToPlain(ast), '(x^2)^3 = 64');
  assert.notEqual(prepareStep(astToPlain(ast)).kind, 'error');
  assert.equal((astToMath(ast).match(/class="mparen"/g) || []).length, 2);
  assert.equal(checkPair('(x^2)^3', 'x^6').ok, true);
});

test('or branches can use and retain their existing nonzero conditions', () => {
  const result = checkPair('x/y = 1 or x/y = 2', 'x = y or x = 2y');
  assert.equal(result.ok, true);
  assert.equal(result.conditional, true);
  assert.match(result.note, /y != 0/);
});

test('raw padded and no-solution inputs obey the documented character budget', () => {
  for (const raw of [' '.repeat(2049) + 'x', 'no' + ' '.repeat(2048) + 'solution']) {
    assert.equal(prepareStep(raw).kind, 'error');
    assert.match(prepareStep(raw).error.message, /2048/);
  }
});

test('quadratic derivation is checked with its visible real-domain assumptions', () => {
  const challenge = CHALLENGES.find((item) => item.id === 'c15');
  let previous = prepareStep(challenge.given);
  for (const raw of challenge.path) {
    const current = prepareStep(raw);
    const verdict = checkStep(previous, current, challenge.assumptions);
    assert.equal(verdict.ok, true, raw + ': ' + verdict.message);
    assert.equal(verdict.conditional, true);
    current.conditions = verdict.conditions;
    previous = current;
  }
  assert.match(previous.conditions.map(conditionText).join(', '), /a != 0/);
});

test('seeded linear transformations preserve exact solutions and reject changed constants', () => {
  let seed = 246813579;
  const integer = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed % 41) - 20; };
  for (let i = 0; i < 400; i += 1) {
    let coefficient = integer();
    if (coefficient === 0) coefficient = 1;
    const root = integer(), offset = integer();
    const total = coefficient * root + offset;
    const given = `${coefficient}x + (${offset}) = ${total}`;
    const isolated = `${coefficient}x = ${coefficient * root}`;
    if (offset !== 0) assert.equal(checkPair(given, isolated).ok, true, given);
    if (coefficient !== 1) assert.equal(checkPair(isolated, `x = ${root}`).ok, true, isolated);
    assert.equal(checkPair(given, `x = ${root + 1}`).ok, false, given);
    const parsed = parseStep(given);
    assert.ok(evalAstRat(parsed.ast.a, { x: Rat.int(root) }).isEqual(evalAstRat(parsed.ast.b, {})));
  }
});

test('plain printing preserves a seeded set of supported exact expressions', () => {
  const expressions = ['x/(y + 1)', '(x + 1)^2', 'x - (y - 2)', 'x^(-3)', '(x/2 + 3)*4'];
  for (const raw of expressions) {
    const ast = parseStep(raw).ast;
    const roundTrip = parseStep(astToPlain(ast)).ast;
    assert.ok(canon(ast).isEqual(canon(roundTrip)), raw);
  }
});
