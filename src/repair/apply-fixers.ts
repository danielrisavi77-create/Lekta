// src/repair/apply-fixers.ts
//
// Spaja zip-codec.ts (citanje/pisanje docx zipa) i fixers.ts (ciljani XML
// patch) u jedan tijek: ucitaj docx, primijeni odabrane popravke na ciljane XML partove,
// vrati novi docx gdje su svi ostali zip entryji (slike, headeri, footeri, theme) neizmijenjeni.

import { readZip, writeZip, type ZipEntry } from './zip-codec.ts';
import { FIXER_IDS, type FixerId, type FixerRequest } from './fixer-registry.ts';
export { FIXER_IDS, type FixerId, type FixerRequest } from './fixer-registry.ts';
import {
  marginsFixer,
  paperSizeFixer,
  fontFixer,
  lineSpacingFixer,
  alignmentFixer,
  paragraphSpacingFixer,
  pageNumberingFixer,
  footerPageFixer,
  sectionInsertFixer,
  emptyParagraphFixer,
  footnoteSpacingFixer,
  pageNumberAlignmentFixer,
  tocFieldFixer,
  headingFormatFixer,
  headingStyleFixer,
  titlePageFixer,
  footnoteTypographyFixer,
  headingCaseFixer,
  elementCaptionFixer,
  bibliographyRepairFixer,
  citationBibliographySyncFixer,
  legalFootnoteRepairFixer,
  finalDocumentInspectorFixer,
  tableFigureRescueFixer,
  sectionSurgeryFixer,
  fieldIntegrityFixer,
  croatianTypographyFixer,
  consistencyFixer,
  requiredSectionFixer,
  type HeadingLevelTarget,
  type DocxXmlParts,
  type FooterPageTarget,
  type SectionInsertTarget,
  type TocFieldTarget,
  type FixerNoOpReason,
  type ElementCaptionFixParams,
  type BibliographyRepairParams,
  type CitationBibliographySyncParams,
  type LegalFootnoteRepairParams,
  type FinalDocumentInspectorParams,
  type TableFigureRescueParams,
  type SectionSurgeryParams,
  type FieldIntegrityParams,
  type CroatianTypographyParams,
  type ConsistencyFixParams,
  type RequiredSectionFixParams,
  linkDoiFixer,
  type LinkDoiFixParams,
} from './fixers.ts';
import { submissionMetadataFixer, type SubmissionMetadataFixParams } from './submission-metadata-fixer.ts';
import { scanXmlWellFormed } from './package-integrity.ts';
import type { SectionNumberingTarget, ParagraphStyleFormattingRule, ParagraphFormattingTarget } from './xml-patch.ts';

export interface ChangelogEntry {
  ruleId: string;
  fixerId: FixerId;
  beforeLabel: string;
  afterLabel: string;
}

/** Zasto popravak NIJE isporucen: izlazni paket ne bi bio ispravan. Vidi detectIntegrityFailure. */
export interface IntegrityFailure {
  /** Ime dijela paketa (npr. word/document.xml) na kojem je kvar prvi put vidljiv. */
  part: string;
  /** Citljiv opis (hrvatski) iz skenera ili iz usporedbe popisa dijelova. */
  problem: string;
  /** Priblizna pozicija u XML-u, kad je poznata. */
  offset?: number;
  /** true kad je isti dio bio neispravan VEC NA ULAZU - kvar tada nije nas, ali isporuku svejedno
   *  zaustavljamo jer za takav paket ne mozemo jamciti nista. Razlikuje se samo poruka. */
  preexisting?: boolean;
}

export interface ApplyFixersResult {
  docxBytes: Uint8Array;
  changelog: ChangelogEntry[];
  skipped: string[]; // ruleId-evi koje nismo uspjeli primijeniti (fail-safe, ne baca)
  /** RE-36/41: ruleId -> zasto (kad je poznato). Cisto ADITIVNO polje (skipped ostaje nepromijenjen
   *  radi wire-kompatibilnosti sa serverskim putem); UI ga koristi da "vec uskladjeno" ne izgleda
   *  kao "nije bilo moguce". Bez zapisa za ruleId = razlog nije klasificiran (npr. fixer je bacio). */
  skippedReasons: Record<string, FixerNoOpReason>;
  /** Postavljeno SAMO kad su vrata integriteta odbila isporuku. Tada je docxBytes ULAZNI dokument
   *  bit-identican, changelog je prazan i nista nije primijenjeno. Pozivatelj (UI, Edge funkcija)
   *  mora ovo razlikovati od "nema se sto popraviti", inace tvrdi neistinu. */
  integrityFailure?: IntegrityFailure;
}

/**
 * RE-46: fixeri koji MIJENJAJU BROJ ODLOMAKA u word/document.xml (umecu ili uklanjaju <w:p>).
 *
 * Zasto postoji: applyFixers primjenjuje zahtjeve SEKVENCIJALNO nad istim documentXml-om, a
 * anchor-osjetljivi fixeri (croatian-typography, link-doi, consistency, field-integrity...)
 * u params nose `paragraphIndex` + `anchorFingerprint` IZRACUNATE NAD IZVORNIM dokumentom
 * (klijentska analiza). Cim jedan od dolje navedenih ukloni ili umetne odlomak, svi kasniji
 * indeksi se pomaknu i te mete gadjaju krivi odlomak -> tihi 'no-target'.
 *
 * Otkriveno na stvarnom diplomskom radu (FPZG novinarstvo): empty-paragraph-fixer je uklonio
 * odlomke, nakon cega su croatian-typography-fixer i link-doi-fixer preskoceni iako su ISTI
 * params primijenjeni SAMI uredno prolazili. Zakljucano u tests/repair-apply-order.test.ts.
 *
 * Rjesenje je redoslijed, ne re-anchoring: ovi idu ZADNJI (stabilno, unutar skupine se cuva
 * ulazni redoslijed), pa svi anchor-osjetljivi rade nad JOS NEPOMAKNUTIM indeksima.
 * Kombinacija dvaju fixera IZ OVE skupine i dalje moze pomaknuti indekse jedan drugome; to je
 * poznata, uza granica (oni se u praksi rijetko preklapaju nad istim odlomcima).
 */
const INDEX_SHIFTING_FIXERS: ReadonlySet<string> = new Set<string>([
  'empty-paragraph-fixer', // uklanja osirotjele prazne odlomke
  'required-section-fixer', // umece nedostajuce obvezne dijelove
  'toc-field-fixer', // umece zivo TOC polje
  'section-insert-fixer', // umece prijelom sekcije
  'title-page-fixer', // zamjenjuje omedjenu prvu stranicu (drugaciji broj odlomaka)
  'bibliography-repair-fixer', // moze ukloniti duplicirane zapise
  'citation-bibliography-sync-fixer', // moze dodati nedostajuce zapise
]);

/**
 * RE-51: redoslijed UNUTAR gornje skupine, od dijela dokumenta koji je NAJDALJE od pocetka prema
 * onome na samom pocetku. Fixer koji skrati ili produzi rani dio dokumenta pomakne mete svima koji
 * rade dalje u tekstu, pa oni moraju biti gotovi PRIJE njega (isti princip kao obrada Word polja
 * silazno po offsetu u field-integrity-fixer.ts).
 *
 * Konkretan slucaj: title-page-fixer zamijeni naslovnicu (drugaciji broj odlomaka), nakon cega je
 * bibliography-repair-fixer s metama na indeksima 529+ vracao 'invalid-params' iako je SAM prolazio.
 * Manji broj = ranije se izvodi. Fixer koji nije naveden dobiva 0 (izvodi se medju prvima).
 */
const INDEX_SHIFTING_ORDER: ReadonlyMap<string, number> = new Map<string, number>([
  ['bibliography-repair-fixer', 0], // popis literature: kraj dokumenta
  ['citation-bibliography-sync-fixer', 1], // zapisi uz literaturu
  ['required-section-fixer', 2], // umetanje obveznih dijelova (moze biti bilo gdje)
  ['section-insert-fixer', 3],
  ['toc-field-fixer', 4], // sadrzaj: pocetak-sredina
  ['empty-paragraph-fixer', 5], // globalno, ali front matter je zasticen
  ['title-page-fixer', 6], // sam pocetak dokumenta: zadnji
]);

/**
 * RE-55: dva popravka koja mijenjaju TEKST istog odlomka.
 *
 * Dvofazni model iznad rjesava "fixer pomakne INDEKSE drugima", ali ne i "fixer promijeni SADRZAJ
 * odlomka koji je necije sidro". Konkretan slucaj: DOI u popisu literature. link-doi-fixer nije
 * strukturan pa ide u prvu fazu i pretvori `doi:10.x` u `https://doi.org/10.x`; time se promijeni
 * tekst odlomka, pa bibliography-repair-fixer u drugoj fazi vise ne prepozna svoj otisak i odustane
 * od CIJELOG popravka literature. Obrnut poredak ne pomaze: tada link-doi dobije 'stale-anchor'.
 * Nijedan redoslijed ne rjesava sudar (izmjereno, tests/repair-anchor-collision.test.ts).
 *
 * Rjesenje je vlasnistvo nad odlomkom, ne redoslijed: bibliografija je vlasnik svojih zapisa jer
 * nad njima radi vise (poredak, sufiksi, duplikati). Izmjereno je da pritom NE GUBIMO nista, jer
 * bibliography-repair-fixer nad tim istim odlomkom vec radi oboje sto bi link-doi napravio:
 * `normalizePlainText` kanonizira `doi:` u `https://doi.org/`, a grana `hyperlink: 'doi'` doda
 * vanjsku relaciju. Zato se preklapajuce link-doi operacije izbacuju iz recepta.
 *
 * Sanacija parametara, ne izvodjenje pravila: server i dalje ne odlucuje STO treba popraviti, nego
 * samo odbija dvije izmjene istog odlomka u istom prolazu.
 */
