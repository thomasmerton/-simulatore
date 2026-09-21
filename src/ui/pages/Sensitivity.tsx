/**
 * Sensitivity analysis.
 *
 * The page's real job is to show WHICH assumptions the result hangs on. The
 * tornado summary does that directly: it measures how far the chosen metric
 * moves when each input is flexed by the same proportion, so the user can see
 * that (say) rent and vacancy dominate while cost inflation barely registers.
 */

import { useMemo, useState } from 'react';
import type { Property } from '@/domain/types';
import {
  SENSITIVITY_AXES,
  SENSITIVITY_METRICS,
  buildAdditiveSweep,
  buildSweep,
  calculateSensitivity,
} from '@/calculations/sensitivity';
import { runProjection } from '@/calculations/projection';
import { Card, Notice, Table, Td, Th } from '../components/primitives';
import { Heatmap } from '../charts/Heatmap';
import { formatPercent } from '../format';

const GRID_STEPS = 5;
/** Relative half-width of a sweep, e.g. 0.2 => base ±20%. */
const SWEEP_SPREAD = 0.2;
/** Additive half-width for axes that are already rates, e.g. ±2 points. */
const RATE_SWEEP_DELTA = 0.02;

const ADDITIVE_AXES = new Set(['interestRate', 'priceGrowth', 'ltv']);

function sweepFor(axisKey: string, base: number): number[] {
  if (axisKey === 'holdingPeriod') return [1, 3, 5, 10, 20];
  if (axisKey === 'ltv') return [0, 0.2, 0.4, 0.6, 0.8];
  if (ADDITIVE_AXES.has(axisKey)) return buildAdditiveSweep(base, RATE_SWEEP_DELTA, GRID_STEPS);
  if (axisKey === 'vacancyDays') return [0, 15, 30, 60, 120];
  return buildSweep(base, SWEEP_SPREAD, GRID_STEPS);
}

export function Sensitivity({ property }: { property: Property }) {
  const { inputs } = property;
  const [rowKey, setRowKey] = useState('purchasePrice');
  const [colKey, setColKey] = useState('monthlyRent');
  const [metricKey, setMetricKey] = useState('leveredIRR');

  const rowAxis = SENSITIVITY_AXES.find((a) => a.key === rowKey) ?? SENSITIVITY_AXES[0]!;
  const colAxis = SENSITIVITY_AXES.find((a) => a.key === colKey) ?? SENSITIVITY_AXES[1]!;
  const metric = SENSITIVITY_METRICS.find((m) => m.key === metricKey) ?? SENSITIVITY_METRICS[0]!;

  const grid = useMemo(() => {
    const rowBase = rowAxis.read(inputs) ?? 0;
    const colBase = colAxis.read(inputs) ?? 0;
    return calculateSensitivity(
      inputs,
      rowAxis,
      sweepFor(rowAxis.key, rowBase),
      colAxis,
      sweepFor(colAxis.key, colBase),
      metric,
    );
  }, [inputs, rowAxis, colAxis, metric]);

  /**
   * Tornado: flex each input by ±10% of its base (or ±1 point for rates) and
   * record how far the metric travels. Ranks drivers by influence — which is
   * a statement about the model's arithmetic, not about the investment.
   */
  const tornado = useMemo(() => {
    const baseValue = metric.extract(runProjection(inputs));
    if (baseValue === null) return [];

    return SENSITIVITY_AXES.map((axis) => {
      const base = axis.read(inputs);
      if (base === null) return null;

      const isRate = ADDITIVE_AXES.has(axis.key);
      const low = isRate ? base - 0.01 : base * 0.9;
      const high = isRate ? base + 0.01 : base * 1.1;

      const lowValue = metric.extract(runProjection(axis.apply(inputs, low)));
      const highValue = metric.extract(runProjection(axis.apply(inputs, high)));
      if (lowValue === null || highValue === null) return null;

      return {
        label: axis.label,
        low: lowValue,
        high: highValue,
        swing: Math.abs(highValue - lowValue),
        nudge: isRate ? '±1 point' : '±10%',
      };
    })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.swing - a.swing);
  }, [inputs, metric]);

  const maxSwing = tornado[0]?.swing ?? 0;
  const topDrivers = tornado.slice(0, 2).map((t) => t.label.toLowerCase());

  const selectClass =
    'rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm';

  return (
    <div className="space-y-4">
      <Card
        title="Sensitivity grid"
        subtitle="The full projection is re-run for every cell. Nothing is interpolated."
      >
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Metric
            </span>
            <select
              className={`${selectClass} w-full`}
              style={{ borderColor: 'var(--border-strong)' }}
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value)}
            >
              {SENSITIVITY_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Rows
            </span>
            <select
              className={`${selectClass} w-full`}
              style={{ borderColor: 'var(--border-strong)' }}
              value={rowKey}
              onChange={(e) => setRowKey(e.target.value)}
            >
              {SENSITIVITY_AXES.map((a) => (
                <option key={a.key} value={a.key} disabled={a.key === colKey}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Columns
            </span>
            <select
              className={`${selectClass} w-full`}
              style={{ borderColor: 'var(--border-strong)' }}
              value={colKey}
              onChange={(e) => setColKey(e.target.value)}
            >
              {SENSITIVITY_AXES.map((a) => (
                <option key={a.key} value={a.key} disabled={a.key === rowKey}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Heatmap grid={grid} currency={inputs.settings.currency} />
      </Card>

      <Card
        title="What moves the answer"
        subtitle={`How far ${metric.label} travels when each input is flexed on its own, everything else held.`}
      >
        {tornado.length === 0 ? (
          <Notice tone="warning">
            This metric cannot be computed from the current inputs, so there is nothing to rank.
          </Notice>
        ) : (
          <>
            {topDrivers.length > 0 && (
              <Notice>
                On these inputs, {metric.label} is most sensitive to{' '}
                <strong>{topDrivers.join(' and ')}</strong>. That is a property of the arithmetic,
                not a judgement about the investment — it tells you where to spend your research
                effort.
              </Notice>
            )}
            <div className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th>Input</Th>
                    <Th>Flexed by</Th>
                    <Th align="right">Low</Th>
                    <Th align="right">High</Th>
                    <Th align="right">Swing</Th>
                    <Th>Relative influence</Th>
                  </tr>
                </thead>
                <tbody>
                  {tornado.map((row) => (
                    <tr key={row.label}>
                      <Td className="font-medium">{row.label}</Td>
                      <Td muted>{row.nudge}</Td>
                      <Td align="right">{renderMetric(row.low, metric.format)}</Td>
                      <Td align="right">{renderMetric(row.high, metric.format)}</Td>
                      <Td align="right" className="font-medium">
                        {renderMetric(row.swing, metric.format)}
                      </Td>
                      <Td>
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${maxSwing > 0 ? (row.swing / maxSwing) * 100 : 0}%`,
                            minWidth: '2px',
                            background: 'var(--series-1)',
                          }}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function renderMetric(value: number, format: string): string {
  if (format === 'percent') return formatPercent(value, 2);
  if (format === 'currency') return new Intl.NumberFormat('en-GB').format(Math.round(value));
  return value.toFixed(2);
}
