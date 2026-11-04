// StepCheck renderer: turns parsed ASTs into CSS typeset mathematics.
// No external math renderer: fractions are stacked spans, square roots get a
// drawn vinculum through a border, and display numerals come from the serif
// stack. All output is generated from parsed tokens, so it is safe to inject.

import { Rat } from './algebra.js';
import { parseStep } from './parse.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function precOf(node) {
  switch (node.t) {
    case 'chain': case 'add': case 'sub': return 1;
    case 'mul': case 'div': return 2;
    case 'neg': return 3;
    case 'pow': return 4;
    default: return 5;
  }
}

function wrap(html, prec, min) {
  return prec < min ? '<span class="mparen">(</span>' + html + '<span class="mparen">)</span>' : html;
}

const MINUS = '\u2212';

function ratHtml(r) {
  const sign = r.isNeg() ? MINUS : '';
  const mag = r.isNeg() ? r.neg() : r;
  if (mag.d === 1n) return sign + mag.n.toString();
  return '<span class="mfrac" role="math" aria-label="' + r.toString() + '">'
    + '<span class="mnum">' + sign + mag.n.toString() + '</span>'
    + '<span class="mden">' + mag.d.toString() + '</span></span>';
}

function startsSymbolic(html) {
  // True when a rendered factor begins with something a coefficient can sit
  // directly against: a variable, a group, a fraction, a root, or bars.
  return /^(&lt;|<i class="mv|<span class="(mfrac|msqrt|mabs)|\()/.test(html);
}

function mulJoin(parts) {
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1];
    const cur = parts[i];
    const bothNumeric = /^\d/.test(strip(prev)) && /^\d/.test(strip(cur));
    const joiner = bothNumeric
      ? '<span class="mdot" aria-hidden="true"> \u00b7 </span>'
      : (startsSymbolic(cur) ? '<span class="mjoin" aria-hidden="true"> </span>'
                             : '<span class="mdot" aria-hidden="true"> \u00b7 </span>');
    out += joiner + cur;
  }
  return out;
}

function strip(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

export function astToMath(node) {
  switch (node.t) {
    case 'num': return ratHtml(node.v);
    case 'var': return '<i class="mv">' + escapeHtml(node.name) + '</i>';
    case 'chain': {
      let out = wrap(astToMath(node.head), precOf(node.head), 1);
      for (const r of node.rest) {
        out += '<span class="mop" aria-hidden="true">' + (r.op === '+' ? '+' : MINUS) + '</span>'
          + wrap(astToMath(r.node), precOf(r.node), 2);
      }
      return out;
    }
    case 'add': {
      return node.args
        .map((a, i) => (i === 0 ? wrap(astToMath(a), precOf(a), 1)
                               : '<span class="mop" aria-hidden="true">+</span>' + wrap(astToMath(a), precOf(a), 2)))
        .join('');
    }
    case 'sub': {
      return wrap(astToMath(node.a), precOf(node.a), 1)
        + '<span class="mop" aria-hidden="true">' + MINUS + '</span>'
        + wrap(astToMath(node.b), precOf(node.b), 2);
    }
    case 'neg': {
      return MINUS + wrap(astToMath(node.a), precOf(node.a), 3);
    }
    case 'mul': {
      const parts = node.args.map((a) => wrap(astToMath(a), precOf(a), 2));
      return mulJoin(parts);
    }
    case 'div': {
      return '<span class="mfrac" role="math">'
        + '<span class="mnum">' + astToMath(node.a) + '</span>'
        + '<span class="mden">' + astToMath(node.b) + '</span></span>';
    }
    case 'pow': {
      const base = wrap(astToMath(node.a), precOf(node.a), 5);
      const exp = ratHtml(node.e);
      return base + '<sup class="mexp">' + exp + '</sup>';
    }
    case 'sqrt': {
      return '<span class="msqrt"><span class="msign" aria-hidden="true">\u221a</span><span class="mbody">' + astToMath(node.a) + '</span></span>';
    }
    case 'abs': {
      return '<span class="mabs">' + astToMath(node.a) + '</span>';
    }
    case 'eq': {
      return astToMath(node.a)
        + '<span class="meq" aria-hidden="true">=</span>'
        + astToMath(node.b);
    }
    default: return '<span class="merr">?</span>';
  }
}

export function stepToMath(step) {
  if (!step) return '';
  if (step.kind === 'none') return '<span class="mnone">no solution</span>';
  if (step.kind === 'or') {
    return step.branches
      .map((b) => astToMath(b))
      .join('<span class="mor">or</span>');
  }
  return astToMath(step.ast);
}

export function parseAndRender(raw) {
  // Convenience for static content: parse a string and render it.
  // Returns {html} or {error}.
  try {
    const step = parseStep(raw);
    return { html: stepToMath(step) };
  } catch (err) {
    return { error: err.message };
  }
}
