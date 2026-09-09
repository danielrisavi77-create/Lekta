import { afterEach, expect, test, vi } from 'vitest';
import { withViewTransition } from '../src/shared/view-transition';

const originalTransition = Object.getOwnPropertyDescriptor(document, 'startViewTransition');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalTransition) Object.defineProperty(document, 'startViewTransition', originalTransition);
  else Reflect.deleteProperty(document, 'startViewTransition');
  document.documentElement.classList.remove('vt-local');
});

function nativeTransition() {
  let update!: () => void;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const skipTransition = vi.fn(() => { setTimeout(() => { update(); finish(); }, 0); });
  const start = vi.fn((callback: () => void) => {
    update = callback;
    return { ready: Promise.resolve(), finished, skipTransition };
  });
  vi.stubGlobal('document', Object.assign(document, { startViewTransition: start }));
  return { start, skipTransition, update: () => update(), finish };
}

test('a stalled native snapshot cannot hold the state change for seconds', async () => {
  vi.useFakeTimers();
  const native = nativeTransition();
  const mutate = vi.fn();
  withViewTransition(mutate);
  await vi.advanceTimersByTimeAsync(499);
  expect(mutate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(native.skipTransition).toHaveBeenCalledOnce();
  expect(mutate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(mutate).toHaveBeenCalledOnce();
  native.update();
  expect(mutate).toHaveBeenCalledOnce();
  expect(document.documentElement.classList.contains('vt-local')).toBe(false);
});

test('a prompt callback preserves the native animation', async () => {
  vi.useFakeTimers();
  const native = nativeTransition();
  const mutate = vi.fn();
  withViewTransition(mutate);
  native.update();
  await vi.advanceTimersByTimeAsync(1000);
  expect(mutate).toHaveBeenCalledOnce();
  expect(native.skipTransition).not.toHaveBeenCalled();
  native.finish();
});

test('completion of an older transition does not remove the current animation scope', async () => {
  vi.useFakeTimers();
  const older = nativeTransition();
  withViewTransition(vi.fn());
  older.update();
  const newer = nativeTransition();
  withViewTransition(vi.fn());
  newer.update();
  older.finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(document.documentElement.classList.contains('vt-local')).toBe(true);
  newer.finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(document.documentElement.classList.contains('vt-local')).toBe(false);
});

test('a synchronous native failure falls back to the state change', () => {
  const native = nativeTransition();
  native.start.mockImplementation(() => { throw new Error('unavailable'); });
  const mutate = vi.fn();
  withViewTransition(mutate);
  expect(mutate).toHaveBeenCalledOnce();
  expect(document.documentElement.classList.contains('vt-local')).toBe(false);
});

test('reduced motion updates immediately without starting an animation', () => {
  const native = nativeTransition();
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  const mutate = vi.fn();
  withViewTransition(mutate);
  expect(mutate).toHaveBeenCalledOnce();
  expect(native.start).not.toHaveBeenCalled();
});

test('a browser without the API updates immediately', () => {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  const mutate = vi.fn();
  withViewTransition(mutate);
  expect(mutate).toHaveBeenCalledOnce();
});
