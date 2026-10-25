# StepCheck: build notes

Author: Aariv Patel. Built as a pre-build entry for United Hacks V8 (window Jan 8 to 10, 2027). Nothing here is pushed or published; the repository stays local until the competition window opens, per the zero pre-competition code rule.

## What was built

StepCheck is a mathematical proof evaluation engine for beginning algebra, delivered as a static single page app. The learner writes a proof one step at a time; the engine parses each step, decides whether it follows from the previous step under a catalog of thirteen rules, and names the licensing rule with a plain language note, or rejects the step with a precise reason and, where possible, a numeric counterexample.

Five components, all in this directory:

1. **Step Parser** (`js/parse.js`). Hand written tokenizer plus recursive descent parser for the statement subset: linear and quadratic equations, bare simplification expressions, square roots (sqrt( ) and the radical sign), absolute value bars, powers via ^ or superscripts, decimals kept as exact rationals, implicit multiplication (2x, 3(x + 4), (x + 1)(x + 2)), compound or steps (x = 7 or x = -7), and the no solution keyword. Every parse failure carries a message naming the offending character and position, and the interface underlines the exact spot.

2. **Equivalence Engine** (`js/algebra.js`, `js/rules.js`). Each side of every step is canonicalized in exact arithmetic: BigInt rationals, multivariate polynomials over the rationals, rational functions compared by cross multiplication, and a term algebra for square root and absolute value units. Thirteen rules are checked in priority order: Addition Property, Multiplication Property (including division and expression multipliers with domain notes), Symmetry of Equality, Evaluate Arithmetic, Combine Like Terms, Distributive Property, Factoring, Complete the Square, Power Rule, Square Root Rule (both roots required; the |x| form accepted; negatives rejected), Absolute Value Rule (both cases; negative right side gives no solution), Zero Product Property, and the Quadratic Formula. Or steps are solved elementwise, and every branch must advance at each step. Known traps get dedicated messages: squaring both sides is rejected with the extraneous solution warning, a single root of x^2 = 9 is rejected with a request to write both, and dividing by a variable expression against a zero side is refused because it can erase solutions. Failure diagnostics probe the equations at fixed rational points and report exactly which solution was lost.

3. **Proof Ladder UI** (`js/app.js`, `index.html`, `css/style.css`, `css/tokens.css`). A manuscript styled workbench: warm ivory paper, deep ink, one margin red like a teacher's pen, serif display numerals, a red margin rule down the ladder, ruled baselines, and rule citations set in the margin at a slight handwritten angle. Steps are typeset with CSS only (stacked fractions, a drawn vinculum for roots, bar pairs for absolute value); no external math renderer, no fonts, no libraries. Keyboard operable throughout: Enter submits, every control is a real button with visible focus, feedback is an aria-live region, and the layout reflows to a single column on small screens with reduced motion respected.

4. **Challenge Set** (`js/challenges.js`). Fifteen graded challenges in three tiers, from two step equations through distribution, fractions, radicals, and absolute value, up to factored quadratics and a full seven step derivation of the quadratic formula from ax^2 + bx + c = 0. Each challenge carries a given, a target, a hint, and an intended path.

5. **Rule Book** (`js/book.js`). All thirteen rules with a statement, domain notes, and a worked example rendered as a two row mini ladder. Each example is checked by the real engine at page load and the verdict is printed under it, so the book cannot drift from the engine.

## Tests

`node --test tests/`, zero dependencies, no network, CPU light.

- 86 tests, all passing.
- 465 assertions executed per full run (110 assert sites, multiplied by looped challenge coverage).
- Full suite runtime: about 58 ms on this machine, far under the 30 second budget.
- Coverage: parser valid forms across the whole subset and fourteen rejection classes; every rule with positive and negative cases; the both roots requirement (or form, absolute value form, single root rejection, negative right side); canonical algebra identities including radical collapses like sqrt(8) times sqrt(2) = 4 and (sqrt(x))^2 = x; each of the fifteen challenges being solved start to finish by the engine itself on its intended path; and all thirteen rule book examples citing their own rule.

## Honest caveats

- The engine is deliberately conservative. Two expressions are accepted as equal only when the canonical algebra proves it. Products that mix square roots with absolute values, division by a radical, and square roots of expressions that already contain radicals are rejected with explicit messages rather than approximated.
- Ratios of rational functions are not reduced by a GCD (equality uses cross multiplication instead), so a multiplier is recognized as a polynomial only when an exact polynomial division succeeds. This is what allows the derivation to multiply by 4a and divide by 2a while still refusing x^2 + 7x + 12 = 0 turning into 5 = 0.
- Rewrite classification (combine versus rearrange, distribute versus power) is heuristic on the raw syntax once canonical equality is established. A mathematically valid move outside the catalog is rejected with a clear message rather than mislabeled.
- Failure witnesses use a fixed list of rational probe points, so they are deterministic; pathological cases fall back to a generic message.
- The interface was built without opening a browser (a build environment constraint). The wiring was smoke tested end to end against a DOM stub, including challenge selection, step submission, completion, reset, and all thirteen rule book verdicts, and the CSS was written defensively, but no screenshot review happened. A pass in a real browser before the demo is on the pre competition checklist.
- Progress is kept in memory only; a page reload clears completed challenges. This is intentional: no storage, no accounts, nothing leaves the browser.

## Devpost bullets

- A proof checker that names the rule, not just right or wrong: every accepted step cites the exact property that licenses it, with a note about what the move did, in a teacher's voice.
- Exact by construction: BigInt rationals and multivariate polynomials mean the engine never rounds, never approximates, and proves equivalence by expanding both sides symbolically.
- Failure is a lesson: rejected steps come with the precise broken position, the amount by which each side changed, or a concrete counterexample showing which solution was lost.
- Fifteen graded challenges ending in a genuine derivation: the engine verifies a full seven step derivation of the quadratic formula, including completing the square and keeping both roots.
- The Rule Book checks itself: all thirteen worked examples are re-verified by the engine on every page load, so documentation and behavior cannot drift apart.
