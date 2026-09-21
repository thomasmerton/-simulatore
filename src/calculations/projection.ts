/**
 * The projection engine: turns inputs into a year-by-year timeline and the
 * derived return metrics.
 *
 * TIMING CONVENTION (stated explicitly, because IRR is meaningless without it)
 *   t = 0      : the investor pays equity — deposit, transaction costs,
 *                renovation, furniture and loan arrangement fees.
 *   t = 1..N   : operating cash flows, each treated as occurring at YEAR END.
 *   t = N      : net sale proceeds are added to the final year's flow.
 *
 * Annual periods are used rather than monthly. Monthly discounting would be
 * marginally more precise, but annual periods keep the numbers legible and
 * match the annual inputs the investor actually has. Mortgage interest IS
 * computed monthly (see mortgage.ts) so total interest is not understated.
 */

import type { EngineNote, PropertyInputs } from '@/domain/types';
import { calculateAcquisitionCost, type AcquisitionResult } from './acquisition';
import { calculateRentalYear, type RentalYearResult } from './rental';
import {
  buildRatePath,
  calculateDSCR,
  calculateDebtSchedule,
  calculateLoanAmount,
  type DebtYear,
} from './mortgage';
import { calculateCapitalGainsTax, calculateIncomeTax } from './tax';
import {
  calculateCashOnCash,
  calculateEquityMultiple,
  calculateGrossYield,
  calculateIRR,
  calculateNPV,
  calculateNetYield,
  calculatePaybackPeriod,
  type IRRResult,
  type PaybackResult,
} from './returns';
import { calculateBreakEvenOccupancy, calculateLTV, calculateOccupancyHeadroom } from './risk';
import { compound, isFiniteNumber, sumOptional } from './finance';

export interface ProjectionYear {
  year: number;
  rental: RentalYearResult;
  debt: DebtYear | null;
  /** NOI minus the capex reserve. Property-level cash before financing. */
  cashFlowBeforeDebt: number | null;
  interestPaid: number;
  principalPaid: number;
  debtService: number;
  /** After debt service, before income tax. */
  preTaxCashFlow: number | null;
  incomeTax: number;
  /** The number that actually reaches the investor's bank account. */
  afterTaxCashFlow: number | null;
  cumulativeCashFlow: number | null;
  /** Value at year end, grown at the assumed rate from total acquisition cost. */
  propertyValue: number | null;
  loanBalance: number;
  /** Property value minus outstanding debt. */
  equity: number | null;
  dscr: number | null;
  ltv: number | null;
}

export interface ExitResult {
  year: number;
  salePrice: number | null;
  sellingCosts: number | null;
  netSalePrice: number | null;
  debtRemaining: number;
  capitalGain: number | null;
  capitalGainsTax: number;
  capitalGainsExempt: boolean;
  /** Cash in hand after repaying debt, costs and tax. */
  netSaleProceeds: number | null;
}

export interface ProjectionResult {
  acquisition: AcquisitionResult;
  /** Cash the investor puts in at t=0. */
  equityInvested: number | null;
  loanAmount: number | null;
  years: ProjectionYear[];
  exit: ExitResult;
  notes: EngineNote[];

  /* Headline metrics ------------------------------------------------- */
  year1: {
    grossPotentialRent: number | null;
    effectiveGrossIncome: number | null;
    operatingExpenses: number | null;
    noi: number | null;
    grossYieldOnPrice: number | null;
    grossYieldOnTotalCost: number | null;
    netYieldOnPrice: number | null;
    netYieldOnTotalCost: number | null;
    cashFlowBeforeDebt: number | null;
    afterTaxCashFlow: number | null;
    cashOnCash: number | null;
    dscr: number | null;
    breakEvenOccupancyBeforeDebt: number | null;
    breakEvenOccupancyAfterDebt: number | null;
    occupancyHeadroom: number | null;
  };

  /** Equity-level (levered) cash flows: what the investor pays and receives. */
  leveredCashFlows: number[];
  /** Property-level (unlevered) cash flows: financing stripped out. */
  unleveredCashFlows: number[];

  leveredIRR: IRRResult;
  unleveredIRR: IRRResult;
  npv: number | null;
  equityMultiple: number | null;
  payback: PaybackResult;
  totalCashFlow: number | null;
  totalProfit: number | null;
  minDSCR: number | null;
}

