/**
 * T64: `details.inspectionCoverage`, odgovor na pitanje "sto analiza NIJE provjerila".
 *
 * Lekta opasne Word strukture (tekstni okviri, polja upravitelja literature, SDT, formule,
 * revizije, ugradjeni objekti, tablice) namjerno ne dira. "Nisam dirao" nije isto sto i
 * "provjerio sam i ispravno je", ali ni obrnuto: dio koji jedna provjera preskoci druga provjera
 * i dalje cita. Zato svaki preskoceni dio nosi DOSEG (`scope`), tj. tocno tko ga nije procitao.
 *
 * STO JE IZMJERENO (izvor, ne pretpostavka):
 * - Bodovane provjere oblikovanja (font, velicina, prored, poravnanje, naslovi...) grade se nad
 *   `bodyParagraphs(doc)` u `analyzeDocxInternal`, a to je SVAKI `w:p` tijela: celije tablica,
 *   sadrzaj tekstnih okvira, SDT, odlomci s poljima i poveznicama. Test "bodovane provjere citaju
 *   odlomke koje tipografska provjera preskace" u `tests/inspection-coverage.test.ts` to dokazuje
 *   kroz cijeli pipeline.
 * - Provjera `format.typography.consistency` (`analyzeTypographyStructure`) cita SAMO odlomke koji
 *   su izravno dijete `w:body` i nemaju zasticenu strukturu (`protectedParagraph`). Sve ostalo
 *   ona ne vidi. To je jedina provjera s `check.id` koju ovi odlomci zaobilaze.
 * - Prijedlozi popravka za pravne fusnote i slozene tablice preskacu dijelove niske pouzdanosti;
 *   bodovane provjere ih i dalje citaju.
 * - Sadrzaj ugradjenog OLE objekta (`w:object`, npr. Equation 3.0 ili ugradjena tablica) je
 *   binarni dio paketa koji analiza ne otvara, pa ga ne cita nijedna provjera.
 *
 * Dva dijela:
 * - `censusInspectionContainers(doc)` jednim prolazom kroz VEC PARSIRAN DOM razvrstava odlomke
 *   koje tipografska provjera ne cita (isto pravilo kao `extractBodyParagraphs` +
 *   `protectedParagraph`) i broji ugradjene objekte. Nijedna postojeca struktura to ne broji
 *   zbirno, pa je ovo jedini novi prolaz.
 * - `computeInspectionCoverage(...)` je cista agregacija nad popisom, vec izracunatim `details.*`
 *   strukturama i popisom bodovanih provjera.
 *
 * Izlaz nosi samo brojeve, vrste i kratke razloge iz ovog modula, NIKAD tekst rada.
 */
import { bodyParagraphs } from '../docx/parser';

/** Vrste preskocenih dijelova. Stabilni kljucevi; UI ih prevodi, test ih provjerava. */
export type InspectionSkipKind =
  | 'citationField'
  | 'textBox'
  | 'nestedTable'
  | 'tableCell'
  | 'contentControl'
  | 'trackedChange'
  | 'equation'
  | 'fieldOrHyperlink'
  | 'otherStructure'
  | 'embeddedObject'
  | 'legalFootnote'
  | 'complexTable'
  | 'analysisUnavailable';

/**
 * Tko dio NIJE procitao:
 * - `typographyCheck`: samo provjera `format.typography.consistency`; bodovane provjere oblikovanja
 *   odlomke su procitale.
 * - `repairSuggestions`: samo prijedlozi popravka; nijedna provjera s `check.id` nije slijepa.
 * - `noCheck`: sadrzaj ne cita nijedna provjera.
 * - `unknown`: izvor nije izracunat, pa se ne zna.
 */
export type InspectionScope = 'typographyCheck' | 'repairSuggestions' | 'noCheck' | 'unknown';

export type InspectionCoverageStatus = 'fullyChecked' | 'partiallyChecked' | 'manualReviewRequired';

export interface InspectionSkippedPart {
  kind: InspectionSkipKind;
  count: number;
  scope: InspectionScope;
  reason: string;
  /** Stabilni `check.id` iz `src/scoring/check-id-registry.ts` koji taj dio nije procitao, nikad hrvatski naslov. */
  affectedCheckIds: string[];
}

