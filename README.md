# StepCheck

A local exact-arithmetic algebra step checker. Write a derivation one line at a time; the engine parses each step, checks an applicable rule, and explains rejected moves. Fourteen documented rules and fifteen challenges ship in a zero-dependency static application.

## Run

Use Node 22 or newer. Serve the folder over HTTP; opening its module scripts directly through a file URL is not supported.

```sh
python3 -m http.server 8080
npm test
npm run test:coverage
```

Open http://localhost:8080. All computation stays in browser memory. No account, API, analytics or external library is required.

## Exactness and domains

The js/parse.js module parses equations, expressions, roots, absolute values, exact decimals, integer powers, or branches and no solution. The js/algebra.js module uses BigInt rationals and bounded symbolic polynomials. The js/rules.js module checks transformations; js/domain.js retains denominator and radical restrictions even when simplification cancels their syntax.

Variable multiplication or division is not accepted without a supported explicit nonzero assumption. Squaring a negative square-root equation is rejected. Negative integer powers raise the entire reciprocal, not just its first power. The quadratic-formula challenge visibly assumes a != 0 and b^2 - 4ac >= 0; its conclusions are on that real domain, not a claim covering every parameter assignment.

The developer API can supply supported assumptions:

```js
checkPair("x = 1", "x^2 = x", { nonzero: ["x"] });
```

That result is conditional and returns its retained domain. A caller chaining prepared steps must preserve verdict.conditions on the next step, as the application does. Free practice does not silently add assumptions.

## Verification

The offline suite passes 117 tests on Node 24.16.0, including 400 seeded linear cases within a regression test. It checks all challenge paths, all fourteen rule-book entries, negative powers, retained domains, zero-product traps, renderer escaping, parser limits and bounded expansions. Shared headless Chromium tests exercise the actual form, rejection paths, undo and the complete quadratic derivation. See [ENGINEERING.md](ENGINEERING.md).

## Limits and honesty

This is a conservative bounded subset, not a complete computer algebra system or general theorem prover. Maximums are 2,048 input characters, 512 tokens, 32 parenthesis levels, 128 digits per input number, integer exponents from -16 through 16, polynomial degree 256, 512 symbolic terms and 100,000 products per multiplication. Exact rationals have a 4,096-digit component limit. Unsupported steps may be rejected even when valid.

Numeric counterexamples are deterministic diagnostic probes. Finding one disproves a candidate; not finding one never proves it. Domain conditions are required for accepted rewrites, and inherited restrictions remain visible. Repeated roots and duplicate or branches are not generally collapsed by the current interface.

This is AI-assisted software. Automated checks do not establish human authorship, classroom outcomes, contest eligibility, deployment or rewards. The project predates any newly selected build window and must be disclosed as pre-existing where required.

MIT license. Copyright (c) 2026 Aariv Patel.
