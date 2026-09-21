/**
 * Deals — import a listing, then compare saved properties side by side.
 *
 * There is deliberately NO scraping. Scraping a portal without permission is
 * both legally and technically unreliable, and a silently-broken scraper would
 * feed wrong numbers into the model while looking like it worked. Until an
 * authorised source exists, the listing is transcribed by hand and the URL is
 * kept so any figure can be traced back to what it was read from.
 *
 * Comparison is on identical metrics in a stable order, with no ranking.
 */

import { useMemo, useState } from 'react';
import type { PropertyCondition, PropertyType, RentalStrategy } from '@/domain/types';
import { RENTAL_STRATEGY_LABELS } from '@/domain/types';
import { runProjection } from '@/calculations/projection';
import { runScenario } from '@/calculations/scenario';
import { assessConfidence } from '@/domain/quality';
import { CORE_INPUT_PATHS } from '../components/Assumptions';
import { useApp } from '@/store/AppStore';
import { Button, Card, EmptyState, Notice, Table, Td, Th } from '../components/primitives';
import { ConfidenceBadge } from '../components/Warnings';
import { FieldGrid, NumberField, SelectField, TextField } from '../components/fields';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMultiple,
  formatPercent,
  formatYears,
  UNAVAILABLE,
} from '../format';

const CONDITIONS: { value: PropertyCondition; label: string }[] = [
  { value: 'NEW', label: 'New build' },
  { value: 'RENOVATED', label: 'Recently renovated' },
  { value: 'GOOD', label: 'Good condition' },
  { value: 'HABITABLE', label: 'Habitable' },
  { value: 'TO_RENOVATE', label: 'Needs renovation' },
  { value: 'TO_GUT', label: 'Needs gutting' },
];

const TYPES: { value: PropertyType; label: string }[] = [
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'HOUSE', label: 'House' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'ROOM', label: 'Room' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'OTHER', label: 'Other' },
];

interface DraftDeal {
  name: string;
  listingUrl: string;
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  address: string;
  propertyType: PropertyType | null;
  askingPrice: number | null;
  sqm: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  condition: PropertyCondition | null;
  monthlyRent: number | null;
  strategy: RentalStrategy;
}

function emptyDraft(): DraftDeal {
  return {
    name: '',
    listingUrl: '',
    country: '',
    region: '',
    city: '',
    neighborhood: '',
    address: '',
    propertyType: null,
    askingPrice: null,
    sqm: null,
    rooms: null,
    bathrooms: null,
    floor: null,
    condition: null,
    monthlyRent: null,
    strategy: 'LONG_TERM',
  };
}