export interface InspectionCoverage {
  version: 1;
  status: InspectionCoverageStatus;
  /** Odlomci koje provjera tehnicko-tipografske dosljednosti nije procitala (bez automatskog sadrzaja). */
  skippedParagraphs: number;
  totalParagraphs: number;
  skippedParts: InspectionSkippedPart[];
}

/** Vrste koje se broje po ODLOMKU (ulaze u `skippedParagraphs`). */
export type ParagraphSkipKind = Extract<InspectionSkipKind,
  'citationField' | 'textBox' | 'nestedTable' | 'tableCell' | 'contentControl' | 'trackedChange' | 'equation' | 'fieldOrHyperlink' | 'otherStructure'>;

/**
 * Prednost pri razvrstavanju: odlomak koji je istodobno u vise spremnika (npr. revizija u celiji
 * tablice, SDT unutar tekstnog okvira) broji se TOCNO jednom, pod prvom vrstom s ovog popisa.
 * Zbroj brojeva po vrstama zato je jednak `skippedParagraphs`. `otherStructure` je zadnji: prima
 * odlomak koji tipografska provjera ne cita, a nijedna prepoznata vrsta ga ne opisuje.
 */
export const PARAGRAPH_KIND_PRIORITY: readonly ParagraphSkipKind[] = [
  'citationField', 'textBox', 'nestedTable', 'tableCell', 'contentControl', 'trackedChange', 'equation', 'fieldOrHyperlink', 'otherStructure',
];

/**
 * Popis nad DOM-om. Samo brojevi; nijedno polje ne nosi tekst.
 *
 * ZASTO POPIS, A NE INDEKSI IZ `skipped[]`. `typographyStructure.skipped` i
 * `consistencyStructure.skipped` oznacavaju odlomke indeksom iz `extractBodyParagraphs`, koji
 * preskace samozatvoreni `<w:p/>` i vidi samo izravnu djecu `w:body`; `linkDoiStructure.skipped`
 * koristi indeks parsera. Ti indeksi nisu ista os, pa bi spajanje po indeksu dvaput brojalo isti
 * odlomak. Popis zato sam primjenjuje pravilo tipografske provjere, a `typographyProtectedTopLevel`
 * sluzi kao unakrsna kontrola: mora biti jednak `typographyStructure.skipped.length` (test nad
 * svim golden fixturama).
 */
export interface InspectionCensus {
  totalParagraphs: number;
  byKind: Record<ParagraphSkipKind, number>;
  /** Broj `w:object` elemenata (bez potisnute `mc:Fallback` grane). */
  embeddedObjects: number;
  /** Izravni odlomci tijela koje tipografska provjera odbaci kao zasticene. */
  typographyProtectedTopLevel: number;
}

/** Ovi izvori trebaju postojati sa `skipped[]` nizom; ako nisu izracunati, stanje je nepoznato. */
export const REQUIRED_SKIP_SOURCES = ['typographyStructure', 'consistencyStructure', 'requiredSectionsStructure', 'linkDoiStructure'] as const;
export type InspectionSource = typeof REQUIRED_SKIP_SOURCES[number] | 'tableFigureRescue' | 'census';

/** Jedina provjera s `check.id` koja preskace odlomke iz popisa. */
export const TYPOGRAPHY_CHECK_ID = 'format.typography.consistency';

/**
 * PRAG ZA RUCNU PROVJERU. `manualReviewRequired` tvrdi da BODOVANI rezultat ne predstavlja rad,
 * pa smije nastati samo kad je slijepa provjera koja u OVOM rezultatu nosi bodove. Danas je to
 * jedino `format.typography.consistency`, i to samo kad profil ima verificirano pravilo (inace
 * je informativna, 0/0). Tada dva uvjeta moraju vrijediti ZAJEDNO:
 * - udio: barem cetvrtina odlomaka. Ispod toga je vecina teksta provjerena i "djelomicno" je
 *   postena rijec; od cetvrtine navise preskoceni dio vise nije rub nego velik dio rada.
 * - apsolutni broj: barem 20 odlomaka. Kratak dokument (npr. 8 odlomaka, 2 u okviru naslovnice)
 *   lako prijedje udio, a da ne postoji nista sto korisnik ne bi pregledao u minuti.
 * Tablice se broje jednako kao ostalo: pravila te provjere (decimalni zarez, postotak, crtice,
 * navodnici) vrijede i za brojeve u celijama.
 * Obje vrijednosti su pocetna procjena (nema presedana u kodu); vlasnik ih moze prilagoditi nakon
 * pregleda stvarnih radova. Kad je ta provjera bodovana, a njezin doseg nije izracunat, doseg je
 * nepoznat, pa je status takodjer `manualReviewRequired`.
 */
