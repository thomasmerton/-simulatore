/**
 * Data-quality warnings and the confidence badge.
 *
 * These are prominent by design. A result that looks precise but rests on
 * guesses is the specific failure this product exists to avoid, so the
 * warnings sit next to the numbers rather than behind a disclosure.
 */

import type { QualityWarning, ResultConfidence, ConfidenceAssessment } from '@/domain/quality';
import { sortWarnings } from '@/domain/quality';
import { labelFor } from './Assumptions';

const SEVERITY_STYLE: Record<QualityWarning['severity'], { bg: string; fg: string; mark: string }> =
  {
    SERIOUS: { bg: 'var(--warning-soft)', fg: 'var(--warning)', mark: '▲' },
    CAUTION: { bg: 'var(--surface-muted)', fg: 'var(--text-muted)', mark: '▲' },
    INFO: { bg: 'var(--surface-muted)', fg: 'var(--text-muted)', mark: 'ⓘ' },
  };

export function WarningList({
  warnings,
  limit,
}: {
  warnings: QualityWarning[];
  limit?: number;
}) {
  const sorted = sortWarnings(warnings);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const hidden = sorted.length - shown.length;

  if (sorted.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        No data-quality warnings for these inputs.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {shown.map((w) => {
        const style = SEVERITY_STYLE[w.severity];
        return (
          <div
            key={w.code}
            className="flex gap-2 rounded-lg border px-2.5 py-2 text-xs leading-relaxed"
            style={{
              background: style.bg,
              borderColor: w.severity === 'SERIOUS' ? 'var(--warning)' : 'var(--border)',
              color: style.fg,
            }}
          >
            <span aria-hidden className="shrink-0">
              {style.mark}
            </span>
            <span>
              {w.message}
              {w.paths.length > 0 && (
                <span style={{ color: 'var(--text-subtle)' }}>
                  {' '}
                  ({w.paths.map(labelFor).join(', ')})
                </span>
              )}
            </span>
          </div>
        );
      })}
      {hidden > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          + {hidden} more on the Assumptions tab.
        </p>
      )}
    </div>
  );
}

const CONFIDENCE_COLOR: Record<ResultConfidence, string> = {
  HIGH: 'var(--positive)',
  MEDIUM: 'var(--warning)',
  LOW: 'var(--negative)',
};

/**
 * The confidence badge that sits under a headline metric.
 *
 * It carries the reason, because "LOW" alone is just another opaque rating —
 * and an opaque rating is the thing this product refuses to produce.
 */
export function ConfidenceBadge({
  assessment,
  showReason = true,
}: {
  assessment: ConfidenceAssessment;
  showReason?: boolean;
}) {
  const color = CONFIDENCE_COLOR[assessment.level];
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span
        className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color, borderColor: color }}
        title={assessment.reason}
      >
        Confidence: {assessment.level}
      </span>
      {showReason && (
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {assessment.reason}
        </span>
      )}
    </span>
  );
}
