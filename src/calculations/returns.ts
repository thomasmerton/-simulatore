/**
 * Return metrics.
 *
 * Every one of these depends on a cash flow series, which in turn depends on a
 * holding period and an exit assumption. There is no such thing as "the IRR of
 * a property" in isolation, so the engine never reports one without them.
 */

import { divide, irr, isFiniteNumber, npv, signChanges } from './finance';

/**
 * Net present value of an investment.
 *   NPV = Σ CF_t / (1 + r)^t, with CF_0 the initial outlay (negative).
 * The discount rate is the investor's required return and is a user input.
 */
export function calculateNPV(discountRate: number | null, flows: readonly number[]): number | null {
  if (!isFiniteNumber(discountRate)) return null;
  return npv(discountRate, flows);
}

export interface IRRResult {
  value: number | null;
  /** True when the series changes sign more than once: the IRR may not be unique. */
  ambiguous: boolean;
}

/**
 * Internal rate of return over the cash flow series.
 * Flags ambiguity rather than hiding it: a series with several sign changes can
 * have several mathematically valid IRRs.
 */
export function calculateIRR(flows: readonly number[]): IRRResult {
  const value = irr(flows);
  return { value, ambiguous: signChanges(flows) > 1 };
}

/**
 * Equity multiple (times money).
 *   EM = total cash returned / total cash invested
 * Cash returned includes operating distributions and net sale proceeds.
 * A value of 1.0 means the investor got their money back and nothing more.
 */
export function calculateEquityMultiple(
  totalDistributions: number | null,
  totalInvested: number | null,
): number | null {
  if (!isFiniteNumber(totalInvested) || totalInvested <= 0) return null;
  return divide(totalDistributions, totalInvested);
}

/**
 * Cash-on-cash return for a given year.
 *   CoC = cash flow after debt service / total cash invested
 * Deliberately excludes any sale proceeds: it measures the income yield on
 * the money actually at risk, not the total return.
 */
export function calculateCashOnCash(
  annualCashFlow: number | null,
  totalCashInvested: number | null,
): number | null {
  if (!isFiniteNumber(totalCashInvested) || totalCashInvested <= 0) return null;
  return divide(annualCashFlow, totalCashInvested);
}

export interface PaybackResult {
  /** Years until cumulative operating cash flow repays the invested capital. */
  years: number | null;
  /** True when the capital is not repaid within the modelled horizon. */
  beyondHorizon: boolean;
}

/**
 * Payback period from operating cash flow only.
 *
 * Sale proceeds are excluded on purpose: including them turns payback into a
 * restatement of the exit assumption rather than a measure of how long the
 * position is under water on income alone.
 *
 * Linear interpolation is used within the year in which the threshold is
 * crossed, which assumes cash flow accrues evenly through the year.
 */
export function calculatePaybackPeriod(
  totalCashInvested: number | null,
  annualCashFlows: readonly number[],
): PaybackResult {
  if (!isFiniteNumber(totalCashInvested) || totalCashInvested <= 0) {
    return { years: null, beyondHorizon: false };
  }
  let cumulative = 0;
  for (let i = 0; i < annualCashFlows.length; i++) {
    const cf = annualCashFlows[i] as number;
    const previous = cumulative;
    cumulative += cf;
    if (cumulative >= totalCashInvested) {
      const shortfall = totalCashInvested - previous;
      const fraction = cf > 0 ? shortfall / cf : 0;
      return { years: i + fraction, beyondHorizon: false };
    }
  }
  return { years: null, beyondHorizon: true };
}

/**
 * Yields.
 *
 * Both denominators are reported because the conventions genuinely differ:
 * listing portals quote gross yield on the asking price, while an investor's
 * own return is measured against everything they paid. Reporting one number
 * called "yield" is how these tools mislead.
 */
export function calculateGrossYield(
  annualGrossRent: number | null,
  denominator: number | null,
): number | null {
  return divide(annualGrossRent, denominator);
}

/**
 * Net yield.
 *   net yield = NOI / denominator
 * NOI excludes debt service, so net yield is a property-level metric: it does
 * not change when the investor changes their financing.
 */
export function calculateNetYield(noi: number | null, denominator: number | null): number | null {
  return divide(noi, denominator);
}
