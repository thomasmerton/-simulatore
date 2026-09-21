/**
 * The market metric catalogue: what each metric means, the one unit it is
 * stored in, and how it is displayed.
 *
 * The canonical unit is the single place a metric's meaning is pinned down.
 * Everything entering the market layer is converted to it or rejected, so two
 * markets are never compared on figures that mean different things.
 */

import type { MarketMetricKey } from '@/domain/types';
import type { Unit } from '@/domain/units';
import { UNITS } from '@/domain/units';

export interface MetricSpec {
  unit: Unit;
  /** Money metrics are meaningless without a currency. */
  requiresCurrency: boolean;
  /** How the UI renders it. */
  display: 'currency' | 'currencyPerSqm' | 'rentPerSqm' | 'percent' | 'integer' | 'days' | 'index';
  /** What the metric is, in one sentence, for the data-detail panel. */
  definition: string;
}

export const METRIC_SPECS: Record<MarketMetricKey, MetricSpec> = {
  avgPricePerSqm: {
    unit: UNITS.pricePerSqmTransaction,
    requiresCurrency: true,
    display: 'currencyPerSqm',
    definition:
      'Average transacted price per square metre of internal area. Transaction prices, not asking prices — the two differ by a market-dependent margin and are stored separately.',
  },
  avgRentPerSqmMonth: {
    unit: UNITS.rentPerSqmMonth,
    requiresCurrency: true,
    display: 'rentPerSqm',
    definition:
      'Average contracted rent per square metre per MONTH. A source publishing annual rent is converted on import; a source with no stated period is rejected.',
  },
  grossRentalYield: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition:
      'Annual gross rent divided by price. Where a source does not publish it, this tool derives it from average rent and average price and marks it DERIVED_DATA — a ratio of two averages is not the average of the ratio.',
  },
  vacancyRate: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition:
      'Share of the rentable stock unlet. A market-level rate — not the same thing as the void days assumed for one property.',
  },
  priceGrowth5y: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition: 'Annualised growth in prices over the last five years. Historic, nominal, and not a forecast.',
  },
  rentGrowth5y: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition: 'Annualised growth in rents over the last five years. Historic, nominal, and not a forecast.',
  },
  population: {
    unit: UNITS.count,
    requiresCurrency: false,
    display: 'integer',
    definition: 'Resident population of the geography this figure is scoped to.',
  },
  populationGrowth5y: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition: 'Change in resident population over five years.',
  },
  universityStudents: {
    unit: UNITS.count,
    requiresCurrency: false,
    display: 'integer',
    definition: 'Enrolled university students. A demand indicator for student lettings, not a yield.',
  },
  touristArrivalsPerYear: {
    unit: UNITS.count,
    requiresCurrency: false,
    display: 'integer',
    definition: 'Recorded tourist arrivals per year. A demand indicator for short lets, not an occupancy rate.',
  },
  rentalDemandIndex: {
    unit: UNITS.index,
    requiresCurrency: false,
    display: 'index',
    definition:
      'A publisher-defined demand index. Comparable only against itself, from the same publisher, on the same scale — never across sources.',
  },
  avgDaysOnMarket: {
    unit: UNITS.days,
    requiresCurrency: false,
    display: 'days',
    definition: 'Average days between listing and sale. A liquidity indicator: how long an exit is likely to take.',
  },
  transactionsPerYear: {
    unit: UNITS.count,
    requiresCurrency: false,
    display: 'integer',
    definition: 'Recorded residential transactions per year. Market depth.',
  },
  buyTransactionCostRate: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition: 'Typical round-trip cost of buying, as a share of price: transfer taxes, notary, agency.',
  },
  sellTransactionCostRate: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition: 'Typical cost of selling, as a share of price.',
  },
  rentalIncomeTaxRate: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition:
      'Headline tax rate on rental income for a typical private investor. Indicative only: the rate that applies to a given investor depends on their circumstances.',
  },
  mortgageRateNominal: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition:
      'Nominal rate on new mortgage lending to households (ECB: annualised agreed rate). Fees are EXCLUDED — this is the figure the model wants for the interest rate, because it carries financing fees separately.',
  },
  priceGrowthLatestYoY: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition:
      'Change in house prices over the latest published period versus the same period a year earlier. A single reading, NOT a multi-year average — one quarter stored as a 5-year annualised rate would misstate the trend badly, so the two are kept apart.',
  },
  mortgageRateAprc: {
    unit: UNITS.ratio,
    requiresCurrency: false,
    display: 'percent',
    definition:
      'APR / TAEG on new mortgage lending (ECB: annual percentage rate of charge). INCLUDES ancillary costs, so using it as the interest rate double-counts the fees the model already models. Shown for reference, never applied as the rate.',
  },
};

export const CANONICAL_UNITS = METRIC_SPECS;

export const METRIC_LABELS: Record<MarketMetricKey, string> = {
  avgPricePerSqm: 'Average price per m²',
  avgRentPerSqmMonth: 'Average rent per m²/month',
  grossRentalYield: 'Gross rental yield',
  vacancyRate: 'Vacancy rate',
  priceGrowth5y: 'Price growth (5y, annualised)',
  rentGrowth5y: 'Rent growth (5y, annualised)',
  population: 'Population',
  populationGrowth5y: 'Population growth (5y)',
  universityStudents: 'University students',
  touristArrivalsPerYear: 'Tourist arrivals per year',
  rentalDemandIndex: 'Rental demand index',
  avgDaysOnMarket: 'Average days on market',
  transactionsPerYear: 'Transactions per year',
  buyTransactionCostRate: 'Buying transaction costs',
  sellTransactionCostRate: 'Selling transaction costs',
  rentalIncomeTaxRate: 'Rental income tax rate',
  priceGrowthLatestYoY: 'House price growth (latest year-on-year)',
  mortgageRateNominal: 'Mortgage rate (nominal, excl. fees)',
  mortgageRateAprc: 'Mortgage APR / TAEG (incl. fees)',
};

/** Display order. Fixed, so two markets are always read the same way. */
export const METRIC_ORDER: MarketMetricKey[] = [
  'avgPricePerSqm',
  'avgRentPerSqmMonth',
  'grossRentalYield',
  'vacancyRate',
  'priceGrowth5y',
  'rentGrowth5y',
  'avgDaysOnMarket',
  'transactionsPerYear',
  'population',
  'populationGrowth5y',
  'universityStudents',
  'touristArrivalsPerYear',
  'rentalDemandIndex',
  'buyTransactionCostRate',
  'sellTransactionCostRate',
  'rentalIncomeTaxRate',
  'priceGrowthLatestYoY',
  'mortgageRateNominal',
  'mortgageRateAprc',
];

export function isRatioMetric(key: MarketMetricKey): boolean {
  return METRIC_SPECS[key].display === 'percent';
}
