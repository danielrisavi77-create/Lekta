/**
 * FAKSIMIL: SVE U JEDNOM (ALIGNMENT Z35): MODEL. Cist, bez DOM-a; sve odluke o tome STO se crta
 * zive ovdje, a `facsimile-live.ts` ih samo iscrtava.
 *
 * ISTINITOST PRIJE PREDLOSKA. Predlozak crta izmisljen rad (41 stranica, 6 nalaza, tocke na
 * fiksnim postocima). Ovdje svaki podatak ima izvor:
 *  - stranice i tekst su odlomci pregleda dokumenta (`result.preview`), podijeljeni Wordovim
 *    tragovima prijeloma ISTOM kartom kao Z34 (`kartaStranica`); pripis je PRIBLIZAN, pa natpis
 *    kaze "Oko str." (F37). Bez pouzdane karte nema broja stranice nego raspon odlomaka;
 *  - bilješke i tocke su STVARNI nalazi; tocka postoji samo uz nalaz sa sidrom na tom listu, a nalaz
 *    za cijeli rad ima biljesku bez tocke i bez niti (nema retka na koji bi pokazivao);
 *  - povecalo cita stvarni stil odlomka (pismo, velicina, prored, poravnanje); sto pregled ne nosi,
 *    ne pise se;
 *  - "poslije", duh pravilnika i mjerne linije dolaze iz STVARNIH parametara popravka (isti izvor
 *    kao Z34 `izgledNakon`); bez njih sloja nema.
 */
import { pluralHr } from '../results/plural-hr';
import type { VisualFindingModel } from '../results/visual-result-model';
import {
  izgledNakon, kartaStranica, ladica, uPlanu, vidljiviZahvati,
  type IzgledStranice, type LivePreview, type LiveStavka, type TrakaStranica, type UlogaNalaza, type ZahvatPlana,
} from '../result-live/result-live-model';

/* ------------------------------------------------------------------ sirine (Z35, Z37) */

/**
 * Tocke loma su iz Z37 (600, 760, 900, 1024, 1180, 1440) i NE izmisljaju se nove. Z37 ima prednost
 * pred Z35: na 768 px biljeske su popis ispod stranice (Z35 bi ih drzao uz stranicu), pa biljeske
 * idu uz stranicu tek od 900 px. Kartica je uz stranicu od 1180 px.
 */
export const SIRINA_KARTICE = 1180;
export const SIRINA_BILJESKI = 900;
/** Ispod ovoga nema lampe, povecala ni konca (Z35). */
export const SIRINA_LAMPE = 760;

export interface Raspored {
  readonly biljeske: 'uz' | 'popis';
  readonly kartica: 'uz' | 'ispod';
  /** Lampa i povecalo: samo misem (`hover: hover`) i od 760 px; polozen mobitel nema ni jedno. */
  readonly lampa: boolean;
  /** Konac postoji samo kad su biljeske uz stranicu (ima ga izmedju cega razvuci). */
  readonly konac: boolean;
  /** Polozen mobitel (Z37) nema `position: sticky`. */
  readonly sticky: boolean;
}

export function raspored(sirina: number, visina: number, mis: boolean): Raspored {
  const polozen = visina <= 500 && sirina > visina;
  const uz = !polozen && sirina >= SIRINA_BILJESKI;
  const karticaUz = !polozen && sirina >= SIRINA_KARTICE;
  return {
    biljeske: uz ? 'uz' : 'popis',
    kartica: karticaUz ? 'uz' : 'ispod',
    lampa: mis && !polozen && sirina >= SIRINA_LAMPE,
    konac: uz,
    sticky: karticaUz,
  };
}

/* ------------------------------------------------------------------ odlomci i stranice */

type Poravnanje = 'lijevo' | 'desno' | 'u sredini' | 'obostrano';

/** Odlomak kako ga faksimil crta: stvarni tekst i stvarni stil iz pregleda dokumenta. */
export interface FxOdlomak {
  readonly index: number;
  readonly text: string;
  readonly razina: number | null;
  readonly font: string | null;
  readonly pt: number | null;
  readonly prored: number | null;
  readonly poravnanje: Poravnanje | null;
  readonly podebljano: boolean;
  readonly kurziv: boolean;
  /** Razmak prije i poslije odlomka u tockama, kad ga dokument zadaje. */
  readonly prije: number | null;
  readonly poslije: number | null;
}

