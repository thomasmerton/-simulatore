/**
 * Domain types.
 *
 * Strict separation, mirrored by the database schema in /db/schema.sql:
 *   - RAW DATA        : observed facts about a property or market.
 *   - USER ASSUMPTIONS: forward-looking inputs chosen by the investor.
 *   - CALCULATED      : never stored, always recomputed (see /src/calculations).
 */

import type { DataPoint, Geography } from './datapoint';
import type { ProvenanceMap } from './provenance';

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

export type PropertyType = 'APARTMENT' | 'HOUSE' | 'STUDIO' | 'ROOM' | 'COMMERCIAL' | 'OTHER';

export interface PropertyFacts {
  /** Administrative hierarchy, used for portfolio exposure and market matching. */
  location: Geography;
  /** Free-text street address. Optional and never required by any calculation. */
  address: string | null;
  /** Where the listing came from, so a figure can be traced back to it. */
  listingUrl: string | null;
  propertyType: PropertyType | null;
  /** Asking price as listed. */
  askingPrice: number | null;
  /** Price actually assumed for the purchase. Defaults to askingPrice. */
  purchasePrice: number | null;
  /**
   * Independent estimate of market value, when the investor has one.
   * Left null by default: the tool will not assume a property is worth more
   * than was paid for it, because that would manufacture equity at t=0.
   */
  marketValue: number | null;
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
 * USER ASSUMPTIONS: acquisition
 * ------------------------------------------------------------------ */

/**
 * Costs incurred at t=0, on top of the purchase price.
 * Percentage fields are decimals (0.09 = 9%) applied to the purchase price.
 * Where both a rate and an amount exist the amount wins — a real quote beats
 * a rule of thumb.
 */
export interface AcquisitionCosts {
  /** Transfer / registration tax (imposta di registro, IVA, stamp duty...). */
  purchaseTaxRate: number | null;
  purchaseTaxAmount: number | null;
  notaryFees: number | null;
  /** Conveyancing or legal advice, separate from the notary. */
  legalFees: number | null;
  agencyCommissionRate: number | null;
  agencyCommissionAmount: number | null;
  /** Arrangement, survey and mortgage-registration fees. Paid from equity. */
  financingFees: number | null;
  /** Capitalised works. Assumed paid at t=0. */
  renovationCost: number | null;
  furnitureCost: number | null;
  /**
   * Working capital set aside at purchase — the float that covers costs
   * before the first rent arrives. Cash committed, so it is part of equity,
   * but it is not spent, so it returns to the investor at exit.
   */
  initialReserves: number | null;
  otherUpfrontCosts: number | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: rental strategy
 *
 * Each strategy has its OWN assumptions. Nothing is carried across: a
 * short-let occupancy rate is not a long-let one, and deriving one from the
 * other would be inventing data. A strategy with incomplete assumptions
 * produces "Data unavailable", not a fallback.
 * ------------------------------------------------------------------ */

export type RentalStrategy = 'LONG_TERM' | 'SHORT_TERM' | 'STUDENT' | 'ROOM_BY_ROOM';

export const RENTAL_STRATEGY_LABELS: Record<RentalStrategy, string> = {
  LONG_TERM: 'Long-term rental',
  SHORT_TERM: 'Short-term rental',
  STUDENT: 'Student rental',
  ROOM_BY_ROOM: 'Room by room',
};

export interface ShortTermAssumptions {
  /** Average daily rate, net of any guest-paid cleaning. */
  averageDailyRate: number | null;
  /** Share of nights booked across the year, 0..1. */
  occupancyRate: number | null;
  /** Platform commission as a share of booking revenue. */
  platformFeeRate: number | null;
  cleaningCostPerStay: number | null;
  averageStayNights: number | null;
  /** When true, cleaning is billed to the guest and is not a cost to the host. */
  cleaningRecoveredFromGuest: boolean;
}

export interface StudentAssumptions {
  monthlyRentPerRoom: number | null;
  rooms: number | null;
  /** Academic year length. Nine or ten months is common; not assumed. */
  monthsLetPerYear: number | null;
  /** Share of rooms filled during the let period, 0..1. */
  roomOccupancyRate: number | null;
}

export interface RoomByRoomAssumptions {
  monthlyRentPerRoom: number | null;
  rooms: number | null;
  /** Share of rooms occupied across the year, 0..1. */
  roomOccupancyRate: number | null;
}

export interface RentalAssumptions {
  strategy: RentalStrategy;

