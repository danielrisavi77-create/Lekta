/**
 * Savjetodavna provjera BROJCANE DOSLJEDNOSTI unutar samog rada: ista mjera/velicina (npr. "13
 * okvira" i "16 okvira", ili "stup visine 2 m" i "isti stup visine 2,5 m") s razlicitim
 * vrijednostima na razlicitim mjestima u tekstu. Domena rada (celik/elektro/strojarstvo/it) se
 * detektira iz sadrzaja (src/analysis/domains.ts), s generickim fallbackom kad se ne prepozna
 * specifican inzenjerski domen. Cist, bez DOM-a, bez mreze, testabilan, kao submission-lint.ts.
 *
 * Rezultat ide u `details.numericConsistency`; golden-normalize ga NE snapshota pa golden ostaje
 * netaknut (vidi submission-lint.ts:4 - isti mehanizam).
 *
 * POSTENO: svaki nalaz je KANDIDAT za rucnu provjeru, ne presuda - razlika moze biti vec
 * obrazlozena u tekstu (npr. "razlika dolazi od kasnije izmjene projekta"). Ne ulazi u ocjenu.
 *
 * Poznata ogranicenja (namjerno neispravljena u v1, isto kao u vanjskom Katedra izvorniku):
 *  - jednoslovna jedinica 's' (sekunde) moze kolidirati s hrvatskim prijedlogom "s"/"sa" odmah
 *    iza broja (npr. "5 s time povezanih pogresaka") - takvi nalazi su niske pouzdanosti.
 *  - recenicni splitter je lagana heuristika (kao i drugi lint moduli u repou), ne pravi NLP.
 */
import { DOMAINS, NUMBER_UNIT_RE, detectDomain, genericFallbackKeywords, type DomainId, type DomainScore } from '../analysis/domains';

export interface NumericConsistencyParagraph {
  index: number;
  text: string;
}

export interface NumericConsistencyInput {
  paragraphs: NumericConsistencyParagraph[];
}

export interface NumericOccurrence {
  paragraphIndex: number;
  value: string;
  excerpt: string;
}

export interface NumericConflictCandidate {
  id: string;
  keyword: string;
  unit: string;
  values: string[];
  occurrences: NumericOccurrence[];
}

export interface NumericConsistencyResult {
  version: 1;
  domain: DomainId;
  domainLabel: string;
  domainScores: DomainScore[];
  genericKeywordsUsed: string[];
  totalMatches: number;
  conflicts: NumericConflictCandidate[];
  summary: { total: number; text: string };
}

const EXCERPT_MAX = 120;
function snip(s: string, n = EXCERPT_MAX): string {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n).trimEnd() : t;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseHrNumber(value: string): number {
  return parseFloat(value.replace(',', '.'));
}

/** Grubo cijepanje na recenice bez lookbehind (kao src/audits/register.ts): namjerno bez zastite
 * kratica jer je krivo prerano-prekinuta "recenica" ovdje bezopasna (najgore izgubi par, ne stvori
 * lazni sukob), dok bi rucno pisana zastita kratica dodala rizik bez stvarne koristi ovdje. */
function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) || []).map((s) => s.trim()).filter(Boolean);
}

interface RawMatch {
  keyword: string;
  unit: string;
  value: string;
  numeric: number;
  paragraphIndex: number;
  excerpt: string;
}

