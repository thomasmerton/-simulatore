import { describe, expect, it } from 'vitest';
import {
  UNITS,
  convert,
  convertValue,
  currenciesMatch,
  formatUnit,
  validateUnit,
} from '@/domain/units';

describe('validateUnit rejects under-specified units', () => {
  it('refuses a rent with no period — the twelve-times bug', () => {
    const r = validateUnit({ dimension: 'RENT_PER_AREA', moneyBasis: 'NOMINAL' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/period/i);
  });

  it('refuses a price with no basis', () => {
    const r = validateUnit({ dimension: 'PRICE_PER_AREA', moneyBasis: 'NOMINAL' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/asking|transaction/i);
  });

  it('refuses money with no nominal/real basis', () => {
    const r = validateUnit({ dimension: 'RENT_ABSOLUTE', period: 'MONTH' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/nominal|real/i);
  });

  it('accepts a fully specified unit', () => {
    expect(validateUnit(UNITS.rentPerSqmMonth).ok).toBe(true);
    expect(validateUnit(UNITS.pricePerSqmTransaction).ok).toBe(true);
    expect(validateUnit(UNITS.ratio).ok).toBe(true);
  });
});

describe('convert permits only scale changes', () => {
  it('annualises a monthly rent', () => {
    const r = convert(UNITS.rentPerSqmMonth, UNITS.rentPerSqmYear);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.factor).toBe(12);
  });

  it('divides an annual rent into months', () => {
    const r = convert(UNITS.rentPerSqmYear, UNITS.rentPerSqmMonth);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.factor).toBeCloseTo(1 / 12, 12);
  });

  it('is the identity for matching units', () => {
    const r = convert(UNITS.rentPerSqmMonth, UNITS.rentPerSqmMonth);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.factor).toBe(1);
  });

  it('REFUSES asking -> transaction price: there is no constant', () => {
    const r = convert(UNITS.pricePerSqmAsking, UNITS.pricePerSqmTransaction);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ASKING|TRANSACTION/);
  });

  it('REFUSES nominal -> real: needs a price index we do not hold', () => {
    const r = convert(
      { dimension: 'RENT_ABSOLUTE', period: 'MONTH', moneyBasis: 'NOMINAL' },
      { dimension: 'RENT_ABSOLUTE', period: 'MONTH', moneyBasis: 'REAL' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/index/i);
  });

  it('REFUSES a change of dimension', () => {
    const r = convert(UNITS.rentPerSqmMonth, UNITS.pricePerSqmTransaction);
    expect(r.ok).toBe(false);
  });

  it('REFUSES rent-per-area -> rent-absolute: needs an area it does not have', () => {
    const r = convert(UNITS.rentPerSqmMonth, UNITS.rentMonth);
    expect(r.ok).toBe(false);
  });
});

describe('convertValue', () => {
  it('applies the factor and reports the note', () => {
    const r = convertValue(10, UNITS.rentPerSqmMonth, UNITS.rentPerSqmYear);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(120);
      expect(r.note).toMatch(/annualised/i);
    }
  });

  it('never silently returns the raw value on refusal', () => {
    const r = convertValue(3000, UNITS.pricePerSqmAsking, UNITS.pricePerSqmTransaction);
    expect(r.ok).toBe(false);
    expect('value' in r).toBe(false);
  });
});

describe('currency matching', () => {
  it('matches case-insensitively and refuses unknowns', () => {
    expect(currenciesMatch('eur', 'EUR')).toBe(true);
    expect(currenciesMatch('EUR', 'SEK')).toBe(false);
    expect(currenciesMatch(null, 'EUR')).toBe(false);
  });
});

describe('formatUnit', () => {
  it('spells out period and basis so a label cannot be ambiguous', () => {
    expect(formatUnit(UNITS.rentPerSqmMonth, 'EUR')).toBe('EUR/m²/month (nominal)');
    expect(formatUnit(UNITS.rentPerSqmYear, 'EUR')).toBe('EUR/m²/year (nominal)');
    expect(formatUnit(UNITS.pricePerSqmAsking, 'EUR')).toBe('EUR/m² (asking, nominal)');
  });
});
