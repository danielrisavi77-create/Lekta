import { afterEach, expect, it, vi } from 'vitest';
import { montirajDokumentStola } from '../src/ui/results/desk-document';
const mocks = vi.hoisted(() => ({ stranice: vi.fn() }));
vi.mock('../src/ui/facsimile-live/stol-stranice', () => ({ montirajStranice: mocks.stranice }));
afterEach(() => vi.clearAllMocks());
const opcije = { preview: null, storedPages: null, items: [], flags: [], esc: (v: string) => v };
it('dispose during lazy import prevents page DOM writes', async () => {
  const host = document.createElement('div');
  host.textContent = 'preserved';
  const controller = new AbortController();
  mocks.stranice.mockImplementation(() => ({ flagTargets: new Map() }));
  const pending = montirajDokumentStola(host, opcije, controller.signal);
  controller.abort();
  expect(await pending).toBeNull();
  expect(host.textContent).toBe('preserved');
  expect(mocks.stranice).not.toHaveBeenCalled();
});
it('mounted pane is the Z35 page module, not the old Z9 renderer', async () => {
  const host = document.createElement('div');
  const mete = new Map([[0, document.createElement('p')]]);
  mocks.stranice.mockReturnValue({ flagTargets: mete });
  const result = await montirajDokumentStola(host, opcije);
  expect(mocks.stranice).toHaveBeenCalledWith(host, opcije);
  expect(result?.flagTargets).toBe(mete);
});
