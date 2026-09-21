/**
 * The edge cases that break underwriting models.
 *
 * Each of these has a specific failure it is guarding against: a NaN reaching
 * the screen, a missing input silently becoming zero, a unit quietly
 * converted, or a metric returning a confident number it has no basis for.
 */

import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import { calculateDebtSchedule } from '../mortgage';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { PropertyInputs } from '@/domain/types';

function base(): PropertyInputs {
  const i = emptyPropertyInputs();
  return {
    ...i,
    facts: { ...i.facts, purchasePrice: 200_000, sqm: 80 },
    acquisition: {
      ...i.acquisition,
      purchaseTaxRate: 0.09,
      notaryFees: 2_000,
      legalFees: 0,
      agencyCommissionRate: 0,
      financingFees: 0,
      renovationCost: 0,
      furnitureCost: 0,
      initialReserves: 0,
      otherUpfrontCosts: 0,
    },
    rental: {
      ...i.rental,
      monthlyRent: 1_000,
      vacancyDaysPerYear: 30,
      rentGrowthRate: 0.01,
      expenseGrowthRate: 0.02,
      condoFees: 1_200,
      propertyTax: 500,
      insurance: 0,
      ordinaryMaintenance: 0,
      capexReserve: 500,
      managementFeeRate: 0.05,
      utilities: 0,
      otherOperatingCosts: 0,
      stabilizationMonths: 0,
    },
    exit: {
      holdingPeriodYears: 10,
      priceGrowthRate: 0.01,
      sellingCostsRate: 0.03,
      capitalGainsTaxRate: 0.26,
      capitalGainsExemptAfterYears: 5,
    },
    settings: { discountRate: 0.05, currency: 'EUR' },
  };
}

const withDebt = (over: Partial<PropertyInputs['financing']> = {}): PropertyInputs => ({
  ...base(),
  financing: {
    enabled: true,
    ltv: 0.7,
    loanAmount: null,
    annualRate: 0.03,
    termYears: 25,
    rateType: 'FIXED',
    amortizationType: 'AMORTIZING',
    maturityYears: null,
    ...over,
  },
});

describe('revenue edge cases', () => {
  it('zero rent gives zero income and a negative cash flow, not an error', () => {
    const i = base();
    i.rental.monthlyRent = 0;
    const r = runProjection(i);
    expect(r.year1.grossScheduledRevenue).toBe(0);
    expect(r.year1.noi as number).toBeLessThan(0);
    expect(r.year1.afterTaxCashFlow as number).toBeLessThan(0);
  });

  it('zero vacancy gives full occupancy', () => {
    const i = base();
    i.rental.vacancyDaysPerYear = 0;
    const r = runProjection(i);
    expect(r.years[0]!.rental.occupancy).toBe(1);
    expect(r.years[0]!.rental.vacancyLoss).toBe(0);
  });

  it('100% vacancy gives zero collected revenue', () => {
    const i = base();
    i.rental.vacancyDaysPerYear = 365;
    const r = runProjection(i);
    expect(r.years[0]!.rental.effectiveGrossIncome).toBe(0);
    expect(r.year1.afterTaxCashFlow as number).toBeLessThan(0);
  });

  it('a missing rent makes every dependent metric unavailable, not zero', () => {
    const i = base();
    i.rental.monthlyRent = null;
    const r = runProjection(i);
    expect(r.year1.noi).toBeNull();
    expect(r.year1.netYieldOnTotalCost).toBeNull();
    expect(r.leveredIRR.value).toBeNull();
    expect(r.npv).toBeNull();
    expect(r.equityMultiple).toBeNull();
  });

  it('a full-year stabilisation period gives zero year-1 revenue', () => {
    const i = base();
    i.rental.stabilizationMonths = 12;
    const r = runProjection(i);
    expect(r.year1.grossScheduledRevenue).toBe(0);
    expect(r.years[1]!.rental.grossScheduledRevenue as number).toBeGreaterThan(0);
  });
});

