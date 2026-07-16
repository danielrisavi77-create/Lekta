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
  KIND_DVOSTRUKI_RAZMAK,
  KIND_RAZMAK_PRIJE_INTERPUNKCIJE,
  KIND_EM_EN_CRTICA,
  KIND_NAVODNICI_NEDOSLJEDNI,
  KIND_HOMOGLIF_CIRILICA,
  KIND_DECIMALNI_SEPARATOR,
  KIND_VISESTRUKE_TOCKE,
  KIND_RAZMAK_UZ_ZAGRADU,
} from '../tools/typo-lint';
import {
  KIND_DUGA_RECENICA,
  KIND_OD_STRANE,
  KIND_KOLOKVIJALIZAM,
  KIND_PRVO_LICE,
} from '../audits/register';

export type PreviewSeverity = 'error' | 'warning' | 'info';

/** Jedan odlomak dokumenta za render pregleda; index je 1-based (poravnat s paragraph.index). */
export interface PreviewParagraph {
  index: number;
  text: string;
  headingLevel: number | null;
}

/** Oblik top-level polja `preview` koje analyzeDocx vraca (slice 1). */
export interface PreviewModel {
  paragraphs: PreviewParagraph[];
  truncated: boolean;
}

/** Izvor nalaza (za grupiranje i boju u UI-ju). */
export type PreviewFlagSource =
  | 'typo'
  | 'register'
  | 'reference-missing'
  | 'reference-uncited'
  | 'reference-incomplete'
  | 'legal-uncited';

/** Usidren nalaz spreman za inline isticanje u pregledu. */
export interface PreviewFlag {
  /** 1-based indeks odlomka (poravnat s PreviewParagraph.index). */
  paragraphIndex: number;
  /** Tekstualni isjecak koji renderer trazi unutar odlomka radi preciznog isticanja; moze biti ''. */
  excerpt: string;
  severity: PreviewSeverity;
  /** Stabilan identifikator vrste nalaza (kind ili kategorija izvora). */
  kind: string;
  /** Ljudska oznaka na hrvatskom. */
  title: string;
  source: PreviewFlagSource;
}

const TYPO_LABELS: Record<string, string> = {
  [KIND_DVOSTRUKI_RAZMAK]: 'Dvostruki razmak',
  [KIND_RAZMAK_PRIJE_INTERPUNKCIJE]: 'Razmak prije interpunkcije',
  [KIND_EM_EN_CRTICA]: 'Crtica umjesto spojnice ili zareza',
  [KIND_NAVODNICI_NEDOSLJEDNI]: 'Nedosljedni navodnici',
  [KIND_HOMOGLIF_CIRILICA]: 'Ćirilični homoglif u latiničnoj riječi',
  [KIND_DECIMALNI_SEPARATOR]: 'Nedosljedan decimalni separator',
  [KIND_VISESTRUKE_TOCKE]: 'Višestruke točke',
  [KIND_RAZMAK_UZ_ZAGRADU]: 'Razmak uz otvorenu zagradu',
};

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
