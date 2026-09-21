/**
 * Data-quality warnings and result confidence.
 *
 * WHY THIS EXISTS
 * "IRR = 8.17%" reads as a measurement. If it rests on an estimated rent, a
 * guessed vacancy and an assumed appreciation rate, the three-significant-
 * figure precision is a lie the arithmetic tells on the model's behalf. This
 * module's job is to make the gap between precision and confidence visible.
 *
 * THE CONFIDENCE METHODOLOGY — stated before it is used, and deliberately not
 * a weighted numeric score.
 *
 * Confidence is assigned by RULES over the classes of the inputs a metric
 * depends on, not by averaging anything:
 *
 *   LOW     the metric depends on at least one MISSING input, OR on a
 *           MODEL_ASSUMPTION for a driver the result is structurally
 *           sensitive to (appreciation, exit value, discount rate), OR more
 *           than half its inputs are MODEL_ASSUMPTIONs.
 *   MEDIUM  every input is present, but at least one is a MODEL_ASSUMPTION or
 *           DERIVED_DATA.
 *   HIGH    every input is USER_INPUT or RAW_DATA. Note what this does NOT
 *           claim: that the inputs are correct. Only that nothing was
 *           invented by the tool.
 *
 * There is no 0-100 score, because any weighting would be arbitrary and would
 * invite exactly the false precision the module exists to prevent.
 */

import type { PropertyInputs, RentalStrategy } from './types';
import type { Provenance, ProvenanceMap } from './provenance';
import { classCounts } from './provenance';
import { periodAgeMonths, type DataPoint } from './datapoint';

export type ResultConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Inputs the model is structurally most sensitive to. An assumption here
 * caps confidence at LOW however solid everything else is, because these
 * drivers dominate the answer — see the tornado on the Sensitivity page.
 */
export const CRITICAL_DRIVERS = [
  'exit.priceGrowthRate',
  'settings.discountRate',
] as const;

export interface ConfidenceAssessment {
  level: ResultConfidence;
  /** One sentence naming why it landed where it did. */
  reason: string;
  missing: string[];
  assumptions: string[];
}

export function assessConfidence(
  map: ProvenanceMap,
  paths: readonly string[],
): ConfidenceAssessment {
  const counts = classCounts(map, paths);
  const missing = paths.filter((p) => (map[p] ?? 'MISSING') === 'MISSING');
  const assumptions = paths.filter((p) => map[p] === 'MODEL_ASSUMPTION');

  if (missing.length > 0) {
    return {
      level: 'LOW',
      reason: `${missing.length} required input${missing.length === 1 ? ' is' : 's are'} missing.`,
      missing,
      assumptions,
    };
  }

  const criticalAssumptions = CRITICAL_DRIVERS.filter(
    (d) => paths.includes(d) && map[d] === 'MODEL_ASSUMPTION',
  );
  if (criticalAssumptions.length > 0) {
    return {
      level: 'LOW',
      reason:
        'The result rests on default values for inputs it is structurally most sensitive to.',
      missing,
      assumptions,
    };
  }

  if (paths.length > 0 && counts.MODEL_ASSUMPTION > paths.length / 2) {
    return {
      level: 'LOW',
      reason: 'More than half the inputs are still tool defaults rather than your own figures.',
      missing,
      assumptions,
    };
  }

  if (counts.MODEL_ASSUMPTION > 0 || counts.DERIVED_DATA > 0) {
    return {
      level: 'MEDIUM',
      reason: `${counts.MODEL_ASSUMPTION + counts.DERIVED_DATA} input${counts.MODEL_ASSUMPTION + counts.DERIVED_DATA === 1 ? ' is' : 's are'} a tool default or derived rather than observed.`,
      missing,
      assumptions,
    };
  }

  return {
    level: 'HIGH',
    reason:
      'Every input is your own figure or source data. That does not mean the figures are right — only that nothing was invented here.',
    missing,
    assumptions,
  };
}

/**
 * How many significant figures a result deserves given its confidence.
 * A LOW-confidence IRR shown as "8.17%" claims precision it does not have.
 */