function withoutOverlappingLinkDoiOperations(requests: readonly FixerRequest[]): FixerRequest[] {
  const bibliography = requests.filter((request) => request.fixerId === 'bibliography-repair-fixer');
  const linkDoi = requests.filter((request) => request.fixerId === 'link-doi-fixer');
  if (!bibliography.length || !linkDoi.length) return [...requests];

  const ownedParagraphs = new Set<number>();
  for (const request of bibliography) {
    const entries = (request.params as { entries?: unknown } | undefined)?.entries;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const indices = (entry as { paragraphIndices?: unknown })?.paragraphIndices;
      if (!Array.isArray(indices)) continue;
      for (const index of indices) if (Number.isInteger(index)) ownedParagraphs.add(Number(index));
    }
  }
  if (!ownedParagraphs.size) return [...requests];

  return requests.map((request) => {
    if (request.fixerId !== 'link-doi-fixer') return request;
    const operations = (request.params as { operations?: unknown } | undefined)?.operations;
    if (!Array.isArray(operations)) return request;
    const kept = operations.filter((operation) => {
      const index = (operation as { paragraphIndex?: unknown })?.paragraphIndex;
      return !(Number.isInteger(index) && ownedParagraphs.has(Number(index)));
    });
    if (kept.length === operations.length) return request;
    return { ...request, params: { ...(request.params as Record<string, unknown>), operations: kept } };
  });
}

const DOCUMENT_XML_PATH = 'word/document.xml';
const STYLES_XML_PATH = 'word/styles.xml';
const NUMBERING_XML_PATH = 'word/numbering.xml';
const CONTENT_TYPES_PATH = '[Content_Types].xml';
const DOCUMENT_RELS_PATH = 'word/_rels/document.xml.rels';
// Engine POLITIKA: novi footer partovi prolaze kroz ovu allow-listu, a heading fixer ima
// zasebno strogo kontrolirano dodavanje word/numbering.xml uz relaciju i content type.
const ENGINE_ADDABLE_PART = /^word\/(?:footer|header)\d+\.xml$/;
const ENGINE_ADDABLE_PACKAGE_PART = /^word\/comments\.xml$/;
const FOOTNOTES_XML_PATH = 'word/footnotes.xml';

const NUMBERING_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering';

function ensureNumberingContentType(xml: string): string {
  if (!xml || /PartName="\/word\/numbering\.xml"/i.test(xml)) return xml;
  const close = xml.lastIndexOf('</Types>');
  if (close < 0) return xml;
  return `${xml.slice(0, close)}<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${xml.slice(close)}`;
}

function ensureNumberingRelationship(xml: string): string {
  if (!xml || new RegExp(`Type="${NUMBERING_REL_TYPE}"`, 'i').test(xml)) return xml;
  const close = xml.lastIndexOf('</Relationships>');
  if (close < 0) return xml;
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const nextId = (ids.length ? Math.max(...ids) : 0) + 1;
  return `${xml.slice(0, close)}<Relationship Id="rId${nextId}" Type="${NUMBERING_REL_TYPE}" Target="numbering.xml"/>${xml.slice(close)}`;
}
// Isti regex kao PAGE-part enumeracija u analyze-docx.ts (linija ~47): svi POSTOJECI
// footer/header partovi, ne samo footeri koje K5 smije dodati (ENGINE_ADDABLE_PART).
const FOOTER_HEADER_PART_RE = /^word\/(footer|header)\d+\.xml$/i;

// RE-27: skalarni parametar mora biti PRAVI konacan broj prije nego udje u cmToTwips/
// ptToHalfPoints/multiplierToTwips; inace NaN prolazi kroz Number(...)/String(...) i zavrsi kao
// LITERALNI string "NaN" upisan u XML atribut (schema-nevaljan dokument prijavljen kao popravljen).
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const ALIGNMENT_VAL_VALUES = new Set(['left', 'right', 'center', 'both']);
const PAGE_ALIGN_VALUES = new Set(['left', 'center', 'right']);

