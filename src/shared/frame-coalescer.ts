export type RequestFrame = (callback: FrameRequestCallback) => number;
export type CancelFrame = (handle: number) => void;

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(() => callback(performance.now()), 16) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(handle);
    return;
  }
  globalThis.clearTimeout(handle);
}

export interface FrameCoalescer<T> {
  schedule(value: T): void;
  cancel(): void;
}

export function createFrameCoalescer<T>(
  apply: (value: T) => void,
  scheduleFrame: RequestFrame = requestFrame,
  cancelScheduledFrame: CancelFrame = cancelFrame,
): FrameCoalescer<T> {
  let pending = false;
  let handle: number | null = null;
  let latest: T;

  const schedule = (value: T): void => {
    latest = value;
    if (pending) return;
    pending = true;
    handle = scheduleFrame(() => {
      if (!pending) return;
      pending = false;
      handle = null;
      apply(latest);
    });
  };

  const cancel = (): void => {
    if (!pending) return;
    pending = false;
    if (handle !== null) cancelScheduledFrame(handle);
    handle = null;
  };

  return { schedule, cancel };
}