const note = (severity: EngineNote['severity'], code: string, message: string): EngineNote => ({
  severity,
  code,
  message,
});

/**
 * Run the full projection.
 *
 * `rateShock` and `shockFromYear` are threaded in from the scenario engine so
 * that a rate shock re-prices a variable-rate loan without rebuilding inputs.
 * `valueMultiplier` applies a market-wide repricing to the property's value
 * without changing the price the investor actually paid.
 */
export function runProjection(
  inputs: PropertyInputs,
  options: { rateShock?: number; shockFromYear?: number; valueMultiplier?: number } = {},
): ProjectionResult {
  const notes: EngineNote[] = [];
  const { facts, acquisition: acqCosts, rental, financing, incomeTax, exit, settings } = inputs;

  const acquisition = calculateAcquisitionCost(facts, acqCosts);
  const holdingYears = Math.max(1, Math.round(exit.holdingPeriodYears));

  /* --- Debt ------------------------------------------------------------- */
  const loanAmount = calculateLoanAmount(financing, acquisition.purchasePrice);
  const termYears =
    financing.enabled && isFiniteNumber(financing.termYears)
      ? Math.max(1, Math.round(financing.termYears))
      : 0;

  let debtSchedule: DebtYear[] = [];
  if (financing.enabled && isFiniteNumber(loanAmount) && loanAmount > 0 && termYears > 0) {
    const ratePath = buildRatePath(
      financing,
      termYears,
      options.rateShock ?? 0,
      options.shockFromYear ?? 1,
    );
    debtSchedule = calculateDebtSchedule({ loanAmount, termYears, ratePath });
    if (financing.rateType === 'FIXED' && (options.rateShock ?? 0) !== 0) {
      notes.push(
        note(
          'INFO',
          'RATE_SHOCK_NOT_APPLIED',
          'The interest rate shock was not applied: this loan is fixed-rate, so the instalment is contractually unchanged.',
        ),
      );
    }
    if (termYears < holdingYears) {
      notes.push(
        note(
          'INFO',
          'LOAN_SHORTER_THAN_HOLD',
          `The loan is repaid in year ${termYears}, before the end of the ${holdingYears}-year holding period.`,
        ),
      );
    }
  } else if (financing.enabled) {
    notes.push(
      note(
        'WARNING',
        'FINANCING_INCOMPLETE',
        'Financing is enabled but the loan amount, rate or term is missing, so the analysis is unlevered.',
      ),
    );
  }

  /* --- Equity at t=0 ---------------------------------------------------- */
  const financingUpfront = isFiniteNumber(financing.upfrontCosts) ? financing.upfrontCosts : 0;
  const effectiveLoan = debtSchedule.length > 0 ? (loanAmount as number) : 0;
  const equityInvested = isFiniteNumber(acquisition.totalAcquisitionCost)
    ? acquisition.totalAcquisitionCost - effectiveLoan + financingUpfront
    : null;

  /* --- Year by year ----------------------------------------------------- */
  const years: ProjectionYear[] = [];
  let cumulative = 0;
  let cumulativeKnown = true;

  for (let y = 1; y <= holdingYears; y++) {
    const rentalYear = calculateRentalYear(rental, y);
    const debt = debtSchedule[y - 1] ?? null;
    const interestPaid = debt?.interestPaid ?? 0;
    const principalPaid = debt?.principalPaid ?? 0;
    const debtService = debt?.debtService ?? 0;

    const cashFlowBeforeDebt = isFiniteNumber(rentalYear.noi)
      ? rentalYear.noi - rentalYear.capexReserve
      : null;

    const preTaxCashFlow = isFiniteNumber(cashFlowBeforeDebt)
      ? cashFlowBeforeDebt - debtService
      : null;

    const tax = calculateIncomeTax(
      incomeTax,
      rentalYear.effectiveGrossIncome,
      rentalYear.noi,
      interestPaid,
    );

    const afterTaxCashFlow = isFiniteNumber(preTaxCashFlow) ? preTaxCashFlow - tax.tax : null;

    if (isFiniteNumber(afterTaxCashFlow) && cumulativeKnown) {
      cumulative += afterTaxCashFlow;
    } else {
      cumulativeKnown = false;
    }

    // Value grows from the PURCHASE PRICE, not the total acquisition cost:
    // transaction costs are sunk and are not recovered by market appreciation.
    const growth = isFiniteNumber(exit.priceGrowthRate) ? exit.priceGrowthRate : 0;
    const valueMultiplier = isFiniteNumber(options.valueMultiplier)
      ? options.valueMultiplier
      : 1;
    const grownValue = isFiniteNumber(acquisition.purchasePrice)
      ? compound(acquisition.purchasePrice, growth, y)
      : null;
    const propertyValue = isFiniteNumber(grownValue) ? grownValue * valueMultiplier : null;

    const loanBalance = debt?.closingBalance ?? 0;

    years.push({
      year: y,
      rental: rentalYear,
      debt,
      cashFlowBeforeDebt,
      interestPaid,
      principalPaid,
      debtService,
      preTaxCashFlow,
      incomeTax: tax.tax,
      afterTaxCashFlow,
      cumulativeCashFlow: cumulativeKnown ? cumulative : null,
      propertyValue,
      loanBalance,
      equity: isFiniteNumber(propertyValue) ? propertyValue - loanBalance : null,
      dscr: calculateDSCR(rentalYear.noi, debtService),
      ltv: calculateLTV(loanBalance, propertyValue),
    });
  }

  /* --- Exit ------------------------------------------------------------- */
  const finalYear = years[years.length - 1];
  const salePrice = finalYear?.propertyValue ?? null;
  const sellingCostsRate = isFiniteNumber(exit.sellingCostsRate) ? exit.sellingCostsRate : 0;
  const sellingCosts = isFiniteNumber(salePrice) ? salePrice * sellingCostsRate : null;
  const netSalePrice =
    isFiniteNumber(salePrice) && isFiniteNumber(sellingCosts) ? salePrice - sellingCosts : null;
  const debtRemaining = finalYear?.loanBalance ?? 0;

  const gains = calculateCapitalGainsTax(
    netSalePrice,
    acquisition.totalAcquisitionCost,
    exit.capitalGainsTaxRate,
    holdingYears,
    exit.capitalGainsExemptAfterYears,
  );

  const netSaleProceeds = isFiniteNumber(netSalePrice)
    ? netSalePrice - debtRemaining - gains.tax
    : null;

  const exitResult: ExitResult = {
    year: holdingYears,
    salePrice,
    sellingCosts,
    netSalePrice,
    debtRemaining,
    capitalGain: gains.gain,
    capitalGainsTax: gains.tax,
    capitalGainsExempt: gains.exempt,
    netSaleProceeds,
  };

  /* --- Cash flow series ------------------------------------------------- */
  const annualCashFlows = years.map((y) => y.afterTaxCashFlow);
  const allCashFlowsKnown = annualCashFlows.every(isFiniteNumber);

  const leveredCashFlows: number[] = [];
  const unleveredCashFlows: number[] = [];

  if (isFiniteNumber(equityInvested) && allCashFlowsKnown && isFiniteNumber(netSaleProceeds)) {
    leveredCashFlows.push(-equityInvested);
    years.forEach((y, i) => {
      const isLast = i === years.length - 1;
      leveredCashFlows.push((y.afterTaxCashFlow as number) + (isLast ? netSaleProceeds : 0));
    });
  }

  if (
    isFiniteNumber(acquisition.totalAcquisitionCost) &&
    years.every((y) => isFiniteNumber(y.cashFlowBeforeDebt)) &&
    isFiniteNumber(netSalePrice)
  ) {
    // Unlevered: no loan, so no interest and no debt to repay at exit.
    unleveredCashFlows.push(-acquisition.totalAcquisitionCost);
    years.forEach((y, i) => {
      const isLast = i === years.length - 1;
      const proceeds = isLast ? netSalePrice - gains.tax : 0;
      unleveredCashFlows.push((y.cashFlowBeforeDebt as number) + proceeds);
    });
  }

  /* --- Headline metrics ------------------------------------------------- */
  const y1 = years[0];
  const y1Rental = y1?.rental;
  const fixedOpex = y1Rental
    ? sumOptional(
        y1Rental.operatingExpenseLines
          .filter((l) => l.key !== 'managementFee')
          .map((l) => l.amount),
      )
    : null;

  const breakEvenBeforeDebt = calculateBreakEvenOccupancy({
    grossPotentialRent: y1Rental?.grossPotentialRent ?? null,
    fixedOperatingExpenses: fixedOpex,
    managementFeeRate: rental.managementFeeRate,
    capexReserve: y1Rental?.capexReserve ?? 0,
  });

  const breakEvenAfterDebt = calculateBreakEvenOccupancy({
    grossPotentialRent: y1Rental?.grossPotentialRent ?? null,
    fixedOperatingExpenses: fixedOpex,
    managementFeeRate: rental.managementFeeRate,
    capexReserve: y1Rental?.capexReserve ?? 0,
    debtService: y1?.debtService ?? 0,
  });

  const totalCashFlow = allCashFlowsKnown
    ? sumOptional(annualCashFlows as number[])
    : null;

  const totalProfit =
    isFiniteNumber(totalCashFlow) && isFiniteNumber(netSaleProceeds) && isFiniteNumber(equityInvested)
      ? totalCashFlow + netSaleProceeds - equityInvested
      : null;

  const dscrValues = years.map((y) => y.dscr).filter(isFiniteNumber);

  const leveredIRR = calculateIRR(leveredCashFlows);
  const unleveredIRR = calculateIRR(unleveredCashFlows);

  if (leveredIRR.ambiguous) {
    notes.push(
      note(
        'WARNING',
        'IRR_AMBIGUOUS',
        'The cash flow series changes sign more than once, so more than one IRR can satisfy it. Read NPV and equity multiple alongside it.',
      ),
    );
  }
  if (leveredCashFlows.length === 0) {
    notes.push(
      note(
        'WARNING',
        'IRR_UNAVAILABLE',
        'IRR and NPV cannot be computed: some inputs in the cash flow chain are missing.',
      ),
    );
  }
  if (!isFiniteNumber(settings.discountRate)) {
    notes.push(
      note(
        'WARNING',
        'DISCOUNT_RATE_MISSING',
        'NPV requires a discount rate — your own required return. It cannot be derived from the property.',
      ),
    );
  }

  return {
    acquisition,
    equityInvested,
    loanAmount: debtSchedule.length > 0 ? loanAmount : null,
    years,
    exit: exitResult,
    notes,
    year1: {
      grossPotentialRent: y1Rental?.grossPotentialRent ?? null,
      effectiveGrossIncome: y1Rental?.effectiveGrossIncome ?? null,
      operatingExpenses: y1Rental?.operatingExpenses ?? null,
      noi: y1Rental?.noi ?? null,
      grossYieldOnPrice: calculateGrossYield(
        y1Rental?.grossPotentialRent ?? null,
        acquisition.purchasePrice,
      ),
      grossYieldOnTotalCost: calculateGrossYield(
        y1Rental?.grossPotentialRent ?? null,
        acquisition.totalAcquisitionCost,
      ),
      netYieldOnPrice: calculateNetYield(y1Rental?.noi ?? null, acquisition.purchasePrice),
      netYieldOnTotalCost: calculateNetYield(
        y1Rental?.noi ?? null,
        acquisition.totalAcquisitionCost,
      ),
      cashFlowBeforeDebt: y1?.cashFlowBeforeDebt ?? null,
      afterTaxCashFlow: y1?.afterTaxCashFlow ?? null,
      cashOnCash: calculateCashOnCash(y1?.afterTaxCashFlow ?? null, equityInvested),
      dscr: y1?.dscr ?? null,
      breakEvenOccupancyBeforeDebt: breakEvenBeforeDebt,
      breakEvenOccupancyAfterDebt: breakEvenAfterDebt,
      occupancyHeadroom: calculateOccupancyHeadroom(
        y1Rental?.occupancy ?? null,
        breakEvenAfterDebt,
      ),
    },
    leveredCashFlows,
    unleveredCashFlows,
    leveredIRR,
    unleveredIRR,
    npv: calculateNPV(settings.discountRate, leveredCashFlows),
    equityMultiple: calculateEquityMultiple(
      isFiniteNumber(totalCashFlow) && isFiniteNumber(netSaleProceeds)
        ? totalCashFlow + netSaleProceeds
        : null,
      equityInvested,
    ),
    payback: calculatePaybackPeriod(equityInvested, annualCashFlows.filter(isFiniteNumber)),
    totalCashFlow,
    totalProfit,
    minDSCR: dscrValues.length > 0 ? Math.min(...dscrValues) : null,
  };
}
