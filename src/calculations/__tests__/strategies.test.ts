import { describe, expect, it } from 'vitest';
import { calculateStrategyRevenue, strategyMissingInputs } from '../strategies';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { RentalAssumptions } from '@/domain/types';

const rental = (over: Partial<RentalAssumptions> = {}): RentalAssumptions => ({
  ...emptyPropertyInputs().rental,
  rentGrowthRate: 0,
  stabilizationMonths: 0,
  ...over,
});

describe('LONG_TERM', () => {
  const base = rental({ strategy: 'LONG_TERM', monthlyRent: 1_000, vacancyDaysPerYear: 0 });

  it('annualises the rent', () => {
    const r = calculateStrategyRevenue(base, 1);
    expect(r.grossScheduledRevenue).toBe(12_000);
    expect(r.effectiveGrossIncome).toBe(12_000);
    expect(r.occupancy).toBe(1);
  });

  it('applies voids as an occupancy deduction', () => {
    const r = calculateStrategyRevenue({ ...base, vacancyDaysPerYear: 36.5 }, 1);
    expect(r.occupancy).toBeCloseTo(0.9, 10);
    expect(r.effectiveGrossIncome).toBeCloseTo(10_800, 8);
  });

  it('reports 100% vacancy as zero income, not as an error', () => {
    const r = calculateStrategyRevenue({ ...base, vacancyDaysPerYear: 365 }, 1);
    expect(r.occupancy).toBe(0);
    expect(r.effectiveGrossIncome).toBe(0);
  });

  it('names its missing inputs instead of guessing', () => {
    const r = calculateStrategyRevenue(rental({ strategy: 'LONG_TERM' }), 1);
    expect(r.grossScheduledRevenue).toBeNull();
    expect(r.missingInputs).toEqual(['rental.monthlyRent', 'rental.vacancyDaysPerYear']);
  });
});

describe('SHORT_TERM', () => {
  const base = rental({
    strategy: 'SHORT_TERM',
    shortTerm: {
      averageDailyRate: 100,
      occupancyRate: 0.6,
      platformFeeRate: 0.15,
      cleaningCostPerStay: 50,
      averageStayNights: 3,
      cleaningRecoveredFromGuest: false,
    },
  });

  it('prices nights, not months', () => {
    const r = calculateStrategyRevenue(base, 1);
    expect(r.grossScheduledRevenue).toBeCloseTo(36_500, 6); // 100 x 365
    expect(r.effectiveGrossIncome).toBeCloseTo(21_900, 6); // x 60%
  });

  it('charges platform commission on collected revenue only', () => {
    const r = calculateStrategyRevenue(base, 1);
    const fee = r.strategyCosts.find((c) => c.key === 'platformFee');
    expect(fee?.amount).toBeCloseTo(21_900 * 0.15, 6);
  });

  it('turns nights sold into stays before charging cleaning', () => {
    const r = calculateStrategyRevenue(base, 1);
    const cleaning = r.strategyCosts.find((c) => c.key === 'cleaning');
    // 365 x 0.6 = 219 nights / 3 nights per stay = 73 stays x 50
    expect(cleaning?.amount).toBeCloseTo(73 * 50, 6);
  });

  it('drops cleaning and reports the gap when stay length is unknown', () => {
    const r = calculateStrategyRevenue(
      { ...base, shortTerm: { ...base.shortTerm, averageStayNights: null } },
      1,
    );
    expect(r.strategyCosts.find((c) => c.key === 'cleaning')).toBeUndefined();
    expect(r.missingInputs).toContain('rental.shortTerm.averageStayNights');
  });

  it('excludes cleaning entirely when the guest pays it', () => {
    const r = calculateStrategyRevenue(
      { ...base, shortTerm: { ...base.shortTerm, cleaningRecoveredFromGuest: true } },
      1,
    );
    expect(r.strategyCosts.find((c) => c.key === 'cleaning')).toBeUndefined();
    expect(r.missingInputs).toEqual([]);
  });

  it('does NOT fall back to the long-let rent when its own inputs are missing', () => {
    const r = calculateStrategyRevenue(
      rental({ strategy: 'SHORT_TERM', monthlyRent: 1_000, vacancyDaysPerYear: 0 }),
      1,
    );
    expect(r.grossScheduledRevenue).toBeNull();
    expect(r.missingInputs.length).toBeGreaterThan(0);
  });
});

