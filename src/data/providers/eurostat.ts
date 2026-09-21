/**
 * Eurostat — the EU's statistical office.
 *
 * Public dissemination API, no key required:
 *   https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}
 *
 * Covers every EU member state on a harmonised definition, which is what makes
 * it the right source for CROSS-BORDER comparison — national statistical
 * offices each measure slightly differently, so comparing them directly is the
 * mistake this provider exists to avoid.
 *
 * What it does NOT give: anything below country level. Every point it returns
 * is stamped `level: 'COUNTRY'`, which makes the quality layer raise
 * COARSE_GEOGRAPHY whenever it is used for a specific property.
 */

import type { Confidence, Geography, Period } from '@/domain/datapoint';
import type { MarketMetricKey } from '@/domain/types';
import { UNITS } from '@/domain/units';
import { parseJsonStat, parsePeriodLabel, type JsonStatResponse } from '../formats';
import type {
  MarketDataProvider,
  ProviderQuery,
  RawMarketPayload,
  RawObservation,
} from '../pipeline';

const BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

export const EUROSTAT_METHODOLOGY =
  'Eurostat harmonised statistics compiled from national statistical institutes to a common definition, which is what makes member states comparable with each other. Country-level only.';

/** ISO country name -> Eurostat geo code. Unlisted countries are not guessed. */
const GEO_CODES: Record<string, string> = {
  Italy: 'IT',
  Italia: 'IT',
  Spain: 'ES',
  España: 'ES',
  Sweden: 'SE',
  Sverige: 'SE',
  France: 'FR',
  Germany: 'DE',
  Deutschland: 'DE',
  Portugal: 'PT',
  Netherlands: 'NL',
  Belgium: 'BE',
  Austria: 'AT',
  Greece: 'EL',
  Ireland: 'IE',
  Poland: 'PL',
  Croatia: 'HR',
  Denmark: 'DK',
  Finland: 'FI',
};

export function eurostatGeoCode(country: string): string | null {
  return GEO_CODES[country.trim()] ?? null;
}

interface SeriesSpec {
  metric: MarketMetricKey;
  dataset: string;
  /** Dimension filters that make the query resolve to a single series. */
  params: Record<string, string>;
  unit: RawObservation['unit'];
  /** Eurostat reports rates of change in percent; the canonical unit is a ratio. */
  scale: number;
  confidence: Confidence;
  methodology: string;
}

/**
 * The series this provider knows how to read.
 *
 * `prc_hpi_a` with `unit=RCH_A_AVG` is the ANNUAL AVERAGE RATE OF CHANGE, which
 * is a percentage. The canonical unit for growth metrics is a ratio, so the
 * scale below converts it — declared here rather than applied silently inside
 * a parser.
 */
const SERIES: SeriesSpec[] = [
  {
    metric: 'priceGrowth5y',
    dataset: 'prc_hpi_a',
    params: { unit: 'RCH_A_AVG', purchase: 'TOTAL', freq: 'A' },
    unit: UNITS.ratio,
    scale: 0.01,
    confidence: 'HIGH',
    methodology:
      'Eurostat house price index (prc_hpi_a), annual average rate of change, all dwellings. HISTORIC and NOMINAL — a record of what happened, not a forecast.',
  },
  {
    metric: 'population',
    dataset: 'demo_pjan',
    params: { unit: 'NR', age: 'TOTAL', sex: 'T', freq: 'A' },
    unit: UNITS.count,
    scale: 1,
    confidence: 'HIGH',
    methodology: 'Eurostat population on 1 January (demo_pjan), all ages, both sexes.',
  },
];

function buildUrl(spec: SeriesSpec, geo: string, sinceYear: number): string {
  const params = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    geo,
    sinceTimePeriod: String(sinceYear),
    ...spec.params,
  });
  return `${BASE}/${spec.dataset}?${params.toString()}`;
}

export interface FetchLike {
  (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

export class EurostatProvider implements MarketDataProvider {
  readonly id = 'eurostat';
  readonly name = 'Eurostat';
  readonly methodology = EUROSTAT_METHODOLOGY;
  readonly sourceUrl = 'https://ec.europa.eu/eurostat/web/main/data/database';

  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly sinceYear = new Date().getFullYear() - 6,
  ) {}

  async fetchMarket(query: ProviderQuery): Promise<RawMarketPayload | null> {
    const geo = eurostatGeoCode(query.country);
    // An unmapped country is "no data for this query", not an error, and
    // certainly not a reason to fall back to another country's figures.
    if (!geo) return null;

    const geography: Geography = {
      country: query.country,
      region: null,
      city: null,
      neighborhood: null,
      level: 'COUNTRY',
    };

    const observations: RawObservation[] = [];

    for (const spec of SERIES) {
      const response = await this.fetchImpl(buildUrl(spec, geo, this.sinceYear));
      if (!response.ok) continue;

      let series;
      try {
        series = parseJsonStat((await response.json()) as JsonStatResponse);
      } catch {
        // A parse failure means the payload was not the shape we understand.
        // Skipping it loses one metric; guessing at it would corrupt the set.
        continue;
      }

      const latest = [...series].reverse().find((o) => o.value !== null);
      if (!latest) continue;

      const period: Period | null = parsePeriodLabel(latest.period);
      if (!period) continue;

      observations.push({
        metric: spec.metric,
        value: latest.value === null ? null : latest.value * spec.scale,
        unit: spec.unit,
        currency: null,
        period,
        confidence: spec.confidence,
        methodology: spec.methodology,
      });
    }

    if (observations.length === 0) return null;

    return {
      marketName: query.country,
      geography,
      source: 'Eurostat',
      sourceUrl: this.sourceUrl,
      methodology: this.methodology,
      observations,
    };
  }
}

/** Exposed for tests: the URLs this provider will call. */
export function eurostatUrls(country: string, sinceYear: number): string[] {
  const geo = eurostatGeoCode(country);
  if (!geo) return [];
  return SERIES.map((s) => buildUrl(s, geo, sinceYear));
}
