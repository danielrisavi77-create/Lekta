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
 * - `converted` docx nastao pretvorbom PDF-a. NIKAD ne ulazi u mjerenje koje puni matricu.
 *
 * Zasto je `converted` iskljucen: motor boduje OOXML (stilovi, `sectPr`, `rPr`, polja, fusnote),
 * a PDF nista od toga nema, ima polozaje glifova. Konverter to rekonstruira heuristikom, pa svi
 * konvertirani dokumenti dijele ISTI otisak konvertera: bez stilova, bez TOC polja, s proredom
 * izvedenim iz razmaka linija i fusnotama kao tijelom teksta. Mjerenje nad njima mjeri konverter,
 * ne studenta, a pogreska korelirana kroz cijeli skup daje matricu koja izgleda puna i ne znaci
 * nista. Traka se svejedno gradi (vlastiti artefakt `docs/generated/corpus-converted.json`), ali
 * kao izvor statistike strukture i kao ulaz za intake granice, nikad kao dokaz profila.
 */
export type CorpusTrack = 'real' | 'generated' | 'converted';

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
 */
export function sidecarAdmitted(metadata: CorpusSidecar): boolean {
  if (metadata.synthetic === true) return false;
  if (metadata.track !== undefined && !ADMITTED_TRACKS.includes(metadata.track as string)) return false;
  return typeof metadata.profileId === 'string' && metadata.profileId.length > 0;
}
