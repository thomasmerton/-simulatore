import { describe, expect, it } from 'vitest';
import {
  calculateGrossRevenue,
  calculateNOI,
  calculateOccupancy,
  calculateOperatingExpenses,
  calculateRentalYear,
} from '../rental';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { RentalAssumptions } from '@/domain/types';

const rental = (over: Partial<RentalAssumptions> = {}): RentalAssumptions => ({
  ...emptyPropertyInputs().rental,
  monthlyRent: 1_000,
  vacancyDaysPerYear: 0,
  rentGrowthRate: 0,
  expenseGrowthRate: 0,
  ...over,
});

describe('calculateOccupancy', () => {
  it('converts vacancy days into an occupancy rate', () => {
    expect(calculateOccupancy(0)).toBe(1);
    expect(calculateOccupancy(365)).toBe(0);
    expect(calculateOccupancy(36.5)).toBeCloseTo(0.9, 10);
  });

  it('clamps out-of-range inputs', () => {
    expect(calculateOccupancy(400)).toBe(0);
    expect(calculateOccupancy(-10)).toBe(1);
  });

  it('is unknown, not 100%, when vacancy is missing', () => {
    expect(calculateOccupancy(null)).toBeNull();
  });
});

describe('calculateGrossRevenue', () => {
  it('annualises the monthly rent', () => {
    expect(calculateGrossRevenue(rental(), 1)).toBe(12_000);
  });

  it('compounds rent growth from year 2 onward', () => {
    const r = rental({ rentGrowthRate: 0.02 });
    expect(calculateGrossRevenue(r, 1)).toBeCloseTo(12_000, 8);
    expect(calculateGrossRevenue(r, 2)).toBeCloseTo(12_240, 8);
    expect(calculateGrossRevenue(r, 3)).toBeCloseTo(12_484.8, 6);
  });

  it('removes the stabilisation period from year 1 only', () => {
    const r = rental({ stabilizationMonths: 3 });
    expect(calculateGrossRevenue(r, 1)).toBe(9_000);
    expect(calculateGrossRevenue(r, 2)).toBe(12_000);
  });

  it('returns null when the rent is unknown', () => {
    expect(calculateGrossRevenue(rental({ monthlyRent: null }), 1)).toBeNull();
  });
});

describe('calculateOperatingExpenses', () => {
  it('charges the management fee on collected rent, not potential rent', () => {
    const { total, lines } = calculateOperatingExpenses(
      rental({ managementFeeRate: 0.1 }),
      1,
      10_000, // collected, after a void
    );
    expect(lines.find((l) => l.key === 'managementFee')?.amount).toBeCloseTo(1_000, 10);
    expect(total).toBeCloseTo(1_000, 10);
  });

  it('grows fixed costs by the expense growth rate', () => {
    const r = rental({ condoFees: 1_000, expenseGrowthRate: 0.03 });
    expect(calculateOperatingExpenses(r, 1, 12_000).total).toBeCloseTo(1_000, 8);
    expect(calculateOperatingExpenses(r, 3, 12_000).total).toBeCloseTo(1_060.9, 6);
  });

  it('omits the management fee when income is unknown', () => {
    const { lines } = calculateOperatingExpenses(rental({ managementFeeRate: 0.1 }), 1, null);
    expect(lines.find((l) => l.key === 'managementFee')).toBeUndefined();
  });
});

describe('calculateNOI', () => {
  it('is effective gross income less operating expenses', () => {
    expect(calculateNOI(12_000, 2_280)).toBe(9_720);
  });

  it('is unknown if either side is unknown', () => {
    expect(calculateNOI(null, 2_280)).toBeNull();
    expect(calculateNOI(12_000, null)).toBeNull();
  });
});

describe('calculateRentalYear', () => {
  it('keeps the capex reserve out of NOI', () => {
    const r = calculateRentalYear(
      rental({ condoFees: 1_200, capexReserve: 800 }),
      1,
    );
    expect(r.noi).toBeCloseTo(12_000 - 1_200, 8); // reserve NOT deducted
    expect(r.capexReserve).toBe(800);
  });

  it('applies the vacancy loss before expenses', () => {
    const r = calculateRentalYear(rental({ vacancyDaysPerYear: 36.5 }), 1);
    expect(r.vacancyLoss).toBeCloseTo(1_200, 8);
    expect(r.effectiveGrossIncome).toBeCloseTo(10_800, 8);
  });
});
