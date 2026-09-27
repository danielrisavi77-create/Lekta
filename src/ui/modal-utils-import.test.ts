import { afterEach, describe, expect, it, vi } from 'vitest';

describe('modal-utils import u Node procesu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('ne zahtijeva document dok se modul samo ucitava', async () => {
    vi.stubGlobal('document', undefined);
    vi.resetModules();

    await expect(import('./modal-utils')).resolves.toHaveProperty('trapModal');
  });
});