export const MANUAL_REVIEW_SKIPPED_RATIO = 0.25;
export const MANUAL_REVIEW_MIN_SKIPPED_PARAGRAPHS = 20;

const TYPOGRAPHY_PREFIX = 'provjera tehničko-tipografske dosljednosti ne čita odlomke';

const REASON: Record<InspectionSkipKind, string> = {
  citationField: `${TYPOGRAPHY_PREFIX} s poljima upravitelja literature (Zotero, Mendeley, EndNote, Citavi)`,
  textBox: `${TYPOGRAPHY_PREFIX} u tekstnim okvirima`,
  nestedTable: `${TYPOGRAPHY_PREFIX} u ugniježđenim tablicama`,
  tableCell: `${TYPOGRAPHY_PREFIX} unutar tablica`,
  contentControl: `${TYPOGRAPHY_PREFIX} u kontrolama sadržaja (SDT) ili customXml`,
  trackedChange: `${TYPOGRAPHY_PREFIX} s praćenim promjenama`,
  equation: `${TYPOGRAPHY_PREFIX} s formulama`,
  fieldOrHyperlink: `${TYPOGRAPHY_PREFIX} s poljima ili poveznicama`,
  otherStructure: `${TYPOGRAPHY_PREFIX} u drugim složenim Word strukturama`,
  embeddedObject: 'sadržaj ugrađenih objekata ne čita nijedna provjera',
  legalFootnote: 'prijedlozi popravka ne obuhvaćaju fusnote bez dovoljno pouzdane pravne strukture',
  complexTable: 'prijedlozi popravka ne obuhvaćaju složene tablice',
  analysisUnavailable: 'dio analize nije bilo moguće izračunati',
};

const SCOPE: Record<InspectionSkipKind, InspectionScope> = {
  citationField: 'typographyCheck',
  textBox: 'typographyCheck',
  nestedTable: 'typographyCheck',
  tableCell: 'typographyCheck',
  contentControl: 'typographyCheck',
  trackedChange: 'typographyCheck',
  equation: 'typographyCheck',
  fieldOrHyperlink: 'typographyCheck',
  otherStructure: 'typographyCheck',
  embeddedObject: 'noCheck',
  legalFootnote: 'repairSuggestions',
  complexTable: 'repairSuggestions',
  analysisUnavailable: 'unknown',
};

const PART_ORDER: readonly InspectionSkipKind[] = [
  ...PARAGRAPH_KIND_PRIORITY, 'embeddedObject', 'legalFootnote', 'complexTable', 'analysisUnavailable',
];

// ---------------------------------------------------------------------------------------------
// Popis nad DOM-om
// ---------------------------------------------------------------------------------------------

type SdtKind = 'citation' | 'toc' | 'other';

/** Otvoreno polje. `members` su odlomci koje polje dotice, da TOC prepoznat tek u kasnijem odlomku oznaci i ranije. */
interface FieldFrame { instr: string; citation: boolean; toc: boolean; members: ParagraphRecord[] }

/** Polja upravitelja literature: Zotero, Mendeley (i stari CSL_CITATION), EndNote, Citavi. */
const CITATION_INSTR = /^\s*ADDIN\s+(?:ZOTERO_|CSL_|Mendeley|EN\.CITE|EN\.REFLIST|CITAVI)/i;
/** Word ugradjeni citat i bibliografija kao polja. */
const WORD_CITATION_INSTR = /^\s*(?:CITATION|BIBLIOGRAPHY)\b/i;
const TOC_INSTR = /^\s*TOC\b/i;
/** Oznake SDT-a koje pisu dodaci upravitelja literature. */
const CITATION_SDT_TAG = /ZOTERO|MENDELEY|CSL_CITATION|CITAVI|ENDNOTE/i;

/**
 * Isti skup kao `protectedParagraph` u `typography-structure.ts`: regex tamo trazi `<w:tbl\b`,
 * `<w:hyperlink\b`... i `<m:oMath\b`, `<w:customXml\b` u doslovnom XML-u odlomka (ukljucivo
 * `mc:Fallback`, bez razlike velikih i malih slova). Ovdje se isto pita nad DOM potomcima po
 * kvalificiranom imenu.
 */