function runFixer(fixerId: FixerId, parts: DocxXmlParts, rawParams: Record<string, unknown>) {
  // Nedostajuci parametri su NO-OP, ne pad: pozivatelj (Edge, UI, golden harness) smije poslati
  // zahtjev bez `params`, a citanje polja iz undefined bi srusilo cijeli popravak.
  const params = rawParams ?? {};
  switch (fixerId) {
    case 'margins-fixer': {
      // RE-27: svaka margina se validira POJEDINACNO (ne cijeli objekt odjednom), pa jedna
      // nevaljana vrijednost ne obara ostale ispravne margine u istom zahtjevu.
      const p = params as Partial<Record<'top' | 'right' | 'bottom' | 'left', unknown>>;
      const marginsCm: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>> = {};
      for (const key of ['top', 'right', 'bottom', 'left'] as const) {
        if (isFiniteNumber(p[key])) marginsCm[key] = p[key];
      }
      return marginsFixer(parts, marginsCm);
    }
    case 'paper-size-fixer': {
      const p = params as { w?: unknown; h?: unknown };
      return isFiniteNumber(p.w) && isFiniteNumber(p.h)
        ? paperSizeFixer(parts, { w: p.w, h: p.h })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'font-fixer': {
      const p = params as { fontName?: unknown; fontSizePt?: unknown; deep?: boolean };
      const fontName = typeof p.fontName === 'string' && p.fontName.trim() !== '' ? p.fontName : undefined;
      const fontSizePt = isFiniteNumber(p.fontSizePt) ? p.fontSizePt : undefined;
      return fontName !== undefined || fontSizePt !== undefined
        ? fontFixer(parts, { fontName, fontSizePt, deep: p.deep === true })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'line-spacing-fixer': {
      const p = params as { multiplier?: unknown; deep?: boolean };
      return isFiniteNumber(p.multiplier)
        ? lineSpacingFixer(parts, p.multiplier, p.deep === true)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'alignment-fixer': {
      const p = params as { val?: unknown; deep?: boolean };
      return typeof p.val === 'string' && ALIGNMENT_VAL_VALUES.has(p.val)
        ? alignmentFixer(parts, p.val as 'left' | 'right' | 'center' | 'both', p.deep === true)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'paragraph-spacing-fixer': {
      const p = params as { deep?: unknown; styleRules?: unknown; targets?: unknown };
      const safeTwips = (value: unknown): number | undefined =>
        isFiniteNumber(value) && Number.isInteger(value) && value >= -14400 && value <= 14400 ? value : undefined;
      const styleRules: ParagraphStyleFormattingRule[] | undefined = Array.isArray(p.styleRules) ? p.styleRules.flatMap((raw): ParagraphStyleFormattingRule[] => {
        if (!raw || typeof raw !== 'object') return [];
        const r = raw as Record<string, unknown>;
        if (typeof r.styleId !== 'string' || !r.styleId.trim()) return [];
        return [{
          styleId: r.styleId.trim(),
          beforeTwentieths: safeTwips(r.beforeTwentieths),
          afterTwentieths: safeTwips(r.afterTwentieths),
          firstLineTwips: safeTwips(r.firstLineTwips),
          hangingTwips: safeTwips(r.hangingTwips),
          keepLines: r.keepLines === true ? true : undefined,
          keepNext: r.keepNext === true ? true : undefined,
          widowControl: r.widowControl === true ? true : undefined,
        }];
      }) : undefined;
      const targets: ParagraphFormattingTarget[] | undefined = Array.isArray(p.targets) ? p.targets.flatMap((raw): ParagraphFormattingTarget[] => {
        if (!raw || typeof raw !== 'object') return [];
        const r = raw as Record<string, unknown>;
        const paragraphIndex = r.paragraphIndex;
        if (!isFiniteNumber(paragraphIndex) || !Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex > 2_000_000) return [];
        return [{
          paragraphIndex,
          firstLineTwips: safeTwips(r.firstLineTwips),
          hangingTwips: safeTwips(r.hangingTwips),
          keepLines: r.keepLines === true ? true : undefined,
          keepNext: r.keepNext === true ? true : undefined,
          widowControl: r.widowControl === true ? true : undefined,
          removeFakeIndent: r.removeFakeIndent === true,
          clearDirectIndent: r.clearDirectIndent === true,
        }];
      }) : undefined;
      return paragraphSpacingFixer(parts, { deep: p.deep === true, styleRules, targets });
    }
    case 'page-numbering-fixer': {
      const p = params as { targets?: SectionNumberingTarget[] };
      return pageNumberingFixer(parts, Array.isArray(p.targets) ? p.targets : []);
    }
    case 'footer-page-fixer': {
      const p = params as { target?: FooterPageTarget };
      return p.target ? footerPageFixer(parts, p.target) : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'section-insert-fixer': {
      const p = params as { target?: SectionInsertTarget };
      return p.target && typeof p.target.introParagraphIndex === 'number'
        ? sectionInsertFixer(parts, p.target)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'empty-paragraph-fixer':
      return emptyParagraphFixer(parts);
    case 'footnote-spacing-fixer': {
      const p = params as { deep?: boolean };
      return footnoteSpacingFixer(parts, p.deep === true);
    }
    case 'page-number-alignment-fixer': {
      // RE-27: nevaljana vrijednost se NE prosljedjuje doslovno (schema-nevaljan w:jc); tretira se
      // kao da nije poslana, pa fixerov vlastiti default ('right', jedina vrijednost koju ijedan
      // stvaran profil danas trazi) i dalje vrijedi.
      const p = params as { align?: unknown };
      const align = typeof p.align === 'string' && PAGE_ALIGN_VALUES.has(p.align) ? (p.align as 'left' | 'center' | 'right') : undefined;
      return pageNumberAlignmentFixer(parts, align);
    }
    case 'toc-field-fixer': {
      const p = params as { target?: TocFieldTarget };
      return p.target && typeof p.target.sadrzajParagraphIndex === 'number'
        ? tocFieldFixer(parts, p.target)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'heading-format-fixer': {
      const p = params as { targets?: HeadingLevelTarget[] };
      return Array.isArray(p.targets) && p.targets.length
        ? headingFormatFixer(parts, p.targets)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'heading-style-fixer': {
      const p = params as {
        targets?: Array<{
          paragraphIndex?: unknown;
          level?: unknown;
          numbered?: unknown;
          removeManualNumbering?: unknown;
          clearDirectFont?: unknown;
          clearDirectSize?: unknown;
          clearDirectAlignment?: unknown;
        }>;
        options?: {
          pageBreakLevels?: unknown;
          numbering?: { maxLevel?: unknown; format?: unknown; trailingDot?: unknown };
        };
      };
      const targets = Array.isArray(p.targets)
        ? p.targets.flatMap((target) => {
            const paragraphIndex = Number(target.paragraphIndex);
            const level = Number(target.level);
            if (!Number.isInteger(paragraphIndex) || paragraphIndex < 1 || !Number.isInteger(level) || level < 1 || level > 9) return [];
            return [{
              paragraphIndex,
              level,
              numbered: target.numbered === true,
              removeManualNumbering: target.removeManualNumbering === true,
              clearDirectFont: target.clearDirectFont === true,
              clearDirectSize: target.clearDirectSize === true,
              clearDirectAlignment: target.clearDirectAlignment === true,
            }];
          })
        : [];
      const rawLevels = p.options?.pageBreakLevels;
      const pageBreakLevels = Array.isArray(rawLevels)
        ? rawLevels.map(Number).filter((level) => Number.isInteger(level) && level >= 1 && level <= 9)
        : [];
      const rawNumbering = p.options?.numbering;
      const numbering = rawNumbering && Number.isInteger(Number(rawNumbering.maxLevel))
        ? {
            maxLevel: Math.max(1, Math.min(9, Number(rawNumbering.maxLevel))),
            format: (rawNumbering.format === 'upperRoman' || rawNumbering.format === 'lowerRoman' ? rawNumbering.format : 'decimal') as 'decimal' | 'upperRoman' | 'lowerRoman',
            trailingDot: rawNumbering.trailingDot !== false,
          }
        : undefined;
      return targets.length
        ? headingStyleFixer(parts, targets, { pageBreakLevels, numbering })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'title-page-fixer': {
      const p = params as { paragraphCount?: unknown; lines?: unknown; ensureTitlePageNoNumber?: unknown; marginsCm?: unknown };
      const paragraphCount = Number(p.paragraphCount);
      const lines = Array.isArray(p.lines) ? p.lines.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const line = raw as Record<string, unknown>;
        if (typeof line.text !== 'string' || !line.text.trim() || line.text.length > 1000) return [];
        const styleRaw = line.style && typeof line.style === 'object' ? line.style as Record<string, unknown> : undefined;
        const style = styleRaw ? {
          ...(typeof styleRaw.font === 'string' && styleRaw.font.trim() ? { font: styleRaw.font.trim().slice(0, 100) } : {}),
          ...(isFiniteNumber(styleRaw.sizePt) && styleRaw.sizePt >= 6 && styleRaw.sizePt <= 72 ? { sizePt: styleRaw.sizePt } : {}),
          ...(styleRaw.bold === true ? { bold: true } : {}),
          ...(styleRaw.italic === true ? { italic: true } : {}),
          ...(styleRaw.uppercase === true ? { uppercase: true } : {}),
          ...(['left', 'center', 'right'].includes(String(styleRaw.align)) ? { align: String(styleRaw.align) as 'left' | 'center' | 'right' } : {}),
        } : undefined;
        const group = Number(line.group);
        return [{ text: line.text, ...(Number.isInteger(group) && group >= 0 && group <= 100 ? { group } : {}), ...(style && Object.keys(style).length ? { style } : {}) }];
      }) : [];
      const marginsRaw = p.marginsCm && typeof p.marginsCm === 'object' ? p.marginsCm as Record<string, unknown> : undefined;
      const margins = marginsRaw ? (['top', 'right', 'bottom', 'left'] as const).reduce<Record<string, number>>((out, key) => {
        if (isFiniteNumber(marginsRaw[key]) && marginsRaw[key] >= 0 && marginsRaw[key] <= 10) out[key] = marginsRaw[key] as number;
        return out;
      }, {}) : undefined;
      return Number.isInteger(paragraphCount) && paragraphCount >= 1 && paragraphCount <= 80 && lines.length > 0 && lines.length <= 40
        ? titlePageFixer(parts, { paragraphCount, lines, ensureTitlePageNoNumber: p.ensureTitlePageNoNumber !== false, ...(margins && Object.keys(margins).length ? { marginsCm: margins } : {}) })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'footnote-typography-fixer': {
      const p = params as { fontName?: unknown; fontSizePt?: unknown; alignJustify?: unknown };
      const fontName = typeof p.fontName === 'string' && p.fontName.trim() !== '' ? p.fontName : undefined;
      const fontSizePt = isFiniteNumber(p.fontSizePt) ? p.fontSizePt : undefined;
      const alignJustify = typeof p.alignJustify === 'boolean' ? p.alignJustify : undefined;
      return fontName !== undefined || fontSizePt !== undefined || alignJustify !== undefined
        ? footnoteTypographyFixer(parts, { fontName, fontSizePt, alignJustify })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'heading-case-fixer': {
      const p = params as { levels?: number[] };
      const levels = Array.isArray(p.levels) ? p.levels.map(Number).filter((n) => n >= 1 && n <= 9) : [];
      return levels.length
        ? headingCaseFixer(parts, levels)
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'element-caption-fixer': {
      const p = params as Partial<ElementCaptionFixParams>;
      if (p.version !== 1 || !Array.isArray(p.elements)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return elementCaptionFixer(parts, p as ElementCaptionFixParams);
    }
    case 'bibliography-repair-fixer': {
      const p = params as Partial<BibliographyRepairParams>;
      if (p.version !== 1 || !Array.isArray(p.entries)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const entries = p.entries.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const entry = raw as unknown as Record<string, unknown>;
        const indices = Array.isArray(entry.paragraphIndices) ? entry.paragraphIndices.map(Number) : [];
        if (typeof entry.id !== 'string' || !entry.id.trim() || indices.length !== 1 || !Number.isInteger(indices[0]) || indices[0] < 1 || indices[0] > 2_000_000) return [];
        if (typeof entry.anchorFingerprint !== 'string' || entry.anchorFingerprint.length > 100) return [];
        const replacementText = typeof entry.replacementText === 'string' && entry.replacementText.length <= 20_000 ? entry.replacementText : undefined;
        const hyperlink = entry.hyperlink === 'doi' || entry.hyperlink === 'url' ? entry.hyperlink : undefined;
        return [{
          id: entry.id.trim().slice(0, 200),
          paragraphIndices: [indices[0]],
          anchorFingerprint: entry.anchorFingerprint,
          ...(entry.remove === true ? { remove: true } : {}),
          ...(replacementText !== undefined ? { replacementText } : {}),
          ...(entry.normalizeText === true ? { normalizeText: true } : {}),
          ...(hyperlink ? { hyperlink: hyperlink as 'doi' | 'url' } : {}),
        }];
      });
      const optionsRaw = p.options && typeof p.options === 'object' ? p.options as Record<string, unknown> : {};
      const safeTwips = (value: unknown) => isFiniteNumber(value) && Number.isInteger(value) && value >= -14400 && value <= 14400 ? value : undefined;
      const options = {
        ...(safeTwips(optionsRaw.hangingIndentTwips) !== undefined ? { hangingIndentTwips: safeTwips(optionsRaw.hangingIndentTwips) } : {}),
        ...(safeTwips(optionsRaw.beforeTwentieths) !== undefined ? { beforeTwentieths: safeTwips(optionsRaw.beforeTwentieths) } : {}),
        ...(safeTwips(optionsRaw.afterTwentieths) !== undefined ? { afterTwentieths: safeTwips(optionsRaw.afterTwentieths) } : {}),
        ...(optionsRaw.stripUrlTerminalPunctuation === true ? { stripUrlTerminalPunctuation: true } : {}),
      };
      const order = Array.isArray(p.order) ? p.order.filter((id): id is string => typeof id === 'string').slice(0, 500) : undefined;
      const suffixes = Array.isArray(p.suffixes) ? p.suffixes.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const suffix = raw as unknown as Record<string, unknown>;
        return typeof suffix.entryId === 'string' && typeof suffix.suffix === 'string' && /^[a-z]$/i.test(suffix.suffix)
          ? [{ entryId: suffix.entryId.slice(0, 200), suffix: suffix.suffix.toLowerCase() }]
          : [];
      }).slice(0, 500) : undefined;
      return entries.length
        ? bibliographyRepairFixer(parts, { version: 1, entries, ...(p.profileFingerprint && typeof p.profileFingerprint === 'string' ? { profileFingerprint: p.profileFingerprint.slice(0, 200) } : {}), ...(order?.length ? { order } : {}), ...(suffixes?.length ? { suffixes } : {}), ...(Object.keys(options).length ? { options } : {}) })
        : { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
    }
    case 'citation-bibliography-sync-fixer': {
      const p = params as Partial<CitationBibliographySyncParams>;
      if (p.version !== 1 || !Array.isArray(p.citations) || !Array.isArray(p.entries) || !Array.isArray(p.mappings)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const citations = p.citations.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const citation = raw as unknown as Record<string, unknown>;
        return typeof citation.id === 'string' && Number.isInteger(citation.paragraphIndex) && Number.isInteger(citation.start) && Number.isInteger(citation.end) && typeof citation.anchorFingerprint === 'string' && typeof citation.replacementText === 'string' && typeof citation.reason === 'string'
          ? [{ id: citation.id.trim().slice(0, 200), paragraphIndex: Number(citation.paragraphIndex), start: Number(citation.start), end: Number(citation.end), anchorFingerprint: citation.anchorFingerprint.slice(0, 100), replacementText: citation.replacementText.slice(0, 1000), reason: citation.reason.slice(0, 500) }]
          : [];
      });
      const entries = p.entries.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const entry = raw as unknown as Record<string, unknown>;
        const indices = Array.isArray(entry.paragraphIndices) ? entry.paragraphIndices.map(Number) : [];
        const action = entry.action === 'add' || entry.action === 'replace' || entry.action === 'remove' ? entry.action : null;
        const anchor = entry.insertionAnchor && typeof entry.insertionAnchor === 'object' ? entry.insertionAnchor as Record<string, unknown> : null;
        if (typeof entry.id !== 'string' || !entry.id.trim() || !action || !indices.every((index) => Number.isInteger(index) && index >= 1) || typeof entry.anchorFingerprint !== 'string') return [];
        if (action === 'add' && (!anchor || !Number.isInteger(anchor.paragraphIndex) || typeof anchor.anchorFingerprint !== 'string')) return [];
        return [{ id: entry.id.trim().slice(0, 200), paragraphIndices: indices, anchorFingerprint: entry.anchorFingerprint.slice(0, 100), action: action as 'add' | 'replace' | 'remove', ...(typeof entry.replacementText === 'string' ? { replacementText: entry.replacementText.slice(0, 20_000) } : {}), ...(anchor ? { insertionAnchor: { paragraphIndex: Number(anchor.paragraphIndex), anchorFingerprint: String(anchor.anchorFingerprint).slice(0, 100) } } : {}) }];
      });
      const mappings = p.mappings.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const mapping = raw as unknown as Record<string, unknown>;
        return typeof mapping.citationId === 'string' && typeof mapping.bibliographyEntryId === 'string' && mapping.confirmed === true
          ? [{ citationId: mapping.citationId.slice(0, 200), bibliographyEntryId: mapping.bibliographyEntryId.slice(0, 200), confirmed: true as const }]
          : [];
      });
      if (citations.length !== p.citations.length || entries.length !== p.entries.length || mappings.length !== p.mappings.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return citationBibliographySyncFixer(parts, { version: 1, citations, entries, mappings, ...(typeof p.profileFingerprint === 'string' ? { profileFingerprint: p.profileFingerprint.slice(0, 200) } : {}) });
    }
    case 'legal-footnote-repair-fixer': {
      const p = params as Partial<LegalFootnoteRepairParams>;
      if (p.version !== 1 || !Array.isArray(p.markers) || !Array.isArray(p.operations) || !Array.isArray(p.bibliographyLinks)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const markers = p.markers.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const marker = raw as unknown as Record<string, unknown>;
        return marker.confirmed === true && Number.isInteger(marker.paragraphIndex) && Number.isInteger(marker.start) && Number.isInteger(marker.end) && Number.isInteger(marker.footnoteId) && typeof marker.anchorFingerprint === 'string'
          ? [{ paragraphIndex: Number(marker.paragraphIndex), start: Number(marker.start), end: Number(marker.end), footnoteId: Number(marker.footnoteId), anchorFingerprint: marker.anchorFingerprint.slice(0, 120), confirmed: true as const }]
          : [];
      });
      const kinds = new Set(['move-marker', 'replace-text', 'fix-ibid', 'replace-op-cit', 'normalize-law', 'add-gazette', 'split-sources', 'link-bibliography', 'introduce-abbreviation']);
      const operations = p.operations.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const operation = raw as unknown as Record<string, unknown>;
        return operation.confirmed === true && typeof operation.id === 'string' && Number.isInteger(operation.footnoteId) && typeof operation.kind === 'string' && kinds.has(operation.kind) && typeof operation.anchorFingerprint === 'string' && typeof operation.reason === 'string'
          ? [{ id: operation.id.trim().slice(0, 200), footnoteId: Number(operation.footnoteId), kind: operation.kind as LegalFootnoteRepairParams['operations'][number]['kind'], anchorFingerprint: operation.anchorFingerprint.slice(0, 120), ...(Number.isInteger(operation.start) ? { start: Number(operation.start) } : {}), ...(Number.isInteger(operation.end) ? { end: Number(operation.end) } : {}), ...(Number.isInteger(operation.paragraphIndex) ? { paragraphIndex: Number(operation.paragraphIndex) } : {}), ...(operation.markerPosition === 'before-punctuation' || operation.markerPosition === 'after-punctuation' ? { markerPosition: operation.markerPosition as 'before-punctuation' | 'after-punctuation' } : {}), ...(typeof operation.replacementText === 'string' ? { replacementText: operation.replacementText.slice(0, 20_000) } : {}), confirmed: true as const, reason: operation.reason.slice(0, 500) }]
          : [];
      });
      const bibliographyLinks = p.bibliographyLinks.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const link = raw as unknown as Record<string, unknown>;
        return link.confirmed === true && Number.isInteger(link.footnoteId) && typeof link.bibliographyEntryId === 'string'
          ? [{ footnoteId: Number(link.footnoteId), bibliographyEntryId: link.bibliographyEntryId.trim().slice(0, 200), confirmed: true as const }]
          : [];
      });
      if (markers.length !== p.markers.length || operations.length !== p.operations.length || bibliographyLinks.length !== p.bibliographyLinks.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return legalFootnoteRepairFixer(parts, { version: 1, markers, operations, bibliographyLinks, ...(typeof p.profileFingerprint === 'string' ? { profileFingerprint: p.profileFingerprint.slice(0, 200) } : {}) });
    }
    case 'final-document-inspector-fixer': {
      const p = params as Partial<FinalDocumentInspectorParams>;
      if (p.version !== 1 || !Array.isArray(p.revisions) || !Array.isArray(p.comments) || !Array.isArray(p.metadata) || !Array.isArray(p.hiddenText)) {
        return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      }
      return finalDocumentInspectorFixer(parts, p as FinalDocumentInspectorParams);
    }
    case 'table-figure-rescue-fixer': {
      const p = params as Partial<TableFigureRescueParams>;
      if (p.version !== 1 || !Array.isArray(p.tables) || !Array.isArray(p.figures)) {
        return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      }
      const tables = p.tables.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as unknown as Record<string, unknown>;
        const actions = value.actions && typeof value.actions === 'object' ? value.actions as Record<string, unknown> : {};
        if (typeof value.id !== 'string' || typeof value.anchorFingerprint !== 'string' || !Number.isInteger(value.bodyChildIndex)) return [];
        const allowed = ['fitToTextWidth', 'equalColumns', 'repeatHeader', 'preventRowSplit', 'center', 'applyProfileTypography', 'separateSource'] as const;
        const safeActions = Object.fromEntries(allowed.filter((key) => actions[key] === true).map((key) => [key, true])) as Record<string, true>;
        const textWidthEmu = isFiniteNumber(value.textWidthEmu) && value.textWidthEmu > 0 && value.textWidthEmu <= 100_000_000 ? value.textWidthEmu : undefined;
        const typographyRaw = value.typography && typeof value.typography === 'object' ? value.typography as Record<string, unknown> : undefined;
        const typography = typographyRaw ? {
          ...(typeof typographyRaw.font === 'string' && typographyRaw.font.trim().length <= 100 ? { font: typographyRaw.font.trim() } : {}),
          ...(isFiniteNumber(typographyRaw.sizePt) && typographyRaw.sizePt >= 1 && typographyRaw.sizePt <= 72 ? { sizePt: typographyRaw.sizePt } : {}),
          ...(isFiniteNumber(typographyRaw.beforePt) && typographyRaw.beforePt >= 0 && typographyRaw.beforePt <= 720 ? { beforePt: typographyRaw.beforePt } : {}),
          ...(isFiniteNumber(typographyRaw.afterPt) && typographyRaw.afterPt >= 0 && typographyRaw.afterPt <= 720 ? { afterPt: typographyRaw.afterPt } : {}),
        } : undefined;
        const sourceRaw = value.source && typeof value.source === 'object' ? value.source as Record<string, unknown> : undefined;
        const source = sourceRaw && Number.isInteger(sourceRaw.paragraphIndex) && typeof sourceRaw.anchorFingerprint === 'string' ? { paragraphIndex: Number(sourceRaw.paragraphIndex), anchorFingerprint: sourceRaw.anchorFingerprint.slice(0, 120) } : undefined;
        const landscapeRaw = value.landscape && typeof value.landscape === 'object' ? value.landscape as Record<string, unknown> : undefined;
        const landscape = landscapeRaw?.enabled === true && landscapeRaw.confirmed === true && typeof landscapeRaw.beforeFingerprint === 'string' && typeof landscapeRaw.afterFingerprint === 'string'
          ? { enabled: true as const, confirmed: true as const, beforeFingerprint: landscapeRaw.beforeFingerprint.slice(0, 120), afterFingerprint: landscapeRaw.afterFingerprint.slice(0, 120) }
          : undefined;
        return [{ id: value.id.slice(0, 200), bodyChildIndex: Number(value.bodyChildIndex), anchorFingerprint: value.anchorFingerprint.slice(0, 120), ...(textWidthEmu !== undefined ? { textWidthEmu } : {}), ...(typography && Object.keys(typography).length ? { typography } : {}), ...(source ? { source } : {}), actions: safeActions, ...(landscape ? { landscape } : {}) }];
      });
      const figures = p.figures.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as unknown as Record<string, unknown>;
        const actions = value.actions && typeof value.actions === 'object' ? value.actions as Record<string, unknown> : {};
        if (typeof value.id !== 'string' || typeof value.anchorFingerprint !== 'string' || !Number.isInteger(value.paragraphIndex) || !Number.isInteger(value.drawingIndex)) return [];
        const allowed = ['constrainToTextWidth', 'preserveAspectRatio', 'center', 'removeWrapping', 'keepWithCaption'] as const;
        const safeActions = Object.fromEntries(allowed.filter((key) => actions[key] === true).map((key) => [key, true])) as Record<string, true>;
        const maxWidthEmu = isFiniteNumber(value.maxWidthEmu) && value.maxWidthEmu > 0 && value.maxWidthEmu <= 100_000_000 ? value.maxWidthEmu : undefined;
        const altText = typeof value.altText === 'string' && value.altText.length <= 500 ? value.altText : undefined;
        return [{ id: value.id.slice(0, 200), paragraphIndex: Number(value.paragraphIndex), drawingIndex: Number(value.drawingIndex), anchorFingerprint: value.anchorFingerprint.slice(0, 120), ...(maxWidthEmu !== undefined ? { maxWidthEmu } : {}), actions: safeActions, ...(altText !== undefined ? { altText } : {}) }];
      });
      if (tables.length !== p.tables.length || figures.length !== p.figures.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return tableFigureRescueFixer(parts, { version: 1, tables, figures, ...(typeof p.profileFingerprint === 'string' ? { profileFingerprint: p.profileFingerprint.slice(0, 200) } : {}) });
    }
    case 'section-surgery-fixer': {
      const p = params as Partial<SectionSurgeryParams>;
      if (p.version !== 1 || !Array.isArray(p.operations)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const kinds = new Set(['set-geometry', 'set-numbering', 'set-title-page', 'set-odd-even', 'unlink-header', 'unlink-footer', 'insert-section']);
      const operations = p.operations.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as unknown as Record<string, unknown>;
        if (value.confirmed !== true || typeof value.id !== 'string' || typeof value.kind !== 'string' || !kinds.has(value.kind) || !Number.isInteger(value.sectionOrdinal) || Number(value.sectionOrdinal) < 0 || typeof value.anchorFingerprint !== 'string') return [];
        const operation: Record<string, unknown> = {
          id: value.id.trim().slice(0, 200),
          kind: value.kind,
          sectionOrdinal: Number(value.sectionOrdinal),
          anchorFingerprint: value.anchorFingerprint.slice(0, 120),
          confirmed: true,
        };
        if (value.orientation === 'portrait' || value.orientation === 'landscape') operation.orientation = value.orientation;
        if (value.headerType === 'default' || value.headerType === 'first' || value.headerType === 'even') operation.headerType = value.headerType;
        if (value.footerType === 'default' || value.footerType === 'first' || value.footerType === 'even') operation.footerType = value.footerType;
        for (const key of ['pageWidthTwips', 'pageHeightTwips'] as const) if (isFiniteNumber(value[key]) && value[key] > 0 && value[key] <= 1000000) operation[key] = value[key];
        if (Number.isInteger(value.insertAfterBodyChildIndex) && Number(value.insertAfterBodyChildIndex) >= 0 && Number(value.insertAfterBodyChildIndex) <= 2000000) operation.insertAfterBodyChildIndex = Number(value.insertAfterBodyChildIndex);
        if (typeof value.enabled === 'boolean') operation.enabled = value.enabled;
        if (value.numbering && typeof value.numbering === 'object') {
          const numbering = value.numbering as Record<string, unknown>;
          const formats = new Set(['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter']);
          if (typeof numbering.format === 'string' && formats.has(numbering.format)) operation.numbering = { format: numbering.format, ...(isFiniteNumber(numbering.start) && numbering.start > 0 ? { start: Number(numbering.start) } : {}) };
        }
        if (value.marginsTwips && typeof value.marginsTwips === 'object') {
          const margins: Record<string, number> = {};
          for (const key of ['top', 'right', 'bottom', 'left']) { const margin = (value.marginsTwips as Record<string, unknown>)[key]; if (isFiniteNumber(margin) && margin >= 0 && margin <= 100000) margins[key] = margin; }
          if (Object.keys(margins).length) operation.marginsTwips = margins;
        }
        return [operation as unknown as SectionSurgeryParams['operations'][number]];
      });
      if (operations.length !== p.operations.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return sectionSurgeryFixer(parts, { version: 1, operations, ...(typeof p.profileFingerprint === 'string' ? { profileFingerprint: p.profileFingerprint.slice(0, 200) } : {}) });
    }
    case 'field-integrity-fixer': {
      const p = params as Partial<FieldIntegrityParams>;
      if (p.version !== 1 || !Array.isArray(p.fields)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const fields = p.fields.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        return value.confirmed === true && value.action === 'mark-dirty' && typeof value.id === 'string' && typeof value.part === 'string' && typeof value.anchorFingerprint === 'string'
          ? [{ id: value.id.slice(0, 300), part: value.part.slice(0, 200), anchorFingerprint: value.anchorFingerprint.slice(0, 120), action: 'mark-dirty' as const, confirmed: true as const }]
          : [];
      });
      const manualToc = Array.isArray(p.manualToc) ? p.manualToc.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        return value.confirmed === true && value.action === 'replace-with-live-toc' && Number.isInteger(value.startParagraphIndex) && Number.isInteger(value.endParagraphIndex) && typeof value.anchorFingerprint === 'string'
          ? [{ startParagraphIndex: Number(value.startParagraphIndex), endParagraphIndex: Number(value.endParagraphIndex), anchorFingerprint: value.anchorFingerprint.slice(0, 120), action: 'replace-with-live-toc' as const, confirmed: true as const }]
          : [];
      }) : undefined;
      const bookmarks = Array.isArray(p.bookmarks) ? p.bookmarks.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        return value.confirmed === true && value.action === 'repair-known-target' && typeof value.part === 'string' && typeof value.bookmarkName === 'string' && typeof value.targetFingerprint === 'string'
          ? [{ part: value.part.slice(0, 200), bookmarkName: value.bookmarkName.slice(0, 80), targetFingerprint: value.targetFingerprint.slice(0, 120), action: 'repair-known-target' as const, confirmed: true as const }]
          : [];
      }) : undefined;
      if (fields.length !== p.fields.length || (manualToc && manualToc.length !== p.manualToc?.length) || (bookmarks && bookmarks.length !== p.bookmarks?.length)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const settings = p.settings?.updateFieldsOnOpen === true ? { updateFieldsOnOpen: true as const } : undefined;
      return fieldIntegrityFixer(parts, { version: 1, fields, ...(settings ? { settings } : {}), ...(manualToc?.length ? { manualToc } : {}), ...(bookmarks?.length ? { bookmarks } : {}) });
    }
    case 'croatian-typography-fixer': {
      const p = params as Partial<CroatianTypographyParams>;
      const allowed = new Set(['multiple-spaces', 'punctuation-spacing', 'missing-space-after-punctuation', 'quotation-marks', 'dash-consistency', 'ellipsis', 'nonbreaking-spaces', 'decimal-comma', 'percent-format', 'date-format', 'nested-quotes', 'ordinal-numbers', 'number-unit-spacing', 'abbreviation-consistency', 'repeated-punctuation', 'text-tabs', 'manual-line-breaks']);
      if (p.version !== 1 || !Array.isArray(p.categories) || !Array.isArray(p.operations)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const categories = p.categories.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        return value.consent === true && typeof value.category === 'string' && allowed.has(value.category) ? [{ category: value.category as CroatianTypographyParams['categories'][number]['category'], consent: true as const }] : [];
      });
      const operations = p.operations.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        if (value.confirmed !== true || typeof value.id !== 'string' || typeof value.category !== 'string' || !allowed.has(value.category) || typeof value.paragraphIndex !== 'number' || !Number.isInteger(value.paragraphIndex) || typeof value.textNodeIndex !== 'number' || !Number.isInteger(value.textNodeIndex) || typeof value.nodeKind !== 'string' || !['text', 'tab', 'line-break'].includes(value.nodeKind) || typeof value.before !== 'string' || typeof value.replacementText !== 'string' || typeof value.anchorFingerprint !== 'string') return [];
        const start = value.start;
        const end = value.end;
        if (value.nodeKind === 'text' && (!isFiniteNumber(start) || !isFiniteNumber(end) || !Number.isInteger(start) || !Number.isInteger(end))) return [];
        return [{ id: value.id.slice(0, 300), category: value.category as CroatianTypographyParams['operations'][number]['category'], paragraphIndex: value.paragraphIndex, textNodeIndex: value.textNodeIndex, nodeKind: value.nodeKind as CroatianTypographyParams['operations'][number]['nodeKind'], ...(value.nodeKind === 'text' ? { start: Number(start), end: Number(end) } : {}), before: value.before.slice(0, 1000), replacementText: value.replacementText.slice(0, 1000), anchorFingerprint: value.anchorFingerprint.slice(0, 120), confirmed: true as const }];
      });
      if (categories.length !== p.categories.length || operations.length !== p.operations.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return croatianTypographyFixer(parts, { version: 1, categories, operations, ...(typeof p.profileFingerprint === 'string' ? { profileFingerprint: p.profileFingerprint.slice(0, 200) } : {}) });
    }
    case 'link-doi-fixer': {
      const p = params as Partial<LinkDoiFixParams>;
      const allowed = new Set(['make-hyperlink', 'normalize-doi', 'repair-spacing', 'remove-tracking', 'replace-canonical-url', 'remove-link-styling']);
      if (p.version !== 1 || !Array.isArray(p.operations)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const operations = p.operations.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        if (value.confirmed !== true || typeof value.id !== 'string' || value.part !== 'word/document.xml' || !Number.isInteger(value.paragraphIndex) || !Number.isInteger(value.start) || !Number.isInteger(value.end) || typeof value.anchorFingerprint !== 'string' || typeof value.before !== 'string' || typeof value.action !== 'string' || !allowed.has(value.action)) return [];
        if (value.targetUrl !== undefined && (typeof value.targetUrl !== 'string' || !/^https?:\/\//i.test(value.targetUrl) || value.targetUrl.length > 4000)) return [];
        if (value.replacementText !== undefined && (typeof value.replacementText !== 'string' || value.replacementText.length > 4000)) return [];
        return [{ id: value.id.slice(0, 300), part: 'word/document.xml' as const, paragraphIndex: Number(value.paragraphIndex), start: Number(value.start), end: Number(value.end), anchorFingerprint: value.anchorFingerprint.slice(0, 120), before: value.before.slice(0, 4000), ...(typeof value.replacementText === 'string' ? { replacementText: value.replacementText } : {}), ...(typeof value.targetUrl === 'string' ? { targetUrl: value.targetUrl } : {}), action: value.action as LinkDoiFixParams['operations'][number]['action'], confirmed: true as const }];
      });
      if (operations.length !== p.operations.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return linkDoiFixer(parts, { version: 1, operations });
    }
    case 'submission-metadata-fixer': {
      const p = params as Partial<SubmissionMetadataFixParams>;
      if (p.version !== 1 || !Array.isArray(p.fields)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const fields = p.fields.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        if (value.confirmed !== true || value.part !== 'docProps/core.xml' || (value.field !== 'title' && value.field !== 'author') || typeof value.before !== 'string' || typeof value.replacementText !== 'string' || typeof value.fingerprint !== 'string') return [];
        return [{ field: value.field as 'title' | 'author', part: 'docProps/core.xml' as const, before: value.before.slice(0, 500), replacementText: value.replacementText.slice(0, 500), fingerprint: value.fingerprint.slice(0, 120), confirmed: true as const }];
      });
      if (fields.length !== p.fields.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return submissionMetadataFixer(parts, { version: 1, fields, ...(typeof p.fileFingerprint === 'string' ? { fileFingerprint: p.fileFingerprint.slice(0, 120) } : {}) });
    }
    case 'required-section-fixer': {
      const p = params as Partial<RequiredSectionFixParams>;
      if (p.version !== 1 || !Array.isArray(p.sections)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const kinds = new Set(['summary-hr', 'abstract', 'keywords-hr', 'keywords-en', 'originality-statement', 'abbreviation-list', 'figure-list', 'table-list', 'appendices']);
      const sections = p.sections.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        const anchor = value.insertionAnchor as Record<string, unknown> | undefined;
        if (value.confirmed !== true || typeof value.id !== 'string' || typeof value.kind !== 'string' || !kinds.has(value.kind) || typeof value.label !== 'string' || !anchor || !Number.isInteger(anchor.paragraphIndex) || typeof anchor.anchorFingerprint !== 'string' || !['before', 'after'].includes(String(anchor.position)) || !Number.isInteger(value.headingLevel) || Number(value.headingLevel) < 1 || Number(value.headingLevel) > 9 || typeof value.numbered !== 'boolean') return [];
        const out: RequiredSectionFixParams['sections'][number] = { id: value.id.slice(0, 300), kind: value.kind as RequiredSectionFixParams['sections'][number]['kind'], label: value.label.slice(0, 200), insertionAnchor: { paragraphIndex: Number(anchor.paragraphIndex), anchorFingerprint: String(anchor.anchorFingerprint).slice(0, 120), position: anchor.position as 'before' | 'after' }, headingLevel: Number(value.headingLevel), numbered: value.numbered, confirmed: true };
        if (typeof value.styleId === 'string') out.styleId = value.styleId.slice(0, 100);
        for (const key of ['placeholderText', 'commentText', 'statementText'] as const) if (typeof value[key] === 'string') out[key] = value[key].slice(0, 20000);
        return [out];
      });
      if (sections.length !== p.sections.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const numbering = p.numbering && typeof p.numbering === 'object' ? { maxLevel: Number(p.numbering.maxLevel), ...(p.numbering.format === 'decimal' || p.numbering.format === 'upperRoman' || p.numbering.format === 'lowerRoman' ? { format: p.numbering.format } : {}), ...(typeof p.numbering.trailingDot === 'boolean' ? { trailingDot: p.numbering.trailingDot } : {}) } : undefined;
      if (numbering && (!Number.isInteger(numbering.maxLevel) || numbering.maxLevel < 1 || numbering.maxLevel > 9)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return requiredSectionFixer(parts, { version: 1, sections, ...(numbering ? { numbering } : {}) });
    }
    case 'consistency-fixer': {
      const p = params as Partial<ConsistencyFixParams>;
      if (p.version !== 1 || !Array.isArray(p.groups) || !Array.isArray(p.replacements)) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      const allowed = new Set(['terminology', 'person', 'institution', 'citation', 'bibliography', 'document-metadata', 'element-label', 'heading-language']);
      const groups = p.groups.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        return value.confirmed === true && typeof value.id === 'string' && typeof value.zone === 'string' && allowed.has(value.zone) && typeof value.canonicalText === 'string' && value.canonicalText.length <= 500
          ? [{ id: value.id.slice(0, 300), zone: value.zone as ConsistencyFixParams['groups'][number]['zone'], canonicalText: value.canonicalText.slice(0, 500), confirmed: true as const }]
          : [];
      });
      const replacements = p.replacements.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const value = raw as Record<string, unknown>;
        const metadataField = ['dc:title', 'dc:creator', 'cp:lastModifiedBy', 'cp:revision'].includes(String(value.metadataField)) ? String(value.metadataField) as ConsistencyFixParams['replacements'][number]['metadataField'] : undefined;
        if (value.confirmed !== true || typeof value.id !== 'string' || typeof value.groupId !== 'string' || typeof value.part !== 'string' || typeof value.before !== 'string' || typeof value.replacementText !== 'string' || typeof value.anchorFingerprint !== 'string') return [];
        if (value.part === 'word/document.xml' && (!Number.isInteger(value.paragraphIndex) || !Number.isInteger(value.start) || !Number.isInteger(value.end))) return [];
        if (value.part !== 'word/document.xml' && value.part !== 'docProps/core.xml') return [];
        return [{ id: value.id.slice(0, 300), groupId: value.groupId.slice(0, 300), part: value.part.slice(0, 200), ...(value.paragraphIndex !== undefined ? { paragraphIndex: Number(value.paragraphIndex) } : {}), ...(value.start !== undefined ? { start: Number(value.start) } : {}), ...(value.end !== undefined ? { end: Number(value.end) } : {}), before: value.before.slice(0, 500), replacementText: value.replacementText.slice(0, 500), anchorFingerprint: value.anchorFingerprint.slice(0, 120), ...(metadataField ? { metadataField } : {}), confirmed: true as const }];
      });
      if (groups.length !== p.groups.length || replacements.length !== p.replacements.length) return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
      return consistencyFixer(parts, { version: 1, groups, replacements });
    }
    default:
      return { parts, applied: false, beforeLabel: '', afterLabel: '', reason: 'invalid-params' as const };
  }
}

