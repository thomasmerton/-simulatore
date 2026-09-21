/**
 * Rental strategy revenue models.
 *
 * Each strategy computes gross scheduled revenue and the revenue-linked costs
 * that only it incurs. The strategies share NOTHING: a short-let occupancy
 * rate is not a long-let one, an ADR is not a monthly rent, and deriving one
 * from the other would be inventing data.
 *
 * A strategy whose own assumptions are incomplete returns null revenue with
 * the missing fields named. It never falls back to another strategy's inputs.
 */

import type { RentalAssumptions, RentalStrategy } from '@/domain/types';
import { DAYS_PER_YEAR, MONTHS_PER_YEAR, compound, isFiniteNumber } from './finance';

export interface StrategyRevenue {
  strategy: RentalStrategy;
  /**
   * Revenue at full occupancy, before voids — the "gross scheduled rent" of
   * a standard underwriting model.
   */
  grossScheduledRevenue: number | null;
  /** Revenue lost to voids / unsold nights / empty rooms. */
  vacancyLoss: number | null;
  /** Collected revenue after voids, before operating costs. */
  effectiveGrossIncome: number | null;
  /** Occupancy actually assumed, 0..1, however the strategy expresses it. */
  occupancy: number | null;
  /**
   * Costs that exist only because of this strategy and scale with its
   * activity — platform commission, per-stay cleaning. Distinct from the
   * property's own operating costs.
   */
  strategyCosts: { key: string; label: string; amount: number }[];
  /** Dotted paths of the inputs this strategy needs but does not have. */
  missingInputs: string[];
}

const empty = (strategy: RentalStrategy, missing: string[]): StrategyRevenue => ({
  strategy,
  grossScheduledRevenue: null,
  vacancyLoss: null,
  effectiveGrossIncome: null,
  occupancy: null,
  strategyCosts: [],
  missingInputs: missing,
});

/** Growth factor applied to revenue in year `year`. */
function growth(rental: RentalAssumptions, year: number): number {
  const rate = isFiniteNumber(rental.rentGrowthRate) ? rental.rentGrowthRate : 0;
  return compound(1, rate, year - 1) ?? 1;
}

/**
 * Share of year 1 during which the property earns nothing (works, fit-out,
 * letting up). Applies to year 1 only, for every strategy.
 */
function activeShare(rental: RentalAssumptions, year: number): number {
  if (year !== 1) return 1;
  if (!isFiniteNumber(rental.stabilizationMonths)) return 1;
  const months = Math.min(MONTHS_PER_YEAR, Math.max(0, rental.stabilizationMonths));
  return (MONTHS_PER_YEAR - months) / MONTHS_PER_YEAR;
}

/**
 * LONG TERM
 *   gross    = monthlyRent x 12 x growth x activeShare
 *   occupancy = (365 - vacancyDays) / 365
 */
function longTerm(rental: RentalAssumptions, year: number): StrategyRevenue {
  const missing: string[] = [];
  if (!isFiniteNumber(rental.monthlyRent)) missing.push('rental.monthlyRent');
  if (!isFiniteNumber(rental.vacancyDaysPerYear)) missing.push('rental.vacancyDaysPerYear');
  if (missing.length > 0) return empty('LONG_TERM', missing);

  const gross =
    (rental.monthlyRent as number) *
    MONTHS_PER_YEAR *
    growth(rental, year) *
    activeShare(rental, year);
  const occupancy = Math.min(
    1,
    Math.max(0, (DAYS_PER_YEAR - (rental.vacancyDaysPerYear as number)) / DAYS_PER_YEAR),
  );
  const vacancyLoss = gross * (1 - occupancy);

  return {
    strategy: 'LONG_TERM',
    grossScheduledRevenue: gross,
    vacancyLoss,
    effectiveGrossIncome: gross - vacancyLoss,
    occupancy,
    strategyCosts: [],
    missingInputs: [],
  };
}

/**
 * SHORT TERM
 *   gross     = ADR x 365 x growth x activeShare        (revenue at 100% occupancy)
 *   occupancy = occupancyRate                            (share of nights sold)
 *   platform  = collected x platformFeeRate
 *   cleaning  = stays x cleaningCostPerStay, where stays = nightsSold / avgStayNights
 *
 * Cleaning is only a cost when it is NOT recovered from the guest. When it is
 * recovered it is neither revenue nor cost here — the ADR is defined net of it.
 */
