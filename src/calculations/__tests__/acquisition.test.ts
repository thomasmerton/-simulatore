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

  it('includes legal fees, financing fees and the initial reserve in the total', () => {
    // These were added to the model after the first version and were briefly
    // present in the types and the form but absent from the arithmetic, which
    // silently dropped them from the total. This test pins them down.
    const r = calculateAcquisitionCost(
      facts(),
      costs({
        purchaseTaxRate: 0,
        agencyCommissionRate: 0,
        notaryFees: 2_000,
        legalFees: 1_500,
        financingFees: 1_200,
        initialReserves: 3_000,
      }),
    );
    expect(r.legalFees).toBe(1_500);
    expect(r.financingFees).toBe(1_200);
    expect(r.initialReserves).toBe(3_000);
    expect(r.totalTransactionCosts).toBeCloseTo(7_700, 6);
    expect(r.totalAcquisitionCost).toBeCloseTo(207_700, 6);
  });

  it('lists every non-zero cost line in the breakdown', () => {
    const r = calculateAcquisitionCost(
      facts(),
      costs({
        purchaseTaxRate: 0.09,
        notaryFees: 2_000,
        legalFees: 1_500,
        agencyCommissionRate: 0.03,
        financingFees: 1_200,
        renovationCost: 20_000,
        furnitureCost: 5_000,
        initialReserves: 3_000,
        otherUpfrontCosts: 800,
      }),
    );
    expect(r.breakdown.map((l) => l.key)).toEqual([
      'purchasePrice',
      'purchaseTax',
      'notaryFees',
      'legalFees',
      'agencyCommission',
      'financingFees',
      'renovation',
      'furniture',
      'initialReserves',
      'other',
    ]);
    // The breakdown must reconcile to the total, or it is decoration.
    const sum = r.breakdown.reduce((a, l) => a + l.amount, 0);
    expect(sum).toBeCloseTo(r.totalAcquisitionCost as number, 6);
  });

  it('the breakdown always reconciles to the total', () => {
    const combos = [
      { purchaseTaxRate: 0, agencyCommissionRate: 0 },
      { purchaseTaxRate: 0.09, agencyCommissionRate: 0.03, notaryFees: 2_500 },
      { purchaseTaxAmount: 15_000, agencyCommissionAmount: 4_000, legalFees: 900 },
      { purchaseTaxRate: 0.04, agencyCommissionRate: 0.02, initialReserves: 10_000 },
    ];
    for (const combo of combos) {
      const r = calculateAcquisitionCost(facts(), costs(combo));
      const sum = r.breakdown.reduce((a, l) => a + l.amount, 0);
      expect(sum).toBeCloseTo(r.totalAcquisitionCost as number, 6);
    }
  });

  it('excludes zero lines from the breakdown', () => {
    const r = calculateAcquisitionCost(
      facts(),
      costs({ purchaseTaxRate: 0.09, notaryFees: 0, agencyCommissionRate: 0 }),
    );
    expect(r.breakdown.map((l) => l.key)).toEqual(['purchasePrice', 'purchaseTax']);
  });
});
