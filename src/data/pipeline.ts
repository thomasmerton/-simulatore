/**
 * The market data pipeline.
 *
 *   Provider  ->  Normalizer  ->  Validator  ->  MarketData  ->  Engine  ->  UI
 *
 * Each stage can REJECT. Nothing is silently repaired, and a rejection is
 * always reported with its reason rather than swallowed — a market that is
 * missing a metric shows "Data unavailable", which is a usable answer; a
 * market showing a silently mis-scaled metric is worse than useless.
 *
 * No real provider is wired up. Connecting one means implementing
 * `MarketDataProvider` and registering it; every stage below is already in
 * place and nothing downstream changes.
 */

import type { Confidence, DataPoint, DataSourceRef, Geography, Period } from '@/domain/datapoint';
import { periodAgeMonths } from '@/domain/datapoint';
import type { Unit } from '@/domain/units';
import { convertValue, formatUnit, validateUnit } from '@/domain/units';
import type { MarketMetricKey } from '@/domain/types';
import { CANONICAL_UNITS, METRIC_LABELS } from './metrics';

/* ------------------------------------------------------------------ *
 * Stage 1 — Provider
 * ------------------------------------------------------------------ */

/** A single observation exactly as a provider reports it, before any work. */
export interface RawObservation {
  metric: MarketMetricKey;
  value: number | null;
  /** The provider's own unit. Structured, so ambiguity is caught here. */
  unit: Unit;
  currency: string | null;
  period: Period;
  confidence: Confidence;
  /** Per-observation methodology, when it differs from the payload's. */
  methodology?: string;
}

export interface RawMarketPayload {
  marketName: string;
  geography: Geography;
  source: string;
  sourceUrl: string | null;
  methodology: string;
  observations: RawObservation[];
}

export interface ProviderQuery {
  country: string;
  city: string;
  neighborhood?: string | null;
}

/**
 * The contract a real feed must satisfy.
 *
 * `fetchMarket` returns null when the source simply has no data for the query.
 * That is a legitimate answer and must not be confused with an error.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly name: string;
  /** What this source covers and how it measures it. Shown in the UI. */
  readonly methodology: string;
  readonly sourceUrl: string | null;
  fetchMarket(query: ProviderQuery): Promise<RawMarketPayload | null>;
}

/* ------------------------------------------------------------------ *
 * Rejections
 * ------------------------------------------------------------------ */

export type RejectionStage = 'NORMALIZE' | 'VALIDATE';

export interface Rejection {
  stage: RejectionStage;
  metric: MarketMetricKey;
  metricLabel: string;
  reason: string;
}

export interface PipelineResult {
  accepted: Partial<Record<MarketMetricKey, DataPoint>>;
  rejected: Rejection[];
}

/* ------------------------------------------------------------------ *
 * Stage 2 — Normalizer
 *
 * Converts each observation to the metric's canonical unit, or rejects it.
 * The only conversions permitted are scale changes on the same dimension
 * (monthly <-> annual rent). A difference of dimension, price basis, money
 * basis or currency is a rejection, never a correction.
 * ------------------------------------------------------------------ */

export function normalizeObservation(
  observation: RawObservation,
  payload: RawMarketPayload,
  retrievedAt: string,
): { ok: true; point: DataPoint } | { ok: false; reason: string } {
  const canonical = CANONICAL_UNITS[observation.metric];
  if (!canonical) {
    return { ok: false, reason: `Unknown metric "${observation.metric}".` };
  }

  const unitCheck = validateUnit(observation.unit);
  if (!unitCheck.ok) return { ok: false, reason: unitCheck.reason };

  const source: DataSourceRef = {
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    retrievedAt,
    methodology: observation.methodology ?? payload.methodology,
    kind: 'IMPORTED',
  };

  // A null value is a real answer from the source: "we have no figure". It is
  // recorded as MISSING rather than dropped, so the UI can tell "the source
  // has no figure" apart from "we never asked".
  if (observation.value === null || !Number.isFinite(observation.value)) {
    return {
      ok: true,
      point: {
        value: null,
        unit: canonical.unit,
        currency: observation.currency,
        geography: payload.geography,
        period: observation.period,
        source,
        confidence: observation.confidence,
        dataClass: 'MISSING',
      },
    };
  }

  const converted = convertValue(observation.value, observation.unit, canonical.unit);
  if (!converted.ok) {
    return {
      ok: false,
      reason: `${converted.reason} Source reported ${formatUnit(observation.unit, observation.currency)}; this metric is stored as ${formatUnit(canonical.unit, observation.currency)}.`,
    };
  }

  return {
    ok: true,
    point: {
      value: converted.value,
      unit: canonical.unit,
      currency: observation.currency,
      geography: payload.geography,
      period: observation.period,
      source: {
        ...source,
        methodology: converted.note
          ? `${source.methodology} [${converted.note}]`
          : source.methodology,
      },
      confidence: observation.confidence,
      dataClass: 'RAW_DATA',
    },
  };
}

