/**
 * Sensitivity heatmap.
 *
 * Colour encodes POLARITY around the metric's neutral point (0 for IRR, NPV
 * and cash flow; 1.0 for equity multiple and DSCR), so the eye finds the line
 * where the investment stops working rather than merely ranking cells. That
 * makes it a diverging scale: two hues with a neutral grey midpoint, never a
 * rainbow and never a hue in the middle.
 *
 * Every cell also carries its own value as text, so the grid is readable
 * without relying on colour at all.
 */

import type { SensitivityGrid } from '@/calculations/sensitivity';
import { formatCurrencyCompact, formatNumber, formatPercent, UNAVAILABLE } from '../format';

function formatAxis(value: number, format: string, currency: string): string {
  switch (format) {
    case 'currency':
      return formatCurrencyCompact(value, currency);
    case 'percent':
      return formatPercent(value, 2);
    case 'years':
      return `${Math.round(value)}y`;
    default:
      return formatNumber(value, 0);
  }
}

function formatCell(value: number | null, format: string, currency: string): string {
  if (value === null) return '—';
  switch (format) {
    case 'currency':
      return formatCurrencyCompact(value, currency);
    case 'percent':
      return formatPercent(value, 1);
    default:
      return formatNumber(value, 2);
  }
}

/**
 * Map a value to a diverging colour around `neutral`.
 *
 * Each arm is scaled by the larger of the two distances from neutral, so the
 * midpoint stays fixed at the neutral value and the two arms stay comparable.
 * Scaling each arm independently would make a tiny positive look as strong as
 * a large negative.
 */
function cellStyle(
  value: number | null,
  neutral: number,
  min: number | null,
  max: number | null,
): React.CSSProperties {
  if (value === null || min === null || max === null) {
    return { background: 'var(--surface-muted)', color: 'var(--text-subtle)' };
  }
  const span = Math.max(Math.abs(max - neutral), Math.abs(min - neutral));
  if (span === 0) return { background: 'var(--diverge-mid)' };

  const t = Math.max(-1, Math.min(1, (value - neutral) / span));
  const intensity = Math.abs(t);
  const hue = t >= 0 ? 'var(--diverge-pos)' : 'var(--diverge-neg)';

  return {
    // The mid token shows through at low intensity, giving a true neutral centre.
    background: `color-mix(in oklab, ${hue} ${Math.round(intensity * 85)}%, var(--diverge-mid))`,
    color: intensity > 0.55 ? '#fff' : 'var(--text)',
  };
}

export function Heatmap({ grid, currency = 'EUR' }: { grid: SensitivityGrid; currency?: string }) {
  const { rowAxis, colAxis, metric, rowValues, colValues, cells, min, max } = grid;
  const allEmpty = cells.flat().every((c) => c === null);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="font-medium">{metric.label}</span> as{' '}
          <span className="font-medium">{rowAxis.label}</span> (rows) and{' '}
          <span className="font-medium">{colAxis.label}</span> (columns) vary.
        </p>
        <Legend neutral={metric.neutralValue} metricLabel={metric.label} />
      </div>

      {allEmpty ? (
        <div
          className="rounded-lg border border-dashed px-4 py-8 text-center text-xs"
          style={{ borderColor: 'var(--border-strong)', color: 'var(--text-subtle)' }}
        >
          {UNAVAILABLE} — this metric cannot be computed from the current inputs.
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                {/* width:1% keeps the label column tight so the spare width
                    goes to the data cells rather than the corner header. */}
                <th
                  scope="col"
                  className="whitespace-nowrap px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-subtle)', width: '1%' }}
                >
                  {rowAxis.label} ↓
                </th>
                {colValues.map((value, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="tabular px-2 py-1 text-center text-[11px] font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {formatAxis(value, colAxis.format, currency)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowValues.map((rowValue, r) => (
                <tr key={r}>
                  <th
                    scope="row"
                    className="tabular whitespace-nowrap px-2 py-1 text-right text-[11px] font-medium"
                    style={{ color: 'var(--text-muted)', width: '1%' }}
                  >
                    {formatAxis(rowValue, rowAxis.format, currency)}
                  </th>
                  {colValues.map((colValue, c) => {
                    const value = cells[r]?.[c] ?? null;
                    return (
                      <td
                        key={c}
                        className="tabular rounded px-2 py-1.5 text-center font-medium"
                        style={cellStyle(value, metric.neutralValue, min, max)}
                        title={`${rowAxis.label} ${formatAxis(rowValue, rowAxis.format, currency)}, ${colAxis.label} ${formatAxis(colValue, colAxis.format, currency)} → ${formatCell(value, metric.format, currency)}`}
                      >
                        {formatCell(value, metric.format, currency)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Legend({ neutral, metricLabel }: { neutral: number; metricLabel: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
      <span>below {neutral}</span>
      <span
        className="inline-block h-2.5 w-24 rounded-full"
        style={{
          background:
            'linear-gradient(to right, var(--diverge-neg), var(--diverge-mid), var(--diverge-pos))',
        }}
        aria-label={`Diverging scale for ${metricLabel}, neutral at ${neutral}`}
      />
      <span>above</span>
    </div>
  );
}
