/**
 * Operating economics for a single year.
 *
 * Definitions, stated explicitly because conventions differ:
 *
 *   Gross Scheduled Revenue  revenue at full occupancy, per the strategy.
 *   Vacancy loss             revenue lost to voids / unsold nights / empty rooms.
 *   Effective Gross Income   GSR - vacancy loss  ("collected").
 *   Operating expenses       recurring costs of running the asset, EXCLUDING
 *                            debt service, income tax and the capex reserve,
 *                            plus any costs the letting strategy itself incurs.
 *   NOI                      EGI - operating expenses.
 *
 * The capex reserve is deliberately kept OUT of NOI and subtracted below it.
 * Folding capex into NOI is common but it flatters net yield and breaks
 * comparability with published market yields, which are quoted pre-capex.
 */

import type { RentalAssumptions } from '@/domain/types';
import { calculateStrategyRevenue, type StrategyRevenue } from './strategies';
import { DAYS_PER_YEAR, compound, isFiniteNumber, sumOptional } from './finance';

export interface OperatingExpenseLine {
  key: string;
  label: string;
  amount: number;
  /** True when the cost scales with collected revenue rather than being fixed. */
  variable: boolean;
}

export interface RentalYearResult {
  year: number;
  occupancy: number | null;
  grossScheduledRevenue: number | null;
  vacancyLoss: number | null;
  effectiveGrossIncome: number | null;
  operatingExpenses: number | null;
  operatingExpenseLines: OperatingExpenseLine[];
  noi: number | null;
  capexReserve: number;
  revenue: StrategyRevenue;
}

/**
 * Occupancy implied by expected empty days (long lets).
 *   occupancy = (365 - vacancyDays) / 365, clamped to [0, 1]
 * A null input leaves occupancy unknown; it is not assumed to be a full year.
 */
export function calculateOccupancy(vacancyDaysPerYear: number | null): number | null {
  if (!isFiniteNumber(vacancyDaysPerYear)) return null;
  return Math.min(1, Math.max(0, (DAYS_PER_YEAR - vacancyDaysPerYear) / DAYS_PER_YEAR));
}

/** Gross scheduled revenue for the selected strategy in a given year. */
export function calculateGrossRevenue(
  rental: RentalAssumptions,
  year: number,
): number | null {
  return calculateStrategyRevenue(rental, year).grossScheduledRevenue;
}

/**
 * Recurring operating expenses, grown by `expenseGrowthRate`.
 *
 * The management fee is a share of COLLECTED revenue, not scheduled revenue:
 * an agent is not paid on an empty flat. Strategy costs (platform commission,
 * cleaning) are added here because they are genuine operating costs, but they
 * are tagged so the waterfall can show them separately.
 */
export function calculateOperatingExpenses(
  rental: RentalAssumptions,
  year: number,
  effectiveGrossIncome: number | null,
  strategyCosts: readonly { key: string; label: string; amount: number }[] = [],
): { total: number; lines: OperatingExpenseLine[] } {
  const rate = isFiniteNumber(rental.expenseGrowthRate) ? rental.expenseGrowthRate : 0;
  const factor = compound(1, rate, year - 1) ?? 1;

  const lines: OperatingExpenseLine[] = [];
  const pushFixed = (key: string, label: string, base: number | null) => {
    if (!isFiniteNumber(base) || base === 0) return;
    lines.push({ key, label, amount: base * factor, variable: false });
  };

  pushFixed('condoFees', 'Condominium fees', rental.condoFees);
  pushFixed('propertyTax', 'Property taxes', rental.propertyTax);
  pushFixed('insurance', 'Insurance', rental.insurance);
  pushFixed('ordinaryMaintenance', 'Maintenance', rental.ordinaryMaintenance);
  pushFixed('utilities', 'Utilities', rental.utilities);
  pushFixed('otherOperatingCosts', 'Other operating expenses', rental.otherOperatingCosts);

  for (const cost of strategyCosts) {
    if (cost.amount !== 0) {
      lines.push({ key: cost.key, label: cost.label, amount: cost.amount, variable: true });
    }
  }

  if (isFiniteNumber(rental.managementFeeRate) && isFiniteNumber(effectiveGrossIncome)) {
    const fee = effectiveGrossIncome * rental.managementFeeRate;
    if (fee !== 0) {
      lines.push({ key: 'managementFee', label: 'Property management', amount: fee, variable: true });
    }
  }

  return { total: sumOptional(lines.map((l) => l.amount)), lines };
}

/** Capex reserve for a given year, grown in line with other costs. */
export function calculateCapexReserve(rental: RentalAssumptions, year: number): number {
  if (!isFiniteNumber(rental.capexReserve)) return 0;
  const rate = isFiniteNumber(rental.expenseGrowthRate) ? rental.expenseGrowthRate : 0;
  return rental.capexReserve * (compound(1, rate, year - 1) ?? 1);
}

/**
 * Net operating income.
 *   NOI = effective gross income - operating expenses
 */
export function calculateNOI(
  effectiveGrossIncome: number | null,
  operatingExpenses: number | null,
): number | null {
  if (!isFiniteNumber(effectiveGrossIncome) || !isFiniteNumber(operatingExpenses)) return null;
  return effectiveGrossIncome - operatingExpenses;
}

/** Full operating picture for one year. */
export function calculateRentalYear(rental: RentalAssumptions, year: number): RentalYearResult {
  const revenue = calculateStrategyRevenue(rental, year);
  const { total, lines } = calculateOperatingExpenses(
    rental,
    year,
    revenue.effectiveGrossIncome,
    revenue.strategyCosts,
  );

  // With no revenue figure there is no NOI: the operating expenses are known
  // but the income is not, and a "NOI" of minus-the-costs would be a fiction.
  const noi =
    revenue.effectiveGrossIncome === null
      ? null
      : calculateNOI(revenue.effectiveGrossIncome, total);

  return {
    year,
    occupancy: revenue.occupancy,
    grossScheduledRevenue: revenue.grossScheduledRevenue,
    vacancyLoss: revenue.vacancyLoss,
    effectiveGrossIncome: revenue.effectiveGrossIncome,
    operatingExpenses: total,
    operatingExpenseLines: lines,
    noi,
    capexReserve: calculateCapexReserve(rental, year),
    revenue,
  };
}
