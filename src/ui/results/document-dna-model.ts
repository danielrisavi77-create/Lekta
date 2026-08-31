/**
 * DNA rada: gdje su nalazi u dokumentu.
 *
 * OS JE REDNI BROJ ODLOMKA, i to je jedina potpuna, izmjerena i monotona velicina koju analiza
 * ima. Naslovi su oznake NA toj osi, nikad sama os: `measurements.structure.headings` je prazan
 * kad student koristi rucni bold umjesto Word Heading stilova, sto je cest slucaj, pa bi traka
 * gradjena po naslovima za takav rad jednostavno nestala.
 *
 * STO SE OVDJE NE SMIJE POJAVITI: broj stranice. Wordov broj stranice ne postoji u podacima
 * (`preview.paragraphs[]` nema `page`; `stats.storedPages` je samo ukupan broj iz docProps).
 * Prva izvedba ove trake ga je ipak ispisivala iz nepostojeceg polja, pa je cijeli tip izbacen
 * i gradi se nanovo. Gard: `tests/document-dna-model.test.ts` tvrdi da u modelu nema kljuca
 * `page` ni niza `str.`.
 *
 * TRI KOORDINATNA PROSTORA, namjerno razdvojena:
 *   1. odlomci  -> trake kanti (bucket), jedini prostor koji ima poredak
 *   2. fusnote  -> vlastita traka; `collectFootnoteAnchors` ne filtrira po kategoriji, pa i jedan
 *                  formatting nalaz (oznaka fusnote) legitimno zavrsi ovdje
 *   3. dokument -> nalazi istiniti za cijeli rad; `collectIssueAnchors` NAMJERNO preskace
 *                  kategoriju `formatting`, pa se oni ne smiju rasuti po traci
 */

/** Podskup `TriageLocation` koji ova traka cita. */
export interface DnaLocationInput {
  paragraphIndex: number;
  footnoteId?: number;
  anchorId: string;
}

/** Podskup `TriageFinding` koji ova traka cita. */
export interface DnaFindingInput {
  id: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  locations: readonly DnaLocationInput[];
}

export interface DnaHeadingInput {
  index: number;
  level: number;
  excerpt: string;
}

export interface DocumentDnaInput {
  /** `measurements.counts.paragraphs`: SVI odlomci tijela, brojani PRIJE skracivanja pregleda. */
  totalParagraphs: number;
  /** `preview.paragraphs.at(-1)?.index`: zadnji odlomak do kojeg se uopce moze skociti. */
  lastPreviewedParagraph: number | null;
  previewTruncated: boolean;
  headings: readonly DnaHeadingInput[];
  findings: readonly DnaFindingInput[];
  /** `readiness.authoritative === false`: nalazi su moguca odstupanja, ne potvrdjeni zahtjevi. */
  provisional: boolean;
}

export type DnaSeverity = 'error' | 'warning' | 'info';

export interface DnaBucket {
  id: string;
  ordinal: number;
  /** 1-bazirano, ukljucivo. Rasponi su kontinuirani i iscrpni nad 1..totalParagraphs. */
  from: number;
  to: number;
  locationCount: number;
  findingIds: string[];
  counts: Record<DnaSeverity, number>;
  dominantSeverity: DnaSeverity | null;
  /** 0..1, udio u NAJGUSCOJ kanti. Odnos unutar dokumenta, nikad usporedba medju dokumentima. */
  heightRatio: number;
  headings: DnaHeadingInput[];
  /** Prvi sidreni odlomak u rasponu koji je jos u pregledu; `null` znaci da se ne moze skociti. */
  jumpParagraphIndex: number | null;
  beyondPreview: boolean;
}

/** Nalazi istiniti za CIJELI rad. Nikad se ne stavljaju na traku. */
export interface DnaDocumentWide {
  findingIds: string[];
  counts: Record<DnaSeverity, number>;
  formattingCount: number;
}

export interface DnaFootnoteMark {
  footnoteId: number;
  findingIds: string[];
  dominantSeverity: DnaSeverity;
}

