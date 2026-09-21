/**
 * Data source layer.
 *
 *   DataSource -> Normalization -> MarketData -> Analysis Engine -> UI
 *
 * No provider is implemented in the MVP, because no real feed is wired up yet
 * and inventing one would defeat the point. What exists is the contract every
 * future provider must satisfy, plus a normaliser that refuses to emit a
 * metric without a source, a timestamp, a geographic scope, a unit, a
 * confidence level and a methodology.
 *
 * Adding a provider means implementing `MarketDataProvider` and registering
 * it. Nothing downstream changes.
 */

import type {
  DataSourceRef,
  Market,
  MarketMetric,
  MarketMetricKey,
} from '@/domain/types';

/** A single observation as it arrives from a provider, before normalisation. */
export interface RawObservation {
  metric: MarketMetricKey;
  value: number | null;
  unit: string;
  /** Units the normaliser knows how to convert from. */
  observedAt: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  note?: string;
}

export interface RawMarketPayload {
  marketName: string;
  country: string;
  district: string | null;
  geographicScope: string;
  source: string;
  methodology: string;
  url?: string;
  observations: RawObservation[];
}

export interface ProviderQuery {
  city: string;
  district?: string | null;
  country?: string;
}

/** The contract a real data feed must satisfy. */
export interface MarketDataProvider {
  readonly id: string;
  readonly name: string;
  /** Human-readable statement of what this source covers and how. */
  readonly methodology: string;
  /** Returns null when the source has no data for the query. Never guesses. */
  fetchMarket(query: ProviderQuery): Promise<RawMarketPayload | null>;
}

/* ------------------------------------------------------------------ *
 * Unit normalisation
 * ------------------------------------------------------------------ */

/**
 * Canonical unit for each metric. A provider reporting something else must be
 * converted here, or the observation is rejected — silently mixing €/m²/year
 * with €/m²/month is exactly the kind of error that produces a yield twelve
 * times too large.
 */
export const CANONICAL_UNITS: Record<MarketMetricKey, string> = {
  avgPricePerSqm: 'EUR/sqm',
  avgRentPerSqmMonth: 'EUR/sqm/month',
  grossRentalYield: 'ratio',
  vacancyRate: 'ratio',
  priceGrowth5y: 'ratio',
  rentGrowth5y: 'ratio',
  population: 'people',
  populationGrowth5y: 'ratio',
  universityStudents: 'people',
  touristArrivalsPerYear: 'arrivals/year',
  rentalDemandIndex: 'index',
  avgDaysOnMarket: 'days',
  transactionsPerYear: 'transactions/year',
  buyTransactionCostRate: 'ratio',
  sellTransactionCostRate: 'ratio',
  rentalIncomeTaxRate: 'ratio',
};

export const METRIC_LABELS: Record<MarketMetricKey, string> = {
  avgPricePerSqm: 'Average price €/m²',
  avgRentPerSqmMonth: 'Average rent €/m²/month',
  grossRentalYield: 'Gross rental yield',
  vacancyRate: 'Vacancy rate',
  priceGrowth5y: 'Price growth (5y, annualised)',
  rentGrowth5y: 'Rent growth (5y, annualised)',
  population: 'Population',
  populationGrowth5y: 'Population growth (5y)',
  universityStudents: 'University students',
  touristArrivalsPerYear: 'Tourist arrivals per year',
  rentalDemandIndex: 'Rental demand index',
  avgDaysOnMarket: 'Average days on market',
  transactionsPerYear: 'Transactions per year',
  buyTransactionCostRate: 'Buying transaction costs',
  sellTransactionCostRate: 'Selling transaction costs',
  rentalIncomeTaxRate: 'Rental income tax rate',
};

/** Metrics rendered as percentages in the UI. */
export const RATIO_METRICS: MarketMetricKey[] = (
  Object.keys(CANONICAL_UNITS) as MarketMetricKey[]
).filter((k) => CANONICAL_UNITS[k] === 'ratio');

type Converter = (value: number) => number;

/** Conversions the normaliser accepts, keyed by `from -> to`. */
const CONVERSIONS: Record<string, Converter> = {
  'percent->ratio': (v) => v / 100,
  'ratio->ratio': (v) => v,
  'EUR/sqm/year->EUR/sqm/month': (v) => v / 12,
  'EUR/sqm/month->EUR/sqm/month': (v) => v,
  'EUR/sqm->EUR/sqm': (v) => v,
};

