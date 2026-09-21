import { describe, expect, it } from 'vitest';
import { normalizeObservation, runPipeline, validatePoint, type RawMarketPayload, type RawObservation } from '@/data/pipeline';
import { UNITS } from '@/domain/units';
import type { Geography, Period } from '@/domain/datapoint';

const GEO: Geography = {
  country: 'Italy',
  region: 'Lombardia',
  city: 'Milan',
  neighborhood: null,
  level: 'CITY',
};

const PERIOD: Period = { from: '2024-01-01', to: '2024-12-31', label: '2024' };

const payload = (observations: RawObservation[]): RawMarketPayload => ({
  marketName: 'Milan',
  geography: GEO,
  source: 'Test source',
  sourceUrl: 'https://example.invalid',
  methodology: 'Test methodology.',
  observations,
});

const obs = (over: Partial<RawObservation> = {}): RawObservation => ({
  metric: 'avgRentPerSqmMonth',
  value: 15,
  unit: UNITS.rentPerSqmMonth,
  currency: 'EUR',
  period: PERIOD,
  confidence: 'HIGH',
  ...over,
});

describe('normalizer', () => {
  it('accepts a matching unit and stamps full provenance', () => {
    const r = normalizeObservation(obs(), payload([]), '2025-01-01T00:00:00.000Z');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.point.value).toBe(15);
      expect(r.point.dataClass).toBe('RAW_DATA');
      expect(r.point.source.source).toBe('Test source');
      expect(r.point.source.retrievedAt).toBe('2025-01-01T00:00:00.000Z');
      expect(r.point.period.label).toBe('2024');
      expect(r.point.geography.city).toBe('Milan');
      expect(r.point.currency).toBe('EUR');
    }
  });

  it('converts annual rent to the canonical monthly unit and says so', () => {
    const r = normalizeObservation(
      obs({ value: 180, unit: UNITS.rentPerSqmYear }),
      payload([]),
      '2025-01-01T00:00:00.000Z',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.point.value).toBeCloseTo(15, 10);
      expect(r.point.source.methodology).toMatch(/months/i);
    }
  });

  it('REJECTS an asking price offered for a transaction-price metric', () => {
    const r = normalizeObservation(
      obs({ metric: 'avgPricePerSqm', value: 3400, unit: UNITS.pricePerSqmAsking }),
      payload([]),
      '2025-01-01T00:00:00.000Z',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ASKING|TRANSACTION/);
  });

  it('REJECTS a rent with no stated period rather than guessing monthly', () => {
    const r = normalizeObservation(
      obs({ unit: { dimension: 'RENT_PER_AREA', moneyBasis: 'NOMINAL' } }),
      payload([]),
      '2025-01-01T00:00:00.000Z',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/period/i);
  });

  it('records a null from the source as MISSING, not as absent', () => {
    const r = normalizeObservation(obs({ value: null }), payload([]), '2025-01-01T00:00:00.000Z');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.point.value).toBeNull();
      expect(r.point.dataClass).toBe('MISSING');
    }
  });
});

describe('validator', () => {
  const point = (value: number, metric: 'vacancyRate' | 'avgPricePerSqm' = 'vacancyRate') => {
    const r = normalizeObservation(
      obs({
        metric,
        value,
        unit: metric === 'vacancyRate' ? UNITS.ratio : UNITS.pricePerSqmTransaction,
        currency: metric === 'vacancyRate' ? null : 'EUR',
      }),
      payload([]),
      '2025-01-01T00:00:00.000Z',
    );
    if (!r.ok) throw new Error(r.reason);
    return r.point;
  };

  it('accepts a plausible ratio', () => {
    expect(validatePoint('vacancyRate', point(0.06)).ok).toBe(true);
  });

  it('REJECTS a percentage mislabelled as a ratio rather than rescaling it', () => {
    const r = validatePoint('vacancyRate', point(6));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/plausible range/i);
  });

  it('REJECTS a money metric with no currency', () => {
    const p = { ...point(3400, 'avgPricePerSqm'), currency: null };
    const r = validatePoint('avgPricePerSqm', p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/currency/i);
  });

  it('REJECTS an inverted reporting period', () => {
    const p = {
      ...point(0.06),
      period: { from: '2024-12-31', to: '2024-01-01', label: 'inverted' },
    };
    const r = validatePoint('vacancyRate', p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ends before/i);
  });

  it('REJECTS a period ending in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    const p = {
      ...point(0.06),
      period: { from: '2024-01-01', to: future.toISOString().slice(0, 10), label: 'future' },
    };
    const r = validatePoint('vacancyRate', p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/future/i);
  });
});

describe('metric bounds', () => {
  it('accepts a country-level population, not just a city one', () => {
    const r = normalizeObservation(
      obs({ metric: 'population', value: 58_934_000, unit: UNITS.count, currency: null }),
      payload([]),
      '2025-01-01T00:00:00.000Z',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(validatePoint('population', r.point).ok).toBe(true);
  });

  it('still rejects a nonsensical population', () => {
    const r = normalizeObservation(
      obs({ metric: 'population', value: -5, unit: UNITS.count, currency: null }),
      payload([]),
      '2025-01-01T00:00:00.000Z',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(validatePoint('population', r.point).ok).toBe(false);
  });
});

describe('runPipeline', () => {
  it('keeps the good and reports every rejection with a reason', () => {
    const result = runPipeline(
      payload([
        obs(),
        obs({ metric: 'vacancyRate', value: 45, unit: UNITS.ratio, currency: null }),
        obs({ metric: 'avgPricePerSqm', value: 3400, unit: UNITS.pricePerSqmAsking }),
      ]),
    );

    expect(Object.keys(result.accepted)).toEqual(['avgRentPerSqmMonth']);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.map((r) => r.stage).sort()).toEqual(['NORMALIZE', 'VALIDATE']);
    for (const rejection of result.rejected) {
      expect(rejection.reason.length).toBeGreaterThan(20);
      expect(rejection.metricLabel).toBeTruthy();
    }
  });

  it('never silently drops an observation without recording it', () => {
    const observations = [
      obs(),
      obs({ metric: 'vacancyRate', value: 45, unit: UNITS.ratio, currency: null }),
    ];
    const result = runPipeline(payload(observations));
    expect(Object.keys(result.accepted).length + result.rejected.length).toBe(observations.length);
  });
});
