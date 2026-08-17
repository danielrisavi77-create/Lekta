/**
 * Triage model nalaza: svakom nalazu pridruzuje RAZINU POPRAVLJIVOSTI (auto/assisted/manual),
 * korekcijsku rutinu (fixId) i lokacije u dokumentu (za skok u pregledu). Temelj petlje
 * NALAZ -> POPRAVAK -> PONOVNA PROVJERA (LEKTA_UPGRADE_BRIEF Faza 1).
 *
 * Cista, DOM-free funkcija. Cita gotov rezultat analize (checks/issues/details) i vraca
 * projekciju koja se u analyzeDocx sprema u `details.triage`. NE dira score/checks/issues, pa je
 * GOLDEN-SAFE (tests/helpers/golden-normalize.ts snapshota samo score/profile/stats/checks/issues).
 *
 * Granica BESPLATNO/PLACENO: triage je BESPLATAN (sto i gdje je greska + brojaci auto/assisted/
 * manual). Sama PRIMJENA popravka je placena (server-side); auto/assisted brojaci su ujedno teaser.
 *
 * OPSEG v1: nalazi se izvode iz bodovanih/informativnih provjera (result.checks -> issue), tj. iz
 * kanonske liste "nalaza". Savjetodavni linteri (typoLint/registerLint/submissionLint) imaju svoj
 * odvojeni prikaz i NE ulaze u triage brojace da broj "N nalaza" ostane smislen.
 */
import type { Check, Issue } from '../scoring/checks';
import type { FixerId } from '../repair/apply-fixers';
import { classifyFixability, classifyFixabilityById, type Fixability } from './check-fixer-map';
import { stableCheckId } from '../scoring/check-id-registry';
import {
  collectPreviewFlags,
  collectIssueAnchors,
  collectFootnoteAnchors,
  type PreviewFlag,
  type PreviewFlagSource,
} from '../preview/preview-anchors';

export type { Fixability };

/** Lokacija nalaza u dokumentu; anchorId je sidro za skok u pregledu (Faza 2). */
export interface TriageLocation {
  /** 1-based indeks odlomka (poravnat s preview.paragraphs[].index); 0 kad je vezano uz fusnotu. */
  paragraphIndex: number;
  /** Ako je postavljeno, nalaz cilja fusnotu (zaseban koordinatni prostor). */
  footnoteId?: number;
  /** Stabilno sidro: 'loc-p{N}' za odlomak, 'loc-fn{N}' za fusnotu. */
  anchorId: string;
  /** 8-12 rijeci konteksta oko problema (moze biti prazno za dimenzije bez lokacije). */
  excerpt: string;
}

/** Jedan nalaz s razinom popravljivosti i lokacijama. */
export interface TriageFinding {
  /** Stabilan id nalaza (izveden iz kategorije + naslova). */
  id: string;
  category: string;
  title: string;
  severity: 'error' | 'warning' | 'info';
  fixability: Fixability;
  /** Korekcijska rutina (samo kad postoji zivi auto fixer). */
  fixId?: FixerId;
  /** Kljuc za grupne akcije (npr. 'caption.table', 'page.numbering'); assisted nalazi. */
  groupKey?: string;
  locations: TriageLocation[];
}

export interface TriageCounts {
  auto: number;
  assisted: number;
  manual: number;
  total: number;
}

export interface TriageModel {
  findings: TriageFinding[];
  counts: TriageCounts;
}

/** Stabilni checkId -> izvor strukturiranih preview flagova (za precizne lokacije). */
const REF_SOURCE_BY_CHECK_ID: Record<string, PreviewFlagSource> = {
  'citation.author-year.missing-reference': 'reference-missing',
  'reference.uncited': 'reference-uncited',
  'reference.completeness': 'reference-incomplete',
};

