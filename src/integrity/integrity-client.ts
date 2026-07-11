/**
 * Klijentska strana cloud integritetske provjere (Faza 4). Salje tekst rada + privolu Edge
 * Functionu koji serverski odlucuje (entitlement gate, rate limit) i vraca rezultat. Klijent
 * NIKAD ne odlucuje o pravu pristupa; INERTNO je dok endpoint nije konfiguriran (kao report-client).
 *
 * KLJUCNO (privatnost): buildIntegrityRequest ukljucuje tekst SAMO uz privolu. 'teaser' je
 * ograniceni besplatni cross-lingual signal (uz privolu), 'full' je puni izvjestaj iza Thesis Passa.
 */
import type { IntegrityConsent } from './integrity-consent';

export interface IntegrityConfig {
  /** URL integrity-check Edge Functiona; prazno = nije konfigurirano (inertno). */
  endpoint: string;
}

/** Opseg naplate: teaser = ograniceni besplatni signal; full = puni izvjestaj iza Passa. */
export type IntegrityMode = 'teaser' | 'full';

export interface IntegrityRequest {
  text: string;
  lang: string;
  workType: string;
  mode: IntegrityMode;
  consent: IntegrityConsent;
}

export type IntegrityOutcome =
  | { kind: 'ok'; report: unknown }
  | { kind: 'paywall' }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited' }
  | { kind: 'error'; status?: number; message: string };

/**
 * Sastavi zahtjev. Tekst se ukljucuje SAMO ako postoji valjana privola (inace baca): nijedan
 * poziv ne smije poslati tekst bez zabiljezene privole (integritetska granica, odluka A).
 */
export function buildIntegrityRequest(
  text: string,
  lang: string,
  workType: string,
  mode: IntegrityMode,
  consent: IntegrityConsent | null | undefined,
): IntegrityRequest {
  if (!consent || consent.sendsFullText !== true) {
    throw new Error('integritetska provjera trazi privolu prije slanja teksta');
  }
  return { text, lang, workType, mode, consent };
}

/** Posalji zahtjev i mapiraj HTTP odgovor u ishod. Injektabilan fetch (testabilno bez mreze). */
export async function runIntegrityCheck(
  config: IntegrityConfig,
  accessToken: string,
  request: IntegrityRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<IntegrityOutcome> {
  if (!config.endpoint) return { kind: 'error', message: 'integrity endpoint nije konfiguriran' };
  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }

  if (res.status === 200) {
    const data = (await res.json().catch(() => ({}))) as { report?: unknown };
    return { kind: 'ok', report: data.report };
  }
  if (res.status === 402) return { kind: 'paywall' };
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 429) return { kind: 'rate_limited' };
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}