export interface NormalizationIssue {
  metric: MarketMetricKey;
  reason: string;
}

export interface NormalizationResult {
  metrics: Partial<Record<MarketMetricKey, MarketMetric>>;
  /** Observations that were rejected, with the reason. Surfaced, not hidden. */
  issues: NormalizationIssue[];
}

/**
 * Normalise a raw provider payload into canonical market metrics.
 *
 * An observation is dropped — and the reason recorded — when its unit cannot
 * be converted to the canonical unit. Dropping is the safe failure: a market
 * metric that is absent shows as "Data unavailable", whereas a mis-scaled one
 * silently corrupts every comparison built on it.
 */
export function normalizeMarketPayload(payload: RawMarketPayload): NormalizationResult {
  const importedAt = new Date().toISOString();
  const metrics: Partial<Record<MarketMetricKey, MarketMetric>> = {};
  const issues: NormalizationIssue[] = [];

  for (const observation of payload.observations) {
    const canonical = CANONICAL_UNITS[observation.metric];
    if (!canonical) {
      issues.push({ metric: observation.metric, reason: 'Unknown metric' });
      continue;
    }

    if (observation.value === null || !Number.isFinite(observation.value)) {
      // Recorded explicitly as unavailable rather than omitted, so the UI can
      // distinguish "the source has no figure" from "we never asked".
      metrics[observation.metric] = {
        value: null,
        unit: canonical,
        provenance: 'MISSING',
        confidence: null,
        sourceRef: null,
      };
      continue;
    }

    const converter = CONVERSIONS[`${observation.unit}->${canonical}`];
    if (!converter) {
      issues.push({
        metric: observation.metric,
        reason: `Cannot convert "${observation.unit}" to "${canonical}"`,
      });
      continue;
    }

    const sourceRef: DataSourceRef = {
      source: payload.source,
      observedAt: observation.observedAt,
      importedAt,
      geographicScope: payload.geographicScope,
      methodology: payload.methodology,
      url: payload.url ?? null,
      kind: 'IMPORTED',
    };

    metrics[observation.metric] = {
      value: converter(observation.value),
      unit: canonical,
      provenance: 'VERIFIED',
      confidence: observation.confidence ?? null,
      sourceRef,
    };
  }

  return { metrics, issues };
}

/** A metric the user typed in by hand. */
export function manualMetric(value: number | null, metric: MarketMetricKey): MarketMetric {
  return {
    value,
    unit: CANONICAL_UNITS[metric],
    provenance: value === null ? 'MISSING' : 'USER_INPUT',
    confidence: null,
    sourceRef: {
      source: 'Manual entry',
      observedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
      geographicScope: 'user-defined',
      methodology: 'Entered by the user.',
      url: null,
      kind: 'MANUAL',
    },
  };
}

/** True when any metric in the market came from the illustrative dataset. */
export function marketContainsExampleData(market: Market): boolean {
  return Object.values(market.metrics).some((m) => m?.sourceRef?.kind === 'EXAMPLE');
}

/**
 * Derive gross rental yield from price and rent when the source does not
 * publish it directly.
 *
 *   yield = (rent €/m²/month x 12) / price €/m²
 *
 * The result is flagged ESTIMATED, never VERIFIED: it is our arithmetic on
 * someone else's numbers, and averaging a ratio of averages is not the same
 * as averaging the ratio.
 */
export function deriveGrossYield(market: Market): MarketMetric | null {
  const price = market.metrics.avgPricePerSqm;
  const rent = market.metrics.avgRentPerSqmMonth;
  if (!price?.value || !rent?.value || price.value <= 0) return null;
  return {
    value: (rent.value * 12) / price.value,
    unit: 'ratio',
    provenance: 'ESTIMATED',
    confidence: 'LOW',
    sourceRef: {
      source: 'Derived',
      observedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
      geographicScope: 'derived',
      methodology:
        'Average monthly rent per m² x 12, divided by average price per m². A ratio of two averages, which is not the average of the ratio.',
      url: null,
      kind: 'MANUAL',
    },
  };
}
