// StepCheck rule engine: decides whether step B follows from step A by a rule
// in the catalog, names the rule, or explains precisely why the step fails.

import {
  Rat, RF, MPoly, Val, polyExactDivide,
  canon, canonEq, valSub, valAdd, valMul, valDiv, valSqrt, valAbs,
  valEqual, varsOfAst, evalAstRat, monsFromKey
} from './algebra.js';
import { parseStep, astToPlain } from './parse.js';
import { domainFor, assumptionsFor, mergeConditions, knownCondition, conditionText } from './domain.js';

// ---------------------------------------------------------------------------
// Rule catalog
// ---------------------------------------------------------------------------

export const RULES = [
  {
    id: 'add',
    name: 'Addition Property of Equality',
    statement: 'Adding the same quantity to both sides of an equation, or subtracting the same quantity from both sides, keeps the solutions exactly the same.',
    notes: [
      'The quantity may be a number or an expression in the unknowns.',
      'Every solution of the old equation is a solution of the new one, and conversely.'
    ]
  },
  {
    id: 'mul',
    name: 'Multiplication Property of Equality',
    statement: 'Multiplying both sides of an equation by the same nonzero quantity keeps the solutions exactly the same. Dividing both sides is multiplying by a reciprocal.',
    notes: [
      'The multiplier must never be zero: multiplying by zero collapses every equation to 0 = 0.',
      'When the multiplier is an expression, it must be nonzero for the solutions being kept.'
    ]
  },
  {
    id: 'symmetry',
    name: 'Symmetry of Equality',
    statement: 'The two sides of an equation may be swapped: a = b says the same thing as b = a.',
    notes: ['Useful when the unknown ends up on the right side.']
  },
  {
    id: 'evaluate',
    name: 'Evaluate Arithmetic',
    statement: 'Arithmetic on plain numbers may be carried out inside a step: 2 + 3 may become 5, and sqrt(16) may become 4.',
    notes: [
      'Square roots of negative numbers are rejected: sqrt(-4) is not a real number.',
      'Roots of non perfect squares, like sqrt(2), are kept in exact symbolic form.'
    ]
  },
  {
    id: 'combine',
    name: 'Combine Like Terms',
    statement: 'Terms that share the same variable part may be merged: 2x + 3x becomes 5x, and x - x becomes 0.',
    notes: ['The engine verifies the merge by expanding both sides and comparing exactly.']
  },
  {
    id: 'rearrange',
    name: 'Rearrange Terms',
    statement: 'Commutativity and associativity allow addition and multiplication terms to be reordered or regrouped without changing their exact value.',
    notes: ['The exact canonical value and every retained domain restriction must stay unchanged.']
  },
  {
    id: 'distribute',
    name: 'Distributive Property',
    statement: 'A factor times a sum expands: a(b + c) becomes ab + ac. This also covers expanding a squared binomial like (x + 1)^2.',
    notes: ['The engine verifies the expansion symbolically, term by term.']
  },
  {
    id: 'factor',
    name: 'Factoring',
    statement: 'A sum may be rewritten as a product of factors: x^2 + 5x + 6 becomes (x + 2)(x + 3), and 3x + 12 becomes 3(x + 4).',
    notes: [
      'The learner finds the factors; the engine verifies them by expanding.',
      'Factoring sets up the Zero Product Property.'
    ]
  },
  {
    id: 'complete-square',
    name: 'Complete the Square',
    statement: 'A quadratic that is a perfect square trinomial may collapse into a squared binomial: x^2 + 6x + 9 becomes (x + 3)^2.',
    notes: ['Collapsing is verified by re-expanding the binomial.']
  },
  {
    id: 'power',
    name: 'Power Rule',
    statement: 'Exponent laws: (xy)^2 = x^2 y^2, (x^m)^n = x^(mn), and x^m times x^n = x^(m+n).',
    notes: [
      'Exponents in this subset are whole numbers, or 1/2 written as a square root.',
      'Negative exponents are supported only on plain expressions.'
    ]
  },
  {
    id: 'root',
    name: 'Square Root Rule',
    statement: 'If s^2 = k with k at least 0, then s = sqrt(k) or s = -sqrt(k). Both roots must be written. The same step may be written |s| = sqrt(k).',
    notes: [
      'If k is negative there are no real roots: write no solution.',
      'A single root, like x = 3 alone from x^2 = 9, is rejected because it drops a solution.',
      'Squaring both sides is the reverse move and is rejected: it can invent solutions.',
      'A square root can also be undone: sqrt(s) = k with k at least 0 gives s = k^2.'
    ]
  },
  {
    id: 'abs',
    name: 'Absolute Value Rule',
    statement: 'If |s| = k with k at least 0, then s = k or s = -k. Both cases must be written.',
    notes: [
      'If k is negative there are no real solutions: an absolute value is never negative.',
      'A single case, like s = k alone, is rejected because it drops a solution.'
    ]
  },
  {
    id: 'zero-product',
    name: 'Zero Product Property',
    statement: 'If a product equals zero, at least one factor equals zero: F(x) G(x) = 0 gives F(x) = 0 or G(x) = 0.',
    notes: [
      'Constant factors, like the 2 in 2(x - 3) = 0, are dropped.',
      'Every case must be kept: write the branches joined by or.'
    ]
  },
  {
    id: 'quad-form',
    name: 'Quadratic Formula',
    statement: 'The roots of a x^2 + b x + c = 0, with a not zero, are x = (-b + sqrt(b^2 - 4ac)) / (2a) and x = (-b - sqrt(b^2 - 4ac)) / (2a).',
    notes: [
      'Both roots must be written, joined by or.',
      'If b^2 - 4ac is negative, there are no real roots: write no solution.'
    ]
  }
];

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// Step preparation
// ---------------------------------------------------------------------------

