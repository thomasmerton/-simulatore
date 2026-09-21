/**
 * Market analyser and comparison.
 *
 * The variables are shown individually and never collapsed into a composite
 * score. A "Bologna 9/10" number would hide exactly the trade-offs the user
 * came here to examine, and would embed our weighting rather than theirs.
 */

import { useMemo, useState } from 'react';
import type { Market, MarketMetricKey } from '@/domain/types';
import {
  METRIC_LABELS,
  RATIO_METRICS,
  deriveGrossYield,
  manualMetric,
  marketContainsExampleData,
} from '@/data/source';
import { exampleMarkets } from '@/data/exampleMarkets';
import { newId } from '@/store/repository';
import { useApp } from '@/store/AppStore';
import { Button, Card, EmptyState, Notice, Table, Td, Th } from '../components/primitives';
import { ProvenanceBadge } from '../components/primitives';
import { formatInteger, formatNumber, formatPercent, UNAVAILABLE } from '../format';

/** Display order. Fixed, so two markets are always read the same way. */
const METRIC_ORDER: MarketMetricKey[] = [
  'avgPricePerSqm',
  'avgRentPerSqmMonth',
  'grossRentalYield',
  'vacancyRate',
  'priceGrowth5y',
  'rentGrowth5y',
  'population',
  'populationGrowth5y',
  'universityStudents',
  'touristArrivalsPerYear',
  'rentalDemandIndex',
  'avgDaysOnMarket',
  'transactionsPerYear',
  'buyTransactionCostRate',
  'sellTransactionCostRate',
  'rentalIncomeTaxRate',
];

function renderMetric(market: Market, key: MarketMetricKey): { text: string; metric: ReturnType<typeof deriveGrossYield> } {
  // Gross yield is derived when the source does not publish it directly.
  const metric =
    key === 'grossRentalYield' && !market.metrics.grossRentalYield?.value
      ? deriveGrossYield(market)
      : (market.metrics[key] ?? null);

  if (!metric || metric.value === null) return { text: UNAVAILABLE, metric: null };

  if (RATIO_METRICS.includes(key)) return { text: formatPercent(metric.value, 2), metric };
  if (key === 'avgRentPerSqmMonth') return { text: formatNumber(metric.value, 1), metric };
  if (key === 'avgPricePerSqm') return { text: formatInteger(metric.value), metric };
  return { text: formatInteger(metric.value), metric };
}

