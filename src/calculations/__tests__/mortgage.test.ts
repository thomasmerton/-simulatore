import { describe, expect, it } from 'vitest';
import {
  buildRatePath,
  calculateDSCR,
  calculateDebtSchedule,
  calculateLoanAmount,
  calculateMortgagePayment,
} from '../mortgage';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { FinancingAssumptions } from '@/domain/types';

const financing = (over: Partial<FinancingAssumptions> = {}): FinancingAssumptions => ({
  ...emptyPropertyInputs().financing,
  enabled: true,
  ltv: 0.7,
  annualRate: 0.03,
  termYears: 25,
  ...over,
});

describe('calculateLoanAmount', () => {
  it('applies LTV to the purchase price', () => {
    expect(calculateLoanAmount(financing(), 200_000)).toBeCloseTo(140_000, 10);
  });

  it('lets an explicit loan amount override LTV', () => {
    expect(calculateLoanAmount(financing({ loanAmount: 100_000 }), 200_000)).toBe(100_000);
  });

  it('returns null when financing is disabled', () => {
    expect(calculateLoanAmount(financing({ enabled: false }), 200_000)).toBeNull();
  });

  it('returns null when the price is unknown', () => {
    expect(calculateLoanAmount(financing(), null)).toBeNull();
  });
});

describe('calculateMortgagePayment', () => {
  it('matches a textbook level instalment', () => {
    // 140,000 at 3% over 25 years. i = 0.0025, n = 300.
    // PMT = 140000 * 0.0025 / (1 - 1.0025^-300) = 663.895839...
    const i = 0.03 / 12;
    const closedForm = (140_000 * i) / (1 - Math.pow(1 + i, -300));
    expect(calculateMortgagePayment(140_000, 0.03, 25)).toBeCloseTo(closedForm, 8);
    expect(calculateMortgagePayment(140_000, 0.03, 25)).toBeCloseTo(663.8958, 4);
  });
});

describe('calculateDebtSchedule', () => {
  const schedule = calculateDebtSchedule({
    loanAmount: 140_000,
    termYears: 25,
    ratePath: Array(25).fill(0.03),
  });

  it('produces one row per year', () => {
    expect(schedule).toHaveLength(25);
  });

  it('fully repays the loan by the final year', () => {
    expect(schedule[24]?.closingBalance).toBeCloseTo(0, 6);
  });

  it('repays exactly the principal borrowed across the term', () => {
    const totalPrincipal = schedule.reduce((a, y) => a + y.principalPaid, 0);
    expect(totalPrincipal).toBeCloseTo(140_000, 4);
  });

  it('shifts the interest/principal mix over time', () => {
    const first = schedule[0]!;
    const last = schedule[24]!;
    expect(first.interestPaid).toBeGreaterThan(first.principalPaid);
    expect(last.principalPaid).toBeGreaterThan(last.interestPaid);
  });

  it('charges interest monthly, so annual interest exceeds a naive balance*rate', () => {
    const first = schedule[0]!;
    // Monthly compounding on a declining balance sits just below the naive
    // opening-balance figure, but must be strictly positive and close to it.
    expect(first.interestPaid).toBeGreaterThan(0);
    expect(first.interestPaid).toBeLessThan(140_000 * 0.03);
    // Cross-checked against the closed-form remaining balance after 12 months:
    //   B12  = P(1+i)^12 - PMT*((1+i)^12 - 1)/i = 136,181.0231
    //   int  = 12*PMT - (P - B12)               =   4,147.7731
    const i = 0.03 / 12;
    const pmt = (140_000 * i) / (1 - Math.pow(1 + i, -300));
    const b12 = 140_000 * Math.pow(1 + i, 12) - (pmt * (Math.pow(1 + i, 12) - 1)) / i;
    expect(first.closingBalance).toBeCloseTo(b12, 4);
    expect(first.interestPaid).toBeCloseTo(12 * pmt - (140_000 - b12), 4);
    expect(first.interestPaid).toBeCloseTo(4_147.7731, 3);
  });

  it('chains opening and closing balances consistently', () => {
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]!.openingBalance).toBeCloseTo(schedule[i - 1]!.closingBalance, 6);
    }
  });

  it('is empty for a zero loan', () => {
    expect(calculateDebtSchedule({ loanAmount: 0, termYears: 25, ratePath: [0.03] })).toEqual([]);
  });

  it('re-prices the instalment when the rate path changes', () => {
    const path = [...Array(5).fill(0.03), ...Array(20).fill(0.06)];
    const variable = calculateDebtSchedule({ loanAmount: 140_000, termYears: 25, ratePath: path });
    // Re-pricing at an unchanged rate reproduces the original instalment.
    expect(variable[4]!.monthlyPayment).toBeCloseTo(663.8958, 4);
    expect(variable[5]!.monthlyPayment).toBeGreaterThan(variable[4]!.monthlyPayment);
    // Still fully amortising after the reset.
    expect(variable[24]!.closingBalance).toBeCloseTo(0, 6);
  });
});

describe('buildRatePath', () => {
  it('shocks a variable-rate loan', () => {
    const path = buildRatePath(financing({ rateType: 'VARIABLE' }), 5, 0.02);
    expect(path).toEqual([0.05, 0.05, 0.05, 0.05, 0.05]);
  });

  it('leaves a fixed-rate loan untouched by a rate shock', () => {
    const path = buildRatePath(financing({ rateType: 'FIXED' }), 5, 0.02);
    expect(path).toEqual([0.03, 0.03, 0.03, 0.03, 0.03]);
  });

  it('applies the shock only from the given year', () => {
    const path = buildRatePath(financing({ rateType: 'VARIABLE' }), 4, 0.02, 3);
    expect(path).toEqual([0.03, 0.03, 0.05, 0.05]);
  });

  it('never produces a negative rate', () => {
    const path = buildRatePath(financing({ rateType: 'VARIABLE', annualRate: 0.01 }), 2, -0.05);
    expect(path).toEqual([0, 0]);
  });
});

describe('calculateDSCR', () => {
  it('is NOI over debt service', () => {
    expect(calculateDSCR(10_000, 8_000)).toBeCloseTo(1.25, 10);
  });

  it('is undefined, not infinite, without debt', () => {
    expect(calculateDSCR(10_000, 0)).toBeNull();
    expect(calculateDSCR(10_000, null)).toBeNull();
  });
});
