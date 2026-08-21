/**
 * Heuristicka procjena paginacije za Rendgen dokumenta (odlomak -> priblizna stranica).
 *
 * OVO JE UI PROCJENA, NIKAD PODATAK ANALIZE: rezultat ne ulazi u result.checks ni result.stats
 * (golden snapshotira CIJELI stats, a bodovanje po procijenjenom broju stranica bilo bi
 * izmisljeno pravilo). Za pravila o broju stranica mjerodavan je broj u Wordu (storedPages),
 * ne ova procjena; sucelje to mora izgovoriti uz svaki prikaz (caption + "~" prefiks).
 *
 * Model: visinska akumulacija (velicina, prored, razmaci, slike, volumen fusnota po markeru)
 * s TVRDIM prijelomima (pageBreakAfter iz Worda + granice sekcija) i mekanom kalibracijom na
 * Wordov spremljeni broj stranica. Egzaktna paginacija bez layout enginea nije moguca
 * (lomljenje redaka pravim metrikama fonta, keepNext, udovice); ovo je posteni srednji put.
 */
import type { PreviewModel, PreviewParagraph } from './preview-anchors';

const PT_PER_CM = 28.346;
/** Iste zadane vrijednosti kao render-facsimile (A4, margine 2.5 cm, TNR 12). */
const DEFAULT_PAGE_W_CM = 21;
const DEFAULT_PAGE_H_CM = 29.7;
const DEFAULT_MARGIN_CM = 2.5;
const DEFAULT_BASE_SIZE_PT = 12;
/** Prosjecna sirina glifa ~0.5 em (serif 12pt na 16cm korisne sirine daje ~85 znakova/red). */
const AVG_GLYPH_EM = 0.5;
const DEFAULT_LINE_HEIGHT = 1.15;
const FOOTNOTE_SIZE_PT = 10;
/** Kalibracijski klamp: izvan ovoga storedPages vjerojatno ne opisuje ovaj dokument. */
const CALIBRATION_MIN = 0.6;
const CALIBRATION_MAX = 1.8;

export interface PageMapInput {
  model: PreviewModel;
  /** Wordov spremljeni broj stranica (stats.storedPages); moze biti zastario. */
  storedPages?: number | null;
  /** GLOBALNI 1-based indeksi odlomaka NAKON kojih pocinje nova sekcija (details.sections[].paragraphIndex). */
  sectionBreaks?: readonly (number | null | undefined)[] | null;
}

export interface PageMap {
  /** pageOf[i] = 1-based broj stranice za model.paragraphs[i] (POZICIJA u nizu, ne .index). */
  pageOf: number[];
  pageCount: number;
  /** true kad je skala uskladjena sa storedPages BEZ aktiviranog klampa (inace sirova procjena). */
  calibrated: boolean;
  /** Uvijek true: procjena, nikad egzaktan prijelom. Za posten caption. */
  approximate: true;
}

function cmOr(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : fallback;
}

interface Metrics {
  usableHeightPt: number;
  usableWidthPt: number;
  baseSizePt: number;
}

function metricsFor(model: PreviewModel): Metrics {
  const pageW = cmOr(model?.page?.size?.w, DEFAULT_PAGE_W_CM);
  const pageH = cmOr(model?.page?.size?.h, DEFAULT_PAGE_H_CM);
  const mTop = cmOr(model?.page?.margins?.top, DEFAULT_MARGIN_CM);
  const mBottom = cmOr(model?.page?.margins?.bottom, DEFAULT_MARGIN_CM);
  const mLeft = cmOr(model?.page?.margins?.left, DEFAULT_MARGIN_CM);
  const mRight = cmOr(model?.page?.margins?.right, DEFAULT_MARGIN_CM);
  return {
    usableHeightPt: Math.max(200, (pageH - mTop - mBottom) * PT_PER_CM),
    usableWidthPt: Math.max(150, (pageW - mLeft - mRight) * PT_PER_CM),
    baseSizePt: typeof model?.baseSize === 'number' && model.baseSize > 0 ? model.baseSize : DEFAULT_BASE_SIZE_PT,
  };
}

function textLines(text: string, sizePt: number, usableWidthPt: number): number {
  const charsPerLine = Math.max(20, usableWidthPt / (AVG_GLYPH_EM * sizePt));
  return Math.max(1, Math.ceil((text?.length || 0) / charsPerLine));
}

/** Meka (skalabilna) visina jednog odlomka u tockama, bez tvrdih prijeloma. */
function paragraphHeightPt(p: PreviewParagraph, m: Metrics, footnoteTextById: Map<number, string>): number {
  const size = typeof p.size === 'number' && p.size > 0 ? p.size : m.baseSizePt;
  const lineHeight = typeof p.lineHeight === 'number' && p.lineHeight > 0 ? p.lineHeight : DEFAULT_LINE_HEIGHT;
  let height = textLines(p.text, size, m.usableWidthPt) * size * lineHeight;
  height += (typeof p.spaceBefore === 'number' ? p.spaceBefore : 0) + (typeof p.spaceAfter === 'number' ? p.spaceAfter : 0);
  for (const img of p.images ?? []) {
    const hCm = typeof img.hCm === 'number' && img.hCm > 0
      ? img.hCm
      : Math.min(cmOr(img.wCm, 4), m.usableWidthPt / PT_PER_CM);
    height += hCm * PT_PER_CM;
  }
  // Fusnota jede prostor tijela stranice na kojoj joj je marker.
  for (const mark of p.markers ?? []) {
    const fnText = footnoteTextById.get(mark.id);
    if (fnText) height += textLines(fnText, FOOTNOTE_SIZE_PT, m.usableWidthPt) * FOOTNOTE_SIZE_PT * DEFAULT_LINE_HEIGHT;
  }
  return height;
}