export function Markets() {
  const { markets, loadExampleMarkets, upsertMarket, deleteMarket } = useApp();
  const [selected, setSelected] = useState<string[]>([]);

  const hasExamples = useMemo(() => markets.some(marketContainsExampleData), [markets]);

  const compared = useMemo(
    () =>
      selected.length > 0
        ? markets.filter((m) => selected.includes(m.id))
        : markets.slice(0, 5),
    [markets, selected],
  );

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const addMarket = () => {
    const name = window.prompt('Market name (city or zone)');
    if (!name) return;
    upsertMarket({
      id: newId(),
      name,
      country: '',
      district: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metrics: {},
      regulationNotes: null,
      riskNotes: null,
    });
  };

  return (
    <div className="space-y-4">
      <Card
        title="Markets"
        subtitle="Individual variables, shown as they are. No composite score."
        actions={
          <>
            <Button size="sm" onClick={addMarket}>
              Add market
            </Button>
            {!hasExamples && (
              <Button size="sm" variant="ghost" onClick={() => loadExampleMarkets(exampleMarkets())}>
                Load example data
              </Button>
            )}
          </>
        }
      >
        <Notice>
          No real market feed is connected yet. Markets you add are yours to fill in, and every
          figure carries its source, date and confidence. The architecture for importing real data
          is in place — see <code>src/data/source.ts</code>.
        </Notice>

        {hasExamples && (
          <div className="mt-3">
            <Notice tone="warning" title="Illustrative data loaded.">
              The markets marked below contain invented placeholder figures for demonstration only.
              They are not measurements and must not be used to compare real markets.
            </Notice>
          </div>
        )}

        {markets.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No markets yet">
              Add a market to record what you know about it, or load the clearly-labelled example
              dataset to see how comparison works.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {markets.map((market) => {
              const isSelected = selected.includes(market.id);
              const isExample = marketContainsExampleData(market);
              return (
                <button
                  key={market.id}
                  type="button"
                  onClick={() => toggle(market.id)}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    background: isSelected ? 'var(--accent-soft)' : 'transparent',
                    borderColor: isSelected ? 'var(--accent)' : 'var(--border-strong)',
                    color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {market.name}
                  {market.country && (
                    <span style={{ color: 'var(--text-subtle)' }}>· {market.country}</span>
                  )}
                  {isExample && (
                    <span
                      title="Contains illustrative placeholder data"
                      className="rounded px-1 text-[9px] font-bold uppercase"
                      style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                    >
                      example
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {compared.length > 0 && (
        <Card
          title="Market comparison"
          subtitle={`Comparing ${compared.length} market${compared.length === 1 ? '' : 's'} on identical metrics.`}
        >
          <Table>
            <thead>
              <tr>
                <Th sticky>Metric</Th>
                {compared.map((market) => (
                  <Th key={market.id} align="right">
                    {market.name}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ORDER.map((key) => (
                <tr key={key}>
                  <Td sticky>{METRIC_LABELS[key]}</Td>
                  {compared.map((market) => {
                    const { text, metric } = renderMetric(market, key);
                    return (
                      <Td key={market.id} align="right" muted={text === UNAVAILABLE}>
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {text}
                          {metric && <ProvenanceBadge provenance={metric.provenance} compact />}
                        </span>
                      </Td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <Td sticky>Regulation notes</Td>
                {compared.map((market) => (
                  <Td key={market.id} align="right" muted className="max-w-xs text-xs">
                    {market.regulationNotes || UNAVAILABLE}
                  </Td>
                ))}
              </tr>
              <tr>
                <Td sticky>Market-specific risk</Td>
                {compared.map((market) => (
                  <Td key={market.id} align="right" muted className="max-w-xs text-xs">
                    {market.riskNotes || UNAVAILABLE}
                  </Td>
                ))}
              </tr>
            </tbody>
          </Table>

          <div className="mt-4 space-y-2">
            <Notice>
              Gross rental yield is derived from average price and average rent where a source does
              not publish it. A ratio of two averages is not the average of the ratio, so it is
              marked <strong>estimated</strong> rather than verified.
            </Notice>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Markets appear in the order you added them. Nothing here is ranked or weighted: a low
              price per m² and a long time on market describe the same illiquidity from two
              directions, and how you trade those off is not something this tool decides.
            </p>
          </div>
        </Card>
      )}

      {compared.length === 1 && compared[0] && (
        <MarketEditor market={compared[0]} onSave={upsertMarket} onDelete={deleteMarket} />
      )}
    </div>
  );
}

function MarketEditor({
  market,
  onSave,
  onDelete,
}: {
  market: Market;
  onSave: (m: Market) => void;
  onDelete: (id: string) => void;
}) {
  const update = (key: MarketMetricKey, raw: string) => {
    const parsed = raw.trim() === '' ? null : Number(raw);
    const value =
      parsed === null || !Number.isFinite(parsed)
        ? null
        : RATIO_METRICS.includes(key)
          ? parsed / 100
          : parsed;
    onSave({
      ...market,
      updatedAt: new Date().toISOString(),
      metrics: { ...market.metrics, [key]: manualMetric(value, key) },
    });
  };

  const inputValue = (key: MarketMetricKey): string => {
    const metric = market.metrics[key];
    if (!metric || metric.value === null) return '';
    return String(
      RATIO_METRICS.includes(key) ? Math.round(metric.value * 1_000_000) / 10_000 : metric.value,
    );
  };

  return (
    <Card
      title={`Edit ${market.name}`}
      subtitle="Anything you enter here is recorded as your own input, with today's date."
      actions={
        <Button size="sm" variant="danger" onClick={() => onDelete(market.id)}>
          Delete market
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_ORDER.map((key) => (
          <label key={key} className="block">
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              {METRIC_LABELS[key]}
              {RATIO_METRICS.includes(key) && ' (%)'}
            </span>
            <input
              type="number"
              className="tabular w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
              style={{ borderColor: 'var(--border-strong)' }}
              placeholder="Not provided"
              value={inputValue(key)}
              onChange={(e) => update(key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Regulation notes
          </span>
          <textarea
            rows={3}
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-strong)' }}
            value={market.regulationNotes ?? ''}
            onChange={(e) => onSave({ ...market, regulationNotes: e.target.value || null })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Market-specific risk
          </span>
          <textarea
            rows={3}
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-strong)' }}
            value={market.riskNotes ?? ''}
            onChange={(e) => onSave({ ...market, riskNotes: e.target.value || null })}
          />
        </label>
      </div>
    </Card>
  );
}