const TYPOGRAPHY_PROTECTED_NAMES = new Set([
  'w:tbl', 'w:hyperlink', 'w:fldchar', 'w:fldsimple', 'w:instrtext', 'w:sdt', 'w:ins', 'w:del',
  'w:movefrom', 'w:moveto', 'w:txbxcontent', 'm:omath', 'w:customxml',
]);

function local(node: Element): string {
  // Neki DOM-ovi (xmldom bez deklariranog prefiksa) vrate `w:p` i kao localName.
  const name = node.localName || node.nodeName;
  return name.split(':').pop() || name;
}

function elementChildren(node: Element): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(node.childNodes ?? [])) if (child.nodeType === 1) out.push(child as Element);
  return out;
}

function valOf(node: Element | undefined): string {
  if (!node) return '';
  return node.getAttribute('w:val') || node.getAttribute('val') || '';
}

function sdtKind(sdt: Element): SdtKind {
  const sdtPr = elementChildren(sdt).find((c) => local(c) === 'sdtPr');
  if (!sdtPr) return 'other';
  const props = elementChildren(sdtPr);
  if (props.some((c) => local(c) === 'citation')) return 'citation';
  if (CITATION_SDT_TAG.test(valOf(props.find((c) => local(c) === 'tag')))) return 'citation';
  const gallery = props.find((c) => local(c) === 'docPartObj');
  const galleryVal = gallery ? valOf(elementChildren(gallery).find((c) => local(c) === 'docPartGallery')) : '';
  if (/table of contents/i.test(galleryVal)) return 'toc';
  return 'other';
}

/**
 * Isti izraz kao `protectedParagraph`. Koristi se SAMO nad komentarima, CDATA odjeljcima i
 * instrukcijama obrade: tamo DOM ne vidi elemente, a regex tipografske provjere nad doslovnim
 * XML-om ih vidi (npr. `<!-- <w:hyperlink> -->`), pa bi popis bez ovoga tvrdio da je odlomak
 * procitan. Elementi se
 * provjeravaju parsiranjem (`TYPOGRAPHY_PROTECTED_NAMES`), ne ovim izrazom.
 */
const TYPOGRAPHY_PROTECTED_IN_RAW_TEXT = /<w:(?:tbl|hyperlink|fldChar|fldSimple|instrText|sdt|ins|del|moveFrom|moveTo|txbxContent)\b|<(?:m:oMath|w:customXml)\b/i;

/** Ima li odlomak zasticenu strukturu zbog koje ga tipografska provjera odbaci? */
function typographyProtected(paragraph: Node): boolean {
  for (const child of Array.from(paragraph.childNodes ?? [])) {
    if (child.nodeType === 1) {
      if (TYPOGRAPHY_PROTECTED_NAMES.has(child.nodeName.toLowerCase())) return true;
      if (typographyProtected(child)) return true;
    } else if (child.nodeType === 8 || child.nodeType === 4 || child.nodeType === 7) {
      if (TYPOGRAPHY_PROTECTED_IN_RAW_TEXT.test((child as CharacterData).data ?? '')) return true;
    }
  }
  return false;
}

interface ParagraphRecord { kinds: Set<ParagraphSkipKind>; toc: boolean; authoredOutsideToc: boolean; topLevel: boolean; protectedTag: boolean }

interface WalkContext {
  tblDepth: number;
  inTxbx: boolean;
  sdt: SdtKind | null;
  inCustomXml: boolean;
  /** Unutar TOC SDT-a na bilo kojoj razini, i kad je najblizi SDT obican. */
  inTocSdt: boolean;
  paragraph: ParagraphRecord | null;
}

function emptyByKind(): Record<ParagraphSkipKind, number> {
  return { citationField: 0, textBox: 0, nestedTable: 0, tableCell: 0, contentControl: 0, trackedChange: 0, equation: 0, fieldOrHyperlink: 0, otherStructure: 0 };
}

/**
 * Jedan prolaz kroz `w:body` u redoslijedu dokumenta. Je li odlomak preskocen odlucuje
 * ISKLJUCIVO pravilo tipografske provjere (izravno dijete `w:body` bez zasticene strukture se
 * cita). Spremnici i polja sluze samo za OPIS vrste preskocenog odlomka. Polja (`w:fldChar`) mogu
 * obuhvatiti vise odlomaka (npr. Zotero bibliografija), pa se stog otvorenih polja vodi kroz
 * cijeli prolaz; srednji odlomak bibliografije bez vlastite oznake polja zato NIJE preskocen, jer
 * ga tipografska provjera cita. Grana `mc:Fallback` uz `mc:Choice` se preskace isto kao u
 * `bodyParagraphs`.
 */
