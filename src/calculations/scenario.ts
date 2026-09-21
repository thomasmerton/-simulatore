/**
 * Scenario engine.
 *
 * A scenario is a set of shocks applied to the base inputs, not a separate
 * copy of them. Editing the base case therefore flows through every scenario
 * automatically — which is what an investor expects and what a copy-based
 * design silently gets wrong.
 *
 * Every shock names exactly which input it moves, and the shocks are grouped
 * by the part of the deal they hit, so "what did I stress?" is answerable
 * without reading the code.
 *
 * SIGN CONVENTION, and the trap it avoids:
 *   `purchasePriceDelta` moves what you PAY — cheaper entry improves returns.
 *   `marketValueDelta`   moves what it is WORTH — a fall worsens returns.
 * Conflating the two makes a market crash print a better IRR than the base
 * case, which is how a downside scenario ends up looking like a bargain.
 */

import type {
  PropertyInputs,
  Scenario,
  ScenarioShocks,
  ShockGroup,
} from '@/domain/types';
import { runProjection, type ProjectionResult } from './projection';
import { isFiniteNumber } from './finance';

export const NO_SHOCKS: ScenarioShocks = {
  purchasePriceDelta: 0,
  renovationCostDelta: 0,
  marketValueDelta: 0,
  priceGrowthDelta: 0,
  rentDelta: 0,
  vacancyDelta: 0,
  occupancyRateDelta: 0,
  adrDelta: 0,
  rentGrowthDelta: 0,
  maintenanceDelta: 0,
  managementDelta: 0,
  propertyTaxDelta: 0,
  otherOperatingDelta: 0,
  interestRateDelta: 0,
  sellingCostsDelta: 0,
  exitTaxDelta: 0,
};

/** Multiplicative: value × (1 + delta). Leaves a missing input missing. */
const scale = (value: number | null, delta: number): number | null =>
  isFiniteNumber(value) ? value * (1 + delta) : null;

/** Additive: value + delta. Leaves a missing input missing. */
const shift = (value: number | null, delta: number): number | null =>
  isFiniteNumber(value) ? value + delta : null;

/** Additive on a rate, clamped to [0, 1]. */
const shiftRate = (value: number | null, delta: number): number | null =>
  isFiniteNumber(value) ? Math.min(1, Math.max(0, value + delta)) : null;

/** Multiplicative on a rate, clamped to [0, 1]. */
const scaleRate = (value: number | null, delta: number): number | null =>
  isFiniteNumber(value) ? Math.min(1, Math.max(0, value * (1 + delta))) : null;

/**
 * The shock catalogue: what each shock is called, which group it belongs to,
 * exactly which input it moves, and whether it is additive or multiplicative.
 * The scenario editor is generated from this, so the UI cannot drift from the
 * engine.
 */
export interface ShockSpec {
  key: keyof ScenarioShocks;
  group: ShockGroup;
  label: string;
  /** The dotted input path(s) this shock modifies. */
  targets: string[];
  mode: 'MULTIPLICATIVE' | 'ADDITIVE';
  hint: string;
}

