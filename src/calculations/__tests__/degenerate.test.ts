import { describe, expect, it } from 'vitest';
import { runProjection } from '@/calculations/projection';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { PropertyInputs } from '@/domain/types';

function walk(node: unknown, path: string, bad: string[]): void {
  if (typeof node === 'number') {
    if (Number.isNaN(node)) bad.push(`NaN at ${path}`);
    if (!Number.isFinite(node) && !Number.isNaN(node)) bad.push(`Infinity at ${path}`);
    return;
  }
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`, bad)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, bad);
  }
}

const base = (): PropertyInputs => {
  const i = emptyPropertyInputs();
  return {
    ...i,
    facts: { ...i.facts, purchasePrice: 200_000, sqm: 80 },
    acquisition: { ...i.acquisition, purchaseTaxRate: 0.09, notaryFees: 2000, agencyCommissionRate: 0.03, renovationCost: 0, furnitureCost: 0, otherUpfrontCosts: 0 },
    rental: { ...i.rental, monthlyRent: 1000, vacancyDaysPerYear: 30, rentGrowthRate: 0.01, expenseGrowthRate: 0.02, condoFees: 1200, propertyTax: 500, insurance: 0, ordinaryMaintenance: 0, capexReserve: 500, managementFeeRate: 0.08, otherOperatingCosts: 0, stabilizationMonths: 0 },
    exit: { holdingPeriodYears: 10, priceGrowthRate: 0.01, sellingCostsRate: 0.03, capitalGainsTaxRate: 0.26, capitalGainsExemptAfterYears: 5 },
    settings: { discountRate: 0.05, currency: 'EUR' },
  };
};

const cases: [string, (i: PropertyInputs) => void][] = [
  ['zero rent', (i) => { i.rental.monthlyRent = 0; }],
  ['zero vacancy', (i) => { i.rental.vacancyDaysPerYear = 0; }],
  ['100% vacancy', (i) => { i.rental.vacancyDaysPerYear = 365; }],
  ['zero price', (i) => { i.facts.purchasePrice = 0; }],
  ['zero sqm', (i) => { i.facts.sqm = 0; }],
  ['LTV 100%', (i) => { i.financing = { ...i.financing, enabled: true, ltv: 1, annualRate: 0.03, termYears: 25 }; }],
  ['LTV 150%', (i) => { i.financing = { ...i.financing, enabled: true, ltv: 1.5, annualRate: 0.03, termYears: 25 }; }],
  ['zero rate loan', (i) => { i.financing = { ...i.financing, enabled: true, ltv: 0.7, annualRate: 0, termYears: 25 }; }],
  ['term < hold (balloon-free)', (i) => { i.financing = { ...i.financing, enabled: true, ltv: 0.7, annualRate: 0.03, termYears: 3 }; }],
  ['term > hold (balloon)', (i) => { i.financing = { ...i.financing, enabled: true, ltv: 0.7, annualRate: 0.03, termYears: 30 }; }],
  ['1-year hold', (i) => { i.exit.holdingPeriodYears = 1; }],
  ['negative appreciation', (i) => { i.exit.priceGrowthRate = -0.2; }],
  ['-100% appreciation', (i) => { i.exit.priceGrowthRate = -1; }],
  ['mgmt fee 100%', (i) => { i.rental.managementFeeRate = 1; }],
  ['mgmt fee 150%', (i) => { i.rental.managementFeeRate = 1.5; }],
  ['selling costs 100%', (i) => { i.exit.sellingCostsRate = 1; }],
  ['discount rate -100%', (i) => { i.settings.discountRate = -1; }],
  ['stabilization 12 months', (i) => { i.rental.stabilizationMonths = 12; }],
  ['huge rent growth', (i) => { i.rental.rentGrowthRate = 10; }],
  ['NaN holding period', (i) => { i.exit.holdingPeriodYears = NaN; }],
  ['everything null', (i) => { Object.assign(i, emptyPropertyInputs()); }],
];

describe('no NaN or Infinity ever reaches the result', () => {
  it.each(cases)('%s', (_name, mutate) => {
    const inputs = base();
    mutate(inputs);
    const bad: string[] = [];
    walk(runProjection(inputs), 'result', bad);
    expect(bad).toEqual([]);
  });
});
