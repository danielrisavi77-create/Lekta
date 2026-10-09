/**
 * REZULTAT: SVE U JEDNOM (ALIGNMENT Z34): MODEL. Cist modul, bez DOM-a, pa se svaka odluka o tome
 * STO se crta mjeri bez preglednika (`tests/result-live.test.ts`).
 *
 * BODOVI PO ZAHVATU NE POSTOJE (odluka vlasnika, potvrdjena 2026-10-03; `repair-outlook.ts` r. 8-20).
 * Predlozak crta "71 + bodovi zahvata u planu" i "Uključi u plan · +7"; to bi bila projekcija bez
 * deterministicke podloge. Zato:
 *   - crveni luk je ocjena SADA, zeleni luk je STROP (`repairOutlook.ceilingScore`, isti izvor kao
 *     recenica "automatika može doseći najviše M" u sazetku);
 *   - strop se NE mijenja kad se zahvat ukljuci ili iskljuci; mijenja se samo BROJ zahvata u ladici;
 *   - oznaka glasi "najviše X ako svi zahvati uspiju", a ladica i racun "ocjena → najviše X".
 * Odstupanje je zapisano u F37 (`docs/agents/orchestrator-backlog.md`).
 *
 * CIJENA NIJE OVDJE. Klijent nema mjerodavan izvor cijene popravka (naplata zivi na serverskom
 * katalogu, postojeci tok popravka iznos ne prikazuje), pa ladica nosi postojecu recenicu toka
 * popravka. Gard: `tests/helpers/result-live-guard.ts` (`cijenaProblems`).
 */
import { danaDoRoka, daniRijecju, razloziDatum, type RokStanje } from '../../routes/intake/deadline-stamp';
import type { FindingScope } from '../finding-view-model';
import type { DeskItem } from '../results/desk-model';
import type { PlanItemInput } from '../results/repair-plan';
import type { VisualFindingModel } from '../results/visual-result-model';

/* ------------------------------------------------------------------ kategorije */

export type Jezicak = 'all' | 'Format' | 'Struktura' | 'Citati' | 'Predaja';

/** Redoslijed i natpisi jezicaka, doslovno iz predloska (`RL_CATS`). */
const JEZICCI: ReadonlyArray<readonly [Jezicak, string]> = [
  ['all', 'Sve'],
  ['Format', 'Format'],
  ['Struktura', 'Struktura'],
  ['Citati', 'Citati'],
  ['Predaja', 'Predaja'],
];

/**
 * Kategorija nalaza (`issue.category`) u jezicak. Predlozak ima cetiri jezicka, motor sest
 * kategorija; `elements` (tablice, slike, natpisi) je dio strukture rada, a `scope` (opseg) je
 * uvjet predaje. Nepoznata kategorija ostaje samo pod "Sve", nikad pod izmisljenim jezickom.
 */
const KATEGORIJA_NALAZA: Readonly<Record<string, Jezicak>> = {
  formatting: 'Format',
  typography: 'Format',
  structure: 'Struktura',
  elements: 'Struktura',
  citations: 'Citati',
  submission: 'Predaja',
  scope: 'Predaja',
};

export function jezicakNalaza(category: string): Jezicak | null {
  return KATEGORIJA_NALAZA[category] ?? null;
}

/** Statusi provjere koji znace da je vrijednost ISTINSKI procitana iz rada (`checks.ts`). */
const MJERENO = new Set(['pass', 'warn', 'fail', 'informational']);

/**
 * OPSEG MJERENJA PO JEZICKU (Codex R2): koliko je provjera te kategorije stvarno mjerilo rad.
 * Izvor su `checks` rezultata, ista lista iz koje nastaju nalazi; `unmeasurable` (Word vrijednost
 * nije zapisao) i nepoznat status se NE broje, jer kvacica tvrdi "provjereno i uredno". Ulaz koji
 * nije lista daje praznu kartu: nepoznato nikad nije mjereno.
 */