/* ------------------------------------------------------------------ *
 * Stage 3 — Validator
 *
 * Range and coherence checks on an already-normalised point. The normalizer
 * asks "is this the right kind of number?"; the validator asks "is this a
 * possible number?". A ratio of 45 is almost certainly a percentage that was
 * labelled as a ratio, and accepting it would corrupt every comparison.
 * ------------------------------------------------------------------ */

/** Plausible bounds per metric. Outside them, the datum is rejected. */
export const METRIC_BOUNDS: Partial<Record<MarketMetricKey, { min: number; max: number }>> = {
  avgPricePerSqm: { min: 1, max: 10_000_000 },
  avgRentPerSqmMonth: { min: 0.01, max: 100_000 },
  grossRentalYield: { min: 0, max: 1 },
  vacancyRate: { min: 0, max: 1 },
  priceGrowth5y: { min: -0.5, max: 0.5 },
  rentGrowth5y: { min: -0.5, max: 0.5 },
  population: { min: 0, max: 50_000_000 },
  populationGrowth5y: { min: -0.5, max: 0.5 },
  universityStudents: { min: 0, max: 5_000_000 },
  touristArrivalsPerYear: { min: 0, max: 500_000_000 },
  avgDaysOnMarket: { min: 0, max: 3_650 },
  transactionsPerYear: { min: 0, max: 10_000_000 },
  buyTransactionCostRate: { min: 0, max: 0.5 },
  sellTransactionCostRate: { min: 0, max: 0.5 },
  rentalIncomeTaxRate: { min: 0, max: 1 },
  mortgageRateNominal: { min: 0, max: 0.3 },
  mortgageRateAprc: { min: 0, max: 0.3 },
};

/** Reject a reporting period that ends in the future or is inverted. */
function validatePeriod(period: Period): string | null {
  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return `Reporting period "${period.label}" has unparseable dates.`;
  }
  if (to < from) return `Reporting period "${period.label}" ends before it starts.`;
  const age = periodAgeMonths(period);
  if (age !== null && age < -1) {
    return `Reporting period "${period.label}" ends in the future.`;
  }
  return null;
}

export function validatePoint(
  metric: MarketMetricKey,
  point: DataPoint,
): { ok: true } | { ok: false; reason: string } {
  const periodProblem = validatePeriod(point.period);
  if (periodProblem) return { ok: false, reason: periodProblem };

  const canonical = CANONICAL_UNITS[metric];
  if (canonical.requiresCurrency && !point.currency) {
    return {
      ok: false,
      reason: `${METRIC_LABELS[metric]} is a money figure and must carry a currency. Without one it cannot be compared with anything.`,
    };
  }

  if (point.value === null) return { ok: true };

  const bounds = METRIC_BOUNDS[metric];
  if (bounds && (point.value < bounds.min || point.value > bounds.max)) {
    return {
      ok: false,
      reason: `Value ${point.value} is outside the plausible range [${bounds.min}, ${bounds.max}] for ${METRIC_LABELS[metric]}. This usually means a unit was mislabelled — a ratio reported as a percentage, for example. The figure is rejected rather than rescaled.`,
    };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The pipeline
 * ------------------------------------------------------------------ */

export function runPipeline(
  payload: RawMarketPayload,
  retrievedAt: string = new Date().toISOString(),
): PipelineResult {
  const accepted: Partial<Record<MarketMetricKey, DataPoint>> = {};
  const rejected: Rejection[] = [];

  for (const observation of payload.observations) {
    const label = METRIC_LABELS[observation.metric] ?? observation.metric;

    const normalized = normalizeObservation(observation, payload, retrievedAt);
    if (!normalized.ok) {
      rejected.push({
        stage: 'NORMALIZE',
        metric: observation.metric,
        metricLabel: label,
        reason: normalized.reason,
      });
      continue;
    }

    const validated = validatePoint(observation.metric, normalized.point);
    if (!validated.ok) {
      rejected.push({
        stage: 'VALIDATE',
        metric: observation.metric,
        metricLabel: label,
        reason: validated.reason,
      });
      continue;
    }

    accepted[observation.metric] = normalized.point;
  }

  return { accepted, rejected };
}
