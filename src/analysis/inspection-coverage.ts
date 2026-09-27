/**
 * T64: `details.inspectionCoverage`, odgovor na pitanje "sto analiza NIJE provjerila".
 *
 * Lekta opasne Word strukture (tekstni okviri, polja upravitelja literature, SDT, formule,
 * revizije, ugradjeni objekti, tablice) namjerno ne dira. Do sada to korisniku nije govorila, a
 * "nisam dirao" nije isto sto i "provjerio sam i ispravno je". Podaci o preskakanju vec postoje,
 * ali su rasuti po `skipped[]` nizovima pet struktura i zastavicama `tableFigureRescue`, i broje
 * neusporedivo (neke po odlomku, neke jednim zbirnim unosom po dokumentu). Ovaj modul ih sastavlja
 * u jedan oblik.
 *
 * Dva dijela:
 * - `censusInspectionContainers(doc)` jednim prolazom kroz VEC PARSIRAN DOM glavnog dokumenta
 *   razvrstava svaki odlomak (ista populacija kao `bodyParagraphs`) u najvise jednu vrstu
 *   spremnika. Nijedna postojeca struktura to ne broji zbirno, pa je ovo jedini novi prolaz.
 * - `computeInspectionCoverage(...)` je cista agregacija: cita popis, vec izracunate `details.*`
 *   strukture i popis izvora koji nisu izracunati.
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
  | 'embeddedObject'
  | 'fieldOrHyperlink'
  | 'legalFootnote'
  | 'complexTable'
  | 'analysisUnavailable';

export type InspectionCoverageStatus = 'fullyChecked' | 'partiallyChecked' | 'manualReviewRequired';

export interface InspectionSkippedPart {
  kind: InspectionSkipKind;
  count: number;
  reason: string;
  /** Stabilni `check.id` iz `src/scoring/check-id-registry.ts`, nikad hrvatski naslov. */
  affectedCheckIds: string[];
}

export interface InspectionCoverage {
  version: 1;
  status: InspectionCoverageStatus;
  skippedParagraphs: number;
  totalParagraphs: number;
  skippedParts: InspectionSkippedPart[];
}

/** Vrste koje se broje po ODLOMKU (ulaze u `skippedParagraphs`). */
export type ParagraphSkipKind = Extract<InspectionSkipKind,
  'citationField' | 'textBox' | 'nestedTable' | 'tableCell' | 'contentControl' | 'trackedChange' | 'equation' | 'embeddedObject' | 'fieldOrHyperlink'>;

/**
 * Prednost pri razvrstavanju: odlomak koji je istodobno u vise spremnika (npr. revizija u celiji
 * tablice, SDT unutar tekstnog okvira) broji se TOCNO jednom, pod prvom vrstom s ovog popisa.
 * Zbroj brojeva po vrstama zato je jednak `skippedParagraphs`. Redoslijed ide od onoga sto
 * korisnik najlakse prepozna i sto je najrizicnije (polja upravitelja literature) prema opcem.
 */
export const PARAGRAPH_KIND_PRIORITY: readonly ParagraphSkipKind[] = [
  'citationField', 'textBox', 'nestedTable', 'tableCell', 'contentControl', 'trackedChange', 'equation', 'embeddedObject', 'fieldOrHyperlink',
];

/**
 * Popis spremnika nad DOM-om. Samo brojevi; nijedno polje ne nosi tekst.
 *
 * ZASTO POPIS, A NE INDEKSI IZ `skipped[]`. `typographyStructure.skipped` i
 * `consistencyStructure.skipped` oznacavaju odlomke indeksom iz `extractBodyParagraphs`, koji
 * preskace samozatvoreni `<w:p/>` i ovisi o doslovnom prefiksu `w:`; `linkDoiStructure.skipped`
 * koristi indeks parsera. Ta tri indeksa nisu ista os (izmjereno na
 * `synthetic-formula-omath.docx`: jedan prazan `<w:p/>` pomakne formulu s 4 na 3), pa bi spajanje
 * po indeksu dvaput brojalo isti odlomak. Popis zato sam razvrstava i polja i poveznice, a
 * strukture sluze kao dokaz da je analiza uopce izracunata (vidi `REQUIRED_SKIP_SOURCES`).
 */
export interface InspectionCensus {
  totalParagraphs: number;
  byKind: Record<ParagraphSkipKind, number>;
}

/** Ovi izvori trebaju postojati sa `skipped[]` nizom; ako nisu izracunati, stanje je nepoznato. */
export const REQUIRED_SKIP_SOURCES = ['typographyStructure', 'consistencyStructure', 'requiredSectionsStructure', 'linkDoiStructure'] as const;
export type InspectionSource = typeof REQUIRED_SKIP_SOURCES[number] | 'tableFigureRescue' | 'census';

