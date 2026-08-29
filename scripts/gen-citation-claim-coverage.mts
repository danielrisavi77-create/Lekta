/**
 * Generator popisa: koliko je citatni stil svakog profila POTKRIJEPLJEN tvrdnjom (T3).
 *
 * ZASTO POSTOJI. `rules.recommendedCitation` nije samo oznaka: preko `citationMeta().mode` bira
 * KOJI citatni motor uopce radi, pa time i koje se provjere boduju. Izmjereno na
 * `fpzg-novinarstvo-bibliografija.docx`, mijenjanjem SAMO tokena:
 *
 *     apa7 (autor-godina)   ocjena 72, 26 bodovanih provjera, 126 bodova u nazivniku
 *     ieee (brojcani)       ocjena 70, 21 bodovana provjera,  100 bodova u nazivniku
 *
 * Token dakle uklanja pet bodovanih provjera i 26 bodova. Ta os pritom NIJE u
 * `DEMOTABLE_CHECK_IDS`, pa `advisory` status na njoj ne gasi nista: motor se konfigurira bez
 * obzira na verifikacijski status. Zbog toga se ovdje ne mijenja bodovanje (to je odluka
 * vlasnika, jer nema neutralnog pada: autor-godina DODAJE 26 bodova, brojcani ih ODUZIMA), nego
 * se sutnja POPISUJE, isto kao sto je popisano za 82 osi bez tvrdnje.
 *
 * Pokreni:  npm run citation-claim-coverage
 * Gard:     tests/citation-claim-coverage.test.ts (drift + ratchet koji smije samo padati)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface DraftEntry {
  checkId?: string;
  status?: string;
  value?: unknown;
  authority?: string;
  sourceId?: string;
  sourcePage?: string | null;
}

/** profileId -> citation-style tvrdnje iz autorskih draftova (izvor istine). */
function citationClaims(): Record<string, DraftEntry[]> {
  const out: Record<string, DraftEntry[]> = {};
  const profilesDir = join(root, 'data/profiles');
  for (const unit of readdirSync(profilesDir)) {
    const dir = join(profilesDir, unit, 'drafts');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      let parsed: { profiles?: Record<string, DraftEntry[]> };
      try {
        parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch {
        continue;
      }
      for (const [profileId, entries] of Object.entries(parsed.profiles ?? {})) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (entry.checkId !== 'citation-style') continue;
          (out[profileId] ??= []).push(entry);
        }
      }
    }
  }
  return out;
}

const registry = JSON.parse(
  readFileSync(join(root, 'data/profiles/verified-profiles.json'), 'utf8'),
) as Array<{ id: string; rules?: { recommendedCitation?: string } }>;

const claims = citationClaims();
const rows = registry
  .filter((p) => p.rules?.recommendedCitation)
  .map((p) => {
    const entries = claims[p.id] ?? [];
    const status = entries.some((e) => e.status === 'verified')
      ? 'verified'
      : entries.length
        ? 'advisory'
        : 'none';
    const backing = entries.find((e) => e.status === 'verified') ?? entries[0];
    return {
      profileId: p.id,
      token: p.rules!.recommendedCitation!,
      claim: status,
      claimedValue: backing?.value ?? null,
      authority: backing?.authority ?? null,
      sourceId: backing?.sourceId ?? null,
    };
  })
  .sort((a, b) => a.profileId.localeCompare(b.profileId));

const counts = rows.reduce<Record<string, number>>((acc, r) => {
  acc[r.claim] = (acc[r.claim] ?? 0) + 1;
  return acc;
}, {});

/** Token koji tvrdnja izricito NE potvrdjuje (vrijednost se razilazi), odvojeno od pukog izostanka. */
const contradicted = rows.filter(
  (r) => r.claimedValue != null && String(r.claimedValue) !== r.token,
);

const artifact = {
  schemaVersion: 1,
  napomena:
    'GENERIRANO (npm run citation-claim-coverage). Ne uredjuj rucno. Mjeri je li citatni token ' +
    'profila potkrijepljen tvrdnjom; NE mijenja bodovanje.',
  counts,
  contradictedCount: contradicted.length,
  byToken: rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.token] = (acc[r.token] ?? 0) + 1;
    return acc;
  }, {}),
  contradicted,
  rows,
};

writeFileSync(
  join(root, 'docs/generated/citation-claim-coverage.json'),
  JSON.stringify(artifact, null, 2) + '\n',
);
console.log(
  `citation-claim-coverage.json: ${rows.length} profila (` +
    Object.entries(counts)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(' ') +
    `), proturjecnih ${contradicted.length}`,
);
