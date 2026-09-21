/**
 * Rental operating economics for a single year.
 *
 * Definitions used throughout (stated explicitly because conventions differ):
 *
 *   Gross Potential Rent (GPR) = contractual rent for 12 months of occupancy.
 *   Vacancy loss               = GPR * (1 - occupancy).
 *   Effective Gross Income     = GPR - vacancy loss  ("collected rent").
 *   Operating expenses         = recurring costs of running the asset,
 *                                EXCLUDING debt service, income tax and the
 *                                capex reserve.
 *   NOI                        = EGI - operating expenses.
 *
 * The capex reserve (manutenzione straordinaria) is deliberately kept OUT of
 * NOI and subtracted below it. Folding capex into NOI is common but it makes
 * net yield flatter than reality and breaks comparability with market yields.
 */

import type { RentalAssumptions } from '@/domain/types';
import { DAYS_PER_YEAR, MONTHS_PER_YEAR, compound, isFiniteNumber, sumOptional } from './finance';

export interface OperatingExpenseLine {
  key: string;
  label: string;
  amount: number;
}

export interface RentalYearResult {
  /** 1-based year index. */
  year: number;
  occupancy: number | null;
  grossPotentialRent: number | null;
  vacancyLoss: number | null;
  effectiveGrossIncome: number | null;
  operatingExpenses: number | null;
  operatingExpenseLines: OperatingExpenseLine[];
  noi: number | null;
  capexReserve: number;
}

/**
 * Occupancy implied by expected empty days.
 *   occupancy = (365 - vacancyDays) / 365
 * Clamped to [0, 1]. A null input means occupancy is unknown, not 100%.
 */
export function calculateOccupancy(vacancyDaysPerYear: number | null): number | null {
  if (!isFiniteNumber(vacancyDaysPerYear)) return null;
  const occupancy = (DAYS_PER_YEAR - vacancyDaysPerYear) / DAYS_PER_YEAR;
  return Math.min(1, Math.max(0, occupancy));
}

/**
 * Gross potential rent for a given year, before vacancy.
 *
 * Year 1 is reduced by the stabilisation period (months of works or letting-up
 * during which no rent is collected). Later years assume a full 12 months at
 * the rent grown by `rentGrowthRate`.
 */
export function calculateGrossRevenue(
  rental: RentalAssumptions,
  year: number,
): number | null {
  if (!isFiniteNumber(rental.monthlyRent)) return null;
  const growth = isFiniteNumber(rental.rentGrowthRate) ? rental.rentGrowthRate : 0;
  const grownRent = compound(rental.monthlyRent, growth, year - 1);
  if (grownRent === null) return null;

  const stabilization =
    year === 1 && isFiniteNumber(rental.stabilizationMonths)
      ? Math.min(MONTHS_PER_YEAR, Math.max(0, rental.stabilizationMonths))
      : 0;

  return grownRent * (MONTHS_PER_YEAR - stabilization);
}

/**
 * Recurring operating expenses for a given year, grown by `expenseGrowthRate`.
 *
 * The management fee is a share of COLLECTED rent (not potential rent): an
 * agent is not paid on an empty flat.
 */
export function calculateOperatingExpenses(
  rental: RentalAssumptions,
  year: number,
  effectiveGrossIncome: number | null,
): { total: number; lines: OperatingExpenseLine[] } {
  const growth = isFiniteNumber(rental.expenseGrowthRate) ? rental.expenseGrowthRate : 0;
  const factor = compound(1, growth, year - 1) ?? 1;

  const lines: OperatingExpenseLine[] = [];
  const push = (key: string, label: string, base: number | null) => {
    if (!isFiniteNumber(base) || base === 0) return;
    lines.push({ key, label, amount: base * factor });
  };

  push('condoFees', 'Condominium fees', rental.condoFees);
  push('propertyTax', 'Property tax', rental.propertyTax);
  push('insurance', 'Insurance', rental.insurance);
  push('ordinaryMaintenance', 'Ordinary maintenance', rental.ordinaryMaintenance);
  push('otherOperatingCosts', 'Other operating costs', rental.otherOperatingCosts);

  if (isFiniteNumber(rental.managementFeeRate) && isFiniteNumber(effectiveGrossIncome)) {
    const fee = effectiveGrossIncome * rental.managementFeeRate;
    if (fee !== 0) {
      lines.push({ key: 'managementFee', label: 'Property management', amount: fee });
    }
  }

  return { total: sumOptional(lines.map((l) => l.amount)), lines };
}

/** Capex reserve for a given year, grown in line with other costs. */
export function calculateCapexReserve(rental: RentalAssumptions, year: number): number {
  if (!isFiniteNumber(rental.capexReserve)) return 0;
  const growth = isFiniteNumber(rental.expenseGrowthRate) ? rental.expenseGrowthRate : 0;
  return rental.capexReserve * (compound(1, growth, year - 1) ?? 1);
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

/** Full rental picture for one year. */
export function calculateRentalYear(rental: RentalAssumptions, year: number): RentalYearResult {
  const occupancy = calculateOccupancy(rental.vacancyDaysPerYear);
  const grossPotentialRent = calculateGrossRevenue(rental, year);

  const vacancyLoss =
    isFiniteNumber(grossPotentialRent) && occupancy !== null
      ? grossPotentialRent * (1 - occupancy)
      : null;

  const effectiveGrossIncome =
    isFiniteNumber(grossPotentialRent) && isFiniteNumber(vacancyLoss)
      ? grossPotentialRent - vacancyLoss
      : null;

  const { total, lines } = calculateOperatingExpenses(rental, year, effectiveGrossIncome);

  return {
    year,
    occupancy,
    grossPotentialRent,
    vacancyLoss,
    effectiveGrossIncome,
    operatingExpenses: total,
    operatingExpenseLines: lines,
    noi: calculateNOI(effectiveGrossIncome, total),
    capexReserve: calculateCapexReserve(rental, year),
  };
}
