/**
 * The provenance panel.
 *
 * The product's contract with the reader: any figure that came from outside
 * can be interrogated. "Average rent €14.20/m²" is not acceptable on its own —
 * the reader must be able to reach the source, the period it covers, the unit
 * it is measured in, the method behind it and how much the publisher trusts it.
 */

import { useState, type ReactNode } from 'react';
import type { DataPoint } from '@/domain/datapoint';
import { formatGeography, periodAgeMonths } from '@/domain/datapoint';
import { formatUnit } from '@/domain/units';
import { collectDataPointWarnings, STALE_DATA_MONTHS } from '@/domain/quality';
import { PROVENANCE_META } from '@/domain/provenance';
import { ProvenanceBadge } from './primitives';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1">
      <dt className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>
        {label}
      </dt>
      <dd className="text-xs leading-relaxed">{children}</dd>
    </div>
  );
}

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function DataPointDetail({ point, label }: { point: DataPoint; label: string }) {
  const warnings = collectDataPointWarnings(point, label);
  const age = periodAgeMonths(point.period);
  const meta = PROVENANCE_META[point.dataClass];

  return (
    <div className="w-72 max-w-[85vw] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{label}</span>
        <ProvenanceBadge provenance={point.dataClass} />
      </div>

      <dl className="divide-y" style={{ borderColor: 'var(--border)' }}>
        <Row label="Source">
          {point.source.sourceUrl ? (
            <a
              href={point.source.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
              style={{ color: 'var(--accent)' }}
            >
              {point.source.source}
            </a>
          ) : (
            point.source.source
          )}
        </Row>
        <Row label="Period">
          {point.period.label}
          {age !== null && (
            <span style={{ color: age > STALE_DATA_MONTHS ? 'var(--warning)' : 'var(--text-subtle)' }}>
              {' '}
              · {age <= 0 ? 'current' : `${age} months old`}
            </span>
          )}
        </Row>
        <Row label="Geography">
          {formatGeography(point.geography)}
          <span style={{ color: 'var(--text-subtle)' }}> · {point.geography.level.toLowerCase()} level</span>
        </Row>
        <Row label="Unit">{formatUnit(point.unit, point.currency)}</Row>
        <Row label="Retrieved">{shortDate(point.source.retrievedAt)}</Row>
        <Row label="Confidence">{point.confidence}</Row>
        <Row label="Class">{meta.label}</Row>
        <Row label="Method">
          <span style={{ color: 'var(--text-muted)' }}>{point.source.methodology}</span>
        </Row>
      </dl>

      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li
              key={w.code}
              className="rounded px-2 py-1 text-[11px] leading-snug"
              style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
            >
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A value with its provenance dot, revealing the full detail on click.
 * Click rather than hover, so it works on touch and stays open to be read.
 */
export function DataPointValue({
  point,
  label,
  formatted,
}: {
  point: DataPoint | null;
  label: string;
  formatted: string;
}) {
  const [open, setOpen] = useState(false);

  if (!point || point.value === null) {
    return (
      <span style={{ color: 'var(--text-subtle)' }} title="No value available from any source">
        {formatted}
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="tabular inline-flex items-center gap-1.5 rounded px-0.5 hover:underline"
        title="Show source, period, unit and method"
      >
        {formatted}
        <ProvenanceBadge provenance={point.dataClass} compact />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full z-50 mt-1 rounded-lg border p-3 shadow-xl"
            style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}
          >
            <DataPointDetail point={point} label={label} />
          </div>
        </>
      )}
    </span>
  );
}