export function precisionFor(level: ResultConfidence): number {
  switch (level) {
    case 'HIGH':
      return 2;
    case 'MEDIUM':
      return 1;
    case 'LOW':
      return 0;
  }
}

/* ------------------------------------------------------------------ *
 * Warnings
 * ------------------------------------------------------------------ */

export type WarningSeverity = 'INFO' | 'CAUTION' | 'SERIOUS';

export interface QualityWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
  /** The inputs or data the warning is about, for deep-linking. */
  paths: string[];
}

/** Market data older than this is flagged. */
export const STALE_DATA_MONTHS = 12;

const STRATEGY_LABELS: Record<RentalStrategy, string> = {
  LONG_TERM: 'long-term rental',
  SHORT_TERM: 'short-term rental',
  STUDENT: 'student rental',
  ROOM_BY_ROOM: 'room-by-room rental',
};

/**
 * Warnings derived from the inputs and their provenance.
 *
 * Every rule here is deterministic and traceable to a named condition. None
 * of them is a judgement about the investment.
 */
export function collectInputWarnings(
  inputs: PropertyInputs,
  map: ProvenanceMap,
  options: { taxProfileVerified?: boolean; strategyMissing?: string[] } = {},
): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  const cls = (path: string): Provenance => map[path] ?? 'MISSING';

  if (cls('rental.monthlyRent') === 'MODEL_ASSUMPTION' || cls('rental.monthlyRent') === 'DERIVED_DATA') {
    warnings.push({
      code: 'RENT_ESTIMATED',
      severity: 'SERIOUS',
      message: 'Rent is estimated, not observed. Revenue is the largest single driver of the result.',
      paths: ['rental.monthlyRent'],
    });
  }

  if (cls('rental.vacancyDaysPerYear') === 'MODEL_ASSUMPTION') {
    warnings.push({
      code: 'VACANCY_ASSUMED',
      severity: 'CAUTION',
      message: 'The vacancy assumption is a tool default, not a figure for this property or market.',
      paths: ['rental.vacancyDaysPerYear'],
    });
  }

  if (cls('exit.priceGrowthRate') === 'MODEL_ASSUMPTION') {
    warnings.push({
      code: 'EXIT_VALUE_ASSUMED',
      severity: 'SERIOUS',
      message:
        'The exit value rests on a default appreciation rate. IRR and equity multiple are highly sensitive to it.',
      paths: ['exit.priceGrowthRate'],
    });
  }

  if (cls('settings.discountRate') === 'MODEL_ASSUMPTION') {
    warnings.push({
      code: 'DISCOUNT_RATE_ASSUMED',
      severity: 'CAUTION',
      message: 'NPV uses a default discount rate. Your required return is personal to you.',
      paths: ['settings.discountRate'],
    });
  }

  const renovation = inputs.acquisition.renovationCost;
  const condition = inputs.facts.condition;
  if (
    (condition === 'TO_RENOVATE' || condition === 'TO_GUT') &&
    (renovation === null || renovation === 0)
  ) {
    warnings.push({
      code: 'RENOVATION_INCOMPLETE',
      severity: 'SERIOUS',
      message: `The property is marked "${condition === 'TO_GUT' ? 'needs gutting' : 'needs renovation'}" but the renovation budget is ${renovation === null ? 'missing' : 'zero'}.`,
      paths: ['acquisition.renovationCost'],
    });
  }

  if (
    (condition === 'TO_RENOVATE' || condition === 'TO_GUT') &&
    (inputs.rental.stabilizationMonths === null || inputs.rental.stabilizationMonths === 0)
  ) {
    warnings.push({
      code: 'NO_STABILIZATION',
      severity: 'CAUTION',
      message:
        'Works are planned but no void period is modelled, so year-1 income assumes rent from day one.',
      paths: ['rental.stabilizationMonths'],
    });
  }

  if (inputs.incomeTax.mode === 'NONE') {
    warnings.push({
      code: 'PRE_TAX_ONLY',
      severity: 'CAUTION',
      message: 'No rental income tax is modelled. Cash flow and IRR are pre-tax.',
      paths: ['incomeTax.mode'],
    });
  }

  if (options.taxProfileVerified === false) {
    warnings.push({
      code: 'TAX_UNVERIFIED',
      severity: 'SERIOUS',
      message:
        'Tax treatment has not been verified against the law for this investor. Requires professional confirmation.',
      paths: ['incomeTax.rate', 'exit.capitalGainsTaxRate', 'acquisition.purchaseTaxRate'],
    });
  }

  const strategyMissing = options.strategyMissing ?? [];
  if (strategyMissing.length > 0) {
    warnings.push({
      code: 'STRATEGY_INCOMPLETE',
      severity: 'SERIOUS',
      message: `The ${STRATEGY_LABELS[inputs.rental.strategy]} strategy is missing ${strategyMissing.length} required input${strategyMissing.length === 1 ? '' : 's'}, so revenue cannot be computed.`,
      paths: strategyMissing,
    });
  }

  if (inputs.financing.enabled && inputs.financing.amortizationType === 'INTEREST_ONLY') {
    warnings.push({
      code: 'BALLOON_RISK',
      severity: 'CAUTION',
      message:
        'The loan is interest-only, so the full principal falls due at maturity and must be repaid or refinanced.',
      paths: ['financing.amortizationType'],
    });
  }

  if (inputs.facts.marketValue !== null && inputs.facts.purchasePrice !== null) {
    const premium = inputs.facts.marketValue / inputs.facts.purchasePrice - 1;
    if (premium > 0.05) {
      warnings.push({
        code: 'VALUE_ABOVE_PRICE',
        severity: 'CAUTION',
        message: `The valuation is ${(premium * 100).toFixed(0)}% above the price paid, so the model books equity at purchase. That gain is only real if the valuation is.`,
        paths: ['facts.marketValue'],
      });
    }
  }

  return warnings;
}

