import { describe, expect, it } from 'vitest';
import { analyzePortfolio } from '../portfolio';
import type { Portfolio, PortfolioAsset } from '@/domain/types';

let counter = 0;
const asset = (over: Partial<PortfolioAsset> = {}): PortfolioAsset => ({
  id: `a${counter++}`,
  label: 'Asset',
  assetClass: 'EQUITIES',
  amount: 100_000,
  debt: 0,
  incomeYield: null,
  growthRate: null,
  liquid: true,
  location: { country: 'Italy', region: null, city: 'Rome', neighborhood: null, level: 'CITY' },
  strategy: null,
  propertyId: null,
  downsideShock: null,
  ...over,
});

const portfolio = (assets: PortfolioAsset[], availableCapital = 500_000): Portfolio => ({
  id: 'p1',
  name: 'Test',
  availableCapital,
  createdAt: '',
  updatedAt: '',
  assets,
});

describe('analyzePortfolio - allocation', () => {
  const p = portfolio([
    asset({ label: 'Flat', assetClass: 'REAL_ESTATE', amount: 250_000, liquid: false, location: { country: 'Italy', region: 'Lombardia', city: 'Milan', neighborhood: null, level: 'CITY' } }),
    asset({ label: 'ETF', assetClass: 'EQUITIES', amount: 100_000 }),
    asset({ label: 'BTP', assetClass: 'BONDS', amount: 100_000 }),
    asset({ label: 'Deposit', assetClass: 'CASH', amount: 50_000 }),
  ]);
  const r = analyzePortfolio(p);

  it('totals invested equity and reports what is left over', () => {
    expect(r.totalInvested).toBe(500_000);
    expect(r.unallocatedCapital).toBe(0);
  });

  it('computes shares by asset class', () => {
    const byKey = Object.fromEntries(r.allocationByClass.map((s) => [s.key, s.share]));
    expect(byKey.REAL_ESTATE).toBeCloseTo(0.5, 10);
    expect(byKey.EQUITIES).toBeCloseTo(0.2, 10);
    expect(byKey.BONDS).toBeCloseTo(0.2, 10);
    expect(byKey.CASH).toBeCloseTo(0.1, 10);
  });

  it('sorts allocation slices by size', () => {
    expect(r.allocationByClass[0]!.key).toBe('REAL_ESTATE');
  });

  it('groups exposure by city and by country', () => {
    expect(r.allocationByCity.find((s) => s.key === 'Milan')?.amount).toBe(250_000);
    expect(r.allocationByCountry.find((s) => s.key === 'Italy')?.amount).toBe(500_000);
  });

  it('reports property-level exposure within real estate only', () => {
    expect(r.allocationByProperty).toHaveLength(1);
    expect(r.allocationByProperty[0]!.label).toBe('Flat');
    expect(r.allocationByProperty[0]!.share).toBeCloseTo(1, 10);
  });

  it('separates liquid from illiquid capital', () => {
    expect(r.illiquidCapital).toBe(250_000);
    expect(r.liquidCapital).toBe(250_000);
    expect(r.liquidityRatio).toBeCloseTo(0.5, 10);
  });

  it('reports concentration as a statistic, with no verdict attached', () => {
    // HHI = 0.5^2 + 0.2^2 + 0.2^2 + 0.1^2 = 0.34
    expect(r.concentrationHHI).toBeCloseTo(0.34, 10);
    expect(r.largestHoldingShare).toBeCloseTo(0.5, 10);
    expect(r.largestHoldingLabel).toBe('Flat');
  });

  it('flags unallocated capital when the portfolio is underinvested', () => {
    const under = analyzePortfolio(portfolio([asset({ amount: 100_000 })], 500_000));
    expect(under.unallocatedCapital).toBe(400_000);
  });
});

