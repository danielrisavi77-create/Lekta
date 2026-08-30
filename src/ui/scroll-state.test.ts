import { describe, expect, it } from 'vitest';
import { progressPercent, scrollRange } from './scroll-state';

describe('scroll-state', () => {
  it('calculates the available document scroll range', () => {
    expect(scrollRange(2400, 1000)).toBe(1400);
    expect(scrollRange(800, 1000)).toBe(0);
  });

  it('clamps progress to the visible range', () => {
    expect(progressPercent(700, 1400)).toBe(50);
    expect(progressPercent(-10, 1400)).toBe(0);
    expect(progressPercent(1600, 1400)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });
});
