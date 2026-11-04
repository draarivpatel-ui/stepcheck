// Domain restrictions remain attached after algebra cancels their syntax.
// These are exact predicates, not proof by sampled numeric points.
import { canon, valEqual } from './algebra.js';
import { parseStep, astToPlain } from './parse.js';

export function condition(kind, node) {
  return { kind, value: canon(node), expression: astToPlain(node) };
}

export function sameCondition(a, b) {
  return a.kind === b.kind && valEqual(a.value, b.value);
}

export function mergeConditions(...groups) {
  const result = [];
  for (const item of groups.flat()) {
    if (!result.some((existing) => sameCondition(existing, item))) result.push(item);
  }
  return result;
}

export function domainFor(parsed) {
  const result = [];
  function add(kind, node) {
    const predicate = condition(kind, node);
    const constant = predicate.value.constRat();
    if (constant !== null) return; // invalid constant domains already fail canonicalization
    result.push(predicate);
  }
  function visit(node) {
    if (!node) return;
    if (node.t === 'div') add('nonzero', node.b);
    if (node.t === 'pow' && node.e.n <= 0n) add('nonzero', node.a);
    if (node.t === 'sqrt') add('nonnegative', node.a);
    if (node.t === 'chain') { visit(node.head); node.rest.forEach((part) => visit(part.node)); }
    if (node.args) node.args.forEach(visit);
    if (node.a) visit(node.a);
    if (node.b) visit(node.b);
  }
  if (parsed.kind === 'or') parsed.branches.forEach(visit);
  else visit(parsed.ast);
  return mergeConditions(result);
}

export function assumptionsFor(options = {}) {
  const result = [];
  for (const kind of ['nonzero', 'nonnegative']) {
    const values = options[kind] ?? [];
    if (!Array.isArray(values) || values.length > 32) throw new TypeError('Assumptions must be short arrays of expressions');
    for (const expression of values) {
      const parsed = parseStep(expression);
      if (parsed.kind !== 'expr') throw new TypeError('An assumption must name an expression, not an equation');
      const predicate = condition(kind, parsed.ast);
      const constant = predicate.value.constRat();
      if (constant !== null && (kind === 'nonzero' ? constant.isZero() : constant.isNeg())) throw new TypeError('A declared domain assumption cannot be a false constant');
      result.push(predicate);
    }
  }
  return mergeConditions(result);
}

export function knownCondition(predicate, known) {
  const constant = predicate.value.constRat();
  if (constant !== null) return predicate.kind === 'nonzero' ? !constant.isZero() : !constant.isNeg();
  if (known.some((item) => sameCondition(item, predicate))) return true;
  if (predicate.kind !== 'nonzero') return false;
  // A monomial such as 2a is nonzero exactly when every variable factor is.
  const rational = predicate.value.asRF();
  if (!rational || rational.num.terms.size !== 1 || rational.den.terms.size !== 1) return false;
  const nonzeroVariables = new Set(known.filter((item) => item.kind === 'nonzero' && /^[A-Za-z]$/.test(item.expression)).map((item) => item.expression));
  return [...rational.num.vars(), ...rational.den.vars()].every((name) => nonzeroVariables.has(name));
}

export function conditionText(predicate) {
  return predicate.expression + (predicate.kind === 'nonzero' ? ' != 0' : ' >= 0');
}
