// Stripe kljuc ostaje u aplikaciji. Lekta cron prenosi samo dedicirani worker token.
export async function dispatchRefundReconciliation(appUrl: string, workerToken: string, fetchImpl: typeof fetch = fetch) {
  try {
    const response = await fetchImpl(`${appUrl.replace(/\/$/, '')}/api/internal/refund-reconciliation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-katedra-agent-worker-token': workerToken },
      body: '{}', signal: AbortSignal.timeout(95_000),
    });
    if (!response.ok) return { ok: false as const };
    const result = await response.json();
    if (!result || !['checked', 'succeeded', 'pending', 'deferred'].every(key => Number.isInteger(result[key]) && result[key] >= 0 && result[key] <= 25)
      || result.checked !== result.succeeded + result.pending) return { ok: false as const };
    return { ok: true as const, checked: result.checked as number, succeeded: result.succeeded as number, pending: result.pending as number, deferred: result.deferred as number };
  } catch { return { ok: false as const }; }
}
