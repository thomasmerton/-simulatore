import { describe, expect, it } from 'vitest';
import { runProjection } from '../projection';
import { npv } from '../finance';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { PropertyInputs } from '@/domain/types';

/**
 * A deliberately round base case so figures can be checked by hand:
 *   price 200,000 | 80 m² | rent 1,000/month | 10% acquisition costs
 *   no vacancy, no growth, 1,200/yr condo fees, 10-year hold.
 */
function baseInputs(): PropertyInputs {
  const i = emptyPropertyInputs();
  return {
    ...i,
    facts: { ...i.facts, city: 'Testville', purchasePrice: 200_000, sqm: 80 },
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
      vacancyDaysPerYear: 0,
      rentGrowthRate: 0,
      expenseGrowthRate: 0,
      condoFees: 1_200,
      propertyTax: 0,
      insurance: 0,
      ordinaryMaintenance: 0,
      capexReserve: 0,
      managementFeeRate: 0,
      otherOperatingCosts: 0,
      stabilizationMonths: 0,
    },
    exit: {
      holdingPeriodYears: 10,
      priceGrowthRate: 0,
      sellingCostsRate: 0,
      capitalGainsTaxRate: null,
      capitalGainsExemptAfterYears: null,
    },
    settings: { discountRate: 0.05, currency: 'EUR' },
  };
}

describe('runProjection - unlevered base case', () => {
  const r = runProjection(baseInputs());

  it('builds the acquisition cost from price plus one-off costs', () => {
    // 200,000 + 18,000 tax + 2,000 notary
    expect(r.acquisition.totalAcquisitionCost).toBeCloseTo(220_000, 6);
    expect(r.equityInvested).toBeCloseTo(220_000, 6);
    expect(r.loanAmount).toBeNull();
  });

  it('computes NOI as rent less operating expenses', () => {
    expect(r.year1.grossPotentialRent).toBe(12_000);
    expect(r.year1.noi).toBeCloseTo(10_800, 6);
  });

  it('reports gross yield on both price and total cost', () => {
    expect(r.year1.grossYieldOnPrice).toBeCloseTo(0.06, 10); // 12,000 / 200,000
    expect(r.year1.grossYieldOnTotalCost).toBeCloseTo(12_000 / 220_000, 10);
  });

  it('reports net yield on both denominators', () => {
    expect(r.year1.netYieldOnPrice).toBeCloseTo(0.054, 10); // 10,800 / 200,000
    expect(r.year1.netYieldOnTotalCost).toBeCloseTo(10_800 / 220_000, 10);
  });

  it('produces one row per year of the holding period', () => {
    expect(r.years).toHaveLength(10);
    expect(r.years[9]?.year).toBe(10);
  });

  it('accumulates cash flow', () => {
    expect(r.years[0]?.cumulativeCashFlow).toBeCloseTo(10_800, 6);
    expect(r.years[9]?.cumulativeCashFlow).toBeCloseTo(108_000, 6);
  });

  it('places the equity outflow at t=0 and the sale in the final year', () => {
    expect(r.leveredCashFlows).toHaveLength(11);
    expect(r.leveredCashFlows[0]).toBeCloseTo(-220_000, 6);
    expect(r.leveredCashFlows[1]).toBeCloseTo(10_800, 6);
    // Final year = operating cash flow + sale at an unchanged 200,000.
    expect(r.leveredCashFlows[10]).toBeCloseTo(210_800, 6);
  });

  it('gives an IRR at which NPV is zero', () => {
    expect(r.leveredIRR.value).not.toBeNull();
    expect(r.leveredIRR.ambiguous).toBe(false);
    expect(npv(r.leveredIRR.value as number, r.leveredCashFlows)).toBeCloseTo(0, 4);
  });

  it('computes NPV at the user discount rate', () => {
    expect(r.npv).toBeCloseTo(npv(0.05, r.leveredCashFlows) as number, 8);
  });

  it('computes the equity multiple from distributions over equity', () => {
    // (108,000 income + 200,000 sale) / 220,000
    expect(r.equityMultiple).toBeCloseTo(308_000 / 220_000, 8);
  });

  it('does not repay 220,000 of capital from 10,800/yr within the horizon', () => {
    expect(r.payback.beyondHorizon).toBe(true);
    expect(r.payback.years).toBeNull();
  });

  it('has no DSCR without debt', () => {
    expect(r.year1.dscr).toBeNull();
    expect(r.minDSCR).toBeNull();
  });

  it('breaks even at the point where rent covers costs', () => {
    // Fixed costs 1,200 / potential rent 12,000 = 10% occupancy.
    expect(r.year1.breakEvenOccupancyBeforeDebt).toBeCloseTo(0.1, 10);
    expect(r.year1.breakEvenOccupancyAfterDebt).toBeCloseTo(0.1, 10);
    expect(r.year1.occupancyHeadroom).toBeCloseTo(0.9, 10);
  });
});