export interface FxStranica {
  /** Wordova stranica (priblizna) kad je karta pouzdana; inace `null`. */
  readonly broj: number | null;
  readonly odlomci: readonly FxOdlomak[];
}

export interface FxStranice {
  readonly stranice: readonly FxStranica[];
  /** Stvarni broj stranica kad je karta pouzdana; inace `null`. */
  readonly ukupno: number | null;
  readonly pouzdano: boolean;
  /** Odlomak (i prazan) -> polozaj lista u `stranice`. */
  readonly polozaj: ReadonlyMap<number, number>;
}

interface Run { readonly text?: unknown; readonly bold?: unknown; readonly italic?: unknown; readonly font?: unknown }

/** Pregled kako ga faksimil cita; sve je `unknown`, jer rezultat dolazi iz pohrane i nije tipiziran. */
export interface FxPreview extends LivePreview {
  readonly paragraphs?: ReadonlyArray<NonNullable<LivePreview['paragraphs']>[number] & {
    readonly align?: unknown;
    readonly size?: unknown;
    readonly spaceBefore?: unknown;
    readonly spaceAfter?: unknown;
    readonly runs?: unknown;
  }>;
}

const broj = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pozitivan = (v: unknown, max: number): number | null => {
  const n = broj(v);
  return n !== null && n > 0 && n <= max ? n : null;
};
const ime = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

const PORAVNANJE: Readonly<Record<string, Poravnanje>> = {
  both: 'obostrano', distribute: 'obostrano', left: 'lijevo', start: 'lijevo', right: 'desno', end: 'desno', center: 'u sredini',
};

/** Pismo s najvise teksta medju runovima; `null` kad nijedan run ne nosi ime pisma. */
function pismoRunova(runovi: readonly Run[]): string | null {
  const duljina = new Map<string, number>();
  for (const r of runovi) {
    const f = ime(r.font);
    const t = typeof r.text === 'string' ? r.text.length : 0;
    if (f && t) duljina.set(f, (duljina.get(f) ?? 0) + t);
  }
  let najbolje: string | null = null;
  let n = 0;
  duljina.forEach((d, f) => { if (d > n) { n = d; najbolje = f; } });
  return najbolje;
}

function odlomciFaksimila(preview: FxPreview | null): FxOdlomak[] {
  const baznoPismo = ime(preview?.baseFont);
  const baznaVelicina = pozitivan(preview?.baseSize, 200);
  return (preview?.paragraphs ?? []).flatMap((p) => {
    const index = broj(p.index);
    if (index === null || index < 1) return [];
    const runovi = (Array.isArray(p.runs) ? p.runs : []).filter((r): r is Run => typeof r === 'object' && r !== null);
    const sTekstom = runovi.filter((r) => typeof r.text === 'string' && r.text.trim());
    const razina = broj(p.headingLevel);
    return [{
      index,
      text: typeof p.text === 'string' ? p.text : '',
      razina: razina !== null && razina >= 1 ? razina : null,
      font: pismoRunova(runovi) ?? baznoPismo,
      pt: pozitivan(p.size, 200) ?? baznaVelicina,
      prored: pozitivan(p.lineHeight, 5),
      poravnanje: typeof p.align === 'string' ? PORAVNANJE[p.align] ?? null : null,
      podebljano: sTekstom.length > 0 && sTekstom.every((r) => r.bold === true),
      kurziv: sTekstom.length > 0 && sTekstom.every((r) => r.italic === true),
      prije: broj(p.spaceBefore) !== null && (p.spaceBefore as number) >= 0 ? p.spaceBefore as number : null,
      poslije: broj(p.spaceAfter) !== null && (p.spaceAfter as number) >= 0 ? p.spaceAfter as number : null,
    }];
  });
}

/** Bez pouzdane karte list nosi najvise ovoliko odlomaka s tekstom; natpis tada kaze raspon odlomaka, ne stranicu. */
const ODLOMAKA_PO_LISTU = 12;

/**
 * Listovi faksimila. S pouzdanom kartom (Wordovi tragovi + 1 = stvarni broj stranica, pregled nije
 * skracen) svaki list je jedna PRIBLIZNA Wordova stranica, i prazna. Bez nje listovi su uzastopni
 * odlomci s tekstom, bez tvrdnje o stranici.
 */
