/**
 * The assumptions register — "where do the numbers come from?".
 *
 * Every input that drives the analysis, its class, and what it currently is.
 * This is the bottom of the drill-down: Overview says what the picture is,
 * Underwriting says why the numbers are what they are, and this page says what
 * they rest on. A reader who disagrees with the result should be able to get
 * here and find the line they disagree with.
 */

import { useMemo, useState } from 'react';
import type { Property, TaxProfile } from '@/domain/types';
import { runProjection } from '@/calculations/projection';
import { strategyMissingInputs } from '@/calculations/strategies';
import { taxProfileGaps } from '@/calculations/tax';
import { assessConfidence, collectInputWarnings } from '@/domain/quality';
import { PROVENANCE_META, type Provenance } from '@/domain/provenance';
import { useApp, blankTaxProfile } from '@/store/AppStore';
import { newId } from '@/store/repository';
import { Button, Card, Notice, ProvenanceBadge, Table, Td, Th } from '../components/primitives';
import { ConfidenceBadge, WarningList } from '../components/Warnings';
import { NumberField, PercentField, SelectField, TextField, ToggleField, FieldGrid } from '../components/fields';
import { CORE_INPUT_PATHS, labelFor } from '../components/Assumptions';
import { formatPercent, UNAVAILABLE } from '../format';

/** Every input path the register lists, grouped the way underwriting works. */
const REGISTER: { group: string; paths: string[] }[] = [
  {
    group: 'Property',
    paths: ['facts.location', 'facts.purchasePrice', 'facts.askingPrice', 'facts.marketValue', 'facts.sqm', 'facts.condition', 'facts.propertyType'],
  },
  {
    group: 'Acquisition',
    paths: [
      'acquisition.purchaseTaxRate',
      'acquisition.notaryFees',
      'acquisition.legalFees',
      'acquisition.agencyCommissionRate',
      'acquisition.financingFees',
      'acquisition.renovationCost',
      'acquisition.furnitureCost',
      'acquisition.initialReserves',
      'acquisition.otherUpfrontCosts',
    ],
  },
  {
    group: 'Operations',
    paths: [
      'rental.monthlyRent',
      'rental.vacancyDaysPerYear',
      'rental.stabilizationMonths',
      'rental.rentGrowthRate',
      'rental.condoFees',
      'rental.propertyTax',
      'rental.insurance',
      'rental.ordinaryMaintenance',
      'rental.capexReserve',
      'rental.managementFeeRate',
      'rental.utilities',
      'rental.otherOperatingCosts',
      'rental.expenseGrowthRate',
    ],
  },
  {
    group: 'Financing',
    paths: ['financing.ltv', 'financing.annualRate', 'financing.termYears', 'financing.amortizationType', 'financing.maturityYears'],
  },
  {
    group: 'Tax & exit',
    paths: [
      'incomeTax.mode',
      'incomeTax.rate',
      'exit.holdingPeriodYears',
      'exit.priceGrowthRate',
      'exit.sellingCostsRate',
      'exit.capitalGainsTaxRate',
      'exit.capitalGainsExemptAfterYears',
      'settings.discountRate',
    ],
  },
];

/** Read a dotted path off the inputs for display. */
function readPath(inputs: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[key];
    return undefined;
  }, inputs);
}

function displayValue(value: unknown, path: string): string {
  if (value === null || value === undefined) return UNAVAILABLE;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    const geo = value as { city?: string | null; country?: string };
    return [geo.city, geo.country].filter(Boolean).join(', ') || UNAVAILABLE;
  }
  if (typeof value === 'number') {
    const isRate =
      path.includes('Rate') || path.includes('Growth') || path.includes('ltv') || path.endsWith('.rate');
    return isRate ? formatPercent(value, 2) : new Intl.NumberFormat('en-GB').format(value);
  }
  return String(value);
}