/**
 * Zadnja vrata prije isporuke: dokazi da popravak nije pokvario paket.
 *
 * Zasto uopce postoji: fixeri su regex-patchevi nad OOXML-om (vidi xml-patch.ts), a
 * @xmldom/xmldom NE baca i ne stvara `parsererror` na neispravnom XML-u, pa bi provjera
 * oslonjena na parseXml dala lazno zeleno tocno na klasi greske koju ovaj motor moze
 * proizvesti (RE-47). Skener iz package-integrity.ts je zato rucni tokenizer bez ijedne
 * ovisnosti i smije se vrtjeti i u Deno Edgeu, gdje je ovo jedini gate pred korisnikom.
 *
 * Skeniraju se SAMO dijelovi koje smo sami zamijenili ili dodali. Netaknuti entryji izlaze
 * iz zipa s istim bajtovima s kojima su usli, pa bi njihovo skeniranje bilo placanje za tudji
 * ulaz: dokument koji je stigao neispravan takav i odlazi, a mi ne tvrdimo nista o njemu.
 *
 * Izvezeno radi testova: grane koje ovdje treba dokazati (nestao dio, prazan dio, kvar koji je
 * dosao s ulazom) nijedan zivi fixer ne proizvodi, pa se kroz javni applyFixers ne mogu izazvati.
 */
