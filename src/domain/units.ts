/**
 * Units, and the rules for refusing to convert between them.
 *
 * The failure mode this module exists to prevent: a source publishes rent as
 * €/m²/YEAR, the tool reads it as €/m²/MONTH, and every yield downstream is
 * twelve times too large — with no error anywhere. Unit bugs do not announce
 * themselves; they produce plausible numbers.
 *
 * So units are structured rather than free text. A unit is a dimension plus
 * the qualifiers that dimension requires, and conversion is only permitted
 * between units that differ on a SCALE qualifier (month vs year). Units that
 * differ on a SEMANTIC qualifier — asking vs transaction price, nominal vs
 * real — are NOT convertible at any rate, because the difference is not a
 * factor, it is a different measurement of a different thing.
 *
 * Nothing here ever "corrects" an ambiguous unit. An unconvertible pair is
 * reported and the datum is dropped.
 */

/** What is being measured. */
export type Dimension =
  | 'PRICE_ABSOLUTE' //  a price, in currency
  | 'PRICE_PER_AREA' //  currency per m²
  | 'RENT_ABSOLUTE' //   rent, in currency per period
  | 'RENT_PER_AREA' //   currency per m² per period
  | 'RATIO' //           a decimal share, 0.05 = 5%
  | 'COUNT' //           people, transactions, nights
  | 'DURATION_DAYS' //   days
  | 'INDEX'; //          a unitless index with no defined scale

/** Time basis for a flow. Convertible: a year is twelve months. */
export type PeriodBasis = 'MONTH' | 'YEAR';

/**
 * Which price a figure refers to. NOT convertible.
 *
 * Asking prices sit above transaction prices by a discount that varies with
 * the market, the vendor and the moment. There is no constant to apply, and
 * applying an assumed one silently would bake a guess into "source data".
 */
export type PriceBasis = 'ASKING' | 'TRANSACTION' | 'VALUATION';

/**
 * Whether a figure is in money of the day or inflation-adjusted. NOT
 * convertible without a price index for the right country and period, which
 * this tool does not carry.
 */
export type MoneyBasis = 'NOMINAL' | 'REAL';

export interface Unit {
  dimension: Dimension;
  /** Required for RENT_* dimensions. */
  period?: PeriodBasis;
  /** Required for PRICE_* dimensions. */
  priceBasis?: PriceBasis;
  /** Required for every money dimension. */
  moneyBasis?: MoneyBasis;
}

export type ConversionOutcome =
  | { ok: true; factor: number; note: string | null }
  | { ok: false; reason: string };

const MONTHS_PER_YEAR = 12;

function isMoneyDimension(d: Dimension): boolean {
  return (
    d === 'PRICE_ABSOLUTE' ||
    d === 'PRICE_PER_AREA' ||
    d === 'RENT_ABSOLUTE' ||
    d === 'RENT_PER_AREA'
  );
}

function isRentDimension(d: Dimension): boolean {
  return d === 'RENT_ABSOLUTE' || d === 'RENT_PER_AREA';
}

function isPriceDimension(d: Dimension): boolean {
  return d === 'PRICE_ABSOLUTE' || d === 'PRICE_PER_AREA';
}

/** Human-readable unit label, e.g. "EUR/m²/month (nominal)". */
export function formatUnit(unit: Unit, currency?: string | null): string {
  const money = currency ?? '';
  const parts: string[] = [];
  switch (unit.dimension) {
    case 'PRICE_ABSOLUTE':
      parts.push(money || 'currency');
      break;
    case 'PRICE_PER_AREA':
      parts.push(`${money || 'currency'}/m²`);
      break;
    case 'RENT_ABSOLUTE':
      parts.push(`${money || 'currency'}/${unit.period === 'YEAR' ? 'year' : 'month'}`);
      break;
    case 'RENT_PER_AREA':
      parts.push(`${money || 'currency'}/m²/${unit.period === 'YEAR' ? 'year' : 'month'}`);
      break;
    case 'RATIO':
      parts.push('ratio');
      break;
    case 'COUNT':
      parts.push('count');
      break;
    case 'DURATION_DAYS':
      parts.push('days');
      break;
    case 'INDEX':
      parts.push('index');
      break;
  }
  const qualifiers: string[] = [];
  if (unit.priceBasis) qualifiers.push(unit.priceBasis.toLowerCase());
  if (unit.moneyBasis) qualifiers.push(unit.moneyBasis.toLowerCase());
  return qualifiers.length > 0 ? `${parts[0]} (${qualifiers.join(', ')})` : (parts[0] as string);
}

