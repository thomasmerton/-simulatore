import { describe, expect, it, vi } from 'vitest';
import { EurostatProvider, eurostatGeoCode, eurostatUrls } from '@/data/providers/eurostat';
import { EcbProvider, ecbAreaCode, ecbUrls } from '@/data/providers/ecb';
import { IstatProvider, istatComuneCode } from '@/data/providers/istat';
import { omiRowToPayload, omiSemesterPeriod, parseOmiCsv } from '@/data/providers/omi';
import { runPipeline } from '@/data/pipeline';
import { fetchAllMarkets } from '@/data/fetchAll';

/** A fetch stub that answers from a map of URL substring -> payload. */
function stubFetch(routes: { match: string; body: unknown; ok?: boolean }[]) {
  return vi.fn(async (url: string) => {
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: hit.ok ?? true, status: 200, json: async () => hit.body };
  });
}

const jsonStat = (period: string, value: number) => ({
  id: ['freq', 'unit', 'geo', 'time'],
  size: [1, 1, 1, 1],
  dimension: { time: { category: { index: { [period]: 0 } } } },
  value: { '0': value },
});

const sdmx = (period: string, value: number) => ({
  dataSets: [{ series: { '0:0:0': { observations: { '0': [value] } } } }],
  structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: [{ id: period }] }] } },
});

describe('country code mapping', () => {
  it('maps the countries it knows, in either language', () => {
    expect(eurostatGeoCode('Italy')).toBe('IT');
    expect(eurostatGeoCode('Italia')).toBe('IT');
    expect(eurostatGeoCode('Sweden')).toBe('SE');
    expect(ecbAreaCode('Spain')).toBe('ES');
  });

  it('returns null for an unknown country instead of a near match', () => {
    expect(eurostatGeoCode('Atlantis')).toBeNull();
    expect(eurostatGeoCode('Ita')).toBeNull();
    expect(ecbAreaCode('United States')).toBeNull();
  });

  it('does not offer euro-area MIR rates for a non-euro country', () => {
    expect(ecbAreaCode('Sweden')).toBeNull();
    expect(ecbUrls('Sweden')).toEqual([]);
  });

  it('keys Italian comuni by official code, never by fuzzy name', () => {
    expect(istatComuneCode('Milano')).toBe('015146');
    expect(istatComuneCode('Milan')).toBe('015146');
    expect(istatComuneCode('Milanoo')).toBeNull();
  });
});

