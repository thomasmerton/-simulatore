/**
 * Risk / robustness metrics.
 *
 * These describe how much room the investment has before it stops working.
 * They are descriptive, never prescriptive.
 */

import { isFiniteNumber } from './finance';

/**
 * Break-even occupancy: the occupancy rate at which cash flow is exactly zero.
 *
 *   occupancy* = (operating expenses + capex reserve + debt service + fixed tax)
 *                / (gross potential rent * (1 - management fee rate))
 *
 * The management fee scales with collected rent, so it is netted off the
 * revenue side rather than added to costs; otherwise the break-even point is
 * overstated. Other operating costs are assumed fixed with respect to
 * occupancy, which is the standard simplification and is stated here so the
 * user can judge it.
 *
 * A result above 1.0 means the property cannot break even at any occupancy
 * level under these assumptions. That is a real answer and is returned as-is
 * rather than clamped.
 */
export function calculateBreakEvenOccupancy(params: {
  grossPotentialRent: number | null;
  fixedOperatingExpenses: number | null;
  managementFeeRate: number | null;
  capexReserve?: number;
  debtService?: number;
}): number | null {
  const { grossPotentialRent, fixedOperatingExpenses, managementFeeRate } = params;
  if (!isFiniteNumber(grossPotentialRent) || grossPotentialRent <= 0) return null;
  if (!isFiniteNumber(fixedOperatingExpenses)) return null;

  const feeRate = isFiniteNumber(managementFeeRate) ? managementFeeRate : 0;
  const revenuePerUnitOccupancy = grossPotentialRent * (1 - feeRate);
  if (revenuePerUnitOccupancy <= 0) return null;

  const costs =
    fixedOperatingExpenses + (params.capexReserve ?? 0) + (params.debtService ?? 0);

  return costs / revenuePerUnitOccupancy;
}

/**
 * Headroom between the assumed occupancy and the break-even point.
 * Positive = the assumption has slack; negative = it is already under water.
 */
export function calculateOccupancyHeadroom(
  assumedOccupancy: number | null,
  breakEvenOccupancy: number | null,
): number | null {
  if (!isFiniteNumber(assumedOccupancy) || !isFiniteNumber(breakEvenOccupancy)) return null;
  return assumedOccupancy - breakEvenOccupancy;
}

/**
 * Loan-to-value at a point in time.
 *   LTV = outstanding debt / property value
 */
export function calculateLTV(debt: number | null, propertyValue: number | null): number | null {
  if (!isFiniteNumber(debt) || !isFiniteNumber(propertyValue) || propertyValue <= 0) return null;
  return debt / propertyValue;
}
