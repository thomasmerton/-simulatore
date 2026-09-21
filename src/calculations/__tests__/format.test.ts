import { describe, expect, it } from 'vitest';
import {
  UNAVAILABLE,
  formatCurrency,
  formatCurrencyCompact,
  formatMultiple,
  formatPercent,
  parseNumber,
  parsePercent,
  percentToInput,
  roundMoney,
} from '@/ui/format';

describe('formatting never disguises a missing value as zero', () => {
  it.each([null, undefined, NaN, Infinity])('renders %s as an explicit placeholder', (v) => {
    expect(formatCurrency(v as number)).toBe(UNAVAILABLE);
    expect(formatPercent(v as number)).toBe(UNAVAILABLE);
    expect(formatMultiple(v as number)).toBe(UNAVAILABLE);
  });

  it('still renders a genuine zero as zero', () => {
    expect(formatCurrency(0)).toContain('0');
    expect(formatPercent(0)).toContain('0');
  });
});

describe('formatCurrencyCompact', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCurrencyCompact(252_500)).toContain('k');
    expect(formatCurrencyCompact(1_200_000)).toContain('M');
  });

  it('leaves small amounts in full', () => {
    expect(formatCurrencyCompact(950)).not.toContain('k');
  });
});

describe('parsing', () => {
  it('treats a blank field as not provided, not as zero', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
    expect(parseNumber('0')).toBe(0);
  });

  it('accepts a comma decimal separator', () => {
    expect(parseNumber('1234,5')).toBe(1234.5);
  });

  it('rejects non-numeric input rather than coercing it', () => {
    expect(parseNumber('abc')).toBeNull();
  });

  it('converts a typed percentage to a decimal and back without float artefacts', () => {
    expect(parsePercent('5.5')).toBeCloseTo(0.055, 10);
    expect(percentToInput(0.07)).toBe('7');
    expect(percentToInput(parsePercent('3.75'))).toBe('3.75');
  });
});

describe('roundMoney', () => {
  it('removes binary float artefacts from derived amounts', () => {
    // 180000 * 0.7 is 125999.99999999999 in IEEE 754.
    expect(roundMoney(180_000 * 0.7)).toBe(126_000);
    expect(roundMoney(180_000 * (1 - 0.7))).toBe(54_000);
  });

  it('keeps genuine cents', () => {
    expect(roundMoney(1234.567)).toBe(1234.57);
    expect(roundMoney(-0.005)).toBe(-0);
  });
});