export function censusInspectionContainers(doc: Document): InspectionCensus {
  const body = doc.getElementsByTagName('w:body')[0] as Element | undefined;
  const records: ParagraphRecord[] = [];
  const fields: FieldFrame[] = [];
  let embeddedObjects = 0;

  const openCitation = () => fields.some((f) => f.citation);
  const openToc = () => fields.some((f) => f.toc);
  const inToc = (ctx: WalkContext) => ctx.inTocSdt || ctx.sdt === 'toc' || openToc();

  const markCitation = (ctx: WalkContext) => { if (ctx.paragraph) ctx.paragraph.kinds.add('citationField'); };

  const visit = (node: Element, ctx: WalkContext): void => {
    // Odluke se donose po KVALIFICIRANOM imenu, kao `bodyParagraphs` (`getElementsByTagName('w:p')`):
    // DrawingML `a:p` i `a:tbl` unutar crteza nisu odlomci ni tablice tijela i parser ih ne cita.
    const name = node.nodeName;
    if (local(node) === 'Fallback') {
      // Isto pravilo kao `inSuppressedFallback`: Fallback uz Choice sestru citatelj ne vidi.
      // Fallback bez Choice sestre je jedina reprezentacija, pa se cita.
      const alt = node.parentNode as Element | null;
      if (alt && elementChildren(alt).some((c) => c !== node && local(c) === 'Choice')) return;
    }
    let next = ctx;
    if (name === 'w:p') {
      const record: ParagraphRecord = {
        kinds: new Set(),
        toc: false,
        authoredOutsideToc: false,
        topLevel: node.parentNode === body,
        protectedTag: typographyProtected(node),
      };
      if (ctx.tblDepth >= 2) record.kinds.add('nestedTable');
      else if (ctx.tblDepth === 1) record.kinds.add('tableCell');
      if (ctx.inTxbx) record.kinds.add('textBox');
      if (ctx.sdt === 'citation' || openCitation()) record.kinds.add('citationField');
      else if (ctx.sdt === 'other' || ctx.inCustomXml) record.kinds.add('contentControl');
      if (inToc(ctx)) record.toc = true;
      records.push(record);
      for (const frame of fields) frame.members.push(record);
      next = { ...ctx, paragraph: record };
    } else if (name === 'w:tbl') {
      next = { ...ctx, tblDepth: ctx.tblDepth + 1 };
    } else if (name === 'w:txbxContent') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('textBox');
      next = { ...ctx, inTxbx: true };
    } else if (name === 'w:sdt') {
      const kind = sdtKind(node);
      if (ctx.paragraph) {
        if (kind === 'citation') ctx.paragraph.kinds.add('citationField');
        else if (kind === 'other') ctx.paragraph.kinds.add('contentControl');
        else ctx.paragraph.toc = true;
      }
      // Citatni ili TOC SDT oko vec citatnog konteksta ne spusta razinu.
      const inherited: SdtKind = ctx.sdt === 'citation' ? 'citation' : kind;
      next = { ...ctx, sdt: inherited, inTocSdt: ctx.inTocSdt || kind === 'toc' };
    } else if (name === 'w:customXml') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('contentControl');
      next = { ...ctx, inCustomXml: true };
    } else if (name === 'm:oMath' || name === 'm:oMathPara') {
      if (ctx.paragraph) {
        ctx.paragraph.kinds.add('equation');
        // Formula izvan automatskog sadrzaja je autorski sadrzaj, kao i tekst.
        if (!inToc(ctx)) ctx.paragraph.authoredOutsideToc = true;
      }
    } else if (name === 'w:ins' || name === 'w:del' || name === 'w:moveFrom' || name === 'w:moveTo') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('trackedChange');
    } else if (name === 'w:object') {
      // Sadrzaj OLE objekta je binarni dio paketa; odlomak oko njega tipografska provjera cita.
      embeddedObjects += 1;
    } else if (name === 'w:hyperlink') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
    } else if (name === 'w:fldChar') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
      const type = node.getAttribute('w:fldCharType') || node.getAttribute('fldCharType');
      if (type === 'begin') fields.push({ instr: '', citation: false, toc: false, members: ctx.paragraph ? [ctx.paragraph] : [] });
      else if (type === 'end') fields.pop();
      return;
    } else if (name === 'w:instrText') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
      const top = fields[fields.length - 1];
      if (top) {
        top.instr += node.textContent ?? '';
        if (!top.citation && (CITATION_INSTR.test(top.instr) || WORD_CITATION_INSTR.test(top.instr))) top.citation = true;
        if (!top.toc && TOC_INSTR.test(top.instr)) top.toc = true;
        if (top.citation) markCitation(ctx);
        if (top.toc) for (const member of top.members) member.toc = true;
      }
      return;
    } else if (name === 'w:fldSimple') {
      const instr = node.getAttribute('w:instr') || node.getAttribute('instr') || '';
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
      const frame: FieldFrame = { instr, citation: CITATION_INSTR.test(instr) || WORD_CITATION_INSTR.test(instr), toc: TOC_INSTR.test(instr), members: ctx.paragraph ? [ctx.paragraph] : [] };
      if (frame.citation) markCitation(ctx);
      if (frame.toc && ctx.paragraph) ctx.paragraph.toc = true;
      fields.push(frame);
      for (const child of elementChildren(node)) visit(child, next);
      fields.pop();
      return;
    } else if (name === 'w:t' || name === 'w:delText') {
      // Tekst izvan automatskog sadrzaja (i obrisan u reviziji) je autorski: takav odlomak se
      // prijavljuje i kad nosi TOC polje.
      if (ctx.paragraph && !inToc(ctx) && (node.textContent ?? '').trim()) ctx.paragraph.authoredOutsideToc = true;
      return;
    }
    for (const child of elementChildren(node)) visit(child, next);
  };

  if (body) {
    for (const child of elementChildren(body)) visit(child, { tblDepth: 0, inTxbx: false, sdt: null, inCustomXml: false, inTocSdt: false, paragraph: null });
  }

  const byKind = emptyByKind();
  let typographyProtectedTopLevel = 0;
  for (const record of records) {
    if (record.topLevel && record.protectedTag) typographyProtectedTopLevel += 1;
    if (record.topLevel && !record.protectedTag) continue; // tipografska provjera ga cita
    // Automatski sadrzaj (TOC polje ili SDT) se ne prijavljuje: tekst mu je kopija naslova, koje
    // tipografska provjera cita na izvoru, a sam sadrzaj provjeravaju provjere `toc.*`. Odlomak koji
    // uz sadrzaj nosi i autorski tekst (izvan polja ili SDT-a) se prijavljuje.
    if (record.toc && !record.authoredOutsideToc) continue;
    const primary = PARAGRAPH_KIND_PRIORITY.find((kind) => record.kinds.has(kind)) ?? 'otherStructure';
    byKind[primary] += 1;
  }
  // Nazivnik je ista populacija koju cita parser (`bodyParagraphs`), da udio bude usporediv s
  // onim sto korisnik vidi kao "odlomke" u ostatku rezultata.
  const totalParagraphs = body ? bodyParagraphs(doc).length : 0;
  return { totalParagraphs, byKind, embeddedObjects, typographyProtectedTopLevel };
}