export function prepareStep(raw) {
  try {
    const parsed = parseStep(raw);
    const step = { raw, kind: parsed.kind };
    if (parsed.kind === 'eq') { step.ast = parsed.ast; step.eqv = canonEq(parsed.ast); }
    else if (parsed.kind === 'expr') { step.ast = parsed.ast; step.val = canon(parsed.ast); }
    else if (parsed.kind === 'or') { step.branches = parsed.branches; step.branchVals = parsed.branches.map(canonEq); }
    step.conditions = domainFor(step);
    return step;
  } catch (err) {
    return {
      raw,
      kind: 'error',
      error: {
        message: err.message,
        pos: typeof err.pos === 'number' ? err.pos : null,
        code: err.code || 'parse'
      }
    };
  }
}

function ok(ruleId, note) { return { ok: true, ruleId, note: note || '' }; }
function fail(message) { return { ok: false, message }; }

function citeOf(ruleId) { return RULE_BY_ID[ruleId] ? RULE_BY_ID[ruleId].name : ruleId; }

// ---------------------------------------------------------------------------
// Small syntactic helpers
// ---------------------------------------------------------------------------

function sideAst(eqNode, side) {
  return (side === 'l' || side === 'a') ? eqNode.a : eqNode.b;
}

function isAddish(node) {
  return node.t === 'chain' || node.t === 'add' || node.t === 'sub';
}

function flattenMul(node, out = []) {
  if (node.t === 'mul') { node.args.forEach((a) => flattenMul(a, out)); return out; }
  out.push(node);
  return out;
}

function rawTermCount(node) {
  switch (node.t) {
    case 'chain': return rawTermCount(node.head) + node.rest.reduce((s, r) => s + rawTermCount(r.node), 0);
    case 'add': return node.args.reduce((s, a) => s + rawTermCount(a), 0);
    case 'sub': return rawTermCount(node.a) + rawTermCount(node.b);
    case 'neg': return rawTermCount(node.a);
    default: return 1;
  }
}

function hasMulWithAdd(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.t === 'mul') {
    if (node.args.some(isAddish)) return true;
  }
  switch (node.t) {
    case 'chain': return hasMulWithAdd(node.head) || node.rest.some((r) => hasMulWithAdd(r.node));
    case 'add': return node.args.some(hasMulWithAdd);
    case 'sub': case 'div': case 'eq': return hasMulWithAdd(node.a) || hasMulWithAdd(node.b);
    case 'pow': return hasMulWithAdd(node.a);
    case 'neg': case 'sqrt': case 'abs': return hasMulWithAdd(node.a);
    case 'mul': return node.args.some(hasMulWithAdd);
    default: return false;
  }
}

function isPowOverAdd(node) {
  return node.t === 'pow' && node.e.isInt() && Number(node.e.n) >= 2 && isAddish(node.a);
}

function isSquareNode(node) {
  return node.t === 'pow' && node.e.isEqual(new Rat(2n, 1n));
}

function isCompleteSquare(node) {
  return isSquareNode(node) && isAddish(node.a);
}

function hasPowerPattern(node) {
  switch (node.t) {
    case 'pow': {
      if (node.a.t === 'mul' || node.a.t === 'pow') return true;
      return hasPowerPattern(node.a);
    }
    case 'mul': {
      const names = node.args.map(baseNameOf);
      const seen = new Set();
      for (const n of names) {
        if (n && seen.has(n)) return true;
        if (n) seen.add(n);
      }
      return node.args.some(hasPowerPattern);
    }
    case 'chain': return hasPowerPattern(node.head) || node.rest.some((r) => hasPowerPattern(r.node));
    case 'add': return node.args.some(hasPowerPattern);
    case 'sub': case 'div': case 'eq': return hasPowerPattern(node.a) || hasPowerPattern(node.b);
    case 'neg': case 'sqrt': case 'abs': return hasPowerPattern(node.a);
    default: return false;
  }
}

function baseNameOf(node) {
  if (node.t === 'var') return node.name;
  if (node.t === 'pow' && node.a.t === 'var') return node.a.name;
  return null;
}

function hasConstSqrtAbs(node) {
  switch (node.t) {
    case 'sqrt': case 'abs': {
      try { if (canon(node.a).constRat() !== null) return true; } catch (e) { /* not constant */ }
      return hasConstSqrtAbs(node.a);
    }
    case 'chain': return hasConstSqrtAbs(node.head) || node.rest.some((r) => hasConstSqrtAbs(r.node));
    case 'add': return node.args.some(hasConstSqrtAbs);
    case 'sub': case 'div': case 'eq': return hasConstSqrtAbs(node.a) || hasConstSqrtAbs(node.b);
    case 'pow': return hasConstSqrtAbs(node.a);
    case 'neg': return hasConstSqrtAbs(node.a);
    case 'mul': return node.args.some(hasConstSqrtAbs);
    default: return false;
  }
}

function valHasVars(v) { return v.hasVars(); }

// ---------------------------------------------------------------------------
// Rewrite classification (used when both sides are canonically unchanged)
// ---------------------------------------------------------------------------

const CLASS_ORDER = ['evaluate', 'complete-square', 'power', 'distribute', 'factor', 'combine', 'rearrange'];

function classifySide(prevAst, curAst, prevVal) {
  if (!valHasVars(prevVal)) return 'evaluate';
  if (hasConstSqrtAbs(prevAst)) return 'evaluate';
  if (isCompleteSquare(curAst) && !isCompleteSquare(prevAst)) return 'complete-square';
  if (hasPowerPattern(prevAst) && !hasPowerPattern(curAst)) return 'power';
  const pc = rawTermCount(prevAst);
  const cc = rawTermCount(curAst);
  const prevMulAdd = hasMulWithAdd(prevAst);
  const curMulAdd = hasMulWithAdd(curAst);
  if (prevMulAdd && !curMulAdd && cc > pc) return 'distribute';
  if (isPowOverAdd(prevAst) && curAst.t !== 'pow' && cc > pc) return 'distribute';
  if (curAst.t === 'mul' && !prevMulAdd && pc >= cc) {
    const args = flattenMul(curAst);
    if (args.some(isAddish)) return 'factor';
  }
  if (cc < pc) return 'combine';
  return 'rearrange';
}