export function opsegMjerenja(checks: unknown): ReadonlyMap<Jezicak, number> {
  const opseg = new Map<Jezicak, number>();
  if (!Array.isArray(checks)) return opseg;
  for (const c of checks as ReadonlyArray<{ readonly category?: unknown; readonly status?: unknown } | null>) {
    const key = typeof c?.category === 'string' ? jezicakNalaza(c.category) : null;
    if (key && typeof c?.status === 'string' && MJERENO.has(c.status)) opseg.set(key, (opseg.get(key) ?? 0) + 1);
  }
  return opseg;
}

interface JezicakModel {
  readonly key: Jezicak;
  readonly label: string;
  readonly n: number;
  /** Kategorija bez nalaza: nije klikabilna. */
  readonly prazan: boolean;
  /**
   * `nalazi` kad ih ima; `cisto` kad je kategorija MJERENA i nema nalaza (kvacica); `nemjereno` kad
   * nema nalaza ni nijedne izmjerene provjere (bez kvacice: nula nalaza nije dokaz da je uredno).
   */
  readonly stanje: 'nalazi' | 'cisto' | 'nemjereno';
}

export function jezicci(nalazi: readonly { readonly category: string }[], opseg: ReadonlyMap<Jezicak, number>): JezicakModel[] {
  return JEZICCI.map(([key, label]) => {
    const n = key === 'all' ? nalazi.length : nalazi.filter((f) => jezicakNalaza(f.category) === key).length;
    const mjereno = key === 'all' ? [...opseg.values()].some((v) => v > 0) : (opseg.get(key) ?? 0) > 0;
    return { key, label, n, prazan: n === 0, stanje: n > 0 ? 'nalazi' : mjereno ? 'cisto' : 'nemjereno' };
  });
}

/** Indeksi nalaza (u izvornom poretku stola) koji pripadaju jezicku. */
export function filtriraj(nalazi: readonly { readonly category: string }[], key: Jezicak): number[] {
  const out: number[] = [];
  nalazi.forEach((f, i) => { if (key === 'all' || jezicakNalaza(f.category) === key) out.push(i); });
  return out;
}

interface Polozaj {
  /** 0-based mjesto u filtriranom popisu. */
  readonly k: number;
  readonly oznaka: string;
  /** Indeks susjeda u izvornom popisu, ili `null` na kraju. NAVIGACIJA NE OMATA (isto kao stol Z8). */
  readonly prethodni: number | null;
  readonly sljedeci: number | null;
}

/** Polozaj odabranog nalaza unutar filtra: "1 od 1" kad je filtar Citati s jednim nalazom. */
export function polozaj(indeksi: readonly number[], odabran: number): Polozaj {
  if (!indeksi.length) return { k: 0, oznaka: '0 od 0', prethodni: null, sljedeci: null };
  const k = Math.max(0, indeksi.indexOf(odabran));
  return {
    k,
    oznaka: `${k + 1} od ${indeksi.length}`,
    prethodni: k > 0 ? indeksi[k - 1] : null,
    sljedeci: k < indeksi.length - 1 ? indeksi[k + 1] : null,
  };
}

/* ------------------------------------------------------------------ plan */

