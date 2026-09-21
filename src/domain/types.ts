/**
 * Domain types.
 *
 * Strict separation, mirrored by the database schema in /db/schema.sql:
 *   - RAW DATA        : observed facts about a property or market.
 *   - USER ASSUMPTIONS: forward-looking inputs chosen by the investor.
 *   - CALCULATED      : never stored, always recomputed (see /src/calculations).
 */

import type { Provenance, ProvenanceMap } from './provenance';

export type UUID = string;
export type ISODate = string;

/* ------------------------------------------------------------------ *
 * RAW: property facts
 * ------------------------------------------------------------------ */

export type PropertyCondition =
  | 'NEW'
  | 'RENOVATED'
  | 'GOOD'
  | 'HABITABLE'
  | 'TO_RENOVATE'
  | 'TO_GUT';

export interface PropertyFacts {
  city: string;
  district: string;
  address: string | null;
  /** Asking price as listed, in currency units. */
  askingPrice: number | null;
  /** Price actually assumed for the purchase. Defaults to askingPrice. */
  purchasePrice: number | null;
  /** Internal surface, m². */
  sqm: number | null;
  rooms: number | null;
  bathrooms: number | null;
  /** 0 = ground floor. */
  floor: number | null;
  elevator: boolean | null;
  condition: PropertyCondition | null;
  yearBuilt: number | null;
  furnished: boolean | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: one-off acquisition costs
 * ------------------------------------------------------------------ */

/**
 * Costs incurred at t=0, on top of the purchase price.
 * Percentage fields are expressed as decimals (0.09 = 9%) and applied to the
 * purchase price. Where both a rate and an amount exist, the amount wins when
 * it is non-null — this lets a user override a rule-of-thumb with a real quote.
 */
export interface AcquisitionCosts {
  /** Transfer/registration tax (imposta di registro, IVA...). */
  purchaseTaxRate: number | null;
  purchaseTaxAmount: number | null;
  notaryFees: number | null;
  agencyCommissionRate: number | null;
  agencyCommissionAmount: number | null;
  /** Capitalised works. Assumed paid at t=0. */
  renovationCost: number | null;
  furnitureCost: number | null;
  otherUpfrontCosts: number | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: rental operations
 * ------------------------------------------------------------------ */

export interface RentalAssumptions {
  /** Contractual monthly rent when occupied. */
  monthlyRent: number | null;
  /**
   * Expected empty days per year, in a stabilised year.
   * NOTE: this is days, not a market vacancy rate. occupancy = 1 - days/365.
   */
  vacancyDaysPerYear: number | null;
  /** Nominal annual rent growth, decimal. Compounded yearly. */
  rentGrowthRate: number | null;
  /**
   * Months at the start of year 1 with no rent (works, marketing, fit-out).
   * Ignoring this materially overstates IRR on a renovation case.
   */
  stabilizationMonths: number | null;