function classifyRewrite(prevStep, curStep) {
  const ids = [];
  const prevAst = prevStep.ast, curAst = curStep.ast;
  const sides = [['a', 'l'], ['b', 'r']];
  for (const [pa] of sides) {
    const pAst = sideAst(prevAst, pa);
    const cAst = sideAst(curAst, pa);
    if (astToPlain(pAst) === astToPlain(cAst)) continue;
    const pVal = pa === 'a' ? prevStep.eqv.l : prevStep.eqv.r;
    ids.push(classifySide(pAst, cAst, pVal));
  }
  if (ids.length === 0) return 'rearrange';
  for (const pref of CLASS_ORDER) if (ids.includes(pref)) return pref;
  return ids[0];
}

// ---------------------------------------------------------------------------
// Values equality for equations
// ---------------------------------------------------------------------------

function eqEqual(a, b) {
  return valEqual(a.l, b.l) && valEqual(a.r, b.r);
}

function branchMatches(bv, lV, rV) {
  return (valEqual(bv.l, lV) && valEqual(bv.r, rV)) || (valEqual(bv.l, rV) && valEqual(bv.r, lV));
}

// ---------------------------------------------------------------------------
// Addition and multiplication properties
// ---------------------------------------------------------------------------

function describeAdd(k) {
  const c = k.constRat();
  if (c && !c.isZero()) {
    if (c.isNeg()) return 'you subtracted ' + c.abs().toString() + ' from both sides';
    return 'you added ' + c.toString() + ' to both sides';
  }
  if (!c) return 'you added the same quantity to both sides';
  return '';
}

function describeMul(c) {
  const r = c instanceof Rat ? c : c.isConstantRat();
  if (!r) return 'you multiplied both sides by the same expression, ' + c.toPlain();
  if (r.isInt()) {
    if (r.isEqual(Rat.int(1))) return '';
    if (r.isEqual(Rat.int(-1))) return 'you multiplied both sides by -1';
    return 'you multiplied both sides by ' + r.toString();
  }
  if (r.n === 1n) return 'you divided both sides by ' + r.d.toString();
  if (r.n === -1n) return 'you divided both sides by -' + r.d.toString();
  return 'you multiplied both sides by ' + r.toString();
}

// Reduce a ratio like (4a*P)/P to the polynomial 4a when the division is
// exact, so ratio checks see the honest shape of the multiplier.
function reduceRF(f) {
  if (f.den.isConstant()) return f;
  try {
    const q = polyExactDivide(f.num, f.den);
    if (q) return new RF(q, MPoly.rat(Rat.int(1)));
    const q2 = polyExactDivide(f.den, f.num);
    if (q2) return new RF(MPoly.rat(Rat.int(1)), q2);
  } catch (e) { /* keep unreduced */ }
  return f;
}

