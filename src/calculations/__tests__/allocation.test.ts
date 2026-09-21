import { describe, expect, it } from 'vitest';
import { ALLOCATION_MEASURES, compareAllocations } from '../allocation';
import { applyTaxProfile, taxProfileGaps } from '../tax';
import { blankTaxProfile, emptyPropertyInputs, italianSecondHomeProfile } from '@/domain/defaults';
import type { AllocationStrategy, PortfolioAsset } from '@/domain/types';

let n = 0;
const asset = (over: Partial<PortfolioAsset> = {}): PortfolioAsset => ({
  id: `a${n++}`,
  label: 'Asset',
  assetClass: 'CASH',
  amount: 0,
  debt: 0,
  incomeYield: null,
  growthRate: null,
  liquid: true,
  location: null,
  strategy: null,
  propertyId: null,
  downsideShock: null,
  ...over,
});

const strategy = (name: string, assets: PortfolioAsset[]): AllocationStrategy => ({
  id: name,
  name,
  description: '',
  assets,
});

describe('compareAllocations', () => {
  const propertyHeavy = strategy('Property heavy', [
    asset({ assetClass: 'REAL_ESTATE', amount: 350_000, debt: 350_000, liquid: false, downsideShock: -0.2 }),
    asset({ assetClass: 'CASH', amount: 50_000 }),
  ]);
  const balanced = strategy('Balanced', [
    asset({ assetClass: 'REAL_ESTATE', amount: 150_000, debt: 100_000, liquid: false, downsideShock: -0.2 }),
    asset({ assetClass: 'EQUITIES', amount: 200_000, downsideShock: -0.3 }),
    asset({ assetClass: 'CASH', amount: 50_000 }),
  ]);

  const comparisons = compareAllocations([propertyHeavy, balanced], 400_000);

  it('analyses every strategy against the same capital base', () => {
    expect(comparisons).toHaveLength(2);
    expect(comparisons.every((c) => c.result.availableCapital === 400_000)).toBe(true);
  });

  it('flags a strategy that does not fund', () => {
    // Both sample strategies commit exactly the available capital.
    expect(comparisons.every((c) => c.overCommitted)).toBe(false);
    expect(comparisons[0]!.result.unallocatedCapital).toBe(0);

    const tooBig = compareAllocations(
      [strategy('Over', [asset({ assetClass: 'CASH', amount: 600_000 })])],
      400_000,
    );
    expect(tooBig[0]!.overCommitted).toBe(true);
    expect(tooBig[0]!.result.unallocatedCapital).toBe(-200_000);
  });

  it('shows leverage differing between strategies', () => {
    const levered = comparisons[0]!.result.leverageRatio as number;
    const lessLevered = comparisons[1]!.result.leverageRatio as number;
    expect(levered).toBeGreaterThan(lessLevered);
  });

  it('shows the leveraged strategy losing more equity in the downside', () => {
    const a = comparisons[0]!.result.downside.equityChange as number;
    const b = comparisons[1]!.result.downside.equityChange as number;
    expect(a).toBeLessThan(b);
  });

  it('exposes identical measures for every strategy — that is the comparison', () => {
    for (const measure of ALLOCATION_MEASURES) {
      for (const c of comparisons) {
        const value = measure.extract(c);
        expect(value === null || Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('every measure carries a note explaining what it means', () => {
    for (const measure of ALLOCATION_MEASURES) {
      expect(measure.note.length).toBeGreaterThan(10);
    }
  });

  it('declares no winner: nothing in the output ranks the strategies', () => {
    const keys = ALLOCATION_MEASURES.map((m) => m.key).join(' ');
    expect(keys).not.toMatch(/score|rank|best|rating/i);
    for (const c of comparisons) {
      expect(Object.keys(c)).toEqual(['strategy', 'result', 'overCommitted']);
    }
  });

  it('handles an empty strategy without dividing by zero', () => {
    const [empty] = compareAllocations([strategy('Empty', [])], 500_000);
    expect(empty!.result.totalInvested).toBe(0);
    expect(empty!.result.unallocatedCapital).toBe(500_000);
    expect(empty!.result.concentrationHHI).toBeNull();
    expect(empty!.result.leverageRatio).toBeNull();
  });
});

describe('tax profiles', () => {
  it('overwrites the property tax inputs from the profile', () => {
    const profile = italianSecondHomeProfile('p1');
    const out = applyTaxProfile(emptyPropertyInputs(), profile);
    expect(out.acquisition.purchaseTaxRate).toBe(0.09);
    expect(out.incomeTax.mode).toBe('FLAT_ON_GROSS');
    expect(out.incomeTax.rate).toBe(0.21);
    expect(out.exit.capitalGainsTaxRate).toBe(0.26);
    expect(out.exit.capitalGainsExemptAfterYears).toBe(5);
    expect(out.exit.sellingCostsRate).toBe(0.03);
  });

  it('does not mutate the inputs it is given', () => {
    const inputs = emptyPropertyInputs();
    applyTaxProfile(inputs, italianSecondHomeProfile('p1'));
    expect(inputs.acquisition.purchaseTaxRate).toBeNull();
  });

  it('ships the Italian profile UNVERIFIED, with a caveat', () => {
    const profile = italianSecondHomeProfile('p1');
    expect(profile.verified).toBe(false);
    expect(profile.notes).toMatch(/verify/i);
    expect(profile.source).toBeNull();
    expect(profile.effectiveDate).toBeNull();
  });

  it('reports what an incomplete profile is missing', () => {
    const gaps = taxProfileGaps(blankTaxProfile('p2', 'Spain'));
    expect(gaps).toContain('purchase tax rate');
    expect(gaps).toContain('capital gains tax rate');
    expect(gaps).toContain('source');
    expect(gaps).toContain('effective date');
  });

  it('counts a sourced, dated profile as complete', () => {
    const profile = {
      ...italianSecondHomeProfile('p1'),
      source: 'Agenzia delle Entrate',
      effectiveDate: '2024-01-01',
    };
    expect(taxProfileGaps(profile)).toEqual([]);
  });

  it('a profile with no income tax does not demand an income tax rate', () => {
    const profile = {
      ...blankTaxProfile('p3', 'Ireland'),
      purchaseTaxRate: 0.01,
      capitalGainsTaxRate: 0.33,
      sellingCostsRate: 0.02,
      source: 'Revenue',
      effectiveDate: '2024-01-01',
    };
    expect(taxProfileGaps(profile)).toEqual([]);
  });
});