// ---------------------------------------------------------------------------------------------
// Agregacija
// ---------------------------------------------------------------------------------------------

export interface InspectionCoverageInput {
  details: Record<string, unknown> | null | undefined;
  census: InspectionCensus | null | undefined;
  /** Izvori koje je pozivatelj morao zamijeniti praznim fallbackom (npr. catch grana). */
  unavailableSources?: readonly InspectionSource[];
  /**
   * `check.id` provjera koje u OVOM rezultatu nose bodove (`check.scored`). Odlucuje smije li
   * status biti `manualReviewRequired`. Bez popisa se nijedna provjera ne smatra bodovanom, sto
   * status moze samo spustiti s rucne na djelomicnu provjeru, nikad podici na `fullyChecked`.
   */
  scoredCheckIds?: readonly string[];
}

type SkippedLike = { footnoteId?: unknown };

function skippedOf(value: unknown): SkippedLike[] | null {
  if (!value || typeof value !== 'object') return null;
  const skipped = (value as { skipped?: unknown }).skipped;
  return Array.isArray(skipped) ? (skipped as SkippedLike[]) : null;
}

/**
 * Sastavi `inspectionCoverage` iz vec izracunatih struktura i popisa. Ne baca ni na praznom ni
 * na degradiranom ulazu: nepoznat izvor postaje dio `analysisUnavailable`, a status tada nikad
 * nije `fullyChecked`, jer nepoznato nije zeleno.
 */
