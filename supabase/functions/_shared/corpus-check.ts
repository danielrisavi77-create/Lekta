// Provjera postojanja domacih izvora u M4 korpusu (526k radova iz Dabra i Hrcka).
//
// Izvucena iz repair-docx/index.ts jer je sada imaju DVA pozivatelja: repair-docx (stari,
// spojeni put) i source-check (novi, usporedni put, koji popravak vise ne ceka). Jedan izvor
// istine znaci da se prag, budzet i FAIL-OPEN ugovor ne mogu razici izmedju to dvoje.
//
// PRESUDA (nepromijenjena): promasaj u korpusu NIJE dokaz da izvor ne postoji (korpus pokriva
// hrvatske repozitorije, ne knjige ni strane izvore), pa se vraca samo ono sto je NADJENO, uz
// brojac koliko je referenci stiglo na red. Sucelje mora prikazati `checked`/`total`, inace bi
// djelomican rezultat izgledao kao potpun.
//
// deno-lint-ignore-file no-explicit-any
import { verifyCorpusBatch, type CorpusCandidate } from '../../../src/citations/corpus-verify.ts';

/**
 * Brojke su izvedene iz mjerenja na produkciji: dohvat kosta ~2,8 ms po znaku naslova (85 ms za
 * kratak, 200 ms za dug), pa serija od 8 traje ~2 s, a svih 60 referenci (maxRefs) ~16 s.
 *
 * BUDZET (2026-07-21, vlasnikov zahtjev "provjera traje koliko treba"): 45 s. KLJUCNO: petlja u
 * verifyCorpusBatch zavrsi CIM su sve reference provjerene; budzet je samo GORNJI STROP, ne fiksno
 * trajanje. Zato tipican rad (29 ref ~8 s, 60 ref ~16 s) prodje U CIJELOSTI i vrati se u svom
 * prirodnom vremenu; 45 s (~2,8x iznad najgoreg realnog slucaja) samo sprjecava da spora baza
 * objesi odgovor. Fail-open: ako budzet ipak istekne, neprovjerene reference ostaju BEZ ishoda
 * (nikad "ne postoji"), pa se rezultat ne cita kao potpun kad nije.
 */
export interface CorpusCheckConfig {
  enabled: boolean;
  maxRefs: number;
  budgetMs: number;
  chunkSize: number;
}

export function corpusConfigFromEnv(env: { get(key: string): string | undefined }): CorpusCheckConfig {
  return {
    enabled: (env.get('CORPUS_SOURCE_CHECK') ?? 'true') !== 'false',
    maxRefs: Number(env.get('CORPUS_MAX_REFS') ?? '60'),
    budgetMs: Number(env.get('CORPUS_BUDGET_MS') ?? '45000'),
    chunkSize: Number(env.get('CORPUS_CHUNK') ?? '8'),
  };
}

export interface SourceCheckResult {
  found: Array<{ index: number; verdict: 'found' | 'weak'; score: number; matchedTitle: string; where: string; url: string | null }>;
  checked: number;
  total: number;
  truncated: boolean;
}

/**
 * Cijeli je poziv fail-open: greska, timeout ili ugasena zastavica znace da rezultat izostane
 * (`null`), a pozivatelj svoj glavni posao svejedno isporucuje. NIKAD ne baca: repair-docx ga
 * pokrece bez await, pa bi odbijeni promise bio neuhvacena greska.
 *
 * `references` su bibliografski metapodatak (naslov + godina), ne tekst rada.
 */
export async function runCorpusCheck(
  admin: any,
  references: unknown,
  config: CorpusCheckConfig,
): Promise<SourceCheckResult | null> {
  if (!config.enabled) return null;
  try {
    const rawRefs: any[] = Array.isArray(references) ? references : [];
    const items = rawRefs.slice(0, config.maxRefs).map((r) => ({
      title: typeof r?.title === 'string' ? r.title : null,
      year: Number.isFinite(Number(r?.year)) ? Number(r.year) : null,
    }));
    if (!items.length) return null;

    const batch = await verifyCorpusBatch(items, async (keys, o) => {
      const { data, error } = await admin.rpc('corpus_search_many', {
        qs: keys, min_sim: o.min, top_n: o.top,
      });
      if (error) throw new Error(error.message);
      // RPC vraca plosnat popis s q_index; presloziti u niz kandidata po indeksu unutar serije.
      const byIndex: Array<CorpusCandidate[]> = keys.map(() => []);
      for (const row of (data ?? []) as any[]) {
        const i = Number(row.q_index) - 1; // generate_subscripts je 1-based
        if (i >= 0 && i < byIndex.length) {
          byIndex[i].push({
            title: String(row.title ?? ''), year: row.year ?? null,
            institution: row.institution ?? null, repo: row.repo ?? null, url: row.url ?? null,
          });
        }
      }
      return byIndex;
    }, { chunkSize: config.chunkSize, budgetMs: config.budgetMs });

    return {
      found: batch.matches.flatMap((m, i) => (m ? [{
        index: i, verdict: m.verdict, score: Number(m.score.toFixed(3)),
        matchedTitle: m.matchedTitle, where: m.where, url: m.url,
      }] : [])),
      checked: batch.checked, total: batch.total, truncated: batch.truncated,
    };
  } catch (e) {
    console.error('[corpus-check] failed', e instanceof Error ? e.message : e);
    return null; // fail-open: glavni posao je vazniji od dodatka
  }
}
