import { describe, expect, it } from 'vitest';
import {
  compound,
  divide,
  irr,
  npv,
  payment,
  signChanges,
  sumOptional,
} from '../finance';

describe('npv', () => {
  it('leaves the t=0 flow undiscounted', () => {
    expect(npv(0.1, [100])).toBe(100);
  });

  it('discounts a single future flow by (1+r)^t', () => {
    // 110 at t=1 discounted at 10% is exactly 100.
    expect(npv(0.1, [0, 110])).toBeCloseTo(100, 10);
    // 121 at t=2 discounted at 10% is exactly 100.
    expect(npv(0.1, [0, 0, 121])).toBeCloseTo(100, 10);
  });

  it('at a 0% rate is the plain sum', () => {
    expect(npv(0, [-100, 50, 50, 50])).toBeCloseTo(50, 10);
  });

  it('returns null for a rate at or below -100%', () => {
    expect(npv(-1, [-100, 50])).toBeNull();
    expect(npv(-1.5, [-100, 50])).toBeNull();
  });

  it('returns null on an empty series', () => {
    expect(npv(0.05, [])).toBeNull();
  });
});

describe('irr', () => {
  it('recovers a known rate: -100 then 110 is exactly 10%', () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 8);
  });

  it('recovers a known rate on a multi-period series', () => {
    // 1000 invested returning 1331 after 3 years is exactly 10% compounded.
    expect(irr([-1000, 0, 0, 1331])).toBeCloseTo(0.1, 8);
  });

  it('is the rate at which NPV is zero', () => {
    const flows = [-250_000, 8_000, 8_500, 9_000, 9_500, 320_000];
    const rate = irr(flows);
    expect(rate).not.toBeNull();
    expect(npv(rate as number, flows)).toBeCloseTo(0, 4);
  });

  it('handles a negative IRR', () => {
    // Invest 100, get back 90 after a year: -10%.
    expect(irr([-100, 90])).toBeCloseTo(-0.1, 8);
  });

  it('returns null when the series never changes sign', () => {
    expect(irr([-100, -50, -25])).toBeNull();
    expect(irr([100, 50, 25])).toBeNull();
  });

  it('returns null rather than guessing on a degenerate series', () => {
    expect(irr([100])).toBeNull();
    expect(irr([])).toBeNull();
  });

  it('converges on a flat, low-return series where Newton alone struggles', () => {
    const flows = [-100_000, 1_000, 1_000, 1_000, 1_000, 101_000];
    const rate = irr(flows);
    expect(rate).not.toBeNull();
    expect(rate as number).toBeCloseTo(0.01, 6);
  });
});

describe('signChanges', () => {
  it('counts transitions and ignores zeros', () => {
    expect(signChanges([-1, 1, 1, 1])).toBe(1);
    expect(signChanges([-1, 1, -1, 1])).toBe(3);
    expect(signChanges([-1, 0, 0, 1])).toBe(1);
    expect(signChanges([1, 2, 3])).toBe(0);
  });
});

describe('payment', () => {
  it('matches a hand-computed level instalment', () => {
    // 200,000 at 3% nominal over 25 years, monthly.
    // i = 0.0025, n = 300 -> PMT = 200000*0.0025 / (1 - 1.0025^-300)
    const expected = (200_000 * 0.0025) / (1 - Math.pow(1.0025, -300));
    const result = payment(200_000, 0.0025, 300);
    expect(result).toBeCloseTo(expected, 8);
    expect(result).toBeCloseTo(948.42, 1);
  });

  it('degenerates to principal/periods at a zero rate', () => {
    expect(payment(120_000, 0, 240)).toBe(500);
  });

  it('returns 0 for a zero principal and null for invalid terms', () => {
    expect(payment(0, 0.01, 12)).toBe(0);
    expect(payment(100, 0.01, 0)).toBeNull();
    expect(payment(-100, 0.01, 12)).toBeNull();
  });
});

describe('compound', () => {
  it('compounds a positive rate', () => {
    expect(compound(100, 0.07, 10)).toBeCloseTo(196.715, 3);
  });

  it('handles negative growth', () => {
    expect(compound(100, -0.1, 2)).toBeCloseTo(81, 10);
  });

  it('is the identity at zero years', () => {
    expect(compound(100, 0.07, 0)).toBeCloseTo(100, 10);
  });
});

describe('divide and sums', () => {
  it('returns null instead of Infinity or NaN', () => {
    expect(divide(1, 0)).toBeNull();
    expect(divide(null, 5)).toBeNull();
    expect(divide(5, null)).toBeNull();
    expect(divide(10, 4)).toBe(2.5);
  });

  it('sumOptional treats a missing component as no cost', () => {
    expect(sumOptional([1, 2, 3])).toBe(6);
    expect(sumOptional([1, null, 3, undefined])).toBe(4);
  });
});