export function computeInspectionCoverage(input: InspectionCoverageInput): InspectionCoverage {
  const details = (input.details && typeof input.details === 'object') ? input.details : {};
  const census = input.census ?? null;
  const unavailable = new Set<InspectionSource>(input.unavailableSources ?? []);
  for (const key of REQUIRED_SKIP_SOURCES) if (!skippedOf(details[key])) unavailable.add(key);
  const rescue = details.tableFigureRescue as { tables?: unknown } | undefined;
  const tables = rescue && Array.isArray(rescue.tables) ? (rescue.tables as Array<{ unsupported?: unknown }>) : null;
  if (!tables) unavailable.add('tableFigureRescue');
  if (!census) unavailable.add('census');

  const counts = new Map<InspectionSkipKind, number>();
  let skippedParagraphs = 0;
  if (census) {
    for (const kind of PARAGRAPH_KIND_PRIORITY) {
      const n = census.byKind[kind] ?? 0;
      if (n > 0) { counts.set(kind, n); skippedParagraphs += n; }
    }
    if (census.embeddedObjects > 0) counts.set('embeddedObject', census.embeddedObjects);
  }

  const legal = skippedOf(details.legalFootnoteStructure);
  if (legal) {
    const ids = new Set(legal.map((entry) => entry.footnoteId).filter((id) => typeof id === 'number'));
    if (ids.size) counts.set('legalFootnote', ids.size);
  }
  if (tables) {
    const complex = tables.filter((t) => t && t.unsupported === true).length;
    if (complex) counts.set('complexTable', complex);
  }
  if (unavailable.size) counts.set('analysisUnavailable', unavailable.size);

  const typographyUnknown = unavailable.has('typographyStructure') || unavailable.has('census');
  const skippedParts: InspectionSkippedPart[] = [];
  for (const kind of PART_ORDER) {
    const count = counts.get(kind);
    if (!count) continue;
    const scope = SCOPE[kind];
    const typographyBlind = scope === 'typographyCheck' || (kind === 'analysisUnavailable' && typographyUnknown);
    skippedParts.push({ kind, count, scope, reason: REASON[kind], affectedCheckIds: typographyBlind ? [TYPOGRAPHY_CHECK_ID] : [] });
  }

  const totalParagraphs = census ? census.totalParagraphs : 0;
  return {
    version: 1,
    status: statusFor({
      parts: skippedParts.length,
      typographyScored: (input.scoredCheckIds ?? []).includes(TYPOGRAPHY_CHECK_ID),
      typographyUnknown,
      typographySkipped: skippedParagraphs,
      totalParagraphs,
    }),
    skippedParagraphs,
    totalParagraphs,
    skippedParts,
  };
}

/**
 * Odluka o statusu, izdvojena da se granice praga mogu testirati izravno.
 * - bez preskocenih dijelova (nepoznat izvor je uvijek dio, pa ne moze proci): `fullyChecked`;
 * - `manualReviewRequired` samo kad je tipografska provjera BODOVANA i njezin je doseg ili
 *   nepoznat ili ne pokriva dovoljno velik dio rada (oba praga);
 * - inace `partiallyChecked`. Dijelove koje je preskocila samo informativna provjera ili samo
 *   prijedlozi popravka bodovani rezultat cita, pa oni nikad ne traze rucnu provjeru.
 */
export function statusFor(input: { parts: number; typographyScored: boolean; typographyUnknown: boolean; typographySkipped: number; totalParagraphs: number }): InspectionCoverageStatus {
  if (input.parts === 0) return 'fullyChecked';
  if (input.typographyScored) {
    if (input.typographyUnknown) return 'manualReviewRequired';
    const ratio = input.totalParagraphs > 0 ? input.typographySkipped / input.totalParagraphs : 0;
    if (input.typographySkipped >= MANUAL_REVIEW_MIN_SKIPPED_PARAGRAPHS && ratio >= MANUAL_REVIEW_SKIPPED_RATIO) return 'manualReviewRequired';
  }
  return 'partiallyChecked';
}