describe('runProjection - value growth and transaction costs', () => {
  it('grows value from the purchase price, not the total acquisition cost', () => {
    const inputs = baseInputs();
    inputs.exit.priceGrowthRate = 0.02;
    const r = runProjection(inputs);
    // Transaction costs are sunk and are not recovered by appreciation.
    expect(r.years[0]?.propertyValue).toBeCloseTo(204_000, 6);
    expect(r.exit.salePrice).toBeCloseTo(200_000 * Math.pow(1.02, 10), 4);
  });

  it('deducts selling costs from the sale price', () => {
    const inputs = baseInputs();
    inputs.exit.sellingCostsRate = 0.03;
    const r = runProjection(inputs);
    expect(r.exit.sellingCosts).toBeCloseTo(6_000, 6);
    expect(r.exit.netSalePrice).toBeCloseTo(194_000, 6);
    expect(r.exit.netSaleProceeds).toBeCloseTo(194_000, 6);
  });
});

describe('runProjection - leverage', () => {
  function levered() {
    const inputs = baseInputs();
    inputs.financing = {
      enabled: true,
      ltv: 0.7,
      loanAmount: null,
      annualRate: 0.03,
      termYears: 25,
      rateType: 'FIXED',
      upfrontCosts: 1_000,
    };
    return runProjection(inputs);
  }

  it('reduces the equity cheque by the loan and adds arrangement fees', () => {
    const r = levered();
    expect(r.loanAmount).toBeCloseTo(140_000, 6);
    // 220,000 total cost - 140,000 loan + 1,000 fees
    expect(r.equityInvested).toBeCloseTo(81_000, 6);
  });

  it('leaves NOI and net yield untouched: they are property-level metrics', () => {
    const unlevered = runProjection(baseInputs());
    const r = levered();
    expect(r.year1.noi).toBeCloseTo(unlevered.year1.noi as number, 8);
    expect(r.year1.netYieldOnTotalCost).toBeCloseTo(
      unlevered.year1.netYieldOnTotalCost as number,
      10,
    );
  });

  it('computes DSCR from NOI over debt service', () => {
    const r = levered();
    const debtService = r.years[0]!.debtService;
    expect(r.year1.dscr).toBeCloseTo(10_800 / debtService, 8);
    // 12 x 663.8958 = 7,966.75 of debt service against 10,800 of NOI.
    expect(debtService).toBeCloseTo(7_966.75, 1);
  });

  it('raises the break-even occupancy once debt must be serviced', () => {
    const r = levered();
    const before = r.year1.breakEvenOccupancyBeforeDebt as number;
    const after = r.year1.breakEvenOccupancyAfterDebt as number;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo((1_200 + r.years[0]!.debtService) / 12_000, 6);
  });

  it('repays the outstanding balance out of the sale proceeds', () => {
    const r = levered();
    expect(r.exit.debtRemaining).toBeGreaterThan(0);
    expect(r.exit.netSaleProceeds).toBeCloseTo(200_000 - r.exit.debtRemaining, 6);
  });

  it('builds an unlevered series that ignores the loan entirely', () => {
    const r = levered();
    expect(r.unleveredCashFlows[0]).toBeCloseTo(-220_000, 6);
    expect(r.unleveredCashFlows[1]).toBeCloseTo(10_800, 6);
  });

  it('amplifies returns when the property out-earns the debt', () => {
    const inputs = baseInputs();
    const unlevered = runProjection(inputs).leveredIRR.value as number;
    const withDebt = levered().leveredIRR.value as number;
    // NOI yield on cost (4.9%) exceeds the 3% borrowing rate, so leverage adds.
    expect(withDebt).toBeGreaterThan(unlevered);
  });
});

