import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareStep, checkStep, sameStep, RULES, RULE_BY_ID } from '../js/rules.js';
import { CHALLENGES, TIERS } from '../js/challenges.js';
import { BOOK } from '../js/book.js';
import { stepToMath } from '../js/render.js';
import { parseStep } from '../js/parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(repoRoot, 'css/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(repoRoot, 'js/app.js'), 'utf8');
const notesMd = fs.readFileSync(path.join(repoRoot, 'NOTES.md'), 'utf8');
const readmeMd = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

test('DOM Smoke 01: index.html starts with HTML5 doctype and lang=en', () => {
  assert.match(indexHtml.trimStart(), /^<!DOCTYPE html>/i);
  assert.match(indexHtml, /<html\s+lang="en">/i);
});

test('DOM Smoke 02: index.html contains UTF-8 charset and responsive viewport meta tags', () => {
  assert.match(indexHtml, /<meta\s+charset="UTF-8">/i);
  assert.match(indexHtml, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0">/i);
});

test('DOM Smoke 03: index.html contains non-empty title, author, meta description, and OpenGraph tags', () => {
  assert.match(indexHtml, /<title>StepCheck:\s*a proof checker for algebra<\/title>/);
  assert.match(indexHtml, /<meta\s+name="description"\s+content="[^"]{40,}">/);
  assert.match(indexHtml, /<meta\s+name="author"\s+content="Aariv Patel">/);
  assert.match(indexHtml, /property="og:title"\s+content="[^"]+"/);
  assert.match(indexHtml, /property="og:description"\s+content="[^"]+"/);
});

test('DOM Smoke 04: inline SVG favicon exists in <head>', () => {
  assert.match(indexHtml, /<link\s+rel="icon"\s+href="data:image\/svg\+xml,/);
});

test('DOM Smoke 05: index.html contains exactly one <h1> element and valid heading hierarchy', () => {
  const h1Matches = indexHtml.match(/<h1\b[^>]*>/gi) || [];
  assert.equal(h1Matches.length, 1);
  const levels = [...indexHtml.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1);
  for (let i = 1; i < levels.length; i += 1) {
    assert.ok(
      levels[i] <= levels[i - 1] + 1,
      `Heading level jumped from h${levels[i - 1]} to h${levels[i]}`
    );
  }
});

test('DOM Smoke 06: all id attributes in index.html are unique', () => {
  const ids = [...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 21);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, 'Duplicate IDs found in index.html');
});

test('DOM Smoke 07: accessible skip-link, noscript banner, and semantic landmarks exist', () => {
  assert.match(indexHtml, /<a\s+class="skip-link"\s+href="#step-input">/);
  assert.match(indexHtml, /<noscript>[\s\S]*?<\/noscript>/);
  assert.match(indexHtml, /<header\s+class="masthead">/);
  assert.match(indexHtml, /<nav\s+class="challenge-rail"\s+aria-label="Challenges">/);
  assert.match(indexHtml, /<main>/);
  assert.match(indexHtml, /<footer\s+class="colophon">/);
});

test('DOM Smoke 08: every aria-labelledby, aria-describedby, aria-controls, and label[for] resolves to an existing ID', () => {
  const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
    const refs = [...indexHtml.matchAll(new RegExp(`\\b${attr}="([^"]+)"`, 'g'))].map((m) => m[1]);
    assert.ok(refs.length >= 1, `Expected at least one ${attr}`);
    for (const raw of refs) {
      for (const ref of raw.trim().split(/\s+/)) {
        assert.ok(htmlIds.has(ref), `${attr} target #${ref} is missing in index.html`);
      }
    }
  }
  const forIds = [...indexHtml.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(forIds.length >= 1);
  for (const id of forIds) {
    assert.ok(htmlIds.has(id), `label[for="${id}"] has no matching control ID`);
  }
});

test('DOM Smoke 09: all DOM IDs looked up via getElementById in js/app.js exist in index.html', () => {
  const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const boundIds = [...appJs.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  assert.equal(boundIds.length, 17);
  for (const id of boundIds) {
    assert.ok(htmlIds.has(id), `ID #${id} looked up in js/app.js is missing from index.html`);
  }
});

test('DOM Smoke 10: css/style.css enforces overflow-x: clip, focus-visible outline, tabular-nums, and reduced-motion guard', () => {
  assert.match(styleCss, /overflow-x:\s*clip/);
  assert.match(styleCss, /:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(styleCss, /tabular-nums/);
  assert.match(styleCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('DOM Smoke 11: zero em-dashes, en-dashes, or emoji across index.html, css/style.css, js/app.js, README.md, and NOTES.md', () => {
  assert.equal(/[\u2013\u2014]/.test(indexHtml), false);
  assert.equal(/[\u2013\u2014]/.test(styleCss), false);
  assert.equal(/[\u2013\u2014]/.test(appJs), false);
  assert.equal(/[\u2013\u2014]/.test(notesMd), false);
  assert.equal(/[\u2013\u2014]/.test(readmeMd), false);
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(indexHtml), false);
  assert.equal(emojiRegex.test(styleCss), false);
  assert.equal(emojiRegex.test(appJs), false);
});

test('DOM Smoke 12: UI math renderer and proof engine execute cleanly across all challenges and rule book entries', () => {
  assert.equal(TIERS.length, 3);
  assert.equal(CHALLENGES.length, 15);
  assert.equal(RULES.length, 14);
  assert.equal(BOOK.length, 14);

  for (const c of CHALLENGES) {
    const givenStep = prepareStep(c.given);
    const targetStep = prepareStep(c.target);
    assert.notEqual(givenStep.kind, 'error');
    assert.notEqual(targetStep.kind, 'error');
    const htmlGiven = stepToMath(parseStep(c.given));
    const htmlTarget = stepToMath(parseStep(c.target));
    assert.ok(htmlGiven.length > 0);
    assert.ok(htmlTarget.length > 0);
  }

  for (const entry of BOOK) {
    assert.ok(RULE_BY_ID[entry.ruleId]);
    const prev = prepareStep(entry.worked.prev);
    const cur = prepareStep(entry.worked.cur);
    const verdict = checkStep(prev, cur);
    assert.equal(verdict.ok, true);
    assert.ok(stepToMath(prev).length > 0);
    assert.ok(stepToMath(cur).length > 0);
  }

  const s1 = prepareStep('2x + 3 = 11');
  const s2 = prepareStep('2x = 8');
  const s3 = prepareStep('x = 4');
  assert.equal(checkStep(s1, s2).ok, true);
  assert.equal(checkStep(s2, s3).ok, true);
  assert.equal(sameStep(s3, prepareStep('x = 4')), true);
});