describe('analyzePortfolio - leverage', () => {
  const r = analyzePortfolio(
    portfolio([
      asset({ assetClass: 'REAL_ESTATE', amount: 60_000, debt: 140_000, liquid: false }),
      asset({ assetClass: 'CASH', amount: 40_000 }),
    ]),
  );

  it('measures gross asset value as equity plus debt', () => {
    expect(r.grossAssetValue).toBe(240_000);
    expect(r.totalDebt).toBe(140_000);
  });

  it('computes leverage and LTV', () => {
    expect(r.leverageRatio).toBeCloseTo(2.4, 10); // 240,000 / 100,000
    expect(r.loanToValue).toBeCloseTo(140_000 / 240_000, 10);
  });

  it('is unlevered at 1.0 when there is no debt', () => {
    const unlevered = analyzePortfolio(portfolio([asset({ amount: 100_000 })]));
    expect(unlevered.leverageRatio).toBeCloseTo(1, 10);
    expect(unlevered.loanToValue).toBeCloseTo(0, 10);
  });
});

describe('analyzePortfolio - expected income', () => {
  it('applies the income yield to gross asset value, then deducts interest', () => {
    const r = analyzePortfolio(
      portfolio([
        asset({ assetClass: 'REAL_ESTATE', amount: 60_000, debt: 140_000, incomeYield: 0.05 }),
        asset({ assetClass: 'CASH', amount: 40_000, incomeYield: 0.02 }),
      ]),
      0.03,
    );
    // 200,000 x 5% + 40,000 x 2% = 10,800
    expect(r.expectedAnnualIncome).toBeCloseTo(10_800, 6);
    // less 140,000 x 3% = 4,200
    expect(r.expectedNetCashFlow).toBeCloseTo(6_600, 6);
  });

  it('refuses to total income when any asset lacks an assumption', () => {
    const r = analyzePortfolio(
      portfolio([asset({ incomeYield: 0.05 }), asset({ incomeYield: null })]),
    );
    expect(r.expectedAnnualIncome).toBeNull();
    expect(r.expectedNetCashFlow).toBeNull();
  });
});

describe('analyzePortfolio - downside', () => {
  it('shows how leverage amplifies a fall in asset values', () => {
    const r = analyzePortfolio(
      portfolio([
        asset({
          assetClass: 'REAL_ESTATE',
          amount: 60_000,
          debt: 140_000,
          downsideShock: -0.2,
        }),
      ]),
    );
    // Gross 200,000 falls 20% to 160,000; debt of 140,000 leaves 20,000 equity.
    expect(r.downside.shockedAssetValue).toBeCloseTo(160_000, 6);
    expect(r.downside.shockedEquity).toBeCloseTo(20_000, 6);
    // A 20% fall in value is a 66.7% fall in equity at 70% LTV.
    expect(r.downside.equityChange).toBeCloseTo(-2 / 3, 8);
    expect(r.downside.negativeEquity).toBe(false);
  });

  it('flags negative equity when debt exceeds the shocked value', () => {
    const r = analyzePortfolio(
      portfolio([
        asset({ assetClass: 'REAL_ESTATE', amount: 20_000, debt: 180_000, downsideShock: -0.3 }),
      ]),
    );
    expect(r.downside.negativeEquity).toBe(true);
    expect(r.downside.shockedEquity).toBeLessThan(0);
  });

  it('leaves values unchanged when no shock is set', () => {
    const r = analyzePortfolio(portfolio([asset({ amount: 100_000 })]));
    expect(r.downside.shockedAssetValue).toBe(100_000);
    expect(r.downside.equityChange).toBeCloseTo(0, 10);
  });
});

describe('analyzePortfolio - empty portfolio', () => {
  it('returns zeroes and nulls without throwing', () => {
    const r = analyzePortfolio(portfolio([], 500_000));
    expect(r.totalInvested).toBe(0);
    expect(r.unallocatedCapital).toBe(500_000);
    expect(r.concentrationHHI).toBeNull();
    expect(r.largestHoldingShare).toBeNull();
    expect(r.liquidityRatio).toBeNull();
  });
});