  /* Recurring costs, per year, in year-1 money. Grown by `expenseGrowthRate`. */
  condoFees: number | null;
  /** Recurring property tax (IMU and similar). */
  propertyTax: number | null;
  insurance: number | null;
  ordinaryMaintenance: number | null;
  /** Provision for manutenzione straordinaria. Treated as capex, BELOW NOI. */
  capexReserve: number | null;
  /** Property management fee as a share of COLLECTED rent, decimal. */
  managementFeeRate: number | null;
  /** Any other recurring operating cost. */
  otherOperatingCosts: number | null;
  /** Annual growth applied to all recurring costs, decimal. */
  expenseGrowthRate: number | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: financing
 * ------------------------------------------------------------------ */

export type RateType = 'FIXED' | 'VARIABLE';

export interface FinancingAssumptions {
  enabled: boolean;
  /** Loan-to-value against the purchase price, decimal. */
  ltv: number | null;
  /** Explicit loan amount. When set, overrides `ltv`. */
  loanAmount: number | null;
  /** Nominal annual rate, decimal. */
  annualRate: number | null;
  termYears: number | null;
  rateType: RateType;
  /** Arrangement fees, survey, mortgage tax. Paid at t=0 from equity. */
  upfrontCosts: number | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: taxation of rental income
 * ------------------------------------------------------------------ */

export type IncomeTaxMode = 'NONE' | 'FLAT_ON_GROSS' | 'FLAT_ON_NET';

export interface IncomeTaxAssumptions {
  /**
   * NONE          : pre-tax analysis only.
   * FLAT_ON_GROSS : flat rate on collected rent (e.g. Italian cedolare secca).
   * FLAT_ON_NET   : flat rate on taxable profit after deductible costs.
   */
  mode: IncomeTaxMode;
  rate: number | null;
  /**
   * FLAT_ON_NET only: whether interest is deductible. Jurisdiction-specific,
   * so it is an explicit switch rather than a hardcoded rule.
   */
  interestDeductible: boolean;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: holding & exit
 * ------------------------------------------------------------------ */

export const HOLDING_PERIOD_OPTIONS = [1, 3, 5, 10, 15, 20] as const;

export interface ExitAssumptions {
  holdingPeriodYears: number;
  /** Annual property value growth, decimal. May be negative. */
  priceGrowthRate: number | null;
  /** Agency + legal costs on sale, as a share of sale price, decimal. */
  sellingCostsRate: number | null;
  /** Tax on the capital gain, decimal. */
  capitalGainsTaxRate: number | null;
  /**
   * Many jurisdictions exempt the gain after a holding period (Italy: 5 years
   * for non-primary residences). null disables the exemption entirely.
   */
  capitalGainsExemptAfterYears: number | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: discounting
 * ------------------------------------------------------------------ */

export interface AnalysisSettings {
  /** Required annual return used to discount cash flows for NPV. */
  discountRate: number | null;
  currency: string;
}

/* ------------------------------------------------------------------ *
 * Aggregate input to the engine
 * ------------------------------------------------------------------ */

export interface PropertyInputs {
  facts: PropertyFacts;
  acquisition: AcquisitionCosts;
  rental: RentalAssumptions;
  financing: FinancingAssumptions;
  incomeTax: IncomeTaxAssumptions;
  exit: ExitAssumptions;
  settings: AnalysisSettings;
}

/** A saved property: identity + raw facts + assumptions + provenance sidecar. */
export interface Property {
  id: UUID;
  name: string;
  marketId: UUID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  inputs: PropertyInputs;
  provenance: ProvenanceMap;
}

/* ------------------------------------------------------------------ *
 * RAW: market data
 * ------------------------------------------------------------------ */

export interface DataSourceRef {
  /** Name of the publisher, e.g. "OMI - Agenzia delle Entrate". */
  source: string;
  /** When the underlying observation was made, not when it was imported. */
  observedAt: ISODate;
  importedAt: ISODate;
  /** "city", "district", "province", "country". */
  geographicScope: string;
  /** How the number was produced. Free text, required. */
  methodology: string;
  url: string | null;
  /**
   * EXAMPLE marks illustrative, non-real figures shipped for demonstration.
   * They must never be displayed without a visible warning.
   */
  kind: 'IMPORTED' | 'MANUAL' | 'EXAMPLE';
}

/** A single observed market metric with its unit and provenance. */
export interface MarketMetric {
  value: number | null;
  unit: string;
  provenance: Provenance;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  sourceRef: DataSourceRef | null;
}

export type MarketMetricKey =
  | 'avgPricePerSqm'
  | 'avgRentPerSqmMonth'
  | 'grossRentalYield'
  | 'vacancyRate'
  | 'priceGrowth5y'
  | 'rentGrowth5y'
  | 'population'
  | 'populationGrowth5y'
  | 'universityStudents'
  | 'touristArrivalsPerYear'
  | 'rentalDemandIndex'
  | 'avgDaysOnMarket'
  | 'transactionsPerYear'
  | 'buyTransactionCostRate'
  | 'sellTransactionCostRate'
  | 'rentalIncomeTaxRate';

export interface Market {
  id: UUID;
  name: string;
  country: string;
  /** null for a whole city, otherwise the district/zone within `name`. */
  district: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  metrics: Partial<Record<MarketMetricKey, MarketMetric>>;
  /** Free-text, user-owned notes on regulation and market-specific risk. */
  regulationNotes: string | null;
  riskNotes: string | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: scenarios
 * ------------------------------------------------------------------ */

/**
 * A scenario is a set of multiplicative/additive shocks applied to the base
 * inputs. Storing shocks rather than full input copies means a change to the
 * base case flows through every scenario, which is the behaviour an investor
 * expects.
 */
export interface ScenarioShocks {
  /**
   * Multiplier on the price PAID at t=0, e.g. -0.10 => you negotiate 10% off.
   * Lowering this IMPROVES returns. It is an acquisition assumption.
   */
  purchasePriceDelta: number;
  /**
   * Multiplier on the property's MARKET VALUE throughout the hold, e.g. -0.15
   * => the market reprices 15% lower. Lowering this WORSENS returns. This is
   * the shock a "prices fall 15%" downside scenario actually means; conflating
   * it with `purchasePriceDelta` makes a crash look like a bargain.
   */
  marketValueDelta: number;
  /** Multiplier on monthly rent. */
  rentDelta: number;
  /** Multiplier on vacancy days, e.g. 0.5 => +50% vacancy. */
  vacancyDelta: number;
  /** Multiplier on all recurring operating costs and the capex reserve. */
  operatingCostDelta: number;
  /** Additive shock on the mortgage rate, in decimal (0.02 = +200bps). */
  interestRateDelta: number;
  /** Additive shock on annual property price growth. */
  priceGrowthDelta: number;
  /** Additive shock on annual rent growth. */
  rentGrowthDelta: number;
}

export interface Scenario {
  id: UUID;
  name: string;
  /** Built-in scenarios can be edited but not deleted. */
  builtIn: boolean;
  description: string;
  shocks: ScenarioShocks;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: portfolio
 * ------------------------------------------------------------------ */

export type AssetClass = 'REAL_ESTATE' | 'EQUITIES' | 'BONDS' | 'CASH' | 'OTHER';

export interface PortfolioAsset {
  id: UUID;
  label: string;
  assetClass: AssetClass;
  /** Equity committed by the investor, excluding debt. */
  amount: number;
  /** Debt attached to this asset. Only meaningful for real estate. */
  debt: number;
  /** Expected annual income yield on market value, decimal. */
  incomeYield: number | null;
  /** Expected annual capital growth, decimal. */
  growthRate: number | null;
  /** Can it be converted to cash within ~30 days without a material haircut? */
  liquid: boolean;
  /** Free-text geography tag used for exposure reporting. */
  geography: string;
  /** Optional link to an analysed property. */
  propertyId: UUID | null;
  /** Value change applied to this asset in the portfolio downside scenario. */
  downsideShock: number | null;
}

export interface Portfolio {
  id: UUID;
  name: string;
  availableCapital: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  assets: PortfolioAsset[];
}

/* ------------------------------------------------------------------ *
 * Notes attached to calculated output
 * ------------------------------------------------------------------ */

/** Machine-readable warning emitted by the engine. Never a recommendation. */
export interface EngineNote {
  severity: 'INFO' | 'WARNING';
  code: string;
  message: string;
}
