/**
 * Low-level financial primitives.
 *
 * Every function here is pure and total: given unusable inputs it returns
 * `null` rather than a plausible-looking number. A wrong number that looks
 * right is worse than no number at all.
 */

/** Days used to convert vacancy days into an occupancy rate. */
export const DAYS_PER_YEAR = 365;
export const MONTHS_PER_YEAR = 12;

/** IRR solver configuration. */
export const IRR_TOLERANCE = 1e-7;
export const IRR_MAX_ITERATIONS = 200;
/** Bracketing bounds for the bisection fallback: -99.99% to +1000% per period. */
export const IRR_LOWER_BOUND = -0.9999;
export const IRR_UPPER_BOUND = 10;

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Net present value of a cash flow series.
 *
 *   NPV = Σ  CF_t / (1 + r)^t      for t = 0..n
 *
 * Convention: `flows[0]` occurs at t=0 and is NOT discounted. Subsequent flows
 * are end-of-period. This matches the projection engine, which places the
 * initial equity outlay at t=0 and every operating cash flow at year end.
 *
 * Returns null if the rate is <= -100% (division by zero or sign flips).
 */
export function npv(rate: number, flows: readonly number[]): number | null {
  if (!isFiniteNumber(rate) || rate <= -1) return null;
  if (flows.length === 0) return null;
  let total = 0;
  for (let t = 0; t < flows.length; t++) {
    const cf = flows[t];
    if (!isFiniteNumber(cf)) return null;
    total += cf / Math.pow(1 + rate, t);
  }
  return total;
}

/** d(NPV)/d(rate). Used by the Newton step of the IRR solver. */
function npvDerivative(rate: number, flows: readonly number[]): number {
  let total = 0;
  for (let t = 1; t < flows.length; t++) {
    total += (-t * (flows[t] as number)) / Math.pow(1 + rate, t + 1);
  }
  return total;
}

/**
 * Internal rate of return: the rate r for which NPV(r) = 0.
 *
 * Periods are uniform (this engine uses annual periods) and `flows[0]` is the
 * t=0 outlay. Solved by Newton-Raphson with a bisection fallback, because
 * Newton alone diverges on the flat, near-zero-gradient series that a
 * low-leverage property produces.
 *
 * Returns null when:
 *   - the series never changes sign (no IRR exists);
 *   - no root can be bracketed within [-99.99%, +1000%];
 *   - the solver fails to converge.
 *
 * NOTE: a series with more than one sign change may admit multiple IRRs. We
 * return the first root found within the bracket and the caller is expected to
 * surface the multiple-sign-change warning (see `signChanges`).
 */
export function irr(flows: readonly number[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.every(isFiniteNumber)) return null;
  if (signChanges(flows) === 0) return null;

  // --- Newton-Raphson from a neutral starting guess.
  let rate = 0.1;
  for (let i = 0; i < IRR_MAX_ITERATIONS; i++) {
    const value = npv(rate, flows);
    if (value === null) break;
    if (Math.abs(value) < IRR_TOLERANCE) return rate;
    const slope = npvDerivative(rate, flows);
    if (!isFiniteNumber(slope) || Math.abs(slope) < 1e-12) break;
    const next = rate - value / slope;
    if (!isFiniteNumber(next) || next <= IRR_LOWER_BOUND || next > IRR_UPPER_BOUND) break;
    if (Math.abs(next - rate) < IRR_TOLERANCE) return next;
    rate = next;
  }

  // --- Bisection fallback over the full bracket.
  let lo = IRR_LOWER_BOUND;
  let hi = IRR_UPPER_BOUND;
  const loValue = npv(lo, flows);
  const hiValue = npv(hi, flows);
  if (loValue === null || hiValue === null) return null;
  if (loValue * hiValue > 0) return null; // root not bracketed

  let loSign = Math.sign(loValue);
  for (let i = 0; i < IRR_MAX_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const midValue = npv(mid, flows);
    if (midValue === null) return null;
    if (Math.abs(midValue) < IRR_TOLERANCE || (hi - lo) / 2 < IRR_TOLERANCE) return mid;
    if (Math.sign(midValue) === loSign) {
      lo = mid;
      loSign = Math.sign(midValue);
    } else {
      hi = mid;
    }
  }
  return null;
}

/** Number of sign changes in a cash flow series, ignoring zeros. */
export function signChanges(flows: readonly number[]): number {
  let changes = 0;
  let previous = 0;
  for (const f of flows) {
    const s = Math.sign(f);
    if (s === 0) continue;
    if (previous !== 0 && s !== previous) changes++;
    previous = s;
  }
  return changes;
}

/**
 * Payment for a fully amortising loan with level instalments
 * (French amortisation, the Italian "rata costante" standard).
 *
 *   PMT = P * i / (1 - (1 + i)^-n)
 *
 * where i is the periodic rate and n the number of periods.
 * With i = 0 the instalment degenerates to P / n.
 */
export function payment(principal: number, periodicRate: number, periods: number): number | null {
  if (!isFiniteNumber(principal) || !isFiniteNumber(periodicRate) || !isFiniteNumber(periods)) {
    return null;
  }
  if (periods <= 0 || principal < 0 || periodicRate <= -1) return null;
  if (principal === 0) return 0;
  if (periodicRate === 0) return principal / periods;
  return (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -periods));
}

/**
 * Future value after `years` of compounding.
 *   FV = PV * (1 + g)^years
 */
export function compound(present: number, rate: number, years: number): number | null {
  if (!isFiniteNumber(present) || !isFiniteNumber(rate) || !isFiniteNumber(years)) return null;
  if (rate <= -1 && years > 0) return null;
  return present * Math.pow(1 + rate, years);
}

/** Safe division: null instead of Infinity/NaN when the denominator is unusable. */
export function divide(numerator: number | null, denominator: number | null): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return isFiniteNumber(result) ? result : null;
}

/** Sum treating null as zero. Use only where absence genuinely means "no cost". */
export function sumOptional(values: readonly (number | null | undefined)[]): number {
  let total = 0;
  for (const v of values) {
    if (isFiniteNumber(v)) total += v;
  }
  return total;
}
