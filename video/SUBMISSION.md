# StepCheck | United Hacks V8

## Project name
StepCheck

## Elevator pitch
A deterministic algebra proof workbench that checks derivations one step at a time in exact rational arithmetic, citing the licensing rule in the margin or explaining errors with a concrete counterexample.

## Track
Education / Developer & Learning Tools

## Story / Description

### Inspiration
When students solve an equation on paper, most digital homework tools only grade the final box. If a student makes a sign error on line two, squares both sides and introduces an extraneous root, or divides by a variable expression and erases a solution, a final-answer grader cannot tell them *which* step broke or *why*. StepCheck treats beginning and intermediate algebra as a step-by-step formal proof ladder.

### What it does
1. **Step-by-Step Proof Ladder:** You start from a given equation (or any statement of your choice in Free Practice) and write your derivation one line at a time. Each accepted step is typeset onto a manuscript proof ladder with the licensing algebraic property cited in the margin, such as the `Addition Property of Equality`, `Distributive Property`, `Complete the Square`, or `Zero Product Property`.
2. **Exact Symbolic Verification:** Instead of floating-point sampling, StepCheck canonicalizes both sides of every step using exact `BigInt` rationals, multivariate polynomials over the rationals, cross-multiplied rational functions, and a term algebra for square roots and absolute values.
3. **Diagnostic Counterexamples and Trap Detection:** When a move does not hold, StepCheck diagnoses the exact mistake:
   - If a syntax error occurs, it underlines the exact offending character position.
   - If you change only one side of an equation, it reports the exact difference added to each side.
   - If you square both sides, drop the negative root of `x^2 = k`, or drop a branch of an `or` statement, it explains the trap and probes rational test points to give a concrete counterexample showing which root was lost.
4. **Fifteen Graded Challenges Across Three Tiers:** Progresses from two-step linear equations and distribution (`Tier 1`), through fractions, radicals, and two-case absolute values (`Tier 2`), up to factoring quadratics and a full seven-step symbolic derivation of the quadratic formula from `ax^2 + bx + c = 0` (`Tier 3`).
5. **Self-Verifying Rule Book:** All thirteen algebraic rules in the catalog are documented below the workbench with domain notes and worked two-line examples. Every page load runs the live engine against all thirteen worked examples and prints the verification verdict directly on each card.

### How it was built
- **Recursive Descent Parser (`js/parse.js`):** Hand-written tokenizer and parser supporting equations, bare simplification expressions, implicit multiplication, exact decimal conversion (`0.5` becomes `1/2`), exponents (`^` and Unicode superscripts), radicals (`sqrt(...)` and `√`), absolute value bars (`|...|`), compound `or` branches, and `no solution`.
- **Canonical Algebra & Rule Catalog (`js/algebra.js`, `js/rules.js`):** Exact `BigInt` rational arithmetic and multivariate polynomial division power thirteen priority-ordered rule verifiers and rational counterexample search.
- **Manuscript Workbench UI (`index.html`, `css/`, `js/render.js`, `js/app.js`):** Pure CSS math typesetting (stacked fractions, drawn radical vinculums, absolute value bars) on warm ivory paper with tabular numerals and zero external fonts or libraries. Backed by 98 automated test suites via `node:test`.

### Honest scope and limits
StepCheck is deliberately conservative: two expressions are accepted as equal only when exact polynomial and rational canonicalization proves it. Mixed products of radicals and absolute values or nested radicals outside the catalog are rejected with clear messages rather than approximated. Everything runs locally in browser memory with no network calls and no accounts.

## Built with
- HTML5
- CSS3 (custom CSS math typesetting, design tokens, tabular-nums)
- Vanilla JavaScript (ES Modules, BigInt rational & polynomial computer algebra)
- Node.js built-in test runner (`node:test`)

## Try it out
- Live Demo: https://aariv.me/stepcheck/
- GitHub Repository: https://github.com/draarivpatel-ui/stepcheck
