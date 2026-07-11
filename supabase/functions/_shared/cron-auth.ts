// supabase/functions/_shared/cron-auth.ts
//
// Dijeljena autorizacija za cron-okidane Edge funkcije (npr. send-reminders).
// Poziv se ocekuje s zaglavljem `Authorization: Bearer <REMINDER_CRON_SECRET>`,
// gdje je tajna DEDICIRANA cron tajna, NIKAD service role kljuc.
//
// Dizajn:
//   - fail-closed: ako tajna nije postavljena (prazna), NIJEDAN zahtjev nije
//     autoriziran. Funkcija tako radije stane (podsjetnici se ne salju) nego da
//     ostane javno okidljiva. Vidi docs/audit/SECURITY_AUDIT.md (security-01).
//   - konstantno-vremenska usporedba tokena da se izbjegne timing napad.
//
// Modul je izomorfan (samo Web standard: TextEncoder, Headers) pa se moze
// jedinicno testirati u vitestu (Node/happy-dom), ne samo u Denu.

/** Izvuci goli token iz `Authorization: Bearer <token>`. Vraca null ako fali. */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

/**
 * Konstantno-vremenska usporedba dvaju stringova. Petlja uvijek ide preko duljeg
 * niza pa razlicita duljina ne uzrokuje rano vracanje (i sama razlika u duljini
 * ulazi u rezultat).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Minimalni oblik zahtjeva koji nam treba (Request ga zadovoljava). */
export interface RequestLike {
  headers: { get(name: string): string | null };
}

/**
 * Je li zahtjev autoriziran za cron okidanje. True samo ako je tajna postavljena
 * I ako `Authorization: Bearer` token tocno (konstantno-vremenski) odgovara tajni.
 */
export function isCronAuthorized(req: RequestLike, secret: string | null | undefined): boolean {
  if (!secret) return false; // fail-closed: bez tajne nista nije autorizirano
  const token = extractBearerToken(req.headers.get('Authorization'));
  if (!token) return false;
  return timingSafeEqual(token, secret);
}
