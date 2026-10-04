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
 */
export type CorpusTrack = 'real' | 'generated' | 'authored' | 'converted' | 'witness';

/**
 * - `witness`   Word-autorski SVJEDOK (T68): izmisljen akademski tekst s NAMJERNIM prekrsajem svakog
 *               verificiranog bodovanog pravila profila (`scripts/corpus-gen/word/make-violation-witnesses.ps1`).
 *
 * Zasto zaseban skup, a ne `results` ni `syntheticResults`: svjedok je napravljen da padne, pa bi u
 * `results` napuhao stopu rjesavanja (sinteticki 84,6 posto naspram stvarnih 39,8 posto, vidi `authored`)
 * i usao u matricu kao dokaz profila koji nije studentski rad. U `syntheticResults` bi se izgubio njegov
 * izravni signal: sidecar svjedoka IMENUJE koje je pravilo prekrseno, pa se po dokumentu moze reci je li
 * svaki namjerni prekrsaj ciljan, razrijesen ili izricito ostavljen korisniku. Zato ide u `witnessResults`
 * s vlastitim sazetkom i ratchetom (`tests/real-corpus-vacuity.test.ts`).
 */
export const WITNESS_TRACK = 'witness';

/** Trake koje smiju u mjerenje. Popis je BIJEL: nepoznata traka je odbijena, ne propustena. */
export const ADMITTED_TRACKS: readonly string[] = ['real', 'generated'];

/** Sidecar kakav se cita s diska; sva polja su `unknown` jer dolaze iz JSON-a bez sheme. */
export interface CorpusSidecar {
  profileId?: unknown;
  synthetic?: unknown;
  track?: unknown;
  /** Izricita odluka o izdvojenom skupu; kad je izostavljena, odlucuje `isHoldout` deterministicki. */
  holdout?: unknown;
  /** Tko je i kada zapisao ocekivanja PRIJE popravka (T06, protokol 2.3). Bez toga je ocekivanje `derived`. */
  expectedBy?: unknown;
  expectedAt?: unknown;
  /** Samo svjedok: popis namjernih prekrsaja `{ checkId, expected, set }` koji je zapisao generator. */
  violations?: unknown;
}

/**
 * IZDVOJENI SKUP (T06, protokol 2.2): oko 20 posto dokumenata koji se mjere, ali ih ovjera NE broji u
 * dokaz razine A dok vlasnik ne potvrdi zavrsnu provjeru. Time se ocekivanja ne dotjeruju na istim
 * dokumentima na kojima se tvrdi uspjeh.
 *
 * Odabir je DETERMINISTICAN iz imena datoteke (FNV-1a 32, modulo 5), pa se ne mijenja izmedju prolaza i
 * ne ovisi o tome tko je pokrenuo mjerenje. Izricit `holdout: true|false` u sidecaru ima prednost, jer
 * vlasnik smije odluciti drukcije; sve ostale vrijednosti se ignoriraju (nisu odluka).
 *
 * Modul i dalje nema uvoza (vidi zaglavlje), zato vlastiti hash umjesto `node:crypto`.
 */
export const HOLDOUT_MODULO = 5;

export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function isHoldout(fileName: string, metadata: CorpusSidecar = {}): boolean {
  if (metadata.holdout === true) return true;
  if (metadata.holdout === false) return false;
  return fnv1a32(fileName.toLowerCase()) % HOLDOUT_MODULO === 0;
}

/**
 * PROVENIJENCIJA OCEKIVANJA (T06, protokol 2.3). Harness ciljane provjere IZVODI iz analize prije
 * popravka; to je strojno ocekivanje (`derived`). Neovisno je tek kad je osoba koja nije pokrenula
 * popravak zapisala `expectedBy` i `expectedAt` (ISO datum) PRIJE mjerenja. Datum koji se ne moze
 * parsirati ili prazan potpis vraca `derived`, ne gresku: nepotpun zapis nije potvrda.
 */
export type ExpectationProvenance = 'independent' | 'derived';

export function expectationProvenance(metadata: CorpusSidecar): ExpectationProvenance {
  const by = typeof metadata.expectedBy === 'string' ? metadata.expectedBy.trim() : '';
  const at = typeof metadata.expectedAt === 'string' ? Date.parse(metadata.expectedAt) : Number.NaN;
  return by.length > 0 && Number.isFinite(at) ? 'independent' : 'derived';
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

/**
 * SKUP u koji dokument ulazi. Jedina odluka o razvrstavanju; sva tri otkrivanja u
 * `tests/real-corpus/harness.ts` je citaju, pa se svjedok ne moze naci u dva skupa ni u krivom.
 *
 * - `results`   dopusteno mjerenje (`sidecarAdmitted`), puni matricu i ovjeru.
 * - `synthetic` iskljuceno iz dokaza, mjeri se samo za detekciju regresije (`syntheticResults`).
 * - `witness`   svjedok s namjernim prekrsajima (`witnessResults`); nikad `results`.
 * - `null`      bez profila, ne mjeri se nigdje.
 *
 * Traka `witness` se provjerava PRIJE dopustenosti i neovisno o zastavici `synthetic`: svjedok s krivom
 * zastavicom (`synthetic: false`) i dalje je svjedok, a ne stvaran rad.
 */
export type CorpusSet = 'results' | 'synthetic' | 'witness';

export function corpusSetOf(metadata: CorpusSidecar): CorpusSet | null {
  if (typeof metadata.profileId !== 'string' || metadata.profileId.length === 0) return null;
  if (metadata.track === WITNESS_TRACK) return 'witness';
  return sidecarAdmitted(metadata) ? 'results' : 'synthetic';
}

/**
 * GARD IZOLACIJE SVJEDOKA: vraca imenovane probleme kad razvrstavanje pusti svjedoka izvan
 * `witness` skupa ili pomakne kontrolne trake. Prazan popis znaci zdrav zid. Prima razvrstavac kao
 * argument da mutacijski test (`tests/gate-mutations.test.ts`) moze dokazati da gard pada.
 */
export function witnessIsolationProblems(
  classify: (metadata: CorpusSidecar) => CorpusSet | null = corpusSetOf,
): string[] {
  const p = 'apuri-zavrsni';
  const cases: Array<[string, CorpusSidecar, CorpusSet | null]> = [
    ['svjedok', { profileId: p, track: WITNESS_TRACK }, 'witness'],
    ['svjedok sa synthetic: true', { profileId: p, track: WITNESS_TRACK, synthetic: true }, 'witness'],
    ['svjedok sa synthetic: false', { profileId: p, track: WITNESS_TRACK, synthetic: false }, 'witness'],
    ['svjedok bez profila', { track: WITNESS_TRACK }, null],
    // Kontrole: zid ne smije "hvatati" tako da sve odbije ili sve proglasi svjedokom.
    ['sidecar bez trake', { profileId: p }, 'results'],
    ['traka real', { profileId: p, track: 'real' }, 'results'],
    ['traka generated', { profileId: p, track: 'generated' }, 'results'],
    ['synthetic: true', { profileId: p, synthetic: true }, 'synthetic'],
    ['traka authored', { profileId: p, track: 'authored' }, 'synthetic'],
  ];
  const out: string[] = [];
  for (const [name, metadata, want] of cases) {
    const got = classify(metadata);
    if (got !== want) out.push(`${name}: ocekivan skup ${String(want)}, dobiven ${String(got)}`);
  }
  return out;
}