describe('EurostatProvider', () => {
  it('returns null for a country it cannot map, rather than another country', async () => {
    const fetchImpl = stubFetch([]);
    const provider = new EurostatProvider(fetchImpl as never);
    expect(await provider.fetchMarket({ country: 'Atlantis', city: 'Atlantis' })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('queries the documented dataset with the right geo code', () => {
    const urls = eurostatUrls('Italy', 2019);
    expect(urls.some((u) => u.includes('/prc_hpi_a?'))).toBe(true);
    expect(urls.every((u) => u.includes('geo=IT'))).toBe(true);
    expect(urls.every((u) => u.startsWith('https://ec.europa.eu/eurostat/api/'))).toBe(true);
  });

  it('converts a percentage rate of change into the canonical ratio', async () => {
    const provider = new EurostatProvider(
      stubFetch([{ match: 'prc_hpi_a', body: jsonStat('2024', 4.5) }]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Roma' });
    const growth = payload?.observations.find((o) => o.metric === 'priceGrowth5y');
    expect(growth?.value).toBeCloseTo(0.045, 10);
    expect(growth?.unit.dimension).toBe('RATIO');
  });

  it('stamps every figure as country-level, so the coarse-geography warning fires', async () => {
    const provider = new EurostatProvider(
      stubFetch([{ match: 'prc_hpi_a', body: jsonStat('2024', 4.5) }]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Milano' });
    expect(payload?.geography.level).toBe('COUNTRY');
    expect(payload?.geography.city).toBeNull();
  });

  it('skips a metric whose payload it cannot parse, keeping the rest', async () => {
    const provider = new EurostatProvider(
      stubFetch([
        { match: 'prc_hpi_a', body: { nonsense: true } },
        { match: 'demo_pjan', body: jsonStat('2024', 58_990_000) },
      ]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Roma' });
    expect(payload?.observations.map((o) => o.metric)).toEqual(['population']);
  });
});

describe('EcbProvider', () => {
  it('keeps the nominal rate and the APRC as SEPARATE metrics', async () => {
    const provider = new EcbProvider(
      stubFetch([
        { match: 'A2C.AM.R.A', body: sdmx('2026-07', 3.42) },
        { match: 'A2C.A.T.A', body: sdmx('2026-07', 3.81) },
      ]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Milano' });
    const metrics = payload?.observations.map((o) => o.metric) ?? [];
    expect(metrics).toContain('mortgageRateNominal');
    expect(metrics).toContain('mortgageRateAprc');

    const nominal = payload!.observations.find((o) => o.metric === 'mortgageRateNominal')!;
    const aprc = payload!.observations.find((o) => o.metric === 'mortgageRateAprc')!;
    expect(nominal.value).toBeCloseTo(0.0342, 10);
    expect(aprc.value).toBeCloseTo(0.0381, 10);
    // The APRC must say, in its own methodology, that it is not the rate.
    expect(aprc.methodology).toMatch(/double-count/i);
  });

  it('dates the observation to the month the ECB published it for', async () => {
    const provider = new EcbProvider(
      stubFetch([{ match: 'A2C.AM.R.A', body: sdmx('2026-07', 3.42) }]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Milano' });
    expect(payload?.observations[0]?.period).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      label: '2026-07',
    });
  });

  it('passes the validator: rates land inside the plausible band', async () => {
    const provider = new EcbProvider(
      stubFetch([{ match: 'A2C.AM.R.A', body: sdmx('2026-07', 3.42) }]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Milano' });
    const result = runPipeline(payload!);
    expect(result.rejected).toEqual([]);
    expect(result.accepted.mortgageRateNominal?.dataClass).toBe('RAW_DATA');
  });

  it('a rate the source reported in ratio form by mistake is REJECTED, not accepted', async () => {
    // 342 (percent misread) becomes 3.42 as a ratio: far outside the band.
    const provider = new EcbProvider(
      stubFetch([{ match: 'A2C.AM.R.A', body: sdmx('2026-07', 342) }]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Milano' });
    const result = runPipeline(payload!);
    expect(result.accepted.mortgageRateNominal).toBeUndefined();
    expect(result.rejected[0]?.reason).toMatch(/plausible range/i);
  });
});

describe('IstatProvider', () => {
  it('refuses a non-Italian query', async () => {
    const provider = new IstatProvider(stubFetch([]) as never);
    expect(await provider.fetchMarket({ country: 'Spain', city: 'Valencia' })).toBeNull();
  });

  it('resolves to city level, which outranks a country source', async () => {
    const provider = new IstatProvider(
      stubFetch([{ match: 'POPRES1', body: sdmx('2025', 1_371_000) }]) as never,
    );
    const payload = await provider.fetchMarket({ country: 'Italy', city: 'Milano' });
    expect(payload?.geography.level).toBe('CITY');
    expect(payload?.observations[0]?.value).toBe(1_371_000);
  });
});

describe('fetchAllMarkets', () => {
  it('lets a city-level source override a country-level one for the same metric', async () => {
    const fetchImpl = stubFetch([
      { match: 'demo_pjan', body: jsonStat('2024', 58_990_000) },
      { match: 'POPRES1', body: sdmx('2025', 1_371_000) },
    ]);
    const { markets } = await fetchAllMarkets(
      [{ country: 'Italy', city: 'Milano' }],
      fetchImpl as never,
    );
    // ISTAT's city figure wins over Eurostat's national one.
    expect(markets[0]?.metrics.population?.value).toBe(1_371_000);
    expect(markets[0]?.metrics.population?.geography.level).toBe('CITY');
  });

  it('omits a market entirely when no provider has anything for it', async () => {
    const { markets, failures } = await fetchAllMarkets(
      [{ country: 'Atlantis', city: 'Atlantis' }],
      stubFetch([]) as never,
    );
    expect(markets).toEqual([]);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('surfaces rejections rather than swallowing them', async () => {
    const { rejections } = await fetchAllMarkets(
      [{ country: 'Italy', city: 'Milano' }],
      stubFetch([{ match: 'A2C.AM.R.A', body: sdmx('2026-07', 999) }]) as never,
    );
    expect(rejections.length).toBeGreaterThan(0);
    expect(rejections[0]?.reason).toBeTruthy();
  });
});

describe('OMI file importer', () => {
  it('expands a semester label into an explicit period', () => {
    expect(omiSemesterPeriod('2025-1')).toEqual({
      from: '2025-01-01',
      to: '2025-06-30',
      label: '2025 S1',
    });
    expect(omiSemesterPeriod('2025-2')?.to).toBe('2025-12-31');
    expect(omiSemesterPeriod('nonsense')).toBeNull();
  });

  it('tags prices as TRANSACTION and rent as per-MONTH, never ambiguous', () => {
    const payload = omiRowToPayload({
      comune: 'Milano',
      provincia: 'MI',
      zona: 'B1',
      zonaDescrizione: 'Navigli',
      tipologia: 'Abitazioni civili',
      compravenditaMin: 4_000,
      compravenditaMax: 5_000,
      locazioneMin: 14,
      locazioneMax: 18,
      semestre: '2025-1',
    })!;
    const price = payload.observations.find((o) => o.metric === 'avgPricePerSqm')!;
    const rent = payload.observations.find((o) => o.metric === 'avgRentPerSqmMonth')!;
    expect(price.unit.priceBasis).toBe('TRANSACTION');
    expect(rent.unit.period).toBe('MONTH');
    // Midpoint of the quoted range, and it says so.
    expect(price.value).toBe(4_500);
    expect(rent.value).toBe(16);
    expect(price.methodology).toMatch(/midpoint/i);
    expect(price.methodology).toMatch(/not asking prices/i);
  });

  it('resolves to neighbourhood level, the finest any source here reaches', () => {
    const payload = omiRowToPayload({
      comune: 'Milano',
      provincia: 'MI',
      zona: 'B1',
      zonaDescrizione: 'Navigli',
      tipologia: 'Abitazioni civili',
      compravenditaMin: 4_000,
      compravenditaMax: 5_000,
      locazioneMin: null,
      locazioneMax: null,
      semestre: '2025-1',
    })!;
    expect(payload.geography.level).toBe('NEIGHBORHOOD');
    expect(payload.geography.neighborhood).toContain('Navigli');
  });

  it('passes the full pipeline when the row is complete', () => {
    const payload = omiRowToPayload({
      comune: 'Milano',
      provincia: 'MI',
      zona: 'B1',
      zonaDescrizione: 'Navigli',
      tipologia: 'Abitazioni civili',
      compravenditaMin: 4_000,
      compravenditaMax: 5_000,
      locazioneMin: 14,
      locazioneMax: 18,
      semestre: '2025-1',
    })!;
    const result = runPipeline(payload);
    expect(result.rejected).toEqual([]);
    expect(result.accepted.avgPricePerSqm?.value).toBe(4_500);
    expect(result.accepted.avgRentPerSqmMonth?.currency).toBe('EUR');
  });

  it('reads the CSV by column NAME and rejects a file missing them', () => {
    const bad = parseOmiCsv('a;b;c\n1;2;3', '2025-1');
    expect(bad.rows).toEqual([]);
    expect(bad.errors[0]).toMatch(/Missing required column/);
    expect(bad.errors[0]).toMatch(/never by position/i);
  });

  it('parses Italian decimal commas and thousands separators', () => {
    const csv = [
      'Comune_descrizione;Prov;Zona;Zona_Descr;Descr_Tipologia;Compr_min;Compr_max;Loc_min;Loc_max',
      'Milano;MI;B1;Navigli;Abitazioni civili;4.000;5.000;14,5;18,2',
    ].join('\n');
    const { rows, errors } = parseOmiCsv(csv, '2025-1');
    expect(errors).toEqual([]);
    expect(rows[0]?.compravenditaMin).toBe(4_000);
    expect(rows[0]?.locazioneMin).toBe(14.5);
    expect(rows[0]?.locazioneMax).toBe(18.2);
  });

  it('tolerates a column order different from the documented one', () => {
    const csv = [
      'Loc_max;Comune_descrizione;Descr_Tipologia;Zona;Compr_min;Zona_Descr;Compr_max;Loc_min',
      '18;Milano;Abitazioni civili;B1;4000;Navigli;5000;14',
    ].join('\n');
    const { rows } = parseOmiCsv(csv, '2025-1');
    expect(rows[0]?.compravenditaMin).toBe(4_000);
    expect(rows[0]?.locazioneMax).toBe(18);
  });
});

describe('transcribed reference data', () => {
  it('is stamped TRANSCRIBED, which is a weaker claim than IMPORTED', async () => {
    const { referenceMarkets, isReferenceMarket } = await import('@/data/referenceData');
    const [italy] = referenceMarkets();
    expect(isReferenceMarket(italy!)).toBe(true);
    for (const point of Object.values(italy!.metrics)) {
      expect(point?.source.kind).toBe('TRANSCRIBED');
      expect(point?.source.sourceUrl).toBeTruthy();
      expect(point?.source.methodology.length).toBeGreaterThan(30);
      expect(point?.confidence).toBe('LOW');
    }
  });

  it('carries a standing warning telling the reader to verify it', async () => {
    const { referenceMarkets } = await import('@/data/referenceData');
    const { collectDataPointWarnings } = await import('@/domain/quality');
    const [italy] = referenceMarkets();
    const warnings = collectDataPointWarnings(
      italy!.metrics.mortgageRateNominal!,
      'Mortgage rate',
      new Date('2026-09-21'),
    );
    expect(warnings.map((w) => w.code)).toContain('TRANSCRIBED_DATA');
    expect(warnings.map((w) => w.code)).toContain('COARSE_GEOGRAPHY');
  });

  it('keeps the nominal rate BELOW the TAEG — the gap is the fee load', async () => {
    const { referenceMarkets } = await import('@/data/referenceData');
    const [italy] = referenceMarkets();
    const nominal = italy!.metrics.mortgageRateNominal!.value as number;
    const aprc = italy!.metrics.mortgageRateAprc!.value as number;
    expect(nominal).toBeLessThan(aprc);
    // The spread is the ancillary cost the model already carries separately.
    expect(aprc - nominal).toBeGreaterThan(0.001);
    expect(aprc - nominal).toBeLessThan(0.02);
  });

  it('does NOT store a single quarter as a 5-year annualised rate', async () => {
    const { referenceMarkets } = await import('@/data/referenceData');
    const [italy] = referenceMarkets();
    // The Q4 figure lives in its own metric; priceGrowth5y stays empty for a
    // 5y series, because storing one quarter there would misstate the trend.
    expect(italy!.metrics.priceGrowthLatestYoY?.value).toBeCloseTo(0.045, 10);
    expect(italy!.metrics.priceGrowth5y).toBeUndefined();
  });

  it('ships no city-level price or rent: those must come from OMI', async () => {
    const { referenceMarkets } = await import('@/data/referenceData');
    const [italy] = referenceMarkets();
    expect(italy!.metrics.avgPricePerSqm).toBeUndefined();
    expect(italy!.metrics.avgRentPerSqmMonth).toBeUndefined();
    expect(italy!.geography.level).toBe('COUNTRY');
  });

  it('passes the validator on every figure it ships', async () => {
    const { referenceMarkets } = await import('@/data/referenceData');
    const { validatePoint } = await import('@/data/pipeline');
    const [italy] = referenceMarkets();
    for (const [key, point] of Object.entries(italy!.metrics)) {
      const result = validatePoint(key as never, point!);
      expect(result.ok, `${key}: ${result.ok ? '' : result.reason}`).toBe(true);
    }
  });
});
