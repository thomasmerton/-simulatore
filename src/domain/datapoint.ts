/**
 * The external datum.
 *
 * Nothing enters the market layer without every one of these fields. They are
 * required, not optional-with-a-default, because a number whose period,
 * geography or source is unknown cannot be compared with anything — and a
 * comparison built on it looks exactly like a valid one.
 *
 * The UI must be able to answer, for any figure on screen: where did this come
 * from, when, for what area, over what period, measured how, and how much
 * should I trust it.
 */

import type { Provenance } from './provenance';
import type { Unit } from './units';

/** The reporting period a figure covers — not the date it was fetched. */
export interface Period {
  /** Inclusive ISO date of the start of the reporting period. */
  from: string;
  /** Inclusive ISO date of the end of the reporting period. */
  to: string;
  /** How the period is described by the publisher, e.g. "Q2 2024", "2023". */
  label: string;
}

/** Administrative scope a figure applies to. */
export interface Geography {
  country: string;
  region: string | null;
  city: string | null;
  neighborhood: string | null;
  /** The smallest level this figure actually resolves to. */
  level: 'COUNTRY' | 'REGION' | 'CITY' | 'NEIGHBORHOOD';
}

export function formatGeography(geo: Geography): string {
  return [geo.neighborhood, geo.city, geo.region, geo.country].filter(Boolean).join(', ');
}

/**
 * Confidence in a datum.
 *
 * This is the PUBLISHER's or the importer's stated confidence, recorded as
 * given. It is deliberately a small enum rather than a computed score: a
 * numeric confidence invented by this tool would be exactly the "arbitrary
 * risk number" the product refuses to produce.
 */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DataSourceRef {
  /** Publisher, e.g. "Agenzia delle Entrate — OMI". */
  source: string;
  sourceUrl: string | null;
  /** When this tool fetched it. Distinct from the period it covers. */
  retrievedAt: string;
  /** How the publisher produced the figure. Required, free text. */
  methodology: string;
  /**
   * IMPORTED  — came through a provider and the normalizer.
   * MANUAL    — typed in by the user, who is then the source.
   * EXAMPLE   — illustrative placeholder; must be flagged wherever shown.
   */
  kind: 'IMPORTED' | 'MANUAL' | 'EXAMPLE';
}

export interface DataPoint {
  value: number | null;
  unit: Unit;
  /** ISO 4217, or null for dimensionless units. No FX conversion is performed. */
  currency: string | null;
  geography: Geography;
  period: Period;
  source: DataSourceRef;
  confidence: Confidence;
  /** RAW_DATA for an imported observation, DERIVED_DATA when this tool computed it. */
  dataClass: Provenance;
}

/** Age of a datum's reporting period, in whole months, relative to `asOf`. */
export function periodAgeMonths(period: Period, asOf: Date = new Date()): number | null {
  const end = Date.parse(period.to);
  if (!Number.isFinite(end)) return null;
  const months =
    (asOf.getFullYear() - new Date(end).getFullYear()) * 12 +
    (asOf.getMonth() - new Date(end).getMonth());
  return months;
}

/** True when the datum resolves to a level at least as fine as `level`. */
export function resolvesTo(
  geo: Geography,
  level: Geography['level'],
): boolean {
  const rank: Record<Geography['level'], number> = {
    COUNTRY: 0,
    REGION: 1,
    CITY: 2,
    NEIGHBORHOOD: 3,
  };
  return rank[geo.level] >= rank[level];
}
