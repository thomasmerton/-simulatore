/**
 * Sensitivity analysis.
 *
 * Produces a 2-D grid of a chosen metric while two inputs vary. The grid is
 * built by re-running the FULL projection at every cell rather than by
 * linearising around the base case: the relationships here (IRR against
 * leverage, break-even against vacancy) are strongly non-linear, and a
 * gradient approximation would be wrong exactly where it matters.
 */

import type { PropertyInputs } from '@/domain/types';
import { runProjection, type ProjectionResult } from './projection';
import { isFiniteNumber } from './finance';

/** An input the user can sweep. Each knows how to write itself into the inputs. */
export interface SensitivityAxis {
  key: string;
  label: string;
  /** Formats an axis value for the header row/column. */
  format: 'currency' | 'percent' | 'number' | 'years';
  /** Returns a copy of `inputs` with this axis set to `value`. */
  apply: (inputs: PropertyInputs, value: number) => PropertyInputs;
  /** Reads the current base value, used to centre a default sweep. */
  read: (inputs: PropertyInputs) => number | null;
}

export interface SensitivityMetric {
  key: string;
  label: string;
  format: 'percent' | 'currency' | 'number' | 'years';
  extract: (result: ProjectionResult) => number | null;
  /** Values at or above this are "good" for the colour ramp midpoint. */
  neutralValue: number;
}

export interface SensitivityGrid {
  rowAxis: SensitivityAxis;
  colAxis: SensitivityAxis;
  metric: SensitivityMetric;
  rowValues: number[];
  colValues: number[];
  /** cells[rowIndex][colIndex]. null where the metric is undefined. */
  cells: (number | null)[][];
  min: number | null;
  max: number | null;
}

/**
 * Build a symmetric sweep of `steps` values centred on `base`.
 * `spread` is the relative half-width (0.2 => base +/- 20%).
 */
export function buildSweep(base: number, spread: number, steps: number): number[] {
  if (steps < 2) return [base];
  const values: number[] = [];
  const start = base * (1 - spread);
  const end = base * (1 + spread);
  const stepSize = (end - start) / (steps - 1);
  for (let i = 0; i < steps; i++) values.push(start + stepSize * i);
  return values;
}

/** Build an additive sweep, for axes expressed in absolute terms (rates, years). */
export function buildAdditiveSweep(base: number, delta: number, steps: number): number[] {
  if (steps < 2) return [base];
  const values: number[] = [];
  const start = base - delta;
  const stepSize = (delta * 2) / (steps - 1);
  for (let i = 0; i < steps; i++) values.push(start + stepSize * i);
  return values;
}

export function calculateSensitivity(
  inputs: PropertyInputs,
  rowAxis: SensitivityAxis,
  rowValues: number[],
  colAxis: SensitivityAxis,
  colValues: number[],
  metric: SensitivityMetric,
): SensitivityGrid {
  const cells: (number | null)[][] = [];
  let min: number | null = null;
  let max: number | null = null;

  for (const rowValue of rowValues) {
    const row: (number | null)[] = [];
    for (const colValue of colValues) {
      const mutated = colAxis.apply(rowAxis.apply(inputs, rowValue), colValue);
      const value = metric.extract(runProjection(mutated));
      row.push(value);
      if (isFiniteNumber(value)) {
        min = min === null ? value : Math.min(min, value);
        max = max === null ? value : Math.max(max, value);
      }
    }
    cells.push(row);
  }

  return { rowAxis, colAxis, metric, rowValues, colValues, cells, min, max };
}

/* ------------------------------------------------------------------ *
 * Axis and metric catalogues
 * ------------------------------------------------------------------ */

export const SENSITIVITY_AXES: SensitivityAxis[] = [
  {
    key: 'purchasePrice',
    label: 'Purchase price',
    format: 'currency',
    read: (i) => i.facts.purchasePrice ?? i.facts.askingPrice,
    apply: (i, v) => ({ ...i, facts: { ...i.facts, purchasePrice: v } }),
  },
  {
    key: 'monthlyRent',
    label: 'Monthly rent',
    format: 'currency',
    read: (i) => i.rental.monthlyRent,
    apply: (i, v) => ({ ...i, rental: { ...i.rental, monthlyRent: v } }),
  },
  {
    key: 'vacancyDays',
    label: 'Vacancy (days/year)',
    format: 'number',
    read: (i) => i.rental.vacancyDaysPerYear,
    apply: (i, v) => ({
      ...i,
      rental: { ...i.rental, vacancyDaysPerYear: Math.max(0, Math.min(365, v)) },
    }),
  },
  {
    key: 'interestRate',
    label: 'Interest rate',
    format: 'percent',
    read: (i) => i.financing.annualRate,
    apply: (i, v) => ({ ...i, financing: { ...i.financing, annualRate: Math.max(0, v) } }),
  },
  {
    key: 'ltv',
    label: 'Loan-to-value',
    format: 'percent',
    read: (i) => i.financing.ltv,
    apply: (i, v) => ({
      ...i,
      // An explicit loanAmount would override LTV, so it is cleared here.
      financing: { ...i.financing, ltv: Math.max(0, Math.min(0.95, v)), loanAmount: null },
    }),
  },
  {
    key: 'priceGrowth',
    label: 'Annual price growth',
    format: 'percent',
    read: (i) => i.exit.priceGrowthRate,
    apply: (i, v) => ({ ...i, exit: { ...i.exit, priceGrowthRate: v } }),
  },
  {
    key: 'holdingPeriod',
    label: 'Holding period',
    format: 'years',
    read: (i) => i.exit.holdingPeriodYears,
    apply: (i, v) => ({
      ...i,
      exit: { ...i.exit, holdingPeriodYears: Math.max(1, Math.round(v)) },
    }),
  },
];

export const SENSITIVITY_METRICS: SensitivityMetric[] = [
  {
    key: 'leveredIRR',
    label: 'IRR (equity)',
    format: 'percent',
    extract: (r) => r.leveredIRR.value,
    neutralValue: 0,
  },
  {
    key: 'unleveredIRR',
    label: 'IRR (unlevered)',
    format: 'percent',
    extract: (r) => r.unleveredIRR.value,
    neutralValue: 0,
  },
  {
    key: 'cashFlow',
    label: 'Year-1 cash flow',
    format: 'currency',
    extract: (r) => r.year1.afterTaxCashFlow,
    neutralValue: 0,
  },
  {
    key: 'netYield',
    label: 'Net yield (on total cost)',
    format: 'percent',
    extract: (r) => r.year1.netYieldOnTotalCost,
    neutralValue: 0,
  },
  {
    key: 'equityMultiple',
    label: 'Equity multiple',
    format: 'number',
    extract: (r) => r.equityMultiple,
    neutralValue: 1,
  },
  {
    key: 'npv',
    label: 'NPV',
    format: 'currency',
    extract: (r) => r.npv,
    neutralValue: 0,
  },
  {
    key: 'dscr',
    label: 'Year-1 DSCR',
    format: 'number',
    extract: (r) => r.year1.dscr,
    neutralValue: 1,
  },
];