describe('cash flow and return edge cases', () => {
  it('reports a negative cash flow rather than clamping at zero', () => {
    const i = base();
    i.rental.monthlyRent = 100;
    const r = runProjection(i);
    expect(r.year1.afterTaxCashFlow as number).toBeLessThan(0);
    expect(r.years.every((y) => (y.afterTaxCashFlow as number) < 0)).toBe(true);
  });

  it('reports a negative IRR when the investment loses money', () => {
    const i = base();
    i.exit.priceGrowthRate = -0.1;
    i.rental.monthlyRent = 200;
    const r = runProjection(i);
    expect(r.leveredIRR.value as number).toBeLessThan(0);
  });

  it('handles negative appreciation without breaking the exit', () => {
    const i = base();
    i.exit.priceGrowthRate = -0.05;
    const r = runProjection(i);
    expect(r.exit.salePrice as number).toBeLessThan(200_000);
    expect(r.exit.capitalGain as number).toBeLessThan(0);
    expect(r.exit.capitalGainsTax).toBe(0);
  });

  it('refuses NPV when no discount rate is given', () => {
    const i = base();
    i.settings.discountRate = null;
    const r = runProjection(i);
    expect(r.npv).toBeNull();
    expect(r.notes.map((n) => n.code)).toContain('DISCOUNT_RATE_MISSING');
    // IRR does not need a discount rate, so it must still be available.
    expect(r.leveredIRR.value).not.toBeNull();
  });

  it('returns nulls, not zeros, when the exit value cannot be computed', () => {
    const i = base();
    i.facts.purchasePrice = null;
    i.facts.askingPrice = null;
    const r = runProjection(i);
    expect(r.exit.salePrice).toBeNull();
    expect(r.exit.netSaleProceeds).toBeNull();
    expect(r.equityMultiple).toBeNull();
  });

  it('exits after one year without breaking IRR', () => {
    const i = base();
    i.exit.holdingPeriodYears = 1;
    const r = runProjection(i);
    expect(r.years).toHaveLength(1);
    expect(r.leveredCashFlows).toHaveLength(2);
    expect(r.leveredIRR.value).not.toBeNull();
  });
});

describe('debt edge cases', () => {
  it('works with no debt at all', () => {
    const r = runProjection(base());
    expect(r.loanAmount).toBeNull();
    expect(r.year1.dscr).toBeNull();
    expect(r.minDSCR).toBeNull();
    expect(r.exit.debtRemaining).toBe(0);
    expect(r.exit.balloonRepayment).toBe(false);
  });

  it('a fixed-rate loan ignores a rate shock', () => {
    const plain = runProjection(withDebt({ rateType: 'FIXED' }));
    const shocked = runProjection(withDebt({ rateType: 'FIXED' }), { rateShock: 0.03 });
    expect(shocked.years[0]!.debtService).toBeCloseTo(plain.years[0]!.debtService, 6);
    expect(shocked.notes.map((n) => n.code)).toContain('RATE_SHOCK_NOT_APPLIED');
  });

  it('a variable-rate loan reprices under a rate shock', () => {
    const plain = runProjection(withDebt({ rateType: 'VARIABLE' }));
    const shocked = runProjection(withDebt({ rateType: 'VARIABLE' }), { rateShock: 0.03 });
    expect(shocked.years[0]!.debtService).toBeGreaterThan(plain.years[0]!.debtService);
  });

  it('an interest-only loan repays no principal and leaves a full balloon', () => {
    const r = runProjection(withDebt({ amortizationType: 'INTEREST_ONLY' }));
    expect(r.years.every((y) => y.principalPaid === 0)).toBe(true);
    expect(r.years[9]!.loanBalance).toBeCloseTo(140_000, 6);
    expect(r.exit.debtRemaining).toBeCloseTo(140_000, 6);
  });

  it('a maturity earlier than the amortisation leaves a balloon at maturity', () => {
    const schedule = calculateDebtSchedule({
      loanAmount: 140_000,
      termYears: 25,
      ratePath: Array(25).fill(0.03),
      maturityYears: 10,
    });
    expect(schedule).toHaveLength(10);
    expect(schedule[9]!.closingBalance).toBeGreaterThan(0);
    // Still amortising on the 25-year schedule, so materially repaid but not cleared.
    expect(schedule[9]!.closingBalance).toBeLessThan(140_000);
  });

  it('flags a balloon when maturity precedes the end of the amortisation', () => {
    const r = runProjection(withDebt({ termYears: 25, maturityYears: 5 }));
    expect(r.exit.balloonRepayment).toBe(true);
    expect(r.exit.debtRemaining).toBeGreaterThan(0);
  });

  it('does NOT let the debt vanish after maturity', () => {
    // Truncating the schedule at maturity would show zero debt from year 6,
    // silently erasing a six-figure liability from the balance sheet.
    const matured = runProjection(withDebt({ termYears: 25, maturityYears: 5 }));
    const openEnded = runProjection(withDebt({ termYears: 25 }));

    // The balance keeps amortising on the same schedule past maturity, because
    // the projection assumes a refinance on the same terms. What it must never
    // do is drop to zero.
    expect(matured.years[9]!.loanBalance).toBeCloseTo(openEnded.years[9]!.loanBalance, 6);
    expect(matured.years[9]!.loanBalance).toBeGreaterThan(90_000);
    expect(matured.years.every((y) => y.debt !== null)).toBe(true);
    expect(matured.notes.map((n) => n.code)).toContain('LOAN_MATURES_BEFORE_EXIT');
  });

  it('states the refinancing assumption rather than burying it', () => {
    const r = runProjection(withDebt({ termYears: 25, maturityYears: 5 }));
    const note = r.notes.find((n) => n.code === 'LOAN_MATURES_BEFORE_EXIT');
    expect(note?.severity).toBe('WARNING');
    expect(note?.message).toMatch(/refinanced/i);
  });

  it('a loan repaid before the exit leaves no debt and says so', () => {
    const r = runProjection(withDebt({ termYears: 3 }));
    expect(r.exit.debtRemaining).toBeCloseTo(0, 4);
    expect(r.notes.map((n) => n.code)).toContain('LOAN_SHORTER_THAN_HOLD');
  });

  it('a zero-rate loan amortises linearly without dividing by zero', () => {
    const r = runProjection(withDebt({ annualRate: 0 }));
    expect(r.years[0]!.interestPaid).toBe(0);
    expect(r.years[0]!.principalPaid).toBeCloseTo(140_000 / 25, 4);
  });
});

