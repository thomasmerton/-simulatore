/**
 * Capital Allocation Simulator.
 *
 * "I have €X. Here are three ways I could deploy it — what are the
 * consequences of each?"
 *
 * Strategies are laid side by side on identical measures. There is no ranking,
 * no score and no recommended strategy: the trade-off between income,
 * liquidity, leverage and concentration is the investor's to make, and depends
 * on things this tool cannot see — their horizon, their other assets, their
 * tolerance for an illiquid position, their tax position.
 */

import { useMemo } from 'react';
import type { AllocationStrategy, AssetClass, PortfolioAsset } from '@/domain/types';
import { ALLOCATION_MEASURES, compareAllocations } from '@/calculations/allocation';
import { ASSET_CLASS_LABELS } from '@/calculations/portfolio';
import { newId } from '@/store/repository';
import { useApp } from '@/store/AppStore';
import { Button, Card, EmptyState, Notice, Table, Td, Th } from '../components/primitives';
import { AllocationBar } from '../charts/charts';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatPercent,
  parseNumber,
  parsePercent,
  percentToInput,
  UNAVAILABLE,
} from '../format';

const ASSET_CLASSES: AssetClass[] = ['REAL_ESTATE', 'EQUITIES', 'BONDS', 'CASH', 'OTHER'];

function render(value: number | null, format: string, currency: string): string {
  if (value === null) return UNAVAILABLE;
  switch (format) {
    case 'currency':
      return formatCurrencyCompact(value, currency);
    case 'percent':
      return formatPercent(value);
    case 'multiple':
      return `${formatNumber(value, 2)}x`;
    default:
      return formatNumber(value, 2);
  }
}