  /* --- LONG_TERM parameters ---------------------------------------- */
  /** Contractual monthly rent when occupied. */
  monthlyRent: number | null;
  /**
   * Expected empty days per year in a stabilised year.
   * NOTE: days, not a market vacancy rate. occupancy = 1 - days/365.
   */
  vacancyDaysPerYear: number | null;

  /* --- Other strategies -------------------------------------------- */
  shortTerm: ShortTermAssumptions;
  student: StudentAssumptions;
  roomByRoom: RoomByRoomAssumptions;

  /* --- Shared ------------------------------------------------------- */
  /** Nominal annual rent growth, decimal. Compounded yearly. */
  rentGrowthRate: number | null;
  /**
   * Months at the start of year 1 with no revenue (works, fit-out, letting up).
   * Ignoring this materially overstates IRR on a refurbishment case.
   */
  stabilizationMonths: number | null;

  /* Recurring costs per year, in year-1 money, grown by expenseGrowthRate. */
  condoFees: number | null;
  /** Recurring property tax (IMU, council tax, taxe foncière...). */
  propertyTax: number | null;
  insurance: number | null;
  ordinaryMaintenance: number | null;
  /** Provision for major works. Treated as capex, BELOW NOI. */
  capexReserve: number | null;
  /** Management fee as a share of COLLECTED revenue, decimal. */
  managementFeeRate: number | null;
  /**
   * Utilities borne by the owner. Usually zero on a long let and material on
   * a short let, so it is an input rather than a strategy-derived number.
   */
  utilities: number | null;
  otherOperatingCosts: number | null;
  /** Annual growth applied to all recurring costs, decimal. */
  expenseGrowthRate: number | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: financing
 * ------------------------------------------------------------------ */

export type RateType = 'FIXED' | 'VARIABLE';
export type AmortizationType = 'AMORTIZING' | 'INTEREST_ONLY';

export interface FinancingAssumptions {
  enabled: boolean;
  /** Loan-to-value against the purchase price, decimal. */
  ltv: number | null;
  /** Explicit loan amount. When set, overrides `ltv`. */
  loanAmount: number | null;
  /** Nominal annual rate, decimal. */
  annualRate: number | null;
  /** Amortisation period in years. */
  termYears: number | null;
  rateType: RateType;
  /**
   * AMORTIZING     — level instalments repay the loan over the term.
   * INTEREST_ONLY  — interest only; the full principal is outstanding at
   *                  maturity and must be repaid or refinanced.
   */
  amortizationType: AmortizationType;
  /**
   * Maturity in years, when the loan falls due before it is fully amortised.
   * A balloon balance then remains and is settled at exit.
   */
  maturityYears: number | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: taxation
 *
 * No jurisdiction's rules are hardcoded. A TaxProfile is a set of editable
 * inputs with a stated source and effective date. Until someone verifies it
 * against the law, it is a MODEL_ASSUMPTION and the UI says so.
 * ------------------------------------------------------------------ */

export type IncomeTaxMode = 'NONE' | 'FLAT_ON_GROSS' | 'FLAT_ON_NET';
export type InvestorType = 'INDIVIDUAL' | 'COMPANY' | 'NON_RESIDENT';
export type TransactionType = 'RESIDENTIAL_SECONDARY' | 'RESIDENTIAL_PRIMARY' | 'NEW_BUILD' | 'COMMERCIAL';

export interface TaxProfile {
  id: UUID;
  name: string;
  country: string;
  propertyType: PropertyType;
  investorType: InvestorType;
  transactionType: TransactionType;

  /* --- Acquisition -------------------------------------------------- */
  purchaseTaxRate: number | null;

  /* --- Income ------------------------------------------------------- */
  incomeTaxMode: IncomeTaxMode;
  incomeTaxRate: number | null;
  /** FLAT_ON_NET only. Jurisdiction-specific, so an explicit switch. */
  interestDeductible: boolean;

  /* --- Exit --------------------------------------------------------- */
  capitalGainsTaxRate: number | null;
  /** null disables the exemption entirely. */
  capitalGainsExemptAfterYears: number | null;
  sellingCostsRate: number | null;

