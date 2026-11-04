// StepCheck challenge set: fifteen graded proof challenges, each with a given
// equation, a target, a hint, and an intended solution path the engine itself
// verifies (see tests/challenges.test.js).

export const TIERS = [
  { id: 'foundations', name: 'Foundations', range: 'Challenges 1 to 5' },
  { id: 'structure', name: 'Structure', range: 'Challenges 6 to 10' },
  { id: 'quadratics', name: 'Quadratics', range: 'Challenges 11 to 15' }
];

export const CHALLENGES = [
  {
    id: 'c01',
    tier: 'foundations',
    title: 'A two step equation',
    given: '2x + 3 = 11',
    target: 'x = 4',
    hint: 'Subtract 3 from both sides first, then divide by 2.',
    path: ['2x = 8', 'x = 4']
  },
  {
    id: 'c02',
    tier: 'foundations',
    title: 'Variables on both sides',
    given: '5x - 4 = 3x + 8',
    target: 'x = 6',
    hint: 'Collect the x terms on one side with a single subtraction of 3x.',
    path: ['2x - 4 = 8', '2x = 12', 'x = 6']
  },
  {
    id: 'c03',
    tier: 'foundations',
    title: 'Combine like terms first',
    given: '7x - 2x + 5 = 20',
    target: 'x = 3',
    hint: 'The left side holds two x terms; merge them before moving anything.',
    path: ['5x + 5 = 20', '5x = 15', 'x = 3']
  },
  {
    id: 'c04',
    tier: 'foundations',
    title: 'Distribution before isolation',
    given: '3(x + 4) = 21',
    target: 'x = 3',
    hint: 'Expand the product with the Distributive Property, then isolate x.',
    path: ['3x + 12 = 21', '3x = 9', 'x = 3']
  },
  {
    id: 'c05',
    tier: 'foundations',
    title: 'A negative coefficient',
    given: '4 - 2x = 10',
    target: 'x = -3',
    hint: 'Move the 4 first; the last division is by -2, and the sign matters.',
    path: ['-2x = 6', 'x = -3']
  },
  {
    id: 'c06',
    tier: 'structure',
    title: 'Simplify an expression',
    given: '2(3x - 1) + 4x',
    target: '10x - 2',
    hint: 'There is no equation here: distribute, then combine like terms. Every step stays an expression.',
    path: ['6x - 2 + 4x', '10x - 2']
  },
  {
    id: 'c07',
    tier: 'structure',
    title: 'Fractions in the equation',
    given: 'x/2 + 3 = 7',
    target: 'x = 8',
    hint: 'Subtract 3, then undo the division by 2 with multiplication.',
    path: ['x/2 = 4', 'x = 8']
  },
  {
    id: 'c08',
    tier: 'structure',
    title: 'Undo a square root',
    given: 'sqrt(2x + 3) = 5',
    target: 'x = 11',
    hint: 'Squaring is safe here: the square-root side is never negative, so no extra solutions can appear.',
    path: ['2x + 3 = 25', '2x = 22', 'x = 11']
  },
  {
    id: 'c09',
    tier: 'structure',
    title: 'Absolute value, two cases',
    given: '|x - 3| = 5',
    target: 'x = 8 or x = -2',
    hint: 'Split into the two cases with or, then solve each case; both branches must move at every step.',
    path: ['x - 3 = 5 or x - 3 = -5', 'x = 8 or x = -2']
  },
  {
    id: 'c10',
    tier: 'structure',
    title: 'When absolute value fails',
    given: '|x + 4| = -2',
    target: 'no solution',
    hint: 'An absolute value is never negative. What can it never equal?',
    path: ['no solution']
  },
  {
    id: 'c11',
    tier: 'quadratics',
    title: 'A square equals a number',
    given: 'x^2 = 49',
    target: 'x = 7 or x = -7',
    hint: 'A square has two roots. Writing only x = 7 drops a solution, and the engine will say so.',
    path: ['x = 7 or x = -7']
  },
  {
    id: 'c12',
    tier: 'quadratics',
    title: 'A squared binomial',
    given: '(x - 2)^2 = 25',
    target: 'x = 7 or x = -3',
    hint: 'Take the square root of both sides: the inside is 5 or -5.',
    path: ['x - 2 = 5 or x - 2 = -5', 'x = 7 or x = -3']
  },
  {
    id: 'c13',
    tier: 'quadratics',
    title: 'Zero product',
    given: '(x - 3)(x + 2) = 0',
    target: 'x = 3 or x = -2',
    hint: 'A product is zero only when a factor is zero. Give each factor its own case.',
    path: ['x - 3 = 0 or x + 2 = 0', 'x = 3 or x = -2']
  },
  {
    id: 'c14',
    tier: 'quadratics',
    title: 'Factor to solve',
    given: 'x^2 + 5x + 6 = 0',
    target: 'x = -2 or x = -3',
    hint: 'Find two numbers that multiply to 6 and add to 5, then factor.',
    path: ['(x + 2)(x + 3) = 0', 'x + 2 = 0 or x + 3 = 0', 'x = -2 or x = -3']
  },
  {
    id: 'c15',
    tier: 'quadratics',
    title: 'Derive the quadratic formula',
    assumptions: { nonzero: ['a'], nonnegative: ['b^2 - 4ac'] },
    given: 'ax^2 + bx + c = 0',
    target: 'x = (-b + sqrt(b^2 - 4ac))/(2a) or x = (-b - sqrt(b^2 - 4ac))/(2a)',
    hint: 'Multiply by 4a, add b^2 to both sides, collapse the perfect square, take both roots, then divide by 2a.',
    path: [
      '4a^2x^2 + 4abx + 4ac = 0',
      '4a^2x^2 + 4abx = -4ac',
      '4a^2x^2 + 4abx + b^2 = b^2 - 4ac',
      '(2ax + b)^2 = b^2 - 4ac',
      '2ax + b = sqrt(b^2 - 4ac) or 2ax + b = -sqrt(b^2 - 4ac)',
      '2ax = -b + sqrt(b^2 - 4ac) or 2ax = -b - sqrt(b^2 - 4ac)',
      'x = (-b + sqrt(b^2 - 4ac))/(2a) or x = (-b - sqrt(b^2 - 4ac))/(2a)'
    ]
  }
];
