import { describe, expect, it } from 'vitest';
import { awaitAbortable } from '../src/shared/await-abortable';

describe('awaitAbortable', () => {
  it('prekine čekanje kad signal odustane, iako operacija još traje', async () => {
    const controller = new AbortController();
    const pending = new Promise<string>(() => {});
    const result = awaitAbortable(pending, controller.signal);

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('vrati rezultat kad operacija završi prije prekida', async () => {
    const controller = new AbortController();
    await expect(awaitAbortable(Promise.resolve('gotovo'), controller.signal)).resolves.toBe('gotovo');
  });
});
