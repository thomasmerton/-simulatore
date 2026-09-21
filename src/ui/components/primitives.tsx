/**
 * Shared UI primitives.
 *
 * Deliberately small and unopinionated: cards, tiles, tables and fields. The
 * product's job is to make numbers legible and their provenance obvious, so
 * the visual language stays quiet and lets the figures carry the page.
 */

import type { ReactNode } from 'react';
import { PROVENANCE_META, type Provenance } from '@/domain/provenance';
import { UNAVAILABLE } from '../format';

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    /* min-w-0: as a grid or flex item a card defaults to min-width:auto, which
       makes it expand to any wide table inside instead of letting that table
       scroll — and that overflows the page on narrow screens. */
    <section
      className={`min-w-0 rounded-xl border bg-[var(--surface)] ${className}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>
        {children}
      </h3>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Provenance badge
 * ------------------------------------------------------------------ */

const TONE_VAR: Record<Provenance, string> = {
  VERIFIED: 'var(--prov-verified)',
  USER_INPUT: 'var(--prov-user)',
  ESTIMATED: 'var(--prov-estimated)',
  MODEL_ASSUMPTION: 'var(--prov-assumption)',
  MISSING: 'var(--prov-missing)',
};

export function ProvenanceBadge({
  provenance,
  compact = false,
}: {
  provenance: Provenance;
  compact?: boolean;
}) {
  const meta = PROVENANCE_META[provenance];
  const color = TONE_VAR[provenance];
  if (compact) {
    return (
      <span
        title={`${meta.label}: ${meta.description}`}
        aria-label={meta.label}
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
        style={{ background: color }}
      />
    );
  }
  return (
    <span
      title={meta.description}
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ color, borderColor: color }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: color }} />
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Stat tile
 * ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  note,
  provenance,
  emphasis = 'normal',
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note?: ReactNode;
  provenance?: Provenance;
  emphasis?: 'normal' | 'large';
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const unavailable = value === UNAVAILABLE;
  const color = unavailable
    ? 'var(--text-subtle)'
    : tone === 'positive'
      ? 'var(--positive)'
      : tone === 'negative'
        ? 'var(--negative)'
        : 'var(--text)';

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span
          className="truncate text-[11px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-subtle)' }}
        >
          {label}
        </span>
        {provenance && <ProvenanceBadge provenance={provenance} compact />}
      </div>
      <div
        className={`tabular mt-1 font-semibold tracking-tight ${
          emphasis === 'large' ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'
        } ${unavailable ? 'text-base sm:text-lg' : ''}`}
        style={{ color }}
      >
        {value}
      </div>
      {note && (
        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className={`w-full min-w-[32rem] border-collapse text-sm ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  sticky = false,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  sticky?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${sticky ? 'sticky left-0 z-10 bg-[var(--surface)]' : ''}`}
      style={{ color: 'var(--text-subtle)' }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  muted = false,
  sticky = false,
  className = '',
  style,
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  muted?: boolean;
  sticky?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`tabular border-b px-3 py-2 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${sticky ? 'sticky left-0 z-10 bg-[var(--surface)] font-medium' : ''} ${className}`}
      style={{ ...(muted ? { color: 'var(--text-muted)' } : {}), ...style }}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const sizing = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' },
    secondary: { background: 'var(--surface)', borderColor: 'var(--border-strong)' },
    ghost: { background: 'transparent', borderColor: 'transparent', color: 'var(--text-muted)' },
    danger: { background: 'transparent', borderColor: 'var(--border-strong)', color: 'var(--negative)' },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizing} hover:opacity-85`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

export function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Notices
 * ------------------------------------------------------------------ */

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning';
  title?: ReactNode;
  children: ReactNode;
}) {
  const warning = tone === 'warning';
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs leading-relaxed"
      style={{
        background: warning ? 'var(--warning-soft)' : 'var(--surface-muted)',
        borderColor: warning ? 'var(--warning)' : 'var(--border)',
        color: warning ? 'var(--warning)' : 'var(--text-muted)',
      }}
    >
      {title && <strong className="mr-1 font-semibold">{title}</strong>}
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      className="rounded-lg border border-dashed px-4 py-8 text-center"
      style={{ borderColor: 'var(--border-strong)' }}
    >
      <p className="text-sm font-medium">{title}</p>
      {children && (
        <div className="mx-auto mt-1 max-w-md text-xs" style={{ color: 'var(--text-muted)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
