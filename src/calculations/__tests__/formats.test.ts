/**
 * Parser tests.
 *
 * The fixtures below are SHAPES, not data: they exercise the wire formats the
 * providers must read. The numbers in them are arbitrary and are never shipped
 * anywhere — real figures come from a live fetch.
 */

import { describe, expect, it } from 'vitest';
import { parseJsonStat, parsePeriodLabel, parseSdmx } from '@/data/formats';

describe('JSON-stat 2.0 (Eurostat)', () => {
  const payload = {
    id: ['freq', 'unit', 'geo', 'time'],
    size: [1, 1, 1, 3],
    dimension: {
      time: { category: { index: { '2022': 0, '2023': 1, '2024': 2 } } },
    },
    value: { '0': 1.1, '1': 2.2, '2': 3.3 },
  };

  it('reads the series in period order', () => {
    expect(parseJsonStat(payload)).toEqual([
      { period: '2022', value: 1.1 },
      { period: '2023', value: 2.2 },
      { period: '2024', value: 3.3 },
    ]);
  });

  it('computes the stride when time is not the last dimension', () => {
    // id: [geo, time, unit] with 2 units => time stride is 2.
    const strided = {
      id: ['geo', 'time', 'unit'],
      size: [1, 2, 1],
      dimension: { time: { category: { index: { '2023': 0, '2024': 1 } } } },
      value: { '0': 10, '1': 20 },
    };
    expect(parseJsonStat(strided)).toEqual([
      { period: '2023', value: 10 },
      { period: '2024', value: 20 },
    ]);
  });

  it('reports a gap in the sparse value map as null, not zero', () => {
    const sparse = { ...payload, value: { '0': 1.1, '2': 3.3 } };
    expect(parseJsonStat(sparse)[1]).toEqual({ period: '2023', value: null });
  });

  it('REFUSES a query that resolved to more than one series', () => {
    // Two geos in one response: picking one would be arbitrary.
    const ambiguous = {
      id: ['geo', 'time'],
      size: [2, 2],
      dimension: { time: { category: { index: { '2023': 0, '2024': 1 } } } },
      value: { '0': 1, '1': 2, '2': 3, '3': 4 },
    };
    expect(() => parseJsonStat(ambiguous)).toThrow(/Narrow the query/);
  });

  it('throws rather than returning an empty series when the shape is wrong', () => {
    expect(() => parseJsonStat({})).toThrow(/id\/size/);
    expect(() => parseJsonStat({ id: ['geo'], size: [1] })).toThrow(/"time"/);
  });
});

describe('SDMX-JSON (ECB, ISTAT)', () => {
  const payload = {
    dataSets: [
      { series: { '0:0:0': { observations: { '0': [3.81], '1': [3.95] } } } },
    ],
    structure: {
      dimensions: {
        observation: [
          { id: 'TIME_PERIOD', values: [{ id: '2026-07' }, { id: '2026-08' }] },
        ],
      },
    },
  };

  it('pairs observations with their period labels', () => {
    expect(parseSdmx(payload)).toEqual([
      { period: '2026-07', value: 3.81 },
      { period: '2026-08', value: 3.95 },
    ]);
  });

  it('REFUSES a key that resolved to more than one series', () => {
    const ambiguous = {
      ...payload,
      dataSets: [
        {
          series: {
            '0:0:0': { observations: { '0': [1] } },
            '0:0:1': { observations: { '0': [2] } },
          },
        },
      ],
    };
    expect(() => parseSdmx(ambiguous)).toThrow(/Narrow the key/);
  });

  it('drops an observation whose period label is absent rather than mis-dating it', () => {
    const extra = {
      ...payload,
      dataSets: [{ series: { '0:0:0': { observations: { '0': [1], '7': [9] } } } }],
    };
    expect(parseSdmx(extra)).toEqual([{ period: '2026-07', value: 1 }]);
  });

  it('throws on a payload with no time dimension', () => {
    expect(() => parseSdmx({ dataSets: [{ series: {} }] })).toThrow(/TIME_PERIOD/);
  });
});

describe('parsePeriodLabel', () => {
  it('expands a year', () => {
    expect(parsePeriodLabel('2024')).toEqual({
      from: '2024-01-01',
      to: '2024-12-31',
      label: '2024',
    });
  });

  it('expands a quarter, respecting month lengths', () => {
    expect(parsePeriodLabel('2024-Q1')).toEqual({
      from: '2024-01-01',
      to: '2024-03-31',
      label: '2024 Q1',
    });
    expect(parsePeriodLabel('2024Q4')).toEqual({
      from: '2024-10-01',
      to: '2024-12-31',
      label: '2024 Q4',
    });
  });

  it('expands a month, including a leap February', () => {
    expect(parsePeriodLabel('2024-02')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
      label: '2024-02',
    });
    expect(parsePeriodLabel('2023-02')?.to).toBe('2023-02-28');
  });

  it('REJECTS an unrecognised label rather than guessing a period', () => {
    expect(parsePeriodLabel('latest')).toBeNull();
    expect(parsePeriodLabel('2024-13')).toBeNull();
    expect(parsePeriodLabel('')).toBeNull();
  });
});
