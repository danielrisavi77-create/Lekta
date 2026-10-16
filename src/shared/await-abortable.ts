/** Wait for an operation, but stop waiting as soon as its owner aborts. */
export function awaitAbortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
  });
}
