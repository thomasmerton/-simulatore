import { describe, expect, it } from 'vitest';
import {
  assessConfidence,
  collectDataPointWarnings,
  collectInputWarnings,
  precisionFor,
  sortWarnings,
  STALE_DATA_MONTHS,
} from '@/domain/quality';
import { classCounts, weakestProvenance } from '@/domain/provenance';
import type { ProvenanceMap } from '@/domain/provenance';
import { emptyPropertyInputs } from '@/domain/defaults';
import type { DataPoint } from '@/domain/datapoint';
import { UNITS } from '@/domain/units';

const PATHS = ['rental.monthlyRent', 'facts.purchasePrice', 'exit.priceGrowthRate'];

describe('assessConfidence follows the stated rules, not a score', () => {
  it('is LOW when a required input is missing', () => {
    const map: ProvenanceMap = {
      'rental.monthlyRent': 'MISSING',
      'facts.purchasePrice': 'USER_INPUT',
      'exit.priceGrowthRate': 'USER_INPUT',
    };
    const a = assessConfidence(map, PATHS);
    expect(a.level).toBe('LOW');
    expect(a.missing).toEqual(['rental.monthlyRent']);
    expect(a.reason).toMatch(/missing/i);
  });

  it('is LOW when a critical driver is only a default, even if all else is solid', () => {
    const map: ProvenanceMap = {
      'rental.monthlyRent': 'USER_INPUT',
      'facts.purchasePrice': 'USER_INPUT',
      'exit.priceGrowthRate': 'MODEL_ASSUMPTION',
    };
    const a = assessConfidence(map, PATHS);
    expect(a.level).toBe('LOW');
    expect(a.reason).toMatch(/structurally most sensitive/i);
  });

  it('is MEDIUM when everything is present but something is derived', () => {
    const map: ProvenanceMap = {
      'rental.monthlyRent': 'DERIVED_DATA',
      'facts.purchasePrice': 'USER_INPUT',
      'exit.priceGrowthRate': 'USER_INPUT',
    };
    expect(assessConfidence(map, PATHS).level).toBe('MEDIUM');
  });

  it('is HIGH only when every input is user input or source data', () => {
    const map: ProvenanceMap = {
      'rental.monthlyRent': 'USER_INPUT',
      'facts.purchasePrice': 'RAW_DATA',
      'exit.priceGrowthRate': 'USER_INPUT',
    };
    const a = assessConfidence(map, PATHS);
    expect(a.level).toBe('HIGH');
    // And it must NOT claim the inputs are correct.
    expect(a.reason).toMatch(/does not mean the figures are right/i);
  });

  it('is LOW when more than half the inputs are defaults', () => {
    const map: ProvenanceMap = {
      a: 'MODEL_ASSUMPTION',
      b: 'MODEL_ASSUMPTION',
      c: 'MODEL_ASSUMPTION',
      d: 'USER_INPUT',
    };
    expect(assessConfidence(map, ['a', 'b', 'c', 'd']).level).toBe('LOW');
  });

  it('treats an unlisted path as missing rather than assuming it is fine', () => {
    expect(assessConfidence({}, ['unknown.path']).level).toBe('LOW');
  });
});

describe('precisionFor caps false precision', () => {
  it('shows fewer decimals the less confident the result is', () => {
    expect(precisionFor('HIGH')).toBe(2);
    expect(precisionFor('MEDIUM')).toBe(1);
    expect(precisionFor('LOW')).toBe(0);
  });
});

describe('provenance helpers', () => {
  it('finds the weakest-attributed class in a dependency set', () => {
    const map: ProvenanceMap = { a: 'RAW_DATA', b: 'USER_INPUT', c: 'MODEL_ASSUMPTION' };
    expect(weakestProvenance(map, ['a', 'b'])).toBe('USER_INPUT');
    expect(weakestProvenance(map, ['a', 'b', 'c'])).toBe('MODEL_ASSUMPTION');
    expect(weakestProvenance(map, ['a', 'zzz'])).toBe('MISSING');
  });

  it('counts classes across a path set', () => {
    const map: ProvenanceMap = { a: 'RAW_DATA', b: 'RAW_DATA', c: 'MISSING' };
    const counts = classCounts(map, ['a', 'b', 'c', 'd']);
    expect(counts.RAW_DATA).toBe(2);
    expect(counts.MISSING).toBe(2);
  });
});