function shortTerm(rental: RentalAssumptions, year: number): StrategyRevenue {
  const st = rental.shortTerm;
  const missing: string[] = [];
  if (!isFiniteNumber(st.averageDailyRate)) missing.push('rental.shortTerm.averageDailyRate');
  if (!isFiniteNumber(st.occupancyRate)) missing.push('rental.shortTerm.occupancyRate');
  if (!isFiniteNumber(st.platformFeeRate)) missing.push('rental.shortTerm.platformFeeRate');
  if (missing.length > 0) return empty('SHORT_TERM', missing);

  const share = activeShare(rental, year);
  const availableNights = DAYS_PER_YEAR * share;
  const gross = (st.averageDailyRate as number) * availableNights * growth(rental, year);
  const occupancy = Math.min(1, Math.max(0, st.occupancyRate as number));
  const vacancyLoss = gross * (1 - occupancy);
  const collected = gross - vacancyLoss;

  const strategyCosts: StrategyRevenue['strategyCosts'] = [];
  const platformFee = collected * (st.platformFeeRate as number);
  if (platformFee !== 0) {
    strategyCosts.push({ key: 'platformFee', label: 'Platform commission', amount: platformFee });
  }

  // Cleaning needs the average stay length to convert nights into stays.
  // Without it the cost is left out and the gap is reported, rather than
  // guessing a stay length.
  if (
    !st.cleaningRecoveredFromGuest &&
    isFiniteNumber(st.cleaningCostPerStay) &&
    st.cleaningCostPerStay > 0
  ) {
    if (isFiniteNumber(st.averageStayNights) && st.averageStayNights > 0) {
      const nightsSold = availableNights * occupancy;
      const stays = nightsSold / st.averageStayNights;
      strategyCosts.push({
        key: 'cleaning',
        label: 'Cleaning',
        amount: stays * st.cleaningCostPerStay,
      });
    } else {
      return {
        strategy: 'SHORT_TERM',
        grossScheduledRevenue: gross,
        vacancyLoss,
        effectiveGrossIncome: collected,
        occupancy,
        strategyCosts,
        missingInputs: ['rental.shortTerm.averageStayNights'],
      };
    }
  }

  return {
    strategy: 'SHORT_TERM',
    grossScheduledRevenue: gross,
    vacancyLoss,
    effectiveGrossIncome: collected,
    occupancy,
    strategyCosts,
    missingInputs: [],
  };
}

/**
 * STUDENT
 *   gross     = rentPerRoom x rooms x monthsLetPerYear x growth x activeShare
 *   occupancy = roomOccupancyRate (share of rooms filled during the let period)
 *
 * The let period itself is NOT a vacancy: a nine-month academic let is a
 * nine-month product, so the summer is priced out of gross revenue rather
 * than counted as a void. Room occupancy is the void on top of that.
 */
function student(rental: RentalAssumptions, year: number): StrategyRevenue {
  const s = rental.student;
  const missing: string[] = [];
  if (!isFiniteNumber(s.monthlyRentPerRoom)) missing.push('rental.student.monthlyRentPerRoom');
  if (!isFiniteNumber(s.rooms)) missing.push('rental.student.rooms');
  if (!isFiniteNumber(s.monthsLetPerYear)) missing.push('rental.student.monthsLetPerYear');
  if (missing.length > 0) return empty('STUDENT', missing);

  const months = Math.min(MONTHS_PER_YEAR, Math.max(0, s.monthsLetPerYear as number));
  const gross =
    (s.monthlyRentPerRoom as number) *
    (s.rooms as number) *
    months *
    growth(rental, year) *
    activeShare(rental, year);

  const occupancy = isFiniteNumber(s.roomOccupancyRate)
    ? Math.min(1, Math.max(0, s.roomOccupancyRate))
    : 1;
  const vacancyLoss = gross * (1 - occupancy);

  return {
    strategy: 'STUDENT',
    grossScheduledRevenue: gross,
    vacancyLoss,
    effectiveGrossIncome: gross - vacancyLoss,
    occupancy,
    strategyCosts: [],
    missingInputs: [],
  };
}

/**
 * ROOM BY ROOM
 *   gross     = rentPerRoom x rooms x 12 x growth x activeShare
 *   occupancy = roomOccupancyRate
 */
function roomByRoom(rental: RentalAssumptions, year: number): StrategyRevenue {
  const r = rental.roomByRoom;
  const missing: string[] = [];
  if (!isFiniteNumber(r.monthlyRentPerRoom)) missing.push('rental.roomByRoom.monthlyRentPerRoom');
  if (!isFiniteNumber(r.rooms)) missing.push('rental.roomByRoom.rooms');
  if (!isFiniteNumber(r.roomOccupancyRate)) missing.push('rental.roomByRoom.roomOccupancyRate');
  if (missing.length > 0) return empty('ROOM_BY_ROOM', missing);

  const gross =
    (r.monthlyRentPerRoom as number) *
    (r.rooms as number) *
    MONTHS_PER_YEAR *
    growth(rental, year) *
    activeShare(rental, year);
  const occupancy = Math.min(1, Math.max(0, r.roomOccupancyRate as number));
  const vacancyLoss = gross * (1 - occupancy);

  return {
    strategy: 'ROOM_BY_ROOM',
    grossScheduledRevenue: gross,
    vacancyLoss,
    effectiveGrossIncome: gross - vacancyLoss,
    occupancy,
    strategyCosts: [],
    missingInputs: [],
  };
}

/** Revenue for the selected strategy in a given year. */
export function calculateStrategyRevenue(
  rental: RentalAssumptions,
  year: number,
): StrategyRevenue {
  switch (rental.strategy) {
    case 'SHORT_TERM':
      return shortTerm(rental, year);
    case 'STUDENT':
      return student(rental, year);
    case 'ROOM_BY_ROOM':
      return roomByRoom(rental, year);
    case 'LONG_TERM':
    default:
      return longTerm(rental, year);
  }
}

/** The inputs a strategy needs, for the data-quality layer. */
export function strategyMissingInputs(rental: RentalAssumptions): string[] {
  return calculateStrategyRevenue(rental, 1).missingInputs;
}
