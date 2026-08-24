/**
 * Klijent za rules-on-demand isporuku pravila JEDNOG profila (profile-rules Edge
 * funkcija, faza B plana zastite baze pravila).
 *
 * Zahtjev nosi ISKLJUCIVO identifikator profila koji je korisnik odabrao; nikad
 * dokument, tekst ni rezultate analize. Poziva se PRIJE analize (updateProfile,
 * speculative, runAnalysis), pa ostaje izvan mjernog prozora network-proofa.
 *
 * Ciste funkcije uz injektabilan fetch (testabilno bez mreze), kroj kao
 * source-check-client. Nikad ne baca: mrezna greska je legitimno stanje koje UI
 * rjesava POSTENOM degradacijom na opcu provjeru, ne exceptionom.
 */

import type { ProfileRulesResponseV1 } from '../profiles/profile-rules-contract';

export interface ProfileRulesConfig {
  /** URL profile-rules Edge funkcije; prazno znaci nije konfigurirano. */
  endpoint: string;
}

export type ProfileRulesOutcome =
  | { kind: 'ok'; record: ProfileRulesResponseV1 }
  | { kind: 'not_found' }
  | { kind: 'rate_limited'; reason?: 'user' | 'ip' }
  /** Isporuka nije dostupna (offline, 5xx, timeout, kill switch, los oblik).
   *  UI to cita kao "degradiraj na opcu provjeru", NIKAD kao tiho bodovanje. */
  | { kind: 'unavailable'; reason: string };

const DEFAULT_TIMEOUT_MS = 10_000;

function looksLikeRecord(data: unknown, profileId: string): data is ProfileRulesResponseV1 {
  const d = data as ProfileRulesResponseV1 | null;
  return !!d && d.v === 1 && d.profileId === profileId
    && !!d.profile && typeof d.profile === 'object'
    && Array.isArray(d.repairEntries) && typeof d.datasetVersion === 'string';
}

/** Dohvati pravila jednog profila. Bearer se salje SAMO ako sesija vec postoji. */
export async function fetchProfileRules(
  config: ProfileRulesConfig,
  profileId: string,
  accessToken: string | null,
  fetchImpl: typeof fetch = fetch,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ProfileRulesOutcome> {
  if (!config.endpoint) return { kind: 'unavailable', reason: 'nije konfigurirano' };
  if (!profileId) return { kind: 'unavailable', reason: 'prazan profileId' };

  // Timeout preko AbortControllera (obrazac link-check-client): endpoint je na kriticnom
  // putu besplatne analize pa viseci zahtjev ne smije drzati korisnika u neizvjesnosti.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onOuterAbort);

  let res: Response;
  try {
    const url = `${config.endpoint}?v=1&profileId=${encodeURIComponent(profileId)}`;
    res = await fetchImpl(url, {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal: controller.signal,
    });
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.message : 'mrezna greska' };
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onOuterAbort);
  }

  if (res.status === 200) {
    const data = await res.json().catch(() => null);
    return looksLikeRecord(data, profileId)
      ? { kind: 'ok', record: data }
      : { kind: 'unavailable', reason: 'neocekivan oblik odgovora' };
  }
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 429) {
    const data = (await res.json().catch(() => ({}))) as { reason?: string };
    const reason = data.reason === 'user' || data.reason === 'ip' ? data.reason : undefined;
    return { kind: 'rate_limited', reason };
  }
  return { kind: 'unavailable', reason: `odgovor ${res.status}` };
}

/**
 * Dohvat s JEDNIM automatskim ponovnim pokusajem nakon 2 s, i to samo za
 * 'unavailable' (prolazni mrezni kvar). 404/429 se NE ponavljaju: odgovor je
 * definitivan, a retry na 429 bi trosio jos slotova. Vise od jednog retryja
 * nema (plan: retry sloj se ne gradi vise od ovoga).
 */
export async function fetchProfileRulesWithRetry(
  config: ProfileRulesConfig,
  profileId: string,
  accessToken: string | null,
  fetchImpl: typeof fetch = fetch,
  options?: { signal?: AbortSignal; timeoutMs?: number; retryDelayMs?: number; delayImpl?: (ms: number) => Promise<void> },
): Promise<ProfileRulesOutcome> {
  const first = await fetchProfileRules(config, profileId, accessToken, fetchImpl, options);
  if (first.kind !== 'unavailable' || options?.signal?.aborted) return first;
  const delay = options?.delayImpl ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  await delay(options?.retryDelayMs ?? 2000);
  if (options?.signal?.aborted) return first;
  return fetchProfileRules(config, profileId, accessToken, fetchImpl, options);
}
