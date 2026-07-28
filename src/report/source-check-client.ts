/**
 * Klijent za ZASEBNU provjeru postojanja izvora (source-check Edge funkcija).
 *
 * ZASTO ZASEBNO: provjera ovisi iskljucivo o naslovima literature, koje klijent ima jos iz lokalne
 * analize, dakle PRIJE nego dokument krene na server. Dok je bila dio repair-docx odgovora, popravak
 * ju je cekao (budzet do 45 s) iako je dokument bio gotov mnogo prije. Ovako oba posla teku
 * usporedno i svaki stize u svom vremenu.
 *
 * Ciste funkcije uz injektabilan `fetch` (testabilno bez mreze), isti obrazac kao repair-client.
 * Nikad ne baca: pozivatelj ju pokrece bez await pa bi odbijeni promise bio neuhvacena greska.
 */

import { parseSourceCheck, type RepairSourceCheck } from './source-check-parse';
import { REPAIR_MAX_REFERENCES } from './repair-contract';
import type { RepairReference } from './repair-client';

export interface SourceCheckConfig {
  /** URL source-check Edge Functiona; prazno znaci nije konfigurirano. */
  endpoint: string;
}

export type SourceCheckOutcome =
  | { kind: 'ok'; result: RepairSourceCheck }
  /** Provjera nije dostupna (nije konfigurirana, prazan popis, greska, 503, prekid). Nikad se ne
   *  smije prikazati kao "izvor ne postoji": znaci samo da presude nema. */
  | { kind: 'unavailable'; reason: string }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; reason?: 'user' | 'ip' };

/**
 * Provjeri postoje li navedeni izvori u korpusu. Salje SAMO naslov i godinu, nikad tekst rada.
 * Reference bez naslova ispadaju ovdje, jer server indeksira pogotke po poziciji u POSLANOM nizu:
 * filtriranje poslije bi vezalo pogodak uz krivu referencu.
 */
export async function checkSources(
  config: SourceCheckConfig,
  accessToken: string,
  references: RepairReference[],
  fetchImpl: typeof fetch = fetch,
  options?: { signal?: AbortSignal },
): Promise<SourceCheckOutcome> {
  if (!config.endpoint) return { kind: 'unavailable', reason: 'nije konfigurirano' };
  const refs = (references || [])
    .filter((r) => r && typeof r.title === 'string' && r.title.trim().length > 0)
    .slice(0, REPAIR_MAX_REFERENCES)
    .map((r) => ({ title: r.title.trim(), year: typeof r.year === 'number' && Number.isFinite(r.year) ? r.year : null }));
  if (!refs.length) return { kind: 'unavailable', reason: 'nema referenci s naslovom' };

  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ references: refs }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.message : 'mrezna greska' };
  }

  if (res.status === 200) {
    const data = await res.json().catch(() => null);
    const parsed = parseSourceCheck(data);
    return parsed ? { kind: 'ok', result: parsed } : { kind: 'unavailable', reason: 'neocekivan oblik odgovora' };
  }
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 429) {
    const data = (await res.json().catch(() => ({}))) as { reason?: string };
    const reason = data.reason === 'user' || data.reason === 'ip' ? data.reason : undefined;
    return { kind: 'rate_limited', reason };
  }
  return { kind: 'unavailable', reason: `odgovor ${res.status}` };
}

export type { RepairSourceCheck };