export function detectIntegrityFailure(
  changedXmlParts: readonly { name: string; xml: string }[],
  originalNames: readonly string[],
  finalNames: readonly string[],
  removedPackageParts: readonly string[],
  originalXmlParts: Readonly<Record<string, string>>,
): IntegrityFailure | null {
  for (const part of changedXmlParts) {
    if (part.xml.length === 0) {
      return { part: part.name, problem: 'dio paketa je nakon popravka prazan' };
    }
    const scan = scanXmlWellFormed(part.xml);
    if (!scan.ok) {
      // Ulaz se skenira SAMO ovdje, na vec propalom izlazu: normalan tijek time ne placi nista,
      // a poruka ne optuzuje nas za kvar koji je dosao s dokumentom (ni obrnuto).
      const before = originalXmlParts[part.name];
      const preexisting = before !== undefined && !scanXmlWellFormed(before).ok;
      return {
        part: part.name,
        problem: scan.problem ?? 'XML nije dobro oblikovan',
        ...(scan.offset != null ? { offset: scan.offset } : {}),
        ...(preexisting ? { preexisting: true } : {}),
      };
    }
  }
  // Nestali dio je jednako fatalan kao neispravan XML, a skener ga po definiciji ne vidi.
  // Jedini dopusteni gubitak je onaj koji je fixer izricito zatrazio (final-document-inspector
  // uklanja word/comments.xml).
  const survived = new Set(finalNames);
  const allowed = new Set(removedPackageParts);
  for (const name of originalNames) {
    if (survived.has(name) || allowed.has(name)) continue;
    return { part: name, problem: 'dio paketa je nestao iz popravljenog dokumenta' };
  }
  return null;
}

