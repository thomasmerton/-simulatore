/**
 * Portfolio composition analysis.
 *
 * Descriptive only. There is deliberately no "portfolio score": a single
 * number would collapse allocation, liquidity, leverage and concentration —
 * which trade off against each other differently for every investor — into a
 * false ranking. Each dimension is reported on its own terms.
 */

import type { AssetClass, Portfolio, PortfolioAsset, RentalStrategy } from '@/domain/types';
import { RENTAL_STRATEGY_LABELS } from '@/domain/types';
import { divide, isFiniteNumber, sumOptional } from './finance';

export interface AllocationSlice {
  key: string;
  label: string;
  amount: number;
  /** Share of total invested equity, decimal. */
  share: number | null;
}

export interface PortfolioResult {
  totalInvested: number;
  unallocatedCapital: number;
  availableCapital: number;
  totalDebt: number;
  /** Equity + debt: the gross value of assets controlled. */
  grossAssetValue: number;

  allocationByClass: AllocationSlice[];
  allocationByCountry: AllocationSlice[];
  allocationByCity: AllocationSlice[];
  /** Each individual holding's share — the property-level exposure. */
  allocationByProperty: AllocationSlice[];
  /** Real estate equity split by letting strategy. */
  allocationByStrategy: AllocationSlice[];

  illiquidCapital: number;
  liquidCapital: number;
  liquidityRatio: number | null;

  /** Gross asset value / equity. 1.0 = unlevered. */
  leverageRatio: number | null;
  loanToValue: number | null;

  expectedAnnualIncome: number | null;
  expectedAnnualGrowth: number | null;
  expectedNetCashFlow: number | null;

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
  shockedAssetValue: number;
  shockedEquity: number;
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

const UNSPECIFIED = 'Unspecified';

function groupShares(
  assets: PortfolioAsset[],
  keyOf: (a: PortfolioAsset) => string | null,
  labelOf: (a: PortfolioAsset) => string,
  total: number,
  { skipNull = false }: { skipNull?: boolean } = {},
): AllocationSlice[] {
  const groups = new Map<string, AllocationSlice>();
  for (const asset of assets) {
    const raw = keyOf(asset);
    if (skipNull && raw === null) continue;
    const key = raw ?? UNSPECIFIED;
    const existing = groups.get(key);
    if (existing) {
      existing.amount += asset.amount;
    } else {
      groups.set(key, {
        key,
        label: raw === null ? UNSPECIFIED : labelOf(asset),
        amount: asset.amount,
        share: null,
      });
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

  const realEstate = assets.filter((a) => a.assetClass === 'REAL_ESTATE');
  const realEstateEquity = sumOptional(realEstate.map((a) => a.amount));

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
    allocationByCountry: groupShares(
      assets,
      (a) => a.location?.country || null,
      (a) => a.location?.country ?? UNSPECIFIED,
      totalInvested,
    ),
    allocationByCity: groupShares(
      assets,
      (a) => a.location?.city || null,
      (a) => a.location?.city ?? UNSPECIFIED,
      totalInvested,
    ),
    allocationByProperty: groupShares(
      realEstate,
      (a) => a.id,
      (a) => a.label,
      realEstateEquity,
    ),
    allocationByStrategy: groupShares(
      realEstate,
      (a) => a.strategy,
      (a) => (a.strategy ? RENTAL_STRATEGY_LABELS[a.strategy as RentalStrategy] : UNSPECIFIED),
      realEstateEquity,
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
