import { describe, expect, it } from 'vitest';
import {
  SENSITIVITY_AXES,
  SENSITIVITY_METRICS,
  buildAdditiveSweep,
  buildSweep,
  calculateSensitivity,
} from '../sensitivity';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { PropertyInputs } from '@/domain/types';

function baseInputs(): PropertyInputs {
  const i = emptyPropertyInputs();
  return {
    ...i,
    facts: { ...i.facts, location: { ...i.facts.location, country: 'Testland', city: 'Testville' }, purchasePrice: 200_000, sqm: 80 },
    acquisition: {
      ...i.acquisition,
      purchaseTaxRate: 0.09,
      notaryFees: 2_000,
      agencyCommissionRate: 0,
      renovationCost: 0,
      furnitureCost: 0,
      otherUpfrontCosts: 0,
    },
    rental: {
      ...i.rental,
      monthlyRent: 1_000,
      vacancyDaysPerYear: 20,
      rentGrowthRate: 0.01,
      expenseGrowthRate: 0.02,
      condoFees: 1_200,
      capexReserve: 600,
      stabilizationMonths: 0,
    },
    financing: {
      enabled: true,
      ltv: 0.7,
      loanAmount: null,
      annualRate: 0.03,
      termYears: 25,
      rateType: 'FIXED',
      amortizationType: 'AMORTIZING',
      maturityYears: null,
    },
    exit: {
      holdingPeriodYears: 10,
      priceGrowthRate: 0.01,
      sellingCostsRate: 0.03,
      capitalGainsTaxRate: null,
      capitalGainsExemptAfterYears: null,
    },
    settings: { discountRate: 0.05, currency: 'EUR' },
  };
}

const axis = (key: string) => SENSITIVITY_AXES.find((a) => a.key === key)!;
const metric = (key: string) => SENSITIVITY_METRICS.find((m) => m.key === key)!;

describe('sweep builders', () => {
  it('builds a symmetric relative sweep centred on the base', () => {
    expect(buildSweep(1_000, 0.2, 5)).toEqual([800, 900, 1_000, 1_100, 1_200]);
  });

  it('builds a symmetric additive sweep', () => {
    const sweep = buildAdditiveSweep(0.03, 0.02, 5);
    expect(sweep[0]).toBeCloseTo(0.01, 10);
    expect(sweep[2]).toBeCloseTo(0.03, 10);
    expect(sweep[4]).toBeCloseTo(0.05, 10);
  });

  it('degenerates to a single value when asked for one step', () => {
    expect(buildSweep(500, 0.2, 1)).toEqual([500]);
  });
});

describe('axes write inputs without mutating them', () => {
  it.each(SENSITIVITY_AXES.map((a) => a.key))('%s is non-mutating', (key) => {
    const inputs = baseInputs();
    const snapshot = JSON.stringify(inputs);
    axis(key).apply(inputs, 1);
    expect(JSON.stringify(inputs)).toBe(snapshot);
  });

  it('clears an explicit loan amount when sweeping LTV', () => {
    const inputs = baseInputs();
    inputs.financing.loanAmount = 150_000;
    const out = axis('ltv').apply(inputs, 0.5);
    expect(out.financing.loanAmount).toBeNull();
    expect(out.financing.ltv).toBe(0.5);
  });

  it('keeps vacancy days inside a year', () => {
    expect(axis('vacancyDays').apply(baseInputs(), 9_999).rental.vacancyDaysPerYear).toBe(365);
    expect(axis('vacancyDays').apply(baseInputs(), -50).rental.vacancyDaysPerYear).toBe(0);
  });

  it('reads the current base value', () => {
    expect(axis('monthlyRent').read(baseInputs())).toBe(1_000);
    expect(axis('purchasePrice').read(baseInputs())).toBe(200_000);
  });
});

describe('calculateSensitivity', () => {
  const grid = calculateSensitivity(
    baseInputs(),
    axis('purchasePrice'),
    buildSweep(200_000, 0.1, 5),
    axis('monthlyRent'),
    buildSweep(1_000, 0.2, 5),
    metric('leveredIRR'),
  );

  it('produces a grid of the requested shape', () => {
    expect(grid.cells).toHaveLength(5);
    expect(grid.cells.every((row) => row.length === 5)).toBe(true);
  });

  it('reports the range across the grid', () => {
    expect(grid.min).not.toBeNull();
    expect(grid.max).not.toBeNull();
    expect(grid.max as number).toBeGreaterThan(grid.min as number);
  });

  it('increases IRR as rent rises, holding price constant', () => {
    const row = grid.cells[2]!;
    for (let i = 1; i < row.length; i++) {
      expect(row[i] as number).toBeGreaterThan(row[i - 1] as number);
    }
  });

  it('decreases IRR as the purchase price rises, holding rent constant', () => {
    for (let r = 1; r < grid.cells.length; r++) {
      expect(grid.cells[r]![2] as number).toBeLessThan(grid.cells[r - 1]![2] as number);
    }
  });

  it('reproduces the base projection at the centre of the grid', () => {
    const centre = grid.cells[2]![2];
    const direct = calculateSensitivity(
      baseInputs(),
      axis('purchasePrice'),
      [200_000],
      axis('monthlyRent'),
      [1_000],
      metric('leveredIRR'),
    ).cells[0]![0];
    expect(centre).toBeCloseTo(direct as number, 10);
  });

  it('raises the equity multiple with a longer hold and stronger appreciation', () => {
    const em = calculateSensitivity(
      baseInputs(),
      axis('priceGrowth'),
      [0, 0.02, 0.04],
      axis('holdingPeriod'),
      [5, 10, 20],
      metric('equityMultiple'),
    );
    expect(em.cells[2]![2] as number).toBeGreaterThan(em.cells[0]![0] as number);
  });

  it('emits nulls rather than fabricated numbers where a metric is undefined', () => {
    const inputs = baseInputs();
    inputs.financing.enabled = false; // DSCR is undefined without debt
    const g = calculateSensitivity(
      inputs,
      axis('monthlyRent'),
      [900, 1_000],
      axis('vacancyDays'),
      [0, 30],
      metric('dscr'),
    );
    expect(g.cells.flat().every((c) => c === null)).toBe(true);
    expect(g.min).toBeNull();
  });
});