export function Deals() {
  const { properties, importDeal, setActiveProperty } = useApp();
  const [draft, setDraft] = useState<DraftDeal>(emptyDraft);
  const [showForm, setShowForm] = useState(false);

  const set = <K extends keyof DraftDeal>(key: K, value: DraftDeal[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const canImport = draft.name.trim() !== '' && draft.askingPrice !== null;

  const analyses = useMemo(
    () =>
      properties.map((property) => {
        const result = runProjection(property.inputs);
        const downside = runScenario(property.inputs, {
          id: 'cmp-downside',
          name: 'Downside',
          builtIn: true,
          description: '',
          shocks: {
            ...{
              purchasePriceDelta: 0,
              renovationCostDelta: 0,
              marketValueDelta: -0.15,
              priceGrowthDelta: -0.01,
              rentDelta: -0.1,
              vacancyDelta: 0.5,
              occupancyRateDelta: -0.15,
              adrDelta: -0.1,
              rentGrowthDelta: -0.01,
              maintenanceDelta: 0.2,
              managementDelta: 0,
              propertyTaxDelta: 0.1,
              otherOperatingDelta: 0.15,
              interestRateDelta: 0.02,
              sellingCostsDelta: 0.01,
              exitTaxDelta: 0,
            },
          },
        });
        return {
          property,
          result,
          downside: downside.projection,
          confidence: assessConfidence(property.provenance, CORE_INPUT_PATHS),
        };
      }),
    [properties],
  );

  const currencies = useMemo(
    () => [...new Set(properties.map((p) => p.inputs.settings.currency))],
    [properties],
  );

  const rows: {
    label: string;
    render: (a: (typeof analyses)[number]) => string;
    muted?: boolean;
    strong?: boolean;
  }[] = [
    { label: 'City', render: (a) => a.property.inputs.facts.location.city || '—', muted: true },
    { label: 'Country', render: (a) => a.property.inputs.facts.location.country || '—', muted: true },
    {
      label: 'Strategy',
      render: (a) => RENTAL_STRATEGY_LABELS[a.property.inputs.rental.strategy],
      muted: true,
    },
    {
      label: 'Purchase price',
      render: (a) =>
        formatCurrency(a.result.acquisition.purchasePrice, a.property.inputs.settings.currency),
    },
    {
      label: 'Price per m²',
      render: (a) =>
        formatCurrency(a.result.acquisition.pricePerSqm, a.property.inputs.settings.currency),
    },
    {
      label: 'Total acquisition cost',
      render: (a) =>
        formatCurrency(
          a.result.acquisition.totalAcquisitionCost,
          a.property.inputs.settings.currency,
        ),
    },
    {
      label: 'Equity invested',
      render: (a) => formatCurrency(a.result.equityInvested, a.property.inputs.settings.currency),
    },
    {
      label: 'Gross rent (year 1)',
      render: (a) =>
        formatCurrency(a.result.year1.grossScheduledRevenue, a.property.inputs.settings.currency),
    },
    {
      label: 'NOI (year 1)',
      render: (a) => formatCurrency(a.result.year1.noi, a.property.inputs.settings.currency),
    },
    { label: 'Net yield (on total cost)', render: (a) => formatPercent(a.result.year1.netYieldOnTotalCost) },
    { label: 'Leverage (LTV)', render: (a) => formatPercent(a.result.years[0]?.ltv ?? null) },
    {
      label: 'Cash flow (year 1)',
      render: (a) =>
        formatCurrency(a.result.year1.afterTaxCashFlow, a.property.inputs.settings.currency),
    },
    { label: 'DSCR (year 1)', render: (a) => (a.result.year1.dscr === null ? '—' : a.result.year1.dscr.toFixed(2)) },
    { label: 'IRR (equity)', render: (a) => formatPercent(a.result.leveredIRR.value), strong: true },
    { label: 'IRR (unlevered)', render: (a) => formatPercent(a.result.unleveredIRR.value) },
    {
      label: 'NPV',
      render: (a) => formatCurrencyCompact(a.result.npv, a.property.inputs.settings.currency),
    },
    { label: 'Equity multiple', render: (a) => formatMultiple(a.result.equityMultiple) },
    {
      label: 'Payback',
      render: (a) =>
        a.result.payback.beyondHorizon ? 'Beyond horizon' : formatYears(a.result.payback.years),
    },
    {
      label: 'Downside IRR',
      render: (a) => formatPercent(a.downside.leveredIRR.value),
      strong: true,
    },
    {
      label: 'Downside cash flow (year 1)',
      render: (a) =>
        formatCurrencyCompact(a.downside.year1.afterTaxCashFlow, a.property.inputs.settings.currency),
    },
  ];

  return (
    <div className="space-y-4">
      <Card
        title="Import a deal"
        subtitle="Paste the listing's figures. The URL is kept so any number can be traced back to what it was read from."
        actions={
          <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Hide form' : 'New deal'}
          </Button>
        }
      >
        {showForm ? (
          <>
            <Notice>
              Nothing is scraped. Portal terms rarely permit it, and a silently-broken scraper would
              feed wrong numbers into the model while appearing to work. Everything you type is
              recorded as <strong>your input</strong>, which is what it is.
            </Notice>

            <div className="mt-4 space-y-4">
              <FieldGrid>
                <TextField
                  id="deal-name"
                  label="Reference name"
                  value={draft.name}
                  onChange={(v) => set('name', v)}
                  placeholder="e.g. Via Roma 12"
                />
                <TextField
                  id="deal-url"
                  label="Listing URL"
                  value={draft.listingUrl}
                  onChange={(v) => set('listingUrl', v)}
                  placeholder="https://…"
                />
                <TextField
                  id="deal-address"
                  label="Address"
                  value={draft.address}
                  onChange={(v) => set('address', v)}
                />
                <TextField
                  id="deal-country"
                  label="Country"
                  value={draft.country}
                  onChange={(v) => set('country', v)}
                />
                <TextField
                  id="deal-region"
                  label="Region"
                  value={draft.region}
                  onChange={(v) => set('region', v)}
                />
                <TextField
                  id="deal-city"
                  label="City"
                  value={draft.city}
                  onChange={(v) => set('city', v)}
                />
                <TextField
                  id="deal-neighborhood"
                  label="Neighbourhood"
                  value={draft.neighborhood}
                  onChange={(v) => set('neighborhood', v)}
                />
                <NumberField
                  id="deal-price"
                  label="Asking price"
                  value={draft.askingPrice}
                  onChange={(v) => set('askingPrice', v)}
                  suffix="€"
                />
                <NumberField
                  id="deal-sqm"
                  label="Surface"
                  value={draft.sqm}
                  onChange={(v) => set('sqm', v)}
                  suffix="m²"
                />
                <NumberField
                  id="deal-rooms"
                  label="Rooms"
                  value={draft.rooms}
                  onChange={(v) => set('rooms', v)}
                />
                <NumberField
                  id="deal-baths"
                  label="Bathrooms"
                  value={draft.bathrooms}
                  onChange={(v) => set('bathrooms', v)}
                />
                <NumberField
                  id="deal-floor"
                  label="Floor"
                  value={draft.floor}
                  onChange={(v) => set('floor', v)}
                />
                <SelectField
                  id="deal-type"
                  label="Property type"
                  value={draft.propertyType}
                  options={TYPES}
                  onChange={(v) => set('propertyType', v)}
                />
                <SelectField
                  id="deal-condition"
                  label="Condition"
                  value={draft.condition}
                  options={CONDITIONS}
                  onChange={(v) => set('condition', v)}
                />
                <NumberField
                  id="deal-rent"
                  label="Monthly rent (asking or achieved)"
                  value={draft.monthlyRent}
                  onChange={(v) => set('monthlyRent', v)}
                  suffix="€"
                  hint="Leave empty if the listing does not state one — it will show as missing rather than be guessed."
                />
                <SelectField
                  id="deal-strategy"
                  label="Intended strategy"
                  value={draft.strategy}
                  options={(Object.keys(RENTAL_STRATEGY_LABELS) as RentalStrategy[]).map((k) => ({
                    value: k,
                    label: RENTAL_STRATEGY_LABELS[k],
                  }))}
                  onChange={(v) => set('strategy', v ?? 'LONG_TERM')}
                />
              </FieldGrid>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  disabled={!canImport}
                  onClick={() => {
                    importDeal(draft);
                    setDraft(emptyDraft());
                    setShowForm(false);
                  }}
                >
                  Import deal
                </Button>
                <Button variant="ghost" onClick={() => setDraft(emptyDraft())}>
                  Clear
                </Button>
                {!canImport && (
                  <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    A name and an asking price are required.
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} saved. Import another
            to compare them side by side.
          </p>
        )}
      </Card>

      <Card
        title="Deal comparison"
        subtitle="The same metrics, computed the same way, for every property."
      >
        {properties.length < 2 ? (
          <EmptyState title="Add a second property to compare">
            Comparison needs at least two properties. Import a deal above, or use “New” in the
            header.
          </EmptyState>
        ) : (
          <>
            <Notice>
              Properties are listed in the order you created them. There is no ranking and no
              overall score: which differences matter depends on what you are trying to achieve,
              and only you know that.
            </Notice>

            {currencies.length > 1 && (
              <div className="mt-3">
                <Notice tone="warning" title="Mixed currencies.">
                  These properties are denominated in {currencies.join(', ')}. No exchange rates
                  are applied, so money rows are NOT comparable across them. Rates — yields, IRR,
                  DSCR, multiples — are unaffected.
                </Notice>
              </div>
            )}

            <div className="mt-4">
              <Table>
                <thead>
                  <tr>
                    <Th sticky>Metric</Th>
                    {analyses.map(({ property, confidence }) => (
                      <Th key={property.id} align="right">
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() => setActiveProperty(property.id)}
                          title="Open this property"
                        >
                          {property.name}
                        </button>
                        <div className="mt-1 font-normal normal-case">
                          <ConfidenceBadge assessment={confidence} showReason={false} />
                        </div>
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <Td sticky>{row.label}</Td>
                      {analyses.map((a) => (
                        <Td
                          key={a.property.id}
                          align="right"
                          muted={row.muted}
                          className={row.strong ? 'font-semibold' : ''}
                        >
                          {row.render(a) || UNAVAILABLE}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              Each property is analysed on its own holding period and assumptions. For a
              like-for-like read, set the same holding period and discount rate on each. The
              downside rows apply one shared stress — a 15% value fall, 10% lower rent, 50% more
              voids, +200bps — to every property.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