export function stranice(preview: FxPreview | null, traka: TrakaStranica): FxStranice {
  const svi = odlomciFaksimila(preview);
  const karta = traka.pouzdano && traka.ukupno !== null ? kartaStranica(preview, traka.ukupno) : null;
  const polozaj = new Map<number, number>();
  if (karta && traka.ukupno !== null) {
    const listovi: FxOdlomak[][] = Array.from({ length: traka.ukupno }, () => []);
    for (const p of svi) {
      const s = karta.get(p.index);
      if (s === undefined) continue;
      polozaj.set(p.index, s - 1);
      if (p.text.trim()) listovi[s - 1].push(p);
    }
    return { stranice: listovi.map((odlomci, k) => ({ broj: k + 1, odlomci })), ukupno: traka.ukupno, pouzdano: true, polozaj };
  }
  const listovi: FxOdlomak[][] = [];
  for (const p of svi) {
    const zadnji = listovi[listovi.length - 1];
    if (p.text.trim() && (!zadnji || zadnji.length >= ODLOMAKA_PO_LISTU)) listovi.push([]);
    if (!listovi.length) listovi.push([]);
    polozaj.set(p.index, listovi.length - 1);
    if (p.text.trim()) listovi[listovi.length - 1].push(p);
  }
  // Listovi bez teksta nastaju samo kad cijeli pregled nema teksta; tada nema sto crtati.
  const imaTeksta = listovi.some((l) => l.length);
  return { stranice: imaTeksta ? listovi.map((odlomci) => ({ broj: null, odlomci })) : [], ukupno: null, pouzdano: false, polozaj };
}

/** Natpis lista iznad stranice: "Oko str. 7 od 41" ili raspon odlomaka kad stranica nije poznata. */
export function natpisLista(st: FxStranice, k: number): string {
  const s = st.stranice[k];
  if (!s) return '';
  if (s.broj !== null && st.ukupno !== null) return `Oko str. ${s.broj} od ${st.ukupno}`;
  const prvi = s.odlomci[0]?.index;
  const zadnji = s.odlomci[s.odlomci.length - 1]?.index;
  if (prvi === undefined || zadnji === undefined) return '';
  return prvi === zadnji ? `Odlomak ${prvi}` : `Odlomci ${prvi} do ${zadnji}`;
}

/* ------------------------------------------------------------------ nalazi na listu */

type Nalaz = Pick<VisualFindingModel, 'id' | 'scope' | 'status' | 'matchKeys' | 'capabilities'>;

/** Odlomak tijela na koji nalaz pokazuje; fusnota, podrucje i nepoznato mjesto nemaju sidro na listu. */
export function sidro(f: Pick<VisualFindingModel, 'scope'>): number | null {
  const s = f.scope;
  if (s.kind !== 'anchor' || s.footnoteId != null) return null;
  const p = Math.floor(s.paragraphIndex);
  return Number.isFinite(p) && p >= 1 ? p : null;
}

/** List na kojem je sidro nalaza; `null` kad nalaz nema sidro ili sidro nije u pregledu. */
export function listNalaza(st: FxStranice, f: Pick<VisualFindingModel, 'scope'>): number | null {
  const p = sidro(f);
  if (p === null) return null;
  const k = st.polozaj.get(p);
  return k === undefined ? null : k;
}

export interface Biljeska {
  readonly i: number;
  /** Odlomak uz koji stoje tocka i nit; `null` za nalaz cijelog rada (biljeska bez tocke). */
  readonly sidro: number | null;
}

/**
 * Biljeske lista: nalazi cijelog rada (vrijede za svaku stranicu, bez tocke) pa nalazi sa sidrom na
 * ovom listu, redom odlomaka. Sidro mora biti odlomak koji je na listu i nacrtan (ima tekst).
 */
export function biljeske(st: FxStranice, k: number, nalazi: readonly Pick<VisualFindingModel, 'scope'>[]): Biljeska[] {
  const naListu = new Set((st.stranice[k]?.odlomci ?? []).map((p) => p.index));
  const cijeli: Biljeska[] = [];
  const usidreni: Biljeska[] = [];
  nalazi.forEach((f, i) => {
    if (f.scope.kind === 'document') { cijeli.push({ i, sidro: null }); return; }
    const p = sidro(f);
    if (p !== null && naListu.has(p)) usidreni.push({ i, sidro: p });
  });
  usidreni.sort((a, b) => (a.sidro ?? 0) - (b.sidro ?? 0) || a.i - b.i);
  return [...cijeli, ...usidreni];
}

