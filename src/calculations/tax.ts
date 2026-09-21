/**
 * Taxation of rental income.
 *
 * Income tax sits BELOW NOI: it is a tax on the investor, not a cost of
 * operating the building. Folding it into operating expenses would corrupt
 * NOI and make net yield incomparable with any published market yield.
 *
 * No jurisdiction's rules are hardcoded. The mode and rate are user inputs;
 * the defaults shipped with the app are flagged MODEL_ASSUMPTION.
 */

import type { IncomeTaxAssumptions } from '@/domain/types';
import { isFiniteNumber } from './finance';

export interface IncomeTaxResult {
  taxableBase: number | null;
  tax: number;
}

/**
 * Income tax for one year.
 *
 *   NONE          : 0. The analysis is pre-tax.
 *   FLAT_ON_GROSS : rate * collected rent. Models a substitute-tax regime such
 *                   as the Italian cedolare secca, where no costs are
 *                   deductible.
 *   FLAT_ON_NET   : rate * (NOI - deductible interest), floored at zero.
 *                   Losses are not carried forward: doing so requires
 *                   jurisdiction-specific rules we refuse to invent.
 */
export function calculateIncomeTax(
  assumptions: IncomeTaxAssumptions,
  effectiveGrossIncome: number | null,
  noi: number | null,
  interestPaid: number,
): IncomeTaxResult {
  if (assumptions.mode === 'NONE' || !isFiniteNumber(assumptions.rate)) {
    return { taxableBase: null, tax: 0 };
  }

  if (assumptions.mode === 'FLAT_ON_GROSS') {
    if (!isFiniteNumber(effectiveGrossIncome)) return { taxableBase: null, tax: 0 };
    return {
      taxableBase: effectiveGrossIncome,
      tax: effectiveGrossIncome * assumptions.rate,
    };
  }

  // FLAT_ON_NET
  if (!isFiniteNumber(noi)) return { taxableBase: null, tax: 0 };
  const deduction = assumptions.interestDeductible ? interestPaid : 0;
  const base = Math.max(0, noi - deduction);
  return { taxableBase: base, tax: base * assumptions.rate };
}

/**
 * Tax on the capital gain at disposal.
 *
 *   gain = net sale price (after selling costs) - total acquisition cost
 *
 * Using total acquisition cost as the basis (rather than the bare purchase
 * price) treats transaction costs and capitalised works as part of the
 * investment, which is the economically meaningful measure. Whether a given
 * tax authority allows the same deductions is jurisdiction-specific, so the
 * exemption period is an explicit input and the rate is user-set.
 */
export function calculateCapitalGainsTax(
  netSalePrice: number | null,
  costBasis: number | null,
  rate: number | null,
  holdingPeriodYears: number,
  exemptAfterYears: number | null,
): { gain: number | null; tax: number; exempt: boolean } {
  if (!isFiniteNumber(netSalePrice) || !isFiniteNumber(costBasis)) {
    return { gain: null, tax: 0, exempt: false };
  }
  const gain = netSalePrice - costBasis;
  const exempt = isFiniteNumber(exemptAfterYears) && holdingPeriodYears >= exemptAfterYears;
  if (exempt || !isFiniteNumber(rate) || gain <= 0) {
    return { gain, tax: 0, exempt };
  }
  return { gain, tax: gain * rate, exempt: false };
}