export function AssumptionsRegister({ property }: { property: Property }) {
  const { taxProfiles, upsertTaxProfile, deleteTaxProfile, applyTaxProfileToProperty } = useApp();
  const { inputs, provenance } = property;
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeProfile = taxProfiles.find((p) => p.id === property.taxProfileId) ?? null;

  const result = useMemo(() => runProjection(inputs), [inputs]);
  const warnings = useMemo(
    () =>
      collectInputWarnings(inputs, provenance, {
        taxProfileVerified: activeProfile ? activeProfile.verified : undefined,
        strategyMissing: strategyMissingInputs(inputs.rental),
      }),
    [inputs, provenance, activeProfile],
  );
  const confidence = useMemo(
    () => assessConfidence(provenance, CORE_INPUT_PATHS),
    [provenance],
  );

  const counts = useMemo(() => {
    const all = REGISTER.flatMap((g) => g.paths);
    const tally: Record<Provenance, number> = {
      RAW_DATA: 0,
      DERIVED_DATA: 0,
      USER_INPUT: 0,
      MODEL_ASSUMPTION: 0,
      MISSING: 0,
    };
    for (const path of all) tally[provenance[path] ?? 'MISSING']++;
    return tally;
  }, [provenance]);

  return (
    <div className="space-y-4">
      <Card
        title="Result confidence"
        subtitle="Assigned by rules over the classes of the inputs, not by a weighted score."
      >
        <ConfidenceBadge assessment={confidence} />

        <div className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(counts) as Provenance[])
            .filter((c) => counts[c] > 0)
            .map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 text-xs">
                <ProvenanceBadge provenance={c} compact />
                <span style={{ color: 'var(--text-muted)' }}>
                  {counts[c]} {PROVENANCE_META[c].label.toLowerCase()}
                </span>
              </span>
            ))}
        </div>

        <div className="mt-4">
          <p
            className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-subtle)' }}
          >
            How confidence is assigned
          </p>
          <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <li>
              <strong>LOW</strong> — a required input is missing, or the result rests on a default
              for a driver it is structurally most sensitive to (appreciation, discount rate), or
              more than half the inputs are still defaults.
            </li>
            <li>
              <strong>MEDIUM</strong> — everything is present, but at least one input is a default
              or was derived rather than observed.
            </li>
            <li>
              <strong>HIGH</strong> — every input is your own figure or source data. That does not
              mean the figures are right, only that nothing was invented here.
            </li>
          </ul>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
            There is no 0–100 score on purpose: any weighting would be arbitrary, and would invite
            the very false precision this page exists to prevent.
          </p>
        </div>
      </Card>

      <Card title="Data-quality warnings" subtitle="Deterministic rules over your inputs. None of them is a judgement about the investment.">
        <WarningList warnings={warnings} />
      </Card>

      <Card
        title="Tax profile"
        subtitle="Tax rules are inputs with a country, a source and an effective date — never hardcoded law."
        actions={
          <Button
            size="sm"
            onClick={() => {
              const profile = blankTaxProfile(newId());
              upsertTaxProfile(profile);
              setEditingId(profile.id);
            }}
          >
            New profile
          </Button>
        }
      >
        <Notice tone={activeProfile && !activeProfile.verified ? 'warning' : 'info'}>
          {activeProfile
            ? activeProfile.verified
              ? `Applying "${activeProfile.name}".`
              : `Applying "${activeProfile.name}", which is UNVERIFIED. Every tax figure derived from it is a model assumption, however precise the rates look.`
            : 'No tax profile applied. The property uses whatever tax inputs you set directly.'}{' '}
          This tool does not provide tax advice.
        </Notice>

        <div className="mt-4 space-y-3">
          {taxProfiles.map((profile) => {
            const gaps = taxProfileGaps(profile);
            const isActive = profile.id === property.taxProfileId;
            return (
              <div
                key={profile.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                  background: isActive ? 'var(--accent-soft)' : undefined,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{profile.name}</p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {profile.country || 'No country'} · {profile.investorType.toLowerCase()} ·{' '}
                      {profile.transactionType.toLowerCase().replace(/_/g, ' ')}
                      {profile.effectiveDate ? ` · from ${profile.effectiveDate}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                      style={{
                        color: profile.verified ? 'var(--positive)' : 'var(--warning)',
                        borderColor: profile.verified ? 'var(--positive)' : 'var(--warning)',
                      }}
                    >
                      {profile.verified ? 'Verified' : 'Unverified'}
                    </span>
                    <Button size="sm" onClick={() => applyTaxProfileToProperty(property.id, profile.id)}>
                      {isActive ? 'Re-apply' : 'Apply'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(editingId === profile.id ? null : profile.id)}
                    >
                      {editingId === profile.id ? 'Close' : 'Edit'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => deleteTaxProfile(profile.id)}>
                      ✕
                    </Button>
                  </div>
                </div>

                {gaps.length > 0 && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--warning)' }}>
                    Incomplete: no {gaps.join(', ')}.
                  </p>
                )}
                {profile.notes && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {profile.notes}
                  </p>
                )}

                {editingId === profile.id && (
                  <TaxProfileEditor profile={profile} onChange={upsertTaxProfile} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Assumption register"
        subtitle="Every input behind the analysis, with where it came from."
      >
        {REGISTER.map((group) => (
          <div key={group.group} className="mb-5 last:mb-0">
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-subtle)' }}
            >
              {group.group}
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Input</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">Class</Th>
                </tr>
              </thead>
              <tbody>
                {group.paths.map((path) => {
                  const cls = provenance[path] ?? 'MISSING';
                  const value = readPath(inputs, path);
                  return (
                    <tr key={path}>
                      <Td>{labelFor(path)}</Td>
                      <Td align="right" muted={value === null || value === undefined}>
                        {displayValue(value, path)}
                      </Td>
                      <Td align="right">
                        <span title={PROVENANCE_META[cls].description}>
                          <ProvenanceBadge provenance={cls} />
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        ))}

        {result.notes.length > 0 && (
          <div className="mt-4 space-y-2">
            {result.notes.map((n) => (
              <Notice key={n.code} tone={n.severity === 'WARNING' ? 'warning' : 'info'}>
                {n.message}
              </Notice>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TaxProfileEditor({
  profile,
  onChange,
}: {
  profile: TaxProfile;
  onChange: (p: TaxProfile) => void;
}) {
  const set = <K extends keyof TaxProfile>(key: K, value: TaxProfile[K]) =>
    onChange({ ...profile, [key]: value });

  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
      <FieldGrid>
        <TextField id={`${profile.id}-name`} label="Profile name" value={profile.name} onChange={(v) => set('name', v)} />
        <TextField id={`${profile.id}-country`} label="Country" value={profile.country} onChange={(v) => set('country', v)} />
        <SelectField
          id={`${profile.id}-investor`}
          label="Investor type"
          value={profile.investorType}
          options={[
            { value: 'INDIVIDUAL', label: 'Individual' },
            { value: 'COMPANY', label: 'Company' },
            { value: 'NON_RESIDENT', label: 'Non-resident' },
          ]}
          onChange={(v) => set('investorType', v ?? 'INDIVIDUAL')}
        />
        <SelectField
          id={`${profile.id}-transaction`}
          label="Transaction type"
          value={profile.transactionType}
          options={[
            { value: 'RESIDENTIAL_SECONDARY', label: 'Residential — second home' },
            { value: 'RESIDENTIAL_PRIMARY', label: 'Residential — primary home' },
            { value: 'NEW_BUILD', label: 'New build' },
            { value: 'COMMERCIAL', label: 'Commercial' },
          ]}
          onChange={(v) => set('transactionType', v ?? 'RESIDENTIAL_SECONDARY')}
        />
        <PercentField
          id={`${profile.id}-purchaseTax`}
          label="Purchase tax"
          value={profile.purchaseTaxRate}
          onChange={(v) => set('purchaseTaxRate', v)}
        />
        <SelectField
          id={`${profile.id}-incomeMode`}
          label="Rental income tax"
          value={profile.incomeTaxMode}
          options={[
            { value: 'NONE', label: 'None (pre-tax)' },
            { value: 'FLAT_ON_GROSS', label: 'Flat on collected rent' },
            { value: 'FLAT_ON_NET', label: 'Flat on net profit' },
          ]}
          onChange={(v) => set('incomeTaxMode', v ?? 'NONE')}
        />
        <PercentField
          id={`${profile.id}-incomeRate`}
          label="Income tax rate"
          value={profile.incomeTaxRate}
          onChange={(v) => set('incomeTaxRate', v)}
        />
        <PercentField
          id={`${profile.id}-cgt`}
          label="Capital gains tax"
          value={profile.capitalGainsTaxRate}
          onChange={(v) => set('capitalGainsTaxRate', v)}
        />
        <NumberField
          id={`${profile.id}-cgtExempt`}
          label="Gain exempt after"
          value={profile.capitalGainsExemptAfterYears}
          onChange={(v) => set('capitalGainsExemptAfterYears', v)}
          suffix="years"
        />
        <PercentField
          id={`${profile.id}-selling`}
          label="Selling costs"
          value={profile.sellingCostsRate}
          onChange={(v) => set('sellingCostsRate', v)}
        />
        <TextField
          id={`${profile.id}-source`}
          label="Source"
          value={profile.source ?? ''}
          onChange={(v) => set('source', v || null)}
          placeholder="e.g. Agenzia delle Entrate, circolare n…"
        />
        <TextField
          id={`${profile.id}-sourceUrl`}
          label="Source URL"
          value={profile.sourceUrl ?? ''}
          onChange={(v) => set('sourceUrl', v || null)}
        />
        <TextField
          id={`${profile.id}-effective`}
          label="Effective from (YYYY-MM-DD)"
          value={profile.effectiveDate ?? ''}
          onChange={(v) => set('effectiveDate', v || null)}
        />
        <ToggleField
          id={`${profile.id}-verified`}
          label="Verified against the law"
          checked={profile.verified}
          onChange={(v) => set('verified', v)}
          hint="Only tick this once a professional has confirmed these rates for this investor and transaction."
        />
      </FieldGrid>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <textarea
          rows={2}
          className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          style={{ borderColor: 'var(--border-strong)' }}
          value={profile.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || null)}
        />
      </label>
    </div>
  );
}