/**
 * Obicne tablice ne ulaze u udio za rucnu provjeru. Tekst celija citaju sve bodovane provjere
 * oblikovanja (parser ih vidi kao obicne odlomke); preskace ih samo tipografska analiza i
 * prijedlozi popravka. Tablice su u radovima uobicajene (golden `fer-diplomski-puna-struktura`
 * ima 24 od 58 odlomaka u tablicama), pa bi ih udio sam gurnuo u rucnu provjeru bez stvarnog
 * razloga. I dalje se prikazuju kao "nije provjereno" i daju `partiallyChecked`.
 */
export const MANUAL_REVIEW_EXCLUDED_KINDS: readonly InspectionSkipKind[] = ['tableCell'];

/**
 * PRAG ZA RUCNU PROVJERU. Status `manualReviewRequired` znaci da je neprovjereni dio toliki da
 * automatska slika vise ne predstavlja rad. Dva uvjeta moraju vrijediti ZAJEDNO:
 * - udio: barem cetvrtina odlomaka. Ispod toga je vecina teksta provjerena i "djelomicno" je
 *   postena rijec; od cetvrtine navise preskoceni dio vise nije rub nego velik dio rada.
 * - apsolutni broj: barem 20 odlomaka. Kratak dokument (npr. 8 odlomaka, 2 u okviru naslovnice)
 *   lako prijedje udio, a da ne postoji nista sto korisnik ne bi pregledao u minuti.
 * Obje vrijednosti su pocetna procjena (nema presedana u kodu); vlasnik ih moze prilagoditi nakon
 * pregleda stvarnih radova. Nepoznato stanje izvora uvijek daje `manualReviewRequired`.
 */
export const MANUAL_REVIEW_SKIPPED_RATIO = 0.25;
export const MANUAL_REVIEW_MIN_SKIPPED_PARAGRAPHS = 20;

/**
 * Tipografska analiza (`typographyStructure`, jedini izvor bodovane/prikazane provjere
 * `format.typography.consistency`) cita samo izravne odlomke tijela bez polja, poveznica, SDT-a,
 * revizija, okvira i formula. Svaki preskoceni odlomak zato nije provjeren tom provjerom.
 * Ostale strukture (dosljednost, poveznice i DOI, obvezni dijelovi, pravne fusnote, tablice i
 * slike) hrane prijedloge popravka, ne bodovane provjere, pa nemaju `check.id`.
 */
const TYPOGRAPHY_CHECK_ID = 'format.typography.consistency';

const REASON: Record<InspectionSkipKind, string> = {
  citationField: 'odlomci s poljima upravitelja literature (Zotero, Mendeley, EndNote, Citavi) nisu analizirani',
  textBox: 'odlomci u tekstnim okvirima nisu analizirani',
  nestedTable: 'odlomci u ugniježđenim tablicama nisu analizirani',
  tableCell: 'odlomci unutar tablica nisu analizirani',
  contentControl: 'odlomci u kontrolama sadržaja (SDT) ili customXml nisu analizirani',
  trackedChange: 'odlomci s praćenim promjenama nisu analizirani',
  equation: 'odlomci s formulama nisu analizirani',
  embeddedObject: 'odlomci s ugrađenim objektima nisu analizirani',
  fieldOrHyperlink: 'odlomci s poljima ili poveznicama nisu analizirani',
  legalFootnote: 'fusnote bez dovoljno pouzdane pravne strukture nisu analizirane',
  complexTable: 'složene tablice nisu procijenjene za automatski popravak',
  analysisUnavailable: 'dio analize nije bilo moguće izračunati',
};

const PART_ORDER: readonly InspectionSkipKind[] = [
  ...PARAGRAPH_KIND_PRIORITY, 'legalFootnote', 'complexTable', 'analysisUnavailable',
];

// ---------------------------------------------------------------------------------------------
// Popis spremnika nad DOM-om
// ---------------------------------------------------------------------------------------------

type SdtKind = 'citation' | 'toc' | 'other';

interface FieldFrame { instr: string; citation: boolean; toc: boolean }

/** Polja upravitelja literature: Zotero, Mendeley (i stari CSL_CITATION), EndNote, Citavi. */
const CITATION_INSTR = /^\s*ADDIN\s+(?:ZOTERO_|CSL_|Mendeley|EN\.CITE|EN\.REFLIST|CITAVI)/i;
/** Word ugradjeni citat i bibliografija kao polja. */
const WORD_CITATION_INSTR = /^\s*(?:CITATION|BIBLIOGRAPHY)\b/i;
const TOC_INSTR = /^\s*TOC\b/i;
/** Oznake SDT-a koje pisu dodaci upravitelja literature. */
const CITATION_SDT_TAG = /ZOTERO|MENDELEY|CSL_CITATION|CITAVI|ENDNOTE/i;

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