/** Stavka popravka kako je drzi tok popravka; `RepairableItem` je zadovoljava strukturno. */
export interface LiveStavka extends PlanItemInput {
  readonly fixerId?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface ZahvatPlana {
  readonly ruleId: string;
  readonly label: string;
  /** `siguran` je zadano u planu; `odluka` trazi izricitu potvrdu pa je zadano izvan plana. */
  readonly vrsta: 'siguran' | 'odluka';
  readonly matchKeys: readonly string[];
}

/**
 * Zahvati koje plan smije nuditi. ISTA klasifikacija kao `buildRepairPlan` (`repair-plan.ts`) i
 * `defaultSelectedItems`: drugo pravilo ovdje znacilo bi da ladica obecava jedno, a popravak radi
 * drugo. Neprekrsene stavke bez preporuke ("uskladi sve") ne ulaze.
 */
export function zahvatiPlana(stavke: readonly LiveStavka[], popravakDostupan: boolean): ZahvatPlana[] {
  if (!popravakDostupan) return [];
  const out: ZahvatPlana[] = [];
  for (const s of stavke) {
    const vrsta = s.requiresConfirmation === true ? 'odluka'
      : s.violated !== false ? 'siguran'
        : s.recommended === true ? 'odluka'
          : null;
    if (vrsta) out.push({ ruleId: s.ruleId, label: s.label, vrsta, matchKeys: s.matchKeys ?? [] });
  }
  return out;
}

/** Zadani plan: sigurni zahvati ukljuceni, odluke iskljucene (Z34 tocka 6). */
export function pocetniOdabir(zahvati: readonly ZahvatPlana[]): Set<string> {
  return new Set(zahvati.filter((z) => z.vrsta === 'siguran').map((z) => z.ruleId));
}

type UlogaNalaza =
  | { readonly kind: 'zahvat'; readonly ruleIds: readonly string[]; readonly label: string }
  | { readonly kind: 'rucno' }
  | { readonly kind: 'bez' };

/**
 * Sto kartica nalaza nudi. Veza nalaz -> zahvat je ISTA koju koriste plan i znacka popravljivosti
 * (`matchKeys`). Rucni nalaz je onaj koji `buildRepairPlan` stavlja pod "Ručno": nijedna stavka ga
 * ne pokriva i nema sposobnost popravka. Sve ostalo (popravljiv nalaz bez stavke u planu) nema
 * kontrolu, jer gumb bez zahvata iza sebe bio bi privid.
 */
export function ulogaNalaza(
  nalaz: Pick<VisualFindingModel, 'matchKeys' | 'status' | 'capabilities'>,
  zahvati: readonly ZahvatPlana[],
): UlogaNalaza {
  const pokrivaju = zahvati.filter((z) => z.matchKeys.some((k) => nalaz.matchKeys.includes(k)));
  if (pokrivaju.length) return { kind: 'zahvat', ruleIds: pokrivaju.map((z) => z.ruleId), label: pokrivaju[0].label };
  if (nalaz.status !== 'ignored' && nalaz.capabilities.repair !== true) return { kind: 'rucno' };
  return { kind: 'bez' };
}

export function uPlanu(uloga: UlogaNalaza, odabir: ReadonlySet<string>): boolean {
  return uloga.kind === 'zahvat' && uloga.ruleIds.some((id) => odabir.has(id));
}

/** Ukljuci ili iskljuci SVE zahvate jednog nalaza; vraca novi odabir, stari ostaje netaknut. */
export function prebaci(uloga: UlogaNalaza, odabir: ReadonlySet<string>): Set<string> {
  const novi = new Set(odabir);
  if (uloga.kind !== 'zahvat') return novi;
  const ukljuci = !uPlanu(uloga, odabir);
  for (const id of uloga.ruleIds) { if (ukljuci) novi.add(id); else novi.delete(id); }
  return novi;
}

/* ------------------------------------------------------------------ prsten i ladica */

interface PrstenModel {
  /** Crveni luk: ocjena sada, u postocima kruga. */
  readonly sada: number;
  /** Kraj zelenog luka: strop. `null` kad strop nije poznat ili nije iznad ocjene. */
  readonly strop: number | null;
  readonly opis: string;
}

const postotak = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

/** Prsten ne prima odabir: strop ne ovisi o tome koji su zahvati ukljuceni. */
export function prsten(ocjena: number | null, strop: number | null): PrstenModel | null {
  if (ocjena === null || !Number.isFinite(ocjena)) return null;
  const sada = postotak(ocjena);
  const gore = strop !== null && Number.isFinite(strop) && postotak(strop) > sada ? postotak(strop) : null;
  return {
    sada,
    strop: gore,
    opis: gore === null ? `Ocjena sada ${sada}` : `Ocjena sada ${sada}, najviše ${gore} ako svi zahvati uspiju`,
  };
}

interface LadicaModel {
  readonly zahvata: number;
  /** "71 → najviše 88"; `null` kad ocjena ili strop nisu poznati. */
  readonly racun: string | null;
}

/**
 * Ladica broji zahvate u planu (samo one koje plan stvarno nudi), a racun je UVIJEK isti strop:
 * ukljucivanje zahvata mijenja broj, ne ocjenu.
 */
export function ladica(
  odabir: ReadonlySet<string>,
  zahvati: readonly ZahvatPlana[],
  ocjena: number | null,
  strop: number | null,
): LadicaModel {
  const p = prsten(ocjena, strop);
  return {
    zahvata: zahvati.filter((z) => odabir.has(z.ruleId)).length,
    racun: p && p.strop !== null ? `${p.sada} → najviše ${p.strop}` : null,
  };
}

/* ------------------------------------------------------------------ Sada / Nakon plana */

interface Margine { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }

export interface IzgledStranice {
  readonly font: string | null;
  readonly velicinaPt: number | null;
  readonly margine: Margine | null;
  readonly prored: number | null;
  readonly brojStranice: boolean;
}

/** Vrste zahvata koje stranica zna pokazati; samo one koje stvarno postoje u planu. */
type VidljivZahvat = 'font' | 'margine' | 'prored' | 'broj';

interface LivePreviewParagraph {
  readonly index?: unknown;
  readonly text?: unknown;
  readonly headingLevel?: unknown;
  readonly pageBreakAfter?: unknown;
  readonly lineHeight?: unknown;
}

export interface LivePreview {
  readonly paragraphs?: readonly LivePreviewParagraph[];
  readonly truncated?: unknown;
  readonly baseFont?: unknown;
  readonly baseSize?: unknown;
  readonly page?: { readonly margins?: unknown; readonly size?: unknown } | null;
}

const broj = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tekst = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function margineIz(v: unknown): Margine | null {
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  const [top, right, bottom, left] = [broj(m.top), broj(m.right), broj(m.bottom), broj(m.left)];
  if (top === null || right === null || bottom === null || left === null) return null;
  if ([top, right, bottom, left].some((x) => x < 0 || x > 10)) return null;
  return { top, right, bottom, left };
}

/** Najcesci prored odlomaka koji ga nose; `null` kad ga nijedan ne nosi. */
function dominantniProred(odlomci: readonly LivePreviewParagraph[]): number | null {
  const brojac = new Map<number, number>();
  for (const p of odlomci) {
    const lh = broj(p.lineHeight);
    if (lh !== null && lh > 0 && lh < 5) brojac.set(lh, (brojac.get(lh) ?? 0) + 1);
  }
  let najbolji: number | null = null;
  let n = 0;
  brojac.forEach((c, lh) => { if (c > n) { n = c; najbolji = lh; } });
  return najbolji;
}

/** Stranica SADA: stvarni font, velicina, margine i prored iz pregleda dokumenta. */
export function izgledSada(preview: LivePreview | null): IzgledStranice {
  return {
    font: tekst(preview?.baseFont),
    velicinaPt: broj(preview?.baseSize),
    margine: margineIz(preview?.page?.margins),
    prored: dominantniProred(preview?.paragraphs ?? []),
    brojStranice: false,
  };
}

interface Vidljivo { font?: string; velicinaPt?: number; margine?: Margine; prored?: number; broj?: true }

/** Koje vidljive promjene stavka nosi, iz STVARNIH parametara popravka. */
function vidljivo(s: LiveStavka): Vidljivo {
  const p = s.params ?? {};
  if (s.fixerId === 'font-fixer') {
    const font = tekst(p.fontName);
    const velicina = broj(p.fontSizePt);
    return { ...(font ? { font } : {}), ...(velicina !== null && velicina > 0 ? { velicinaPt: velicina } : {}) };
  }
  if (s.fixerId === 'margins-fixer') {
    const m = margineIz(p);
    return m ? { margine: m } : {};
  }
  if (s.fixerId === 'line-spacing-fixer') {
    const m = broj(p.multiplier);
    return m !== null && m > 0 ? { prored: m } : {};
  }
  if (s.fixerId === 'page-numbering-fixer') return { broj: true };
  return {};
}

function vrsteStavke(s: LiveStavka): VidljivZahvat[] {
  const v = vidljivo(s);
  const out: VidljivZahvat[] = [];
  if (v.font !== undefined || v.velicinaPt !== undefined) out.push('font');
  if (v.margine) out.push('margine');
  if (v.prored !== undefined) out.push('prored');
  if (v.broj) out.push('broj');
  return out;
}

/** Vidljivi zahvati koje plan UOPCE nudi; prazan popis znaci da se preklopnik Sada / Nakon plana ne crta. */
export function vidljiviZahvati(stavke: readonly LiveStavka[], zahvati: readonly ZahvatPlana[]): VidljivZahvat[] {
  const uPlanu = new Set(zahvati.map((z) => z.ruleId));
  const skup = new Set<VidljivZahvat>();
  for (const s of stavke) if (uPlanu.has(s.ruleId)) vrsteStavke(s).forEach((v) => skup.add(v));
  return [...skup];
}

/** Stranica NAKON PLANA: isti tekst, primijenjeni samo ODABRANI zahvati s poznatim parametrima. */
export function izgledNakon(sada: IzgledStranice, stavke: readonly LiveStavka[], odabir: ReadonlySet<string>): IzgledStranice {
  let izgled: IzgledStranice = sada;
  for (const s of stavke) {
    if (!odabir.has(s.ruleId)) continue;
    const v = vidljivo(s);
    izgled = {
      font: v.font ?? izgled.font,
      velicinaPt: v.velicinaPt ?? izgled.velicinaPt,
      margine: v.margine ?? izgled.margine,
      prored: v.prored ?? izgled.prored,
      brojStranice: izgled.brojStranice || v.broj === true,
    };
  }
  return izgled;
}

/* ------------------------------------------------------------------ stranice */

export interface TrakaStranica {
  /** Stvarni broj stranica (Word ga zapisuje u `docProps/app.xml`); `null` kad nije zapisan (tada nema celija). */
  readonly ukupno: number | null;
  /** Stranica (1-based) -> indeksi nalaza na njoj; prazno kad se mjesto ne moze pouzdano odrediti. */
  readonly poStranici: ReadonlyMap<number, readonly number[]>;
  /** Indeksi nalaza koji vrijede za cijeli rad (crvena crta). */
  readonly cijeliRad: readonly number[];
  /** Indeksi nalaza u fusnotama: zaseban koordinatni prostor, nikad pripisan stranici tijela (Codex R5). */
  readonly fusnote: readonly number[];
  /** Indeksi ostalih nalaza kojima se stranica ne moze pripisati: podrucje, nepoznato mjesto, sidro bez karte (Codex R5). */
  readonly bezStranice: readonly number[];
  /** Je li `poStranici` izveden iz Wordovih prijeloma koji se slazu s brojem stranica (i tada je pripis PRIBLIZAN). */
  readonly pouzdano: boolean;
}

const MAX_STRANICA = 2000;

function odlomciPregleda(preview: LivePreview | null): Array<{ index: number; text: string; heading: boolean; prijelom: boolean }> {
  return (preview?.paragraphs ?? [])
    .map((p) => ({
      index: broj(p.index) ?? 0,
      text: typeof p.text === 'string' ? p.text : '',
      heading: typeof p.headingLevel === 'number',
      prijelom: p.pageBreakAfter === true,
    }))
    .filter((p) => p.index >= 1);
}

/**
 * PRIBLIZNA stranica odlomka iz Wordovih tragova prijeloma. `pageBreakAfter` iz analize nosi dva
 * traga koje ovdje nije moguce razlikovati: `w:lastRenderedPageBreak`, koji Word pri zadnjem
 * crtanju upisuje na POCETAK prvog odlomka nove stranice (po jedan na svakoj stranici, pa je u radu
 * spremljenom iz Worda daleko cesci), i eksplicitni `w:br w:type="page"`, iza kojeg nova stranica
 * tek pocinje. Zato odlomak s tragom POCINJE novu stranicu. Uz eksplicitni prijelom, i za odlomak
 * koji se prelama preko dviju stranica, pripis moze biti pomaknut za jednu stranicu, pa natpis
 * kaze "Oko str." (F37). Karta vrijedi SAMO kad pregled nije skracen i kad tako dobiven broj
 * stranica TOCNO odgovara stvarnom; inace traka ne tvrdi stranicu koju ne zna.
 */
function kartaStranica(preview: LivePreview | null, ukupno: number): Map<number, number> | null {
  if (preview?.truncated === true) return null;
  const odlomci = odlomciPregleda(preview);
  if (!odlomci.length) return null;
  const karta = new Map<number, number>();
  let stranica = 1;
  odlomci.forEach((p, k) => {
    // Trag na prvom odlomku ne otvara drugu stranicu: ispred njega nema teksta.
    if (p.prijelom && k > 0) stranica += 1;
    karta.set(p.index, stranica);
  });
  return stranica === ukupno ? karta : null;
}

function sidroOdlomka(scope: FindingScope): number | null {
  if (scope.kind !== 'anchor' || scope.footnoteId != null) return null;
  const p = Math.floor(scope.paragraphIndex);
  return Number.isFinite(p) && p >= 1 ? p : null;
}

/**
 * Traka stranica. Svaki nalaz zavrsi u TOCNO jednoj skupini (stranica, cijeli rad, fusnote, bez
 * stranice), pa traka nikad ne izgubi nalaz bez objasnjenja (Codex R5). Bez stvarnog broja stranica
 * (`ukupno: null`) nema celija, ali skupine ostaju.
 */
export function trakaStranica(
  preview: LivePreview | null,
  storedPages: unknown,
  nalazi: readonly DeskItem[],
): TrakaStranica {
  const zapisano = broj(storedPages);
  const ukupno = zapisano === null || zapisano < 1 || zapisano > MAX_STRANICA || Math.floor(zapisano) !== zapisano ? null : zapisano;
  const karta = ukupno === null ? null : kartaStranica(preview, ukupno);
  const poStranici = new Map<number, number[]>();
  const cijeliRad: number[] = [];
  const fusnote: number[] = [];
  const bezStranice: number[] = [];
  nalazi.forEach((it, i) => {
    const scope = it.finding.scope;
    if (scope.kind === 'document') { cijeliRad.push(i); return; }
    if (scope.kind === 'anchor' && scope.footnoteId != null) { fusnote.push(i); return; }
    const sidro = sidroOdlomka(scope);
    const s = sidro !== null && karta ? karta.get(sidro) : undefined;
    if (s === undefined) { bezStranice.push(i); return; }
    poStranici.set(s, [...(poStranici.get(s) ?? []), i]);
  });
  return { ukupno, poStranici, cijeliRad, fusnote, bezStranice, pouzdano: karta !== null };
}

/** Stranica nalaza na traci, kad je pripisana; inace `null`. */
export function stranicaNalaza(traka: TrakaStranica, i: number): number | null {
  for (const [s, ind] of traka.poStranici) if (ind.includes(i)) return s;
  return null;
}

const velikoSlovo = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * NATPIS MJESTA iznad stranice rada (Codex R4, R5). Govori o NALAZU, ne o prikazanom ulomku:
 * nalaz za cijeli rad prikazuje pocetak tijela, ali natpis kaze "Cijeli rad", ne "Oko str. 1".
 * Stranica se pise samo kad je nalaz STVARNO pripisan (sidro na karti prijeloma), i to "Oko".
 */
export function natpisMjesta(scope: FindingScope, s: Pick<StranicaPrikaza, 'broj' | 'sidro'>, traka: TrakaStranica): string {
  if (scope.kind === 'document') return 'Cijeli rad';
  if (scope.kind === 'region') return velikoSlovo(scope.label);
  if (scope.kind === 'unavailable') return 'Mjesto nije poznato';
  if (scope.footnoteId != null) return `Bilješka ${scope.footnoteId}`;
  if (s.sidro === null) return `Odlomak ${scope.paragraphIndex}, izvan pregleda`;
  return s.broj !== null && traka.ukupno !== null ? `Oko str. ${s.broj} od ${traka.ukupno}` : `Odlomak ${scope.paragraphIndex}`;
}

/** Desna oznaka glave trake za odabrani nalaz: pripisana stranica, ili skupina u kojoj nalaz jest. */
export function oznakaTrake(scope: FindingScope, stranica: number | null): string {
  if (stranica !== null) return `Oko str. ${stranica}`;
  if (scope.kind === 'document') return 'Cijeli rad';
  if (scope.kind === 'anchor' && scope.footnoteId != null) return `Bilješka ${scope.footnoteId}`;
  return 'Stranica nije poznata';
}

interface StranicaPrikaza {
  readonly odlomci: ReadonlyArray<{ readonly index: number; readonly text: string; readonly heading: boolean }>;
  /** Broj stranice kad ga traka pouzdano zna; inace `null`. */
  readonly broj: number | null;
  /** Odlomak na koji se zumira; `null` kad nalaz nema sidro u prikazanom tekstu (tada nema zuma). */
  readonly sidro: number | null;
}

const PROZOR = 8;

/**
 * Tekst stranice uz odabrani nalaz. S pouzdanom kartom to su odlomci te stranice; bez nje prozor
 * odlomaka oko sidra. Nalaz bez sidra dobiva pocetak tijela rada (prvi naslov 1. razine), bez zuma.
 */
export function stranicaZaNalaz(
  preview: LivePreview | null,
  scope: FindingScope,
  traka: TrakaStranica | null,
): StranicaPrikaza {
  const odlomci = odlomciPregleda(preview).filter((p) => p.text.trim());
  if (!odlomci.length) return { odlomci: [], broj: null, sidro: null };
  const sidro = sidroOdlomka(scope);
  const karta = traka?.pouzdano && traka.ukupno !== null ? kartaStranica(preview, traka.ukupno) : null;
  const uTekstu = sidro !== null ? odlomci.findIndex((p) => p.index === sidro) : -1;
  const bez = ({ index, text, heading }: { index: number; text: string; heading: boolean }) => ({ index, text, heading });
  if (uTekstu >= 0 && sidro !== null) {
    const s = karta?.get(sidro) ?? null;
    if (s !== null && karta) {
      return { odlomci: odlomci.filter((p) => karta.get(p.index) === s).map(bez), broj: s, sidro };
    }
    const od = Math.max(0, uTekstu - 2);
    return { odlomci: odlomci.slice(od, od + PROZOR).map(bez), broj: null, sidro };
  }
  const prviNaslov = odlomci.findIndex((p) => p.heading);
  const od = prviNaslov >= 0 ? prviNaslov : 0;
  const s = karta?.get(odlomci[od].index) ?? null;
  const dio = s !== null && karta ? odlomci.filter((p) => karta.get(p.index) === s) : odlomci.slice(od, od + PROZOR);
  return { odlomci: dio.map(bez), broj: s, sidro: null };
}

/* ------------------------------------------------------------------ rok iz Z32 */

/**
 * Desni dio trake presude: "Rok 14. 10. · još 21 dan" (oblik iz ALIGNMENT Z34). Rok je onaj koji
 * je ulaz (Z32) vezao za OVU sesiju (`rokZaSesiju`). Rubni oblici "danas", "prošao" i "Rok nije
 * zadan" su doslovno iz Z32. "· popravak oko 2 min" iz predloska se NE pise: trajanje popravka
 * nema izvor (F37). `null` kad o roku nije nista receno.
 */
export function rokTekst(rok: RokStanje | null, danas: Date): string | null {
  if (!rok) return null;
  if (rok.neznam) return 'Rok nije zadan';
  if (!rok.datum) return null;
  const d = razloziDatum(rok.datum);
  const dana = danaDoRoka(rok.datum, danas);
  if (!d || dana === null) return null;
  const kada = dana < 0 ? 'prošao' : dana === 0 ? 'danas' : `još ${daniRijecju(dana)}`;
  return `Rok ${d.dan}. ${d.mjesec}. · ${kada}`;
}
