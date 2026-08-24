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

export const PROFILE_RULES_CONTRACT_V = 1 as const;

/** Polja heavy profila koja se klijentu NE isporucuju. */
export const EXCLUDED_PROFILE_FIELDS = ['profileLabel', 'catalogPrograms'] as const;

/** Jedan zapis u pecenom serverskom artefaktu. */
export interface ProfileRulesServedEntry {
  etag: string;
  profile: Record<string, unknown>;
  repairEntries: unknown[];
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
 * Slozi cijeli serverski artefakt iz izvora istine i repair mape. Deterministicki:
 * profili se obraduju sortirano po id-u, pa isti ulaz daje bajt-isti izlaz (drift
 * test usporeduje commitani artefakt s ponovnim izracunom).
 * @param verifiedProfiles  sadrzaj data/profiles/verified-profiles.json
 * @param repairMap         sadrzaj data/profiles/repair-map.json (id -> entries[])
 * @param sha256Hex         injektirana hash funkcija (node:crypto ili Deno crypto)
 */
export function buildProfileRulesArtifact(
  verifiedProfiles: Array<Record<string, unknown>>,
  repairMap: Record<string, unknown[]>,
  sha256Hex: (input: string) => string,
): ProfileRulesServerArtifact {
  const profiles: Record<string, ProfileRulesServedEntry> = {};
  const sorted = [...verifiedProfiles].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const etagLines: string[] = [];
  for (const full of sorted) {
    const id = String(full.id ?? '');
    if (!id) throw new Error('[profile-rules-contract] profil bez id polja u izvoru istine');
    const profile = selectServedProfileFields(full);
    const repairEntries = Array.isArray(repairMap[id]) ? repairMap[id] : [];
    const etag = sha256Hex(JSON.stringify({ v: PROFILE_RULES_CONTRACT_V, profile, repairEntries }));
    profiles[id] = { etag, profile, repairEntries };
    etagLines.push(`${id}:${etag}`);
  }
  const datasetVersion = sha256Hex(etagLines.join('\n'));
  return { v: PROFILE_RULES_CONTRACT_V, datasetVersion, profiles };
}