interface ParagraphRecord { kinds: Set<ParagraphSkipKind>; toc: boolean }

interface WalkContext {
  tblDepth: number;
  inTxbx: boolean;
  sdt: SdtKind | null;
  inCustomXml: boolean;
  paragraph: ParagraphRecord | null;
}

function emptyByKind(): Record<ParagraphSkipKind, number> {
  return { citationField: 0, textBox: 0, nestedTable: 0, tableCell: 0, contentControl: 0, trackedChange: 0, equation: 0, embeddedObject: 0, fieldOrHyperlink: 0 };
}

/**
 * Jedan prolaz kroz `w:body` u redoslijedu dokumenta. Polja (`w:fldChar`) mogu obuhvatiti vise
 * odlomaka (npr. Zotero bibliografija), pa se stog otvorenih polja vodi kroz cijeli prolaz, a
 * odlomak koji pocne unutar citatnog polja pripada tom polju. Grana `mc:Fallback` uz `mc:Choice`
 * se preskace isto kao u `bodyParagraphs`, da se okvir ne broji dvaput.
 */
export function censusInspectionContainers(doc: Document): InspectionCensus {
  const body = doc.getElementsByTagName('w:body')[0] as Element | undefined;
  const records: ParagraphRecord[] = [];
  const fields: FieldFrame[] = [];

  const openCitation = () => fields.some((f) => f.citation);
  const openToc = () => fields.some((f) => f.toc);

  const markCitation = (ctx: WalkContext) => { if (ctx.paragraph) ctx.paragraph.kinds.add('citationField'); };

  const visit = (node: Element, ctx: WalkContext): void => {
    const name = local(node);
    if (name === 'Fallback') {
      // Isto pravilo kao `inSuppressedFallback`: Fallback uz Choice sestru citatelj ne vidi.
      // Fallback bez Choice sestre je jedina reprezentacija, pa se cita.
      const alt = node.parentNode as Element | null;
      if (alt && elementChildren(alt).some((c) => c !== node && local(c) === 'Choice')) return;
    }
    let next = ctx;
    if (name === 'p') {
      const record: ParagraphRecord = { kinds: new Set(), toc: false };
      if (ctx.tblDepth >= 2) record.kinds.add('nestedTable');
      else if (ctx.tblDepth === 1) record.kinds.add('tableCell');
      if (ctx.inTxbx) record.kinds.add('textBox');
      if (ctx.sdt === 'citation' || openCitation()) record.kinds.add('citationField');
      else if (ctx.sdt === 'other' || ctx.inCustomXml) record.kinds.add('contentControl');
      if (ctx.sdt === 'toc' || openToc()) record.toc = true;
      records.push(record);
      next = { ...ctx, paragraph: record };
    } else if (name === 'tbl') {
      next = { ...ctx, tblDepth: ctx.tblDepth + 1 };
    } else if (name === 'txbxContent') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('textBox');
      next = { ...ctx, inTxbx: true };
    } else if (name === 'sdt') {
      const kind = sdtKind(node);
      if (ctx.paragraph) {
        if (kind === 'citation') ctx.paragraph.kinds.add('citationField');
        else if (kind === 'other') ctx.paragraph.kinds.add('contentControl');
        else ctx.paragraph.toc = true;
      }
      // Citatni ili TOC SDT oko vec citatnog konteksta ne spusta razinu.
      const inherited: SdtKind = ctx.sdt === 'citation' ? 'citation' : kind;
      next = { ...ctx, sdt: inherited };
    } else if (name === 'customXml') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('contentControl');
      next = { ...ctx, inCustomXml: true };
    } else if (name === 'oMath' || name === 'oMathPara') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('equation');
    } else if (name === 'ins' || name === 'del' || name === 'moveFrom' || name === 'moveTo') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('trackedChange');
    } else if (name === 'object') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('embeddedObject');
    } else if (name === 'hyperlink') {
      // Tipografska analiza preskace odlomak s poveznicom (`protectedParagraph`).
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
    } else if (name === 'fldChar') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
      const type = node.getAttribute('w:fldCharType') || node.getAttribute('fldCharType');
      if (type === 'begin') fields.push({ instr: '', citation: false, toc: false });
      else if (type === 'end') fields.pop();
      return;
    } else if (name === 'instrText') {
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
      const top = fields[fields.length - 1];
      if (top) {
        top.instr += node.textContent ?? '';
        if (!top.citation && (CITATION_INSTR.test(top.instr) || WORD_CITATION_INSTR.test(top.instr))) top.citation = true;
        if (!top.toc && TOC_INSTR.test(top.instr)) top.toc = true;
        if (top.citation) markCitation(ctx);
        if (top.toc && ctx.paragraph) ctx.paragraph.toc = true;
      }
      return;
    } else if (name === 'fldSimple') {
      const instr = node.getAttribute('w:instr') || node.getAttribute('instr') || '';
      if (ctx.paragraph) ctx.paragraph.kinds.add('fieldOrHyperlink');
      const frame: FieldFrame = { instr, citation: CITATION_INSTR.test(instr) || WORD_CITATION_INSTR.test(instr), toc: TOC_INSTR.test(instr) };
      if (frame.citation) markCitation(ctx);
      if (frame.toc && ctx.paragraph) ctx.paragraph.toc = true;
      fields.push(frame);
      for (const child of elementChildren(node)) visit(child, next);
      fields.pop();
      return;
    }
    for (const child of elementChildren(node)) visit(child, next);
  };

  if (body) {
    for (const child of elementChildren(body)) visit(child, { tblDepth: 0, inTxbx: false, sdt: null, inCustomXml: false, paragraph: null });
  }

  const byKind = emptyByKind();
  for (const record of records) {
    // Odlomci automatskog sadrzaja (TOC polje ili SDT) nisu "preskoceni" samo zato sto nose
    // poveznicu i PAGEREF polje: sadrzaj provjeravaju provjere `toc.*`, a tekst mu je generiran
    // iz naslova. Ostale vrste (npr. revizija u sadrzaju) i dalje se broje.
    if (record.toc) record.kinds.delete('fieldOrHyperlink');
    const primary = PARAGRAPH_KIND_PRIORITY.find((kind) => record.kinds.has(kind));
    if (primary) byKind[primary] += 1;
  }
  // Nazivnik je ista populacija koju cita parser (`bodyParagraphs`), da udio bude usporediv s
  // onim sto korisnik vidi kao "odlomke" u ostatku rezultata.
  const totalParagraphs = body ? bodyParagraphs(doc).length : 0;
  return { totalParagraphs, byKind };
}

