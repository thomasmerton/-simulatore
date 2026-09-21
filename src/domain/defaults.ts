/**
 * Default inputs.
 *
 * Every non-zero default here is a MODEL_ASSUMPTION, not evidence. Each is
 * registered in `starterProvenance` so the UI can show exactly which numbers
 * the user has not yet supplied.
 *
 * Fields that cannot be guessed at all — price, surface, rent — default to
 * null and report as MISSING rather than being filled with a plausible number.
 */

import type {
  AllocationStrategy,
  Portfolio,
  PropertyInputs,
  RentalStrategy,
  RoomByRoomAssumptions,
  ShortTermAssumptions,
  StudentAssumptions,
  TaxProfile,
} from './types';
import type { Geography } from './datapoint';
import type { ProvenanceMap } from './provenance';

export const DEFAULT_CURRENCY = 'EUR';

export function emptyGeography(): Geography {
  return { country: '', region: null, city: null, neighborhood: null, level: 'CITY' };
}

/** Every short-let parameter is null: none of them can be inferred. */
export function emptyShortTerm(): ShortTermAssumptions {
  return {
    averageDailyRate: null,
    occupancyRate: null,
    platformFeeRate: null,
    cleaningCostPerStay: null,
    averageStayNights: null,
    cleaningRecoveredFromGuest: false,
  };
}

export function emptyStudent(): StudentAssumptions {
  return {
    monthlyRentPerRoom: null,
    rooms: null,
    monthsLetPerYear: null,
    roomOccupancyRate: null,
  };
}

export function emptyRoomByRoom(): RoomByRoomAssumptions {
  return { monthlyRentPerRoom: null, rooms: null, roomOccupancyRate: null };
}

export function emptyPropertyInputs(): PropertyInputs {
  return {
    facts: {
      location: emptyGeography(),
      address: null,
      listingUrl: null,
      propertyType: null,
      askingPrice: null,
      purchasePrice: null,
      marketValue: null,
      sqm: null,
      rooms: null,
      bathrooms: null,
      floor: null,
      elevator: null,
      condition: null,
      yearBuilt: null,
      furnished: null,
    },
    acquisition: {
      purchaseTaxRate: null,
      purchaseTaxAmount: null,
      notaryFees: null,
      legalFees: null,
      agencyCommissionRate: null,
      agencyCommissionAmount: null,
      financingFees: null,
      renovationCost: null,
      furnitureCost: null,
      initialReserves: null,
      otherUpfrontCosts: null,
    },
    rental: {
      strategy: 'LONG_TERM',
      monthlyRent: null,
      vacancyDaysPerYear: null,
      shortTerm: emptyShortTerm(),
      student: emptyStudent(),
      roomByRoom: emptyRoomByRoom(),
      rentGrowthRate: null,
      stabilizationMonths: null,
      condoFees: null,
      propertyTax: null,
      insurance: null,
      ordinaryMaintenance: null,
      capexReserve: null,
      managementFeeRate: null,
      utilities: null,
      otherOperatingCosts: null,
      expenseGrowthRate: null,
    },
    financing: {
      enabled: false,
      ltv: null,
      loanAmount: null,
      annualRate: null,
      termYears: null,
      rateType: 'FIXED',
      amortizationType: 'AMORTIZING',
      maturityYears: null,
    },
    incomeTax: { mode: 'NONE', rate: null, interestDeductible: false },
    exit: {
      holdingPeriodYears: 10,
      priceGrowthRate: null,
      sellingCostsRate: null,
      capitalGainsTaxRate: null,
      capitalGainsExemptAfterYears: null,
    },
    settings: { discountRate: null, currency: DEFAULT_CURRENCY },
  };
}

/**
 * A starting point with the STRUCTURAL assumptions pre-filled, so a new user
 * is not faced with forty empty fields. Market-specific values — price, rent,
 * growth — stay null: they must come from the user or from market data.
 */
export function starterPropertyInputs(): PropertyInputs {
  const base = emptyPropertyInputs();
  return {
    ...base,
    acquisition: {
      ...base.acquisition,
      notaryFees: 2500,
      renovationCost: 0,
      furnitureCost: 0,
      legalFees: 0,
      financingFees: 0,
      initialReserves: 0,
      otherUpfrontCosts: 0,
    },
    rental: {
      ...base.rental,
      vacancyDaysPerYear: 30,
      rentGrowthRate: 0.01,
      stabilizationMonths: 0,
      condoFees: 0,
      propertyTax: 0,
      insurance: 0,
      ordinaryMaintenance: 0,
      capexReserve: 0,
      managementFeeRate: 0,
      utilities: 0,
      otherOperatingCosts: 0,
      expenseGrowthRate: 0.02,
    },
    financing: {
      ...base.financing,
      enabled: false,
      ltv: 0.7,
      annualRate: 0.035,
      termYears: 25,
      rateType: 'FIXED',
      amortizationType: 'AMORTIZING',
      maturityYears: null,
    },
    exit: { ...base.exit, holdingPeriodYears: 10, priceGrowthRate: 0 },
    settings: { discountRate: 0.05, currency: DEFAULT_CURRENCY },
  };
}

