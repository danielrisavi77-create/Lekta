import { describe, expect, it } from 'vitest';
import { createAuthCompletion } from '../src/auth/auth-completion';

describe('createAuthCompletion', () => {
  it('dovrši čekanje tek nakon uspješnog callbacka', async () => {
    const completion = createAuthCompletion();
    let finishAction!: () => void;
    const result = completion.wait(() => new Promise<void>((resolve) => { finishAction = resolve; }));
    completion.complete();

    await Promise.resolve();
    finishAction();
    await expect(result).resolves.toBe(true);
  });

  it('otkazivanje prijave razriješi čekača kao neuspjeh', async () => {
    const completion = createAuthCompletion();
    const result = completion.wait();
    completion.cancel();

    await expect(result).resolves.toBe(false);
  });
});
