/**
 * Capital allocation.
 *
 * Answers the question the product exists for: "I have X. Here are three ways
 * I could deploy it — what are the consequences of each?"
 *
 * It compares strategies on identical measures and stops there. There is no
 * ranking, no score and no recommended strategy, because the trade-off between
 * income, liquidity, leverage and concentration is the investor's to make and
 * depends on things this tool cannot see.
 */

import type { AllocationStrategy, Portfolio } from '@/domain/types';
import { analyzePortfolio, type PortfolioResult } from './portfolio';

export interface AllocationComparison {
  strategy: AllocationStrategy;
  result: PortfolioResult;
  /** Capital committed but not covered by the stated available capital. */
  overCommitted: boolean;
}

/**
 * Analyse each strategy against the same capital base, so the comparison is
 * like for like.
 */
export function compareAllocations(
  strategies: AllocationStrategy[],
  availableCapital: number,
  debtRate?: number,
): AllocationComparison[] {
  return strategies.map((strategy) => {
    const portfolio: Portfolio = {
      id: strategy.id,
      name: strategy.name,
      availableCapital,
      createdAt: '',
      updatedAt: '',
      assets: strategy.assets,
    };
    const result = analyzePortfolio(portfolio, debtRate);
    return { strategy, result, overCommitted: result.unallocatedCapital < 0 };
  });
}

/**
 * The measures every strategy is compared on. Fixed and identical across
 * strategies — that is what makes it a comparison rather than a pitch.
 */
export interface AllocationMeasure {
  key: string;
  label: string;
  format: 'currency' | 'percent' | 'multiple' | 'number';
  extract: (c: AllocationComparison) => number | null;
  /** What the measure means, shown in the table's footnotes. */
  note: string;
}

export const ALLOCATION_MEASURES: AllocationMeasure[] = [
  {
    key: 'totalInvested',
    label: 'Capital deployed',
    format: 'currency',
    extract: (c) => c.result.totalInvested,
    note: 'Equity committed across all assets.',
  },
  {
    key: 'unallocated',
    label: 'Held in reserve',
    format: 'currency',
    extract: (c) => c.result.unallocatedCapital,
    note: 'Capital not allocated. Negative means the plan does not fund.',
  },
  {
    key: 'grossAssetValue',
    label: 'Assets controlled',
    format: 'currency',
    extract: (c) => c.result.grossAssetValue,
    note: 'Equity plus debt: the gross value of what the portfolio controls.',
  },
  {
    key: 'debt',
    label: 'Debt',
    format: 'currency',
    extract: (c) => c.result.totalDebt,
    note: 'Total borrowing.',
  },
  {
    key: 'leverage',
    label: 'Leverage',
    format: 'multiple',
    extract: (c) => c.result.leverageRatio,
    note: 'Gross asset value divided by equity. 1.0x is unlevered.',
  },
  {
    key: 'income',
    label: 'Expected annual income',
    format: 'currency',
    extract: (c) => c.result.expectedAnnualIncome,
    note: 'Only computed when every asset carries an income assumption.',
  },
  {
    key: 'netCashFlow',
    label: 'Expected net cash flow',
    format: 'currency',
    extract: (c) => c.result.expectedNetCashFlow,
    note: 'Income less interest on portfolio debt.',
  },
  {
    key: 'liquidity',
    label: 'Liquid share',
    format: 'percent',
    extract: (c) => c.result.liquidityRatio,
    note: 'Share of equity convertible to cash quickly without a material haircut.',
  },
  {
    key: 'illiquid',
    label: 'Capital tied up',
    format: 'currency',
    extract: (c) => c.result.illiquidCapital,
    note: 'Equity that cannot be released quickly.',
  },
  {
    key: 'concentration',
    label: 'Concentration (HHI)',
    format: 'number',
    extract: (c) => c.result.concentrationHHI,
    note: '1.00 is everything in one asset. A measurement, not a verdict.',
  },
  {
    key: 'largest',
    label: 'Largest single holding',
    format: 'percent',
    extract: (c) => c.result.largestHoldingShare,
    note: 'Share of equity in the biggest position.',
  },
  {
    key: 'downsideEquity',
    label: 'Equity after downside',
    format: 'currency',
    extract: (c) => c.result.downside.shockedEquity,
    note: 'Equity remaining once each asset’s downside shock is applied. Debt does not fall with asset values.',
  },
  {
    key: 'downsideChange',
    label: 'Change in equity (downside)',
    format: 'percent',
    extract: (c) => c.result.downside.equityChange,
    note: 'How far equity moves in the downside. Leverage amplifies it.',
  },
];