const DIACRITICS: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'd', Č: 'c', Ć: 'c', Š: 's', Ž: 'z', Đ: 'd' };
function slug(s: string): string {
  return (s || '')
    .replace(/[čćšžđČĆŠŽĐ]/g, (m) => DIACRITICS[m] || m)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function anchorIdFor(flag: PreviewFlag): string {
  return flag.footnoteId != null ? `loc-fn${flag.footnoteId}` : `loc-p${flag.paragraphIndex}`;
}

function flagToLocation(flag: PreviewFlag): TriageLocation {
  return {
    paragraphIndex: flag.footnoteId != null ? 0 : flag.paragraphIndex,
    ...(flag.footnoteId != null ? { footnoteId: flag.footnoteId } : {}),
    anchorId: anchorIdFor(flag),
    excerpt: flag.excerpt || '',
  };
}

function severityOf(check: Check): 'error' | 'warning' | 'info' {
  const s = check.issue?.severity;
  if (s === 'error' || s === 'warning' || s === 'info') return s;
  return check.status === 'fail' ? 'error' : check.status === 'pass' ? 'info' : 'warning';
}

/** Je li provjera "nalaz" (problem koji vrijedi prikazati)? Bodovani ne-pass ILI (info) s issueom. */
function isFinding(check: Check): boolean {
  if (check.scored && check.status !== 'pass') return true;
  return !!check.issue; // informativne (max=0) ulaze samo kad su proizvele issue
}

/** Skupi lokacije za jedan nalaz: iz vlastitog issue opisa (odlomak/bilj.) + strukturirani ref flagovi. */
function locationsFor(check: Check, detailFlags: PreviewFlag[]): TriageLocation[] {
  const flags: PreviewFlag[] = [];
  if (check.issue) {
    flags.push(...collectIssueAnchors([check.issue]));
    flags.push(...collectFootnoteAnchors([check.issue]));
  }
  const refSource = REF_SOURCE_BY_CHECK_ID[check.id ?? stableCheckId(check.title) ?? ''];
  if (refSource) flags.push(...detailFlags.filter((f) => f.source === refSource));

  const seen = new Set<string>();
  const out: TriageLocation[] = [];
  for (const f of flags) {
    const loc = flagToLocation(f);
    const key = `${loc.anchorId}|${loc.excerpt.slice(0, 40).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}

/** Minimalni oblik rezultata koji triage cita (podskup analyzeDocx returna). */
export interface TriageInput {
  checks?: Check[];
  issues?: Issue[];
  details?: any;
}

/**
 * Izgradi triage model iz rezultata analize. Svaki nalaz dobiva `fixability` (nijedan ne ostaje
 * bez nje), fixId za auto, groupKey za assisted, i lokacije gdje ih ima (inace [] -> UI bez skoka).
 */
export function buildTriage(result: TriageInput): TriageModel {
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  const detailFlags = collectPreviewFlags(result?.details);
  const findings: TriageFinding[] = [];
  const seenIds = new Set<string>();

  for (const check of checks) {
    if (!isFinding(check)) continue;
    // Klasifikacija ide preko STABILNOG identiteta; naslov je fallback samo za provjere bez
    // registriranog `id` (rucni fixturi). `finding.id` ispod ostaje slug naslova jer je to
    // sidro u DOM-u koje se izvodi iznova na obje strane, pa preimenovanje ne moze razdvojiti
    // nalaz od popravka (za razliku od klasifikacije, koja bi tiho pala na 'manual').
    const { fixability, fixId, groupKey } = check.id ? classifyFixabilityById(check.id) : classifyFixability(check.title);
    let id = `chk:${slug(check.category)}:${slug(check.title)}`;
    while (seenIds.has(id)) id += '-2';
    seenIds.add(id);
    findings.push({
      id,
      category: check.category,
      title: check.title,
      severity: severityOf(check),
      fixability,
      ...(fixId ? { fixId } : {}),
      ...(groupKey ? { groupKey } : {}),
      locations: locationsFor(check, detailFlags),
    });
  }

  const counts: TriageCounts = { auto: 0, assisted: 0, manual: 0, total: findings.length };
  for (const f of findings) counts[f.fixability]++;
  return { findings, counts };
}
