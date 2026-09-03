/**
 * Ugovor profile-rules isporuke (faza B plana zastite baze pravila), verzija 1.
 *
 * Dijele ga generator (scripts/gen-profile-rules-server.mts), buduca Edge funkcija
 * (supabase/functions/profile-rules) i testovi (tests/profile-rules-server.test.ts),
 * pa `npm run check` pokriva tocno onu logiku koju server izvrsava. Zato ovdje NEMA
 * nijednog Node/Deno API-ja: cisti tipovi i ciste funkcije; sha256 se injektira.
 *
 * Minimizacija odgovora: klijentu se po profilu isporucuje heavy zapis BEZ
 * profileLabel i catalogPrograms (jedina dva polja koja zivi UI ne cita) i BEZ
 * fieldValidation.publicSources (privatna provenijencija, isti strip kao
 * gen-verified-split i stripRuntimeDeadProvenance; ondje zivi i kanarinac pa je
 * njegova odsutnost iz artefakta dokaz da strip radi). repairEntries za profil
 * dolaze iz repair-map.json u ISTOM zapisu (jedan RTT, jedan rate-limit bucket).
 */

import type { ServedEvidenceEntry } from './evidence-projection.ts';

export const PROFILE_RULES_CONTRACT_V = 1 as const;

/** Polja heavy profila koja se klijentu NE isporucuju. */
export const EXCLUDED_PROFILE_FIELDS = ['profileLabel', 'catalogPrograms'] as const;

/** Jedan zapis u pecenom serverskom artefaktu. */
export interface ProfileRulesServedEntry {
  etag: string;
  profile: Record<string, unknown>;
  repairEntries: unknown[];
  /**
   * Doslovni navodi iz sluzbenih uputa za pravila OVOG profila. Izostaje kad profil nema nijedan
   * potpun dokaz; prazan niz bi izgledao kao "provjereno pa nema dokaza", a istina je "nije bilo
   * sto isporuciti". Projekcija je uska i ide iskljucivo kroz `evidence-projection.ts`.
   */
  evidenceEntries?: ServedEvidenceEntry[];
}

/** Peceni serverski artefakt (data/generated/profile-rules-server.json). */
export interface ProfileRulesServerArtifact {
  v: typeof PROFILE_RULES_CONTRACT_V;
  datasetVersion: string;
  profiles: Record<string, ProfileRulesServedEntry>;
}

/** Odgovor 200 Edge funkcije profile-rules (v query parametar mora biti 1). */
export interface ProfileRulesResponseV1 {
  v: typeof PROFILE_RULES_CONTRACT_V;
  profileId: string;
  verifiedAt: string | null;
  datasetVersion: string;
  profile: Record<string, unknown>;
  repairEntries: unknown[];
}

/** Projekcija heavy profila na isporucena polja (vidi zaglavlje). */
export function selectServedProfileFields(full: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(full)) {
    if ((EXCLUDED_PROFILE_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  const fv = out.fieldValidation;
  if (fv && typeof fv === 'object' && !Array.isArray(fv) && 'publicSources' in (fv as Record<string, unknown>)) {
    const { publicSources: _dead, ...rest } = fv as Record<string, unknown>;
    out.fieldValidation = rest;
  }
  return out;
}

/**
 * Veza IZVOR-PRAVILO. `ruleEntry.sourceId` upucuje na zapis u `data/sources/source-registry.json`,
 * ali profilni `sources` niz nosi samo `{title, url}` BEZ identiteta, pa se to dvoje dosad nije
 * dalo spojiti: sucelje je imalo doslovan citat i stranicu, a nije moglo pouzdano reci IZ KOJEG
 * dokumenta dolaze. Izmjereno prije zahvata: 91 unos s citatom, svih 91 sa `sourceId` koji registar
 * poznaje, dakle veza nije bila slomljena nego samo nije bila prenesena.
 *
 * Prenosi se ISKLJUCIVO `title` i `url`. Registar uz njih drzi i `snapshotHash`, `snapshotPath`,
 * `fetchedAt` i `validityClass`; `snapshotHash` je PRIRODNI KANARINAC iz klasifikacijskog manifesta
 * i ne smije izaci ovim putem, a ostalo je provenijencija koja korisniku ne govori nista.
 */
export interface ServedSourceRef {
  id: string;
  title: string;
  url: string;
}

/** Indeks registra izvora: id -> {title, url}. Gradi ga pozivatelj (generator). */
export type SourceIndex = Record<string, { title: string; url: string }>;

/**
 * Prikaci razrijesen izvor na unos koji ima `sourceId`. Nepoznat `sourceId` se NE pogadja i ne
 * izmislja: unos ostaje bez `source`, pa `acceptedEvidence` na klijentu takav dokaz odbaci.
 */
export function attachSourceRefs(entries: unknown[], index: SourceIndex | undefined): unknown[] {
  if (!index) return entries;
  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const row = entry as Record<string, unknown>;
    const sourceId = typeof row.sourceId === 'string' ? row.sourceId : '';
    const hit = sourceId ? index[sourceId] : undefined;
    if (!hit) return entry;
    const source: ServedSourceRef = { id: sourceId, title: hit.title, url: hit.url };
    return { ...row, source };
  });
}

/**
 * Slozi cijeli serverski artefakt iz izvora istine i repair mape. Deterministicki:
 * profili se obraduju sortirano po id-u, pa isti ulaz daje bajt-isti izlaz (drift
 * test usporeduje commitani artefakt s ponovnim izracunom).
 * @param verifiedProfiles  sadrzaj data/profiles/verified-profiles.json
 * @param repairMap         sadrzaj data/profiles/repair-map.json (id -> entries[])
 * @param sha256Hex         injektirana hash funkcija (node:crypto ili Deno crypto)
 * @param sourceIndex       id -> {title, url} iz data/sources/source-registry.json; kad izostane,
 *                          unosi ostaju bez `source` i artefakt je identican starom
 */
export function buildProfileRulesArtifact(
  verifiedProfiles: Array<Record<string, unknown>>,
  repairMap: Record<string, unknown[]>,
  sha256Hex: (input: string) => string,
  sourceIndex?: SourceIndex,
  evidenceIndex?: Record<string, ServedEvidenceEntry[]>,
): ProfileRulesServerArtifact {
  const profiles: Record<string, ProfileRulesServedEntry> = {};
  const sorted = [...verifiedProfiles].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const etagLines: string[] = [];
  for (const full of sorted) {
    const id = String(full.id ?? '');
    if (!id) throw new Error('[profile-rules-contract] profil bez id polja u izvoru istine');
    const profile = selectServedProfileFields(full);
    const repairEntries = attachSourceRefs(Array.isArray(repairMap[id]) ? repairMap[id] : [], sourceIndex);
    const evidenceEntries = evidenceIndex?.[id];
    // Dokaz ULAZI u etag. Bez toga bi klijent s vazecim etagom dobio 304 i zadrzao STARI dokaz uz
    // nova pravila, sto je gore od izostanka dokaza: navod bi se prikazivao uz pravilo koje ga
    // vise ne propisuje.
    const etag = sha256Hex(JSON.stringify({ v: PROFILE_RULES_CONTRACT_V, profile, repairEntries, evidenceEntries: evidenceEntries ?? null }));
    profiles[id] = evidenceEntries?.length
      ? { etag, profile, repairEntries, evidenceEntries }
      : { etag, profile, repairEntries };
    etagLines.push(`${id}:${etag}`);
  }
  const datasetVersion = sha256Hex(etagLines.join('\n'));
  return { v: PROFILE_RULES_CONTRACT_V, datasetVersion, profiles };
}
