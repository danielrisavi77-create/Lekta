import { describe, expect, it, vi } from 'vitest';
import { createAnimationRegistry } from './animation-registry';

describe('animation registry', () => {
  it('stops tracked animations when a new render replaces the old one', () => {
    const registry = createAnimationRegistry();
    const first = { stop: vi.fn() };
    const second = { stop: vi.fn() };

    registry.track(first);
    registry.track(second);
    registry.stopAll();

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(registry.size()).toBe(0);
  });

  it('falls back to cancel when a control does not expose stop', () => {
    const registry = createAnimationRegistry();
    const control = { cancel: vi.fn() };

    registry.track(control);
    registry.stopAll();

    expect(control.cancel).toHaveBeenCalledOnce();
  });
});
