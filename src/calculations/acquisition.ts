/**
 * Acquisition economics: what it actually costs to own the asset at t=0.
 */

import type { AcquisitionCosts, PropertyFacts } from '@/domain/types';
import { divide, isFiniteNumber, sumOptional } from './finance';

export interface AcquisitionBreakdownLine {
  key: string;
  label: string;
  amount: number;
}

export interface AcquisitionResult {
  purchasePrice: number | null;
  /** Purchase price / m². The headline comparison metric against a market. */
  pricePerSqm: number | null;
  purchaseTax: number | null;
  agencyCommission: number | null;
  notaryFees: number;
  /** Renovation + furniture. Capitalised into the asset basis. */
  capexAtPurchase: number;
  otherUpfrontCosts: number;
  /** All one-off costs excluding the purchase price itself. */
  totalTransactionCosts: number | null;
  /**
   * Total acquisition cost = purchase price + every one-off cost at t=0.
   * This is the denominator used for "on total cost" yields, and the basis
   * against which the capital gain is measured at exit.
   */
  totalAcquisitionCost: number | null;
  /** Total cost per m², including works. */
  totalCostPerSqm: number | null;
  breakdown: AcquisitionBreakdownLine[];
}

/**
 * Resolve a cost that may be given either as a rate on the price or as an
 * absolute amount. An explicit amount always wins, because a real quote beats
 * a rule of thumb. Returns null when neither is available: we do not guess.
 */
export function resolveRateOrAmount(
  base: number | null,
  rate: number | null,
  amount: number | null,
): number | null {
  if (isFiniteNumber(amount)) return amount;
  if (isFiniteNumber(rate) && isFiniteNumber(base)) return base * rate;
  return null;
}

export function calculateAcquisitionCost(
  facts: PropertyFacts,
  costs: AcquisitionCosts,
): AcquisitionResult {
  const purchasePrice = isFiniteNumber(facts.purchasePrice)
    ? facts.purchasePrice
    : isFiniteNumber(facts.askingPrice)
      ? facts.askingPrice
      : null;

  const purchaseTax = resolveRateOrAmount(
    purchasePrice,
    costs.purchaseTaxRate,
    costs.purchaseTaxAmount,
  );
  const agencyCommission = resolveRateOrAmount(
    purchasePrice,
    costs.agencyCommissionRate,
    costs.agencyCommissionAmount,
  );

  const notaryFees = isFiniteNumber(costs.notaryFees) ? costs.notaryFees : 0;
  const renovation = isFiniteNumber(costs.renovationCost) ? costs.renovationCost : 0;
  const furniture = isFiniteNumber(costs.furnitureCost) ? costs.furnitureCost : 0;
  const other = isFiniteNumber(costs.otherUpfrontCosts) ? costs.otherUpfrontCosts : 0;
  const capexAtPurchase = renovation + furniture;

  const transactionCostParts = [purchaseTax, agencyCommission];
  const totalTransactionCosts = transactionCostParts.some((p) => !isFiniteNumber(p))
    ? null
    : sumOptional([...transactionCostParts, notaryFees, capexAtPurchase, other]);

  const totalAcquisitionCost =
    isFiniteNumber(purchasePrice) && isFiniteNumber(totalTransactionCosts)
      ? purchasePrice + totalTransactionCosts
      : null;

  const breakdown: AcquisitionBreakdownLine[] = [];
  const push = (key: string, label: string, amount: number | null) => {
    if (isFiniteNumber(amount) && amount !== 0) breakdown.push({ key, label, amount });
  };
  push('purchasePrice', 'Purchase price', purchasePrice);
  push('purchaseTax', 'Purchase tax', purchaseTax);
  push('notaryFees', 'Notary fees', notaryFees);
  push('agencyCommission', 'Agency commission', agencyCommission);
  push('renovation', 'Renovation', renovation);
  push('furniture', 'Furniture', furniture);
  push('other', 'Other upfront costs', other);

  return {
    purchasePrice,
    pricePerSqm: divide(purchasePrice, facts.sqm),
    purchaseTax,
    agencyCommission,
    notaryFees,
    capexAtPurchase,
    otherUpfrontCosts: other,
    totalTransactionCosts,
    totalAcquisitionCost,
    totalCostPerSqm: divide(totalAcquisitionCost, facts.sqm),
    breakdown,
  };
}