export function Allocation() {
  const {
    allocationStrategies,
    addAllocationStrategy,
    updateAllocationStrategy,
    deleteAllocationStrategy,
    portfolio,
    setAvailableCapital,
    properties,
  } = useApp();

  const currency = 'EUR';
  const comparisons = useMemo(
    () => compareAllocations(allocationStrategies, portfolio.availableCapital),
    [allocationStrategies, portfolio.availableCapital],
  );

  const addAsset = (strategy: AllocationStrategy, patch: Partial<PortfolioAsset> = {}) =>
    updateAllocationStrategy({
      ...strategy,
      assets: [
        ...strategy.assets,
        {
          id: newId(),
          label: 'New allocation',
          assetClass: 'CASH',
          amount: 0,
          debt: 0,
          incomeYield: null,
          growthRate: null,
          liquid: true,
          location: null,
          strategy: null,
          propertyId: null,
          downsideShock: null,
          ...patch,
        },
      ],
    });

  const patchAsset = (strategy: AllocationStrategy, asset: PortfolioAsset) =>
    updateAllocationStrategy({
      ...strategy,
      assets: strategy.assets.map((a) => (a.id === asset.id ? asset : a)),
    });

  const removeAsset = (strategy: AllocationStrategy, id: string) =>
    updateAllocationStrategy({ ...strategy, assets: strategy.assets.filter((a) => a.id !== id) });

  const cellInput = 'tabular w-full rounded border bg-transparent px-1.5 py-1 text-right text-sm';

  return (
    <div className="space-y-4">
      <Card
        title="Capital allocation"
        subtitle="Build several ways of deploying the same capital and see the consequences side by side."
        actions={
          <Button size="sm" variant="primary" onClick={() => addAllocationStrategy()}>
            Add strategy
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <span
              className="block text-[11px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-subtle)' }}
            >
              Available capital
            </span>
            <input
              type="number"
              className="tabular mt-1 w-full rounded-lg border bg-[var(--surface)] px-2.5 py-1.5 text-2xl font-semibold"
              style={{ borderColor: 'var(--border-strong)' }}
              value={portfolio.availableCapital || ''}
              placeholder="0"
              onChange={(e) => setAvailableCapital(parseNumber(e.target.value) ?? 0)}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Shared across every strategy, so the comparison is like for like.
            </p>
          </div>
        </div>
      </Card>

      {allocationStrategies.length === 0 ? (
        <Card>
          <EmptyState title="No strategies yet">
            Add two or three ways you might deploy your capital — heavier in property, heavier in
            liquid assets, more or less leverage — and compare what each one does to income,
            liquidity, leverage, concentration and the downside.
          </EmptyState>
        </Card>
      ) : (
        <Card
          title="Comparison"
          subtitle="Identical measures, in a fixed order. No ranking and no recommended strategy."
        >
          <Table>
            <thead>
              <tr>
                <Th sticky>Measure</Th>
                {comparisons.map((c) => (
                  <Th key={c.strategy.id} align="right">
                    {c.strategy.name}
                    {c.overCommitted && (
                      <div
                        className="mt-0.5 text-[10px] font-normal normal-case"
                        style={{ color: 'var(--warning)' }}
                      >
                        does not fund
                      </div>
                    )}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALLOCATION_MEASURES.map((measure) => (
                <tr key={measure.key}>
                  <Td sticky>
                    <span title={measure.note}>{measure.label}</span>
                  </Td>
                  {comparisons.map((c) => {
                    const value = measure.extract(c);
                    const negative =
                      (measure.key === 'unallocated' || measure.key === 'downsideChange') &&
                      (value ?? 0) < 0;
                    return (
                      <Td
                        key={c.strategy.id}
                        align="right"
                        style={negative ? { color: 'var(--negative)' } : undefined}
                      >
                        {render(value, measure.format, currency)}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="mt-4 space-y-2">
            <Notice>
              Expected income is left blank for a strategy unless every asset in it carries an
              income assumption — a partial total would understate it while looking complete.
            </Notice>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Concentration is reported as a Herfindahl-Hirschman index: 1.00 is everything in one
              asset, 1/n is perfectly even across n. It is a measurement of how spread the capital
              is, not a judgement about whether that spread is right for you.
            </p>
          </div>
        </Card>
      )}

      {allocationStrategies.map((strategy) => {
        const comparison = comparisons.find((c) => c.strategy.id === strategy.id);
        return (
          <Card
            key={strategy.id}
            title={
              <input
                className="rounded border bg-transparent px-1.5 py-0.5 text-sm font-semibold"
                style={{ borderColor: 'var(--border)' }}
                value={strategy.name}
                onChange={(e) => updateAllocationStrategy({ ...strategy, name: e.target.value })}
              />
            }
            subtitle={`${formatCurrency(comparison?.result.totalInvested ?? 0, currency)} deployed of ${formatCurrency(portfolio.availableCapital, currency)}`}
            actions={
              <>
                <Button size="sm" onClick={() => addAsset(strategy)}>
                  Add allocation
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteAllocationStrategy(strategy.id)}
                >
                  Delete
                </Button>
              </>
            }
          >
            {comparison && comparison.result.allocationByClass.length > 0 && (
              <div className="mb-4">
                <AllocationBar slices={comparison.result.allocationByClass} />
              </div>
            )}

            {strategy.assets.length === 0 ? (
              <EmptyState title="Nothing allocated in this strategy" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th sticky>Label</Th>
                    <Th>Class</Th>
                    <Th align="right">Equity</Th>
                    <Th align="right">Debt</Th>
                    <Th align="right">Income yield</Th>
                    <Th align="right">Growth</Th>
                    <Th align="right">Downside</Th>
                    <Th>Country</Th>
                    <Th align="center">Liquid</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {strategy.assets.map((asset) => {
                    const patch = (changes: Partial<PortfolioAsset>) =>
                      patchAsset(strategy, { ...asset, ...changes });
                    return (
                      <tr key={asset.id}>
                        <Td sticky>
                          <input
                            className="w-full rounded border bg-transparent px-1.5 py-1 text-sm"
                            style={{ borderColor: 'var(--border)' }}
                            value={asset.label}
                            onChange={(e) => patch({ label: e.target.value })}
                          />
                        </Td>
                        <Td>
                          <select
                            className="rounded border bg-transparent px-1.5 py-1 text-sm"
                            style={{ borderColor: 'var(--border)' }}
                            value={asset.assetClass}
                            onChange={(e) => {
                              const assetClass = e.target.value as AssetClass;
                              patch({
                                assetClass,
                                liquid: assetClass === 'REAL_ESTATE' ? false : asset.liquid,
                              });
                            }}
                          >
                            {ASSET_CLASSES.map((c) => (
                              <option key={c} value={c}>
                                {ASSET_CLASS_LABELS[c]}
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td align="right">
                          <input
                            type="number"
                            className={cellInput}
                            style={{ borderColor: 'var(--border)' }}
                            value={asset.amount || ''}
                            placeholder="0"
                            onChange={(e) => patch({ amount: parseNumber(e.target.value) ?? 0 })}
                          />
                        </Td>
                        <Td align="right">
                          <input
                            type="number"
                            className={cellInput}
                            style={{ borderColor: 'var(--border)' }}
                            value={asset.debt || ''}
                            placeholder="0"
                            onChange={(e) => patch({ debt: parseNumber(e.target.value) ?? 0 })}
                          />
                        </Td>
                        <Td align="right">
                          <input
                            type="number"
                            className={cellInput}
                            style={{ borderColor: 'var(--border)' }}
                            value={percentToInput(asset.incomeYield)}
                            placeholder="—"
                            onChange={(e) => patch({ incomeYield: parsePercent(e.target.value) })}
                          />
                        </Td>
                        <Td align="right">
                          <input
                            type="number"
                            className={cellInput}
                            style={{ borderColor: 'var(--border)' }}
                            value={percentToInput(asset.growthRate)}
                            placeholder="—"
                            onChange={(e) => patch({ growthRate: parsePercent(e.target.value) })}
                          />
                        </Td>
                        <Td align="right">
                          <input
                            type="number"
                            className={cellInput}
                            style={{ borderColor: 'var(--border)' }}
                            value={percentToInput(asset.downsideShock)}
                            placeholder="—"
                            onChange={(e) => patch({ downsideShock: parsePercent(e.target.value) })}
                          />
                        </Td>
                        <Td>
                          <input
                            className="w-20 rounded border bg-transparent px-1.5 py-1 text-sm"
                            style={{ borderColor: 'var(--border)' }}
                            value={asset.location?.country ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              patch({
                                location: {
                                  country: e.target.value,
                                  region: null,
                                  city: asset.location?.city ?? null,
                                  neighborhood: null,
                                  level: 'CITY',
                                },
                              })
                            }
                          />
                        </Td>
                        <Td align="center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--accent)]"
                            checked={asset.liquid}
                            onChange={(e) => patch({ liquid: e.target.checked })}
                          />
                        </Td>
                        <Td align="right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeAsset(strategy, asset.id)}
                            title="Remove"
                          >
                            ✕
                          </Button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}

            {properties.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Add from your analysed properties:
                </span>
                {properties.map((property) => (
                  <Button
                    key={property.id}
                    size="sm"
                    onClick={() => {
                      const price = property.inputs.facts.purchasePrice ?? 0;
                      const ltv = property.inputs.financing.enabled
                        ? (property.inputs.financing.ltv ?? 0)
                        : 0;
                      addAsset(strategy, {
                        label: property.name,
                        assetClass: 'REAL_ESTATE',
                        amount: Math.round(price * (1 - ltv) * 100) / 100,
                        debt: Math.round(price * ltv * 100) / 100,
                        liquid: false,
                        location: property.inputs.facts.location,
                        strategy: property.inputs.rental.strategy,
                        propertyId: property.id,
                      });
                    }}
                  >
                    + {property.name}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