describe('runProjection - missing data is never invented', () => {
  it('reports nulls and a warning when rent is unknown', () => {
    const inputs = baseInputs();
    inputs.rental.monthlyRent = null;
    const r = runProjection(inputs);
    expect(r.year1.noi).toBeNull();
    expect(r.year1.netYieldOnTotalCost).toBeNull();
    expect(r.leveredIRR.value).toBeNull();
    expect(r.npv).toBeNull();
    expect(r.notes.map((n) => n.code)).toContain('IRR_UNAVAILABLE');
  });

  it('reports a warning when no discount rate is set', () => {
    const inputs = baseInputs();
    inputs.settings.discountRate = null;
    const r = runProjection(inputs);
    expect(r.npv).toBeNull();
    expect(r.notes.map((n) => n.code)).toContain('DISCOUNT_RATE_MISSING');
  });

  it('warns when financing is on but incomplete, and stays unlevered', () => {
    const inputs = baseInputs();
    inputs.financing = { ...inputs.financing, enabled: true, ltv: null, loanAmount: null };
    const r = runProjection(inputs);
    expect(r.notes.map((n) => n.code)).toContain('FINANCING_INCOMPLETE');
    expect(r.equityInvested).toBeCloseTo(220_000, 6);
  });

  it('leaves occupancy unknown rather than assuming a full year', () => {
    const inputs = baseInputs();
    inputs.rental.vacancyDaysPerYear = null;
    const r = runProjection(inputs);
    expect(r.years[0]?.rental.occupancy).toBeNull();
    expect(r.year1.noi).toBeNull();
  });
});

describe('runProjection - taxation', () => {
  it('applies a flat tax on collected rent without touching NOI', () => {
    const inputs = baseInputs();
    inputs.incomeTax = { mode: 'FLAT_ON_GROSS', rate: 0.21, interestDeductible: false };
    const r = runProjection(inputs);
    expect(r.year1.noi).toBeCloseTo(10_800, 6); // NOI is pre-tax by definition
    expect(r.years[0]?.incomeTax).toBeCloseTo(12_000 * 0.21, 6);
    expect(r.year1.afterTaxCashFlow).toBeCloseTo(10_800 - 2_520, 6);
  });

  it('exempts the capital gain after the exemption period', () => {
    const inputs = baseInputs();
    inputs.exit.priceGrowthRate = 0.03;
    inputs.exit.capitalGainsTaxRate = 0.26;
    inputs.exit.capitalGainsExemptAfterYears = 5;
    const r = runProjection(inputs); // 10-year hold
    expect(r.exit.capitalGainsExempt).toBe(true);
    expect(r.exit.capitalGainsTax).toBe(0);
  });

  it('taxes the gain when sold inside the exemption period', () => {
    const inputs = baseInputs();
    inputs.exit.holdingPeriodYears = 3;
    inputs.exit.priceGrowthRate = 0.1; // a large gain, to clear the cost basis
    inputs.exit.capitalGainsTaxRate = 0.26;
    inputs.exit.capitalGainsExemptAfterYears = 5;
    const r = runProjection(inputs);
    expect(r.exit.capitalGainsExempt).toBe(false);
    expect(r.exit.capitalGainsTax).toBeGreaterThan(0);
    // Gain is measured against total acquisition cost, not the bare price.
    expect(r.exit.capitalGain).toBeCloseTo(
      (r.exit.netSalePrice as number) - 220_000,
      6,
    );
  });

  it('does not tax a loss', () => {
    const inputs = baseInputs();
    inputs.exit.priceGrowthRate = -0.05;
    inputs.exit.capitalGainsTaxRate = 0.26;
    inputs.exit.capitalGainsExemptAfterYears = null;
    const r = runProjection(inputs);
    expect(r.exit.capitalGain).toBeLessThan(0);
    expect(r.exit.capitalGainsTax).toBe(0);
  });
});

describe('runProjection - stabilisation period', () => {
  it('lowers year-1 income and the IRR when the flat is empty during works', () => {
    const withoutWorks = runProjection(baseInputs());
    const inputs = baseInputs();
    inputs.rental.stabilizationMonths = 6;
    const withWorks = runProjection(inputs);

    expect(withWorks.year1.grossPotentialRent).toBe(6_000);
    expect(withWorks.years[1]?.rental.grossPotentialRent).toBe(12_000);
    expect(withWorks.leveredIRR.value as number).toBeLessThan(
      withoutWorks.leveredIRR.value as number,
    );
  });
});