describe('input warnings', () => {
  const inputs = () => {
    const i = emptyPropertyInputs();
    i.facts.purchasePrice = 200_000;
    i.rental.monthlyRent = 1_000;
    return i;
  };

  it('warns loudly when rent is estimated rather than observed', () => {
    const w = collectInputWarnings(inputs(), { 'rental.monthlyRent': 'MODEL_ASSUMPTION' });
    const rent = w.find((x) => x.code === 'RENT_ESTIMATED');
    expect(rent?.severity).toBe('SERIOUS');
  });

  it('warns that the exit value rests on a default appreciation rate', () => {
    const w = collectInputWarnings(inputs(), { 'exit.priceGrowthRate': 'MODEL_ASSUMPTION' });
    expect(w.find((x) => x.code === 'EXIT_VALUE_ASSUMED')?.severity).toBe('SERIOUS');
  });

  it('catches a renovation project with no renovation budget', () => {
    const i = inputs();
    i.facts.condition = 'TO_GUT';
    i.acquisition.renovationCost = 0;
    const w = collectInputWarnings(i, {});
    expect(w.find((x) => x.code === 'RENOVATION_INCOMPLETE')?.severity).toBe('SERIOUS');
    expect(w.some((x) => x.code === 'NO_STABILIZATION')).toBe(true);
  });

  it('says plainly when the analysis is pre-tax', () => {
    const w = collectInputWarnings(inputs(), {});
    expect(w.some((x) => x.code === 'PRE_TAX_ONLY')).toBe(true);
  });

  it('demands professional verification for an unverified tax profile', () => {
    const w = collectInputWarnings(inputs(), {}, { taxProfileVerified: false });
    expect(w.find((x) => x.code === 'TAX_UNVERIFIED')?.severity).toBe('SERIOUS');
  });

  it('does not warn about tax verification when no profile is applied', () => {
    const w = collectInputWarnings(inputs(), {});
    expect(w.some((x) => x.code === 'TAX_UNVERIFIED')).toBe(false);
  });

  it('warns when a valuation books equity at purchase', () => {
    const i = inputs();
    i.facts.marketValue = 240_000;
    const w = collectInputWarnings(i, {});
    expect(w.some((x) => x.code === 'VALUE_ABOVE_PRICE')).toBe(true);
  });

  it('reports the strategy gap when revenue cannot be computed', () => {
    const w = collectInputWarnings(inputs(), {}, {
      strategyMissing: ['rental.shortTerm.averageDailyRate'],
    });
    expect(w.find((x) => x.code === 'STRATEGY_INCOMPLETE')?.severity).toBe('SERIOUS');
  });

  it('flags an interest-only loan as a balloon risk', () => {
    const i = inputs();
    i.financing = { ...i.financing, enabled: true, amortizationType: 'INTEREST_ONLY' };
    expect(collectInputWarnings(i, {}).some((x) => x.code === 'BALLOON_RISK')).toBe(true);
  });

  it('sorts the serious ones first', () => {
    const w = sortWarnings([
      { code: 'a', severity: 'INFO', message: '', paths: [] },
      { code: 'b', severity: 'SERIOUS', message: '', paths: [] },
      { code: 'c', severity: 'CAUTION', message: '', paths: [] },
    ]);
    expect(w.map((x) => x.severity)).toEqual(['SERIOUS', 'CAUTION', 'INFO']);
  });
});

describe('data point warnings', () => {
  const point = (over: Partial<DataPoint> = {}): DataPoint => ({
    value: 3_400,
    unit: UNITS.pricePerSqmTransaction,
    currency: 'EUR',
    geography: { country: 'Italy', region: null, city: 'Milan', neighborhood: null, level: 'CITY' },
    period: { from: '2024-01-01', to: '2024-12-31', label: '2024' },
    source: {
      source: 'Test',
      sourceUrl: null,
      retrievedAt: '2025-01-01T00:00:00.000Z',
      methodology: 'Test.',
      kind: 'IMPORTED',
    },
    confidence: 'HIGH',
    dataClass: 'RAW_DATA',
    ...over,
  });

  it('flags example data above everything else and stops there', () => {
    const w = collectDataPointWarnings(
      point({ source: { ...point().source, kind: 'EXAMPLE' } }),
      'Price',
    );
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe('EXAMPLE_DATA');
    expect(w[0]!.severity).toBe('SERIOUS');
  });

  it('flags data older than the staleness threshold', () => {
    const old = new Date();
    old.setMonth(old.getMonth() + STALE_DATA_MONTHS + 6);
    const w = collectDataPointWarnings(point(), 'Price', old);
    expect(w.some((x) => x.code === 'STALE_DATA')).toBe(true);
  });

  it('does not flag fresh data as stale', () => {
    const w = collectDataPointWarnings(point(), 'Price', new Date('2025-02-01'));
    expect(w.some((x) => x.code === 'STALE_DATA')).toBe(false);
  });

  it('flags a country-level figure used for a specific property', () => {
    const w = collectDataPointWarnings(
      point({
        geography: {
          country: 'Italy',
          region: null,
          city: null,
          neighborhood: null,
          level: 'COUNTRY',
        },
      }),
      'Price',
      new Date('2025-02-01'),
    );
    expect(w.some((x) => x.code === 'COARSE_GEOGRAPHY')).toBe(true);
  });

  it("passes on the publisher's own low confidence", () => {
    const w = collectDataPointWarnings(point({ confidence: 'LOW' }), 'Price', new Date('2025-02-01'));
    expect(w.some((x) => x.code === 'LOW_SOURCE_CONFIDENCE')).toBe(true);
  });
});
