// StepCheck rule book: one entry per engine rule with a worked example.
// Every example is verified by the real engine on page load, and the tests
// assert that verification too, so the book can never drift from the engine.

export const BOOK = [
  {
    ruleId: 'add',
    worked: { prev: 'x + 7 = 12', cur: 'x = 5' },
    say: 'Subtract 7 from both sides and the solution set never changes.'
  },
  {
    ruleId: 'mul',
    worked: { prev: '3x = 15', cur: 'x = 5' },
    say: 'Divide both sides by 3. Dividing is multiplying by 1/3, and the multiplier must never be zero.'
  },
  {
    ruleId: 'symmetry',
    worked: { prev: '5 = x + 2', cur: 'x + 2 = 5' },
    say: 'Read the equation in whichever order reads best; equality does not mind.'
  },
  {
    ruleId: 'evaluate',
    worked: { prev: 'x = 2 + 3', cur: 'x = 5' },
    say: 'Plain arithmetic may be carried out inside any step. Square roots of negatives are rejected; sqrt(2) is kept exact.'
  },
  {
    ruleId: 'combine',
    worked: { prev: '5x + 2x = 14', cur: '7x = 14' },
    say: 'Terms with the same variable part merge. The engine checks the merge by expanding both sides.'
  },
  {
    ruleId: 'distribute',
    worked: { prev: '2(x + 5) = 16', cur: '2x + 10 = 16' },
    say: 'The factor 2 multiplies both terms of the sum. Expanding a squared binomial counts here too.'
  },
  {
    ruleId: 'factor',
    worked: { prev: 'x^2 + 7x + 12 = 0', cur: '(x + 3)(x + 4) = 0' },
    say: 'You find the factors; the engine verifies them by expanding and comparing exactly.'
  },
  {
    ruleId: 'complete-square',
    worked: { prev: 'x^2 + 6x + 9 = 4', cur: '(x + 3)^2 = 4' },
    say: 'A perfect square trinomial collapses into a squared binomial, verified by re-expanding.'
  },
  {
    ruleId: 'power',
    worked: { prev: '(2x)^2 = 36', cur: '4x^2 = 36' },
    say: 'The exponent reaches into the product: (2x)^2 is 4x^2. Powers of powers multiply their exponents.'
  },
  {
    ruleId: 'root',
    worked: { prev: 'x^2 = 81', cur: 'x = 9 or x = -9' },
    say: 'A square has two roots, and both must be written. Writing |x| = 9 says the same thing. A single root is rejected; a negative other side gives no solution.'
  },
  {
    ruleId: 'abs',
    worked: { prev: '|x - 2| = 7', cur: 'x - 2 = 7 or x - 2 = -7' },
    say: 'The inside is 7 or -7, and both cases must be kept. An absolute value never equals a negative number, so that case ends in no solution.'
  },
  {
    ruleId: 'zero-product',
    worked: { prev: '(x - 1)(x + 5) = 0', cur: 'x - 1 = 0 or x + 5 = 0' },
    say: 'A product is zero only when a factor is zero. Constant factors are dropped: 2(x - 3) = 0 needs only x - 3 = 0.'
  },
  {
    ruleId: 'quad-form',
    worked: { prev: 'x^2 - 5x + 6 = 0', cur: 'x = (5 + sqrt(25 - 24))/2 or x = (5 - sqrt(25 - 24))/2' },
    say: 'Substitute a = 1, b = -5, c = 6 and keep both roots. A negative discriminant means write no solution.'
  }
];
