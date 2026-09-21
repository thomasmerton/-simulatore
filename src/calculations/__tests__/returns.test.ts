import { describe, expect, it } from 'vitest';
import {
  calculateCashOnCash,
  calculateEquityMultiple,
  calculateGrossYield,
  calculateIRR,
  calculateNPV,
  calculateNetYield,
  calculatePaybackPeriod,
} from '../returns';
import { calculateBreakEvenOccupancy, calculateLTV, calculateOccupancyHeadroom } from '../risk';
import { calculateCapitalGainsTax, calculateIncomeTax } from '../tax';

describe('calculateNPV', () => {
  it('requires a discount rate rather than assuming one', () => {
    expect(calculateNPV(null, [-100, 110])).toBeNull();
  });

  it('is zero at the IRR', () => {
    const flows = [-100, 60, 60];
    const rate = calculateIRR(flows).value as number;
    expect(calculateNPV(rate, flows)).toBeCloseTo(0, 8);
  });
});

describe('calculateIRR', () => {
  it('flags a series with several sign changes as ambiguous', () => {
    expect(calculateIRR([-100, 300, -250]).ambiguous).toBe(true);
    expect(calculateIRR([-100, 50, 80]).ambiguous).toBe(false);
  });
});

describe('calculateEquityMultiple', () => {
  it('divides total cash back by cash in', () => {
    expect(calculateEquityMultiple(150_000, 100_000)).toBeCloseTo(1.5, 10);
  });

  it('is 1.0 when the investor merely gets their money back', () => {
    expect(calculateEquityMultiple(100_000, 100_000)).toBeCloseTo(1, 10);
  });

  it('is undefined without capital at risk', () => {
    expect(calculateEquityMultiple(150_000, 0)).toBeNull();
    expect(calculateEquityMultiple(150_000, null)).toBeNull();
  });
});

describe('calculateCashOnCash', () => {
  it('is annual cash flow over cash invested', () => {
    expect(calculateCashOnCash(5_000, 100_000)).toBeCloseTo(0.05, 10);
  });

  it('can be negative', () => {
    expect(calculateCashOnCash(-2_000, 100_000)).toBeCloseTo(-0.02, 10);
  });
});

describe('calculatePaybackPeriod', () => {
  it('interpolates within the year the threshold is crossed', () => {
    // 100 invested, 40/yr: repaid halfway through year 3 -> 2.5 years.
    const r = calculatePaybackPeriod(100, [40, 40, 40, 40]);
    expect(r.years).toBeCloseTo(2.5, 10);
    expect(r.beyondHorizon).toBe(false);
  });

  it('returns exactly n when repayment lands on a year end', () => {
    expect(calculatePaybackPeriod(100, [50, 50]).years).toBeCloseTo(2, 10);
  });

  it('reports that capital is not repaid within the horizon', () => {
    const r = calculatePaybackPeriod(100, [10, 10, 10]);
    expect(r.years).toBeNull();
    expect(r.beyondHorizon).toBe(true);
  });

  it('copes with negative early cash flows', () => {
    const r = calculatePaybackPeriod(100, [-20, 60, 60, 60]);
    expect(r.years).not.toBeNull();
    expect(r.years as number).toBeGreaterThan(2);
  });
});

describe('yields', () => {
  it('computes gross and net yield against the given denominator', () => {
    expect(calculateGrossYield(12_000, 200_000)).toBeCloseTo(0.06, 10);
    expect(calculateNetYield(10_800, 220_000)).toBeCloseTo(0.0490909, 6);
  });

  it('is undefined when the denominator is missing', () => {
    expect(calculateGrossYield(12_000, null)).toBeNull();
    expect(calculateNetYield(10_800, 0)).toBeNull();
  });
});

