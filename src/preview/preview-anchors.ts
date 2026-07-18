/**
 * Sidrenje nalaza analize na odlomke za "Oznaceni pregled" (preview modal, slice 2).
 *
 * Cista, testabilna funkcija bez DOM-a i mreze. Iz rezultata analyzeDocx skuplja SAMO one
 * nalaze koji nose stvarnu lokaciju (indeks odlomka + tekstualni isjecak) i normalizira ih u
 * jedinstven oblik PreviewFlag s 1-based paragraphIndex koji odgovara analyze-docx paragraph.index
 * (i preview.paragraphs[].index). Dominantni Issue model (font, margine, prored, poravnanje,
 * opseg...) NEMA masinski citljivu lokaciju pa se NAMJERNO ne ukljucuje; taj sloj ide kao
 * globalna legenda u modalu, ne kao inline crvena oznaka.
 *
 * VAZNO o indeksima (tri konvencije koje se ovdje svode na 1-based):
 *   - typoLint / registerLint: paragraphIndex je 0-based (indeks u nizu paragraphs.map(p=>p.text)),
 *     pa se pribraja +1.
 *   - missing/uncited/incompleteReferences: `.p` je vec 1-based (author-year.ts: p=idx+1 / p=i+1).
 *   - legalCitationEngine.bibliographyUncited: `.paragraph` je vec 1-based (legal-citation.ts: r.p).
 *
 * PRIVATNOST: puni tekst dokumenta i ovi isjecci su LOKALNI i nikad ne idu na mrezu
 * (sanitizeAnalysisResult u src/report/report.ts izbacuje `preview` i redaktira "odlomak N: <tekst>").
 */
import {
  KIND_HOMOGLIF_CIRILICA,
  KIND_LABELS_HR as TYPO_LABELS,
} from '../tools/typo-lint';
import {
  KIND_DUGA_RECENICA,
  KIND_OD_STRANE,
  KIND_KOLOKVIJALIZAM,
  KIND_PRVO_LICE,
} from '../audits/register';

export type PreviewSeverity = 'error' | 'warning' | 'info';

/**
 * Oblikovanje jednog runa za "Vjeran prikaz" (faksimil). Aditivno uz `text` odlomka: renderer
 * rekonstruira vjeran tekst iz odlomka `text` (ground truth) i preko njega mapira ova svojstva.
 */
export interface PreviewRun {
  text: string;
  bold: boolean;
  italic: boolean;
  font: string | null;
  size: number | null;
}

/** Jedan odlomak dokumenta za render pregleda; index je 1-based (poravnat s paragraph.index). */
export interface PreviewParagraph {
  index: number;
  text: string;
  headingLevel: number | null;
  /** OOXML poravnanje (w:jc): 'both' | 'center' | 'right' | 'left' | ... Samo za faksimil. */
  align?: string | null;
  /** Run-oblikovanje (bold/italic/font/velicina). Samo za faksimil; MVP pregled cita `text`. */
  runs?: PreviewRun[];
  /** Iza ovog odlomka je prijelom stranice (eksplicitni w:br type=page ili lastRenderedPageBreak). */
  pageBreakAfter?: boolean;
  /** Oznake fusnota u tijelu (superscript broj) s znakovnim offsetom unutar `text`; faksimil. */
  markers?: PreviewFootnoteMark[];
}

/** Oznaka fusnote u tijelu: id (prikazani broj) na znakovnom offsetu unutar teksta odlomka. */
export interface PreviewFootnoteMark {
  id: number;
  offset: number;
}

/** Jedna fusnota u pregledu (zaseban koordinatni prostor od tijela). */
export interface PreviewFootnote {
  id: number;
  text: string;
  /** Run-oblikovanje fusnote (bold/italic/font); faksimil. Velicina se ne primjenjuje (CSS skalira). */
  runs?: PreviewRun[];
}

