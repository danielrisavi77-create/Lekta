import { afterEach, expect, it, vi } from 'vitest';
import { mountFacsimileInto } from '../src/ui/results/desk-document';
const mocks = vi.hoisted(() => ({ render: vi.fn(), zoom: vi.fn() }));
vi.mock('../src/preview/render-facsimile', () => ({ renderFacsimile: mocks.render }));
vi.mock('../src/preview/facsimile-zoom', () => ({ attachFacsimileZoom: mocks.zoom }));
afterEach(() => vi.clearAllMocks());
it('dispose during lazy import prevents renderer DOM writes and zoom attachment', async () => {
  const host = document.createElement('div');
  host.textContent = 'preserved';
  const controller = new AbortController();
  mocks.render.mockImplementation(() => ({ root: document.createElement('article'), flagTargets: new Map() }));
  const pending = mountFacsimileInto(host, {} as never, [] as never, controller.signal);
  controller.abort();
  expect(await pending).toBeNull();
  expect(host.textContent).toBe('preserved');
  expect(mocks.render).not.toHaveBeenCalled();
  expect(mocks.zoom).not.toHaveBeenCalled();
});
it('disposing a mounted document destroys zoom listeners exactly once', async () => {
  const destroy = vi.fn();
  mocks.render.mockReturnValue({ root: document.createElement('article'), flagTargets: new Map() });
  mocks.zoom.mockReturnValue({ destroy, remeasure: vi.fn(), fitWidth: vi.fn() });
  const result = await mountFacsimileInto(document.createElement('div'), {} as never, [] as never);
  result?.dispose?.();
  result?.dispose?.();
  expect(destroy).toHaveBeenCalledTimes(1);
});
