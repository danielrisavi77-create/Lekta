export function createAuthCompletion() {
  let resolve: ((signedIn: boolean) => void) | null = null;
  let afterSignIn: (() => unknown) | null = null;
  const finish = (signedIn: boolean) => {
    const complete = resolve;
    resolve = null;
    complete?.(signedIn);
  };

  return {
    wait(action?: () => unknown) {
      finish(false);
      afterSignIn = action ?? null;
      return new Promise<boolean>((done) => { resolve = done; });
    },
    cancel() { afterSignIn = null; finish(false); },
    complete() {
      const complete = resolve;
      const action = afterSignIn;
      resolve = null;
      afterSignIn = null;
      if (!complete) return;
      if (!action) { complete(true); return; }
      void Promise.resolve().then(action).then(() => complete(true), () => complete(false));
    },
  };
}