/** Margine i velicina stranice (cm) iz sectPr; za faksimil layout. */
export interface PreviewPage {
  margins: { top: number | null; right: number | null; bottom: number | null; left: number | null } | null;
  size: { w: number | null; h: number | null } | null;
}

/** Oblik top-level polja `preview` koje analyzeDocx vraca (slice 1; obogaceno za faksimil). */
export interface PreviewModel {
  paragraphs: PreviewParagraph[];
  truncated: boolean;
  /** Fusnote dokumenta (renderiraju se na dnu). */
  footnotes?: PreviewFootnote[];
  /** Dominantni font tijela (za baznu tipografiju stranice); faksimil. */
  baseFont?: string | null;
  /** Dominantna velicina tijela u tockama; faksimil. */
  baseSize?: number | null;
  /** Margine/velicina stranice iz sectPr; faksimil. */
  page?: PreviewPage | null;
}

/** Izvor nalaza (za grupiranje i boju u UI-ju). */
export type PreviewFlagSource =
  | 'typo'
  | 'register'
  | 'reference-missing'
  | 'reference-uncited'
  | 'reference-incomplete'
  | 'legal-uncited'
  | 'issue-anchor'
  | 'footnote-anchor';

/** Usidren nalaz spreman za inline isticanje u pregledu. */
export interface PreviewFlag {
  /** 1-based indeks odlomka (poravnat s PreviewParagraph.index). 0 kad je nalaz vezan uz fusnotu. */
  paragraphIndex: number;
  /** Ako je postavljeno, nalaz cilja FUSNOTU (zaseban koordinatni prostor), ne odlomak tijela. */
  footnoteId?: number;
  /** Tekstualni isjecak koji renderer trazi unutar odlomka radi preciznog isticanja; moze biti ''. */
  excerpt: string;
  severity: PreviewSeverity;
  /** Stabilan identifikator vrste nalaza (kind ili kategorija izvora). */
  kind: string;
  /** Ljudska oznaka na hrvatskom. */
  title: string;
  source: PreviewFlagSource;
}

const REGISTER_LABELS: Record<string, string> = {
  [KIND_DUGA_RECENICA]: 'Duga rečenica',
  [KIND_OD_STRANE]: 'Konstrukcija „od strane”',
  [KIND_KOLOKVIJALIZAM]: 'Kolokvijalizam',
  [KIND_PRVO_LICE]: 'Prvo lice',
};

const EXCERPT_MAX = 80;

/** Skrati isjecak na razumnu duljinu za trazenje podniza (dulji isjecci ne pomazu lociranju). */
function trimExcerpt(s: unknown): string {
  const t = String(s ?? '').trim();
  return t.length > EXCERPT_MAX ? t.slice(0, EXCERPT_MAX).trimEnd() : t;
}

