/**
 * Mortgage modelling.
 *
 * Amortisation is French (level instalment, "rata costante"), computed
 * monthly and aggregated to annual figures, because interest accrues monthly
 * and an annual approximation understates total interest.
 *
 * Rates are supplied as a per-year path rather than a single number. This lets
 * a VARIABLE-rate loan be re-priced part-way through the term: at the start of
 * each year the instalment is recomputed on the outstanding balance over the
 * remaining term at the new rate — which is how an indexed mortgage behaves.
 * A FIXED-rate loan is simply a path of identical rates, so a rate shock in a
 * scenario correctly leaves it untouched.
 */

import type { FinancingAssumptions } from '@/domain/types';
import { MONTHS_PER_YEAR, divide, isFiniteNumber, payment } from './finance';

export interface DebtYear {
  year: number;
  openingBalance: number;
  /** Instalment in force during this year, per month. */
  monthlyPayment: number;
  interestPaid: number;
  principalPaid: number;
  /** Interest + principal for the year. */
  debtService: number;
  closingBalance: number;
  rate: number;
}

export interface LoanTerms {
  loanAmount: number;
  /** Amortisation period: the schedule over which principal is repaid. */
  termYears: number;
  /** Annual nominal rate per year of the term. Length must equal termYears. */
  ratePath: number[];
  /**
   * AMORTIZING    — level instalments repay the principal over the term.
   * INTEREST_ONLY — interest only; the whole principal is outstanding at the
   *                 end and falls due as a balloon.
   */
  amortizationType?: 'AMORTIZING' | 'INTEREST_ONLY';
  /**
   * Maturity, when the loan falls due before it is fully amortised. The
   * schedule stops here and whatever principal remains is a balloon that must
   * be repaid or refinanced. Modelling a 25-year amortisation on a 10-year
   * maturity without this would understate what the borrower owes.
   */
  maturityYears?: number | null;
}

/**
 * Loan amount implied by the financing assumptions.
 * An explicit `loanAmount` overrides LTV. Returns null when financing is off
 * or when neither input is usable.
 */
export function calculateLoanAmount(
  financing: FinancingAssumptions,
  purchasePrice: number | null,
): number | null {
  if (!financing.enabled) return null;
  if (isFiniteNumber(financing.loanAmount)) return Math.max(0, financing.loanAmount);
  if (isFiniteNumber(financing.ltv) && isFiniteNumber(purchasePrice)) {
    return Math.max(0, purchasePrice * financing.ltv);
  }
  return null;
}

/**
 * Monthly instalment for a level-payment loan.
 *   i = annualRate / 12,  n = termYears * 12
 */
export function calculateMortgagePayment(
  loanAmount: number,
  annualRate: number,
  termYears: number,
): number | null {
  return payment(loanAmount, annualRate / MONTHS_PER_YEAR, termYears * MONTHS_PER_YEAR);
}

/**
 * Build the annual debt schedule by simulating month by month.
 *
 * Each month: interest = balance * (rate / 12); principal = instalment -
 * interest. The final instalment is trimmed so the balance lands exactly on
 * zero rather than drifting by rounding.
 */
export function calculateDebtSchedule(terms: LoanTerms): DebtYear[] {
  const { loanAmount, termYears } = terms;
  if (!isFiniteNumber(loanAmount) || loanAmount <= 0 || termYears <= 0) return [];

  const interestOnly = terms.amortizationType === 'INTEREST_ONLY';
  // The schedule runs to maturity when one is set and it comes first.
  const lastYear =
    isFiniteNumber(terms.maturityYears) && terms.maturityYears > 0
      ? Math.min(termYears, Math.round(terms.maturityYears))
      : termYears;

  const schedule: DebtYear[] = [];
  let balance = loanAmount;

  for (let year = 1; year <= lastYear; year++) {
    const rate = terms.ratePath[year - 1] ?? terms.ratePath[terms.ratePath.length - 1] ?? 0;
    const remainingMonths = (termYears - year + 1) * MONTHS_PER_YEAR;
    const monthlyRate = rate / MONTHS_PER_YEAR;
    // Re-price on the outstanding balance over the remaining AMORTISATION
    // term, which is unaffected by an earlier maturity.
    const instalment = interestOnly
      ? balance * monthlyRate
      : (payment(balance, monthlyRate, remainingMonths) ?? 0);

    const openingBalance = balance;
    let interestPaid = 0;
    let principalPaid = 0;

    if (interestOnly) {
      // Interest accrues monthly on an unchanging balance; no principal is
      // repaid, so the full amount is outstanding at maturity.
      interestPaid = balance * monthlyRate * MONTHS_PER_YEAR;
    } else {
      for (let m = 0; m < MONTHS_PER_YEAR && balance > 0; m++) {
        const interest = balance * monthlyRate;
        let principal = instalment - interest;
        if (principal > balance) principal = balance; // final instalment
        interestPaid += interest;
        principalPaid += principal;
        balance -= principal;
        if (balance < 1e-6) balance = 0;
      }
    }

    schedule.push({
      year,
      openingBalance,
      monthlyPayment: instalment,
      interestPaid,
      principalPaid,
      debtService: interestPaid + principalPaid,
      closingBalance: balance,
      rate,
    });
  }

  return schedule;
}

/**
 * Expand financing assumptions into a rate path.
 *
 * `rateShock` is added to the rate only for VARIABLE loans, and only from the
 * shock year onward. A fixed-rate borrower is contractually insulated from a
 * rate rise, and a model that pretends otherwise overstates downside risk.
 */
export function buildRatePath(
  financing: FinancingAssumptions,
  termYears: number,
  rateShock = 0,
  shockFromYear = 1,
): number[] {
  const base = isFiniteNumber(financing.annualRate) ? financing.annualRate : 0;
  const path: number[] = [];
  for (let year = 1; year <= termYears; year++) {
    const applyShock = financing.rateType === 'VARIABLE' && year >= shockFromYear;
    path.push(Math.max(0, base + (applyShock ? rateShock : 0)));
  }
  return path;
}

/**
 * Debt service coverage ratio.
 *   DSCR = NOI / annual debt service (interest + principal)
 *
 * Above 1.0 the property services its own debt from operations. Returns null
 * when there is no debt, since the ratio is then undefined rather than
 * infinite.
 */
export function calculateDSCR(noi: number | null, debtService: number | null): number | null {
  if (!isFiniteNumber(debtService) || debtService === 0) return null;
  return divide(noi, debtService);
}
