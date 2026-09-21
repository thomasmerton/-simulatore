/**
 * Market analyser and comparison.
 *
 * Variables are shown individually and never collapsed into a composite score.
 * A "Bologna 9/10" would hide exactly the trade-offs the user came to examine,
 * and would embed our weighting rather than theirs.
 *
 * Every figure on this page can be clicked to reveal its source, period,
 * geography, unit, method and confidence.
 */

import { useMemo, useState } from 'react';
import type { Market, MarketMetricKey } from '@/domain/types';
import type { DataPoint, Period } from '@/domain/datapoint';
import { formatGeography } from '@/domain/datapoint';
import { METRIC_LABELS, METRIC_ORDER, METRIC_SPECS, isRatioMetric } from '@/data/metrics';
import {
  deriveGrossYield,
  exampleMarkets,
  manualPoint,
  marketContainsExampleData,
} from '@/data/exampleMarkets';
import { newId } from '@/store/repository';
import { useApp } from '@/store/AppStore';
import { Button, Card, EmptyState, Notice, Table, Td, Th } from '../components/primitives';
import { DataPointValue } from '../components/DataDetail';
import {
  formatCurrency,
  formatInteger,
  formatNumber,
  formatPercent,
  UNAVAILABLE,
} from '../format';

function renderPoint(point: DataPoint | null, key: MarketMetricKey): string {
  if (!point || point.value === null) return UNAVAILABLE;
  const spec = METRIC_SPECS[key];
  switch (spec.display) {
    case 'percent':
      return formatPercent(point.value, 2);
    case 'currencyPerSqm':
      return `${formatInteger(point.value)} ${point.currency ?? ''}/m²`.trim();
    case 'rentPerSqm':
      return `${formatNumber(point.value, 1)} ${point.currency ?? ''}/m²/mo`.trim();
    case 'currency':
      return formatCurrency(point.value, point.currency ?? 'EUR');
    case 'days':
      return `${formatInteger(point.value)} days`;
    default:
      return formatInteger(point.value);
  }
}

/** Gross yield is derived when a source does not publish it directly. */
function pointFor(market: Market, key: MarketMetricKey): DataPoint | null {
  if (key === 'grossRentalYield' && !market.metrics.grossRentalYield?.value) {
    return deriveGrossYield(market);
  }
  return market.metrics[key] ?? null;
}

export function Markets() {
  const { markets, loadExampleMarkets, upsertMarket, deleteMarket } = useApp();
  const [selected, setSelected] = useState<string[]>([]);

  const hasExamples = useMemo(() => markets.some(marketContainsExampleData), [markets]);

  const compared = useMemo(
    () => (selected.length > 0 ? markets.filter((m) => selected.includes(m.id)) : markets.slice(0, 5)),
    [markets, selected],
  );

  /** Currencies present across the compared markets. */
  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const market of compared) {
      for (const point of Object.values(market.metrics)) {
        if (point?.currency) set.add(point.currency);
      }
    }
    return [...set];
  }, [compared]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addMarket = () => {
    const city = window.prompt('City or zone name');
    if (!city) return;
    const country = window.prompt('Country') ?? '';
    upsertMarket({
      id: newId(),
      name: city,
      geography: { country, region: null, city, neighborhood: null, level: 'CITY' },
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
        subtitle="Individual variables, shown as published. No composite score."
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
          No real market feed is connected. Markets you add are yours to fill in, and every figure
          carries its source, period, geography, unit, method and confidence — click any value to
          see them. The import pipeline (provider → normaliser → validator) is in place in{' '}
          <code>src/data/pipeline.ts</code>.
        </Notice>

        {hasExamples && (
          <div className="mt-3">
            <Notice tone="warning" title="Illustrative data loaded.">
              The markets badged below contain invented placeholder figures for demonstration only.
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
                  {market.geography.country && (
                    <span style={{ color: 'var(--text-subtle)' }}>· {market.geography.country}</span>
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
          {currencies.length > 1 && (
            <div className="mb-3">
              <Notice tone="warning" title="Mixed currencies.">
                These markets report money in {currencies.join(', ')}. No exchange rates are
                applied, so the money rows are NOT directly comparable. Ratios — yields, vacancy,
                growth — are unaffected.
              </Notice>
            </div>
          )}

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
                  <Td sticky>
                    <span title={METRIC_SPECS[key].definition}>{METRIC_LABELS[key]}</span>
                  </Td>
                  {compared.map((market) => {
                    const point = pointFor(market, key);
                    return (
                      <Td key={market.id} align="right">
                        <DataPointValue
                          point={point}
                          label={METRIC_LABELS[key]}
                          formatted={renderPoint(point, key)}
                        />
                      </Td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <Td sticky>Geography</Td>
                {compared.map((market) => (
                  <Td key={market.id} align="right" muted className="text-xs">
                    {formatGeography(market.geography) || UNAVAILABLE}
                  </Td>
                ))}
              </tr>
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
              marked <strong>derived</strong> rather than source data.
            </Notice>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Markets appear in the order you added them. Nothing is ranked or weighted: a low price
              per m² and a long time on market describe the same illiquidity from two directions,
              and how you trade those off is not something this tool decides.
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
  const [period, setPeriod] = useState<Period>({
    from: `${new Date().getFullYear() - 1}-01-01`,
    to: `${new Date().getFullYear() - 1}-12-31`,
    label: String(new Date().getFullYear() - 1),
  });

  const update = (key: MarketMetricKey, raw: string) => {
    const parsed = raw.trim() === '' ? null : Number(raw);
    const value =
      parsed === null || !Number.isFinite(parsed)
        ? null
        : isRatioMetric(key)
          ? parsed / 100
          : parsed;
    onSave({
      ...market,
      updatedAt: new Date().toISOString(),
      metrics: {
        ...market.metrics,
        [key]: manualPoint(key, value, market.geography, period),
      },
    });
  };

  const inputValue = (key: MarketMetricKey): string => {
    const point = market.metrics[key];
    if (!point || point.value === null) return '';
    return String(isRatioMetric(key) ? Math.round(point.value * 1_000_000) / 10_000 : point.value);
  };

  return (
    <Card
      title={`Edit ${market.name}`}
      subtitle="Anything you enter is recorded as your own input, stamped with the reporting period below."
      actions={
        <Button size="sm" variant="danger" onClick={() => onDelete(market.id)}>
          Delete market
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Reporting period label
          </span>
          <input
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-strong)' }}
            value={period.label}
            onChange={(e) => setPeriod({ ...period, label: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Period from
          </span>
          <input
            type="date"
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-strong)' }}
            value={period.from}
            onChange={(e) => setPeriod({ ...period, from: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Period to
          </span>
          <input
            type="date"
            className="w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-sm"
            style={{ borderColor: 'var(--border-strong)' }}
            value={period.to}
            onChange={(e) => setPeriod({ ...period, to: e.target.value })}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_ORDER.map((key) => (
          <label key={key} className="block">
            <span
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
              title={METRIC_SPECS[key].definition}
            >
              {METRIC_LABELS[key]}
              {isRatioMetric(key) && ' (%)'}
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