/** 0 ili veci cijeli broj (indeksi odlomaka nikad nisu negativni). */
function isParagraphOrdinal(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * Skupi usidrene nalaze iz `result.details` u listu PreviewFlag (1-based paragraphIndex).
 * Prima labavo tipiziran `details` (analyzeDocx vraca `any`); tolerantan na polja koja fale.
 */
export function collectPreviewFlags(details: any): PreviewFlag[] {
  const flags: PreviewFlag[] = [];
  if (!details || typeof details !== 'object') return flags;

  // 1) Tipografija (typoLint): paragraphIndex 0-based -> 1-based
  for (const f of details.typoLint?.findings ?? []) {
    if (!isParagraphOrdinal(f?.paragraphIndex)) continue;
    flags.push({
      paragraphIndex: f.paragraphIndex + 1,
      excerpt: trimExcerpt(f.excerpt),
      severity: f.kind === KIND_HOMOGLIF_CIRILICA ? 'error' : 'warning',
      kind: String(f.kind ?? 'tipografija'),
      title: TYPO_LABELS[f.kind] ?? String(f.kind ?? 'Tipografska napomena'),
      source: 'typo',
    });
  }

  // 2) Registar i jasnoca (registerLint): 0-based -> 1-based; informativno (ne ulazi u ocjenu)
  for (const f of details.registerLint?.findings ?? []) {
    if (!isParagraphOrdinal(f?.paragraphIndex)) continue;
    flags.push({
      paragraphIndex: f.paragraphIndex + 1,
      excerpt: trimExcerpt(f.excerpt),
      severity: 'info',
      kind: String(f.kind ?? 'registar'),
      title: REGISTER_LABELS[f.kind] ?? String(f.kind ?? 'Registar i jasnoća'),
      source: 'register',
    });
  }

  // 3) Citatnice bez podudaranja u literaturi (.p vec 1-based); isjecak = doslovna citatnica (raw)
  for (const c of details.missingReferences ?? []) {
    if (!isParagraphOrdinal(c?.p)) continue;
    flags.push({
      paragraphIndex: c.p,
      excerpt: trimExcerpt(c.raw ?? `${c.author ?? ''} ${c.year ?? ''}`),
      severity: 'error',
      kind: 'citat-bez-literature',
      title: 'Citatnica nije pronađena u literaturi',
      source: 'reference-missing',
    });
  }

  // 4) Izvori iz literature bez citata u tekstu (.p 1-based, u popisu literature)
  for (const r of details.uncitedReferences ?? []) {
    if (!isParagraphOrdinal(r?.p)) continue;
    flags.push({
      paragraphIndex: r.p,
      excerpt: trimExcerpt(r.text ?? `${r.author ?? ''} ${r.year ?? ''}`),
      severity: 'warning',
      kind: 'izvor-bez-citata',
      title: 'Izvor iz literature nije citiran u tekstu',
      source: 'reference-uncited',
    });
  }

  // 5) Mogući nepotpuni bibliografski zapisi (.p 1-based)
  for (const r of details.incompleteReferences ?? []) {
    if (!isParagraphOrdinal(r?.p)) continue;
    flags.push({
      paragraphIndex: r.p,
      excerpt: trimExcerpt(r.text),
      severity: 'warning',
      kind: 'nepotpun-zapis',
      title: 'Mogući nepotpun bibliografski zapis',
      source: 'reference-incomplete',
    });
  }

  // 6) Pravni engine: jedinice literature bez punog navoda u fusnotama (.paragraph 1-based)
  for (const b of details.legalCitationEngine?.bibliographyUncited ?? []) {
    if (!isParagraphOrdinal(b?.paragraph)) continue;
    flags.push({
      paragraphIndex: b.paragraph,
      excerpt: trimExcerpt(b.text),
      severity: 'warning',
      kind: 'pravni-izvor-bez-fusnote',
      title: 'Jedinica literature nije citirana u fusnotama',
      source: 'legal-uncited',
    });
  }

  return flags;
}

// "odlomak N" ili "odlomak N: <tekst>"; tekst ide do sljedeceg ';' ili kraja segmenta.
const ISSUE_ANCHOR_RE = /odlomak\s+(\d+)(?:\s*:\s*([^;]*))?/gi;

function normSeverity(s: unknown): PreviewSeverity {
  return s === 'error' || s === 'warning' || s === 'info' ? s : 'warning';
}

/**
 * Usidri nalaze (Issue) koji vec nose redni broj odlomka u opisu ("odlomak N" ili
 * "odlomak N: <tekst>"): preskakanja naslova, numeriranje i oblikovanje naslova, rucno
 * oblikovani naslovi, dubina numeriranja, izravni citati bez lokatora, mrezni izvori bez
 * datuma pristupa, neispravne poveznice. Kategorija 'formatting' se NAMJERNO preskace:
 * font, margine, prored i razmaci su svojstva cijelog dokumenta i prikazuju se u globalnoj
 * legendi (renderPreviewSide), ne kao inline oznaka na jednom mjestu.
 */
export function collectIssueAnchors(issues: any[]): PreviewFlag[] {
  const flags: PreviewFlag[] = [];
  for (const it of issues ?? []) {
    if (!it || typeof it.detail !== 'string' || it.category === 'formatting') continue;
    ISSUE_ANCHOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ISSUE_ANCHOR_RE.exec(it.detail))) {
      const p = Number(m[1]);
      if (!Number.isInteger(p) || p < 1) continue;
      flags.push({
        paragraphIndex: p,
        excerpt: trimExcerpt(m[2] ?? ''),
        severity: normSeverity(it.severity),
        kind: String(it.category ?? 'nalaz'),
        title: String(it.title ?? 'Nalaz'),
        source: 'issue-anchor',
      });
    }
  }
  return flags;
}