// ---------------------------------------------------------------------------------------------
// Agregacija
// ---------------------------------------------------------------------------------------------

export interface InspectionCoverageInput {
  details: Record<string, unknown> | null | undefined;
  census: InspectionCensus | null | undefined;
  /** Izvori koje je pozivatelj morao zamijeniti praznim fallbackom (npr. catch grana). */
  unavailableSources?: readonly InspectionSource[];
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

  const skippedParts: InspectionSkippedPart[] = [];
  for (const kind of PART_ORDER) {
    const count = counts.get(kind);
    if (!count) continue;
    const typographyBlind = (PARAGRAPH_KIND_PRIORITY as readonly InspectionSkipKind[]).includes(kind)
      || (kind === 'analysisUnavailable' && (unavailable.has('typographyStructure') || unavailable.has('census')));
    skippedParts.push({ kind, count, reason: REASON[kind], affectedCheckIds: typographyBlind ? [TYPOGRAPHY_CHECK_ID] : [] });
  }

  const totalParagraphs = census ? census.totalParagraphs : 0;
  const excluded = MANUAL_REVIEW_EXCLUDED_KINDS.reduce((sum, kind) => sum + (counts.get(kind) ?? 0), 0);
  return {
    version: 1,
    status: statusFor({ unknown: unavailable.size > 0, parts: skippedParts.length, reviewParagraphs: skippedParagraphs - excluded, totalParagraphs }),
    skippedParagraphs,
    totalParagraphs,
    skippedParts,
  };
}

/**
 * Odluka o statusu, izdvojena da se granice praga mogu testirati izravno. `reviewParagraphs` su
 * preskoceni odlomci bez `MANUAL_REVIEW_EXCLUDED_KINDS`.
 */
export function statusFor(input: { unknown: boolean; parts: number; reviewParagraphs: number; totalParagraphs: number }): InspectionCoverageStatus {
  if (input.unknown) return 'manualReviewRequired';
  if (input.parts === 0) return 'fullyChecked';
  const ratio = input.totalParagraphs > 0 ? input.reviewParagraphs / input.totalParagraphs : 0;
  if (input.reviewParagraphs >= MANUAL_REVIEW_MIN_SKIPPED_PARAGRAPHS && ratio >= MANUAL_REVIEW_SKIPPED_RATIO) return 'manualReviewRequired';
  return 'partiallyChecked';
}