/**
 * Grupira uzastopne odlomke iste tablicne pozicije (tableId+row) u jedan blok cija je meka
 * visina MAKSIMUM clanova (celije dijele redak). Gruba v1 aproksimacija, posteno priblizna.
 */
interface Block {
  /** Pozicije (indeksi u model.paragraphs) koje blok pokriva. */
  positions: number[];
  softHeightPt: number;
  hardBreakAfter: boolean;
}

function buildBlocks(model: PreviewModel, m: Metrics, breakAfterGlobal: ReadonlySet<number>): Block[] {
  const footnoteTextById = new Map<number, string>();
  for (const fn of model.footnotes ?? []) footnoteTextById.set(fn.id, fn.text || '');
  const paragraphs = model.paragraphs ?? [];
  const blocks: Block[] = [];
  for (let pos = 0; pos < paragraphs.length; pos++) {
    const p = paragraphs[pos];
    const height = paragraphHeightPt(p, m, footnoteTextById);
    const hardAfter = p.pageBreakAfter === true || breakAfterGlobal.has(p.index);
    const last = blocks[blocks.length - 1];
    const sameRow = last && p.cell && !last.hardBreakAfter
      && paragraphs[last.positions[0]].cell
      && paragraphs[last.positions[0]].cell!.tableId === p.cell.tableId
      && paragraphs[last.positions[0]].cell!.row === p.cell.row;
    if (sameRow && last) {
      last.positions.push(pos);
      last.softHeightPt = Math.max(last.softHeightPt, height);
      last.hardBreakAfter = last.hardBreakAfter || hardAfter;
    } else {
      blocks.push({ positions: [pos], softHeightPt: height, hardBreakAfter: hardAfter });
    }
  }
  return blocks;
}

function accumulate(blocks: Block[], usableHeightPt: number, scale: number, paragraphCount: number): { pageOf: number[]; pageCount: number } {
  const pageOf = new Array<number>(paragraphCount).fill(1);
  let page = 1;
  let used = 0;
  for (const block of blocks) {
    const h = block.softHeightPt * scale;
    if (used > 0 && used + h > usableHeightPt) {
      page++;
      used = 0;
    }
    for (const pos of block.positions) pageOf[pos] = page;
    used += h;
    if (block.hardBreakAfter) {
      page++;
      used = 0;
    }
  }
  // Tvrdi prijelom iza ZADNJEG bloka ne otvara praznu stranicu.
  const pageCount = blocks.length && blocks[blocks.length - 1].hardBreakAfter ? Math.max(1, page - 1) : page;
  return { pageOf, pageCount };
}

export function buildPageMap(input: PageMapInput): PageMap {
  const model = input?.model;
  const paragraphs = model?.paragraphs ?? [];
  if (!paragraphs.length) return { pageOf: [], pageCount: 0, calibrated: false, approximate: true };
  const m = metricsFor(model);
  const maxIndex = paragraphs[paragraphs.length - 1]?.index ?? paragraphs.length;
  const breakAfterGlobal = new Set<number>();
  for (const idx of input.sectionBreaks ?? []) {
    // Zadnji body sectPr nosi indeks zadnjeg odlomka (ili vise); on NIJE prijelom.
    if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 1 && idx < maxIndex) breakAfterGlobal.add(idx);
  }
  const blocks = buildBlocks(model, m, breakAfterGlobal);
  const raw = accumulate(blocks, m.usableHeightPt, 1, paragraphs.length);

  // Kalibracija na Wordov spremljeni broj: NIKAD nad skracenim previewom (kalibrirati 40%
  // dokumenta na pun broj stranica dalo bi besmislenu skalu), i samo unutar klampa.
  const storedPages = typeof input.storedPages === 'number' && Number.isFinite(input.storedPages) ? input.storedPages : null;
  if (model.truncated || storedPages == null || storedPages < 2 || raw.pageCount < 1) {
    return { ...raw, calibrated: false, approximate: true };
  }
  const k = storedPages / raw.pageCount;
  if (k < CALIBRATION_MIN || k > CALIBRATION_MAX) {
    return { ...raw, calibrated: false, approximate: true };
  }
  if (Math.abs(k - 1) < 1e-9) return { ...raw, calibrated: true, approximate: true };
  // k > 1: dokument ima VISE stranica nego procjena -> meke visine se mnoze s k (i obrnuto).
  const calibrated = accumulate(blocks, m.usableHeightPt, k, paragraphs.length);
  return { ...calibrated, calibrated: true, approximate: true };
}
