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

import type { ExitAssumptions, IncomeTaxAssumptions, PropertyInputs, TaxProfile } from '@/domain/types';
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

/* ------------------------------------------------------------------ *
 * Tax profiles
 * ------------------------------------------------------------------ */

/**
 * Apply a TaxProfile to a property's inputs.
 *
 * A profile is a NAMED, SOURCED, DATED set of tax assumptions for a country,
 * property type, investor type and transaction type. Applying it overwrites
 * the property's own tax fields, so the same deal can be re-underwritten
 * under a different jurisdiction by swapping profiles.
 *
 * Nothing here is tax advice. A profile with `verified: false` produces
 * figures the data-quality layer flags as MODEL_ASSUMPTION, however precise
 * the rates look.
 */
export function applyTaxProfile(inputs: PropertyInputs, profile: TaxProfile): PropertyInputs {
  const exit: ExitAssumptions = {
    ...inputs.exit,
    sellingCostsRate: profile.sellingCostsRate ?? inputs.exit.sellingCostsRate,
    capitalGainsTaxRate: profile.capitalGainsTaxRate,
    capitalGainsExemptAfterYears: profile.capitalGainsExemptAfterYears,
  };

  return {
    ...inputs,
    acquisition: {
      ...inputs.acquisition,
      purchaseTaxRate: profile.purchaseTaxRate,
    },
    incomeTax: {
      mode: profile.incomeTaxMode,
      rate: profile.incomeTaxRate,
      interestDeductible: profile.interestDeductible,
    },
    exit,
  };
}

/** The dotted input paths a tax profile governs, for the provenance sidecar. */
export const TAX_PROFILE_PATHS = [
  'acquisition.purchaseTaxRate',
  'incomeTax.mode',
  'incomeTax.rate',
  'incomeTax.interestDeductible',
  'exit.sellingCostsRate',
  'exit.capitalGainsTaxRate',
  'exit.capitalGainsExemptAfterYears',
] as const;

/**
 * Whether a profile is complete enough to underwrite with.
 * An incomplete profile is usable — the missing pieces simply report as
 * unavailable — but the user should know which pieces are absent.
 */
export function taxProfileGaps(profile: TaxProfile): string[] {
  const gaps: string[] = [];
  if (!isFiniteNumber(profile.purchaseTaxRate)) gaps.push('purchase tax rate');
  if (profile.incomeTaxMode !== 'NONE' && !isFiniteNumber(profile.incomeTaxRate)) {
    gaps.push('income tax rate');
  }
  if (!isFiniteNumber(profile.capitalGainsTaxRate)) gaps.push('capital gains tax rate');
  if (!isFiniteNumber(profile.sellingCostsRate)) gaps.push('selling costs');
  if (!profile.source) gaps.push('source');
  if (!profile.effectiveDate) gaps.push('effective date');
  return gaps;
}
