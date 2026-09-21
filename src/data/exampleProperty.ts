/**
 * ILLUSTRATIVE EXAMPLE PROPERTY — NOT A REAL LISTING.
 *
 * A worked example so a first-time user can see the analysis populated rather
 * than a screen of "Data unavailable". The figures are plausible for a small
 * Milan flat but they are INVENTED: no listing, no valuation, no survey.
 *
 * Every value is therefore stamped MODEL_ASSUMPTION, not USER_INPUT. That is
 * the honest label — and it doubles as a demonstration of the provenance
 * system, since the whole analysis renders with "model assumption" badges
 * until the user replaces the numbers with their own.
 *
 * Loaded only by explicit user action, never automatically.
 */

import type { Property, PropertyInputs } from '@/domain/types';
import type { ProvenanceMap } from '@/domain/provenance';
import { starterPropertyInputs } from '@/domain/defaults';

export const EXAMPLE_PROPERTY_NAME = 'Example · Milan 2-bed';

function exampleInputs(): PropertyInputs {
  const base = starterPropertyInputs();
  return {
    ...base,
    facts: {
      ...base.facts,
      location: {
        country: 'Italy',
        region: 'Lombardia',
        city: 'Milan',
        neighborhood: 'Navigli',
        level: 'NEIGHBORHOOD',
      },
      propertyType: 'APARTMENT',
      askingPrice: 189_000,
      purchasePrice: 180_000,
      sqm: 65,
      rooms: 2,
      bathrooms: 1,
      floor: 3,
      elevator: true,
      condition: 'GOOD',
      yearBuilt: 1972,
      furnished: false,
    },
    acquisition: {
      ...base.acquisition,
      purchaseTaxRate: 0.09,
      agencyCommissionRate: 0.03,
      renovationCost: 12_000,
      furnitureCost: 4_000,
      legalFees: 0,
      financingFees: 1_200,
      initialReserves: 3_000,
    },
    rental: {
      ...base.rental,
      monthlyRent: 950,
      vacancyDaysPerYear: 30,
      // Three months of works before the first rent arrives.
      stabilizationMonths: 3,
      condoFees: 1_200,
      propertyTax: 600,
      insurance: 180,
      ordinaryMaintenance: 400,
      capexReserve: 500,
      managementFeeRate: 0.08,
    },
    financing: { ...base.financing, enabled: true, ltv: 0.7, annualRate: 0.035 },
    incomeTax: { mode: 'FLAT_ON_GROSS', rate: 0.21, interestDeductible: false },
    exit: {
      ...base.exit,
      priceGrowthRate: 0.015,
      sellingCostsRate: 0.03,
      capitalGainsTaxRate: 0.26,
      capitalGainsExemptAfterYears: 5,
    },
  };
}

/**
 * Provenance for the example. Everything is a model assumption: none of it was
 * observed, and none of it is the user's own figure.
 */
function exampleProvenance(): ProvenanceMap {
  const paths = [
    'facts.location', 'facts.askingPrice', 'facts.purchasePrice', 'facts.propertyType',
    'facts.sqm', 'facts.rooms', 'facts.bathrooms', 'facts.floor',
    'facts.condition', 'facts.yearBuilt',
    'acquisition.purchaseTaxRate', 'acquisition.notaryFees',
    'acquisition.agencyCommissionRate', 'acquisition.renovationCost',
    'acquisition.furnitureCost',
    'rental.monthlyRent', 'rental.vacancyDaysPerYear', 'rental.rentGrowthRate',
    'rental.stabilizationMonths', 'rental.condoFees', 'rental.propertyTax',
    'rental.insurance', 'rental.ordinaryMaintenance', 'rental.capexReserve',
    'rental.managementFeeRate', 'rental.expenseGrowthRate',
    'acquisition.legalFees', 'acquisition.financingFees', 'acquisition.initialReserves',
    'rental.utilities',
    'financing.ltv', 'financing.annualRate', 'financing.termYears',
    'incomeTax.mode', 'incomeTax.rate',
    'exit.priceGrowthRate', 'exit.sellingCostsRate',
    'exit.capitalGainsTaxRate', 'exit.capitalGainsExemptAfterYears',
    'settings.discountRate',
  ];
  const map: ProvenanceMap = {};
  for (const path of paths) map[path] = 'MODEL_ASSUMPTION';
  return map;
}

export function exampleProperty(id: string): Property {
  const now = new Date().toISOString();
  return {
    id,
    name: EXAMPLE_PROPERTY_NAME,
    marketId: null,
    taxProfileId: null,
    createdAt: now,
    updatedAt: now,
    inputs: exampleInputs(),
    provenance: exampleProvenance(),
  };
}

/** True when a property still has no price or rent — i.e. nothing to analyse. */
export function isUntouched(property: Property): boolean {
  const { facts, rental } = property.inputs;
  return (
    facts.purchasePrice === null && facts.askingPrice === null && rental.monthlyRent === null
  );
}