/* ------------------------------------------------------------------ plan i red cekanja */

type Uloga = UlogaNalaza;

/**
 * Nalaz je PREKRIZEN kad je u planu (automatski), kad ga je korisnik oznacio "Napravit ću sam", ili
 * kad o njemu vec postoji odluka na presudi (potvrda, zanemarivanje uz razlog). Plan je ZAJEDNICKI
 * sa Z34: iskljucivanje zahvata na presudi vraca nalaz u red.
 */
export function rijesen(f: Pick<Nalaz, 'id' | 'status'>, uloga: Uloga, odabir: ReadonlySet<string>, rucno: ReadonlySet<string>): boolean {
  if (f.status !== 'open') return true;
  if (uloga.kind === 'zahvat') return uPlanu(uloga, odabir);
  return rucno.has(f.id);
}

export interface RedCekanja {
  readonly rijeseno: readonly boolean[];
  readonly n: number;
  /** Pecat "Plan spreman": svi nalazi prekrizeni, i ima ih barem jedan. */
  readonly sve: boolean;
}

export function redCekanja(
  nalazi: readonly Pick<Nalaz, 'id' | 'status'>[],
  uloge: readonly Uloga[],
  odabir: ReadonlySet<string>,
  rucno: ReadonlySet<string>,
): RedCekanja {
  const rijeseno = nalazi.map((f, i) => rijesen(f, uloge[i], odabir, rucno));
  const n = rijeseno.filter(Boolean).length;
  return { rijeseno, n, sve: nalazi.length > 0 && n === nalazi.length };
}

/**
 * Redak uz "Nastavi na plan popravka": broj zahvata u planu i strop. Bez cijene i bez "71 → X"
 * projekcije po zahvatu (F37): strop ne ovisi o odabiru.
 */
export function planRedak(odabir: ReadonlySet<string>, zahvati: readonly ZahvatPlana[], ocjena: number | null, strop: number | null): string {
  const l = ladica(odabir, zahvati, ocjena, strop);
  return `${l.zahvata} ${pluralHr(l.zahvata, ['zahvat', 'zahvata', 'zahvata'])} u planu` + (l.racun ? ` · ${l.racun}` : '');
}

/* ------------------------------------------------------------------ oblik iz plana */

export interface PlanOblika extends IzgledStranice {
  readonly poravnanje: Poravnanje | null;
}

const PRAZNO: IzgledStranice = { font: null, velicinaPt: null, margine: null, prored: null, brojStranice: false };

/**
 * Samo ono sto plan STVARNO mijenja: polje je `null` kad ga nijedna odabrana stavka ne zadaje. Izvor
 * su parametri popravka (Z34 `izgledNakon`) i poravnanje iz `alignment-fixer`.
 */
export function planOblika(stavke: readonly LiveStavka[], odabir: ReadonlySet<string>): PlanOblika {
  let poravnanje: Poravnanje | null = null;
  for (const s of stavke) {
    if (!odabir.has(s.ruleId) || s.fixerId !== 'alignment-fixer') continue;
    const v = s.params?.val;
    if (typeof v === 'string' && PORAVNANJE[v]) poravnanje = PORAVNANJE[v];
  }
  return { ...izgledNakon(PRAZNO, stavke, odabir), poravnanje };
}

/** Duh pravilnika: oblik koji zadaju SVI zahvati plana (pravila), neovisno o odabiru. */
export function duhPravilnika(stavke: readonly LiveStavka[], zahvati: readonly ZahvatPlana[]): PlanOblika | null {
  const d = planOblika(stavke, new Set(zahvati.map((z) => z.ruleId)));
  return d.margine || d.prored !== null || d.brojStranice ? d : null;
}

/** Ima li "Pokaži popravak na stranici" sto pokazati: zahvat nalaza mijenja nesto vidljivo. */
export function popravakVidljiv(uloga: Uloga, stavke: readonly LiveStavka[], zahvati: readonly ZahvatPlana[]): boolean {
  if (uloga.kind !== 'zahvat') return false;
  return vidljiviZahvati(stavke.filter((s) => uloga.ruleIds.includes(s.ruleId)), zahvati).length > 0;
}

