import { describe, expect, it } from 'vitest';
import { calculateAcquisitionCost, resolveRateOrAmount } from '../acquisition';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { AcquisitionCosts, PropertyFacts } from '@/domain/types';

const facts = (over: Partial<PropertyFacts> = {}): PropertyFacts => ({
  ...emptyPropertyInputs().facts,
  purchasePrice: 200_000,
  sqm: 80,
  ...over,
});

const costs = (over: Partial<AcquisitionCosts> = {}): AcquisitionCosts => ({
  ...emptyPropertyInputs().acquisition,
  ...over,
});

describe('resolveRateOrAmount', () => {
  it('prefers an explicit amount over a rate', () => {
    expect(resolveRateOrAmount(200_000, 0.09, 15_000)).toBe(15_000);
  });

  it('falls back to the rate when no amount is given', () => {
    expect(resolveRateOrAmount(200_000, 0.09, null)).toBeCloseTo(18_000, 10);
  });

  it('returns null when neither is usable rather than assuming zero', () => {
    expect(resolveRateOrAmount(200_000, null, null)).toBeNull();
    expect(resolveRateOrAmount(null, 0.09, null)).toBeNull();
  });
});

describe('calculateAcquisitionCost', () => {
  it('sums price, taxes, fees and works', () => {
    const r = calculateAcquisitionCost(
      facts(),
      costs({
        purchaseTaxRate: 0.09,
        notaryFees: 2_500,
        agencyCommissionRate: 0.03,
        renovationCost: 20_000,
        furnitureCost: 5_000,
        otherUpfrontCosts: 1_000,
      }),
    );
    // 18,000 tax + 2,500 notary + 6,000 agency + 25,000 works + 1,000 other
    expect(r.totalTransactionCosts).toBeCloseTo(52_500, 6);
    expect(r.totalAcquisitionCost).toBeCloseTo(252_500, 6);
  });

  it('computes price per sqm on the price, and total cost per sqm on everything', () => {
    const r = calculateAcquisitionCost(
      facts(),
      costs({ purchaseTaxRate: 0.09, notaryFees: 2_500, agencyCommissionRate: 0.03 }),
    );
    expect(r.pricePerSqm).toBeCloseTo(2_500, 10);
    expect(r.totalCostPerSqm).toBeCloseTo(226_500 / 80, 6);
  });

  it('falls back to the asking price when no negotiated price is set', () => {
    const r = calculateAcquisitionCost(
      facts({ purchasePrice: null, askingPrice: 180_000 }),
      costs({ purchaseTaxRate: 0, notaryFees: 0, agencyCommissionRate: 0 }),
    );
    expect(r.purchasePrice).toBe(180_000);
  });

  it('reports an unknown total when a percentage cost has no basis', () => {
    // No tax rate and no tax amount: the total is genuinely unknown.
    const r = calculateAcquisitionCost(facts(), costs({ notaryFees: 2_500 }));
    expect(r.purchaseTax).toBeNull();
    expect(r.totalAcquisitionCost).toBeNull();
  });

  it('returns null metrics rather than dividing by a missing surface', () => {
    const r = calculateAcquisitionCost(facts({ sqm: null }), costs({}));
    expect(r.pricePerSqm).toBeNull();
    expect(r.totalCostPerSqm).toBeNull();
  });

  it('excludes zero lines from the breakdown', () => {
    const r = calculateAcquisitionCost(
      facts(),
      costs({ purchaseTaxRate: 0.09, notaryFees: 0, agencyCommissionRate: 0 }),
    );
    expect(r.breakdown.map((l) => l.key)).toEqual(['purchasePrice', 'purchaseTax']);
  });
});
