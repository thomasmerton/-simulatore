/**
 * Scenario analysis.
 *
 * Every shock is editable. The built-in downside levels are starting points,
 * not forecasts, and the page says so rather than presenting them as the
 * tool's view of the future.
 */

import { useMemo } from 'react';
import type { Property, Scenario, ScenarioShocks } from '@/domain/types';
import { runScenarios } from '@/calculations/scenario';
import { useApp } from '@/store/AppStore';
import { Button, Card, Notice, Stat, Table, Td, Th } from '../components/primitives';
import { PercentField } from '../components/fields';
import { ScenarioBarChart } from '../charts/charts';
import { formatCurrencyCompact, formatMultiple, formatPercent } from '../format';

interface ShockSpec {
  key: keyof ScenarioShocks;
  label: string;
  hint: string;
}

/**
 * Note the two distinct price shocks. Keeping them apart is the difference
 * between modelling a market correction and modelling a good negotiation.
 */
const SHOCKS: ShockSpec[] = [
  {
    key: 'marketValueDelta',
    label: 'Property value',
    hint: 'What the asset is worth. Negative means a market correction, which reduces returns.',
  },
  {
    key: 'purchasePriceDelta',
    label: 'Purchase price',
    hint: 'What you pay. Negative means a better entry price, which increases returns.',
  },
  { key: 'rentDelta', label: 'Rent', hint: 'Applied to the monthly rent.' },
  { key: 'vacancyDelta', label: 'Vacancy', hint: '+50% means half again as many empty days.' },
  {
    key: 'operatingCostDelta',
    label: 'Operating costs',
    hint: 'Applied to every recurring cost and the capex reserve.',
  },
  {
    key: 'interestRateDelta',
    label: 'Interest rate',
    hint: 'Added to the mortgage rate in points. Variable-rate loans only.',
  },
  { key: 'priceGrowthDelta', label: 'Price growth', hint: 'Added to the annual growth rate.' },
  { key: 'rentGrowthDelta', label: 'Rent growth', hint: 'Added to the annual rent growth rate.' },
];

export function Scenarios({ property }: { property: Property }) {
  const { scenarios, updateScenario, addScenario, deleteScenario, resetScenarios } = useApp();
  const currency = property.inputs.settings.currency;

  const results = useMemo(
    () => runScenarios(property.inputs, scenarios),
    [property.inputs, scenarios],
  );

  const chartData = results.map((r) => ({
    name: r.scenario.name,
    value: r.projection.leveredIRR.value,
  }));

  const setShock = (scenario: Scenario, key: keyof ScenarioShocks, value: number | null) =>
    updateScenario({ ...scenario, shocks: { ...scenario.shocks, [key]: value ?? 0 } });

  return (
    <div className="space-y-4">
      <Card
        title="Scenarios"
        subtitle="Each scenario is a set of shocks applied to your base inputs, so editing the base case flows through all of them."
        actions={
          <>
            <Button size="sm" onClick={addScenario}>
              Add scenario
            </Button>
            <Button size="sm" variant="ghost" onClick={resetScenarios}>
              Reset to defaults
            </Button>
          </>
        }
      >
        <Notice title="These are stress levels, not forecasts.">
          The shipped downside figures are round numbers chosen to be recognisable, not predictions
          for any particular market. Change every one of them to match your own view.
        </Notice>

        <div className="mt-4">
          <ScenarioBarChart data={chartData} format="percent" />
          <p className="mt-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Equity IRR over {property.inputs.exit.holdingPeriodYears} years, by scenario
          </p>
        </div>
      </Card>

      <Card title="Outcomes" subtitle="The same projection re-run under each set of shocks.">
        <Table>
          <thead>
            <tr>
              <Th sticky>Scenario</Th>
              <Th align="right">Net yield</Th>
              <Th align="right">Year-1 cash flow</Th>
              <Th align="right">DSCR</Th>
              <Th align="right">Break-even occ.</Th>
              <Th align="right">Cumulative cash flow</Th>
              <Th align="right">Final equity</Th>
              <Th align="right">IRR</Th>
              <Th align="right">NPV</Th>
              <Th align="right">Equity multiple</Th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ scenario, projection }) => {
              const finalYear = projection.years[projection.years.length - 1];
              return (
                <tr key={scenario.id}>
                  <Td sticky>{scenario.name}</Td>
                  <Td align="right">{formatPercent(projection.year1.netYieldOnTotalCost)}</Td>
                  <Td
                    align="right"
                    style={{
                      color:
                        (projection.year1.afterTaxCashFlow ?? 0) < 0
                          ? 'var(--negative)'
                          : undefined,
                    }}
                  >
                    {formatCurrencyCompact(projection.year1.afterTaxCashFlow, currency)}
                  </Td>
                  <Td
                    align="right"
                    style={{
                      color: (projection.year1.dscr ?? 2) < 1 ? 'var(--negative)' : undefined,
                    }}
                  >
                    {projection.year1.dscr === null ? '—' : projection.year1.dscr.toFixed(2)}
                  </Td>
                  <Td align="right" muted>
                    {formatPercent(projection.year1.breakEvenOccupancyAfterDebt)}
                  </Td>
                  <Td align="right">
                    {formatCurrencyCompact(projection.totalCashFlow, currency)}
                  </Td>
                  <Td align="right">{formatCurrencyCompact(finalYear?.equity ?? null, currency)}</Td>
                  <Td align="right" className="font-semibold">
                    {formatPercent(projection.leveredIRR.value)}
                  </Td>
                  <Td align="right">{formatCurrencyCompact(projection.npv, currency)}</Td>
                  <Td align="right">{formatMultiple(projection.equityMultiple)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {scenarios.map((scenario) => {
        const result = results.find((r) => r.scenario.id === scenario.id);
        const rateShockIgnored = result?.projection.notes.some(
          (n) => n.code === 'RATE_SHOCK_NOT_APPLIED',
        );
        return (
          <Card
            key={scenario.id}
            title={scenario.name}
            subtitle={scenario.description || 'Custom scenario.'}
            actions={
              !scenario.builtIn && (
                <Button size="sm" variant="danger" onClick={() => deleteScenario(scenario.id)}>
                  Delete
                </Button>
              )
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SHOCKS.map((shock) => (
                <PercentField
                  key={shock.key}
                  id={`${scenario.id}-${shock.key}`}
                  label={shock.label}
                  value={scenario.shocks[shock.key]}
                  onChange={(v) => setShock(scenario, shock.key, v)}
                  hint={shock.hint}
                  step={1}
                />
              ))}
            </div>

            {result && (
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Stat label="IRR" value={formatPercent(result.projection.leveredIRR.value)} />
                <Stat
                  label="Year-1 cash flow"
                  value={formatCurrencyCompact(result.projection.year1.afterTaxCashFlow, currency)}
                  tone={
                    (result.projection.year1.afterTaxCashFlow ?? 0) < 0 ? 'negative' : 'neutral'
                  }
                />
                <Stat
                  label="NPV"
                  value={formatCurrencyCompact(result.projection.npv, currency)}
                  tone={(result.projection.npv ?? 0) < 0 ? 'negative' : 'neutral'}
                />
                <Stat
                  label="Equity multiple"
                  value={formatMultiple(result.projection.equityMultiple)}
                />
              </div>
            )}

            {rateShockIgnored && (
              <div className="mt-4">
                <Notice tone="warning" title="Rate shock not applied.">
                  This loan is fixed-rate, so the instalment is contractually unchanged. Switch the
                  rate type to variable on the Property tab to model a repricing.
                </Notice>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
