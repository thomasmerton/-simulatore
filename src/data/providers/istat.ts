/**
 * ISTAT — Italy's national statistical institute.
 *
 * Public SDMX web service, no key required:
 *   https://esploradati.istat.it/SDMXWS/rest/data/{flow}/{key}
 *
 * ISTAT resolves below country level — down to the comune — which is what
 * Eurostat cannot do. For an Italian property this is the better source; for
 * comparing Italy against Spain it is the worse one, because each national
 * institute measures slightly differently. Use Eurostat across borders and
 * ISTAT within Italy.
 */

import type { Geography, Period } from '@/domain/datapoint';
import { UNITS } from '@/domain/units';
import { parsePeriodLabel, parseSdmx, type SdmxResponse } from '../formats';
import type {
  MarketDataProvider,
  ProviderQuery,
  RawMarketPayload,
  RawObservation,
} from '../pipeline';
import type { FetchLike } from './eurostat';

const BASE = 'https://esploradati.istat.it/SDMXWS/rest/data';

/**
 * ISTAT keys municipalities by their official comune code, not by name. A name
 * is not enough to identify a comune — Italy has several places with the same
 * name — so a city this map does not carry is reported as "no data" rather
 * than matched by a fuzzy string comparison.
 *
 * Codes are the ISTAT comune codes for the capoluoghi this tool ships with.
 */
const COMUNE_CODES: Record<string, string> = {
  Milano: '015146',
  Milan: '015146',
  Torino: '001272',
  Turin: '001272',
  Bologna: '037006',
  Roma: '058091',
  Rome: '058091',
  Firenze: '048017',
  Florence: '048017',
  Napoli: '063049',
  Naples: '063049',
  Genova: '010025',
  Genoa: '010025',
  "L'Aquila": '066049',
  Palermo: '082053',
  Bari: '072006',
  Venezia: '027042',
  Venice: '027042',
  Verona: '023091',
};

export function istatComuneCode(city: string): string | null {
  return COMUNE_CODES[city.trim()] ?? null;
}

export class IstatProvider implements MarketDataProvider {
  readonly id = 'istat';
  readonly name = 'ISTAT';
  readonly methodology =
    'ISTAT official statistics for Italy, resolving to comune level. National definitions, so comparable within Italy but not directly against another country’s national institute.';
  readonly sourceUrl = 'https://esploradati.istat.it/';

  constructor(private readonly fetchImpl: FetchLike) {}

  async fetchMarket(query: ProviderQuery): Promise<RawMarketPayload | null> {
    if (query.country.trim().toLowerCase() !== 'italy' && query.country.trim().toLowerCase() !== 'italia') {
      return null;
    }
    const comune = istatComuneCode(query.city);
    if (!comune) return null;

    const geography: Geography = {
      country: 'Italy',
      region: null,
      city: query.city,
      neighborhood: null,
      level: 'CITY',
    };

    const observations: RawObservation[] = [];

    // Resident population on 1 January, by comune.
    const url = `${BASE}/IT1,22_289_DF_DCIS_POPRES1_1,1.0/A.${comune}.JAN.9.99.99.?format=jsondata&lastNObservations=1`;
    const response = await this.fetchImpl(url);

    if (response.ok) {
      try {
        const series = parseSdmx((await response.json()) as SdmxResponse);
        const latest = [...series].reverse().find((o) => o.value !== null);
        const period: Period | null = latest ? parsePeriodLabel(latest.period) : null;
        if (latest && period) {
          observations.push({
            metric: 'population',
            value: latest.value,
            unit: UNITS.count,
            currency: null,
            period,
            confidence: 'HIGH',
            methodology: 'ISTAT resident population on 1 January, by comune.',
          });
        }
      } catch {
        // Unrecognised payload shape: drop the metric rather than guess at it.
      }
    }

    if (observations.length === 0) return null;

    return {
      marketName: query.city,
      geography,
      source: 'ISTAT',
      sourceUrl: this.sourceUrl,
      methodology: this.methodology,
      observations,
    };
  }
}
