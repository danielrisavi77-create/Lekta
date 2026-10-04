/**
 * Povratak prijave Googleom (T102): ciste funkcije bez ovisnosti nad URL-om i zapisom verifiera.
 *
 * Odvojeno od google-oauth.ts jer ih ruta /rad/ treba SINKRONO, prije `openWorkspace`: povratni URL
 * se cisti i fragment radne povrsine (`#session=...`) vraca prije nego ga ruta procita (Codex R2
 * na #307). Staticki uvoz ovog modula ne povlaci session.ts ni OAuth tok u glavni bundle.
 */

/** Verifier stariji od ovoga ne vrijedi: povratak s Googlea traje sekunde, ne sate. */
export const PKCE_MAX_AGE_MS = 10 * 60_000;

export interface PendingPkce {
  verifier: string;
  createdAt: number;
  /** Fragment stranice u trenutku pokretanja (npr. `#session=...`); `redirect_to` ga ne nosi. */
  returnHash?: string;
}

/**
 * Jednokratna pohrana verifiera (ruta: safeStorageGet/Set; testovi: memorija). `save` smije vratiti
 * `false` kad pohrana nije trajna; tada se prijava ne pokrece, jer bi se verifier izgubio s navigacijom.
 */
export interface PkceStore {
  load(): PendingPkce | null;
  save(value: PendingPkce | null): boolean | void;
}

/** Najveci fragment koji se pamti za povratak; dulji se odbacuje umjesto da napuni pohranu. */
export const MAX_RETURN_HASH = 4096;

/** Valjan zapis verifiera ili null; nepoznat oblik je kao da zapisa nema (fail-closed). */
export function readPending(store: PkceStore): PendingPkce | null {
  const p = store.load();
  if (!p || typeof p.verifier !== 'string' || !p.verifier || typeof p.createdAt !== 'number') return null;
  return p;
}

/** Je li zapis istekao (ili ima nemoguce vrijeme iz buducnosti). */
function pendingExpired(p: PendingPkce, now: number): boolean {
  return !(now - p.createdAt >= 0 && now - p.createdAt <= PKCE_MAX_AGE_MS);
}

/** Pocisti istekli verifier kad korisnik nije dovrsio prijavu (Codex R7 na #307). */
export function clearExpiredPkce(store: PkceStore, now: number): void {
  const p = readPending(store);
  if (p && pendingExpired(p, now)) store.save(null);
}

/**
 * Parametri povratka: `code`/`error` iz query stringa, ili `error` iz fragmenta (GoTrue gresku
 * providera ponekad vraca u `#error=...`, Codex R5 na #307). `null` = URL nije povratak.
 */
export function callbackFrom(search: string, hash: string): { code: string | null; error: string | null; errorInHash: boolean } | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const code = q.get('code');
  const error = q.get('error');
  if (code || error) return { code, error, errorInHash: false };
  const h = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const hashError = h.get('error');
  return hashError ? { code: null, error: hashError, errorInHash: true } : null;
}

/**
 * Ukloni parametre povratka iz query stringa i gresku iz fragmenta, da se povratak ne obradi dvaput.
 * `restoreHash` (fragment iz trenutka pokretanja) vraca se kad trenutni fragment nije koristan:
 * prazan je ili nosi samo gresku providera (Codex R2 i R5 na #307).
 */
export function cleanedCallbackUrl(href: string, restoreHash?: string): string {
  const url = new URL(href);
  for (const k of ['code', 'error', 'error_code', 'error_description', 'state']) url.searchParams.delete(k);
  const hashIsError = new URLSearchParams(url.hash.slice(1)).has('error');
  const keep = url.hash && !hashIsError ? url.hash : '';
  const restore = typeof restoreHash === 'string' && restoreHash.startsWith('#') ? restoreHash : '';
  return url.pathname + url.search + (keep || restore);
}
