/**
 * Formatting.
 *
 * A missing value always renders as an explicit placeholder, never as 0, "-"
 * or an empty cell. The user must be able to tell "zero" from "we don't know".
 */

export const UNAVAILABLE = 'Data unavailable';
export const NOT_CALCULABLE = 'Not calculable';

const locale = 'en-GB';

export function formatCurrency(
  value: number | null | undefined,
  currency = 'EUR',
  fractionDigits = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Compact currency for headline tiles: €252.5k, €1.2M. */
export function formatCurrencyCompact(value: number | null | undefined, currency = 'EUR'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatCurrency(value / 1_000_000, currency, 2)}M`.replace('.00M', 'M');
  if (abs >= 10_000) return `${formatCurrency(value / 1_000, currency, 1)}k`.replace('.0k', 'k');
  return formatCurrency(value, currency, 0);
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatInteger(value: number | null | undefined): string {
  return formatNumber(value, 0);
}

export function formatYears(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return `${formatNumber(value, 1)} yr`;
}

export function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE;
  return `${formatNumber(value, 2)}x`;
}

export type ValueFormat = 'currency' | 'percent' | 'number' | 'years' | 'integer' | 'multiple';

export function formatValue(
  value: number | null | undefined,
  format: ValueFormat,
  currency = 'EUR',
): string {
  switch (format) {
    case 'currency':
      return formatCurrency(value, currency);
    case 'percent':
      return formatPercent(value);
    case 'years':
      return formatYears(value);
    case 'integer':
      return formatInteger(value);
    case 'multiple':
      return formatMultiple(value);
    case 'number':
    default:
      return formatNumber(value);
  }
}

/**
 * Round a derived amount to whole currency cents.
 *
 * Products like `price * (1 - ltv)` land on binary-float artefacts
 * (180000 * 0.7 = 125999.99999999999), which then appear verbatim in a number
 * input. Any amount computed rather than typed goes through here.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Parse a user-typed string into a number, treating blank as "not provided". */
export function parseNumber(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, '').replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Percentages are entered as 5.5 and stored as 0.055. */
export function parsePercent(input: string): number | null {
  const value = parseNumber(input);
  return value === null ? null : value / 100;
}

export function percentToInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  // Guard against binary float artefacts such as 0.07000000000000001.
  return String(Math.round(value * 1_000_000) / 10_000);
}

export function numberToInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value);
}
