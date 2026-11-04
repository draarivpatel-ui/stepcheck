// StepCheck algebra core.
// Exact arithmetic only: BigInt rationals, multivariate polynomials over the
// rationals, and canonical values that may carry square root and absolute
// value units. Nothing here estimates; two values are equal only when the
// engine can prove it symbolically.

export class EngineError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'EngineError';
    this.code = code || 'engine';
  }
}

export const ALGEBRA_LIMITS = Object.freeze({ exponent: 16, degree: 256, terms: 512, products: 100000, rationalDigits: 4096 });

function exponentNumber(e) {
  if (!e.isInt() || e.n > BigInt(ALGEBRA_LIMITS.exponent) || e.n < -BigInt(ALGEBRA_LIMITS.exponent)) {
    throw new EngineError('whole-number exponents must be between -16 and 16', 'limit');
  }
  return Number(e.n);
}

// ---------------------------------------------------------------------------
// Rationals
// ---------------------------------------------------------------------------

function bigAbs(x) { return x < 0n ? -x : x; }

function bigGcd(a, b) {
  a = bigAbs(a); b = bigAbs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

export class Rat {
  constructor(n, d) {
    if (typeof n !== 'bigint' || typeof d !== 'bigint') throw new EngineError('rational components must be BigInt values');
    if (n.toString().length > ALGEBRA_LIMITS.rationalDigits || d.toString().length > ALGEBRA_LIMITS.rationalDigits) throw new EngineError('exact numbers exceeded the arithmetic size limit', 'limit');
    if (d === 0n) throw new EngineError('division by zero is undefined', 'domain');
    if (d < 0n) { n = -n; d = -d; }
    const g = bigGcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }
  static int(v) { return new Rat(BigInt(v), 1n); }
  static fromDecimal(intPart, fracPart) {
    // intPart: string of digits (may be signed); fracPart: string of digits.
    const sign = intPart.startsWith('-') ? -1n : 1n;
    const ip = BigInt(intPart.replace(/^[+-]/, ''));
    const den = 10n ** BigInt(fracPart.length);
    const num = ip * den + BigInt(fracPart || '0');
    return new Rat(sign * num, den);
  }
  add(o) { return new Rat(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Rat(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Rat(this.n * o.n, this.d * o.d); }
  div(o) {
    if (o.n === 0n) throw new EngineError('division by zero is undefined', 'domain');
    return new Rat(this.n * o.d, this.d * o.n);
  }
  neg() { return new Rat(-this.n, this.d); }
  abs() { return new Rat(bigAbs(this.n), this.d); }
  cmp(o) { const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  isZero() { return this.n === 0n; }
  isNeg() { return this.n < 0n; }
  isInt() { return this.d === 1n; }
  isEqual(o) { return this.n === o.n && this.d === o.d; }
  toString() { return this.d === 1n ? this.n.toString() : this.n.toString() + '/' + this.d.toString(); }
}

export function ratPlain(r) { return r.toString(); }

export function isPerfectSquare(x) {
  if (x < 0n) return null;
  if (x < 2n) return x;
  // Newton's method on BigInt.
  let z = x, y = (z + 1n) / 2n;
  while (y < z) { z = y; y = (z + x / z) / 2n; }
  return z * z === x ? z : null;
}

// sqrt(n/d) for d > 0 equals sqrt(n*d)/d.
export function sqrtRat(r) {
  if (r.isNeg()) return null; // caller decides how to report the domain error
  const t = r.n * r.d;
  const root = isPerfectSquare(t);
  if (root === null) return null;
  return new Rat(root, r.d);
}

// ---------------------------------------------------------------------------
// Multivariate polynomials with rational coefficients
// ---------------------------------------------------------------------------

export function monsFromKey(key) {
  if (key === '1') return [];
  return key.split(';').map((part) => {
    const i = part.indexOf('^');
    return [part.slice(0, i), parseInt(part.slice(i + 1), 10)];
  });
}

export function keyOfMons(mons) {
  if (mons.some(([, e]) => !Number.isSafeInteger(e) || e < 0) || mons.reduce((sum, [, e]) => sum + e, 0) > ALGEBRA_LIMITS.degree) throw new EngineError('polynomial degree exceeds 256', 'limit');
  const clean = mons.filter(([, e]) => e > 0);
  if (clean.length === 0) return '1';
  clean.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return clean.map(([n, e]) => n + '^' + e).join(';');
}

export class MPoly {
  // terms: Map<key, Rat>
  constructor(terms) {
    if (terms.size > ALGEBRA_LIMITS.terms) throw new EngineError('polynomial expansion exceeds 512 terms', 'limit');
    this.terms = terms;
  }
  static zero() { return new MPoly(new Map()); }
  static rat(r) {
    if (r.isZero()) return MPoly.zero();
    return new MPoly(new Map([['1', r]]));
  }
  static var(name) {
    return new MPoly(new Map([[keyOfMons([[name, 1]]), Rat.int(1)]]));
  }
  clone() { return new MPoly(new Map(this.terms)); }
  add(o) {
    const out = this.clone();
    for (const [k, c] of o.terms) {
      const cur = out.terms.get(k);
      const sum = cur ? cur.add(c) : c;
      if (sum.isZero()) out.terms.delete(k); else out.terms.set(k, sum);
      if (out.terms.size > ALGEBRA_LIMITS.terms) throw new EngineError('polynomial expansion exceeds 512 terms', 'limit');
    }
    return out;
  }
  neg() {
    const out = new Map();
    for (const [k, c] of this.terms) out.set(k, c.neg());
    return new MPoly(out);
  }
  sub(o) { return this.add(o.neg()); }
  mul(o) {
    if (this.terms.size * o.terms.size > ALGEBRA_LIMITS.products) throw new EngineError('polynomial multiplication exceeds the operation limit', 'limit');
    const out = new Map();
    for (const [k1, c1] of this.terms) {
      for (const [k2, c2] of o.terms) {
        const mons = mergeMons(monsFromKey(k1), monsFromKey(k2));
        const k = keyOfMons(mons);
        const cur = out.get(k);
        const sum = cur ? cur.add(c1.mul(c2)) : c1.mul(c2);
        if (sum.isZero()) out.delete(k); else out.set(k, sum);
        if (out.size > ALGEBRA_LIMITS.terms) throw new EngineError('polynomial expansion exceeds 512 terms', 'limit');
      }
    }
    return new MPoly(out);
  }
  scale(r) {
    if (r.isZero()) return MPoly.zero();
    const out = new Map();
    for (const [k, c] of this.terms) out.set(k, c.mul(r));
    return new MPoly(out);
  }
  pow(e) {
    if (!Number.isInteger(e) || e < 0 || e > ALGEBRA_LIMITS.exponent) throw new EngineError('polynomial powers must be whole numbers from 0 through 16', 'limit');
    let out = MPoly.rat(Rat.int(1));
    for (let i = 0; i < e; i++) out = out.mul(this);
    return out;
  }
  isZero() { return this.terms.size === 0; }
  isConstant() {
    if (this.terms.size === 0) return true;
    if (this.terms.size > 1) return false;
    return this.terms.has('1');
  }
  constValue() { return this.terms.get('1') || null; }
  toKey() {
    return [...this.terms.entries()]
      .map(([k, c]) => k + '#' + c.toString())
      .sort()
      .join('|');
  }
  isEqual(o) { return this.toKey() === o.toKey(); }
  vars() {
    const s = new Set();
    for (const k of this.terms.keys()) for (const [n] of monsFromKey(k)) s.add(n);
    return s;
  }
  degreeIn(name) {
    let d = 0;
    for (const k of this.terms.keys()) {
      for (const [n, e] of monsFromKey(k)) if (n === name && e > d) d = e;
    }
    return d;
  }
  termCount() { return this.terms.size; }
  // Plain text like 3x^2 - x/2 + 5. Used inside engine messages.
  toPlain() {
    if (this.terms.size === 0) return '0';
    const entries = [...this.terms.entries()].sort((a, b) => {
      const da = totalDegree(a[0]), db = totalDegree(b[0]);
      if (da !== db) return db - da;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    let out = '';
    for (const [k, c] of entries) {
      const neg = c.isNeg();
      const mag = neg ? c.neg() : c;
      let term = monsPlain(k);
      const omitOne = mag.isInt() && mag.n === 1n && term !== '';
      if (!omitOne) {
        const cs = mag.toString();
        term = (mag.d === 1n ? cs : '(' + cs + ')') + term;
      }
      out += out === '' ? (neg ? '-' + term : term) : (neg ? ' - ' : ' + ') + term;
    }
    return out;
  }
}

function totalDegree(key) {
  return monsFromKey(key).reduce((s, [, e]) => s + e, 0);
}

function monsPlain(key) {
  return monsFromKey(key).map(([n, e]) => (e === 1 ? n : n + '^' + e)).join('');
}

function mergeMons(a, b) {
  const map = new Map();
  for (const [n, e] of a) map.set(n, (map.get(n) || 0) + e);
  for (const [n, e] of b) map.set(n, (map.get(n) || 0) + e);
  return [...map.entries()];
}

// ---------------------------------------------------------------------------
// Exact multivariate polynomial division. Returns the quotient when the
// division is exact (remainder zero), else null. Used to recognize ratios
// like (4a*P)/P as the polynomial 4a.
// ---------------------------------------------------------------------------

function leadTerm(p) {
  let best = null;
  for (const [k, c] of p.terms) {
    if (!best
      || totalDegree(k) > totalDegree(best[0])
      || (totalDegree(k) === totalDegree(best[0]) && k > best[0])) {
      best = [k, c];
    }
  }
  return best;
}

export function polyExactDivide(a, b) {
  if (b.isZero()) return null;
  let rest = a.clone();
  const qTerms = new Map();
  let guard = 0;
  while (!rest.isZero()) {
    if (++guard > 400) return null;
    const ltR = leadTerm(rest);
    const ltB = leadTerm(b);
    const bMap = new Map(monsFromKey(ltB[0]));
    const rMap = new Map(monsFromKey(ltR[0]));
    if ([...bMap].some(([name, power]) => (rMap.get(name) || 0) < power)) return null;
    let divisible = true;
    const qMons = monsFromKey(ltR[0]).map(([n, e]) => {
      const be = bMap.get(n) || 0;
      if (e - be < 0) { divisible = false; return [n, 0]; }
      return [n, e - be];
    });
    if (!divisible) return null;
    const qKey = keyOfMons(qMons);
    const coef = ltR[1].div(ltB[1]);
    qTerms.set(qKey, (qTerms.get(qKey) || Rat.int(0)).add(coef));
    const qTerm = new MPoly(new Map([[qKey, coef]]));
    rest = rest.sub(qTerm.mul(b));
  }
  return new MPoly(qTerms);
}

// ---------------------------------------------------------------------------
// Rational functions: num/den, both polynomials, den never the zero poly.
// Equality is checked by cross multiplication, so no GCD work is needed.
// ---------------------------------------------------------------------------

export class RF {
  constructor(num, den) {
    if (den.isZero()) throw new EngineError('division by zero is undefined', 'domain');
    this.num = num;
    this.den = den;
  }
  static poly(p) { return new RF(p, MPoly.rat(Rat.int(1))); }
  static rat(r) { return new RF(MPoly.rat(r), MPoly.rat(Rat.int(1))); }
  static var(name) { return RF.poly(MPoly.var(name)); }
  add(o) {
    if (this.den.toKey() === o.den.toKey()) return new RF(this.num.add(o.num), this.den);
    return new RF(this.num.mul(o.den).add(o.num.mul(this.den)), this.den.mul(o.den));
  }
  neg() { return new RF(this.num.neg(), this.den); }
  sub(o) { return this.add(o.neg()); }
  mul(o) { return new RF(this.num.mul(o.num), this.den.mul(o.den)); }
  div(o) {
    if (o.num.isZero()) throw new EngineError('division by zero is undefined', 'domain');
    return new RF(this.num.mul(o.den), this.den.mul(o.num));
  }
  scale(r) { return new RF(this.num.scale(r), this.den); }
  isZero() { return this.num.isZero(); }
  isConstantRat() {
    if (!this.num.isConstant() || !this.den.isConstant()) return null;
    const n = this.num.constValue() || Rat.int(0);
    const d = this.den.constValue() || Rat.int(1);
    return n.div(d);
  }
  isEqual(o) { return this.num.mul(o.den).sub(o.num.mul(this.den)).isZero(); }
  hasVars() { return this.num.vars().size > 0 || this.den.vars().size > 0; }
  toKey() { return this.num.toKey() + '//' + this.den.toKey(); }
  toPlain() {
    const c = this.isConstantRat();
    if (c !== null) return c.toString();
    const n = this.num.toPlain();
    const needsParens = n.startsWith('-') || this.num.termCount() > 1;
    if (this.den.isConstant()) {
      const d = this.den.constValue();
      if (d && d.isInt() && d.n === 1n) return n;
      return (needsParens ? '(' + n + ')' : n) + '/' + d.toString();
    }
    return '(' + n + ')/(' + this.den.toPlain() + ')';
  }
}

// ---------------------------------------------------------------------------
// Canonical values: a sorted list of terms, each a rational function
// coefficient times a unit. Units are one, sqrt(f) or abs(f).
// ---------------------------------------------------------------------------

const ONE = { k: 'one' };

function unitKey(u) {
  if (u.k === 'one') return 'one';
  return u.k + '(' + u.f.toKey() + ')';
}

function unitPlain(u) {
  if (u.k === 'one') return '';
  if (u.k === 'sq') return 'sqrt(' + u.f.toPlain() + ')';
  return '|' + u.f.toPlain() + '|';
}

export function makeSq(f) {
  const c = f.isConstantRat();
  if (c !== null) {
    const r = sqrtRat(c);
    if (r !== null) return { unit: ONE, cf: RF.rat(r) };
    if (c.isNeg()) {
      throw new EngineError(
        'the square root of ' + c.toString() + ' is not a real number; square roots of negatives are rejected here',
        'domain'
      );
    }
  }
  return { unit: { k: 'sq', f }, cf: RF.rat(Rat.int(1)) };
}

// Multiply two units. Returns {u, k}: the resulting unit and an extra
// rational function factor that must be folded into the coefficient.
// On the domain where the original expressions are defined, sqrt(f) is only
// meaningful when f >= 0, so sqrt(f)*sqrt(f) = f and sqrt(f1)*sqrt(f2) =
// sqrt(f1*f2) hold exactly.
function unitMul(u1, u2) {
  if (u1.k === 'one') return { u: u2, k: RF.rat(Rat.int(1)) };
  if (u2.k === 'one') return { u: u1, k: RF.rat(Rat.int(1)) };
  if (u1.k !== u2.k) {
    throw new EngineError(
      'products mixing square roots with absolute values are not supported in this subset',
      'unsupported'
    );
  }
  if (u1.k === 'sq') {
    if (u1.f.toKey() === u2.f.toKey()) return { u: ONE, k: u1.f };
    const m = makeSq(u1.f.mul(u2.f));
    return { u: m.unit, k: m.cf };
  }
  // abs(f1)*abs(f2) = abs(f1*f2); constant cases never reach a unit because
  // valAbs evaluates them.
  return { u: { k: 'abs', f: u1.f.mul(u2.f) }, k: RF.rat(Rat.int(1)) };
}

export class Val {
  // terms: array of {cf: RF, u: unit}, sorted by unit key, no zero cf.
  constructor(terms) {
    if (terms.length > ALGEBRA_LIMITS.terms) throw new EngineError('symbolic expansion exceeds 512 terms', 'limit');
    this.terms = terms;
  }
  static zero() { return new Val([]); }
  static rat(r) { return r.isZero() ? Val.zero() : new Val([{ cf: RF.rat(r), u: ONE }]); }
  static rf(f) { return f.isZero() ? Val.zero() : new Val([{ cf: f, u: ONE }]); }

  static build(terms) {
    const map = new Map();
    for (const { cf, u } of terms) {
      if (cf.isZero()) continue;
      const k = unitKey(u);
      const cur = map.get(k);
      const sum = cur ? cur.add(cf) : cf;
      if (sum.isZero()) map.delete(k); else map.set(k, sum);
      if (map.size > ALGEBRA_LIMITS.terms) throw new EngineError('symbolic expansion exceeds 512 terms', 'limit');
    }
    const out = [...map.entries()]
      .map(([k, cf]) => ({ cf, u: unitFromKeyPrefix(k) }))
      .sort((a, b) => (unitKey(a.u) < unitKey(b.u) ? -1 : unitKey(a.u) > unitKey(b.u) ? 1 : 0));
    return new Val(out);
  }
  add(o) {
    return Val.build([...this.terms, ...o.terms]);
  }
  neg() {
    return new Val(this.terms.map((t) => ({ cf: t.cf.neg(), u: t.u })));
  }
  sub(o) { return this.add(o.neg()); }
  scale(r) {
    if (r.isZero()) return Val.zero();
    return new Val(this.terms.map((t) => ({ cf: t.cf.scale(r), u: t.u })));
  }
  mul(o) {
    if (this.terms.length * o.terms.length > ALGEBRA_LIMITS.products) throw new EngineError('symbolic multiplication exceeds the operation limit', 'limit');
    const terms = [];
    for (const a of this.terms) {
      for (const b of o.terms) {
        const res = unitMul(a.u, b.u);
        terms.push({ cf: a.cf.mul(b.cf).mul(res.k), u: res.u });
      }
    }
    return Val.build(terms);
  }
  isZero() { return this.terms.length === 0; }
  hasVars() { return this.terms.some((t) => t.cf.hasVars() || (t.u.f && t.u.f.hasVars())); }
  // The value as a lone rational function, or null when it carries units or
  // several distinct unit families. The zero value reads as the zero function.
  asRF() {
    if (this.terms.length === 0) return RF.rat(Rat.int(0));
    if (this.terms.length !== 1 || this.terms[0].u.k !== 'one') return null;
    return this.terms[0].cf;
  }
  constRat() {
    const f = this.asRF();
    return f ? f.isConstantRat() : null;
  }
  isEqual(o) {
    if (this.terms.length !== o.terms.length) return false;
    for (let i = 0; i < this.terms.length; i++) {
      if (unitKey(this.terms[i].u) !== unitKey(o.terms[i].u)) return false;
      if (!this.terms[i].cf.isEqual(o.terms[i].cf)) return false;
    }
    return true;
  }
  toPlain() {
    if (this.terms.length === 0) return '0';
    return this.terms
      .map((t) => {
        const up = unitPlain(t.u);
        const cp = t.cf.toPlain();
        if (up === '') return cp;
        if (t.cf.isConstantRat() && t.cf.isConstantRat().isEqual(Rat.int(1))) return up;
        return cp + ' ' + up;
      })
      .join(' + ');
  }
}

// Rebuild a unit from its key so Val.build can regroup terms. Keys are only
// ever produced by unitKey, so this parse is safe within the engine.
function unitFromKeyPrefix(key) {
  if (key === 'one') return ONE;
  const k = key.startsWith('sq(') ? 'sq' : 'abs';
  const inner = key.slice(k.length + 1, -1);
  const [nPart, dPart] = inner.split('//');
  const num = polyFromKeyList(nPart);
  const den = polyFromKeyList(dPart);
  return { k, f: new RF(num, den) };
}

function polyFromKeyList(s) {
  const terms = new Map();
  if (s === '') return MPoly.zero();
  for (const entry of s.split('|')) {
    const i = entry.indexOf('#');
    terms.set(entry.slice(0, i), ratFromString(entry.slice(i + 1)));
  }
  return new MPoly(terms);
}

function ratFromString(s) {
  const i = s.indexOf('/');
  if (i === -1) return new Rat(BigInt(s), 1n);
  return new Rat(BigInt(s.slice(0, i)), BigInt(s.slice(i + 1)));
}

// ---------------------------------------------------------------------------
// Value level operations
// ---------------------------------------------------------------------------

export function valAdd(a, b) { return a.add(b); }
export function valSub(a, b) { return a.sub(b); }
export function valMul(a, b) { return a.mul(b); }
export function valNeg(a) { return a.neg(); }

export function valDiv(a, b) {
  if (b.isZero()) throw new EngineError('division by zero is undefined', 'domain');
  const bf = b.asRF();
  if (bf) {
    // Divide by a plain rational function.
    const af = a.asRF();
    if (af) return Val.rf(af.div(bf));
    return new Val(a.terms.map((t) => ({ cf: t.cf.div(bf), u: t.u })));
  }
  // b carries units or several terms. When a and b share the same unit
  // families term by term, the quotient must be one common scalar c with
  // a = c * b; anything else is outside the subset.
  if (
    a.terms.length === b.terms.length
    && a.terms.every((t, i) => unitKey(t.u) === unitKey(b.terms[i].u))
  ) {
    const quots = a.terms.map((t, i) => t.cf.div(b.terms[i].cf));
    for (let i = 1; i < quots.length; i++) {
      if (!quots[0].isEqual(quots[i])) {
        throw new EngineError('this quotient is more complex than the subset allows; simplify the divisor first', 'unsupported');
      }
    }
    return Val.rf(quots[0]);
  }
  if (b.terms.length === 1) {
    throw new EngineError('division by a radical is not supported in this subset; rewrite without it', 'unsupported');
  }
  throw new EngineError('this quotient is more complex than the subset allows; simplify the divisor first', 'unsupported');
}

export function valPow(a, e) {
  if (e.d !== 1n) {
    if (e.n === 1n && e.d === 2n) return valSqrt(a);
    throw new EngineError('fractional exponents other than 1/2 are not supported; use sqrt( ) for square roots', 'unsupported');
  }
  const n = exponentNumber(e);
  if (n === 0) {
    if (a.isZero()) throw new EngineError('zero raised to the zero power is undefined', 'domain');
    return Val.rat(Rat.int(1));
  }
  if (n > 0) {
    let out = Val.rat(Rat.int(1));
    for (let i = 0; i < n; i++) out = out.mul(a);
    return out;
  }
  // Negative exponent: reciprocal of a plain rational function only.
  const f = a.asRF();
  if (!f) {
    throw new EngineError('negative exponents are only supported on plain expressions in this subset', 'unsupported');
  }
  if (f.num.isZero()) throw new EngineError('division by zero is undefined', 'domain');
  return Val.rf(new RF(f.den.pow(-n), f.num.pow(-n)));
}

export function valSqrt(a) {
  const f = a.asRF();
  if (!f) {
    throw new EngineError('square roots of expressions that already contain radicals or absolute values are not supported in this subset', 'unsupported');
  }
  const c = f.isConstantRat();
  if (c !== null) {
    if (c.isNeg()) {
      throw new EngineError(
        'the square root of ' + c.toString() + ' is not a real number; square roots of negatives are rejected here',
        'domain'
      );
    }
    const r = sqrtRat(c);
    if (r !== null) return Val.rat(r);
  }
  return Val.build([{ cf: RF.rat(Rat.int(1)), u: { k: 'sq', f } }]);
}

export function valAbs(a) {
  const f = a.asRF();
  if (!f) {
    throw new EngineError('absolute values of expressions with radicals are not supported in this subset', 'unsupported');
  }
  const c = f.isConstantRat();
  if (c !== null) return Val.rat(c.abs());
  return Val.build([{ cf: RF.rat(Rat.int(1)), u: { k: 'abs', f } }]);
}

export function valEqual(a, b) { return a.isEqual(b); }

// ---------------------------------------------------------------------------
// AST evaluation at rational probe points (for failure witnesses) and helpers
// ---------------------------------------------------------------------------

export function varsOfAst(ast, out = new Set()) {
  switch (ast.t) {
    case 'var': out.add(ast.name); break;
    case 'num': break;
    case 'add': case 'mul': ast.args.forEach((a) => varsOfAst(a, out)); break;
    case 'chain': {
      varsOfAst(ast.head, out);
      ast.rest.forEach((r) => varsOfAst(r.node, out));
      break;
    }
    case 'sub': case 'div': case 'eq':
      varsOfAst(ast.a, out); varsOfAst(ast.b, out); break;
    case 'pow': varsOfAst(ast.a, out); break;
    case 'neg': case 'sqrt': case 'abs': varsOfAst(ast.a, out); break;
    default: break;
  }
  return out;
}

// Evaluate an AST at an environment {name: Rat}. Returns Rat or null when the
// evaluation cannot be done exactly (radicals of non squares, division by
// zero, unsupported shapes).
export function evalAstRat(ast, env) {
  switch (ast.t) {
    case 'num': return ast.v;
    case 'var': return env[ast.name] ?? null;
    case 'add': {
      let acc = Rat.int(0);
      for (const a of ast.args) { const v = evalAstRat(a, env); if (!v) return null; acc = acc.add(v); }
      return acc;
    }
    case 'chain': {
      const h = evalAstRat(ast.head, env);
      if (!h) return null;
      let acc = h;
      for (const r of ast.rest) {
        const v = evalAstRat(r.node, env);
        if (!v) return null;
        acc = r.op === '+' ? acc.add(v) : acc.sub(v);
      }
      return acc;
    }
    case 'sub': {
      const a = evalAstRat(ast.a, env), b = evalAstRat(ast.b, env);
      return a && b ? a.sub(b) : null;
    }
    case 'neg': {
      const a = evalAstRat(ast.a, env);
      return a ? a.neg() : null;
    }
    case 'mul': {
      let acc = Rat.int(1);
      for (const a of ast.args) { const v = evalAstRat(a, env); if (!v) return null; acc = acc.mul(v); }
      return acc;
    }
    case 'div': {
      const a = evalAstRat(ast.a, env), b = evalAstRat(ast.b, env);
      if (!a || !b || b.isZero()) return null;
      return a.div(b);
    }
    case 'pow': {
      const a = evalAstRat(ast.a, env);
      if (!a || !ast.e.isInt()) return null;
      let n;
      try { n = exponentNumber(ast.e); } catch { return null; }
      if (n === 0 && a.isZero()) return null;
      if (n < 0) {
        if (a.isZero()) return null;
        let acc = Rat.int(1);
        for (let i = 0; i < -n; i++) acc = acc.div(a);
        return acc;
      }
      let acc = Rat.int(1);
      for (let i = 0; i < n; i++) acc = acc.mul(a);
      return acc;
    }
    case 'sqrt': {
      const a = evalAstRat(ast.a, env);
      if (!a) return null;
      return sqrtRat(a);
    }
    case 'abs': {
      const a = evalAstRat(ast.a, env);
      return a ? a.abs() : null;
    }
    default: return null;
  }
}

// Canonicalize an AST into a Val. Throws EngineError for domain violations
// (square roots of negatives, division by zero) and unsupported shapes.
export function canon(ast) {
  switch (ast.t) {
    case 'num': return Val.rat(ast.v);
    case 'var': return Val.rf(RF.var(ast.name));
    case 'add': {
      let acc = Val.zero();
      for (const a of ast.args) acc = acc.add(canon(a));
      return acc;
    }
    case 'chain': {
      let acc = canon(ast.head);
      for (const r of ast.rest) {
        const v = canon(r.node);
        acc = r.op === '+' ? acc.add(v) : acc.sub(v);
      }
      return acc;
    }
    case 'sub': return canon(ast.a).sub(canon(ast.b));
    case 'neg': return canon(ast.a).neg();
    case 'mul': {
      let acc = Val.rat(Rat.int(1));
      for (const a of ast.args) acc = acc.mul(canon(a));
      return acc;
    }
    case 'div': return valDiv(canon(ast.a), canon(ast.b));
    case 'pow': return valPow(canon(ast.a), ast.e);
    case 'sqrt': return valSqrt(canon(ast.a));
    case 'abs': return valAbs(canon(ast.a));
    case 'eq': {
      return canon(ast.a); // never used at top level; kept for safety
    }
    default: throw new EngineError('unsupported expression');
  }
}

export function canonEq(ast) {
  return { l: canon(ast.a), r: canon(ast.b) };
}
