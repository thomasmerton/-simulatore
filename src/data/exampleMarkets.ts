/**
 * ILLUSTRATIVE MARKET DATA — NOT REAL.
 *
 * These figures exist so the market comparison screens can be exercised
 * before a real data feed is connected. They are ORDER-OF-MAGNITUDE
 * PLACEHOLDERS invented for demonstration. They are not measurements, they
 * are not sourced, and they must not be used to compare actual markets.
 *
 * Every metric is stamped with `kind: 'EXAMPLE'` and provenance
 * MODEL_ASSUMPTION, which makes the UI render a persistent warning wherever
 * the data appears. Loading this dataset requires an explicit user action; it
 * is never loaded automatically.
 *
 * To replace it: implement a `MarketDataProvider` (see data/source.ts) and
 * import through `normalizeMarketPayload`, which stamps real provenance.
 */

import type { Market, MarketMetric, MarketMetricKey } from '@/domain/types';
import { CANONICAL_UNITS } from './source';

const DISCLAIMER =
  'ILLUSTRATIVE PLACEHOLDER. Invented for demonstration, not observed or sourced. Do not use for a real comparison.';

function exampleMetric(metric: MarketMetricKey, value: number): MarketMetric {
  return {
    value,
    unit: CANONICAL_UNITS[metric],
    provenance: 'MODEL_ASSUMPTION',
    confidence: 'LOW',
    sourceRef: {
      source: 'Example dataset',
      observedAt: '2024-01-01T00:00:00.000Z',
      importedAt: '2024-01-01T00:00:00.000Z',
      geographicScope: 'city',
      methodology: DISCLAIMER,
      url: null,
      kind: 'EXAMPLE',
    },
  };
}

function build(
  id: string,
  name: string,
  country: string,
  values: Partial<Record<MarketMetricKey, number>>,
): Market {
  const metrics: Partial<Record<MarketMetricKey, MarketMetric>> = {};
  for (const [key, value] of Object.entries(values)) {
    metrics[key as MarketMetricKey] = exampleMetric(key as MarketMetricKey, value);
  }
  return {
    id,
    name,
    country,
    district: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    metrics,
    regulationNotes: DISCLAIMER,
    riskNotes: DISCLAIMER,
  };
}

/**
 * Deliberately incomplete: several markets are missing several metrics, so
 * the "Data unavailable" path is visible in the comparison table rather than
 * being papered over.
 */
export function exampleMarkets(): Market[] {
  return [
    build('example-laquila', "L'Aquila", 'Italy', {
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
    build('example-bologna', 'Bologna', 'Italy', {
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
      buyTransactionCostRate: 0.11,
      sellTransactionCostRate: 0.03,
      rentalIncomeTaxRate: 0.21,
    }),
    build('example-torino', 'Torino', 'Italy', {
      avgPricePerSqm: 1_950,
      avgRentPerSqmMonth: 9.6,
      vacancyRate: 0.06,
      priceGrowth5y: 0.008,
      rentGrowth5y: 0.019,
      population: 847_000,
      populationGrowth5y: -0.008,
      universityStudents: 105_000,
      avgDaysOnMarket: 120,
      buyTransactionCostRate: 0.11,
      sellTransactionCostRate: 0.03,
      rentalIncomeTaxRate: 0.21,
    }),
    build('example-valencia', 'Valencia', 'Spain', {
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
      // Regulation and tax intentionally absent: shows "Data unavailable".
    }),
    build('example-stockholm', 'Stockholm', 'Sweden', {
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