describe('calculateBreakEvenOccupancy', () => {
  it('is costs over potential rent when there is no management fee', () => {
    const r = calculateBreakEvenOccupancy({
      grossScheduledRevenue: 12_000,
      fixedOperatingExpenses: 1_200,
      managementFeeRate: 0,
    });
    expect(r).toBeCloseTo(0.1, 10);
  });

  it('nets the management fee off revenue rather than adding it to costs', () => {
    const r = calculateBreakEvenOccupancy({
      grossScheduledRevenue: 12_000,
      fixedOperatingExpenses: 1_200,
      managementFeeRate: 0.1,
    });
    // 1,200 / (12,000 x 0.9) = 0.1111...
    expect(r).toBeCloseTo(1_200 / 10_800, 10);
  });

  it('includes the capex reserve and debt service', () => {
    const r = calculateBreakEvenOccupancy({
      grossScheduledRevenue: 12_000,
      fixedOperatingExpenses: 1_200,
      managementFeeRate: 0,
      capexReserve: 600,
      debtService: 6_000,
    });
    expect(r).toBeCloseTo(7_800 / 12_000, 10);
  });

  it('reports a break-even above 100% rather than clamping it', () => {
    const r = calculateBreakEvenOccupancy({
      grossScheduledRevenue: 12_000,
      fixedOperatingExpenses: 4_000,
      managementFeeRate: 0,
      debtService: 12_000,
    });
    expect(r as number).toBeGreaterThan(1);
  });

  it('is undefined without potential rent', () => {
    expect(
      calculateBreakEvenOccupancy({
        grossScheduledRevenue: null,
        fixedOperatingExpenses: 1_200,
        managementFeeRate: 0,
      }),
    ).toBeNull();
  });
});

describe('occupancy headroom and LTV', () => {
  it('measures slack against the break-even point', () => {
    expect(calculateOccupancyHeadroom(0.95, 0.7)).toBeCloseTo(0.25, 10);
    expect(calculateOccupancyHeadroom(0.6, 0.7)).toBeCloseTo(-0.1, 10);
  });

  it('computes LTV and refuses a zero value', () => {
    expect(calculateLTV(140_000, 200_000)).toBeCloseTo(0.7, 10);
    expect(calculateLTV(140_000, 0)).toBeNull();
  });
});

describe('calculateIncomeTax', () => {
  it('is zero in NONE mode', () => {
    expect(
      calculateIncomeTax({ mode: 'NONE', rate: 0.21, interestDeductible: false }, 12_000, 10_800, 0)
        .tax,
    ).toBe(0);
  });

  it('taxes collected rent in FLAT_ON_GROSS mode', () => {
    const r = calculateIncomeTax(
      { mode: 'FLAT_ON_GROSS', rate: 0.21, interestDeductible: false },
      11_000,
      9_800,
      4_000,
    );
    expect(r.taxableBase).toBe(11_000);
    expect(r.tax).toBeCloseTo(2_310, 6);
  });

  it('taxes NOI in FLAT_ON_NET mode, optionally after interest', () => {
    const withoutDeduction = calculateIncomeTax(
      { mode: 'FLAT_ON_NET', rate: 0.25, interestDeductible: false },
      11_000,
      9_800,
      4_000,
    );
    expect(withoutDeduction.tax).toBeCloseTo(2_450, 6);

    const withDeduction = calculateIncomeTax(
      { mode: 'FLAT_ON_NET', rate: 0.25, interestDeductible: true },
      11_000,
      9_800,
      4_000,
    );
    expect(withDeduction.taxableBase).toBeCloseTo(5_800, 6);
    expect(withDeduction.tax).toBeCloseTo(1_450, 6);
  });

  it('does not tax a negative base', () => {
    const r = calculateIncomeTax(
      { mode: 'FLAT_ON_NET', rate: 0.25, interestDeductible: true },
      11_000,
      3_000,
      9_000,
    );
    expect(r.taxableBase).toBe(0);
    expect(r.tax).toBe(0);
  });
});

describe('calculateCapitalGainsTax', () => {
  it('taxes a gain measured against the full cost basis', () => {
    const r = calculateCapitalGainsTax(260_000, 220_000, 0.26, 3, 5);
    expect(r.gain).toBeCloseTo(40_000, 6);
    expect(r.tax).toBeCloseTo(10_400, 6);
    expect(r.exempt).toBe(false);
  });

  it('exempts the gain once the holding period is met', () => {
    const r = calculateCapitalGainsTax(260_000, 220_000, 0.26, 5, 5);
    expect(r.exempt).toBe(true);
    expect(r.tax).toBe(0);
  });

  it('never exempts when no exemption period is configured', () => {
    const r = calculateCapitalGainsTax(260_000, 220_000, 0.26, 30, null);
    expect(r.exempt).toBe(false);
    expect(r.tax).toBeCloseTo(10_400, 6);
  });

  it('does not tax a loss', () => {
    const r = calculateCapitalGainsTax(180_000, 220_000, 0.26, 3, 5);
    expect(r.gain).toBeCloseTo(-40_000, 6);
    expect(r.tax).toBe(0);
  });
});