/** Warnings about a market datum: staleness, scope and kind. */
export function collectDataPointWarnings(
  point: DataPoint,
  label: string,
  asOf: Date = new Date(),
): QualityWarning[] {
  const warnings: QualityWarning[] = [];

  if (point.source.kind === 'EXAMPLE') {
    warnings.push({
      code: 'EXAMPLE_DATA',
      severity: 'SERIOUS',
      message: `${label} is illustrative placeholder data, not a measurement.`,
      paths: [],
    });
    return warnings;
  }

  if (point.source.kind === 'TRANSCRIBED') {
    warnings.push({
      code: 'TRANSCRIBED_DATA',
      severity: 'CAUTION',
      message: `${label} was read off a published report, not imported from the publisher's own data service. The figure and its source are real, but the transcription is unverified — check it against the source before relying on it.`,
      paths: [],
    });
  }

  const age = periodAgeMonths(point.period, asOf);
  if (age !== null && age > STALE_DATA_MONTHS) {
    warnings.push({
      code: 'STALE_DATA',
      severity: 'CAUTION',
      message: `${label} covers a period ending ${age} months ago.`,
      paths: [],
    });
  }

  if (point.geography.level === 'COUNTRY' || point.geography.level === 'REGION') {
    warnings.push({
      code: 'COARSE_GEOGRAPHY',
      severity: 'CAUTION',
      message: `${label} is reported at ${point.geography.level.toLowerCase()} level, which can differ a lot from a specific neighbourhood.`,
      paths: [],
    });
  }

  if (point.confidence === 'LOW') {
    warnings.push({
      code: 'LOW_SOURCE_CONFIDENCE',
      severity: 'CAUTION',
      message: `The publisher rates ${label} as low confidence.`,
      paths: [],
    });
  }

  return warnings;
}

export const SEVERITY_ORDER: Record<WarningSeverity, number> = {
  SERIOUS: 0,
  CAUTION: 1,
  INFO: 2,
};

export function sortWarnings(warnings: QualityWarning[]): QualityWarning[] {
  return [...warnings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
