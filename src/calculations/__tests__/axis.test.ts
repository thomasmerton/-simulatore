import { describe, expect, it } from 'vitest';
import { niceBound } from '@/ui/charts/charts';

describe('niceBound', () => {
  it('rounds an upper bound outward to a nice increment', () => {
    expect(niceBound(0.134, 'up')).toBeCloseTo(0.2, 10);
    expect(niceBound(0.03, 'up')).toBeCloseTo(0.05, 10);
    expect(niceBound(1.1, 'up')).toBeCloseTo(2, 10);
  });

  it('rounds a lower bound outward to a nice increment', () => {
    expect(niceBound(-0.403, 'down')).toBeCloseTo(-0.5, 10);
    expect(niceBound(-0.06, 'down')).toBeCloseTo(-0.1, 10);
  });

  it('never rounds inward past the data', () => {
    for (const v of [0.001, 0.049, 0.5, 3.7, 99]) {
      expect(niceBound(v, 'up')).toBeGreaterThanOrEqual(v);
    }
    for (const v of [-0.001, -0.049, -0.5, -3.7, -99]) {
      expect(niceBound(v, 'down')).toBeLessThanOrEqual(v);
    }
  });

  it('handles zero and non-finite input without producing NaN', () => {
    expect(niceBound(0, 'up')).toBe(0);
    expect(niceBound(NaN, 'up')).toBe(0);
    expect(niceBound(Infinity, 'down')).toBe(0);
  });
});
