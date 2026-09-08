/**
 * SHEMA PROZE SINTETICKOG KORPUSA.
 *
 * Proza se pise JEDNOM, izvan ovog repozitorija i izvan bilo kakvog pipelinea, i ovdje ulazi kao
 * PODATAK. U repozitoriju nema modela ni prompta; tvrdo pravilo "Lekta nikad ne generira sadrzaj
 * rada" govori o KORISNIKOVU radu, a ovo su testni ulazi, ali granica se cuva i mehanicki: nijedan
 * generator ne poziva model, a nijedan redak proze ne smije postati izvor bodovanog pravila.
 *
 * Zasto shema uopce postoji. Sinteticki dokument nosi samo oblike na koje je autor pomislio, pa je
 * jedina obrana popis onoga sto tekst MORA sadrzavati da bi mjerenje bilo netrivijalno: kose padeze
 * unakrsnih uputa, numeriranu bibliografiju s inicijalima, natpis vrste rada velikim slovima,
 * fusnote za pravnu obitelj. Sve su to oblici na kojima je motor stvarno padao na stvarnim radovima.
 *
 * DOI-jevi su namjerno mjesoviti: bez stvarnog DOI-ja provjera postojanja nikad ne vrati `found`, a
 * bez izmisljenog nikad `not-found`, pa bi gard bio zelen nad populacijom koja mu ne moze pasti.
 */

export type ProseFamily = 'social' | 'stem' | 'biomed' | 'arts' | 'legal';
export type DoiKind = 'real' | 'fake' | 'none';

export interface ProseReference {
  /** Cijeli zapis, onako kako stoji u popisu literature (bez rednog broja). */
  text: string;
  doi?: string;
  doiKind: DoiKind;
}

export interface ProseChapter {
  level: number;
  title: string;
  paragraphs: string[];
}

/**
 * Prikaz nosi i IZVOR, jer ga fakultetsko pravilo trazi kao zaseban redak.
 *
 * Izmjereno 2026-09-06 na pilotu: provjera `element.source` trazi odlomak oblika `Izvor: ...` po
 * svakom prikazu i vratila je "0 oznaka Izvor/Source za 6 elemenata". Da polje ostane neobavezno,
 * svih 60 tijela nosilo bi isti nedostatak, pa bi mjerenje mjerilo nasu propust, ne motor.
 *
 * Izvor je SADRZAJ, ne struktura: zna ga samo autor rada, i Katedrin `fix_rules.py` ga izricito
 * vodi kao nepopravljiv iz istog razloga. Zato ide u prozu, a ne u graditelja.
 */
export interface ProseTable {
  n: number;
  caption: string;
  rows: string[][];
  /** Redak ispod prikaza; za vlastiti prikaz uobicajeno "Izrada autora." */
  source: string;
}

export interface ProseFigure {
  n: number;
  caption: string;
  source: string;
}

export interface ProseBody {
  id: string;
  unitId: string;
  workType: string;
  level: string;
  program: string;
  family: ProseFamily;
  topic: string;
  authoring: { method: string; tool: string; date: string };
  titlePage: { author: string; mentor: string; title: string; label: string };
  abstract: { hr: string; en: string };
  keywords: { hr: string[]; en: string[] };
  chapters: ProseChapter[];
  tables: ProseTable[];
  figures: ProseFigure[];
  footnotes: string[];
  bibliography: ProseReference[];
  /** Recenice s OCEKIVANIM nalazom linta; odvojene od tijela, da tijelo ostane cisto. */
  grammarSeeds?: Array<{ sentence: string; expectKind: string }>;
  /**
   * Presuda za svaki nalaz linta nad CISTIM tijelom. Prazan popis znaci "lint nad tijelom sutii";
   * nalaz koji nije ovdje presudjen je NALAZ, ne dopusteno odstupanje.
   */
  adjudicated?: Array<{ sentence: string; verdict: 'lint-wrong' | 'prose-wrong' }>;
}

/** Najmanji broj stavki literature; ispod toga `reference.min-count` pada na vecini profila. */
const MIN_REFERENCES = 15;
const MAX_REFERENCES = 25;
/** Najmanje kosih unakrsnih uputa; RE-58 je nastao upravo na njima. */
const MIN_OBLIQUE = 3;

const OBLIQUE_REFERENCE =
  /\b(?:u|na|prema|iz|o|pod|uz)\s+(?:Tablic(?:i|u)|Slic(?:i|u)|Grafikon(?:u|a)|Prilog(?:u|a)|Shem(?:i|u))\s+\d+/gi;

/**
 * Obrasci osobnih podataka koji u sinteticku prozu ne smiju uci.
 *
 * Ime izmisljene osobe stroj ne moze provjeriti i zato se ne pretvara da moze; provjerava se ono
 * sto se DA provjeriti, a za ostalo stoji izricita tvrdnja autora u `authoring.method`.
 */
