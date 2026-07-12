/**
 * Tier filter za Provjeru prije predaje: JEDINO mjesto koje odlucuje koje
 * nalaze student vidi. Import ISKLJUCIVO iz Edge funkcije preflight-result i
 * iz vitest testova; NIKAD iz UI modula (ne smije u browser bundle, jer bi
 * time i popis skrivenih kodova postao javan). Presedan importa iz src/:
 * integrity-check importa integrity-consent.ts.
 *
 * Semantika: EKSPLICITNA ALLOWLISTA (fail-closed). Kod koji nije naveden kao
 * STUDENT = skriven. Novi kod u pipelineu je defaultno skriven dok ga netko
 * svjesno ne klasificira; drift test (tests/preflight.test.ts) usporedjuje
 * uniju STUDENT + FORENSIC s codes.json fixtureom iz pipeline repoa pa novi
 * kod bez klasifikacije = crveni npm run check.
 *
 * Izomorfno: bez DOM-a, bez Deno API-ja (jedinicno testabilno u vitestu).
 */

export type PreflightAudience = 'student' | 'mentor';
export type PreflightDepth = 'teaser' | 'full';

export interface PreflightFinding {
  module: string;
  code: string;
  severity: string;       // "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  severity_hr: string;
  title: string;
  evidence: string[];
  recommendation: string;
  location: string;
  positive: boolean;
}

export interface PreflightModule {
  module_id: string;
  module_name: string;
  skipped: boolean;
  skip_reason: string;
  findings: PreflightFinding[];
}

export interface PreflightReport {
  tool?: string;
  pipeline_version?: string;
  generated_at?: string;
  doc_summary: Record<string, string>;
  severity_counts: Record<string, number>;
  modules: PreflightModule[];
  /** Teaser rez: koliko je ne-pozitivnih nalaza sakriveno iza otkljucavanja. */
  teaser_hidden_findings?: number;
}

/** Studentu vidljivi kodovi (compliance skup; odluka vlasnika 2026-07-12). */
export const STUDENT_VISIBLE_CODES: ReadonlySet<string> = new Set([
  // m1_metadata: metapodaci kao "ocisti prije predaje"
  'META_IDENTITY', 'OK_META',
  // m1_content: formalni nedostaci (nastaju i neduznim kopiranjem iz PDF-a)
  'LANG_FOREIGN_DOMINANT', 'LANG_MIXED', 'HIDDEN_VANISH', 'HIDDEN_WHITE',
  'HIDDEN_TINY', 'EVASION_ZERO_WIDTH', 'EVASION_HOMOGLYPH',
  'CHAR_SOFT_HYPHEN', 'CHAR_CYRILLIC', 'OK_CONTENT',
  // m1_styles: ostaci uredjivanja
  'TRACKED_CHANGES', 'COMMENTS_PRESENT', 'FONT_POLLUTION', 'STYLE_POLLUTION',
  'OK_STYLES',
  // m2_citations: integritet citata + radne liste za samoprovjeru
  'BIBLIO_MISSING', 'STYLE_AUTHOR_YEAR', 'CITE_PHANTOM', 'CITE_ORPHAN',
  'OK_CITATIONS', 'CITE_STATS', 'QUOTES_QUEUE', 'NUMERIC_QUEUE',
  // m2_references: verifikacija postojanja
  'REF_NO_ENTRIES', 'REF_NOT_FOUND', 'REF_DOI_INVALID', 'REF_LIKELY',
  'REF_UNCHECKED', 'REF_SUMMARY', 'OK_REFERENCES',
]);

/**
 * Forenzicki (mentorski/B2B) kodovi: proces pisanja, ne compliance. Popis
 * sluzi drift testu (unija STUDENT + FORENSIC == svi kodovi pipelinea);
 * runtime skrivanje ide preko allowliste, ne preko ovog popisa.
 */
export const FORENSIC_CODES: ReadonlySet<string> = new Set([
  'META_TOTALTIME_ZERO', 'META_TOTALTIME_LOW', 'META_SINGLE_SESSION',
  'RSID_ABSENT', 'RSID_FEW_SESSIONS', 'RSID_LOW_SESSIONS',
  'RSID_SINGLE_PASTE', 'OK_RSID',
  'WEB_VERBATIM_HIT', 'WEB_QUERY_PLAN', 'OK_WEB',
]);

/** Moduli koji se studentu uklanjaju U CIJELOSTI (ni prazna ljuska): sama
 *  prisutnost modula odaje sto se mjeri. */
export const STUDENT_HIDDEN_MODULES: ReadonlySet<string> = new Set([
  'm1_rsid', 'm3_websim',
]);

