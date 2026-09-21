/**
 * Form fields.
 *
 * Every numeric field distinguishes "empty" from "zero": clearing a field
 * stores null, which propagates through the engine as a missing input rather
 * than being silently treated as 0.
 */

import type { ReactNode } from 'react';
import type { Provenance } from '@/domain/provenance';
import { ProvenanceBadge } from './primitives';
import { numberToInput, parseNumber, parsePercent, percentToInput } from '../format';

const inputClass =
  'w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm transition-colors placeholder:text-[var(--text-subtle)]';

function Label({
  label,
  provenance,
  hint,
  htmlFor,
}: {
  label: string;
  provenance?: Provenance;
  hint?: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
        {hint && (
          <span className="ml-1" style={{ color: 'var(--text-subtle)' }} title={String(hint)}>
            ⓘ
          </span>
        )}
      </label>
      {provenance && <ProvenanceBadge provenance={provenance} compact />}
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  placeholder = 'Not provided',
  provenance,
  hint,
  min,
  step,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  placeholder?: string;
  provenance?: Provenance;
  hint?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div>
      <Label label={label} provenance={provenance} hint={hint} htmlFor={id} />
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={`${inputClass} tabular ${suffix ? 'pr-10' : ''}`}
          style={{ borderColor: 'var(--border-strong)' }}
          value={numberToInput(value)}
          placeholder={placeholder}
          min={min}
          step={step}
          onChange={(e) => onChange(parseNumber(e.target.value))}
        />
        {suffix && (
          <span
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: 'var(--text-subtle)' }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/** Percentages are typed as 5.5 and stored as 0.055. */
export function PercentField({
  id,
  label,
  value,
  onChange,
  provenance,
  hint,
  step = 0.1,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  provenance?: Provenance;
  hint?: string;
  step?: number;
}) {
  return (
    <div>
      <Label label={label} provenance={provenance} hint={hint} htmlFor={id} />
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          className={`${inputClass} tabular pr-8`}
          style={{ borderColor: 'var(--border-strong)' }}
          value={percentToInput(value)}
          placeholder="Not provided"
          onChange={(e) => onChange(parsePercent(e.target.value))}
        />
        <span
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
          style={{ color: 'var(--text-subtle)' }}
        >
          %
        </span>
      </div>
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder = '',
  provenance,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  provenance?: Provenance;
}) {
  return (
    <div>
      <Label label={label} provenance={provenance} htmlFor={id} />
      <input
        id={id}
        type="text"
        className={inputClass}
        style={{ borderColor: 'var(--border-strong)' }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  provenance,
  hint,
}: {
  id: string;
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
  provenance?: Provenance;
  hint?: string;
}) {
  return (
    <div>
      <Label label={label} provenance={provenance} hint={hint} htmlFor={id} />
      <select
        id={id}
        className={inputClass}
        style={{ borderColor: 'var(--border-strong)' }}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
      >
        <option value="">Not provided</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ToggleField({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-2.5 py-2"
      style={{ borderColor: 'var(--border-strong)' }}
      title={hint}
    >
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function FieldGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const className =
    cols === 2
      ? 'sm:grid-cols-2'
      : cols === 4
        ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'sm:grid-cols-2 lg:grid-cols-3';
  return <div className={`grid grid-cols-1 gap-3 ${className}`}>{children}</div>;
}
