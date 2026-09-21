/**
 * Runs every provider over every query and collects the results.
 *
 * Providers are tried in order of geographic resolution: the most specific
 * source wins a metric, because a city figure beats a national one for a
 * specific property. A provider that returns null simply has no data for that
 * query — it never causes another provider's figures to be substituted.
 */

import type { Market, MarketMetricKey } from '@/domain/types';
import type { DataPoint, Geography } from '@/domain/datapoint';
import { runPipeline, type MarketDataProvider, type ProviderQuery, type Rejection } from './pipeline';
import type { FetchLike } from './providers/eurostat';
import { EurostatProvider } from './providers/eurostat';
import { EcbProvider } from './providers/ecb';
import { IstatProvider } from './providers/istat';

export interface FetchAllResult {
  markets: Market[];
  rejections: Rejection[];
  failures: { provider: string; query: string }[];
}

/** Rank by how finely a source resolves; finer wins when both have a metric. */
const RESOLUTION: Record<string, number> = { COUNTRY: 0, REGION: 1, CITY: 2, NEIGHBORHOOD: 3 };

export function buildProviders(fetchImpl: FetchLike): MarketDataProvider[] {
  // Ordered coarse -> fine, so the fine ones overwrite.
  return [
    new EurostatProvider(fetchImpl),
    new EcbProvider(fetchImpl),
    new IstatProvider(fetchImpl),
  ];
}

export async function fetchAllMarkets(
  queries: ProviderQuery[],
  fetchImpl: FetchLike,
  providers: MarketDataProvider[] = buildProviders(fetchImpl),
): Promise<FetchAllResult> {
  const markets: Market[] = [];
  const rejections: Rejection[] = [];
  const failures: { provider: string; query: string }[] = [];

  for (const query of queries) {
    const label = `${query.city}, ${query.country}`;
    const metrics: Partial<Record<MarketMetricKey, DataPoint>> = {};
    let geography: Geography = {
      country: query.country,
      region: null,
      city: query.city,
      neighborhood: null,
      level: 'CITY',
    };

    for (const provider of providers) {
      let payload;
      try {
        payload = await provider.fetchMarket(query);
      } catch {
        failures.push({ provider: provider.name, query: label });
        continue;
      }
      if (!payload) {
        failures.push({ provider: provider.name, query: label });
        continue;
      }

      const result = runPipeline(payload);
      rejections.push(...result.rejected);

      for (const [key, point] of Object.entries(result.accepted)) {
        if (!point) continue;
        const existing = metrics[key as MarketMetricKey];
        // Keep the finer-resolution figure. A tie keeps the first, which is
        // the coarser provider's — so a later provider only wins on merit.
        if (
          !existing ||
          RESOLUTION[point.geography.level]! > RESOLUTION[existing.geography.level]!
        ) {
          metrics[key as MarketMetricKey] = point;
        }
      }

      if (RESOLUTION[payload.geography.level]! > RESOLUTION[geography.level]!) {
        geography = { ...payload.geography };
      }
    }

    if (Object.keys(metrics).length === 0) continue;

    const now = new Date().toISOString();
    markets.push({
      id: `live-${query.country}-${query.city}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      name: query.city,
      geography,
      createdAt: now,
      updatedAt: now,
      metrics,
      regulationNotes: null,
      riskNotes: null,
    });
  }

  return { markets, rejections, failures };
}