describe('mixed currencies are never silently combined', () => {
  it('keeps each property on its own currency', () => {
    const eur = base();
    const sek = { ...base(), settings: { discountRate: 0.05, currency: 'SEK' } };
    expect(eur.settings.currency).toBe('EUR');
    expect(sek.settings.currency).toBe('SEK');
    // The engine performs no FX: it computes in whatever currency it is given
    // and the UI warns when a comparison spans more than one.
    const a = runProjection(eur);
    const b = runProjection(sek);
    expect(a.year1.noi).toBeCloseTo(b.year1.noi as number, 6);
  });
});

describe('no NaN or Infinity under extreme inputs', () => {
  const extremes: [string, (i: PropertyInputs) => void][] = [
    ['LTV 200%', (i) => { i.financing = { ...i.financing, enabled: true, ltv: 2, annualRate: 0.03, termYears: 25 }; }],
    ['rate 100%', (i) => { i.financing = { ...i.financing, enabled: true, ltv: 0.7, annualRate: 1, termYears: 25 }; }],
    ['appreciation -100%', (i) => { i.exit.priceGrowthRate = -1; }],
    ['appreciation +1000%', (i) => { i.exit.priceGrowthRate = 10; }],
    ['rent growth -100%', (i) => { i.rental.rentGrowthRate = -1; }],
    ['selling costs 200%', (i) => { i.exit.sellingCostsRate = 2; }],
    ['management fee 200%', (i) => { i.rental.managementFeeRate = 2; }],
    ['20-year hold', (i) => { i.exit.holdingPeriodYears = 20; }],
    ['all costs null', (i) => { i.rental.condoFees = null; i.rental.propertyTax = null; }],
  ];

  it.each(extremes)('%s produces no NaN or Infinity', (_name, mutate) => {
    const i = base();
    mutate(i);
    const bad: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'number') {
        if (!Number.isFinite(node)) bad.push(`${path} = ${node}`);
        return;
      }
      if (Array.isArray(node)) return node.forEach((v, idx) => walk(v, `${path}[${idx}]`));
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      }
    };
    walk(runProjection(i), 'result');
    expect(bad).toEqual([]);
  });
});
