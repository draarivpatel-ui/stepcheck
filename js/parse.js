// StepCheck parser: a hand written tokenizer and recursive descent parser for
// the StepCheck statement subset. Every failure carries a message that names
// the offending position, so the learner can see exactly what went wrong.

import { Rat, EngineError, varsOfAst as algebraVarsOfAst, evalAstRat as algebraEvalAstRat } from './algebra.js';

export class ParseError extends Error {
  constructor(message, pos) {
    super(message);
    this.name = 'ParseError';
    this.pos = typeof pos === 'number' ? pos : 0;
  }
}

const SUPS = { '\u00b2': 2, '\u00b3': 3, '\u2074': 4, '\u2075': 5, '\u2076': 6 };
const MULS = ['\u00d7', '\u00b7', '\u2219', '\u22c5'];

export const PARSE_LIMITS = Object.freeze({ characters: 2048, tokens: 512, nesting: 32, numberDigits: 128 });

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export function tokenize(src) {
  if (typeof src !== 'string') throw new ParseError('type a step first', 0);
  if (src.length > PARSE_LIMITS.characters) throw new ParseError('a step may contain at most 2048 characters', PARSE_LIMITS.characters);
  const toks = [];
  let i = 0;
  let nesting = 0;
  const push = (tt, v, pos, text) => {
    if (toks.length >= PARSE_LIMITS.tokens) throw new ParseError('this step has too many tokens; use shorter steps', pos);
    if (tt === 'lparen' && ++nesting > PARSE_LIMITS.nesting) throw new ParseError('parentheses may nest at most 32 levels', pos);
    if (tt === 'rparen') nesting -= 1;
    if (tt === 'num' && v.replace('.', '').length > PARSE_LIMITS.numberDigits) throw new ParseError('a number may contain at most 128 digits', pos);
    toks.push({ tt, v, pos, text: text ?? v });
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }

    // Numbers
    if (ch >= '0' && ch <= '9') {
      const start = i;
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      if (src[i] === '.') {
        if (!(src[i + 1] >= '0' && src[i + 1] <= '9')) {
          throw new ParseError('a decimal point needs digits after it, like 3.5', i);
        }
        i++;
        while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      }
      if (src[i] === '.' && src[i + 1] >= '0' && src[i + 1] <= '9') {
        throw new ParseError('"' + src.slice(start, i + 2) + '" is not a valid number; use a single decimal point', start);
      }
      push('num', src.slice(start, i), start);
      continue;
    }
    if (ch === '.') {
      if (src[i + 1] >= '0' && src[i + 1] <= '9') {
        throw new ParseError('start decimals with a digit, like 0.5', i);
      }
      throw new ParseError('unexpected "." at position ' + (i + 1), i);
    }

    // Letter runs: single letters are variables; exact keyword runs are special.
    if (/[a-zA-Z]/.test(ch)) {
      const start = i;
      while (i < src.length && /[a-zA-Z]/.test(src[i])) i++;
      const word = src.slice(start, i);
      const lower = word.toLowerCase();
      if (lower === 'or') { push('or', 'or', start); continue; }
      if (lower === 'sqrt' || lower === 'abs') {
        let j = i;
        while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j++;
        if (src[j] !== '(') {
          throw new ParseError(
            lower + ' needs parentheses: write ' + lower + '(9) with the expression inside',
            start
          );
        }
        push('func', lower, start);
        continue;
      }
      if (word.length === 1) { push('var', word, start); continue; }
      // A run like xy means x times y: split into single letter variables.
      for (let k = start; k < i; k++) push('var', src[k], k);
      continue;
    }

    // Powers and superscripts
    if (ch === '^') { push('op', '^', i); i++; continue; }
    if (ch === '*' && src[i + 1] === '*') { push('op', '^', i); i += 2; continue; }
    if (SUPS[ch]) { push('sup', SUPS[ch], i); i++; continue; }

    // Operators, unicode friendly
    if (ch === '\u2212') { push('op', '-', i); i++; continue; }
    if (MULS.includes(ch)) { push('op', '*', i); i++; continue; }
    if (ch === '\u00f7') { push('op', '/', i); i++; continue; }
    if (ch === '+') { push('op', '+', i); i++; continue; }
    if (ch === '-') { push('op', '-', i); i++; continue; }
    if (ch === '*') { push('op', '*', i); i++; continue; }
    if (ch === '/') { push('op', '/', i); i++; continue; }
    if (ch === '=') {
      if (src[i + 1] === '=') {
        throw new ParseError('use a single = sign, not ==', i);
      }
      push('op', '=', i); i++; continue;
    }

    // Grouping
    if (ch === '(') { push('lparen', '(', i); i++; continue; }
    if (ch === ')') { push('rparen', ')', i); i++; continue; }
    if (ch === '\u221a') { push('sqrtu', '\u221a', i); i++; continue; }
    if (ch === '|') { push('bar', '|', i); i++; continue; }

    if ('<>'.includes(ch) || ch === '\u2264' || ch === '\u2265') {
      throw new ParseError('this engine checks equalities only; write the statement with = ', i);
    }
    if ('[{'.includes(ch)) {
      throw new ParseError('use parentheses ( ), not brackets, for grouping', i);
    }
    if (',;:'.includes(ch)) {
      throw new ParseError('unexpected "' + ch + '" at position ' + (i + 1) + '; list alternatives with or', i);
    }
    throw new ParseError('unexpected character "' + ch + '" at position ' + (i + 1), i);
  }
  return toks;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  constructor(toks, src) {
    this.toks = toks;
    this.src = src;
    this.i = 0;
    this.inAbs = false;
  }
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  end() { return this.i >= this.toks.length; }

  expectRparen(openPos) {
    const t = this.peek();
    if (!t) {
      throw new ParseError('missing a closing parenthesis: the one opened at position ' + (openPos + 1) + ' is never closed', this.src.length);
    }
    if (t.tt !== 'rparen') {
      throw new ParseError('missing a closing parenthesis: the one opened at position ' + (openPos + 1) + ' is never closed', t.pos);
    }
    return this.next();
  }

  parseChain() {
    const head = this.parseTerm();
    if (!this.peek() || !(this.peek().tt === 'op' && (this.peek().v === '+' || this.peek().v === '-'))) return head;
    const rest = [];
    while (this.peek() && this.peek().tt === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
      const op = this.next().v;
      const node = this.parseTerm();
      rest.push({ op, node });
    }
    return { t: 'chain', head, rest, pos: head.pos };
  }

  startsOperand(tok) {
    if (!tok) return false;
    if (tok.tt === 'bar') {
      // Inside an absolute value the next bar closes it; outside, a bar can
      // open a new factor for implicit multiplication, as in |x| |y|.
      return !this.inAbs;
    }
    return ['num', 'var', 'func', 'sqrtu', 'lparen'].includes(tok.tt);
  }

  parseTerm() {
    let node = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t && t.tt === 'op' && t.v === '*') {
        this.next();
        node = { t: 'mul', args: mulArgs(node, this.parseUnary()), pos: node.pos };
      } else if (t && t.tt === 'op' && t.v === '/') {
        this.next();
        node = { t: 'div', a: node, b: this.parseUnary(), pos: node.pos };
      } else if (this.startsOperand(t)) {
        node = { t: 'mul', args: mulArgs(node, this.parseUnary()), pos: node.pos };
      } else {
        break;
      }
    }
    return node;
  }

  parseUnary() {
    const t = this.peek();
    if (t && t.tt === 'op' && t.v === '-') {
      this.next();
      return { t: 'neg', a: this.parseUnary(), pos: t.pos };
    }
    if (t && t.tt === 'op' && t.v === '+') {
      this.next();
      return this.parseUnary();
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t && t.tt === 'op' && t.v === '^') {
        this.next();
        const e = this.parseExponent();
        node = e.isEqual(new Rat(1n, 2n)) ? { t: 'sqrt', a: node, pos: node.pos } : { t: 'pow', a: node, e, pos: node.pos };
      } else if (t && t.tt === 'sup') {
        this.next();
        node = { t: 'pow', a: node, e: Rat.int(t.v), pos: node.pos };
      } else {
        break;
      }
    }
    return node;
  }

  parseExponent() {
    const t = this.peek();
    if (!t) throw new ParseError('the power ^ needs a number after it, like x^2', this.src.length);
    if (t.tt === 'lparen') {
      const open = this.next().pos;
      const inner = this.parseChain();
      this.expectRparen(open);
      return this.exponentFromNode(inner, open);
    }
    let sign = 1n;
    if (t.tt === 'op' && (t.v === '-' || t.v === '+')) {
      this.next();
      if (t.v === '-') sign = -1n;
      return this.parseExponentNumber(sign, t.pos);
    }
    return this.parseExponentNumber(1n, t.pos);
  }

  parseExponentNumber(sign, signPos) {
    const t = this.peek();
    if (!t || t.tt !== 'num') {
      throw new ParseError('the exponent here must be a plain number, like x^2', t ? t.pos : this.src.length);
    }
    this.next();
    const after = this.peek();
    if (after && (after.tt === 'op' && after.v === '^' || after.tt === 'sup')) {
      throw new ParseError('nested powers in the exponent are not supported; write the exponent as one number', after.pos);
    }
    return new Rat(BigInt(sign) * BigInt(numberToBigIntString(t.v)), 10n ** BigInt(decimalsOf(t.v)));
  }

  exponentFromNode(node, openPos) {
    const { varsOfAst, evalAstRat } = delayedAlgebra();
    if (varsOfAst(node).size > 0) {
      throw new ParseError('the exponent here must be a plain number, like x^2', openPos);
    }
    const v = evalAstRat(node, {});
    if (!v) throw new ParseError('the exponent here must be a plain number, like x^2', openPos);
    return v;
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) {
      throw new ParseError('the step ends abruptly; complete the expression', this.src.length);
    }
    if (t.tt === 'num') {
      this.next();
      const body = t.v;
      const dot = body.indexOf('.');
      const v = dot === -1
        ? new Rat(BigInt(body), 1n)
        : Rat.fromDecimal(body.slice(0, dot), body.slice(dot + 1));
      return { t: 'num', v, pos: t.pos };
    }
    if (t.tt === 'var') {
      this.next();
      return { t: 'var', name: t.v, pos: t.pos };
    }
    if (t.tt === 'lparen') {
      const open = this.next().pos;
      const nt = this.peek();
      if (nt && nt.tt === 'rparen') {
        throw new ParseError('empty parentheses: put an expression inside them', nt.pos);
      }
      const inner = this.parseChain();
      this.expectRparen(open);
      return inner;
    }
    if (t.tt === 'func') {
      this.next();
      const open = this.next(); // lparen guaranteed by the tokenizer
      const nt = this.peek();
      if (nt && nt.tt === 'rparen') {
        throw new ParseError('empty parentheses: put an expression inside them', nt.pos);
      }
      const inner = this.parseChain();
      this.expectRparen(open.pos);
      return { t: t.v, a: inner, pos: t.pos };
    }
    if (t.tt === 'sqrtu') {
      this.next();
      const operand = this.parsePostfix();
      return { t: 'sqrt', a: operand, pos: t.pos };
    }
    if (t.tt === 'bar') {
      const open = t.pos;
      if (this.inAbs) throw new ParseError('absolute values cannot be nested; use parentheses inside instead', open);
      this.next();
      this.inAbs = true;
      const inner = this.parseChain();
      this.inAbs = false;
      const ct = this.peek();
      if (!ct) {
        throw new ParseError('an absolute value opened at position ' + (open + 1) + ' is missing its closing |', this.src.length);
      }
      if (ct.tt !== 'bar') {
        throw new ParseError('an absolute value must close with | before "' + ct.text + '" at position ' + (ct.pos + 1), ct.pos);
      }
      this.next();
      return { t: 'abs', a: inner, pos: open };
    }
    if (t.tt === 'rparen') {
      throw new ParseError('unexpected ")" at position ' + (t.pos + 1) + '; there is no matching opening parenthesis', t.pos);
    }
    if (t.tt === 'sup') {
      throw new ParseError('a superscript exponent needs something before it, like x' + t.text, t.pos);
    }
    if (t.tt === 'or') {
      throw new ParseError('or needs a complete equation on each side, like x = 1 or x = -1', t.pos);
    }
    throw new ParseError('unexpected "' + t.text + '" at position ' + (t.pos + 1), t.pos);
  }
}

