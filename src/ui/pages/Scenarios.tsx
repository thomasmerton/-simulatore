/**
 * Scenario analysis.
 *
 * Shocks are grouped by the part of the deal they hit, and each one states
 * exactly which inputs it moves. The editor is generated from the engine's
 * own shock catalogue, so the labels can never drift from the arithmetic.
 */

import { useMemo } from 'react';
import type { Property, Scenario, ScenarioShocks, ShockGroup } from '@/domain/types';
import {
  SHOCK_GROUP_LABELS,
  SHOCK_SPECS,
  runScenarios,
} from '@/calculations/scenario';
import { labelFor } from '../components/Assumptions';
import { useApp } from '@/store/AppStore';
import { Button, Card, Notice, Stat, Table, Td, Th } from '../components/primitives';
import { PercentField } from '../components/fields';
import { ScenarioBarChart } from '../charts/charts';
import { formatCurrencyCompact, formatMultiple, formatPercent } from '../format';

const GROUP_ORDER: ShockGroup[] = [
  'ACQUISITION',
  'MARKET_VALUE',
  'REVENUE',
  'EXPENSES',
  'FINANCING',
  'EXIT',
];

export function Scenarios({ property }: { property: Property }) {
  const { scenarios, updateScenario, addScenario, deleteScenario, resetScenarios } = useApp();
  const currency = property.inputs.settings.currency;

  const results = useMemo(
    () => runScenarios(property.inputs, scenarios),
    [property.inputs, scenarios],
  );

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
          <ScenarioBarChart
            data={results.map((r) => ({
              name: r.scenario.name,
              value: r.projection.leveredIRR.value,
            }))}
            format="percent"
          />
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
              <Th align="right">Cumulative CF</Th>
              <Th align="right">Final equity</Th>
              <Th align="right">IRR</Th>
              <Th align="right">NPV</Th>
              <Th align="right">Multiple</Th>
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
                        (projection.year1.afterTaxCashFlow ?? 0) < 0 ? 'var(--negative)' : undefined,
                    }}
                  >
                    {formatCurrencyCompact(projection.year1.afterTaxCashFlow, currency)}
                  </Td>
                  <Td
                    align="right"
                    style={{ color: (projection.year1.dscr ?? 2) < 1 ? 'var(--negative)' : undefined }}
                  >
                    {projection.year1.dscr === null ? '—' : projection.year1.dscr.toFixed(2)}
                  </Td>
                  <Td align="right" muted>
                    {formatPercent(projection.year1.breakEvenOccupancyAfterDebt)}
                  </Td>
                  <Td align="right">{formatCurrencyCompact(projection.totalCashFlow, currency)}</Td>
                  <Td align="right">
                    {formatCurrencyCompact(finalYear?.equity ?? null, currency)}
                  </Td>
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
            <div className="space-y-5">
              {GROUP_ORDER.map((group) => {
                const specs = SHOCK_SPECS.filter((s) => s.group === group);
                if (specs.length === 0) return null;
                return (
                  <div key={group}>
                    <p
                      className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-subtle)' }}
                    >
                      {SHOCK_GROUP_LABELS[group]}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {specs.map((spec) => (
                        <div key={spec.key}>
                          <PercentField
                            id={`${scenario.id}-${spec.key}`}
                            label={spec.label}
                            value={scenario.shocks[spec.key]}
                            onChange={(v) => setShock(scenario, spec.key, v)}
                            hint={spec.hint}
                            step={1}
                          />
                          <p
                            className="mt-1 text-[10px] leading-snug"
                            style={{ color: 'var(--text-subtle)' }}
                          >
                            {spec.mode === 'ADDITIVE' ? 'Added to' : 'Scales'}{' '}
                            {spec.targets.map(labelFor).join(', ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {result && (
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-5 sm:grid-cols-4">
                <Stat label="IRR" value={formatPercent(result.projection.leveredIRR.value)} />
                <Stat
                  label="Year-1 cash flow"
                  value={formatCurrencyCompact(result.projection.year1.afterTaxCashFlow, currency)}
                  tone={(result.projection.year1.afterTaxCashFlow ?? 0) < 0 ? 'negative' : 'neutral'}
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
                  rate type to variable on the Assumptions tab to model a repricing.
                </Notice>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
