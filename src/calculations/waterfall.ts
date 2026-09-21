/**
 * The cash-flow waterfall.
 *
 * The point of this module is inspectability. An underwriting model that
 * reports "IRR 8.2%" and nothing else cannot be checked, argued with, or
 * trusted. Every step from gross rent to the investor's net cash is emitted
 * as a named, signed row with the inputs behind it, so a reader can follow the
 * arithmetic line by line and find the step they disagree with.
 *
 *   Gross Scheduled Rent
 *     - Vacancy
 *   = Effective Gross Income
 *     - Operating Expenses
 *   = NOI
 *     - CapEx
 *   = Unlevered Cash Flow
 *     - Debt Service
 *   = Levered Cash Flow (pre-tax)
 *     - Income Tax
 *   = Levered Cash Flow (after tax)
 *     + Sale Proceeds / - Selling Costs / - Exit Tax / - Debt Repayment
 *   = Net Investor Cash Flow
 */

import type { ProjectionYear, ExitResult } from './projection';
import { isFiniteNumber } from './finance';

export type WaterfallKind = 'INFLOW' | 'DEDUCTION' | 'SUBTOTAL' | 'TOTAL';

export interface WaterfallRow {
  key: string;
  label: string;
  /** Signed: deductions are negative, so the column sums to the total. */
  amount: number | null;
  kind: WaterfallKind;
  /** Indentation depth; deductions sit under the subtotal they reduce. */
  depth: number;
  /** Where the number comes from, for the detail panel. */
  note?: string;
  /** Breakdown rows, e.g. the individual operating expense lines. */
  children?: { key: string; label: string; amount: number }[];
}

/** One operating year, fully itemised. */
export function buildOperatingWaterfall(year: ProjectionYear): WaterfallRow[] {
  const r = year.rental;
  const rows: WaterfallRow[] = [];

  rows.push({
    key: 'grossScheduledRent',
    label: 'Gross scheduled rent',
    amount: r.grossScheduledRevenue,
    kind: 'INFLOW',
    depth: 0,
    note: 'Revenue at full occupancy for the selected letting strategy.',
  });

  rows.push({
    key: 'vacancy',
    label: 'Vacancy',
    amount: isFiniteNumber(r.vacancyLoss) ? -r.vacancyLoss : null,
    kind: 'DEDUCTION',
    depth: 1,
    note:
      r.occupancy === null
        ? 'Occupancy assumption missing.'
        : `At ${(r.occupancy * 100).toFixed(1)}% occupancy.`,
  });

  rows.push({
    key: 'egi',
    label: 'Effective gross income',
    amount: r.effectiveGrossIncome,
    kind: 'SUBTOTAL',
    depth: 0,
    note: 'Revenue actually collected.',
  });

  rows.push({
    key: 'opex',
    label: 'Operating expenses',
    amount: isFiniteNumber(r.operatingExpenses) ? -r.operatingExpenses : null,
    kind: 'DEDUCTION',
    depth: 1,
    note: 'Excludes debt service, income tax and the capex reserve.',
    children: r.operatingExpenseLines.map((l) => ({
      key: l.key,
      label: l.label,
      amount: -l.amount,
    })),
  });

  rows.push({
    key: 'noi',
    label: 'Net operating income',
    amount: r.noi,
    kind: 'SUBTOTAL',
    depth: 0,
    note: 'The property-level return, before financing and tax.',
  });

  rows.push({
    key: 'capex',
    label: 'Capital expenditure reserve',
    amount: r.capexReserve === 0 ? 0 : -r.capexReserve,
    kind: 'DEDUCTION',
    depth: 1,
    note: 'Provision for major works. Held below NOI so net yield stays comparable with market yields.',
  });

  rows.push({
    key: 'unlevered',
    label: 'Unlevered cash flow',
    amount: year.cashFlowBeforeDebt,
    kind: 'SUBTOTAL',
    depth: 0,
    note: 'What the property produces before any borrowing.',
  });

  rows.push({
    key: 'debtService',
    label: 'Debt service',
    amount: year.debtService === 0 ? 0 : -year.debtService,
    kind: 'DEDUCTION',
    depth: 1,
    note:
      year.debt === null
        ? 'No debt.'
        : `Interest ${Math.round(year.interestPaid).toLocaleString()} + principal ${Math.round(year.principalPaid).toLocaleString()}.`,
    children:
      year.debt === null
        ? undefined
        : [
            { key: 'interest', label: 'Interest', amount: -year.interestPaid },
            { key: 'principal', label: 'Principal', amount: -year.principalPaid },
          ],
  });

  rows.push({
    key: 'leveredPreTax',
    label: 'Levered cash flow (pre-tax)',
    amount: year.preTaxCashFlow,
    kind: 'SUBTOTAL',
    depth: 0,
  });

  rows.push({
    key: 'incomeTax',
    label: 'Income tax',
    amount: year.incomeTax === 0 ? 0 : -year.incomeTax,
    kind: 'DEDUCTION',
    depth: 1,
    note: 'Taxes the investor, not the building, so it sits below NOI.',
  });

  rows.push({
    key: 'leveredAfterTax',
    label: 'Levered cash flow (after tax)',
    amount: year.afterTaxCashFlow,
    kind: 'TOTAL',
    depth: 0,
    note: 'What reaches the investor this year.',
  });

  return rows;
}

