/**
 * Dashboard.
 *
 * The one screen that answers "where does this stand?". It states figures and
 * what they rest on, and stops there — no verdict, no grade, no suggestion to
 * buy or avoid.
 */

import { useMemo } from 'react';
import type { Property } from '@/domain/types';
import { runProjection } from '@/calculations/projection';
import { runScenarios } from '@/calculations/scenario';
import { analyzePortfolio } from '@/calculations/portfolio';
import { SENSITIVITY_AXES } from '@/calculations/sensitivity';
import { useApp } from '@/store/AppStore';
import { Card, Notice, Stat, Table, Td, Th } from '../components/primitives';
import { AllocationBar, ScenarioBarChart } from '../charts/charts';
import { BasedOn, CORE_INPUT_PATHS, ProvenanceSummary } from '../components/Assumptions';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMultiple,
  formatPercent,
} from '../format';

export function Dashboard({ property }: { property: Property }) {
  const { scenarios, portfolio, properties } = useApp();
  const { inputs, provenance } = property;
  const currency = inputs.settings.currency;

  const result = useMemo(() => runProjection(inputs), [inputs]);
  const scenarioResults = useMemo(
    () => runScenarios(inputs, scenarios),
    [inputs, scenarios],
  );
  const portfolioResult = useMemo(() => analyzePortfolio(portfolio), [portfolio]);

  /**
   * The two inputs the IRR is most sensitive to, flexed ±10% each.
   * This is what turns a number into a decision aid: it says where the
   * uncertainty actually lives.
   */
  const drivers = useMemo(() => {
    const base = result.leveredIRR.value;
    if (base === null) return [];
    return SENSITIVITY_AXES.map((axis) => {
      const value = axis.read(inputs);
      if (value === null) return null;
      const isRate = axis.key === 'interestRate' || axis.key === 'priceGrowth';
      const low = runProjection(axis.apply(inputs, isRate ? value - 0.01 : value * 0.9))
        .leveredIRR.value;
      const high = runProjection(axis.apply(inputs, isRate ? value + 0.01 : value * 1.1))
        .leveredIRR.value;
      if (low === null || high === null) return null;
      return { label: axis.label, swing: Math.abs(high - low) };
    })
      .filter((x): x is { label: string; swing: number } => x !== null)
      .sort((a, b) => b.swing - a.swing)
      .slice(0, 2);
  }, [inputs, result.leveredIRR.value]);

  return (
    <div className="space-y-4">
      {/* ---------------- Headline ---------------- */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-subtle)' }}
            >
              {property.name}
            </p>
            {/* A missing price is stated plainly rather than shouted at hero size. */}
            {result.acquisition.purchasePrice === null ? (
              <p className="mt-2 text-lg font-medium" style={{ color: 'var(--text-subtle)' }}>
                No purchase price entered yet
              </p>
            ) : (
              <h1 className="tabular mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
                {formatCurrency(result.acquisition.purchasePrice, currency)}
              </h1>
            )}
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {[inputs.facts.city, inputs.facts.district].filter(Boolean).join(' · ') ||
                'Location not set'}
              {inputs.facts.sqm ? ` · ${inputs.facts.sqm} m²` : ''}
              {result.acquisition.pricePerSqm
                ? ` · ${formatCurrency(result.acquisition.pricePerSqm, currency)}/m²`
                : ''}
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-subtle)' }}
            >
              Capital available
            </p>
            <p className="tabular mt-1 text-2xl font-semibold">
              {formatCurrency(portfolio.availableCapital, currency)}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Equity needed here: {formatCurrency(result.equityInvested, currency)}
            </p>
          </div>
        </div>

        <div
          className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 border-t pt-6 sm:grid-cols-3 lg:grid-cols-5"
          style={{ borderColor: 'var(--border)' }}
        >
          <Stat
            label="Net yield"
            value={formatPercent(result.year1.netYieldOnTotalCost)}
            emphasis="large"
            note={
              <BasedOn
                paths={['rental.monthlyRent', 'rental.vacancyDaysPerYear', 'facts.purchasePrice']}
                provenance={provenance}
              />
            }
          />
          <Stat
            label="NOI"
            value={formatCurrency(result.year1.noi, currency)}
            emphasis="large"
            note="Year 1, before debt and income tax."
          />
          <Stat
            label={`IRR (${inputs.exit.holdingPeriodYears}y)`}
            value={formatPercent(result.leveredIRR.value)}
            emphasis="large"
            note={
              <BasedOn
                paths={['exit.priceGrowthRate', 'exit.sellingCostsRate']}
                provenance={provenance}
              />
            }
          />
          <Stat
            label="Cash flow"
            value={formatCurrency(result.year1.afterTaxCashFlow, currency)}
            emphasis="large"
            tone={(result.year1.afterTaxCashFlow ?? 0) < 0 ? 'negative' : 'neutral'}
            note="Year 1, after everything."
          />
          <Stat
            label="Equity multiple"
            value={formatMultiple(result.equityMultiple)}
            emphasis="large"
            note="Cash returned over cash invested."
          />
        </div>

        <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-subtle)' }}>
            What these figures rest on
          </p>
          <ProvenanceSummary provenance={provenance} paths={CORE_INPUT_PATHS} />
        </div>
      </Card>

      {drivers.length > 0 && (
        <Notice>
          With the assumptions entered, the estimated equity IRR over{' '}
          {inputs.exit.holdingPeriodYears} years is{' '}
          <strong>{formatPercent(result.leveredIRR.value)}</strong>. The result is most sensitive
          to <strong>{drivers.map((d) => d.label.toLowerCase()).join(' and ')}</strong> — a 10%
          change in either moves the IRR by up to{' '}
          {formatPercent(Math.max(...drivers.map((d) => d.swing)), 1)}.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- Scenarios ---------------- */}
        <Card title="Scenarios" subtitle="Equity IRR under each set of shocks.">
          <ScenarioBarChart
            data={scenarioResults.map((r) => ({
              name: r.scenario.name,
              value: r.projection.leveredIRR.value,
            }))}
            height={200}
          />
          <div className="mt-3">
            <Table>
              <tbody>
                {scenarioResults.map(({ scenario, projection }) => (
                  <tr key={scenario.id}>
                    <Td>{scenario.name}</Td>
                    <Td align="right" muted>
                      {formatCurrencyCompact(projection.year1.afterTaxCashFlow, currency)} cash flow
                    </Td>
                    <Td align="right" className="font-semibold">
                      {formatPercent(projection.leveredIRR.value)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        {/* ---------------- Portfolio ---------------- */}
        <Card
          title="Portfolio"
          subtitle={
            portfolio.assets.length > 0
              ? 'Share of invested equity by asset class.'
              : 'Nothing allocated yet.'
          }
        >
          <AllocationBar slices={portfolioResult.allocationByClass} />
          {portfolio.assets.length > 0 && (
            <div
              className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4 sm:grid-cols-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <Stat
                label="Liquidity"
                value={formatPercent(portfolioResult.liquidityRatio)}
                note="Share convertible to cash quickly."
              />
              <Stat
                label="Leverage"
                value={
                  portfolioResult.leverageRatio === null
                    ? '—'
                    : `${portfolioResult.leverageRatio.toFixed(2)}x`
                }
              />
              <Stat
                label="Downside equity"
                value={formatPercent(portfolioResult.downside.equityChange)}
                tone={(portfolioResult.downside.equityChange ?? 0) < 0 ? 'negative' : 'neutral'}
              />
            </div>
          )}
        </Card>
      </div>

      {/* ---------------- Risk ---------------- */}
      <Card title="Robustness" subtitle="How much room the assumptions have before the position stops working.">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Break-even occupancy"
            value={formatPercent(result.year1.breakEvenOccupancyAfterDebt)}
            note="Occupancy at which year-1 cash flow is exactly zero."
          />
          <Stat
            label="Occupancy headroom"
            value={formatPercent(result.year1.occupancyHeadroom)}
            tone={(result.year1.occupancyHeadroom ?? 0) < 0 ? 'negative' : 'neutral'}
            note="Your assumed occupancy minus the break-even point."
          />
          <Stat
            label="Lowest DSCR"
            value={result.minDSCR === null ? 'No debt' : result.minDSCR.toFixed(2)}
            tone={(result.minDSCR ?? 2) < 1 ? 'negative' : 'neutral'}
            note="Lowest ratio of NOI to debt service over the hold."
          />
          <Stat
            label="NPV"
            value={formatCurrency(result.npv, currency)}
            tone={(result.npv ?? 0) < 0 ? 'negative' : 'neutral'}
            note={`Discounted at ${formatPercent(inputs.settings.discountRate)}, your required return.`}
          />
          <Stat
            label="Total profit"
            value={formatCurrency(result.totalProfit, currency)}
            tone={(result.totalProfit ?? 0) < 0 ? 'negative' : 'neutral'}
            note={`Over ${inputs.exit.holdingPeriodYears} years, including sale.`}
          />
        </div>

        {result.notes.length > 0 && (
          <div className="mt-5 space-y-2">
            {result.notes.map((note) => (
              <Notice key={note.code} tone={note.severity === 'WARNING' ? 'warning' : 'info'}>
                {note.message}
              </Notice>
            ))}
          </div>
        )}
      </Card>

      {properties.length > 1 && (
        <Card title="Other properties" subtitle="Open the Compare tab for a full side-by-side.">
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th align="right">Price</Th>
                <Th align="right">Net yield</Th>
                <Th align="right">Cash flow</Th>
                <Th align="right">IRR</Th>
              </tr>
            </thead>
            <tbody>
              {properties.map((other) => {
                const r = runProjection(other.inputs);
                return (
                  <tr key={other.id}>
                    <Td className={other.id === property.id ? 'font-semibold' : ''}>
                      {other.name}
                    </Td>
                    <Td align="right" muted>
                      {formatCurrencyCompact(r.acquisition.purchasePrice, currency)}
                    </Td>
                    <Td align="right">{formatPercent(r.year1.netYieldOnTotalCost)}</Td>
                    <Td align="right">
                      {formatCurrencyCompact(r.year1.afterTaxCashFlow, currency)}
                    </Td>
                    <Td align="right">{formatPercent(r.leveredIRR.value)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
