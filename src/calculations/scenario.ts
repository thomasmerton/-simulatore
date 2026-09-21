/**
 * Scenario engine.
 *
 * A scenario is a set of shocks applied to the base inputs, not a separate
 * copy of them. Editing the base case therefore flows through every scenario
 * automatically — which is what an investor expects and what a copy-based
 * design silently gets wrong.
 *
 * Shock semantics (all user-editable):
 *   purchasePriceDelta  multiplicative on the price PAID. Negative => cheaper
 *                       entry, which IMPROVES returns.
 *   marketValueDelta    multiplicative on the property's market VALUE through
 *                       the hold. Negative => a correction, which WORSENS
 *                       returns. This is what "prices fall 15%" means.
 *   rentDelta           multiplicative on monthly rent
 *   vacancyDelta        multiplicative on vacancy DAYS (+0.5 => 50% more empty days)
 *   operatingCostDelta  multiplicative on every recurring cost and the reserve
 *   interestRateDelta   ADDITIVE, in decimal (+0.02 = +200bps). Variable-rate debt only.
 *   priceGrowthDelta    ADDITIVE on the annual growth rate
 *   rentGrowthDelta     ADDITIVE on the annual rent growth rate
 */

import type { PropertyInputs, Scenario, ScenarioShocks } from '@/domain/types';
import { runProjection, type ProjectionResult } from './projection';
import { isFiniteNumber } from './finance';

export const NO_SHOCKS: ScenarioShocks = {
  purchasePriceDelta: 0,
  marketValueDelta: 0,
  rentDelta: 0,
  vacancyDelta: 0,
  operatingCostDelta: 0,
  interestRateDelta: 0,
  priceGrowthDelta: 0,
  rentGrowthDelta: 0,
};

const scale = (value: number | null, delta: number): number | null =>
  isFiniteNumber(value) ? value * (1 + delta) : null;

const shift = (value: number | null, delta: number): number | null =>
  isFiniteNumber(value) ? value + delta : null;

/** Apply shocks to a copy of the inputs. Pure: the original is untouched. */
export function applyShocks(inputs: PropertyInputs, shocks: ScenarioShocks): PropertyInputs {
  const { facts, rental, exit } = inputs;

  const shockedPrice = scale(facts.purchasePrice ?? facts.askingPrice, shocks.purchasePriceDelta);

  return {
    ...inputs,
    facts: { ...facts, purchasePrice: shockedPrice },
    rental: {
      ...rental,
      monthlyRent: scale(rental.monthlyRent, shocks.rentDelta),
      // Vacancy days cannot exceed a full year.
      vacancyDaysPerYear: isFiniteNumber(rental.vacancyDaysPerYear)
        ? Math.min(365, rental.vacancyDaysPerYear * (1 + shocks.vacancyDelta))
        : null,
      rentGrowthRate: shift(rental.rentGrowthRate, shocks.rentGrowthDelta),
      condoFees: scale(rental.condoFees, shocks.operatingCostDelta),
      propertyTax: scale(rental.propertyTax, shocks.operatingCostDelta),
      insurance: scale(rental.insurance, shocks.operatingCostDelta),
      ordinaryMaintenance: scale(rental.ordinaryMaintenance, shocks.operatingCostDelta),
      capexReserve: scale(rental.capexReserve, shocks.operatingCostDelta),
      otherOperatingCosts: scale(rental.otherOperatingCosts, shocks.operatingCostDelta),
    },
    exit: { ...exit, priceGrowthRate: shift(exit.priceGrowthRate, shocks.priceGrowthDelta) },
  };
}

export interface ScenarioResult {
  scenario: Scenario;
  inputs: PropertyInputs;
  projection: ProjectionResult;
}

export function runScenario(inputs: PropertyInputs, scenario: Scenario): ScenarioResult {
  const shocked = applyShocks(inputs, scenario.shocks);
  return {
    scenario,
    inputs: shocked,
    projection: runProjection(shocked, {
      rateShock: scenario.shocks.interestRateDelta,
      valueMultiplier: 1 + scenario.shocks.marketValueDelta,
    }),
  };
}

export function runScenarios(inputs: PropertyInputs, scenarios: Scenario[]): ScenarioResult[] {
  return scenarios.map((s) => runScenario(inputs, s));
}

/**
 * Default scenario set.
 *
 * These are STARTING POINTS, not forecasts. Every value is editable and is
 * flagged in the UI as a model assumption. They are calibrated to be
 * recognisable stress levels (a ~15% correction, a ~30% correction) rather
 * than to any particular market's history.
 */
export function defaultScenarios(): Scenario[] {
  return [
    {
      id: 'base',
      name: 'Base',
      builtIn: true,
      description: 'Your central assumptions, unshocked.',
      shocks: { ...NO_SHOCKS },
    },
    {
      id: 'downside',
      name: 'Downside',
      builtIn: true,
      description: 'A moderate correction: softer prices and rents, more voids, higher costs and rates.',
      shocks: {
        purchasePriceDelta: 0,
        marketValueDelta: -0.15,
        rentDelta: -0.1,
        vacancyDelta: 0.5,
        operatingCostDelta: 0.2,
        interestRateDelta: 0.02,
        priceGrowthDelta: -0.01,
        rentGrowthDelta: -0.01,
      },
    },
    {
      id: 'severe',
      name: 'Severe downside',
      builtIn: true,
      description: 'A deep correction with a prolonged letting problem.',
      shocks: {
        purchasePriceDelta: 0,
        marketValueDelta: -0.3,
        rentDelta: -0.15,
        vacancyDelta: 1.5,
        operatingCostDelta: 0.4,
        interestRateDelta: 0.03,
        priceGrowthDelta: -0.02,
        rentGrowthDelta: -0.02,
      },
    },
    {
      id: 'upside',
      name: 'Upside',
      builtIn: true,
      description: 'Stronger rents and values with a tighter letting market.',
      shocks: {
        purchasePriceDelta: 0,
        marketValueDelta: 0.2,
        rentDelta: 0.15,
        vacancyDelta: -0.5,
        operatingCostDelta: 0,
        interestRateDelta: 0,
        priceGrowthDelta: 0.01,
        rentGrowthDelta: 0.01,
      },
    },
  ];
}
