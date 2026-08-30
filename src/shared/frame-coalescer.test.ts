import { describe, expect, it } from 'vitest';
import { createFrameCoalescer } from './frame-coalescer';

describe('createFrameCoalescer', () => {
  it('applies only the latest value once per animation frame', () => {
    let frame: FrameRequestCallback | null = null;
    const applied: number[] = [];
    const coalescer = createFrameCoalescer<number>(
      (value) => applied.push(value),
      (callback) => {
        frame = callback;
        return 1;
      },
      () => {},
    );

    coalescer.schedule(1);
    coalescer.schedule(2);
    coalescer.schedule(3);

    expect(applied).toEqual([]);
    (frame as unknown as FrameRequestCallback)(0);
    expect(applied).toEqual([3]);
  });

  it('cancels a pending frame without applying stale work', () => {
    let frame: FrameRequestCallback | null = null;
    let cancelled = 0;
    const applied: number[] = [];
    const coalescer = createFrameCoalescer<number>(
      (value) => applied.push(value),
      (callback) => {
        frame = callback;
        return 7;
      },
      () => { cancelled += 1; },
    );

    coalescer.schedule(42);
    coalescer.cancel();
    (frame as unknown as FrameRequestCallback)(0);

    expect(cancelled).toBe(1);
    expect(applied).toEqual([]);
  });
});
