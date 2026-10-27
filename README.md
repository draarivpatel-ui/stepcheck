# StepCheck

StepCheck is a local, deterministic proof checker for beginning algebra delivered as a zero-dependency static web page. You write an algebraic derivation one step at a time; the engine parses each step, canonicalizes both sides in exact rational arithmetic, verifies whether the step follows from the previous line under a catalog of thirteen rules, and either cites the licensing property in the margin or explains the error with a concrete counterexample.

## Features

1. **Step Parser (`js/parse.js`):** Hand-written tokenizer and recursive descent parser supporting linear and quadratic equations, bare simplification expressions, square roots (`sqrt(...)` and radical signs), absolute value bars (`|...|`), integer and `1/2` exponents (`^` and Unicode superscripts), exact decimals, implicit multiplication, compound `or` branches (`x = 7 or x = -7`), and `no solution`. Parse errors underline the exact offending character position.
2. **Exact Symbolic Equivalence Engine (`js/algebra.js`, `js/rules.js`):** Canonicalizes expressions using BigInt rationals, multivariate polynomials over the rationals, cross-multiplied rational functions, and a radical/absolute-value term algebra. Checks thirteen algebraic rules in priority order (`Addition Property`, `Multiplication Property`, `Symmetry of Equality`, `Evaluate Arithmetic`, `Combine Like Terms`, `Distributive Property`, `Factoring`, `Complete the Square`, `Power Rule`, `Square Root Rule`, `Absolute Value Rule`, `Zero Product Property`, and `Quadratic Formula`).
3. **Diagnostic Counterexamples and Trap Detection:** Catches classic algebraic pitfalls with specific explanations, including squaring both sides (extraneous roots), dropping the negative root of `x^2 = k`, dividing by a variable expression that can erase a root, or changing only one side of an equation. When a step loses a root, the engine probes rational test points and names the lost solution.
4. **Fifteen Graded Challenges (`js/challenges.js`):** Organized across three tiers (`Linear & Distribute`, `Fractions, Roots & Bars`, and `Quadratics & Derivation`), culminating in a full seven-step symbolic derivation of the quadratic formula from `ax^2 + bx + c = 0`. Also includes a free-practice mode starting from any statement you enter.
5. **Self-Verifying Rule Book (`js/book.js`):** Every rule in the catalog is documented with domain notes and a two-line worked example that the engine checks live on page load.

## Running Locally

Open `index.html` in a browser or serve the folder over a local static server:

```bash
python3 -m http.server 8080
```

Run the automated test suite with Node's built-in test runner:

```bash
npm test
```

## Honest Scope and Limits

StepCheck is deliberately conservative: two expressions are accepted as equal only when exact polynomial and rational canonicalization proves it. It covers beginning and intermediate single-variable algebra plus symbolic parameters (`a`, `b`, `c`) for the quadratic formula derivation. Everything runs locally in browser memory with no network calls, no external libraries, and no accounts.

## License

MIT License. Copyright (c) 2026 Aariv Patel.