const OIB = /\b\d{11}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const URL = /\bhttps?:\/\//i;

/** Natpis vrste rada koji naslovnica mora nositi, po vrsti rada. */
const NATPIS_PO_VRSTI: Record<string, RegExp> = {
  seminar: /SEMINARSKI RAD/,
  final: /ZAVR[SŠ]NI RAD/,
  graduate: /DIPLOMSKI RAD/,
  specialist: /SPECIJALISTI[CČ]KI RAD/,
  doctoral: /DOKTORSKI RAD|DISERTACIJA/,
  article: /ZNANSTVENI [CČ]LANAK|RAD/,
  project: /PROJEKTNI RAD|RAD/,
};

/**
 * Sve recenice tijela rada, bez naslova; jedini ulaz koji ide u dokument kao tekst.
 *
 * Poglavlje BEZ `paragraphs` je stvarna autorska pogreska, ne teorijska: nastaje cim se u planu
 * poglavlje vodi kao natpis nad potpoglavljima. Prije 2026-09-07 je zbog toga `validateProseBody`
 * PUCAO uz `Cannot read properties of undefined`, umjesto da vrati imenovan nalaz. Provjera koja
 * pukne nije provjera koja je pala: pad se cita kao kvar alata, pa se trazi na krivom mjestu.
 * Zato se ovdje odsutnost tolerira, a validator je taj koji ju IMENUJE.
 */
export function bodyParagraphs(body: ProseBody): string[] {
  return body.chapters.flatMap((c) => c.paragraphs ?? []);
}

export function wordCount(body: ProseBody): number {
  return bodyParagraphs(body).reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0);
}

/**
 * Provjeri jedno tijelo proze. Vraca IMENOVANE nalaze; prazan niz znaci da je tijelo upotrebljivo.
 *
 * Nalazi su imenovani, ne prebrojani, jer se broj zna zadrzati dok se sastav promijeni (izmjereno
 * 2026-08-31 na blokatorima citatnih dosjea).
 */
export function validateProseBody(body: ProseBody): string[] {
  const nalazi: string[] = [];
  const push = (s: string) => nalazi.push(s);

  if (!body.id) push('nema id');
  if (!body.unitId) push('nema unitId');
  if (!body.workType) push('nema workType');
  if (!body.authoring?.method || !body.authoring?.tool || !body.authoring?.date) {
    push('nepotpun `authoring` blok (metoda, alat, datum)');
  }

  const natpis = NATPIS_PO_VRSTI[body.workType];
  if (natpis && !natpis.test(String(body.titlePage?.label ?? ''))) {
    push(`natpis naslovnice "${body.titlePage?.label ?? ''}" ne odgovara vrsti rada ${body.workType}`);
  }

  if (!body.abstract?.hr?.trim()) push('nema sazetak na hrvatskom');
  if (!body.abstract?.en?.trim()) push('nema sazetak na engleskom');
  if ((body.keywords?.hr?.length ?? 0) < 3) push('manje od tri kljucne rijeci (hr)');
  if ((body.keywords?.en?.length ?? 0) < 3) push('manje od tri kljucne rijeci (en)');

  const paragraphs = bodyParagraphs(body);
  if (!paragraphs.length) push('nema nijedan odlomak tijela');
  // Poglavlje bez ijednog odlomka imenuje se POSEBNO. Zbroj odlomaka moze biti uredan dok jedno
  // poglavlje ostane prazno, pa bi ga provjera nad zbrojem propustila; u dokumentu bi tada stajao
  // naslov bez teksta, sto je oblik koji analiza vidi a autor ne primijeti.
  for (const c of body.chapters ?? []) {
    if (!(c.paragraphs?.length ?? 0)) push(`poglavlje "${c.title}" nema nijedan odlomak`);
  }
  const vidjeni = new Set<string>();
  let ponovljeni = 0;
  for (const p of paragraphs) {
    const key = p.trim();
    if (vidjeni.has(key)) ponovljeni += 1;
    vidjeni.add(key);
  }
  // Ponovljeni odlomci ubijaju sidra: popravak sidri po otisku odlomka, pa dva ista odlomka daju
  // dvosmisleno sidro i zahvat se odbaci. Izmjereno kao razred pri izradi tabstop fixture.
  if (ponovljeni > 0) push(`${ponovljeni} ponovljen(ih) odlomaka; sidra traze jedinstvene odlomke`);

  const tekst = paragraphs.join('\n');
  const kosi = (tekst.match(OBLIQUE_REFERENCE) ?? []).length;
  if (kosi < MIN_OBLIQUE) push(`samo ${kosi} kosih unakrsnih uputa, treba barem ${MIN_OBLIQUE}`);

  if ((body.tables?.length ?? 0) < 2) push('manje od dvije tablice');
  if ((body.figures?.length ?? 0) < 2) push('manje od dvije slike');
  for (const t of body.tables ?? []) {
    if (!/^Tablica\s+\d+/.test(t.caption)) push(`natpis tablice ne pocinje "Tablica N": ${t.caption}`);
    if (!t.source?.trim()) push(`tablica ${t.n} nema izvor; provjera element.source trazi redak "Izvor: ..."`);
  }
  for (const f of body.figures ?? []) {
    if (!/^Slika\s+\d+/.test(f.caption)) push(`natpis slike ne pocinje "Slika N": ${f.caption}`);
    if (!f.source?.trim()) push(`slika ${f.n} nema izvor; provjera element.source trazi redak "Izvor: ..."`);
  }

  if (body.family === 'legal' && (body.footnotes?.length ?? 0) < 3) {
    push('pravna obitelj bez barem tri fusnote; citatni motor ondje boduje bas njih');
  }

  const refs = body.bibliography ?? [];
  if (refs.length < MIN_REFERENCES || refs.length > MAX_REFERENCES) {
    push(`literatura ima ${refs.length} stavki, treba ${MIN_REFERENCES} do ${MAX_REFERENCES}`);
  }
  const kinds = new Set(refs.map((r) => r.doiKind));
  if (!kinds.has('real')) push('nijedan DOI nije `real`; provjera postojanja nikad ne vrati `found`');
  if (!kinds.has('fake')) push('nijedan DOI nije `fake`; provjera postojanja nikad ne vrati `not-found`');
  for (const r of refs) {
    if (r.doiKind !== 'none' && !r.doi) push(`stavka bez DOI-ja a doiKind je ${r.doiKind}: ${r.text.slice(0, 40)}`);
    if (r.doiKind === 'none' && r.doi) push(`stavka ima DOI a doiKind je none: ${r.text.slice(0, 40)}`);
  }

  const sve = [tekst, body.abstract?.hr ?? '', body.abstract?.en ?? '', ...refs.map((r) => r.text)].join('\n');
  if (OIB.test(sve)) push('tekst sadrzi jedanaesteroznamenkasti broj (moguc OIB)');
  if (EMAIL.test(sve)) push('tekst sadrzi adresu e-poste');
  if (URL.test(tekst)) push('tijelo rada sadrzi URL; poveznice idu u literaturu, ne u prozu');

  return nalazi;
}

