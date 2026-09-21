/**
 * European Central Bank — MIR (MFI Interest Rate) statistics.
 *
 * Public SDMX API, no key required:
 *   https://data-api.ecb.europa.eu/service/data/MIR/{key}?format=jsondata
 *
 * WHY THIS MATTERS TO THE MODEL
 * The mortgage rate is one of the two inputs the result is structurally most
 * sensitive to. Until now it was a MODEL_ASSUMPTION of 3.5% — a number with no
 * source. This provider replaces it with a published, dated observation for
 * the right country.
 *
 * A DEFINITION THAT MUST NOT BE FUDGED
 * The ECB publishes both:
 *   - the RATE (annualised agreed rate / narrowly defined effective rate), and
 *   - the APRC (annual percentage rate of charge), which INCLUDES fees.
 *
 * `financing.annualRate` in this model is the nominal rate; fees are modelled
 * separately as `acquisition.financingFees`. Feeding an APRC into it would
 * double-count the fees. The two are therefore imported as DIFFERENT metrics
 * and the APRC is never mapped onto the nominal rate.
 */

import type { Geography, Period } from '@/domain/datapoint';
import type { MarketMetricKey } from '@/domain/types';
import { UNITS } from '@/domain/units';
import { parsePeriodLabel, parseSdmx, type SdmxResponse } from '../formats';
import type {
  MarketDataProvider,
  ProviderQuery,
  RawMarketPayload,
  RawObservation,
} from '../pipeline';
import type { FetchLike } from './eurostat';

const BASE = 'https://data-api.ecb.europa.eu/service/data/MIR';

/** ECB reference-area codes. U2 is the euro area aggregate. */
const AREA_CODES: Record<string, string> = {
  Italy: 'IT',
  Italia: 'IT',
  Spain: 'ES',
  España: 'ES',
  France: 'FR',
  Germany: 'DE',
  Deutschland: 'DE',
  Portugal: 'PT',
  Netherlands: 'NL',
  Belgium: 'BE',
  Austria: 'AT',
  Greece: 'GR',
  Ireland: 'IE',
  Finland: 'FI',
};

export function ecbAreaCode(country: string): string | null {
  return AREA_CODES[country.trim()] ?? null;
}

interface RateSpec {
  metric: MarketMetricKey;
  /**
   * MIR series key, minus the reference area which is substituted per query.
   *
   * Key structure: FREQ.REF_AREA.SECTOR.INSTRUMENT.MATURITY.DATA_TYPE
   *                .AMOUNT_CAT.COUNTERPARTY.CURRENCY.COVERAGE
   *
   * A2C = lending for house purchase to households, new business.
   * R   = annualised agreed rate.
   * T   = annual percentage rate of charge (includes fees).
   */
  key: (area: string) => string;
  methodology: string;
}

const RATES: RateSpec[] = [
  {
    metric: 'mortgageRateNominal',
    key: (area) => `M.${area}.B.A2C.AM.R.A.2250.EUR.N`,
    methodology:
      'ECB MIR: annualised agreed rate on new loans to households for house purchase, all maturities. This is the NOMINAL rate — fees are excluded and are modelled separately as financing fees.',
  },
  {
    metric: 'mortgageRateAprc',
    key: (area) => `M.${area}.B.A2C.A.T.A.2250.EUR.N`,
    methodology:
      'ECB MIR: annual percentage rate of charge (APRC / TAEG) on new loans to households for house purchase. INCLUDES ancillary costs, so it must NOT be used as the nominal rate — doing so double-counts the fees the model already carries.',
  },
];

function buildUrl(spec: RateSpec, area: string, lastN: number): string {
  return `${BASE}/${spec.key(area)}?format=jsondata&lastNObservations=${lastN}&detail=dataonly`;
}

export class EcbProvider implements MarketDataProvider {
  readonly id = 'ecb-mir';
  readonly name = 'European Central Bank — MIR statistics';
  readonly methodology =
    'ECB MFI Interest Rate statistics, collected from euro-area monetary financial institutions on a harmonised definition. Country-level, monthly, new business.';
  readonly sourceUrl = 'https://data.ecb.europa.eu/data/datasets/MIR';

  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly lastN = 1,
  ) {}

  async fetchMarket(query: ProviderQuery): Promise<RawMarketPayload | null> {
    const area = ecbAreaCode(query.country);
    // Outside the euro area the MIR statistics do not apply. That is "no data",
    // not a reason to substitute the euro-area aggregate for a national rate.
    if (!area) return null;

    const geography: Geography = {
      country: query.country,
      region: null,
      city: null,
      neighborhood: null,
      level: 'COUNTRY',
    };

    const observations: RawObservation[] = [];

    for (const spec of RATES) {
      const response = await this.fetchImpl(buildUrl(spec, area, this.lastN));
      if (!response.ok) continue;

      let series;
      try {
        series = parseSdmx((await response.json()) as SdmxResponse);
      } catch {
        continue;
      }

      const latest = [...series].reverse().find((o) => o.value !== null);
      if (!latest) continue;

      const period: Period | null = parsePeriodLabel(latest.period);
      if (!period) continue;

      observations.push({
        metric: spec.metric,
        // MIR is published in percent; the canonical unit is a ratio.
        value: latest.value === null ? null : latest.value / 100,
        unit: UNITS.ratio,
        currency: null,
        period,
        confidence: 'HIGH',
        methodology: spec.methodology,
      });
    }

    if (observations.length === 0) return null;

    return {
      marketName: query.country,
      geography,
      source: 'European Central Bank (MIR)',
      sourceUrl: this.sourceUrl,
      methodology: this.methodology,
      observations,
    };
  }
}

export function ecbUrls(country: string, lastN = 1): string[] {
  const area = ecbAreaCode(country);
  if (!area) return [];
  return RATES.map((r) => buildUrl(r, area, lastN));
}
