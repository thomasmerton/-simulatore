/**
 * TRANSCRIBED REFERENCE DATA.
 *
 * Real, published, national-level figures, read off the publishers' reports
 * rather than imported from their data services. Every point is stamped
 * `kind: 'TRANSCRIBED'`, which makes the quality layer raise a standing
 * TRANSCRIBED_DATA warning telling the reader to check it against the source.
 *
 * WHY THIS IS A WEAKER CLAIM THAN 'IMPORTED'
 * An imported figure came from the publisher's own API through the normalizer
 * and the validator, so its series, unit and period are pinned down by the
 * payload. A transcribed one rests on someone reading a report correctly.
 * Both are real; only one is machine-verified. Blurring them would be the
 * exact dishonesty this tool is built to avoid, so they are different kinds
 * with different warnings.
 *
 * Run `npm run fetch-data` on a machine with network access to replace these
 * with machine-imported equivalents — the fetcher's country-level points
 * outrank nothing here, they simply supersede them by being IMPORTED.
 *
 * WHAT IS DELIBERATELY ABSENT
 * City-level prices and rents. Those are what the tool most needs and they
 * come from OMI, which has no public API. They must be imported from an OMI
 * file (see providers/omi.ts). Nothing here invents them.
 */

import type { DataPoint, Geography, Period } from '@/domain/datapoint';
import type { Market, MarketMetricKey } from '@/domain/types';
import { METRIC_SPECS } from './metrics';

const ITALY: Geography = {
  country: 'Italy',
  region: null,
  city: null,
  neighborhood: null,
  level: 'COUNTRY',
};

const JUNE_2026: Period = { from: '2026-06-01', to: '2026-06-30', label: 'June 2026' };
const Q4_2024: Period = { from: '2024-10-01', to: '2024-12-31', label: '2024 Q4' };
const JAN_2025: Period = { from: '2025-01-01', to: '2025-01-01', label: '1 January 2025' };

interface TranscribedSpec {
  metric: MarketMetricKey;
  value: number;
  period: Period;
  source: string;
  sourceUrl: string;
  methodology: string;
}

/**
 * Italian national reference figures.
 *
 * The mortgage pair is the point of this set. Banca d'Italia publishes both a
 * nominal rate and a TAEG for the SAME month, and the gap between them (~45bp)
 * is precisely the ancillary cost this model carries separately as
 * `acquisition.financingFees`. Importing the TAEG as the interest rate would
 * double-count that gap, which is why they are separate metrics here.
 */
const ITALY_REFERENCE: TranscribedSpec[] = [
  {
    metric: 'mortgageRateNominal',
    value: 0.035,
    period: JUNE_2026,
    source: "Banca d'Italia — Banche e moneta",
    sourceUrl: 'https://www.bancaditalia.it/pubblicazioni/moneta-banche/',
    methodology:
      'Average effective rate on new lending to households for house purchase, June 2026, EXCLUDING ancillary costs. This is the figure that belongs in the model’s interest rate, because fees are carried separately.',
  },
  {
    metric: 'mortgageRateAprc',
    value: 0.0395,
    period: JUNE_2026,
    source: "Banca d'Italia — Banche e moneta",
    sourceUrl: 'https://www.bancaditalia.it/pubblicazioni/moneta-banche/',
    methodology:
      'TAEG on new lending to households for house purchase, June 2026, INCLUDING ancillary costs. The ~45bp gap against the nominal rate is the ancillary cost itself — which the model already carries as financing fees, so this must not be used as the interest rate.',
  },
  {
    metric: 'priceGrowthLatestYoY',
    value: 0.045,
    period: Q4_2024,
    source: 'ISTAT — Indice dei prezzi delle abitazioni',
    sourceUrl: 'https://www.istat.it/statistiche-per-temi/prezzi/',
    methodology:
      'House price index, Q4 2024 versus Q4 2023, all dwellings. New dwellings rose 9.4% and existing dwellings 3.4% — the headline hides a wide split, so the aggregate should not be applied to a specific property without thought. HISTORIC, not a forecast.',
  },
  {
    metric: 'population',
    value: 58_934_000,
    period: JAN_2025,
    source: 'ISTAT — Popolazione residente',
    sourceUrl: 'https://demo.istat.it/',
    methodology: 'Resident population of Italy on 1 January 2025.',
  },
];

function transcribedPoint(spec: TranscribedSpec, geography: Geography): DataPoint {
  const metricSpec = METRIC_SPECS[spec.metric];
  return {
    value: spec.value,
    unit: metricSpec.unit,
    currency: metricSpec.requiresCurrency ? 'EUR' : null,
    geography,
    period: spec.period,
    source: {
      source: spec.source,
      sourceUrl: spec.sourceUrl,
      // When the figure was read, not when the publisher released it.
      retrievedAt: '2026-09-21T00:00:00.000Z',
      methodology: spec.methodology,
      kind: 'TRANSCRIBED',
    },
    // Low: the figure is real and named, but the transcription is unverified
    // and the scope is national where the analysis is local.
    confidence: 'LOW',
    dataClass: 'RAW_DATA',
  };
}

/**
 * National reference markets.
 *
 * These are COUNTRY-level, so using one for a specific property raises
 * COARSE_GEOGRAPHY. They are a starting reference for the interest rate and
 * the growth assumption — the two inputs the result is most sensitive to and
 * which previously had no source at all.
 */
export function referenceMarkets(): Market[] {
  const metrics: Partial<Record<MarketMetricKey, DataPoint>> = {};
  for (const spec of ITALY_REFERENCE) {
    metrics[spec.metric] = transcribedPoint(spec, ITALY);
  }

  return [
    {
      id: 'reference-italy',
      name: 'Italy (national reference)',
      geography: ITALY,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
      metrics,
      regulationNotes:
        'Rental contracts, the cedolare secca regime and local short-let rules vary by comune. Nothing here is a statement of law.',
      riskNotes:
        'National aggregates. Italian city and micro-zone markets diverge widely from the national figure — use OMI micro-zone data for a specific property.',
    },
  ];
}

/** True when a market is one of the transcribed reference set. */
export function isReferenceMarket(market: Market): boolean {
  return Object.values(market.metrics).some((m) => m?.source.kind === 'TRANSCRIBED');
}
