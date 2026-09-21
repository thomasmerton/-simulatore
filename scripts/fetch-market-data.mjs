#!/usr/bin/env node
/**
 * Fetch live market data and write a dated snapshot.
 *
 *   npm run fetch-data
 *
 * WHY A SNAPSHOT RATHER THAN LIVE CALLS FROM THE BROWSER
 * Statistical APIs move: series get renamed, dimensions get added, endpoints
 * go down. A build-time fetch means a failure is loud and happens once, on a
 * developer's machine, instead of silently blanking a user's comparison table.
 * It also means the app keeps working offline, and every figure carries the
 * date it was actually retrieved rather than implying it is live.
 *
 * Nothing is written unless it passes the normalizer AND the validator, and
 * every rejection is printed with its reason. A run that rejects everything
 * writes an empty snapshot and exits non-zero — it never leaves stale data in
 * place while reporting success.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/data/snapshot.json');

/* The markets to fetch. Country-level sources use `country`; ISTAT uses both. */
const QUERIES = [
  { country: 'Italy', city: 'Milano' },
  { country: 'Italy', city: 'Torino' },
  { country: 'Italy', city: 'Bologna' },
  { country: 'Italy', city: "L'Aquila" },
  { country: 'Spain', city: 'Valencia' },
  { country: 'Sweden', city: 'Stockholm' },
];

const TIMEOUT_MS = 30_000;

async function timedFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    return {
      ok: res.ok,
      status: res.status,
      json: () => res.json(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: async () => ({}),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // The providers and pipeline are TypeScript; run this through tsx or after a
  // build. Kept as a dynamic import so the failure message is actionable.
  let mod;
  try {
    mod = await import('../src/data/fetchAll.ts');
  } catch {
    console.error(
      'Could not load the TypeScript sources directly.\n' +
        'Run with tsx:  npx tsx scripts/fetch-market-data.mjs',
    );
    process.exit(2);
  }

  const { fetchAllMarkets } = mod;
  const started = new Date().toISOString();
  console.log(`Fetching market data at ${started}\n`);

  const { markets, rejections, failures } = await fetchAllMarkets(QUERIES, timedFetch);

  for (const market of markets) {
    const metrics = Object.keys(market.metrics).length;
    console.log(`  ✓ ${market.name.padEnd(14)} ${metrics} metric(s)`);
  }
  for (const failure of failures) {
    console.log(`  · ${failure.provider.padEnd(14)} no data for ${failure.query}`);
  }
  if (rejections.length > 0) {
    console.log('\nRejected observations (nothing was silently rescaled):');
    for (const r of rejections) {
      console.log(`  ✕ [${r.stage}] ${r.metricLabel}: ${r.reason}`);
    }
  }

  const snapshot = {
    retrievedAt: started,
    generatedBy: 'scripts/fetch-market-data.mjs',
    markets,
    rejections,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`\nWrote ${markets.length} market(s) to ${OUT}`);

  if (markets.length === 0) {
    console.error('\nNo markets were fetched. Not treating this as success.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