describe('STUDENT', () => {
  const base = rental({
    strategy: 'STUDENT',
    student: {
      monthlyRentPerRoom: 400,
      rooms: 3,
      monthsLetPerYear: 10,
      roomOccupancyRate: 1,
    },
  });

  it('prices the academic year, not twelve months', () => {
    const r = calculateStrategyRevenue(base, 1);
    expect(r.grossScheduledRevenue).toBe(12_000); // 400 x 3 x 10
  });

  it('treats the closed months as priced out, not as a void', () => {
    const r = calculateStrategyRevenue(base, 1);
    expect(r.occupancy).toBe(1);
    expect(r.vacancyLoss).toBe(0);
  });

  it('applies room occupancy on top of the let period', () => {
    const r = calculateStrategyRevenue(
      { ...base, student: { ...base.student, roomOccupancyRate: 2 / 3 } },
      1,
    );
    expect(r.effectiveGrossIncome).toBeCloseTo(8_000, 6);
  });
});

describe('ROOM_BY_ROOM', () => {
  it('multiplies rooms by rent by twelve, then applies occupancy', () => {
    const r = calculateStrategyRevenue(
      rental({
        strategy: 'ROOM_BY_ROOM',
        roomByRoom: { monthlyRentPerRoom: 500, rooms: 4, roomOccupancyRate: 0.75 },
      }),
      1,
    );
    expect(r.grossScheduledRevenue).toBe(24_000);
    expect(r.effectiveGrossIncome).toBe(18_000);
  });
});

describe('shared behaviour across strategies', () => {
  it('applies the stabilisation period to year 1 only, for every strategy', () => {
    const cases: RentalAssumptions[] = [
      rental({ strategy: 'LONG_TERM', monthlyRent: 1_000, vacancyDaysPerYear: 0, stabilizationMonths: 6 }),
      rental({
        strategy: 'SHORT_TERM',
        stabilizationMonths: 6,
        shortTerm: {
          averageDailyRate: 100,
          occupancyRate: 1,
          platformFeeRate: 0,
          cleaningCostPerStay: null,
          averageStayNights: null,
          cleaningRecoveredFromGuest: true,
        },
      }),
      rental({
        strategy: 'ROOM_BY_ROOM',
        stabilizationMonths: 6,
        roomByRoom: { monthlyRentPerRoom: 500, rooms: 4, roomOccupancyRate: 1 },
      }),
    ];
    for (const r of cases) {
      const y1 = calculateStrategyRevenue(r, 1).grossScheduledRevenue as number;
      const y2 = calculateStrategyRevenue(r, 2).grossScheduledRevenue as number;
      expect(y1).toBeCloseTo(y2 / 2, 6);
    }
  });

  it('compounds rent growth from year 2', () => {
    const r = rental({
      strategy: 'LONG_TERM',
      monthlyRent: 1_000,
      vacancyDaysPerYear: 0,
      rentGrowthRate: 0.02,
    });
    expect(calculateStrategyRevenue(r, 1).grossScheduledRevenue).toBeCloseTo(12_000, 8);
    expect(calculateStrategyRevenue(r, 3).grossScheduledRevenue).toBeCloseTo(12_484.8, 6);
  });

  it('strategyMissingInputs reports the selected strategy only', () => {
    const r = rental({ strategy: 'SHORT_TERM', monthlyRent: 1_000, vacancyDaysPerYear: 0 });
    const missing = strategyMissingInputs(r);
    expect(missing.every((m) => m.startsWith('rental.shortTerm.'))).toBe(true);
  });
});