  /* --- Provenance --------------------------------------------------- */
  source: string | null;
  sourceUrl: string | null;
  /** The date from which these rules are stated to apply. */
  effectiveDate: ISODate | null;
  /**
   * False until a human has checked these figures against the law for this
   * investor and this transaction. False => every tax figure derived from the
   * profile is a MODEL_ASSUMPTION and is flagged as such.
   */
  verified: boolean;
  notes: string | null;
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
  /** Exemption after a holding period. null disables it. */
  capitalGainsExemptAfterYears: number | null;
}

export interface AnalysisSettings {
  /** Required annual return used to discount cash flows for NPV. */
  discountRate: number | null;
  currency: string;
}

export interface IncomeTaxAssumptions {
  mode: IncomeTaxMode;
  rate: number | null;
  interestDeductible: boolean;
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

export interface Property {
  id: UUID;
  name: string;
  marketId: UUID | null;
  /** The tax profile applied to this property, when one has been chosen. */
  taxProfileId: UUID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  inputs: PropertyInputs;
  provenance: ProvenanceMap;
}

/* ------------------------------------------------------------------ *
 * RAW: market data
 * ------------------------------------------------------------------ */

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
  | 'rentalIncomeTaxRate'
  /** Nominal mortgage rate on new lending. Fees excluded. */
  | 'mortgageRateNominal'
  /** APR / TAEG on new lending. INCLUDES fees — never the nominal rate. */
  | 'mortgageRateAprc';

export interface Market {
  id: UUID;
  name: string;
  geography: Geography;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** Every metric is a fully attributed DataPoint or it is not here at all. */
  metrics: Partial<Record<MarketMetricKey, DataPoint>>;
  /** Free-text, user-owned notes. Regulation and risk do not reduce to numbers. */
  regulationNotes: string | null;
  riskNotes: string | null;
}

/* ------------------------------------------------------------------ *
 * USER ASSUMPTIONS: scenarios
 *
 * Shocks are grouped by the part of the deal they hit, and each names exactly
 * one input. Storing shocks rather than copies of the inputs means a change to
 * the base case flows through every scenario.
 * ------------------------------------------------------------------ */

export interface ScenarioShocks {
  /* --- Acquisition --------------------------------------------------- */
  /** × on the price PAID. Negative = cheaper entry = returns IMPROVE. */
  purchasePriceDelta: number;
  /** × on renovation cost. */
  renovationCostDelta: number;

  /* --- Market value -------------------------------------------------- */
  /** × on the asset's market VALUE. Negative = correction = returns WORSEN. */
  marketValueDelta: number;
  /** + on the annual appreciation rate. */
  priceGrowthDelta: number;

  /* --- Revenue -------------------------------------------------------- */
  /** × on long-let monthly rent, student and room rents. */
  rentDelta: number;
  /** × on vacancy days (long let) — more days empty. */
  vacancyDelta: number;
  /** × on short-let and room occupancy RATES. Negative = fewer nights sold. */
  occupancyRateDelta: number;
  /** × on the short-let average daily rate. */
  adrDelta: number;
  /** + on the annual rent growth rate. */
  rentGrowthDelta: number;

  /* --- Expenses -------------------------------------------------------- */
  /** × on maintenance and the capex reserve. */
  maintenanceDelta: number;
  /** × on the management fee rate. */
  managementDelta: number;
  /** × on recurring property tax. */
  propertyTaxDelta: number;
  /** × on all other recurring operating costs. */
  otherOperatingDelta: number;

  /* --- Financing -------------------------------------------------------- */
  /** + on the mortgage rate, in decimal. VARIABLE-rate loans only. */
  interestRateDelta: number;

  /* --- Exit --------------------------------------------------------------- */
  /** + on the selling cost rate. */
  sellingCostsDelta: number;
  /** + on the capital gains tax rate. */
  exitTaxDelta: number;
}

/** Which part of the deal a shock hits. Drives the scenario editor's grouping. */
export type ShockGroup = 'ACQUISITION' | 'MARKET_VALUE' | 'REVENUE' | 'EXPENSES' | 'FINANCING' | 'EXIT';

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
  /** Convertible to cash within ~30 days without a material haircut? */
  liquid: boolean;
  /** Full administrative hierarchy, for exposure reporting. */
  location: Geography | null;
  /** Link to an analysed property. */
  propertyId: UUID | null;
  /** Rental strategy, for exposure by strategy. Real estate only. */
  strategy: RentalStrategy | null;
  /** Value change applied to this asset in the portfolio downside. */
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

/**
 * A named way of deploying the available capital, so alternatives can be laid
 * side by side. There is deliberately no "best" flag and no ranking.
 */
export interface AllocationStrategy {
  id: UUID;
  name: string;
  description: string;
  assets: PortfolioAsset[];
}

/* ------------------------------------------------------------------ *
 * Engine output annotations
 * ------------------------------------------------------------------ */

/** Machine-readable note from the engine. Never a recommendation. */
export interface EngineNote {
  severity: 'INFO' | 'WARNING';
  code: string;
  message: string;
}