/**
 * Provenance for the starter inputs: everything pre-filled is a model
 * assumption, everything else is missing until the user supplies it.
 *
 * Note what is NOT pre-filled any more: purchase tax, agency commission,
 * selling costs and capital gains tax now come from a TaxProfile, so that
 * they carry a country, an effective date and a verified flag rather than
 * being silent Italian defaults.
 */
export function starterProvenance(): ProvenanceMap {
  return {
    'acquisition.notaryFees': 'MODEL_ASSUMPTION',
    'rental.vacancyDaysPerYear': 'MODEL_ASSUMPTION',
    'rental.rentGrowthRate': 'MODEL_ASSUMPTION',
    'rental.expenseGrowthRate': 'MODEL_ASSUMPTION',
    'financing.ltv': 'MODEL_ASSUMPTION',
    'financing.annualRate': 'MODEL_ASSUMPTION',
    'financing.termYears': 'MODEL_ASSUMPTION',
    'exit.priceGrowthRate': 'MODEL_ASSUMPTION',
    'settings.discountRate': 'MODEL_ASSUMPTION',
    'facts.purchasePrice': 'MISSING',
    'facts.sqm': 'MISSING',
    'rental.monthlyRent': 'MISSING',
  };
}

/* ------------------------------------------------------------------ *
 * Tax profiles
 * ------------------------------------------------------------------ */

/**
 * An UNVERIFIED starting profile for an Italian second home held by a private
 * individual.
 *
 * `verified: false` is the important field. These rates are a plausible
 * starting point drawn from widely-cited general descriptions of the Italian
 * regime, not from a reading of the law for any particular investor. Until a
 * professional confirms them for a specific case, everything derived from
 * this profile is a MODEL_ASSUMPTION and the UI says so.
 *
 * This is not tax advice.
 */
export function italianSecondHomeProfile(id: string): TaxProfile {
  return {
    id,
    name: 'Italy — second home, private individual (unverified)',
    country: 'Italy',
    propertyType: 'APARTMENT',
    investorType: 'INDIVIDUAL',
    transactionType: 'RESIDENTIAL_SECONDARY',
    purchaseTaxRate: 0.09,
    incomeTaxMode: 'FLAT_ON_GROSS',
    incomeTaxRate: 0.21,
    interestDeductible: false,
    capitalGainsTaxRate: 0.26,
    capitalGainsExemptAfterYears: 5,
    sellingCostsRate: 0.03,
    source: null,
    sourceUrl: null,
    effectiveDate: null,
    verified: false,
    notes:
      'Starting point only. Rates vary with the property, the buyer and the year, and the registration tax base for a second home is often the cadastral value rather than the price. Verify with a professional before relying on any figure.',
  };
}

/** A profile with nothing filled in, for a country the user must describe. */
export function blankTaxProfile(id: string, country = ''): TaxProfile {
  return {
    id,
    name: country ? `${country} — new profile` : 'New tax profile',
    country,
    propertyType: 'APARTMENT',
    investorType: 'INDIVIDUAL',
    transactionType: 'RESIDENTIAL_SECONDARY',
    purchaseTaxRate: null,
    incomeTaxMode: 'NONE',
    incomeTaxRate: null,
    interestDeductible: false,
    capitalGainsTaxRate: null,
    capitalGainsExemptAfterYears: null,
    sellingCostsRate: null,
    source: null,
    sourceUrl: null,
    effectiveDate: null,
    verified: false,
    notes: null,
  };
}

export function emptyPortfolio(id: string): Portfolio {
  const now = new Date().toISOString();
  return {
    id,
    name: 'My portfolio',
    availableCapital: 0,
    createdAt: now,
    updatedAt: now,
    assets: [],
  };
}

export function emptyAllocationStrategy(id: string, name: string): AllocationStrategy {
  return { id, name, description: '', assets: [] };
}

export const STRATEGY_REQUIRED_FIELDS: Record<RentalStrategy, string[]> = {
  LONG_TERM: ['rental.monthlyRent', 'rental.vacancyDaysPerYear'],
  SHORT_TERM: [
    'rental.shortTerm.averageDailyRate',
    'rental.shortTerm.occupancyRate',
    'rental.shortTerm.platformFeeRate',
  ],
  STUDENT: [
    'rental.student.monthlyRentPerRoom',
    'rental.student.rooms',
    'rental.student.monthsLetPerYear',
  ],
  ROOM_BY_ROOM: [
    'rental.roomByRoom.monthlyRentPerRoom',
    'rental.roomByRoom.rooms',
    'rental.roomByRoom.roomOccupancyRate',
  ],
};