export async function applyFixers(
  docxBytes: Uint8Array,
  requests: FixerRequest[],
): Promise<ApplyFixersResult> {
  const entries = await readZip(docxBytes);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const documentEntry = entries.find((e) => e.name === DOCUMENT_XML_PATH);
  const stylesEntry = entries.find((e) => e.name === STYLES_XML_PATH);
  const numberingEntry = entries.find((e) => e.name === NUMBERING_XML_PATH);
  const contentTypesEntry = entries.find((e) => e.name === CONTENT_TYPES_PATH);
  const documentRelsEntry = entries.find((e) => e.name === DOCUMENT_RELS_PATH);
  const footnotesEntry = entries.find((e) => e.name === FOOTNOTES_XML_PATH);
  const footerHeaderEntries = entries.filter((e) => FOOTER_HEADER_PART_RE.test(e.name));

  if (!documentEntry) {
    throw new Error(`apply-fixers: nedostaje ${DOCUMENT_XML_PATH} u docx-u, nije valjan Word dokument`);
  }

  let parts: DocxXmlParts = {
    documentXml: decoder.decode(documentEntry.data),
    stylesXml: stylesEntry ? decoder.decode(stylesEntry.data) : '',
    numberingXml: numberingEntry ? decoder.decode(numberingEntry.data) : undefined,
    contentTypesXml: contentTypesEntry ? decoder.decode(contentTypesEntry.data) : '',
    documentRelsXml: documentRelsEntry ? decoder.decode(documentRelsEntry.data) : '',
    addedParts: [],
    addedPackageParts: [],
    // Sva postojeca imena partova: footer imenovanje ih mora vidjeti da ne kolidira s
    // orphan word/footerN.xml koji je u zipu ali ne u content-typesu (adversarial K5 nalaz).
    existingParts: entries.map((e) => e.name),
    footnotesXml: footnotesEntry ? decoder.decode(footnotesEntry.data) : undefined,
    footerHeaderParts: Object.fromEntries(
      footerHeaderEntries.map((e) => [e.name, decoder.decode(e.data)]),
    ),
    packageXmlParts: Object.fromEntries(
      entries
        .filter((entry) => entry.name === CONTENT_TYPES_PATH || /\.xml$/i.test(entry.name) || /\.rels$/i.test(entry.name))
        .map((entry) => [entry.name, decoder.decode(entry.data)]),
    ),
    removedPackageParts: [],
  };
  // Zapamti pocetne stringove: dio se re-enkodira SAMO ako ga je neki fixer
  // stvarno promijenio. TextDecoder je non-fatal (nevaljani UTF-8 -> U+FFFD),
  // pa bi bezuvjetni decode+encode tiho prepisao bajtove i netaknutog dijela.
  const originalDocumentXml = parts.documentXml;
  const originalStylesXml = parts.stylesXml;
  const originalNumberingXml = parts.numberingXml;
  const originalContentTypes = parts.contentTypesXml;
  const originalDocumentRels = parts.documentRelsXml;
  const originalFootnotesXml = parts.footnotesXml;
  const originalFooterHeaderParts = { ...parts.footerHeaderParts };
  const originalPackageXmlParts = { ...(parts.packageXmlParts ?? {}) };

  const changelog: ChangelogEntry[] = [];
  const skipped: string[] = [];
  const skippedReasons: Record<string, FixerNoOpReason> = {};

  // RE-46: stabilno rasporedi zahtjeve u dvije faze - prvo oni koji NE mijenjaju broj odlomaka
  // (anchor-osjetljivi), pa tek onda INDEX_SHIFTING_FIXERS. Unutar svake faze cuva se ULAZNI
  // redoslijed (Array.prototype.sort je stabilan), pa ovo ne mijenja nista osim relativnog
  // polozaja strukturnih fixera. Bez ovoga jedan strukturni popravak tiho obori sve kasnije
  // anchor-osjetljive (vidi komentar uz INDEX_SHIFTING_FIXERS).
  const orderedRequests = withoutOverlappingLinkDoiOperations(requests)
    .map((request, index) => ({ request, index }))
    .sort((a, b) => {
      const phase = Number(INDEX_SHIFTING_FIXERS.has(a.request.fixerId)) - Number(INDEX_SHIFTING_FIXERS.has(b.request.fixerId));
      if (phase !== 0) return phase;
      // RE-51: unutar strukturne faze idi od kraja dokumenta prema pocetku (vidi INDEX_SHIFTING_ORDER).
      const within = (INDEX_SHIFTING_ORDER.get(a.request.fixerId) ?? 0) - (INDEX_SHIFTING_ORDER.get(b.request.fixerId) ?? 0);
      return within !== 0 ? within : a.index - b.index;
    })
    .map((entry) => entry.request);

  for (const request of orderedRequests) {
    let result: ReturnType<typeof runFixer>;
    try {
      const packageXmlParts = { ...(parts.packageXmlParts ?? {}) };
      result = runFixer(request.fixerId, { ...parts, packageXmlParts, addedPackageParts: [...(parts.addedPackageParts ?? [])] }, request.params);
    } catch {
      // RE-26: fixer koji BACI (neocekivana/rubna kombinacija ulaza) ne smije oboriti CIJELU
      // bateriju, ukljucivo popravke VEC uspjesno primijenjene prije njega u istom pozivu. Server
      // bez ovoga mapira ijedan takav pad u 422 invalid_docx, sto krivo optuzuje korisnikov
      // dokument umjesto internog buga fixera. Isti fail-safe tretman kao "nije uspio primijeniti".
      // Razlog se ovdje NAMJERNO ne biljezi (neocekivan pad, ne uobicajen no-op).
      skipped.push(request.ruleId);
      continue;
    }
    if (!result.applied) {
      // Fail-safe: fixer nije uspio primijeniti popravak (npr. atribut ne
      // postoji u ovom dokumentu), tiho preskoci, ne baca korisniku gresku.
      skipped.push(request.ruleId);
      // RE-36/41: reason (kad ga fixer racuna) omogucuje UI-ju da razdvoji "vec uskladjeno" od
      // "nije bilo moguce", umjesto identicnog popisa krivnji za oba slucaja.
      if (result.reason) skippedReasons[request.ruleId] = result.reason;
      continue;
    }
    const beforePackageXmlParts = { ...(parts.packageXmlParts ?? {}) };
    parts = result.parts;
      if (parts.packageXmlParts) {
      const synchronized = { ...parts.packageXmlParts };
      if (synchronized[DOCUMENT_XML_PATH] === beforePackageXmlParts[DOCUMENT_XML_PATH]) synchronized[DOCUMENT_XML_PATH] = parts.documentXml;
      if (synchronized[STYLES_XML_PATH] === beforePackageXmlParts[STYLES_XML_PATH]) synchronized[STYLES_XML_PATH] = parts.stylesXml;
      if (synchronized[NUMBERING_XML_PATH] === beforePackageXmlParts[NUMBERING_XML_PATH] && parts.numberingXml !== undefined) synchronized[NUMBERING_XML_PATH] = parts.numberingXml;
      if (synchronized[CONTENT_TYPES_PATH] === beforePackageXmlParts[CONTENT_TYPES_PATH]) synchronized[CONTENT_TYPES_PATH] = parts.contentTypesXml ?? '';
      if (synchronized[DOCUMENT_RELS_PATH] === beforePackageXmlParts[DOCUMENT_RELS_PATH]) synchronized[DOCUMENT_RELS_PATH] = parts.documentRelsXml ?? '';
      if (synchronized[FOOTNOTES_XML_PATH] === beforePackageXmlParts[FOOTNOTES_XML_PATH] && parts.footnotesXml !== undefined) synchronized[FOOTNOTES_XML_PATH] = parts.footnotesXml;
      for (const [name, value] of Object.entries(parts.footerHeaderParts ?? {})) if (synchronized[name] === beforePackageXmlParts[name]) synchronized[name] = value;
      parts = { ...parts, packageXmlParts: synchronized };
      }
    if (parts.addedPackageParts) parts = { ...parts, addedPackageParts: [...parts.addedPackageParts] };
    changelog.push({
      ruleId: request.ruleId,
      fixerId: request.fixerId,
      beforeLabel: result.beforeLabel,
      afterLabel: result.afterLabel,
    });
  }

  const numberingWasAdded = !numberingEntry && !!parts.numberingXml && parts.numberingXml !== originalNumberingXml;
  if (numberingWasAdded) {
    parts = {
      ...parts,
      contentTypesXml: ensureNumberingContentType(parts.contentTypesXml ?? ''),
      documentRelsXml: ensureNumberingRelationship(parts.documentRelsXml ?? ''),
    };
  }

  // Nijedan popravak nije primijenjen: vrati ULAZNE bajtove bit-identicne
  // (bez rekompresije, bez re-encode), da "popravljeni" dokument bez popravaka
  // ne bude tiho prepisan.
  if (changelog.length === 0) {
    return { docxBytes, changelog, skipped, skippedReasons };
  }

  // Rekonstruiraj zip: SAMO stvarno promijenjeni dio (document.xml odnosno
  // styles.xml) dobiva novi sadrzaj, svi ostali entryji prolaze bez ikakve
  // izmjene (isti Uint8Array objekt).
  // Svaki dio koji NAPUSTA ovaj motor promijenjen prolazi kroz vrata integriteta nize.
  const changedXmlParts: { name: string; xml: string }[] = [];
  const replaced = (name: string, xml: string): ZipEntry => {
    changedXmlParts.push({ name, xml });
    return { name, data: encoder.encode(xml) };
  };

  const newEntries: ZipEntry[] = entries.map((entry) => {
    if (parts.removedPackageParts?.includes(entry.name)) return null;
    if (parts.packageXmlParts?.[entry.name] !== undefined && parts.packageXmlParts[entry.name] !== originalPackageXmlParts[entry.name]) {
      return replaced(entry.name, parts.packageXmlParts[entry.name]);
    }
    if (entry.name === DOCUMENT_XML_PATH && parts.documentXml !== originalDocumentXml) {
      return replaced(entry.name, parts.documentXml);
    }
    if (entry.name === STYLES_XML_PATH && stylesEntry && parts.stylesXml !== originalStylesXml) {
      return replaced(entry.name, parts.stylesXml);
    }
    if (entry.name === NUMBERING_XML_PATH && numberingEntry && parts.numberingXml !== originalNumberingXml) {
      return replaced(entry.name, parts.numberingXml ?? '');
    }
    if (entry.name === CONTENT_TYPES_PATH && contentTypesEntry && (parts.contentTypesXml ?? '') !== originalContentTypes) {
      return replaced(entry.name, parts.contentTypesXml ?? '');
    }
    if (entry.name === DOCUMENT_RELS_PATH && documentRelsEntry && (parts.documentRelsXml ?? '') !== originalDocumentRels) {
      return replaced(entry.name, parts.documentRelsXml ?? '');
    }
    if (entry.name === FOOTNOTES_XML_PATH && footnotesEntry && parts.footnotesXml !== originalFootnotesXml) {
      return replaced(entry.name, parts.footnotesXml ?? '');
    }
    if (
      FOOTER_HEADER_PART_RE.test(entry.name) &&
      parts.footerHeaderParts?.[entry.name] !== undefined &&
      parts.footerHeaderParts[entry.name] !== originalFooterHeaderParts[entry.name]
    ) {
      return replaced(entry.name, parts.footerHeaderParts[entry.name]);
    }
    return entry; // netaknuto, isti podatak
  }).filter((entry): entry is ZipEntry => entry !== null);
  if (numberingWasAdded && parts.numberingXml) {
    newEntries.push(replaced(NUMBERING_XML_PATH, parts.numberingXml));
  }

  // Novi partovi (K5 footer flow): SAMO iz allow-liste (word/footerN.xml) i SAMO imena koja
  // jos ne postoje u zipu (ne prepisujemo postojeci part). Ostalo se tiho odbacuje (backstop
  // protiv fixera koji bi pokusao dodati part izvan politike enginea).
  const existingNames = new Set(entries.map((e) => e.name));
  for (const p of parts.addedParts ?? []) {
    if (!ENGINE_ADDABLE_PART.test(p.name) || existingNames.has(p.name)) continue;
    existingNames.add(p.name);
    newEntries.push(replaced(p.name, p.content));
  }
  for (const p of parts.addedPackageParts ?? []) {
    if (!ENGINE_ADDABLE_PACKAGE_PART.test(p.name) || existingNames.has(p.name)) continue;
    existingNames.add(p.name);
    newEntries.push(replaced(p.name, p.content));
  }

  // Vrata integriteta: popravak koji bi isporucio neispravan paket se NE isporucuje. Vracaju se
  // ULAZNI bajtovi bit-identicni (bez rekompresije) i changelog: [], sto na serveru vec znaci
  // "nista nije primijenjeno" pa se slot/kvota ne trosi. integrityFailure je jedino sto razlikuje
  // ovaj ishod od "nema se sto popraviti"; pozivatelj ga MORA procitati prije te poruke.
  const integrityFailure = detectIntegrityFailure(
    changedXmlParts,
    entries.map((e) => e.name),
    newEntries.map((e) => e.name),
    parts.removedPackageParts ?? [],
    originalPackageXmlParts,
  );
  if (integrityFailure) {
    return { docxBytes, changelog: [], skipped: requests.map((r) => r.ruleId), skippedReasons: {}, integrityFailure };
  }

  const newDocxBytes = await writeZip(newEntries);

  return { docxBytes: newDocxBytes, changelog, skipped, skippedReasons };
}
