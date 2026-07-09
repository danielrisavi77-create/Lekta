/**
 * Klijentski poziv redeem-referral-signup Edge Functiona (pozovi-prijatelja, 0013).
 *
 * Cista funkcija uz injektabilan `fetch` (testabilno, isti kroj kao waitlist/report klijent).
 * Referral NIJE kriticni put: na svaku gresku tiho odustane, ne blokira korisnika. Endpoint,
 * token i kod dolaze iz app.ts (kod se cuva u safeStorage, ne u ovom modulu). Salje samo
 * Authorization (korisnikov JWT), isto kao guarantee/checkout pozivi u app.ts.
 */
export async function postReferralRedeem(
  endpoint: string,
  accessToken: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean }> {
  if (!endpoint || !accessToken || !code) return { ok: false };
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ code }),
    });
    return { ok: res.status >= 200 && res.status < 300 };
  } catch {
    return { ok: false };
  }
}