export interface DnaUnplaced {
  findingIds: string[];
  /** Sidra izvan 1..totalParagraphs. Nikad se ne stiscu u zadnju kantu. */
  outOfRangeCount: number;
}

export type DocumentDnaModel =
  | { kind: 'unavailable'; reason: string }
  | {
      kind: 'available';
      totalParagraphs: number;
      buckets: DnaBucket[];
      documentWide: DnaDocumentWide;
      footnotes: DnaFootnoteMark[];
      unplaced: DnaUnplaced;
      headingsAvailable: boolean;
      previewTruncated: boolean;
      lastPreviewedParagraph: number | null;
      provisional: boolean;
    };

const MAX_BUCKETS = 24;
const SEVERITY_ORDER: DnaSeverity[] = ['error', 'warning', 'info'];

function emptyCounts(): Record<DnaSeverity, number> {
  return { error: 0, warning: 0, info: 0 };
}

function dominant(counts: Record<DnaSeverity, number>): DnaSeverity | null {
  for (const s of SEVERITY_ORDER) if (counts[s] > 0) return s;
  return null;
}

/**
 * Rasponi kanti nad `1..total`. Ostatak dijeljenja ide VODECIM kantama, pa su rasponi
 * kontinuirani i iscrpni bez ijedne rupe. Ta je osobina izravno provjerljiva testom, i zato
 * je odabrana umjesto zaokruzivanja koje bi ostavilo odlomak bez kante.
 */
export function bucketRanges(total: number): Array<{ from: number; to: number }> {
  if (!Number.isFinite(total) || total < 1) return [];
  const count = Math.min(MAX_BUCKETS, Math.floor(total));
  const base = Math.floor(total / count);
  const extra = total % count;
  const out: Array<{ from: number; to: number }> = [];
  let cursor = 1;
  for (let i = 0; i < count; i += 1) {
    const size = base + (i < extra ? 1 : 0);
    out.push({ from: cursor, to: cursor + size - 1 });
    cursor += size;
  }
  return out;
}

function isSeverity(value: unknown): value is DnaSeverity {
  return value === 'error' || value === 'warning' || value === 'info';
}

/**
 * PRAVILO MAPIRANJA, i ono je ustav ove trake zapisan u kodu:
 *   fusnota                     -> traka fusnota
 *   category === 'formatting'   -> documentWide (tvrdi gard; nikad ne dolazi do kante)
 *   izvan 1..total              -> unplaced
 *   inace                       -> kanta koja sadrzi taj odlomak
 * Nalaz bez ijedne lokacije ide u documentWide ako je formatting, inace u unplaced.
 */