/** The exit year's proceeds, itemised. */
export function buildExitWaterfall(exit: ExitResult): WaterfallRow[] {
  const rows: WaterfallRow[] = [];

  rows.push({
    key: 'salePrice',
    label: 'Sale price',
    amount: exit.salePrice,
    kind: 'INFLOW',
    depth: 0,
    note: `Market value at the end of year ${exit.year}.`,
  });

  rows.push({
    key: 'sellingCosts',
    label: 'Selling costs',
    amount: isFiniteNumber(exit.sellingCosts) ? -exit.sellingCosts : null,
    kind: 'DEDUCTION',
    depth: 1,
    note: 'Agency and legal costs on disposal.',
  });

  rows.push({
    key: 'netSalePrice',
    label: 'Net sale price',
    amount: exit.netSalePrice,
    kind: 'SUBTOTAL',
    depth: 0,
  });

  rows.push({
    key: 'exitTax',
    label: 'Capital gains tax',
    amount: exit.capitalGainsTax === 0 ? 0 : -exit.capitalGainsTax,
    kind: 'DEDUCTION',
    depth: 1,
    note: exit.capitalGainsExempt
      ? 'Exempt: the holding period met the exemption threshold.'
      : 'On the gain over total acquisition cost.',
  });

  rows.push({
    key: 'debtRepayment',
    label: 'Debt repayment',
    amount: exit.debtRemaining === 0 ? 0 : -exit.debtRemaining,
    kind: 'DEDUCTION',
    depth: 1,
    note: exit.balloonRepayment
      ? 'Balloon: the loan was not fully amortised by the exit and the balance falls due.'
      : 'Outstanding balance settled from the proceeds.',
  });

  rows.push({
    key: 'reservesReleased',
    label: 'Reserves released',
    amount: exit.reservesReleased === 0 ? 0 : exit.reservesReleased,
    kind: 'INFLOW',
    depth: 1,
    note: 'Working capital committed at purchase and returned on exit.',
  });

  rows.push({
    key: 'netSaleProceeds',
    label: 'Net sale proceeds',
    amount: exit.netSaleProceeds,
    kind: 'TOTAL',
    depth: 0,
    note: 'Cash in hand after costs, tax and debt.',
  });

  return rows;
}

/**
 * The whole-hold summary: equity in at t=0, cash collected over the hold,
 * proceeds at exit, and the investor's net position.
 */
export function buildInvestorWaterfall(params: {
  equityInvested: number | null;
  totalCashFlow: number | null;
  netSaleProceeds: number | null;
  totalProfit: number | null;
  holdingYears: number;
}): WaterfallRow[] {
  return [
    {
      key: 'equity',
      label: 'Equity invested',
      amount: isFiniteNumber(params.equityInvested) ? -params.equityInvested : null,
      kind: 'DEDUCTION',
      depth: 0,
      note: 'Cash out at t=0: deposit, transaction costs, works and reserves.',
    },
    {
      key: 'operating',
      label: `Cash flow collected (${params.holdingYears}y)`,
      amount: params.totalCashFlow,
      kind: 'INFLOW',
      depth: 0,
      note: 'Sum of after-tax cash flow over the hold.',
    },
    {
      key: 'proceeds',
      label: 'Net sale proceeds',
      amount: params.netSaleProceeds,
      kind: 'INFLOW',
      depth: 0,
    },
    {
      key: 'netInvestor',
      label: 'Net investor cash flow',
      amount: params.totalProfit,
      kind: 'TOTAL',
      depth: 0,
      note: 'Total profit or loss over the whole hold, undiscounted.',
    },
  ];
}
