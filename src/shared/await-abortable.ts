/** Wait for an operation, but stop waiting as soon as its owner aborts. */
export function awaitAbortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const finish = <TValue>(complete: (value: TValue) => void, value: TValue) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete(value);
    };
    const onAbort = () => {
      finish(reject, new DOMException('The operation was aborted', 'AbortError'));
    };

    operation.then(
      (value) => finish(resolve, value),
      (error: unknown) => finish(reject, error),
    );
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}
