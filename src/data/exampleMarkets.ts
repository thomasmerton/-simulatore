/**
 * ILLUSTRATIVE MARKET DATA — NOT REAL.
 *
 * These figures exist so the market comparison screens can be exercised
 * before a real feed is connected. They are ORDER-OF-MAGNITUDE PLACEHOLDERS
 * invented for demonstration. They are not measurements, they are not
 * sourced, and they must not be used to compare actual markets.
 *
 * Every datum is stamped `kind: 'EXAMPLE'` with class MODEL_ASSUMPTION, which
 * makes the quality layer emit an EXAMPLE_DATA warning wherever it appears.
 * Loading requires an explicit user action; it never happens automatically.
 *
 * To replace: implement a `MarketDataProvider` (see data/pipeline.ts) and
 * import through `runPipeline`, which stamps real provenance.
 */

import type { DataPoint, Geography, Period } from '@/domain/datapoint';
import type { Market, MarketMetricKey } from '@/domain/types';
import { METRIC_SPECS } from './metrics';

const DISCLAIMER =
  'ILLUSTRATIVE PLACEHOLDER. Invented for demonstration, not observed or sourced. Do not use for a real comparison.';

const EXAMPLE_PERIOD: Period = {
  from: '2024-01-01',
  to: '2024-12-31',
  label: '2024 (illustrative)',
};

function examplePoint(metric: MarketMetricKey, value: number, geography: Geography): DataPoint {
  const spec = METRIC_SPECS[metric];
  return {
    value,
    unit: spec.unit,
    currency: spec.requiresCurrency ? 'EUR' : null,
    geography,
    period: EXAMPLE_PERIOD,
    source: {
      source: 'Example dataset',
      sourceUrl: null,
      retrievedAt: '2024-01-01T00:00:00.000Z',
      methodology: DISCLAIMER,
      kind: 'EXAMPLE',
    },
    confidence: 'LOW',
    dataClass: 'MODEL_ASSUMPTION',
  };
}

function build(
  id: string,
  city: string,
  country: string,
  region: string | null,
  values: Partial<Record<MarketMetricKey, number>>,
): Market {
  const geography: Geography = { country, region, city, neighborhood: null, level: 'CITY' };
  const metrics: Partial<Record<MarketMetricKey, DataPoint>> = {};
  for (const [key, value] of Object.entries(values)) {
    metrics[key as MarketMetricKey] = examplePoint(key as MarketMetricKey, value, geography);
  }
  return {
    id,
    name: city,
    geography,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    metrics,
    regulationNotes: DISCLAIMER,
    riskNotes: DISCLAIMER,
  };
}

/**
 * Deliberately incomplete: several markets are missing several metrics, so
 * the "Data unavailable" path stays visible rather than being papered over.
 */
