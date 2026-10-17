import { describe, expect, it, vi } from 'vitest';
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

  it('veže kasnu grešku operacije i kad je signal već prekinut', async () => {
    const controller = new AbortController();
    controller.abort();
    let rejectOperation!: (reason: Error) => void;
    const operation = new Promise<string>((_, reject) => { rejectOperation = reject; });
    const thenSpy = vi.spyOn(operation, 'then');

    const result = awaitAbortable(operation, controller.signal);
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(thenSpy).toHaveBeenCalledOnce();
    expect(thenSpy.mock.calls[0]?.[1]).toEqual(expect.any(Function));
    rejectOperation(new Error('kasni neuspjeh'));
    await Promise.resolve();
    thenSpy.mockRestore();
  });
});