/** Odlomak nakon plana: tijelo dobiva pismo, velicinu, prored i poravnanje plana; naslov samo pismo. */
export function odlomakNakon(p: FxOdlomak, plan: PlanOblika): FxOdlomak {
  if (p.razina !== null) return { ...p, font: plan.font ?? p.font };
  return {
    ...p,
    font: plan.font ?? p.font,
    pt: plan.velicinaPt ?? p.pt,
    prored: plan.prored ?? p.prored,
    poravnanje: plan.poravnanje ?? p.poravnanje,
  };
}

/* ------------------------------------------------------------------ brojke */

const zarez = (s: string): string => s.replace('.', ',');
/** Tocke: "11", "10,5". */
const pt = (n: number): string => zarez(String(Math.round(n * 10) / 10));
/** Prored i centimetri: barem jedna decimala, "1,0", "2,5", "1,15". */
const decimalno = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return zarez(Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2));
};

/**
 * Ocitanje povecala, u obliku predloska: "Calibri 11 pt · prored 1,0 · lijevo". Naslov kaze razinu
 * ("naslov 1. razine"), jer pregled nosi razinu, ne ime stila. Sto pregled ne nosi, ne pise se.
 */
export function ocitanje(p: FxOdlomak): string {
  const glava = [p.font, p.pt !== null ? `${pt(p.pt)} pt` : null].filter(Boolean).join(' ');
  const dijelovi = [
    glava || null,
    p.podebljano ? 'podebljano' : null,
    p.razina === null && p.prored !== null ? `prored ${decimalno(p.prored)}` : null,
    p.razina === null ? p.poravnanje : null,
    p.razina !== null ? `naslov ${p.razina}. razine` : null,
  ].filter((d): d is string => !!d);
  return dijelovi.length ? dijelovi.join(' · ') : 'oblik odlomka nije zapisan';
}

/**
 * Natpis mjerne linije lijeve margine. Izmjereno je margina iz dokumenta; "TREBA" samo kad je plan
 * zadaje drukcije; "✓" kad je popravak margine pokazan na stranici. `null` bez izmjerene margine.
 */
export function mjernaOznaka(sada: IzgledStranice, pravilo: PlanOblika | null, pokazan: boolean): string | null {
  const lijevo = sada.margine?.left;
  if (lijevo === undefined) return null;
  const treba = pravilo?.margine?.left;
  if (treba === undefined || Math.abs(treba - lijevo) < 0.005) return `${decimalno(lijevo)} CM`;
  return pokazan ? `${decimalno(treba)} CM ✓` : `${decimalno(lijevo)} CM · TREBA ${decimalno(treba)}`;
}

/** Brojka uz zagradu proreda: izmjereni prored odlomka, kao u ocitanju. */
export function proredOznaka(p: FxOdlomak): string | null {
  return p.prored !== null ? decimalno(p.prored) : null;
}

/* ------------------------------------------------------------------ kartica */

/** Natpisi ozbiljnosti, doslovno iz predloska (`FX_SEV`); "Blokira predaju" samo uz autoritativan profil (kao Z34). */
export function ozbiljnostFx(f: Pick<VisualFindingModel, 'severity'>, autoritativno: boolean): { readonly tekst: string; readonly ton: 'blok' | 'dorada' | 'provjera' } {
  if (f.severity === 'error' && autoritativno) return { tekst: 'BLOKIRA PREDAJU', ton: 'blok' };
  if (f.severity === 'error' || f.severity === 'warning') return { tekst: 'TREBA DORADITI', ton: 'dorada' };
  return { tekst: 'PROVJERI SAM', ton: 'provjera' };
}

export interface Isjecak {
  readonly izvor: string;
  readonly mjesto: string | null;
  readonly recenica: string;
}

/**
 * Isjecak pravilnika postoji SAMO uz verificiran citat (`exactEvidence`). Predlozak podcrtava dio
 * recenice i pise clanak; dokaz nosi cijeli citat i mjesto kako ga izvor pise, pa se podcrtava cijeli
 * citat, a mjesto je `pageLabel` ili "str. N" (F51).
 */
export function isjecak(f: Pick<VisualFindingModel, 'exactEvidence'>): Isjecak | null {
  const e = f.exactEvidence;
  if (!e || !e.quote.trim()) return null;
  const mjesto = e.pageLabel ? e.pageLabel : e.page != null ? `str. ${e.page}` : null;
  return { izvor: e.title, mjesto, recenica: e.quote };
}