export const SHOCK_SPECS: ShockSpec[] = [
  {
    key: 'purchasePriceDelta',
    group: 'ACQUISITION',
    label: 'Purchase price',
    targets: ['facts.purchasePrice'],
    mode: 'MULTIPLICATIVE',
    hint: 'What you pay. Negative means a better entry price, which improves returns.',
  },
  {
    key: 'renovationCostDelta',
    group: 'ACQUISITION',
    label: 'Renovation cost',
    targets: ['acquisition.renovationCost'],
    mode: 'MULTIPLICATIVE',
    hint: 'Overruns on the works budget.',
  },
  {
    key: 'marketValueDelta',
    group: 'MARKET_VALUE',
    label: 'Property value',
    targets: ['(market value through the hold)'],
    mode: 'MULTIPLICATIVE',
    hint: 'What the asset is worth. Negative means a market correction, which worsens returns.',
  },
  {
    key: 'priceGrowthDelta',
    group: 'MARKET_VALUE',
    label: 'Appreciation rate',
    targets: ['exit.priceGrowthRate'],
    mode: 'ADDITIVE',
    hint: 'Added to the annual appreciation rate, in points.',
  },
  {
    key: 'rentDelta',
    group: 'REVENUE',
    label: 'Rent',
    targets: [
      'rental.monthlyRent',
      'rental.student.monthlyRentPerRoom',
      'rental.roomByRoom.monthlyRentPerRoom',
    ],
    mode: 'MULTIPLICATIVE',
    hint: 'Long-let rent and per-room rents.',
  },
  {
    key: 'vacancyDelta',
    group: 'REVENUE',
    label: 'Vacancy (long let)',
    targets: ['rental.vacancyDaysPerYear'],
    mode: 'MULTIPLICATIVE',
    hint: '+50% means half again as many empty days.',
  },
  {
    key: 'occupancyRateDelta',
    group: 'REVENUE',
    label: 'Occupancy rate',
    targets: ['rental.shortTerm.occupancyRate', 'rental.roomByRoom.roomOccupancyRate', 'rental.student.roomOccupancyRate'],
    mode: 'MULTIPLICATIVE',
    hint: 'Short-let nights sold and room occupancy. Negative means fewer sold.',
  },
  {
    key: 'adrDelta',
    group: 'REVENUE',
    label: 'Average daily rate',
    targets: ['rental.shortTerm.averageDailyRate'],
    mode: 'MULTIPLICATIVE',
    hint: 'Short-let nightly rate.',
  },
  {
    key: 'rentGrowthDelta',
    group: 'REVENUE',
    label: 'Rent growth',
    targets: ['rental.rentGrowthRate'],
    mode: 'ADDITIVE',
    hint: 'Added to the annual rent growth rate, in points.',
  },
  {
    key: 'maintenanceDelta',
    group: 'EXPENSES',
    label: 'Maintenance & capex',
    targets: ['rental.ordinaryMaintenance', 'rental.capexReserve'],
    mode: 'MULTIPLICATIVE',
    hint: 'Ordinary maintenance and the major-works reserve.',
  },
  {
    key: 'managementDelta',
    group: 'EXPENSES',
    label: 'Management fee',
    targets: ['rental.managementFeeRate'],
    mode: 'MULTIPLICATIVE',
    hint: 'The management fee rate, not the amount.',
  },
  {
    key: 'propertyTaxDelta',
    group: 'EXPENSES',
    label: 'Property taxes',
    targets: ['rental.propertyTax'],
    mode: 'MULTIPLICATIVE',
    hint: 'Recurring property tax.',
  },
  {
    key: 'otherOperatingDelta',
    group: 'EXPENSES',
    label: 'Other operating costs',
    targets: ['rental.condoFees', 'rental.insurance', 'rental.utilities', 'rental.otherOperatingCosts'],
    mode: 'MULTIPLICATIVE',
    hint: 'Condominium fees, insurance, utilities and anything else recurring.',
  },
  {
    key: 'interestRateDelta',
    group: 'FINANCING',
    label: 'Interest rate',
    targets: ['financing.annualRate'],
    mode: 'ADDITIVE',
    hint: 'Added to the mortgage rate, in points. Applies to VARIABLE-rate loans only — a fixed-rate borrower is contractually insulated.',
  },
  {
    key: 'sellingCostsDelta',
    group: 'EXIT',
    label: 'Selling costs',
    targets: ['exit.sellingCostsRate'],
    mode: 'ADDITIVE',
    hint: 'Added to the selling cost rate, in points.',
  },
  {
    key: 'exitTaxDelta',
    group: 'EXIT',
    label: 'Exit tax',
    targets: ['exit.capitalGainsTaxRate'],
    mode: 'ADDITIVE',
    hint: 'Added to the capital gains tax rate, in points.',
  },
];

export const SHOCK_GROUP_LABELS: Record<ShockGroup, string> = {
  ACQUISITION: 'Acquisition',
  MARKET_VALUE: 'Market value',
  REVENUE: 'Revenue',
  EXPENSES: 'Expenses',
  FINANCING: 'Financing',
  EXIT: 'Exit',
};

