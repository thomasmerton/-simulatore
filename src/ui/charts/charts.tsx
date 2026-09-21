/**
 * Charts.
 *
 * Colour rules (validated, not eyeballed — see index.css for the validator
 * results): categorical hues are assigned in fixed slot order and never
 * cycled; magnitude uses a single hue; polarity uses the diverging pair with a
 * neutral midpoint. Series colour follows the entity, never its rank, so
 * filtering a series never repaints the survivors.
 *
 * Every chart is accompanied by the same figures in a table elsewhere on the
 * page, which is what discharges the light-mode contrast relief rule.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';
import { formatCurrencyCompact, formatPercent } from '../format';

const AXIS_STYLE = { fontSize: 11, fill: 'var(--text-subtle)' };

/**
 * Geometry Recharts hands a custom bar-label renderer. Recharts types these
 * loosely (coordinates may arrive as strings), so they are narrowed at use.
 */
interface BarLabelProps {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  value?: unknown;
}

/**
 * Round a value outward to the next "nice" increment (1, 2, 2.5 or 5 times a
 * power of ten), so an axis built from a padded domain still lands on round
 * numbers instead of arbitrary ones like -40.3%.
 */
export function niceBound(value: number, direction: 'up' | 'down'): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))));
  const normalized = Math.abs(value) / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((c) => normalized <= c) ?? 10;
  const rounded = step * magnitude;
  const outward = direction === 'up' ? rounded : -rounded;
  // Guard against rounding the bound the wrong way past the data.
  return direction === 'up' ? Math.max(value, outward) : Math.min(value, outward);
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Shared tooltip chrome so every chart reads the same. */
function TooltipBox({ label, rows }: { label: ReactNode; rows: ReactNode }) {
  return (
    <div
      className="rounded-lg border px-2.5 py-2 text-xs shadow-lg"
      style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}
    >
      <div className="mb-1 font-semibold">{label}</div>
      <div className="space-y-0.5">{rows}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Scenario comparison: one measure across named scenarios.
 * Single series, so no legend; polarity is carried by the diverging pair
 * and every bar is directly labelled.
 * ------------------------------------------------------------------ */

export interface ScenarioBarDatum {
  name: string;
  value: number | null;
}

export function ScenarioBarChart({
  data,
  format = 'percent',
  height = 220,
}: {
  data: ScenarioBarDatum[];
  format?: 'percent' | 'currency';
  height?: number;
}) {
  const render = (v: number | null | undefined) =>
    format === 'percent' ? formatPercent(v) : formatCurrencyCompact(v);
  const plotted = data.filter((d) => d.value !== null);

  if (plotted.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-xs"
        style={{ height, borderColor: 'var(--border-strong)', color: 'var(--text-subtle)' }}
      >
        Not enough data to plot
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={56}
          /* Pad the domain so an outward direct label has room and cannot
             collide with the axis ticks on a deeply negative bar, then round
             outward to a nice step so the ticks stay readable. */
          domain={[
            (min: number) => (min < 0 ? niceBound(min * 1.3, 'down') : 0),
            (max: number) => (max > 0 ? niceBound(max * 1.3, 'up') : 0),
          ]}
          tickFormatter={(v: number) => render(v)}
        />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip
          cursor={{ fill: 'var(--surface-muted)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={label as ReactNode}
                rows={<div className="tabular">{render(payload[0]?.value as number)}</div>}
              />
            ) : null
          }
        />
        <Bar
          dataKey="value"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
          label={(props: BarLabelProps) => {
            const x = num(props.x);
            const y = num(props.y);
            const width = num(props.width);
            const height = num(props.height);
            const value = num(props.value);
            if (x === null || y === null || width === null || height === null || value === null) {
              return <g />;
            }
            // Recharts' rect convention for negative bars differs between
            // versions, so derive both edges rather than trusting y/height.
            const top = Math.min(y, y + height);
            const bottom = Math.max(y, y + height);
            // Label sits on the OUTWARD end: above a positive bar's head,
            // below a negative bar's foot.
            const ty = value < 0 ? bottom + 13 : top - 6;
            return (
              <text
                x={x + width / 2}
                y={ty}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {render(value)}
              </text>
            );
          }}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={(d.value ?? 0) < 0 ? 'var(--diverge-neg)' : 'var(--series-1)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * Equity build-up over the holding period.
 * Three series on ONE axis — all three are currency, so no second scale is
 * needed and none is used.
 * ------------------------------------------------------------------ */

export interface EquityDatum {
  year: number;
  propertyValue: number | null;
  debt: number | null;
  equity: number | null;
}

const EQUITY_SERIES = [
  { key: 'propertyValue', label: 'Property value', color: 'var(--series-1)' },
  { key: 'debt', label: 'Debt outstanding', color: 'var(--series-2)' },
  { key: 'equity', label: 'Equity', color: 'var(--series-3)' },
] as const;

export function EquityChart({ data, height = 260 }: { data: EquityDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis
          dataKey="year"
          tick={AXIS_STYLE}
          axisLine={{ stroke: 'var(--axis)' }}
          tickLine={false}
          tickFormatter={(v: number) => `Y${v}`}
        />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v: number) => formatCurrencyCompact(v)}
        />
        <Tooltip
          cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={`Year ${label}`}
                rows={payload.map((entry) => (
                  <div key={String(entry.dataKey)} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: entry.color as string }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>{entry.name}</span>
                    <span className="tabular ml-auto font-medium">
                      {formatCurrencyCompact(entry.value as number)}
                    </span>
                  </div>
                ))}
              />
            ) : null
          }
        />
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          iconType="plainline"
          wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }}
        />
        {EQUITY_SERIES.map((series) => (
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * Annual cash flow. Single series; sign carried by the diverging pair.
 * ------------------------------------------------------------------ */

export function CashFlowChart({
  data,
  height = 200,
}: {
  data: { year: number; value: number | null }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis
          dataKey="year"
          tick={AXIS_STYLE}
          axisLine={{ stroke: 'var(--axis)' }}
          tickLine={false}
          tickFormatter={(v: number) => `Y${v}`}
        />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v: number) => formatCurrencyCompact(v)}
        />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip
          cursor={{ fill: 'var(--surface-muted)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                label={`Year ${label}`}
                rows={
                  <div className="tabular">
                    {formatCurrencyCompact(payload[0]?.value as number)}
                  </div>
                }
              />
            ) : null
          }
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={(d.value ?? 0) < 0 ? 'var(--diverge-neg)' : 'var(--series-1)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * Allocation: part-to-whole as a stacked bar with a direct-labelled legend.
 * A stacked bar is used rather than a pie because comparing lengths is more
 * accurate than comparing angles, and the labels can sit beside the values.
 * ------------------------------------------------------------------ */

export const ALLOCATION_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
];

export function AllocationBar({
  slices,
}: {
  slices: { key: string; label: string; amount: number; share: number | null }[];
}) {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  if (total <= 0) {
    return (
      <div
        className="rounded-lg border border-dashed px-3 py-6 text-center text-xs"
        style={{ borderColor: 'var(--border-strong)', color: 'var(--text-subtle)' }}
      >
        Nothing allocated yet
      </div>
    );
  }

  return (
    <div>
      {/* 2px surface gaps between segments, per the mark spec. */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {slices.map((slice, i) => (
          <div
            key={slice.key}
            title={`${slice.label}: ${formatPercent(slice.share)}`}
            style={{
              width: `${(slice.amount / total) * 100}%`,
              background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {slices.map((slice, i) => (
          <li key={slice.key} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
            />
            <span className="truncate" style={{ color: 'var(--text-muted)' }}>
              {slice.label}
            </span>
            <span className="tabular ml-auto shrink-0 font-medium">
              {formatPercent(slice.share)}
            </span>
            <span
              className="tabular w-24 shrink-0 text-right text-xs"
              style={{ color: 'var(--text-subtle)' }}
            >
              {formatCurrencyCompact(slice.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