/** Pokrece detekciju brojcanih sukoba; nalazi sortirani po indeksu prvog odlomka. */
export function analyzeNumericConsistency(input: NumericConsistencyInput): NumericConsistencyResult {
  const paragraphs = input.paragraphs ?? [];
  const fullText = paragraphs.map((p) => p.text || '').join('\n');
  const { domain, label, scores } = detectDomain(fullText);
  const domainDef = DOMAINS.find((d) => d.id === domain) ?? null;
  const genericKeywordsUsed = domain === 'generic' ? genericFallbackKeywords(fullText) : [];
  const activeKeywords = domain === 'generic' ? genericKeywordsUsed : (domainDef?.keywords ?? []);

  const raw: RawMatch[] = [];
  if (activeKeywords.length) {
    for (const p of paragraphs) {
      for (const sentence of splitSentences(p.text || '')) {
        const norm = sentence.toLocaleLowerCase('hr');
        const present = activeKeywords.filter((kw) => norm.includes(kw.toLocaleLowerCase('hr')));
        if (!present.length) continue;

        // unit-claims: broj+jedinica bilo gdje u recenici koja spominje domenski pojam.
        NUMBER_UNIT_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = NUMBER_UNIT_RE.exec(sentence))) {
          for (const kw of present) {
            raw.push({ keyword: kw, unit: m[2], value: m[1], numeric: parseHrNumber(m[1]), paragraphIndex: p.index, excerpt: snip(sentence) });
          }
        }

        // count-claims: gola kolicina neposredno ispred korijena kljucne rijeci (npr. "13 okvira"),
        // sto broj+jedinica regex ne hvata jer "okvira" nije jedinica. Sintetska jedinica 'kom.'.
        for (const kw of present) {
          const countRe = new RegExp(`(\\d+(?:,\\d+)?)\\s+${escapeRegExp(kw)}[\\p{L}]*`, 'giu');
          let cm: RegExpExecArray | null;
          while ((cm = countRe.exec(sentence))) {
            raw.push({ keyword: kw, unit: 'kom.', value: cm[1], numeric: parseHrNumber(cm[1]), paragraphIndex: p.index, excerpt: snip(cm[0]) });
          }
        }
      }
    }
  }

  const buckets = new Map<string, { keyword: string; unit: string; occs: RawMatch[] }>();
  for (const r of raw) {
    const key = `${r.keyword}|${r.unit}`;
    let b = buckets.get(key);
    if (!b) {
      b = { keyword: r.keyword, unit: r.unit, occs: [] };
      buckets.set(key, b);
    }
    b.occs.push(r);
  }

  const conflicts: NumericConflictCandidate[] = [];
  for (const { keyword, unit, occs } of buckets.values()) {
    // Dedupe po BROJCANOJ vrijednosti, ne po sirovom stringu: "2" i "2,0" nisu razlicita vrijednost,
    // samo drukciji zapis istog broja (svjesna razlika od Katedrinog izvornika koji dedupe-a sirovi
    // string; prikaz i dalje cuva prvi vidjeni zapis svake brojcane vrijednosti).
    const byNumeric = new Map<number, string>();
    for (const o of occs) if (!byNumeric.has(o.numeric)) byNumeric.set(o.numeric, o.value);
    if (byNumeric.size < 2) continue;
    conflicts.push({
      id: `${keyword}|${unit}`,
      keyword,
      unit,
      values: [...byNumeric.values()],
      occurrences: occs.map((o) => ({ paragraphIndex: o.paragraphIndex, value: o.value, excerpt: o.excerpt })),
    });
  }
  conflicts.sort((a, b) => (a.occurrences[0]?.paragraphIndex ?? 0) - (b.occurrences[0]?.paragraphIndex ?? 0));

  return {
    version: 1,
    domain,
    domainLabel: label,
    domainScores: scores,
    genericKeywordsUsed,
    totalMatches: raw.length,
    conflicts,
    summary: {
      total: conflicts.length,
      text: conflicts.length
        ? `${conflicts.length} kandidata za provjeru brojčane dosljednosti (domena: ${label})`
        : 'Nisu pronađeni kandidati za brojčanu nedosljednost',
    },
  };
}

/** Sazetak: ukupan broj kandidata i raspodjela po jedinici. */
export function numericConsistencySummary(conflicts: NumericConflictCandidate[]): { total: number; byUnit: Record<string, number> } {
  const byUnit: Record<string, number> = {};
  for (const c of conflicts) byUnit[c.unit] = (byUnit[c.unit] || 0) + 1;
  return { total: conflicts.length, byUnit };
}
