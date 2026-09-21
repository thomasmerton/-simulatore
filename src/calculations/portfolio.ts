/**
 * Portfolio composition analysis.
 *
 * Descriptive only. There is deliberately no "portfolio score": a single
 * number would collapse allocation, liquidity, leverage and concentration —
 * which trade off against each other differently for every investor — into a
 * false ranking. Each dimension is reported on its own terms.
 */

import type { AssetClass, Portfolio, PortfolioAsset } from '@/domain/types';
import { divide, isFiniteNumber, sumOptional } from './finance';

export interface AllocationSlice {
  key: string;
  label: string;
  amount: number;
  /** Share of total invested equity, decimal. */
  share: number | null;
}

export interface PortfolioResult {
  /** Equity committed across all assets. */
  totalInvested: number;
  /** Capital not yet allocated to any asset. */
  unallocatedCapital: number;
  availableCapital: number;
  /** Debt attached to assets. */
  totalDebt: number;
  /** Equity + debt: the gross value of assets controlled. */
  grossAssetValue: number;

  allocationByClass: AllocationSlice[];
  allocationByGeography: AllocationSlice[];

  /** Equity held in assets that cannot be liquidated quickly. */
  illiquidCapital: number;
  liquidCapital: number;
  liquidityRatio: number | null;

  /** Gross asset value / equity. 1.0 = unlevered. */
  leverageRatio: number | null;
  /** Total debt / gross asset value. */
  loanToValue: number | null;

  expectedAnnualIncome: number | null;
  expectedAnnualGrowth: number | null;
  /** Income net of interest on attached debt. */
  expectedNetCashFlow: number | null;

  /** Share of the largest single holding. A plain descriptive statistic. */
  largestHoldingShare: number | null;
  largestHoldingLabel: string | null;
  /**
   * Herfindahl-Hirschman index of the equity allocation, 0..1.
   * 1 = everything in one asset; 1/n = perfectly even across n assets.
   * Reported as a measurement, not a verdict.
   */
  concentrationHHI: number | null;

  downside: PortfolioDownside;
}

export interface PortfolioDownside {
  /** Gross asset value after each asset's shock is applied. */
  shockedAssetValue: number;
  /** Equity left after debt is repaid out of the shocked value. */
  shockedEquity: number;
  /** Change in equity versus today, decimal. */
  equityChange: number | null;
  /** True where debt exceeds the shocked value of the assets securing it. */
  negativeEquity: boolean;
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  REAL_ESTATE: 'Real estate',
  EQUITIES: 'Equities',
  BONDS: 'Bonds',
  CASH: 'Cash',
  OTHER: 'Other',
};

/**
 * Interest cost assumed on portfolio debt when computing net cash flow.
 * Exposed rather than buried: it is a model assumption, not an observation.
 */
export const DEFAULT_PORTFOLIO_DEBT_RATE = 0.035;

function groupShares(
  assets: PortfolioAsset[],
  keyOf: (a: PortfolioAsset) => string,
  labelOf: (a: PortfolioAsset) => string,
  total: number,
): AllocationSlice[] {
  const groups = new Map<string, AllocationSlice>();
  for (const asset of assets) {
    const key = keyOf(asset);
    const existing = groups.get(key);
    if (existing) {
      existing.amount += asset.amount;
    } else {
      groups.set(key, { key, label: labelOf(asset), amount: asset.amount, share: null });
    }
  }
  const slices = [...groups.values()];
  for (const slice of slices) slice.share = divide(slice.amount, total);
  return slices.sort((a, b) => b.amount - a.amount);
}

export function analyzePortfolio(
  portfolio: Portfolio,
  debtRate: number = DEFAULT_PORTFOLIO_DEBT_RATE,
): PortfolioResult {
  const assets = portfolio.assets;
  const totalInvested = sumOptional(assets.map((a) => a.amount));
  const totalDebt = sumOptional(assets.map((a) => a.debt));
  const grossAssetValue = totalInvested + totalDebt;
  const unallocatedCapital = portfolio.availableCapital - totalInvested;

  const liquidCapital = sumOptional(assets.filter((a) => a.liquid).map((a) => a.amount));
  const illiquidCapital = totalInvested - liquidCapital;

  // Expected income is only meaningful if every asset has an assumption.
  const incomes = assets.map((a) =>
    isFiniteNumber(a.incomeYield) ? (a.amount + a.debt) * a.incomeYield : null,
  );
  const expectedAnnualIncome = incomes.every(isFiniteNumber)
    ? sumOptional(incomes as number[])
    : null;

  const growths = assets.map((a) =>
    isFiniteNumber(a.growthRate) ? (a.amount + a.debt) * a.growthRate : null,
  );
  const expectedAnnualGrowth = growths.every(isFiniteNumber)
    ? sumOptional(growths as number[])
    : null;

  const interestCost = totalDebt * debtRate;
  const expectedNetCashFlow = isFiniteNumber(expectedAnnualIncome)
    ? expectedAnnualIncome - interestCost
    : null;

  const sorted = [...assets].sort((a, b) => b.amount - a.amount);
  const largest = sorted[0] ?? null;

  const hhi =
    totalInvested > 0
      ? assets.reduce((acc, a) => acc + Math.pow(a.amount / totalInvested, 2), 0)
      : null;

  /* --- Downside ------------------------------------------------------- */
  let shockedAssetValue = 0;
  let negativeEquity = false;
  for (const asset of assets) {
    const gross = asset.amount + asset.debt;
    const shock = isFiniteNumber(asset.downsideShock) ? asset.downsideShock : 0;
    const shocked = gross * (1 + shock);
    shockedAssetValue += shocked;
    if (asset.debt > shocked) negativeEquity = true;
  }
  const shockedEquity = shockedAssetValue - totalDebt;

  return {
    totalInvested,
    unallocatedCapital,
    availableCapital: portfolio.availableCapital,
    totalDebt,
    grossAssetValue,
    allocationByClass: groupShares(
      assets,
      (a) => a.assetClass,
      (a) => ASSET_CLASS_LABELS[a.assetClass],
      totalInvested,
    ),
    allocationByGeography: groupShares(
      assets,
      (a) => a.geography || 'Unspecified',
      (a) => a.geography || 'Unspecified',
      totalInvested,
    ),
    illiquidCapital,
    liquidCapital,
    liquidityRatio: divide(liquidCapital, totalInvested),
    leverageRatio: divide(grossAssetValue, totalInvested),
    loanToValue: divide(totalDebt, grossAssetValue),
    expectedAnnualIncome,
    expectedAnnualGrowth,
    expectedNetCashFlow,
    largestHoldingShare: largest ? divide(largest.amount, totalInvested) : null,
    largestHoldingLabel: largest?.label ?? null,
    concentrationHHI: hhi,
    downside: {
      shockedAssetValue,
      shockedEquity,
      equityChange: divide(shockedEquity - totalInvested, totalInvested),
      negativeEquity,
    },
  };
}
