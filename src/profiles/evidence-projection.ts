import type { SourceIndex } from './profile-rules-contract.ts';

/**
 * PROJEKCIJA DOKAZA IZ AUTORSKIH DRAFTOVA U ISPORUCIVI OBLIK.
 *
 * Do sada je vrijedila odredba zapisana u `supabase/functions/profile-rules/index.ts`:
 * "Evidence (drafts/ledger) NIKAD nije u artefaktu". Vlasnik ju je 2026-09-03 izricito promijenio,
 * nakon sto su mu iznesene brojke i protuargumenti; ovaj modul je jedini put kroz koji dokaz sada
 * smije izaci, i namjerno je uzak.
 *
 * DOPUSNI POPIS, NE ZABRANA. Draft unos nosi i modalitet, opseg, autoritet, potpise verifikatora
 * (`verifiedBy`, `reviewedBy`, `confirmedVia`) i kanarince. Zabrana bi propustila svako NOVO polje
 * koje netko sutra doda u draft, i to tiho. Zato se gradi nov objekt sa SEST poznatih polja, a sve
 * ostalo se ne kopira nego ne postoji.
 *
 * STO SE NE ISPORUCUJE I ZASTO:
 *   verifiedBy/reviewedBy/confirmedVia   potpis verifikatora ne mora biti javan; uz to su
 *                                        never-markeri koje klasifikacijski gard trazi u bundleu
 *   kanarinac                            sluzi da se procurio sadrzaj prepozna; isporucen bi
 *                                        prestao biti kanarinac
 *   modality/scope/authority             interna prosudba, ne dokaz; korisniku ne govori nista
 *
 * DOKAZ BEZ ATRIBUCIJE SE ODBACUJE. Citat bez razrijesenog izvora tvrdi vise nego sto zna: pokazao
 * bi doslovan navod a ne bi mogao reci iz kojeg dokumenta dolazi. Takav unos ne izlazi.
 */

export interface ServedEvidenceEntry {
  ruleId: string;
  checkId: string;
  quote: string;
  /** Doslovna formulacija iz izvora ("str. 9, odjeljak 2.4"), nikad izveden broj. */
  sourcePage: string | null;
  sourceId: string;
  source: { id: string; title: string; url: string };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Projiciraj JEDAN draft unos. Vraca `null` kad unos ne nosi potpun dokaz.
 *
 * Potpun znaci: doslovan citat, identitet izvora i izvor razrjesiv u registru. Bilo koje od to
 * troje da nedostaje, dokaz se ne isporucuje; bolje nista nego navod bez uporista.
 */
export function projectEvidenceEntry(entry: unknown, sourceIndex: SourceIndex): ServedEvidenceEntry | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const row = entry as Record<string, unknown>;

  const quote = text(row.quote);
  if (!quote) return null;

  const ruleId = text(row.ruleId);
  const checkId = text(row.checkId);
  if (!ruleId || !checkId) return null;

  const sourceId = text(row.sourceId);
  const hit = sourceId ? sourceIndex[sourceId] : undefined;
  const title = text(hit?.title);
  const url = text(hit?.url);
  if (!sourceId || !title || !url) return null;

  // Nov objekt, ne `{...row}`: kopiranje sirenja bi vratilo tocno onu klasu curenja koju ovaj
  // modul postoji da sprijeci.
  return {
    ruleId,
    checkId,
    quote,
    sourcePage: text(row.sourcePage) || null,
    sourceId,
    source: { id: sourceId, title, url },
  };
}

/**
 * Slozi mapu `profileId -> dokazi` iz ucitanih draft datoteka.
 *
 * @param draftFiles  sadrzaj `data/profiles/(unit)/drafts/*.json`; oblik je `{profiles: {id: []}}`
 *
 * Redoslijed unosa se CUVA kakav je u draftu, a profili se ne sortiraju ovdje nego u graditelju
 * artefakta, koji ionako obradjuje profile sortirano. Time isti ulaz daje bajt-isti izlaz.
 */
export function buildEvidenceIndex(
  draftFiles: Array<Record<string, unknown>>,
  sourceIndex: SourceIndex,
): Record<string, ServedEvidenceEntry[]> {
  const out: Record<string, ServedEvidenceEntry[]> = {};
  for (const file of draftFiles) {
    const profiles = file?.profiles;
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) continue;
    for (const [profileId, entries] of Object.entries(profiles as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      const projected: ServedEvidenceEntry[] = [];
      for (const entry of entries) {
        const row = projectEvidenceEntry(entry, sourceIndex);
        if (row) projected.push(row);
      }
      // Profil bez ijednog potpunog dokaza NE dobiva prazan niz: prazno polje u artefaktu
      // izgledalo bi kao "provjereno pa nema dokaza", a istina je "nije bilo sto isporuciti".
      if (projected.length) out[profileId] = projected;
    }
  }
  return out;
}
