/**
 * Assumption disclosure.
 *
 * The rule the whole product hangs on: a result must never look more certain
 * than its inputs. Every headline figure states, underneath it, which
 * assumptions it rests on and how strong they are.
 */

import { PROVENANCE_META, weakestProvenance, type ProvenanceMap } from '@/domain/provenance';
import { ProvenanceBadge } from './primitives';

/** Human labels for the dotted input paths used in dependency lists. */
export const FIELD_LABELS: Record<string, string> = {
  'facts.purchasePrice': 'purchase price',
  'facts.askingPrice': 'asking price',
  'facts.sqm': 'surface area',
  'acquisition.purchaseTaxRate': 'purchase tax',
  'acquisition.notaryFees': 'notary fees',
  'acquisition.agencyCommissionRate': 'agency commission',
  'acquisition.renovationCost': 'renovation cost',
  'acquisition.furnitureCost': 'furniture cost',
  'rental.monthlyRent': 'monthly rent',
  'rental.vacancyDaysPerYear': 'vacancy',
  'rental.rentGrowthRate': 'rent growth',
  'rental.stabilizationMonths': 'stabilisation period',
  'rental.condoFees': 'condominium fees',
  'rental.propertyTax': 'property tax',
  'rental.capexReserve': 'capex reserve',
  'rental.managementFeeRate': 'management fee',
  'rental.expenseGrowthRate': 'cost inflation',
  'financing.ltv': 'loan-to-value',
  'financing.annualRate': 'interest rate',
  'financing.termYears': 'loan term',
  'exit.priceGrowthRate': 'price growth',
  'exit.sellingCostsRate': 'selling costs',
  'exit.holdingPeriodYears': 'holding period',
  'exit.capitalGainsTaxRate': 'capital gains tax',
  'settings.discountRate': 'discount rate',
};

export function labelFor(path: string): string {
  return FIELD_LABELS[path] ?? path.split('.').pop() ?? path;
}

/**
 * The one-line "based on..." caption that sits under a headline metric.
 *
 * It names the weakest inputs first, because those are what would move the
 * number most if they turned out to be wrong.
 */
export function BasedOn({
  paths,
  provenance,
  extra,
}: {
  paths: readonly string[];
  provenance: ProvenanceMap;
  extra?: string;
}) {
  const weakest = weakestProvenance(provenance, paths);
  const drivers = paths.filter((p) => (provenance[p] ?? 'MISSING') === weakest);
  const meta = PROVENANCE_META[weakest];

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      <ProvenanceBadge provenance={weakest} />
      <span>
        {meta.label === 'User input'
          ? 'Based on your own figures for '
          : `Based on ${meta.label.toLowerCase()} values for `}
        {drivers.slice(0, 3).map(labelFor).join(', ')}
        {drivers.length > 3 ? ` and ${drivers.length - 3} more` : ''}
        {extra ? `. ${extra}` : '.'}
      </span>
    </span>
  );
}

/**
 * Summary of how many inputs are of each provenance. Gives the user a single
 * honest read on how much of the analysis is evidence and how much is guess.
 */
export function ProvenanceSummary({
  provenance,
  paths,
}: {
  provenance: ProvenanceMap;
  paths: readonly string[];
}) {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const p = provenance[path] ?? 'MISSING';
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const order = ['VERIFIED', 'USER_INPUT', 'ESTIMATED', 'MODEL_ASSUMPTION', 'MISSING'] as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {order
        .filter((p) => (counts.get(p) ?? 0) > 0)
        .map((p) => (
          <span key={p} className="inline-flex items-center gap-1 text-xs">
            <ProvenanceBadge provenance={p} compact />
            <span style={{ color: 'var(--text-muted)' }}>
              {counts.get(p)} {PROVENANCE_META[p].label.toLowerCase()}
            </span>
          </span>
        ))}
    </div>
  );
}

/** The inputs that drive the headline return metrics, for the summary above. */
export const CORE_INPUT_PATHS = [
  'facts.purchasePrice',
  'facts.sqm',
  'acquisition.purchaseTaxRate',
  'acquisition.notaryFees',
  'acquisition.agencyCommissionRate',
  'rental.monthlyRent',
  'rental.vacancyDaysPerYear',
  'rental.rentGrowthRate',
  'rental.condoFees',
  'rental.expenseGrowthRate',
  'exit.priceGrowthRate',
  'exit.sellingCostsRate',
  'settings.discountRate',
] as const;
