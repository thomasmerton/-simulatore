/**
 * Underwriting — the "why are the numbers what they are?" level.
 *
 * The whole point is that every step is visible. A model that reports an IRR
 * and hides the waterfall cannot be argued with, and a number you cannot argue
 * with is a number you should not act on.
 */

import { useMemo, useState } from 'react';
import type { Property } from '@/domain/types';
import { HOLDING_PERIOD_OPTIONS } from '@/domain/types';
import { runProjection } from '@/calculations/projection';
import {
  buildExitWaterfall,
  buildInvestorWaterfall,
  buildOperatingWaterfall,
  type WaterfallRow,
} from '@/calculations/waterfall';
import { useApp } from '@/store/AppStore';
import { Card, Notice, Pill, Stat, Table, Td, Th } from '../components/primitives';
import { EquityChart, CashFlowChart } from '../charts/charts';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMultiple,
  formatPercent,
  UNAVAILABLE,
} from '../format';

/* ------------------------------------------------------------------ *
 * Waterfall rendering
 * ------------------------------------------------------------------ */

function WaterfallTable({
  rows,
  currency,
  expandable = true,
}: {
  rows: WaterfallRow[];
  currency: string;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[26rem] border-collapse text-sm">
        <tbody>
          {rows.map((row) => {
            const isTotal = row.kind === 'TOTAL';
            const isSubtotal = row.kind === 'SUBTOTAL';
            const hasChildren = expandable && (row.children?.length ?? 0) > 0;
            const isOpen = open.has(row.key);
            const negative = (row.amount ?? 0) < 0;

            return (
              <>
                <tr
                  key={row.key}
                  className={isTotal || isSubtotal ? 'font-semibold' : ''}
                  style={{
                    borderTop: isSubtotal || isTotal ? '1px solid var(--border-strong)' : undefined,
                    background: isTotal ? 'var(--surface-muted)' : undefined,
                  }}
                >
                  <td
                    className="py-1.5 pr-3"
                    style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggle(row.key)}
                        className="inline-flex items-center gap-1 hover:underline"
                        title="Show the breakdown"
                      >
                        <span
                          aria-hidden
                          className="inline-block w-3 text-[10px]"
                          style={{ color: 'var(--text-subtle)' }}
                        >
                          {isOpen ? '▾' : '▸'}
                        </span>
                        {row.label}
                      </button>
                    ) : (
                      <span style={{ paddingLeft: hasChildren ? 0 : '1rem' }}>{row.label}</span>
                    )}
                    {row.note && (
                      <span
                        className="ml-1.5 text-[11px]"
                        style={{ color: 'var(--text-subtle)' }}
                      >
                        {row.note}
                      </span>
                    )}
                  </td>
                  <td
                    className="tabular whitespace-nowrap py-1.5 text-right"
                    style={{
                      color:
                        row.amount === null
                          ? 'var(--text-subtle)'
                          : negative
                            ? 'var(--text-muted)'
                            : undefined,
                    }}
                  >
                    {row.amount === null ? UNAVAILABLE : formatCurrency(row.amount, currency)}
                  </td>
                </tr>
                {hasChildren &&
                  isOpen &&
                  row.children!.map((child) => (
                    <tr key={`${row.key}-${child.key}`}>
                      <td
                        className="py-1 pr-3 text-xs"
                        style={{
                          paddingLeft: `${(row.depth + 1) * 1.25 + 1}rem`,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {child.label}
                      </td>
                      <td
                        className="tabular py-1 text-right text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {formatCurrency(child.amount, currency)}
                      </td>
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function Underwriting({ property }: { property: Property }) {
  const { updatePropertyInputs } = useApp();
  const { inputs } = property;
  const currency = inputs.settings.currency;

  const result = useMemo(() => runProjection(inputs), [inputs]);
  const [waterfallYear, setWaterfallYear] = useState(1);

  const byPeriod = useMemo(
    () =>
      HOLDING_PERIOD_OPTIONS.map((years) => ({
        years,
        result: runProjection({ ...inputs, exit: { ...inputs.exit, holdingPeriodYears: years } }),
      })),
    [inputs],
  );

  const year = result.years.find((y) => y.year === waterfallYear) ?? result.years[0];
  const operatingRows = year ? buildOperatingWaterfall(year) : [];
  const exitRows = buildExitWaterfall(result.exit);
  const investorRows = buildInvestorWaterfall({
    equityInvested: result.equityInvested,
    totalCashFlow: result.totalCashFlow,
    netSaleProceeds: result.exit.netSaleProceeds,
    totalProfit: result.totalProfit,
    holdingYears: inputs.exit.holdingPeriodYears,
  });

  const setHolding = (years: number) =>
    updatePropertyInputs(
      property.id,
      { ...inputs, exit: { ...inputs.exit, holdingPeriodYears: years } },
      ['exit.holdingPeriodYears'],
    );

  return (
    <div className="space-y-4">
      {/* --------------- Acquisition --------------- */}
      <Card
        title="Acquisition"
        subtitle="What it costs to own the asset on day one."
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <WaterfallTable
            currency={currency}
            expandable={false}
            rows={[
              ...result.acquisition.breakdown.map((line, i) => ({
                key: line.key,
                label: line.label,
                amount: line.amount,
                kind: (i === 0 ? 'INFLOW' : 'DEDUCTION') as WaterfallRow['kind'],
                depth: i === 0 ? 0 : 1,
              })),
              {
                key: 'total',
                label: 'Total acquisition cost',
                amount: result.acquisition.totalAcquisitionCost,
                kind: 'TOTAL' as const,
                depth: 0,
                note: 'The basis for "on total cost" yields and for the capital gain.',
              },
              {
                key: 'loan',
                label: 'Less: loan',
                amount: result.loanAmount === null ? 0 : -result.loanAmount,
                kind: 'DEDUCTION' as const,
                depth: 1,
              },
              {
                key: 'equity',
                label: 'Equity invested',
                amount: result.equityInvested,
                kind: 'TOTAL' as const,
                depth: 0,
                note: 'Cash out of your pocket at t=0.',
              },
            ]}
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-1">
            <Stat
              label="Price per m²"
              value={formatCurrency(result.acquisition.pricePerSqm, currency)}
              note={`All-in: ${formatCurrency(result.acquisition.totalCostPerSqm, currency)}/m²`}
            />
            <Stat
              label="Transaction costs"
              value={formatPercent(
                result.acquisition.totalTransactionCosts !== null &&
                  result.acquisition.purchasePrice
                  ? result.acquisition.totalTransactionCosts / result.acquisition.purchasePrice
                  : null,
              )}
              note="Of the purchase price, including works."
            />
            <Stat
              label="Loan"
              value={formatCurrency(result.loanAmount, currency)}
              note={
                result.years[0]?.debt
                  ? `${formatCurrency(result.years[0].debt.monthlyPayment, currency, 2)}/month`
                  : 'No debt modelled.'
              }
            />
          </div>
        </div>
      </Card>

      {/* --------------- Operating waterfall --------------- */}
      <Card
        title="Operating waterfall"
        subtitle="Every step from gross rent to the cash that reaches you. Click a deduction to see its parts."
        actions={
          <div className="flex flex-wrap gap-1">
            {result.years.slice(0, 10).map((y) => (
              <Pill
                key={y.year}
                active={y.year === waterfallYear}
                onClick={() => setWaterfallYear(y.year)}
              >
                Y{y.year}
              </Pill>
            ))}
          </div>
        }
      >
        {operatingRows.length > 0 ? (
          <WaterfallTable rows={operatingRows} currency={currency} />
        ) : (
          <Notice tone="warning">
            No operating years could be computed from the current inputs.
          </Notice>
        )}

        {year?.rental.revenue.missingInputs.length ? (
          <div className="mt-4">
            <Notice tone="warning" title="Revenue cannot be computed.">
              The selected letting strategy is missing:{' '}
              {year.rental.revenue.missingInputs.join(', ')}. Nothing has been substituted.
            </Notice>
          </div>
        ) : null}
      </Card>

      {/* --------------- Exit --------------- */}
      <Card
        title={`Exit — sale at the end of year ${inputs.exit.holdingPeriodYears}`}
        subtitle="Proceeds after costs, tax and debt."
        actions={
          <div className="flex flex-wrap gap-1">
            {HOLDING_PERIOD_OPTIONS.map((y) => (
              <Pill
                key={y}
                active={inputs.exit.holdingPeriodYears === y}
                onClick={() => setHolding(y)}
              >
                {y}y
              </Pill>
            ))}
          </div>
        }
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <WaterfallTable rows={exitRows} currency={currency} expandable={false} />
          <div>
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-subtle)' }}
            >
              Whole hold
            </p>
            <WaterfallTable rows={investorRows} currency={currency} expandable={false} />
          </div>
        </div>

        {result.exit.balloonRepayment && (
          <div className="mt-4">
            <Notice tone="warning" title="Balloon repayment.">
              The loan was not fully amortised by the exit, so{' '}
              {formatCurrency(result.exit.debtRemaining, currency)} falls due at maturity and must
              be repaid or refinanced.
            </Notice>
          </div>
        )}
      </Card>

      {/* --------------- Returns --------------- */}
      <Card title="Returns" subtitle="Derived from the cash flows above — nothing else.">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="IRR (equity)"
            value={formatPercent(result.leveredIRR.value)}
            note="Levered, after tax."
          />
          <Stat
            label="IRR (unlevered)"
            value={formatPercent(result.unleveredIRR.value)}
            note="Property-level, financing stripped out."
          />
          <Stat
            label="NPV"
            value={formatCurrency(result.npv, currency)}
            tone={(result.npv ?? 0) < 0 ? 'negative' : 'neutral'}
            note={`At ${formatPercent(inputs.settings.discountRate)}`}
          />
          <Stat label="Equity multiple" value={formatMultiple(result.equityMultiple)} />
          <Stat
            label="Net yield"
            value={formatPercent(result.year1.netYieldOnTotalCost)}
            note="On total cost."
          />
          <Stat
            label="Min DSCR"
            value={result.minDSCR === null ? 'No debt' : result.minDSCR.toFixed(2)}
            tone={(result.minDSCR ?? 2) < 1 ? 'negative' : 'neutral'}
          />
        </div>

        {result.notes.length > 0 && (
          <div className="mt-5 space-y-2">
            {result.notes.map((n) => (
              <Notice key={n.code} tone={n.severity === 'WARNING' ? 'warning' : 'info'}>
                {n.message}
              </Notice>
            ))}
          </div>
        )}
      </Card>

      {/* --------------- Holding period --------------- */}
      <Card
        title="Holding period"
        subtitle="Each row re-runs the full projection. Nothing is interpolated."
      >
        <Table>
          <thead>
            <tr>
              <Th sticky>Hold</Th>
              <Th align="right">Equity</Th>
              <Th align="right">Cumulative CF</Th>
              <Th align="right">Sale price</Th>
              <Th align="right">Debt left</Th>
              <Th align="right">Net proceeds</Th>
              <Th align="right">Profit</Th>
              <Th align="right">IRR</Th>
              <Th align="right">NPV</Th>
              <Th align="right">Multiple</Th>
            </tr>
          </thead>
          <tbody>
            {byPeriod.map(({ years, result: r }) => (
              <tr
                key={years}
                className="cursor-pointer"
                onClick={() => setHolding(years)}
                style={
                  years === inputs.exit.holdingPeriodYears
                    ? { background: 'var(--accent-soft)' }
                    : undefined
                }
              >
                <Td sticky>{years}y</Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(r.equityInvested, currency)}
                </Td>
                <Td align="right">{formatCurrencyCompact(r.totalCashFlow, currency)}</Td>
                <Td align="right">{formatCurrencyCompact(r.exit.salePrice, currency)}</Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(r.exit.debtRemaining, currency)}
                </Td>
                <Td align="right">{formatCurrencyCompact(r.exit.netSaleProceeds, currency)}</Td>
                <Td
                  align="right"
                  className="font-medium"
                  style={{ color: (r.totalProfit ?? 0) < 0 ? 'var(--negative)' : undefined }}
                >
                  {formatCurrencyCompact(r.totalProfit, currency)}
                </Td>
                <Td align="right" className="font-medium">
                  {formatPercent(r.leveredIRR.value)}
                </Td>
                <Td align="right">{formatCurrencyCompact(r.npv, currency)}</Td>
                <Td align="right">{formatMultiple(r.equityMultiple)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Equity build-up" subtitle="Value, debt and the equity between them.">
          <EquityChart
            data={result.years.map((y) => ({
              year: y.year,
              propertyValue: y.propertyValue,
              debt: y.loanBalance,
              equity: y.equity,
            }))}
          />
        </Card>
        <Card title="Annual cash flow" subtitle="After costs, capex, debt service and income tax.">
          <CashFlowChart
            data={result.years.map((y) => ({ year: y.year, value: y.afterTaxCashFlow }))}
          />
        </Card>
      </div>
    </div>
  );
}