export function exampleMarkets(): Market[] {
  return [
    build('example-laquila', "L'Aquila", 'Italy', 'Abruzzo', {
      avgPricePerSqm: 1_250,
      avgRentPerSqmMonth: 7.4,
      vacancyRate: 0.09,
      priceGrowth5y: -0.005,
      rentGrowth5y: 0.012,
      population: 69_000,
      populationGrowth5y: -0.01,
      universityStudents: 18_000,
      avgDaysOnMarket: 180,
      buyTransactionCostRate: 0.11,
      sellTransactionCostRate: 0.03,
      rentalIncomeTaxRate: 0.21,
    }),
    build('example-bologna', 'Bologna', 'Italy', 'Emilia-Romagna', {
      avgPricePerSqm: 3_400,
      avgRentPerSqmMonth: 15.2,
      vacancyRate: 0.03,
      priceGrowth5y: 0.031,
      rentGrowth5y: 0.038,
      population: 392_000,
      populationGrowth5y: 0.012,
      universityStudents: 88_000,
      touristArrivalsPerYear: 2_400_000,
      avgDaysOnMarket: 70,
      transactionsPerYear: 9_500,
      buyTransactionCostRate: 0.11,
      sellTransactionCostRate: 0.03,
      rentalIncomeTaxRate: 0.21,
    }),
    build('example-torino', 'Torino', 'Italy', 'Piemonte', {
      avgPricePerSqm: 1_950,
      avgRentPerSqmMonth: 9.6,
      vacancyRate: 0.06,
      priceGrowth5y: 0.008,
      rentGrowth5y: 0.019,
      population: 847_000,
      populationGrowth5y: -0.008,
      universityStudents: 105_000,
      avgDaysOnMarket: 120,
      transactionsPerYear: 18_000,
      buyTransactionCostRate: 0.11,
      sellTransactionCostRate: 0.03,
      rentalIncomeTaxRate: 0.21,
    }),
    build('example-valencia', 'Valencia', 'Spain', 'Comunidad Valenciana', {
      avgPricePerSqm: 2_450,
      avgRentPerSqmMonth: 12.8,
      vacancyRate: 0.04,
      priceGrowth5y: 0.062,
      rentGrowth5y: 0.055,
      population: 800_000,
      populationGrowth5y: 0.018,
      touristArrivalsPerYear: 2_000_000,
      avgDaysOnMarket: 60,
      buyTransactionCostRate: 0.12,
      sellTransactionCostRate: 0.05,
      // Tax and regulation intentionally absent: shows "Data unavailable".
    }),
    build('example-stockholm', 'Stockholm', 'Sweden', 'Stockholms län', {
      avgPricePerSqm: 7_200,
      avgRentPerSqmMonth: 21.5,
      vacancyRate: 0.01,
      priceGrowth5y: 0.014,
      population: 990_000,
      populationGrowth5y: 0.021,
      universityStudents: 75_000,
      avgDaysOnMarket: 35,
      buyTransactionCostRate: 0.04,
      sellTransactionCostRate: 0.05,
      // rentGrowth5y and tourism intentionally absent.
    }),
  ];
}

/**
 * Gross yield derived from price and rent when a source does not publish it.
 *
 *   yield = (rent EUR/m2/month x 12) / price EUR/m2
 *
 * Flagged DERIVED_DATA, never RAW_DATA: it is our arithmetic on someone
 * else's numbers, and a ratio of two averages is not the average of the ratio.
 */
export function deriveGrossYield(market: Market): DataPoint | null {
  const price = market.metrics.avgPricePerSqm;
  const rent = market.metrics.avgRentPerSqmMonth;
  if (!price?.value || !rent?.value || price.value <= 0) return null;
  if (price.currency !== rent.currency) return null;

  return {
    value: (rent.value * 12) / price.value,
    unit: METRIC_SPECS.grossRentalYield.unit,
    currency: null,
    geography: price.geography,
    period: price.period,
    source: {
      source: `Derived from ${price.source.source}`,
      sourceUrl: price.source.sourceUrl,
      retrievedAt: new Date().toISOString(),
      methodology:
        'Average monthly rent per m² x 12, divided by average price per m². A ratio of two averages, which is not the average of the ratio.',
      kind: price.source.kind === 'EXAMPLE' ? 'EXAMPLE' : 'MANUAL',
    },
    confidence: 'LOW',
    dataClass: price.source.kind === 'EXAMPLE' ? 'MODEL_ASSUMPTION' : 'DERIVED_DATA',
  };
}

/** True when any metric in the market came from the illustrative dataset. */
export function marketContainsExampleData(market: Market): boolean {
  return Object.values(market.metrics).some((m) => m?.source.kind === 'EXAMPLE');
}

/** A market datum the user typed in by hand: they are then the source. */
export function manualPoint(
  metric: MarketMetricKey,
  value: number | null,
  geography: Geography,
  period: Period,
): DataPoint {
  const spec = METRIC_SPECS[metric];
  const now = new Date().toISOString();
  return {
    value,
    unit: spec.unit,
    currency: spec.requiresCurrency ? 'EUR' : null,
    geography,
    period,
    source: {
      source: 'Manual entry',
      sourceUrl: null,
      retrievedAt: now,
      methodology: 'Entered by the user. The tool does not check it.',
      kind: 'MANUAL',
    },
    confidence: 'MEDIUM',
    dataClass: value === null ? 'MISSING' : 'USER_INPUT',
  };
}