function ratioOf(curV, prevV) {
  if (prevV.isZero()) return { prevZero: true, curZero: curV.isZero() };
  try {
    const r = valDiv(curV, prevV);
    const f = r.asRF();
    if (!f) return null;
    return { f: reduceRF(f) };
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Square root rule helpers
// ---------------------------------------------------------------------------

function expectedRootsForSquare(prev, sqSide) {
  // prev.ast is an eq node; sqSide is the side holding a syntactic square.
  const sqNode = sideAst(prev.ast, sqSide);
  const kSide = sqSide === 'a' ? 'b' : 'a';
  const kV = kSide === 'a' ? prev.eqv.l : prev.eqv.r;
  let sq;
  try { sq = valSqrt(kV); } catch (e) { return { error: e }; }
  const sV = (() => { try { return canon(sqNode.a); } catch (e) { return null; } })();
  if (!sV) return { error: new EngineError('unsupported') };
  return { sV, sq, kV, kSide };
}

function expectedCasesForAbs(prev, absSide) {
  const absNode = sideAst(prev.ast, absSide);
  const kSide = absSide === 'a' ? 'b' : 'a';
  const kV = kSide === 'a' ? prev.eqv.l : prev.eqv.r;
  let sV;
  try { sV = canon(absNode.a); } catch (e) { return { error: e }; }
  return { sV, kV, kSide };
}

// ---------------------------------------------------------------------------
// Witness probing (deterministic: fixed probe order)
// ---------------------------------------------------------------------------

const PROBES = ['2', '-2', '3', '1/2', '5', '-1', '4', '10', '3/2', '7', '-3', '1/3'].map((s) => {
  const i = s.indexOf('/');
  return i === -1 ? new Rat(BigInt(s), 1n) : new Rat(BigInt(s.slice(0, i)), BigInt(s.slice(i + 1)));
});

function linearRoot(eqv) {
  try {
    const l = eqv.l.asRF(), r = eqv.r.asRF();
    if (!l || !r) return null;
    const p = l.sub(r);
    if (!p.den.isConstant()) return null;
    const vars = p.num.vars();
    if (vars.size !== 1) return null;
    const v = [...vars][0];
    if (p.num.degreeIn(v) !== 1) return null;
    let B = null, C = null;
    for (const [k, c] of p.num.terms) {
      const mons = monsFromKey(k);
      const ve = mons.filter(([n]) => n === v).reduce((s, [, e]) => s + e, 0);
      if (ve === 1) B = c; else if (ve === 0) C = c; else return null;
    }
    if (!B || B.isZero()) return null;
    return (C ? C : Rat.int(0)).neg().div(B);
  } catch (e) { return null; }
}

function envString(vars, p) {
  return [...vars].sort().map((n) => n + ' = ' + p.toString()).join(', ');
}

function witnessFor(prevStep, curStep, kinds) {
  // kinds: 'eq' compares equation truth; 'expr' compares expression values.
  const vars = new Set();
  const collect = (st) => {
    if (st.kind === 'eq' || st.kind === 'expr') varsOfAst(st.ast, vars);
    if (st.kind === 'or') st.branches.forEach((b) => { varsOfAst(b.a, vars); varsOfAst(b.b, vars); });
  };
  collect(prevStep); collect(curStep);
  if (vars.size === 0) return null;
  const probes = [...PROBES];
  if (kinds === 'eq') {
    const r1 = linearRoot(prevStep.eqv);
    if (r1) probes.unshift(r1);
    const r2 = linearRoot(curStep.eqv);
    if (r2) probes.unshift(r2);
  }
  for (const p of probes) {
    const env = {};
    for (const v of vars) env[v] = p;
    try {
      if (kinds === 'eq') {
        const pl = evalAstRat(prevStep.ast.a, env), pr = evalAstRat(prevStep.ast.b, env);
        const cl = evalAstRat(curStep.ast.a, env), cr = evalAstRat(curStep.ast.b, env);
        if (pl === null || pr === null || cl === null || cr === null) continue;
        const prevTrue = pl.isEqual(pr), curTrue = cl.isEqual(cr);
        if (prevTrue && !curTrue) {
          return 'at ' + envString(vars, p) + ' the previous step gives ' + pl.toString() + ' = ' + pr.toString()
            + ', which is true, but this step gives ' + cl.toString() + ' = ' + cr.toString()
            + ', which is false; the step loses a solution of the previous step.';
        }
      } else if (kinds === 'expr') {
        const pv = evalAstRat(prevStep.ast, env), cv = evalAstRat(curStep.ast, env);
        if (pv === null || cv === null) continue;
        if (!pv.isEqual(cv)) {
          return 'at ' + envString(vars, p) + ' the previous expression is ' + pv.toString()
            + ' but this one is ' + cv.toString() + '; they are not the same expression.';
        }
      }
    } catch (e) { continue; }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generic diagnostics for equation steps
// ---------------------------------------------------------------------------

function isSquareOfStep(prev, cur) {
  try {
    const lsq = valMul(prev.eqv.l, prev.eqv.l);
    const rsq = valMul(prev.eqv.r, prev.eqv.r);
    return valEqual(cur.eqv.l, lsq) && valEqual(cur.eqv.r, rsq);
  } catch (e) { return false; }
}

function singleCaseHint(prev, cur) {
  // prev is an eq step; cur is a single eq that looks like one case of a split.
  const sqSides = ['a', 'b'];
  for (const side of sqSides) {
    const node = sideAst(prev.ast, side);
    if (isSquareNode(node)) {
      const exp = expectedRootsForSquare(prev, side);
      if (exp.error) continue;
      const sV = exp.sV;
      for (const root of [exp.sq, exp.sq.neg()]) {
        if (branchMatches(cur.eqv, sV, root)) {
          const p1 = exp.sq.toPlain(), p2 = exp.sq.neg().toPlain();
          const sPlain = astToPlain(node.a);
          return 'that is only one of the two roots of a square; write both, like '
            + sPlain + ' = ' + p1 + ' or ' + sPlain + ' = ' + p2 + ' (Square Root Rule).';
        }
      }
    }
    if (node.t === 'abs') {
      const exp = expectedCasesForAbs(prev, side);
      if (exp.error) continue;
      for (const k of [exp.kV, exp.kV.neg()]) {
        if (branchMatches(cur.eqv, exp.sV, k)) {
          const sPlain = astToPlain(node.a);
          return 'that is only one of the two cases of an absolute value; write both, like '
            + sPlain + ' = ' + exp.kV.toPlain() + ' or ' + sPlain + ' = ' + exp.kV.neg().toPlain()
            + ' (Absolute Value Rule).';
        }
      }
    }
  }
  // zero product single case
  const zp = zeroProductFactors(prev);
  if (zp) {
    for (const f of zp.factors) {
      const fV = (() => { try { return canon(f); } catch (e) { return null; } })();
      if (!fV) continue;
      if (branchMatches(cur.eqv, fV, Val.zero())) {
        return 'that is only one case of the Zero Product Property; write one equation per factor, joined by or.';
      }
    }
  }
  return null;
}

function zeroProductFactors(prev) {
  // Returns {factors} when one side of prev is zero and the other is a
  // syntactic product with at least two factors, at least one non-constant.
  const sides = [
    { zero: prev.eqv.r, ast: prev.ast.a },
    { zero: prev.eqv.l, ast: prev.ast.b }
  ];
  for (const s of sides) {
    if (!s.zero.isZero()) continue;
    if (s.ast.t !== 'mul') continue;
    const all = flattenMul(s.ast);
    if (all.some((factor) => { try { return canon(factor).isZero(); } catch { return false; } })) continue;
    const factors = all.filter((f) => {
      try { return canon(f).constRat() === null; } catch (e) { return false; }
    });
    if (all.length >= 2 && factors.length >= 1) return { factors };
  }
  return null;
}

function genericEqFail(prev, cur) {
  const dl = valSub(cur.eqv.l, prev.eqv.l);
  const dr = valSub(cur.eqv.r, prev.eqv.r);
  const dlC = dl.constRat(), drC = dr.constRat();
  if (dlC && dlC.isZero() && drC && !drC.isZero()) {
    return fail('the right side changed by ' + drC.toString() + ' but the left side did not; whatever is done to one side must be done to the other (Addition Property of Equality).');
  }
  if (drC && drC.isZero() && dlC && !dlC.isZero()) {
    return fail('the left side changed by ' + dlC.toString() + ' but the right side did not; whatever is done to one side must be done to the other (Addition Property of Equality).');
  }
  if (dlC && drC && !dlC.isZero() && !drC.isZero() && !dlC.isEqual(drC)) {
    return fail('the left side changed by ' + dlC.toString() + ' and the right side by ' + drC.toString()
      + '; a valid step changes both sides by the same amount (Addition Property of Equality).');
  }
  const rl = ratioOf(cur.eqv.l, prev.eqv.l), rr = ratioOf(cur.eqv.r, prev.eqv.r);
  if (rl && rl.f && rr && rr.f) {
    const c1 = rl.f.isConstantRat(), c2 = rr.f.isConstantRat();
    if (c1 && c2 && !c1.isZero() && !c2.isZero() && !c1.isEqual(c2)) {
      return fail('you multiplied the left side by ' + c1.toString() + ' and the right side by ' + c2.toString()
        + '; both sides must be scaled by the same nonzero number (Multiplication Property of Equality).');
    }
  }
  const hint = singleCaseHint(prev, cur);
  if (hint) return fail(hint);
  if (isSquareOfStep(prev, cur)) {
    return fail('squaring both sides can add solutions the original equation does not have: x = 3 becomes true for x = -3 too once squared. This engine rejects the move; undo it and reach the squared form through the Rule Book instead.');
  }
  const w = witnessFor(prev, cur, 'eq');
  if (w) return fail(w + ' No catalog rule licenses this step.');
  return fail('this step does not follow from the previous one by any rule in the catalog; open the Rule Book for the licensed moves.');
}

// ---------------------------------------------------------------------------
// Equation to equation
// ---------------------------------------------------------------------------

function eqToEq(prev, cur, options = {}) {
  if (prev.raw.trim() === cur.raw.trim()) {
    return fail('this step is identical to the previous one; every step of a proof must change something.');
  }

  // Symmetry
  if (valEqual(prev.eqv.l, cur.eqv.r) && valEqual(prev.eqv.r, cur.eqv.l)) {
    return ok('symmetry', 'you swapped the two sides of the equation');
  }

  // Zero product with a single surviving factor, e.g. 2(x - 3) = 0 gives x - 3 = 0.
  const zp = zeroProductFactors(prev);
  if (zp && zp.factors.length === 1) {
    let fV = null;
    try { fV = canon(zp.factors[0]); } catch (e) { fV = null; }
    if (fV && branchMatches(cur.eqv, fV, Val.zero())) {
      return ok('zero-product', 'the constant factor is dropped, and a product is zero only when its factor is zero');
    }
  }

  // Addition property
  const dl = valSub(cur.eqv.l, prev.eqv.l);
  const dr = valSub(cur.eqv.r, prev.eqv.r);
  const dlz = dl.isZero(), drz = dr.isZero();
  if (!dlz && !drz && valEqual(dl, dr)) {
    return ok('add', describeAdd(dl));
  }

  // One-sided constant change: report immediately.
  const dlC = dl.constRat(), drC = dr.constRat();
  if (dlC && dlC.isZero() && drC && !drC.isZero()) {
    return fail('the right side changed by ' + drC.toString() + ' but the left side did not; whatever is done to one side must be done to the other (Addition Property of Equality).');
  }
  if (drC && drC.isZero() && dlC && !dlC.isZero()) {
    return fail('the left side changed by ' + dlC.toString() + ' but the right side did not; whatever is done to one side must be done to the other (Addition Property of Equality).');
  }

  // Multiplication property
  const rl = ratioOf(cur.eqv.l, prev.eqv.l);
  const rr = ratioOf(cur.eqv.r, prev.eqv.r);
  if (rl && rr) {
    const acceptRatio = (c) => {
      if (c.isZero()) return fail('multiplying both sides by zero destroys the equation; that step is rejected.');
      if (c.isEqual(RF.rat(Rat.int(1)))) return null; // no change; a rewrite may still apply
      const cC = c.isConstantRat();
      if (cC) return ok('mul', describeMul(cC));
      const known = mergeConditions(prev.conditions || [], assumptionsFor(options));
      if (knownCondition({ kind: 'nonzero', value: Val.rf(c), expression: c.toPlain() }, known)) {
        return ok('mul', 'you multiplied both sides by the same expression, ' + c.toPlain()
          + ', which must be defined and nonzero at every solution');
      }
      // A ratio with a variable denominator can erase solutions when that
      // denominator vanishes, so it is not licensed against a zero side.
      return fail(singleCaseHint(prev, cur) || 'a variable multiplier can add or erase solutions; declare and retain an explicit nonzero assumption before using it.');
    };
    if (rl.prevZero && rr.prevZero) {
      // 0 = 0 to another 0 = 0 shape; treated as a rewrite below.
    } else if (rl.prevZero) {
      if (rl.curZero && rr.f) {
        const res = acceptRatio(rr.f);
        if (res) return res;
      }
    } else if (rr.prevZero) {
      if (rr.curZero && rl.f) {
        const res = acceptRatio(rl.f);
        if (res) return res;
      }
    } else if (rl.f && rr.f) {
      if (rl.f.isZero() || rr.f.isZero()) {
        return fail('multiplying both sides by zero destroys the equation; that step is rejected.');
      }
      if (rl.f.isEqual(rr.f) && !rl.f.isEqual(RF.rat(Rat.int(1)))) {
        return acceptRatio(rl.f);
      }
    }
  }

  // Square root undone by squaring, e.g. sqrt(2x + 3) = 5 gives 2x + 3 = 25.
  const ru = tryRootUndo(prev, cur, options);
  if (ru) return ru;

  // Alternative representation of a solved square: x^2 = 9 written as |x| = 3.
  const rep = tryRootRepresentation(prev, cur);
  if (rep) return rep;

  // Rewrite classification (both sides canonically unchanged).
  if (valEqual(prev.eqv.l, cur.eqv.l) && valEqual(prev.eqv.r, cur.eqv.r)) {
    const ruleId = classifyRewrite(prev, cur);
    return ok(ruleId, rewriteNote(ruleId));
  }

  return genericEqFail(prev, cur);
}

function rewriteNote(ruleId) {
  switch (ruleId) {
    case 'evaluate': return 'you carried out the arithmetic exactly';
    case 'complete-square': return 'you recognized the perfect square pattern and collapsed it';
    case 'power': return 'you applied the exponent laws';
    case 'distribute': return 'you multiplied the factor through the sum';
    case 'factor': return 'you factored; expanding your product returns the previous step exactly';
    case 'combine': return 'you merged the terms that share the same variable part';
    default: return 'you reordered the terms; commutativity and associativity keep the value the same';
  }
}

function tryRootUndo(prev, cur, options) {
  for (const side of ['a', 'b']) {
    const node = sideAst(prev.ast, side);
    if (node.t !== 'sqrt') continue;
    const innerV = (() => { try { return canon(node.a); } catch (e) { return null; } })();
    if (!innerV) continue;
    const kV = side === 'a' ? prev.eqv.r : prev.eqv.l;
    const curIn = side === 'a' ? cur.eqv.l : cur.eqv.r;
    const curK = side === 'a' ? cur.eqv.r : cur.eqv.l;
    let kSq;
    try { kSq = valMul(kV, kV); } catch (e) { continue; }
    if (valEqual(curIn, innerV) && valEqual(curK, kSq)) {
      const kC = kV.constRat();
      if (kC && kC.isNeg()) return fail('a square root is never negative; squaring this equation introduces solutions. Write no solution instead.');
      if (!knownCondition({ kind: 'nonnegative', value: kV, expression: kV.toPlain() }, mergeConditions(prev.conditions || [], assumptionsFor(options)))) return fail('undoing a square root requires an explicit nonnegative assumption for the other side.');
      return ok('root', 'you squared both sides to undo the square root while keeping the nonnegative domain');
    }
  }
  return null;
}

function tryRootRepresentation(prev, cur) {
  for (const side of ['a', 'b']) {
    const node = sideAst(prev.ast, side);
    if (!isSquareNode(node)) continue;
    const exp = expectedRootsForSquare(prev, side);
    if (exp.error || !exp.sV) continue;
    let absV;
    try { absV = valAbs(exp.sV); } catch (e) { continue; }
    const curIn = side === 'a' ? cur.eqv.l : cur.eqv.r;
    const curK = side === 'a' ? cur.eqv.r : cur.eqv.l;
    if ((valEqual(curIn, absV) && valEqual(curK, exp.sq)) || (valEqual(curIn, exp.sq) && valEqual(curK, absV))) {
      return ok('root', 'you rewrote the square as an absolute value: the square root of a square is the absolute value, and its two cases are the two roots');
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Equation to or-step (split rules)
// ---------------------------------------------------------------------------

function matchBranches(expectedPairs, cur) {
  // expectedPairs: array of [lV, rV]. Returns true when cur has exactly one
  // branch per expected pair (unordered, orientation flexible).
  if (cur.branchVals.length !== expectedPairs.length) return false;
  const used = new Set();
  for (const [lV, rV] of expectedPairs) {
    let found = -1;
    for (let i = 0; i < cur.branchVals.length; i++) {
      if (used.has(i)) continue;
      if (branchMatches(cur.branchVals[i], lV, rV)) { found = i; break; }
    }
    if (found === -1) return false;
    used.add(found);
  }
  return true;
}

function countMatches(expectedPairs, cur) {
  let n = 0;
  for (const [lV, rV] of expectedPairs) {
    if (cur.branchVals.some((bv) => branchMatches(bv, lV, rV))) n++;
  }
  return n;
}

function eqToOr(prev, cur, options) {
  // Square Root Rule split
  for (const side of ['a', 'b']) {
    const node = sideAst(prev.ast, side);
    if (!isSquareNode(node)) continue;
    const exp = expectedRootsForSquare(prev, side);
    if (exp.error) {
      if (exp.error.code === 'domain') return fail('since the other side is negative, a square has no real roots; write no solution instead of splitting.');
      continue;
    }
    const kC = exp.kV.constRat();
    if (kC && kC.isNeg()) {
      return fail('a square can never equal ' + kC.toString() + ' over the reals; write no solution instead of two roots.');
    }
    const pairs = [[exp.sV, exp.sq], [exp.sV, exp.sq.neg()]];
    if (matchBranches(pairs, cur)) {
      return ok('root', 'a square has two roots: the positive and the negative square root, and both must be kept');
    }
    if (cur.branchVals.length === 1 || countMatches(pairs, cur) === 1) {
      const sPlain = astToPlain(node.a);
      return fail('that keeps only one root of the square; write both, like '
        + sPlain + ' = ' + exp.sq.toPlain() + ' or ' + sPlain + ' = ' + exp.sq.neg().toPlain() + ' (Square Root Rule).');
    }
  }

  // Absolute Value Rule split
  for (const side of ['a', 'b']) {
    const node = sideAst(prev.ast, side);
    if (node.t !== 'abs') continue;
    const exp = expectedCasesForAbs(prev, side);
    if (exp.error) continue;
    const kC = exp.kV.constRat();
    if (kC && kC.isNeg()) {
      return fail('an absolute value is never negative, so ' + astToPlain(node) + ' has no real solutions; write no solution instead of two cases.');
    }
    if (!knownCondition({ kind: 'nonnegative', value: exp.kV, expression: exp.kV.toPlain() }, mergeConditions(prev.conditions || [], assumptionsFor(options)))) {
      return fail('splitting an absolute value requires a supported explicit or inherited nonnegative condition for the other side; otherwise the split can add solutions.');
    }
    const pairs = [[exp.sV, exp.kV], [exp.sV, exp.kV.neg()]];
    if (matchBranches(pairs, cur)) {
      return ok('abs', 'an absolute value hides a sign: the inside is k or -k, and both cases must be kept');
    }
    if (cur.branchVals.length === 1 || countMatches(pairs, cur) === 1) {
      const sPlain = astToPlain(node.a);
      return fail('that keeps only one case of the absolute value; write both, like '
        + sPlain + ' = ' + exp.kV.toPlain() + ' or ' + sPlain + ' = ' + exp.kV.neg().toPlain() + ' (Absolute Value Rule).');
    }
  }

  // Zero Product Property split
  const zp = zeroProductFactors(prev);
  if (zp) {
    const pairs = [];
    let allConst = true;
    for (const f of zp.factors) {
      const fV = (() => { try { return canon(f); } catch (e) { return null; } })();
      if (!fV) { pairs.push(null); continue; }
      allConst = false;
      pairs.push([fV, Val.zero()]);
    }
    if (!allConst && pairs.every((p) => p)) {
      if (matchBranches(pairs, cur)) {
        return ok('zero-product', 'a product is zero only when at least one of its factors is zero, so every factor gets its own case');
      }
      if (countMatches(pairs, cur) >= 1) {
        return fail('keep every case of the Zero Product Property: write one equation per factor, joined by or.');
      }
    }
  }

  // Quadratic Formula
  const qf = tryQuadForm(prev, cur);
  if (qf) return qf;

  // Witness for or steps: prev true but every branch false at a probe.
  const w = witnessOr(prev, cur);
  if (w) return fail(w + ' No split rule licenses this step.');
  return fail('these branches do not match any split rule; the Square Root Rule, the Absolute Value Rule, the Zero Product Property, and the Quadratic Formula are the licensed splits (see the Rule Book).');
}

function witnessOr(prev, cur) {
  const vars = new Set();
  varsOfAst(prev.ast.a, vars); varsOfAst(prev.ast.b, vars);
  cur.branches.forEach((b) => { varsOfAst(b.a, vars); varsOfAst(b.b, vars); });
  if (vars.size === 0) return null;
  for (const p of PROBES) {
    const env = {};
    for (const v of vars) env[v] = p;
    try {
      const pl = evalAstRat(prev.ast.a, env), pr = evalAstRat(prev.ast.b, env);
      if (pl === null || pr === null || !pl.isEqual(pr)) continue;
      const anyTrue = cur.branches.some((b) => {
        const bl = evalAstRat(b.a, env), br = evalAstRat(b.b, env);
        return bl !== null && br !== null && bl.isEqual(br);
      });
      if (!anyTrue) {
        return 'at ' + envString(vars, p) + ' the previous step holds, but none of the branches of this step holds there; the split lost a solution.';
      }
    } catch (e) { continue; }
  }
  return null;
}

function tryQuadForm(prev, cur) {
  try {
    const l = prev.eqv.l.asRF(), r = prev.eqv.r.asRF();
    if (!l || !r) return null;
    const p = l.sub(r);
    if (!p.den.isConstant()) return null;
    const vars = p.num.vars();
    if (vars.size !== 1) return null;
    const v = [...vars][0];
    const deg = p.num.degreeIn(v);
    if (deg !== 2) return null;
    let A = null, B = null, C = null;
    for (const [k, c] of p.num.terms) {
      const ve = monsFromKey(k).filter(([n]) => n === v).reduce((s, [, e]) => s + e, 0);
      if (ve === 2) A = c; else if (ve === 1) B = c; else if (ve === 0) C = c; else return null;
    }
    if (!A || A.isZero()) return null;
    B = B || Rat.int(0); C = C || Rat.int(0);
    const D = B.mul(B).sub(A.mul(C).mul(Rat.int(4)));
    if (D.isNeg()) {
      return fail('the discriminant b^2 - 4ac is ' + D.toString() + ', which is negative, so there are no real roots; write no solution instead of the formula.');
    }
    const rootV = valSqrt(Val.rat(D));
    const twoA = Val.rat(A.mul(Rat.int(2)));
    const negB = Val.rat(B.neg());
    const rootPlus = valDiv(valAdd(negB, rootV), twoA);
    const rootMinus = valDiv(valSub(negB, rootV), twoA);
    const pairs = [[Val.rf(RF.var(v)), rootPlus], [Val.rf(RF.var(v)), rootMinus]];
    if (matchBranches(pairs, cur)) {
      return ok('quad-form', 'you applied the quadratic formula with a = ' + A.toString()
        + ', b = ' + B.toString() + ', c = ' + C.toString() + ', and kept both roots');
    }
    if (countMatches(pairs, cur) === 1 || cur.branchVals.length === 1) {
      return fail('the quadratic formula gives two roots; write both, like x = '
        + rootPlus.toPlain() + ' or x = ' + rootMinus.toPlain() + '.');
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// no solution steps
// ---------------------------------------------------------------------------

function noneStep(prev, cur) {
  if (prev.kind === 'expr') return fail('a bare expression has no solutions to deny; work with an equation.');
  if (prev.kind === 'or') return fail('no solution must come from a single equation; solve each branch of the or step in place first.');
  for (const side of ['a', 'b']) {
    const node = sideAst(prev.ast, side);
    const kV = side === 'a' ? prev.eqv.r : prev.eqv.l;
    const kC = kV.constRat();
    if (isSquareNode(node)) {
      if (kC && kC.isNeg()) return ok('root', 'a square is never negative, so no real x satisfies it');
      if (kC) return fail('the other side is ' + kC.toString() + ', which is not negative, so real roots exist; no solution does not follow.');
    }
    if (node.t === 'abs') {
      if (kC && kC.isNeg()) return ok('abs', 'an absolute value is never negative, so no real x satisfies it');
      if (kC) return fail('the other side is ' + kC.toString() + ', which is not negative, so real cases exist; no solution does not follow.');
    }
    if (node.t === 'sqrt') {
      if (kC && kC.isNeg()) return ok('root', 'a square root is never negative, so no real x satisfies it');
      if (kC) return fail('the other side is ' + kC.toString() + ', which is not negative, so real solutions exist; no solution does not follow.');
    }
  }
  const qf = quadFormDiscriminant(prev);
  if (qf && qf.isNeg()) return ok('quad-form', 'the discriminant b^2 - 4ac is negative, so there are no real roots');
  return fail('no solution does not follow from the previous step; it is licensed only when a square, a square root, or an absolute value equals a negative number.');
}

function quadFormDiscriminant(prev) {
  try {
    const l = prev.eqv.l.asRF(), r = prev.eqv.r.asRF();
    if (!l || !r) return null;
    const p = l.sub(r);
    if (!p.den.isConstant()) return null;
    const vars = p.num.vars();
    if (vars.size !== 1) return null;
    const v = [...vars][0];
    if (p.num.degreeIn(v) !== 2) return null;
    let A = null, B = null, C = null;
    for (const [k, c] of p.num.terms) {
      const ve = monsFromKey(k).filter(([n]) => n === v).reduce((s, [, e]) => s + e, 0);
      if (ve === 2) A = c; else if (ve === 1) B = c; else if (ve === 0) C = c; else return null;
    }
    if (!A || A.isZero()) return null;
    B = B || Rat.int(0); C = C || Rat.int(0);
    return B.mul(B).sub(A.mul(C).mul(Rat.int(4)));
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// or to or
// ---------------------------------------------------------------------------

function orToOr(prev, cur, options) {
  if (prev.branchVals.length !== cur.branchVals.length) {
    return fail('an or step keeps the same number of branches; solve each branch in place and keep the or form.');
  }
  const usedPrev = new Set();
  const ruleIds = [];
  const notes = [];
  for (let i = 0; i < cur.branchVals.length; i++) {
    const curB = { kind: 'eq', ast: cur.branches[i], eqv: cur.branchVals[i], raw: '@branch' + i, conditions: cur.conditions || [] };
    let matched = null;
    for (let j = 0; j < prev.branchVals.length; j++) {
      if (usedPrev.has(j)) continue;
      const prevB = { kind: 'eq', ast: prev.branches[j], eqv: prev.branchVals[j], raw: '@prev' + j + (prev.raw || ''), conditions: prev.conditions || [] };
      const res = eqToEq(prevB, curB, options);
      if (res.ok) { matched = { res, j }; break; }
    }
    if (!matched) {
      return fail('branch ' + (i + 1) + ' of this step does not follow from the previous step by a rule; each branch must advance on its own.');
    }
    if (astToPlain(prev.branches[matched.j]) === astToPlain(cur.branches[i])) {
      return fail('branch ' + (i + 1) + ' is unchanged; every branch of the or step must advance at each step.');
    }
    usedPrev.add(matched.j);
    if (!ruleIds.includes(matched.res.ruleId)) ruleIds.push(matched.res.ruleId);
    notes.push(matched.res.note);
  }
  if (ruleIds.length === 1) return ok(ruleIds[0], notes[0] || '');
  return ok('combo', 'each branch holds on its own: ' + ruleIds.map((id) => citeOf(id)).join('; '));
}

// ---------------------------------------------------------------------------
// expression to expression
// ---------------------------------------------------------------------------

function exprToExpr(prev, cur) {
  if (prev.raw.trim() === cur.raw.trim()) {
    return fail('this step is identical to the previous one; every step of a proof must change something.');
  }
  if (valEqual(prev.val, cur.val)) {
    const ruleId = classifySide(prev.ast, cur.ast, prev.val);
    return ok(ruleId, rewriteNote(ruleId));
  }
  const w = witnessFor(prev, cur, 'expr');
  if (w) return fail(w + ' No catalog rule licenses this step.');
  return fail('this step does not follow from the previous one by any rule in the catalog; open the Rule Book for the licensed moves.');
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

function checkStepCore(prev, cur, options) {
  if (cur.kind === 'error') return fail(cur.error.message);
  if (prev.kind === 'error') return fail(prev.error.message);
  if (prev.kind === 'none') return fail('the ladder ended at no solution; nothing follows it. Undo or reset to continue.');
  if (cur.kind === 'none') return noneStep(prev, cur);

  if (prev.kind === 'expr' && cur.kind !== 'expr') {
    return fail('the previous step is a bare expression; keep simplifying expressions, or solve an equation challenge instead.');
  }
  if (prev.kind !== 'expr' && cur.kind === 'expr') {
    return fail('the previous step is an equation; write an equation here, with an = sign and both sides.');
  }
  if (prev.kind === 'expr') return exprToExpr(prev, cur);
  if (prev.kind === 'or') {
    if (cur.kind !== 'or') return fail('the previous step has two or more branches; keep the or form and solve each branch in place.');
    return orToOr(prev, cur, options);
  }
  if (cur.kind === 'or') return eqToOr(prev, cur, options);
  return eqToEq(prev, cur, options);
}

export function checkStep(prev, cur, options = {}) {
  try {
    const result = checkStepCore(prev, cur, options);
    if (!result.ok) return result;
    const declared = assumptionsFor(options);
    const previous = mergeConditions(prev.conditions || [], declared);
    const additional = (cur.conditions || []).filter((predicate) => !knownCondition(predicate, previous));
    if (additional.length) return fail('this step introduces a new domain restriction: ' + additional.map(conditionText).join(', ') + '. Declare that assumption explicitly or choose another step.');
    const conditions = mergeConditions(previous, cur.conditions || []);
    return {
      ...result,
      conditions,
      conditional: conditions.length > 0,
      note: result.note + (conditions.length ? '. Retain domain: ' + conditions.map(conditionText).join(', ') : '')
    };
  } catch (error) {
    return fail(error.message);
  }
}

// Convenience: prepare two strings and check.
export function checkPair(prevRaw, curRaw, options = {}) {
  return checkStep(prepareStep(prevRaw), prepareStep(curRaw), options);
}

// Does a step match a challenge target? Or branches are compared as sets.
export function sameStep(target, step) {
  if (!target || !step || target.kind === 'error' || step.kind === 'error') return false;
  if (target.kind !== step.kind) return false;
  if (target.kind === 'none') return true;
  if (target.kind === 'expr') return valEqual(target.val, step.val);
  if (target.kind === 'eq') return eqEqual(target.eqv, step.eqv);
  if (target.branchVals.length !== step.branchVals.length) return false;
  const used = new Set();
  for (const tb of target.branchVals) {
    let found = -1;
    for (let i = 0; i < step.branchVals.length; i++) {
      if (used.has(i)) continue;
      const sb = step.branchVals[i];
      if ((valEqual(tb.l, sb.l) && valEqual(tb.r, sb.r)) || (valEqual(tb.l, sb.r) && valEqual(tb.r, sb.l))) { found = i; break; }
    }
    if (found === -1) return false;
    used.add(found);
  }
  return true;
}

export { citeOf };