export function buildDocumentDnaModel(input: DocumentDnaInput): DocumentDnaModel {
  const total = Number.isFinite(input.totalParagraphs) ? Math.floor(input.totalParagraphs) : 0;
  if (total < 1) {
    return { kind: 'unavailable', reason: 'Broj odlomaka nije izmjeren, pa se traka ne moze nacrtati.' };
  }

  const ranges = bucketRanges(total);
  const buckets: DnaBucket[] = ranges.map((r, i) => ({
    id: `dna-b${i}`,
    ordinal: i,
    from: r.from,
    to: r.to,
    locationCount: 0,
    findingIds: [],
    counts: emptyCounts(),
    dominantSeverity: null,
    heightRatio: 0,
    headings: [],
    jumpParagraphIndex: null,
    beyondPreview: false,
  }));

  const bucketOf = (paragraph: number): DnaBucket | null => {
    for (const b of buckets) if (paragraph >= b.from && paragraph <= b.to) return b;
    return null;
  };

  const lastPreviewed = typeof input.lastPreviewedParagraph === 'number' && Number.isFinite(input.lastPreviewedParagraph)
    ? Math.floor(input.lastPreviewedParagraph)
    : null;

  const documentWide: DnaDocumentWide = { findingIds: [], counts: emptyCounts(), formattingCount: 0 };
  const footnoteMap = new Map<number, { findingIds: string[]; counts: Record<DnaSeverity, number> }>();
  const unplaced: DnaUnplaced = { findingIds: [], outOfRangeCount: 0 };
  const seenAnchors = new Set<string>();

  const addOnce = (list: string[], id: string): void => { if (!list.includes(id)) list.push(id); };

  for (const finding of input.findings ?? []) {
    if (!finding || typeof finding.id !== 'string') continue;
    const severity: DnaSeverity = isSeverity(finding.severity) ? finding.severity : 'info';
    const isFormatting = finding.category === 'formatting';
    const locations = Array.isArray(finding.locations) ? finding.locations : [];

    let placed = false;
    for (const loc of locations) {
      if (!loc || typeof loc.anchorId !== 'string') continue;
      // Dedup po PARU nalaz+sidro: isti nalaz sa sedam razlicitih sidara pali sedam kanti,
      // ali isto sidro dvaput broji jednom.
      const key = `${finding.id}|${loc.anchorId}`;
      if (seenAnchors.has(key)) continue;
      seenAnchors.add(key);

      if (typeof loc.footnoteId === 'number' && Number.isInteger(loc.footnoteId) && loc.footnoteId >= 0) {
        const entry = footnoteMap.get(loc.footnoteId) ?? { findingIds: [], counts: emptyCounts() };
        addOnce(entry.findingIds, finding.id);
        entry.counts[severity] += 1;
        footnoteMap.set(loc.footnoteId, entry);
        placed = true;
        continue;
      }

      if (isFormatting) {
        // Tvrdi gard: oblikovanje je istinito za cijeli rad i NIKAD ne smije zavrsiti u kanti,
        // makar mu je slobodan tekst nalaza podmetnuo broj odlomka.
        addOnce(documentWide.findingIds, finding.id);
        documentWide.counts[severity] += 1;
        placed = true;
        continue;
      }

      const paragraph = Math.floor(Number(loc.paragraphIndex));
      if (!Number.isFinite(paragraph) || paragraph < 1 || paragraph > total) {
        // `ISSUE_ANCHOR_RE` cita znamenke iz slobodnog teksta, pa je odlomak izvan raspona
        // stvaran slucaj, ne teorijski. Broji se i imenuje, nikad ne clampa u zadnju kantu.
        unplaced.outOfRangeCount += 1;
        addOnce(unplaced.findingIds, finding.id);
        placed = true;
        continue;
      }

      const bucket = bucketOf(paragraph);
      if (!bucket) continue;
      bucket.locationCount += 1;
      bucket.counts[severity] += 1;
      addOnce(bucket.findingIds, finding.id);
      if (bucket.jumpParagraphIndex === null && (lastPreviewed === null || paragraph <= lastPreviewed)) {
        bucket.jumpParagraphIndex = paragraph;
      }
      placed = true;
    }

    if (!placed) {
      if (isFormatting) {
        addOnce(documentWide.findingIds, finding.id);
        documentWide.counts[severity] += 1;
      } else {
        addOnce(unplaced.findingIds, finding.id);
      }
    }
  }

  documentWide.formattingCount = documentWide.findingIds.length;

  for (const heading of input.headings ?? []) {
    if (!heading || !Number.isFinite(heading.index)) continue;
    const bucket = bucketOf(Math.floor(heading.index));
    if (bucket) bucket.headings.push(heading);
  }

  const peak = buckets.reduce((max, b) => Math.max(max, b.locationCount), 0);
  for (const b of buckets) {
    b.dominantSeverity = dominant(b.counts);
    b.heightRatio = peak > 0 ? b.locationCount / peak : 0;
    b.beyondPreview = lastPreviewed !== null && b.from > lastPreviewed;
    if (b.beyondPreview) b.jumpParagraphIndex = null;
  }

  const footnotes: DnaFootnoteMark[] = [...footnoteMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([footnoteId, entry]) => ({
      footnoteId,
      findingIds: entry.findingIds,
      dominantSeverity: dominant(entry.counts) ?? 'info',
    }));

  return {
    kind: 'available',
    totalParagraphs: total,
    buckets,
    documentWide,
    footnotes,
    unplaced,
    headingsAvailable: (input.headings ?? []).length > 0,
    previewTruncated: input.previewTruncated === true,
    lastPreviewedParagraph: lastPreviewed,
    provisional: input.provisional === true,
  };
}