/** doc_summary ALLOWLISTA (nikad blocklista): "Uređivanje (min)" (TotalTime)
 *  namjerno NIJE ovdje; to je isti signal kao META_TOTALTIME_*. */
export const STUDENT_DOC_SUMMARY_KEYS: readonly string[] = [
  'Datoteka', 'Autor (metapodaci)', 'Kreirano', 'Izmijenjeno', 'Aplikacija',
  'Stranice', 'Riječi', 'Odlomaka',
];

/** Broj ne-pozitivnih nalaza vidljivih u teaser rezu. */
export const PREFLIGHT_TEASER_SAMPLE = 2;

const SEVERITY_NAMES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

function recountSeverities(modules: PreflightModule[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of SEVERITY_NAMES) counts[name] = 0;
  for (const mod of modules) {
    for (const f of mod.findings) {
      if (!f.positive && f.severity in counts) counts[f.severity] += 1;
    }
  }
  return counts;
}

/** Obrana u dubinu: TotalTime redak ne smije procuriti ni kroz evidence
 *  (motor ga vise ne emitira u META_IDENTITY, ali filter ne vjeruje motoru). */
function scrubIdentityEvidence(f: PreflightFinding): PreflightFinding {
  if (f.code !== 'META_IDENTITY') return f;
  return {
    ...f,
    evidence: f.evidence.filter((row) =>
      !/uređivanje|uredivanje|totaltime/i.test(row)),
  };
}

/** Anti-inference padding kad filtriranje isprazni m1_metadata. Praznina bi
 *  studentu signalizirala da postoji skriveni (forenzicki) nalaz. Kljucno: ovaj
 *  nalaz mora biti BAJT-IDENTICAN motorovom OK_META (cist dokument), inace sam
 *  padding postaje tell (student koji usporedi cist i "ociscen" dokument
 *  razaznao bi da je nesto potisnuto). Vrijednosti tocno prate m1_metadata
 *  OK_META serijalizaciju (findings.py: SEVERITY_HR + Finding.to_dict). */
function metaCleanPadding(): PreflightFinding {
  return {
    module: 'm1_metadata', code: 'OK_META', severity: 'INFO',
    severity_hr: 'info', title: 'Metapodaci bez anomalija',
    evidence: ['Nema identiteta, nerealnih vremena ni jednosesijskih tragova.'],
    recommendation: '', location: '', positive: true,
  };
}

export function filterReportForTier(
  report: PreflightReport,
  audience: PreflightAudience,
  depth: PreflightDepth,
): PreflightReport {
  if (audience === 'mentor') {
    // Mentorska razina (buduci B2B): puni nalaz, bez rezanja.
    return JSON.parse(JSON.stringify(report)) as PreflightReport;
  }

  const modules: PreflightModule[] = [];
  for (const mod of report.modules) {
    if (STUDENT_HIDDEN_MODULES.has(mod.module_id)) continue;
    let findings = mod.findings
      .filter((f) => STUDENT_VISIBLE_CODES.has(f.code))
      .map(scrubIdentityEvidence);
    if (mod.module_id === 'm1_metadata' && findings.length === 0) {
      findings = [metaCleanPadding()];
    }
    modules.push({
      module_id: mod.module_id,
      module_name: mod.module_name,
      skipped: mod.skipped,
      skip_reason: mod.skipped ? mod.skip_reason : '',
      findings,
    });
  }

  const docSummary: Record<string, string> = {};
  for (const key of STUDENT_DOC_SUMMARY_KEYS) {
    if (report.doc_summary && key in report.doc_summary) {
      docSummary[key] = report.doc_summary[key];
    }
  }

  const filtered: PreflightReport = {
    pipeline_version: report.pipeline_version,
    generated_at: report.generated_at,
    doc_summary: docSummary,
    severity_counts: recountSeverities(modules),
    modules,
  };

  if (depth === 'teaser') return teaserCut(filtered);
  return filtered;
}

/** Teaser: brojaci + pozitivni nalazi u cijelosti + PREFLIGHT_TEASER_SAMPLE
 *  naslova bez dokaza; sve ostalo iza otkljucavanja. */
function teaserCut(report: PreflightReport): PreflightReport {
  let sampled = 0;
  let hidden = 0;
  const modules = report.modules.map((mod) => {
    const findings: PreflightFinding[] = [];
    for (const f of mod.findings) {
      if (f.positive) {
        findings.push(f);
        continue;
      }
      if (sampled < PREFLIGHT_TEASER_SAMPLE) {
        sampled += 1;
        findings.push({ ...f, evidence: [], recommendation: '', location: '' });
      } else {
        hidden += 1;
      }
    }
    return { ...mod, findings };
  });
  return { ...report, modules, teaser_hidden_findings: hidden };
}
