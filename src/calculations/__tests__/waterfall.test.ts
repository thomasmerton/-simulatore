import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import {
  buildExitWaterfall,
  buildInvestorWaterfall,
  buildOperatingWaterfall,
} from '../waterfall';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { PropertyInputs } from '@/domain/types';

function inputs(): PropertyInputs {
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
      vacancyDaysPerYear: 36.5,
      rentGrowthRate: 0,
      expenseGrowthRate: 0,
      condoFees: 1_200,
      propertyTax: 300,
      insurance: 0,
      ordinaryMaintenance: 0,
      capexReserve: 500,
      managementFeeRate: 0.05,
      utilities: 0,
      otherOperatingCosts: 0,
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
    incomeTax: { mode: 'FLAT_ON_GROSS', rate: 0.21, interestDeductible: false },
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

describe('operating waterfall', () => {
  const result = runProjection(inputs());
  const rows = buildOperatingWaterfall(result.years[0]!);
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it('emits every step of the standard underwriting waterfall, in order', () => {
    expect(rows.map((r) => r.key)).toEqual([
      'grossScheduledRent',
      'vacancy',
      'egi',
      'opex',
      'noi',
      'capex',
      'unlevered',
      'debtService',
      'leveredPreTax',
      'incomeTax',
      'leveredAfterTax',
    ]);
  });

  it('signs deductions negative so the column arithmetic is checkable', () => {
    expect(row('vacancy').amount as number).toBeLessThan(0);
    expect(row('opex').amount as number).toBeLessThan(0);
    expect(row('capex').amount as number).toBeLessThan(0);
    expect(row('debtService').amount as number).toBeLessThan(0);
  });

  it('adds up: gross + vacancy = EGI', () => {
    expect((row('grossScheduledRent').amount as number) + (row('vacancy').amount as number)).toBeCloseTo(
      row('egi').amount as number,
      6,
    );
  });

  it('adds up: EGI + opex = NOI', () => {
    expect((row('egi').amount as number) + (row('opex').amount as number)).toBeCloseTo(
      row('noi').amount as number,
      6,
    );
  });

  it('adds up: NOI + capex = unlevered cash flow', () => {
    expect((row('noi').amount as number) + (row('capex').amount as number)).toBeCloseTo(
      row('unlevered').amount as number,
      6,
    );
  });

  it('adds up: unlevered + debt service = levered pre-tax', () => {
    expect(
      (row('unlevered').amount as number) + (row('debtService').amount as number),
    ).toBeCloseTo(row('leveredPreTax').amount as number, 6);
  });

  it('adds up: levered pre-tax + tax = levered after tax', () => {
    expect(
      (row('leveredPreTax').amount as number) + (row('incomeTax')?.amount ?? 0),
    ).toBeCloseTo(row('leveredAfterTax').amount as number, 6);
  });

  it('breaks the operating expenses into inspectable children', () => {
    const children = row('opex').children!;
    expect(children.length).toBeGreaterThan(1);
    const sum = children.reduce((a, c) => a + c.amount, 0);
    expect(sum).toBeCloseTo(row('opex').amount as number, 6);
  });

  it('splits debt service into interest and principal that sum back', () => {
    const children = row('debtService').children!;
    expect(children.map((c) => c.key)).toEqual(['interest', 'principal']);
    const sum = children.reduce((a, c) => a + c.amount, 0);
    expect(sum).toBeCloseTo(row('debtService').amount as number, 6);
  });

  it('propagates nulls rather than showing a fabricated zero', () => {
    const missing = inputs();
    missing.rental.monthlyRent = null;
    const r = runProjection(missing);
    const nullRows = buildOperatingWaterfall(r.years[0]!);
    expect(nullRows.find((x) => x.key === 'grossScheduledRent')!.amount).toBeNull();
    expect(nullRows.find((x) => x.key === 'noi')!.amount).toBeNull();
  });
});

describe('exit waterfall', () => {
  const result = runProjection(inputs());
  const rows = buildExitWaterfall(result.exit);
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it('adds up to the net sale proceeds', () => {
    const total =
      (row('salePrice').amount as number) +
      (row('sellingCosts').amount as number) +
      (row('exitTax').amount as number) +
      (row('debtRepayment').amount as number) +
      (row('reservesReleased').amount as number);
    expect(total).toBeCloseTo(row('netSaleProceeds').amount as number, 6);
  });

  it('returns the initial reserve at exit', () => {
    const withReserve = inputs();
    withReserve.acquisition.initialReserves = 5_000;
    const r = runProjection(withReserve);
    expect(r.exit.reservesReleased).toBe(5_000);
    const plain = runProjection(inputs());
    expect((r.exit.netSaleProceeds as number) - (plain.exit.netSaleProceeds as number)).toBeCloseTo(
      5_000,
      6,
    );
  });
});

describe('investor waterfall', () => {
  it('adds up to total profit', () => {
    const result = runProjection(inputs());
    const rows = buildInvestorWaterfall({
      equityInvested: result.equityInvested,
      totalCashFlow: result.totalCashFlow,
      netSaleProceeds: result.exit.netSaleProceeds,
      totalProfit: result.totalProfit,
      holdingYears: 10,
    });
    const sum =
      (rows[0]!.amount as number) + (rows[1]!.amount as number) + (rows[2]!.amount as number);
    expect(sum).toBeCloseTo(rows[3]!.amount as number, 6);
  });
});