function numberToBigIntString(s) { return s.replace('.', ''); }
function decimalsOf(s) { const i = s.indexOf('.'); return i === -1 ? 0 : s.length - i - 1; }

function mulArgs(a, b) {
  const out = [];
  if (a.t === 'mul') out.push(...a.args); else out.push(a);
  if (b.t === 'mul') out.push(...b.args); else out.push(b);
  return out;
}

// Lazy accessor kept for symmetry with the exponent checker above; the
// algebra helpers are imported statically at the top of this module.
let _alg = null;
function delayedAlgebra() {
  if (!_alg) _alg = { varsOfAst: algebraVarsOfAst, evalAstRat: algebraEvalAstRat };
  return _alg;
}

// ---------------------------------------------------------------------------
// Step level parsing
// ---------------------------------------------------------------------------

function parseEqOrExpr(p) {
  const a = p.parseChain();
  const t = p.peek();
  if (t && t.tt === 'op' && t.v === '=') {
    p.next();
    const b = p.parseChain();
    return { t: 'eq', a, b, pos: a.pos };
  }
  return a;
}

const NONE_RE = /^no\s+(?:real\s+)?solution\.?$/i;

export function parseStep(input) {
  if (typeof input !== 'string') throw new ParseError('type a step first', 0);
  if (input.length > PARSE_LIMITS.characters) throw new ParseError('a step may contain at most 2048 characters', PARSE_LIMITS.characters);
  const s = input.trim();
  if (!s) throw new ParseError('type a step first', 0);
  if (NONE_RE.test(s)) return { kind: 'none' };

  const toks = tokenize(s);
  const p = new Parser(toks, s);
  const first = parseEqOrExpr(p);

  const t = p.peek();
  if (t && t.tt === 'or') {
    if (first.t !== 'eq') {
      throw new ParseError('or needs a complete equation on each side, like x = 1 or x = -1', t.pos);
    }
    const branches = [first];
    while (p.peek() && p.peek().tt === 'or') {
      p.next();
      const b = parseEqOrExpr(p);
      if (b.t !== 'eq') {
        const bt = p.peek();
        throw new ParseError('or needs a complete equation on each side, like x = 1 or x = -1', bt ? bt.pos : b.pos);
      }
      branches.push(b);
    }
    const end = p.peek();
    if (end) {
      throw new ParseError('unexpected "' + end.text + '" at position ' + (end.pos + 1) + '; check for a missing operator', end.pos);
    }
    return { kind: 'or', branches };
  }
  if (t) {
    if (t.tt === 'op' && t.v === '=') {
      throw new ParseError('use a single = sign in an equation', t.pos);
    }
    if (t.tt === 'rparen') {
      throw new ParseError('unexpected ")" at position ' + (t.pos + 1) + '; there is no matching opening parenthesis', t.pos);
    }
    throw new ParseError('unexpected "' + t.text + '" at position ' + (t.pos + 1) + '; check for a missing operator', t.pos);
  }
  return first.t === 'eq' ? { kind: 'eq', ast: first } : { kind: 'expr', ast: first };
}