// "bilj. N" (oznaka fusnote u opisu nalaza pravnog enginea i oblikovanja oznaka fusnota).
const FOOTNOTE_ANCHOR_RE = /bilj\.\s*(\d+)/gi;

/**
 * Usidri nalaze vezane uz FUSNOTE (zaseban koordinatni prostor). Legal Citation Engine i
 * provjera oznaka fusnota utiskuju "bilj. N" u opis (op.cit/Ibid/potpunost prvog navoda,
 * skracenice id., propisi, sudska praksa, ukosena oznaka...). Uzimamo samo broj fusnote (poruka
 * je dijagnostika, ne tekst fusnote, pa se ne moze locirati kao podniz); nalaz cilja cijelu
 * fusnotu. Naslov Issue-a nosi vrstu problema.
 */
export function collectFootnoteAnchors(issues: any[]): PreviewFlag[] {
  const flags: PreviewFlag[] = [];
  for (const it of issues ?? []) {
    if (!it || typeof it.detail !== 'string') continue;
    FOOTNOTE_ANCHOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const seenInIssue = new Set<number>();
    while ((m = FOOTNOTE_ANCHOR_RE.exec(it.detail))) {
      const id = Number(m[1]);
      if (!Number.isInteger(id) || id < 1 || seenInIssue.has(id)) continue;
      seenInIssue.add(id);
      flags.push({
        paragraphIndex: 0,
        footnoteId: id,
        excerpt: '',
        severity: normSeverity(it.severity),
        kind: String(it.category ?? 'fusnota'),
        title: String(it.title ?? 'Nalaz u fusnoti'),
        source: 'footnote-anchor',
      });
    }
  }
  return flags;
}

/**
 * Kljuc za deduplikaciju: ista lokacija (odlomak ILI fusnota) + isti isjecak (prefiks 40 znakova)
 * je isti nalaz. Bez isjecka razlucujemo naslovom, da dva razlicita nalaza bez isjecka na istoj
 * lokaciji (npr. citat bez lokatora i neispravna poveznica) ostanu odvojena.
 */
function flagKey(f: PreviewFlag): string {
  const loc = f.footnoteId != null ? `f${f.footnoteId}` : `p${f.paragraphIndex}`;
  const ex = f.excerpt.slice(0, 40).toLowerCase().replace(/\s+/g, ' ').trim();
  return ex ? `${loc}|ex:${ex}` : `${loc}|t:${f.title}`;
}

/**
 * Skupi SVE usidrene nalaze za pregled: strukturirani (typo/register/reference) plus nalazi
 * usidreni iz opisa Issue-a (odlomci) i fusnota, uz deduplikaciju. Strukturirani se dodaju prvi
 * pa imaju prednost (npr. nepotpuna referenca ostaje iz reference-incomplete, ne iz Issue opisa).
 */
export function collectAllPreviewFlags(result: any): PreviewFlag[] {
  const merged = [
    ...collectPreviewFlags(result?.details),
    ...collectIssueAnchors(result?.issues),
    ...collectFootnoteAnchors(result?.issues),
  ];
  const seen = new Set<string>();
  const out: PreviewFlag[] = [];
  for (const f of merged) {
    const k = flagKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}
