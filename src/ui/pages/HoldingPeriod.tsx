/**
 * Holding period and exit.
 *
 * Shows the full year-by-year timeline for the chosen hold, plus a side-by-side
 * of every standard holding period so the user can see how the answer depends
 * on when they sell — which, for a levered property, it does enormously.
 */

import { useMemo } from 'react';
import type { Property } from '@/domain/types';
import { HOLDING_PERIOD_OPTIONS } from '@/domain/types';
import { runProjection } from '@/calculations/projection';
import { useApp } from '@/store/AppStore';
import { Card, Notice, Pill, Stat, Table, Td, Th } from '../components/primitives';
import { CashFlowChart, EquityChart } from '../charts/charts';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMultiple,
  formatPercent,
} from '../format';

export function HoldingPeriod({ property }: { property: Property }) {
  const { updatePropertyInputs } = useApp();
  const { inputs } = property;
  const currency = inputs.settings.currency;

  const result = useMemo(() => runProjection(inputs), [inputs]);

  /** The same property analysed at every standard holding period. */
  const byPeriod = useMemo(
    () =>
      HOLDING_PERIOD_OPTIONS.map((years) => ({
        years,
        result: runProjection({ ...inputs, exit: { ...inputs.exit, holdingPeriodYears: years } }),
      })),
    [inputs],
  );

  const setHolding = (years: number) =>
    updatePropertyInputs(
      property.id,
      { ...inputs, exit: { ...inputs.exit, holdingPeriodYears: years } },
      ['exit.holdingPeriodYears'],
    );

  const equityData = result.years.map((y) => ({
    year: y.year,
    propertyValue: y.propertyValue,
    debt: y.loanBalance,
    equity: y.equity,
  }));

  const cashFlowData = result.years.map((y) => ({ year: y.year, value: y.afterTaxCashFlow }));

  return (
    <div className="space-y-4">
      <Card
        title="Holding period"
        subtitle="How long you hold changes the answer. Pick a period to drive the rest of the app."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {HOLDING_PERIOD_OPTIONS.map((years) => (
              <Pill
                key={years}
                active={inputs.exit.holdingPeriodYears === years}
                onClick={() => setHolding(years)}
              >
                {years}y
              </Pill>
            ))}
          </div>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>Hold</Th>
              <Th align="right">Equity invested</Th>
              <Th align="right">Cumulative cash flow</Th>
              <Th align="right">Sale price</Th>
              <Th align="right">Debt remaining</Th>
              <Th align="right">Net sale proceeds</Th>
              <Th align="right">Total profit</Th>
              <Th align="right">IRR</Th>
              <Th align="right">NPV</Th>
              <Th align="right">Equity multiple</Th>
            </tr>
          </thead>
          <tbody>
            {byPeriod.map(({ years, result: r }) => {
              const active = years === inputs.exit.holdingPeriodYears;
              return (
                <tr
                  key={years}
                  className="cursor-pointer"
                  onClick={() => setHolding(years)}
                  style={active ? { background: 'var(--accent-soft)' } : undefined}
                >
                  <Td className="font-medium">{years}y</Td>
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
                    style={{
                      color: (r.totalProfit ?? 0) < 0 ? 'var(--negative)' : undefined,
                    }}
                  >
                    {formatCurrencyCompact(r.totalProfit, currency)}
                  </Td>
                  <Td align="right" className="font-medium">
                    {formatPercent(r.leveredIRR.value)}
                  </Td>
                  <Td align="right">{formatCurrencyCompact(r.npv, currency)}</Td>
                  <Td align="right">{formatMultiple(r.equityMultiple)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          IRR is the equity-level (levered) return. Each row re-runs the full projection; nothing
          is interpolated.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Equity build-up" subtitle="Property value, debt and the equity between them.">
          <EquityChart data={equityData} />
        </Card>
        <Card title="Annual cash flow" subtitle="After costs, debt service and income tax.">
          <CashFlowChart data={cashFlowData} />
        </Card>
      </div>

      <Card
        title={`Exit after ${inputs.exit.holdingPeriodYears} years`}
        subtitle="Simulated sale at the end of the holding period."
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Sale price" value={formatCurrency(result.exit.salePrice, currency)} />
          <Stat
            label="Selling costs"
            value={formatCurrency(result.exit.sellingCosts, currency)}
            note={`At ${formatPercent(inputs.exit.sellingCostsRate)} of the sale price.`}
          />
          <Stat
            label="Debt to repay"
            value={formatCurrency(result.exit.debtRemaining, currency)}
          />
          <Stat
            label="Capital gain"
            value={formatCurrency(result.exit.capitalGain, currency)}
            tone={(result.exit.capitalGain ?? 0) < 0 ? 'negative' : 'neutral'}
            note="Measured against total acquisition cost, including transaction costs and works."
          />
          <Stat
            label="Capital gains tax"
            value={formatCurrency(result.exit.capitalGainsTax, currency)}
            note={
              result.exit.capitalGainsExempt
                ? `Exempt: held for at least ${inputs.exit.capitalGainsExemptAfterYears} years.`
                : undefined
            }
          />
          <Stat
            label="Net sale proceeds"
            value={formatCurrency(result.exit.netSaleProceeds, currency)}
            emphasis="large"
          />
          <Stat
            label="Total profit"
            value={formatCurrency(result.totalProfit, currency)}
            tone={(result.totalProfit ?? 0) < 0 ? 'negative' : 'positive'}
            note="Cumulative cash flow plus net sale proceeds, less equity invested."
          />
          <Stat label="Equity multiple" value={formatMultiple(result.equityMultiple)} />
        </div>

        {result.leveredIRR.ambiguous && (
          <div className="mt-4">
            <Notice tone="warning" title="More than one IRR fits this cash flow.">
              The series changes sign more than once. Read NPV and the equity multiple alongside
              the IRR rather than relying on it alone.
            </Notice>
          </div>
        )}
      </Card>

      <Card title="Year-by-year detail">
        <Table>
          <thead>
            <tr>
              <Th sticky>Year</Th>
              <Th align="right">Gross rent</Th>
              <Th align="right">Vacancy</Th>
              <Th align="right">Collected</Th>
              <Th align="right">Opex</Th>
              <Th align="right">NOI</Th>
              <Th align="right">Capex</Th>
              <Th align="right">Debt service</Th>
              <Th align="right">Tax</Th>
              <Th align="right">Cash flow</Th>
              <Th align="right">Cumulative</Th>
              <Th align="right">Value</Th>
              <Th align="right">Debt</Th>
              <Th align="right">Equity</Th>
              <Th align="right">DSCR</Th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year}>
                <Td sticky>{y.year}</Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.rental.grossPotentialRent, currency)}
                </Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.rental.vacancyLoss, currency)}
                </Td>
                <Td align="right">
                  {formatCurrencyCompact(y.rental.effectiveGrossIncome, currency)}
                </Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.rental.operatingExpenses, currency)}
                </Td>
                <Td align="right" className="font-medium">
                  {formatCurrencyCompact(y.rental.noi, currency)}
                </Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.rental.capexReserve, currency)}
                </Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.debtService, currency)}
                </Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.incomeTax, currency)}
                </Td>
                <Td
                  align="right"
                  className="font-medium"
                  style={{ color: (y.afterTaxCashFlow ?? 0) < 0 ? 'var(--negative)' : undefined }}
                >
                  {formatCurrencyCompact(y.afterTaxCashFlow, currency)}
                </Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.cumulativeCashFlow, currency)}
                </Td>
                <Td align="right">{formatCurrencyCompact(y.propertyValue, currency)}</Td>
                <Td align="right" muted>
                  {formatCurrencyCompact(y.loanBalance, currency)}
                </Td>
                <Td align="right" className="font-medium">
                  {formatCurrencyCompact(y.equity, currency)}
                </Td>
                <Td align="right" muted>
                  {y.dscr === null ? '—' : y.dscr.toFixed(2)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
