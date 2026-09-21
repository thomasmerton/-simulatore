/**
 * Default inputs.
 *
 * IMPORTANT: every non-zero default here is a MODEL ASSUMPTION, not evidence.
 * Each one is registered in `defaultProvenance` so the UI can show the user
 * exactly which numbers they have not yet supplied. Nothing here is a
 * forecast, and nothing is tuned to any specific market.
 *
 * Fields that cannot be guessed at all (price, rent, surface) default to null
 * and are reported as MISSING rather than filled with a plausible number.
 */

import type {
  IncomeTaxAssumptions,
  Portfolio,
  PropertyInputs,
  ScenarioShocks,
} from './types';
import type { ProvenanceMap } from './provenance';
import { NO_SHOCKS } from '@/calculations/scenario';

export const DEFAULT_CURRENCY = 'EUR';

export function emptyPropertyInputs(): PropertyInputs {
  return {
    facts: {
      city: '',
      district: '',
      address: null,
      askingPrice: null,
      purchasePrice: null,
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
      agencyCommissionRate: null,
      agencyCommissionAmount: null,
      renovationCost: null,
      furnitureCost: null,
      otherUpfrontCosts: null,
    },
    rental: {
      monthlyRent: null,
      vacancyDaysPerYear: null,
      rentGrowthRate: null,
      stabilizationMonths: null,
      condoFees: null,
      propertyTax: null,
      insurance: null,
      ordinaryMaintenance: null,
      capexReserve: null,
      managementFeeRate: null,
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
      upfrontCosts: null,
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
 * A starting point with the structural assumptions pre-filled so a new user
 * is not faced with thirty empty fields. Market-specific values (price, rent,
 * growth) remain null: they must come from the user or from market data.
 */
export function starterPropertyInputs(): PropertyInputs {
  const base = emptyPropertyInputs();
  return {
    ...base,
    acquisition: {
      ...base.acquisition,
      purchaseTaxRate: 0.09, // registration tax on a second home in Italy
      notaryFees: 2500,
      agencyCommissionRate: 0.03,
      renovationCost: 0,
      furnitureCost: 0,
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
      upfrontCosts: 0,
    },
    exit: {
      holdingPeriodYears: 10,
      priceGrowthRate: 0,
      sellingCostsRate: 0.03,
      capitalGainsTaxRate: 0.26,
      capitalGainsExemptAfterYears: 5,
    },
    settings: { discountRate: 0.05, currency: DEFAULT_CURRENCY },
  };
}

/**
 * Provenance for the starter inputs. Everything pre-filled is a model
 * assumption; everything else is missing until the user supplies it.
 */
export function starterProvenance(): ProvenanceMap {
  return {
    'acquisition.purchaseTaxRate': 'MODEL_ASSUMPTION',
    'acquisition.notaryFees': 'MODEL_ASSUMPTION',
    'acquisition.agencyCommissionRate': 'MODEL_ASSUMPTION',
    'rental.vacancyDaysPerYear': 'MODEL_ASSUMPTION',
    'rental.rentGrowthRate': 'MODEL_ASSUMPTION',
    'rental.expenseGrowthRate': 'MODEL_ASSUMPTION',
    'financing.ltv': 'MODEL_ASSUMPTION',
    'financing.annualRate': 'MODEL_ASSUMPTION',
    'financing.termYears': 'MODEL_ASSUMPTION',
    'exit.priceGrowthRate': 'MODEL_ASSUMPTION',
    'exit.sellingCostsRate': 'MODEL_ASSUMPTION',
    'exit.capitalGainsTaxRate': 'MODEL_ASSUMPTION',
    'exit.capitalGainsExemptAfterYears': 'MODEL_ASSUMPTION',
    'settings.discountRate': 'MODEL_ASSUMPTION',
    'facts.purchasePrice': 'MISSING',
    'facts.sqm': 'MISSING',
    'rental.monthlyRent': 'MISSING',
  };
}

export const DEFAULT_INCOME_TAX: IncomeTaxAssumptions = {
  mode: 'NONE',
  rate: 0.21,
  interestDeductible: false,
};

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

export function emptyShocks(): ScenarioShocks {
  return { ...NO_SHOCKS };
}