/**
 * Check that a unit carries the qualifiers its dimension requires.
 *
 * An under-specified unit is rejected rather than defaulted. "€/m²" with no
 * period is exactly the ambiguity that causes the twelve-times error, and
 * guessing "probably monthly" is how it gets shipped.
 */
export function validateUnit(unit: Unit): { ok: true } | { ok: false; reason: string } {
  if (isRentDimension(unit.dimension) && !unit.period) {
    return {
      ok: false,
      reason: `${unit.dimension} requires an explicit period (MONTH or YEAR). A rent figure with no stated period is ambiguous and will not be guessed.`,
    };
  }
  if (isPriceDimension(unit.dimension) && !unit.priceBasis) {
    return {
      ok: false,
      reason: `${unit.dimension} requires an explicit price basis (ASKING, TRANSACTION or VALUATION). Asking and transaction prices are different measurements.`,
    };
  }
  if (isMoneyDimension(unit.dimension) && !unit.moneyBasis) {
    return {
      ok: false,
      reason: `${unit.dimension} requires an explicit money basis (NOMINAL or REAL).`,
    };
  }
  return { ok: true };
}

/**
 * The factor converting a value in `from` into `to`, or a refusal.
 *
 * Permitted: a change of period on a rent (× or ÷ 12).
 * Refused: any change of dimension, price basis, money basis or currency.
 */
export function convert(from: Unit, to: Unit): ConversionOutcome {
  const fromValid = validateUnit(from);
  if (!fromValid.ok) return { ok: false, reason: `Source unit invalid: ${fromValid.reason}` };
  const toValid = validateUnit(to);
  if (!toValid.ok) return { ok: false, reason: `Target unit invalid: ${toValid.reason}` };

  if (from.dimension !== to.dimension) {
    return {
      ok: false,
      reason: `Cannot convert ${from.dimension} to ${to.dimension}. These measure different things; there is no factor between them.`,
    };
  }

  if (from.moneyBasis !== to.moneyBasis) {
    return {
      ok: false,
      reason: `Cannot convert ${from.moneyBasis} to ${to.moneyBasis}. Converting between nominal and real requires a price index for the right country and period, which this tool does not hold.`,
    };
  }

  if (from.priceBasis !== to.priceBasis) {
    return {
      ok: false,
      reason: `Cannot convert an ${from.priceBasis} price to a ${to.priceBasis} price. The gap between them varies by market and moment; there is no constant to apply.`,
    };
  }

  if (isRentDimension(from.dimension) && from.period !== to.period) {
    if (from.period === 'MONTH' && to.period === 'YEAR') {
      return { ok: true, factor: MONTHS_PER_YEAR, note: 'Monthly rent annualised (x12).' };
    }
    if (from.period === 'YEAR' && to.period === 'MONTH') {
      return { ok: true, factor: 1 / MONTHS_PER_YEAR, note: 'Annual rent divided into months (/12).' };
    }
  }

  return { ok: true, factor: 1, note: null };
}

/**
 * Convert a value, or return null with the reason.
 * Callers must surface the reason rather than falling back to the raw value.
 */
export function convertValue(
  value: number,
  from: Unit,
  to: Unit,
): { ok: true; value: number; note: string | null } | { ok: false; reason: string } {
  const outcome = convert(from, to);
  if (!outcome.ok) return outcome;
  return { ok: true, value: value * outcome.factor, note: outcome.note };
}

/** Two currencies are the same, or they are not. No FX rates are carried. */
export function currenciesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toUpperCase() === b.toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Shorthands for the units the app actually uses
 * ------------------------------------------------------------------ */

export const UNITS = {
  pricePerSqmAsking: {
    dimension: 'PRICE_PER_AREA',
    priceBasis: 'ASKING',
    moneyBasis: 'NOMINAL',
  } satisfies Unit,
  pricePerSqmTransaction: {
    dimension: 'PRICE_PER_AREA',
    priceBasis: 'TRANSACTION',
    moneyBasis: 'NOMINAL',
  } satisfies Unit,
  rentPerSqmMonth: {
    dimension: 'RENT_PER_AREA',
    period: 'MONTH',
    moneyBasis: 'NOMINAL',
  } satisfies Unit,
  rentPerSqmYear: {
    dimension: 'RENT_PER_AREA',
    period: 'YEAR',
    moneyBasis: 'NOMINAL',
  } satisfies Unit,
  rentMonth: {
    dimension: 'RENT_ABSOLUTE',
    period: 'MONTH',
    moneyBasis: 'NOMINAL',
  } satisfies Unit,
  ratio: { dimension: 'RATIO' } satisfies Unit,
  count: { dimension: 'COUNT' } satisfies Unit,
  days: { dimension: 'DURATION_DAYS' } satisfies Unit,
  index: { dimension: 'INDEX' } satisfies Unit,
} as const;
