/**
 * Portfolio builder.
 *
 * Shows composition, liquidity, leverage, concentration and a downside — each
 * on its own terms. There is deliberately no portfolio score: collapsing those
 * dimensions into one number would impose a weighting the investor never chose.
 */

import { useMemo } from 'react';
import type { AssetClass, PortfolioAsset } from '@/domain/types';
import { ASSET_CLASS_LABELS, analyzePortfolio } from '@/calculations/portfolio';
import { useApp } from '@/store/AppStore';
import { Button, Card, EmptyState, Notice, Stat, Table, Td, Th } from '../components/primitives';
import { AllocationBar } from '../charts/charts';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatPercent,
  parseNumber,
  parsePercent,
  percentToInput,
} from '../format';

const ASSET_CLASSES: AssetClass[] = ['REAL_ESTATE', 'EQUITIES', 'BONDS', 'CASH', 'OTHER'];

export function PortfolioBuilder() {
  const {
    portfolio,
    properties,
    setAvailableCapital,
    addPortfolioAsset,
    updatePortfolioAsset,
    removePortfolioAsset,
  } = useApp();

  const result = useMemo(() => analyzePortfolio(portfolio), [portfolio]);
  const currency = 'EUR';
  const overAllocated = result.unallocatedCapital < 0;

  const cellInput =
    'tabular w-full rounded border bg-transparent px-1.5 py-1 text-right text-sm';

  return (
    <div className="space-y-4">
      <Card
        title="Capital"
        subtitle="Start from what you have, then allocate it."
        actions={
          <Button size="sm" onClick={() => addPortfolioAsset()}>
            Add allocation
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
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
          </div>
          <Stat
            label="Allocated"
            value={formatCurrency(result.totalInvested, currency)}
            note={formatPercent(
              portfolio.availableCapital > 0
                ? result.totalInvested / portfolio.availableCapital
                : null,
            )}
          />
          <Stat
            label={overAllocated ? 'Over-allocated by' : 'Unallocated'}
            value={formatCurrency(Math.abs(result.unallocatedCapital), currency)}
            tone={overAllocated ? 'negative' : 'neutral'}
          />
          <Stat
            label="Gross asset value"
            value={formatCurrency(result.grossAssetValue, currency)}
            note={`Equity ${formatCurrencyCompact(result.totalInvested, currency)} + debt ${formatCurrencyCompact(result.totalDebt, currency)}`}
          />
        </div>

        {overAllocated && (
          <div className="mt-4">
            <Notice tone="warning" title="Allocations exceed available capital.">
              You have committed {formatCurrency(result.totalInvested, currency)} against{' '}
              {formatCurrency(portfolio.availableCapital, currency)} of capital. The figures below
              still compute, but the plan does not fund.
            </Notice>
          </div>
        )}
      </Card>

      {portfolio.assets.length === 0 ? (
        <Card title="Allocations">
          <EmptyState title="Nothing allocated yet">
            Add allocations to see asset mix, liquidity, leverage, expected income and how the
            portfolio behaves in a downside. Real estate holdings can carry their own debt.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Asset allocation" subtitle="Share of invested equity by class.">
              <AllocationBar slices={result.allocationByClass} />
            </Card>
            <Card title="Geographic exposure" subtitle="Share of invested equity by location tag.">
              {result.allocationByGeography.length > 0 ? (
                <AllocationBar slices={result.allocationByGeography} />
              ) : (
                <EmptyState title="No geography tags set" />
              )}
            </Card>
          </div>

          <Card title="Position" subtitle="Each dimension on its own terms — no composite score.">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
              <Stat
                label="Liquid capital"
                value={formatCurrency(result.liquidCapital, currency)}
                note={`${formatPercent(result.liquidityRatio)} of invested equity`}
              />
              <Stat
                label="Capital tied up"
                value={formatCurrency(result.illiquidCapital, currency)}
                note="Cannot be converted to cash quickly without a haircut."
              />
              <Stat
                label="Leverage"
                value={
                  result.leverageRatio === null ? '—' : `${formatNumber(result.leverageRatio)}x`
                }
                note="Gross asset value divided by equity. 1.0x is unlevered."
              />
              <Stat
                label="Portfolio LTV"
                value={formatPercent(result.loanToValue)}
                note="Debt over gross asset value."
              />
              <Stat
                label="Largest holding"
                value={formatPercent(result.largestHoldingShare)}
                note={result.largestHoldingLabel ?? undefined}
              />
              <Stat
                label="Concentration (HHI)"
                value={
                  result.concentrationHHI === null ? '—' : formatNumber(result.concentrationHHI, 2)
                }
                note={`1.00 is everything in one asset; ${formatNumber(1 / Math.max(1, portfolio.assets.length), 2)} would be perfectly even across ${portfolio.assets.length}.`}
              />
              <Stat
                label="Expected annual income"
                value={formatCurrency(result.expectedAnnualIncome, currency)}
                note="Only computed when every asset has an income assumption."
              />
              <Stat
                label="Expected net cash flow"
                value={formatCurrency(result.expectedNetCashFlow, currency)}
                tone={(result.expectedNetCashFlow ?? 0) < 0 ? 'negative' : 'neutral'}
                note="Income less interest on portfolio debt."
              />
            </div>
          </Card>

          <Card
            title="Downside"
            subtitle="Apply a value shock per asset. Leverage amplifies it — that is the point of showing it."
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              <Stat
                label="Asset value after shock"
                value={formatCurrency(result.downside.shockedAssetValue, currency)}
              />
              <Stat
                label="Debt (unchanged)"
                value={formatCurrency(result.totalDebt, currency)}
                note="Debt does not fall with asset values."
              />
              <Stat
                label="Equity after shock"
                value={formatCurrency(result.downside.shockedEquity, currency)}
                tone={result.downside.shockedEquity < 0 ? 'negative' : 'neutral'}
              />
              <Stat
                label="Change in equity"
                value={formatPercent(result.downside.equityChange)}
                tone={(result.downside.equityChange ?? 0) < 0 ? 'negative' : 'neutral'}
              />
            </div>

            {result.downside.negativeEquity && (
              <div className="mt-4">
                <Notice tone="warning" title="Negative equity in at least one holding.">
                  Under these shocks, the debt secured on one or more assets exceeds their value.
                </Notice>
              </div>
            )}
          </Card>
        </>
      )}

      <Card title="Allocations" subtitle="Equity is what you put in; debt is what is borrowed against it.">
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
              <Th>Geography</Th>
              <Th align="center">Liquid</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {portfolio.assets.map((asset) => {
              const patch = (changes: Partial<PortfolioAsset>) =>
                updatePortfolioAsset({ ...asset, ...changes });
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
                        // Real estate defaults to illiquid; cash to liquid.
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
                      className="w-24 rounded border bg-transparent px-1.5 py-1 text-sm"
                      style={{ borderColor: 'var(--border)' }}
                      value={asset.geography}
                      placeholder="—"
                      onChange={(e) => patch({ geography: e.target.value })}
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
                      onClick={() => removePortfolioAsset(asset.id)}
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

        {properties.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Add from your analysed properties:
            </span>
            {properties.map((property) => (
              <Button
                key={property.id}
                size="sm"
                variant="secondary"
                onClick={() => {
                  const price = property.inputs.facts.purchasePrice ?? 0;
                  const ltv = property.inputs.financing.enabled
                    ? (property.inputs.financing.ltv ?? 0)
                    : 0;
                  addPortfolioAsset({
                    label: property.name,
                    assetClass: 'REAL_ESTATE',
                    amount: price * (1 - ltv),
                    debt: price * ltv,
                    liquid: false,
                    geography: property.inputs.facts.city,
                    propertyId: property.id,
                  });
                }}
              >
                + {property.name}
              </Button>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Income yield, growth and the downside shock are your assumptions for each asset. Expected
          income is left blank unless every asset has one — a partial total would be misleading.
        </p>
      </Card>
    </div>
  );
}
