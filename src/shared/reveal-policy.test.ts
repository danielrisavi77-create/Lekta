import { describe, expect, it } from 'vitest';
import { shouldDeferReveal } from './reveal-policy';

describe('reveal policy', () => {
  it('keeps ordinary content visible immediately', () => {
    const element = document.createElement('div');

    expect(shouldDeferReveal(element)).toBe(false);
  });

  it('defers only explicitly opted-in decorative content', () => {
    const element = document.createElement('div');
    element.dataset.revealMode = 'deferred';

    expect(shouldDeferReveal(element)).toBe(true);
  });
});