/** Apply shocks to a copy of the inputs. Pure: the original is untouched. */
export function applyShocks(inputs: PropertyInputs, shocks: ScenarioShocks): PropertyInputs {
  const { facts, acquisition, rental, exit } = inputs;

  return {
    ...inputs,
    facts: {
      ...facts,
      purchasePrice: scale(facts.purchasePrice ?? facts.askingPrice, shocks.purchasePriceDelta),
    },
    acquisition: {
      ...acquisition,
      renovationCost: scale(acquisition.renovationCost, shocks.renovationCostDelta),
    },
    rental: {
      ...rental,
      monthlyRent: scale(rental.monthlyRent, shocks.rentDelta),
      // Vacancy days cannot exceed a full year.
      vacancyDaysPerYear: isFiniteNumber(rental.vacancyDaysPerYear)
        ? Math.min(365, Math.max(0, rental.vacancyDaysPerYear * (1 + shocks.vacancyDelta)))
        : null,
      rentGrowthRate: shift(rental.rentGrowthRate, shocks.rentGrowthDelta),
      shortTerm: {
        ...rental.shortTerm,
        averageDailyRate: scale(rental.shortTerm.averageDailyRate, shocks.adrDelta),
        occupancyRate: scaleRate(rental.shortTerm.occupancyRate, shocks.occupancyRateDelta),
      },
      student: {
        ...rental.student,
        monthlyRentPerRoom: scale(rental.student.monthlyRentPerRoom, shocks.rentDelta),
        roomOccupancyRate: scaleRate(rental.student.roomOccupancyRate, shocks.occupancyRateDelta),
      },
      roomByRoom: {
        ...rental.roomByRoom,
        monthlyRentPerRoom: scale(rental.roomByRoom.monthlyRentPerRoom, shocks.rentDelta),
        roomOccupancyRate: scaleRate(rental.roomByRoom.roomOccupancyRate, shocks.occupancyRateDelta),
      },
      ordinaryMaintenance: scale(rental.ordinaryMaintenance, shocks.maintenanceDelta),
      capexReserve: scale(rental.capexReserve, shocks.maintenanceDelta),
      managementFeeRate: scaleRate(rental.managementFeeRate, shocks.managementDelta),
      propertyTax: scale(rental.propertyTax, shocks.propertyTaxDelta),
      condoFees: scale(rental.condoFees, shocks.otherOperatingDelta),
      insurance: scale(rental.insurance, shocks.otherOperatingDelta),
      utilities: scale(rental.utilities, shocks.otherOperatingDelta),
      otherOperatingCosts: scale(rental.otherOperatingCosts, shocks.otherOperatingDelta),
    },
    exit: {
      ...exit,
      priceGrowthRate: shift(exit.priceGrowthRate, shocks.priceGrowthDelta),
      sellingCostsRate: shiftRate(exit.sellingCostsRate, shocks.sellingCostsDelta),
      capitalGainsTaxRate: shiftRate(exit.capitalGainsTaxRate, shocks.exitTaxDelta),
    },
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
 * STARTING POINTS, not forecasts. Every value is editable and is flagged in
 * the UI as a model assumption. They are calibrated to be recognisable stress
 * levels — a ~15% correction, a ~30% correction — not to any market's history.
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
      description: 'A moderate correction: softer values and revenue, more voids, higher costs and rates.',
      shocks: {
        ...NO_SHOCKS,
        marketValueDelta: -0.15,
        priceGrowthDelta: -0.01,
        rentDelta: -0.1,
        vacancyDelta: 0.5,
        occupancyRateDelta: -0.15,
        adrDelta: -0.1,
        rentGrowthDelta: -0.01,
        maintenanceDelta: 0.2,
        propertyTaxDelta: 0.1,
        otherOperatingDelta: 0.15,
        interestRateDelta: 0.02,
        sellingCostsDelta: 0.01,
      },
    },
    {
      id: 'severe',
      name: 'Severe downside',
      builtIn: true,
      description: 'A deep correction with a prolonged letting problem.',
      shocks: {
        ...NO_SHOCKS,
        marketValueDelta: -0.3,
        priceGrowthDelta: -0.02,
        rentDelta: -0.15,
        vacancyDelta: 1.5,
        occupancyRateDelta: -0.35,
        adrDelta: -0.2,
        rentGrowthDelta: -0.02,
        renovationCostDelta: 0.25,
        maintenanceDelta: 0.4,
        propertyTaxDelta: 0.2,
        otherOperatingDelta: 0.3,
        interestRateDelta: 0.03,
        sellingCostsDelta: 0.02,
      },
    },
    {
      id: 'upside',
      name: 'Upside',
      builtIn: true,
      description: 'Stronger revenue and values with a tighter letting market.',
      shocks: {
        ...NO_SHOCKS,
        marketValueDelta: 0.2,
        priceGrowthDelta: 0.01,
        rentDelta: 0.15,
        vacancyDelta: -0.5,
        occupancyRateDelta: 0.1,
        adrDelta: 0.1,
        rentGrowthDelta: 0.01,
      },
    },
  ];
}