/**
 * Redak matrice onako kako ga proza SMIJE opisati; namjerno uzak, da ovaj modul ne ovisi o
 * `scripts/corpus-gen/rows.mts` (koji vuce cijeli registar profila i ne smije u ovaj sloj).
 */
export interface ProseRowClaim {
  id: string;
  unitId: string;
  workType: string;
  level: string;
  family: string;
}

/**
 * USPOREDBA PROZE S RETKOM MATRICE: opisuje li tijelo samo sebe onako kako ga matrica vodi.
 *
 * `validateProseBody` provjerava tijelo SAMO PREMA SEBI, pa je do 2026-09-08 prozno tijelo moglo
 * tvrditi bilo koji `unitId`, `workType`, `level` ili `family` i nista to ne bi prijavilo. Generator
 * prozu dohvaca po IMENU DATOTEKE, dakle po `row.id`, pa se `id` implicitno poklapa; sve ostalo je
 * bilo slobodan tekst.
 *
 * IZMJERENO pri uvodjenju: od devet napisanih tijela jedno se razilazilo
 * (`algebra--specialist--poslijediplomski`: proza `social`, redak `mixed`) i to je stajalo
 * neprimijeceno dva dana. Ucinak je danas nikakav, jer graditelj `body.family` uopce ne cita (cita
 * ga samo pravilo o fusnotama pravne obitelji), i upravo je to razlog zbog kojeg gard treba: polje
 * koje nitko ne cita ne ispravlja se samo, a prvi potrosac koji ga procita naslijedit ce krivu
 * vrijednost bez ijedne poruke.
 *
 * Vraca IMENOVANE nalaze, ne brojku, jer se zbroj zna zadrzati dok se sastav promijeni.
 */
export function validateProseAgainstRow(body: ProseBody, row: ProseRowClaim): string[] {
  const nalazi: string[] = [];
  const usporedi = (polje: string, uProzi: unknown, uRetku: unknown) => {
    if (String(uProzi ?? '') !== String(uRetku ?? '')) {
      nalazi.push(`${polje}: proza tvrdi "${String(uProzi ?? '')}", matrica vodi "${String(uRetku ?? '')}"`);
    }
  };
  usporedi('id', body.id, row.id);
  usporedi('unitId', body.unitId, row.unitId);
  usporedi('workType', body.workType, row.workType);
  usporedi('level', body.level, row.level);
  usporedi('family', body.family, row.family);
  return nalazi;
}
