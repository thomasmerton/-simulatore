import { describe, expect, it } from 'vitest';
import { NO_SHOCKS, applyShocks, defaultScenarios, runScenario, runScenarios } from '../scenario';
import { runProjection } from '../projection';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { PropertyInputs, Scenario } from '@/domain/types';

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
      rateType: 'VARIABLE',
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

const scenario = (name: string, shocks: Partial<Scenario['shocks']>): Scenario => ({
  id: name,
  name,
  builtIn: false,
  description: '',
  shocks: { ...NO_SHOCKS, ...shocks },
});

describe('applyShocks', () => {
  it('does not mutate the original inputs', () => {
    const inputs = baseInputs();
    applyShocks(inputs, { ...NO_SHOCKS, rentDelta: -0.5 });
    expect(inputs.rental.monthlyRent).toBe(1_000);
  });

  it('scales rent and costs multiplicatively', () => {
    const out = applyShocks(baseInputs(), {
      ...NO_SHOCKS,
      rentDelta: -0.1,
      maintenanceDelta: 0.2,
      otherOperatingDelta: 0.2,
    });
    expect(out.rental.monthlyRent).toBeCloseTo(900, 8);
    expect(out.rental.condoFees).toBeCloseTo(1_440, 8);
    expect(out.rental.capexReserve).toBeCloseTo(720, 8);
  });

  it('routes each expense shock to exactly the inputs it names', () => {
    // The maintenance shock must not touch condo fees, and vice versa:
    // a shock that quietly moved neighbouring inputs would make a scenario
    // impossible to reason about.
    const maintenanceOnly = applyShocks(baseInputs(), { ...NO_SHOCKS, maintenanceDelta: 0.5 });
    expect(maintenanceOnly.rental.capexReserve).toBeCloseTo(900, 8);
    expect(maintenanceOnly.rental.condoFees).toBeCloseTo(1_200, 8);

    const otherOnly = applyShocks(baseInputs(), { ...NO_SHOCKS, otherOperatingDelta: 0.5 });
    expect(otherOnly.rental.condoFees).toBeCloseTo(1_800, 8);
    expect(otherOnly.rental.capexReserve).toBeCloseTo(600, 8);
  });

  it('clamps rate shocks into [0, 1] rather than producing an impossible rate', () => {
    const inputs = baseInputs();
    inputs.rental.managementFeeRate = 0.08;
    const out = applyShocks(inputs, { ...NO_SHOCKS, managementDelta: 50 });
    expect(out.rental.managementFeeRate).toBe(1);

    const floored = applyShocks(inputs, { ...NO_SHOCKS, managementDelta: -50 });
    expect(floored.rental.managementFeeRate).toBe(0);
  });

  it('shifts growth rates additively', () => {
    const out = applyShocks(baseInputs(), {
      ...NO_SHOCKS,
      rentGrowthDelta: -0.01,
      priceGrowthDelta: -0.02,
    });
    expect(out.rental.rentGrowthRate).toBeCloseTo(0, 10);
    expect(out.exit.priceGrowthRate).toBeCloseTo(-0.01, 10);
  });

  it('caps vacancy at a full year', () => {
    const out = applyShocks(baseInputs(), { ...NO_SHOCKS, vacancyDelta: 100 });
    expect(out.rental.vacancyDaysPerYear).toBe(365);
  });

  it('leaves a missing input missing rather than shocking it into existence', () => {
    const inputs = baseInputs();
    inputs.rental.monthlyRent = null;
    const out = applyShocks(inputs, { ...NO_SHOCKS, rentDelta: -0.1 });
    expect(out.rental.monthlyRent).toBeNull();
  });
});

describe('shock direction', () => {
  const base = runProjection(baseInputs()).leveredIRR.value as number;

  it('a market value fall WORSENS returns', () => {
    const r = runScenario(baseInputs(), scenario('crash', { marketValueDelta: -0.15 }));
    expect(r.projection.leveredIRR.value as number).toBeLessThan(base);
  });

  it('a cheaper purchase price IMPROVES returns', () => {
    const r = runScenario(baseInputs(), scenario('bargain', { purchasePriceDelta: -0.15 }));
    expect(r.projection.leveredIRR.value as number).toBeGreaterThan(base);
  });

  it('lower rent worsens returns', () => {
    const r = runScenario(baseInputs(), scenario('soft', { rentDelta: -0.1 }));
    expect(r.projection.leveredIRR.value as number).toBeLessThan(base);
  });

  it('more vacancy worsens cash flow', () => {
    const r = runScenario(baseInputs(), scenario('voids', { vacancyDelta: 1 }));
    expect(r.projection.year1.afterTaxCashFlow as number).toBeLessThan(
      runProjection(baseInputs()).year1.afterTaxCashFlow as number,
    );
  });

  it('higher operating costs worsen NOI', () => {
    const r = runScenario(
      baseInputs(),
      scenario('costs', { otherOperatingDelta: 0.4, propertyTaxDelta: 0.4 }),
    );
    expect(r.projection.year1.noi as number).toBeLessThan(
      runProjection(baseInputs()).year1.noi as number,
    );
  });

  it('a capex shock leaves NOI alone but worsens cash flow', () => {
    // The reserve sits BELOW NOI by design, so a maintenance shock that only
    // moves the reserve must not move NOI.
    const base = runProjection(baseInputs());
    const r = runScenario(baseInputs(), scenario('capex', { maintenanceDelta: 1 }));
    expect(r.projection.year1.noi as number).toBeLessThanOrEqual(base.year1.noi as number);
    expect(r.projection.year1.afterTaxCashFlow as number).toBeLessThan(
      base.year1.afterTaxCashFlow as number,
    );
  });
});

describe('interest rate shocks respect the rate type', () => {
  it('raises debt service on a variable-rate loan', () => {
    const r = runScenario(baseInputs(), scenario('rates', { interestRateDelta: 0.02 }));
    expect(r.projection.years[0]!.debtService).toBeGreaterThan(
      runProjection(baseInputs()).years[0]!.debtService,
    );
  });

  it('leaves a fixed-rate loan unchanged and says so', () => {
    const inputs = baseInputs();
    inputs.financing.rateType = 'FIXED';
    const r = runScenario(inputs, scenario('rates', { interestRateDelta: 0.02 }));
    expect(r.projection.years[0]!.debtService).toBeCloseTo(
      runProjection(inputs).years[0]!.debtService,
      6,
    );
    expect(r.projection.notes.map((n) => n.code)).toContain('RATE_SHOCK_NOT_APPLIED');
  });
});

describe('defaultScenarios', () => {
  const scenarios = defaultScenarios();

  it('ships base, downside, severe and upside', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['base', 'downside', 'severe', 'upside']);
  });

  it('leaves the base case unshocked', () => {
    expect(scenarios[0]!.shocks).toEqual(NO_SHOCKS);
  });

  it('orders outcomes severe < downside < base < upside', () => {
    const results = runScenarios(baseInputs(), scenarios);
    const irr = (id: string) =>
      results.find((r) => r.scenario.id === id)!.projection.leveredIRR.value as number;
    expect(irr('severe')).toBeLessThan(irr('downside'));
    expect(irr('downside')).toBeLessThan(irr('base'));
    expect(irr('base')).toBeLessThan(irr('upside'));
  });

  it('matches the unshocked projection for the base case', () => {
    const results = runScenarios(baseInputs(), scenarios);
    expect(results[0]!.projection.leveredIRR.value).toBeCloseTo(
      runProjection(baseInputs()).leveredIRR.value as number,
      10,
    );
  });
});
