/**
 * Property comparison.
 *
 * Side by side on identical metrics, in a stable order, with no ranking, no
 * scoring and no highlighting of a "winner". Where two properties differ on a
 * metric the user can see it; what that difference is worth to them is theirs
 * to decide.
 */

import { useMemo } from 'react';
import { runProjection } from '@/calculations/projection';
import { useApp } from '@/store/AppStore';
import { Card, EmptyState, Notice, Table, Td, Th } from '../components/primitives';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMultiple,
  formatPercent,
  formatYears,
} from '../format';

export function Compare() {
  const { properties, setActiveProperty } = useApp();

  const analyses = useMemo(
    () => properties.map((property) => ({ property, result: runProjection(property.inputs) })),
    [properties],
  );

  if (properties.length < 2) {
    return (
      <Card title="Compare properties">
        <EmptyState title="Add a second property to compare">
          Comparison needs at least two properties. Use “New property” in the sidebar, then enter
          its details on the Property tab.
        </EmptyState>
      </Card>
    );
  }

  const currency = properties[0]?.inputs.settings.currency ?? 'EUR';

  /** Rows are fixed and identical for every property: that is what makes it a comparison. */
  const rows: { label: string; render: (a: (typeof analyses)[number]) => string; muted?: boolean }[] =
    [
      { label: 'City', render: (a) => a.property.inputs.facts.city || '—', muted: true },
      { label: 'District', render: (a) => a.property.inputs.facts.district || '—', muted: true },
      {
        label: 'Purchase price',
        render: (a) => formatCurrency(a.result.acquisition.purchasePrice, currency),
      },
      {
        label: 'Surface',
        render: (a) =>
          a.property.inputs.facts.sqm === null ? 'Data unavailable' : `${a.property.inputs.facts.sqm} m²`,
        muted: true,
      },
      {
        label: 'Price per m²',
        render: (a) => formatCurrency(a.result.acquisition.pricePerSqm, currency),
      },
      {
        label: 'Total acquisition cost',
        render: (a) => formatCurrency(a.result.acquisition.totalAcquisitionCost, currency),
      },
      {
        label: 'Equity invested',
        render: (a) => formatCurrency(a.result.equityInvested, currency),
      },
      {
        label: 'Monthly rent',
        render: (a) => formatCurrency(a.property.inputs.rental.monthlyRent, currency),
      },
      {
        label: 'Gross yield (on price)',
        render: (a) => formatPercent(a.result.year1.grossYieldOnPrice),
      },
      {
        label: 'NOI (year 1)',
        render: (a) => formatCurrency(a.result.year1.noi, currency),
      },
      {
        label: 'Net yield (on total cost)',
        render: (a) => formatPercent(a.result.year1.netYieldOnTotalCost),
      },
      {
        label: 'Cash flow (year 1)',
        render: (a) => formatCurrency(a.result.year1.afterTaxCashFlow, currency),
      },
      {
        label: 'Cash-on-cash (year 1)',
        render: (a) => formatPercent(a.result.year1.cashOnCash),
      },
      {
        label: 'DSCR (year 1)',
        render: (a) => (a.result.year1.dscr === null ? '—' : a.result.year1.dscr.toFixed(2)),
      },
      {
        label: 'Break-even occupancy',
        render: (a) => formatPercent(a.result.year1.breakEvenOccupancyAfterDebt),
      },
      {
        label: 'Holding period',
        render: (a) => `${a.property.inputs.exit.holdingPeriodYears}y`,
        muted: true,
      },
      { label: 'IRR (equity)', render: (a) => formatPercent(a.result.leveredIRR.value) },
      { label: 'IRR (unlevered)', render: (a) => formatPercent(a.result.unleveredIRR.value) },
      { label: 'NPV', render: (a) => formatCurrencyCompact(a.result.npv, currency) },
      { label: 'Equity multiple', render: (a) => formatMultiple(a.result.equityMultiple) },
      {
        label: 'Payback',
        render: (a) =>
          a.result.payback.beyondHorizon ? 'Beyond horizon' : formatYears(a.result.payback.years),
      },
      {
        label: 'Total profit',
        render: (a) => formatCurrencyCompact(a.result.totalProfit, currency),
      },
    ];

  return (
    <div className="space-y-4">
      <Card
        title="Property comparison"
        subtitle="The same metrics, computed the same way, for every property."
      >
        <Notice>
          Properties are listed in the order you created them. There is no ranking and no overall
          score: which differences matter depends on what you are trying to achieve, and only you
          know that.
        </Notice>

        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th sticky>Metric</Th>
                {analyses.map(({ property }) => (
                  <Th key={property.id} align="right">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => setActiveProperty(property.id)}
                      title="Open this property"
                    >
                      {property.name}
                    </button>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <Td sticky>{row.label}</Td>
                  {analyses.map((analysis) => (
                    <Td key={analysis.property.id} align="right" muted={row.muted}>
                      {row.render(analysis)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Each property is analysed on its own holding period and assumptions. If you want a
          like-for-like read, set the same holding period and discount rate on both.
        </p>
      </Card>
    </div>
  );
}
