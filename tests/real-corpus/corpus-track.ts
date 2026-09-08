/**
 * TRAKA KORPUSA: odakle dokument dolazi i smije li brojati kao dokaz profila.
 *
 * Modul NEMA nijedan uvoz i to je namjerno: zid mora biti dostupan mutacijskom testu
 * (`tests/gate-mutations.test.ts`) bez povlacenja cijele analize. `tests/real-corpus/harness.ts`
 * pri uvozu instalira globalni DOMParser i uvozi motor popravka, pa bi uvoz zida odande bio
 * skup i s nuspojavom.
 */

/**
 * - `real`      stvaran studentski rad (pseudonimiziran kroz `scripts/corpus-ingest.mts`).
 * - `generated` izlaz PRAVOG alata nad izmisljenim sadrzajem (`scripts/corpus-gen/*`).
 * - `authored`  izlaz pravog alata nad PROZOM koju je napisao covjek uz pomoc modela.
 * - `handbuilt` paket slozen RUCNO, bez ijednog alata, radi oblika PAKIRANJA koje ni Word ni
 *               LibreOffice na ovom stroju ne proizvode.
 * - `converted` docx nastao pretvorbom PDF-a. NIKAD ne ulazi u mjerenje koje puni matricu.
 *
 * Zasto je `converted` iskljucen: motor boduje OOXML (stilovi, `sectPr`, `rPr`, polja, fusnote),
 * a PDF nista od toga nema, ima polozaje glifova. Konverter to rekonstruira heuristikom, pa svi
 * konvertirani dokumenti dijele ISTI otisak konvertera: bez stilova, bez TOC polja, s proredom
 * izvedenim iz razmaka linija i fusnotama kao tijelom teksta. Mjerenje nad njima mjeri konverter,
 * ne studenta, a pogreska korelirana kroz cijeli skup daje matricu koja izgleda puna i ne znaci
 * nista. Traka se svejedno gradi (vlastiti artefakt `docs/generated/corpus-converted.json`), ali
 * kao izvor statistike strukture i kao ulaz za intake granice, nikad kao dokaz profila.
 *
 * Zasto je `authored` iskljucen: ti dokumenti nose realan hrvatski tekst i realan opseg, pa ih
 * `docx-shapes` moze dokazati kao nositelje oblika koje graditelj fixtura ne proizvodi, ali tekst
 * je NAS, ne studentov. Tvrdnja razine A glasi "dokazano na stvarnom studentskom radu"; dokument
 * koji smo sami napisali tu tvrdnju ne moze potkrijepiti ni kad je savrseno neuredan. Izmjereno
 * 2026-09-05 na postojecem skupu: sinteticke fixture rjesavaju 84,6 posto ciljanih provjera, a
 * stvarni radovi 39,8 posto, pa bi ulazak u `results` proizvod prikazao dvostruko boljim nego jest.
 * Mjeri se odvojeno (`docs/generated/synthetic-corpus.json`), nikad kroz `results`.
 *
 * Zasto je `handbuilt` iskljucen: takav paket nema ni autora ni proze, nego samo zeljeni oblik zipa
 * i dijelova. Sve u njemu je nase, ukljucujuci i ono sto bi na stvarnom radu bilo nalaz, pa ne moze
 * potkrijepiti nijednu tvrdnju o tome kako radovi izgledaju. Postoji zato da oblik PAKIRANJA koji
 * stvarni radovi nose (direktorijski zapisi, prazan `comments.xml`, Google Docs `app.xml`) uopce
 * ima commitanog nositelja nad kojim motor moze pasti.
 */
export type CorpusTrack = 'real' | 'generated' | 'authored' | 'converted' | 'handbuilt';

/** Trake koje smiju u mjerenje. Popis je BIJEL: nepoznata traka je odbijena, ne propustena. */
export const ADMITTED_TRACKS: readonly string[] = ['real', 'generated'];

/** Sidecar kakav se cita s diska; sva polja su `unknown` jer dolaze iz JSON-a bez sheme. */
export interface CorpusSidecar {
  profileId?: unknown;
  synthetic?: unknown;
  track?: unknown;
}

/**
 * Smije li dokument s ovim sidecarom u mjerenje koje puni matricu?
 *
 * Deny-by-default na traci: sidecar BEZ `track` polja cita se kao `real`, jer su svi postojeci
 * sidecari nastali prije uvodjenja trake i svi su stvarni ili sinteticki radovi. Ali `track` s
 * NEPOZNATOM vrijednoscu se odbija, a ne tumaci kao `real`: tipfeler u imenu nove trake inace
 * tiho ulazi u matricu, sto je tocno kvar koji ovaj zid postoji da sprijeci.
 *
 * `authored` nosi DVA pojasa (`synthetic: true` u sidecaru I izostanak iz `ADMITTED_TRACKS`) jer
 * jedan ne bi bio dovoljan: `generated` je danas dopusten, pa bi dokument s nasom prozom, krivo
 * oznacen kao `generated` ili sa `synthetic: false`, usao u `results`, u matricu pokrivenosti i u
 * ulaz ovjere. Prvi pojas stiti od krive trake, drugi od krive zastavice.
 */
export function sidecarAdmitted(metadata: CorpusSidecar): boolean {
  if (metadata.synthetic === true) return false;
  if (metadata.track !== undefined && !ADMITTED_TRACKS.includes(metadata.track as string)) return false;
  return typeof metadata.profileId === 'string' && metadata.profileId.length > 0;
}