// ---------------------------------------------------------------------------
// Plain text printing of ASTs (used inside engine messages)
// ---------------------------------------------------------------------------

function precOf(node) {
  switch (node.t) {
    case 'chain': return 1;
    case 'mul': case 'div': return 2;
    case 'neg': return 3;
    case 'pow': return 4;
    default: return 5;
  }
}

function child(node, min) {
  const s = astToPlain(node);
  return precOf(node) < min ? '(' + s + ')' : s;
}

export function astToPlain(node) {
  switch (node.t) {
    case 'num': return node.v.toString();
    case 'var': return node.name;
    case 'chain': {
      let out = child(node.head, 1);
      for (const r of node.rest) out += (r.op === '+' ? ' + ' : ' - ') + child(r.node, 2);
      return out;
    }
    case 'add': return node.args.map((a) => child(a, 2)).join(' + ');
    case 'sub': return child(node.a, 1) + ' - ' + child(node.b, 2);
    case 'neg': return '-' + child(node.a, 3);
    case 'mul': {
      return node.args
        .map((a) => child(a, 2))
        .reduce((acc, part, idx) => {
          if (idx === 0) return part;
          const joiner = /^[a-z(]/i.test(part) ? '' : '*';
          return acc + joiner + part;
        }, '');
    }
    case 'div': return child(node.a, 2) + '/' + child(node.b, 3);
    case 'pow': return child(node.a, 5) + '^' + (node.e.isNeg() ? '(' + node.e.toString() + ')' : node.e.toString());
    case 'sqrt': return 'sqrt(' + astToPlain(node.a) + ')';
    case 'abs': return '|' + astToPlain(node.a) + '|';
    case 'eq': return child(node.a, 1) + ' = ' + child(node.b, 1);
    default: return '?';
  }
}

export { Rat, EngineError };
