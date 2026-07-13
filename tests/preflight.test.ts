/**
 * Provjera prije predaje: tier filter (dual-use granica), privola i drift
 * zastita prema pipeline registru kodova.
 *
 * Tier filter je server-side sigurnosna granica (Edge preflight-result), pa
 * se ovdje dokazuje fail-closed ponasanje: nepoznat kod skriven, forenzicki
 * moduli uklonjeni u cijelosti, brojaci rekomputirani, doc_summary allowlista,
 * anti-inference padding. Drift test: unija STUDENT + FORENSIC mora tocno
 * odgovarati codes.json fixtureu generiranom iz lekta-pipeline repoa
 * (python -m lekta_pipeline.codes > tests/fixtures/preflight/codes.json).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildPreflightConsent,
  isValidPreflightConsent,
  PREFLIGHT_RESULT_RETENTION_DAYS,
  preflightConsentText,
} from '../src/preflight/preflight-consent';
import {
  filterReportForTier,
  FORENSIC_CODES,
  PREFLIGHT_TEASER_SAMPLE,
  STUDENT_DOC_SUMMARY_KEYS,
  STUDENT_HIDDEN_MODULES,
  STUDENT_VISIBLE_CODES,
  type PreflightFinding,
  type PreflightReport,
} from '../src/preflight/tier-filter';

const codesFixture = JSON.parse(readFileSync(
  'tests/fixtures/preflight/codes.json', 'utf-8',
)) as { pipeline_version: string; codes: Record<string, string[]> };

function finding(over: Partial<PreflightFinding>): PreflightFinding {
  return {
    module: 'm1_metadata', code: 'META_IDENTITY', severity: 'MEDIUM',
    severity_hr: 'srednje', title: 'Naslov', evidence: ['redak'],
    recommendation: 'preporuka', location: 'loc', positive: false,
    ...over,
  };
}

function report(modules: PreflightReport['modules']): PreflightReport {
  return {
    pipeline_version: '0.1.0',
    generated_at: '2026-07-12T12:00:00',
    doc_summary: {
      'Datoteka': 'rad.docx', 'Autor (metapodaci)': 'Netko',
      'Uređivanje (min)': '3', 'Riječi': '9000', 'Odlomaka': '200',
    },
    severity_counts: { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 99, CRITICAL: 0 },
    modules,
  };
}

// ---------------------------------------------------------------------- //
describe('drift: registar kodova pipelinea vs tier klasifikacija', () => {
  const allPipelineCodes = new Set(Object.values(codesFixture.codes).flat());

  it('svaki kod pipelinea je klasificiran (STUDENT ili FORENSIC)', () => {
    const classified = new Set([...STUDENT_VISIBLE_CODES, ...FORENSIC_CODES]);
    const unclassified = [...allPipelineCodes].filter((c) => !classified.has(c));
    expect(unclassified, 'novi kod u pipelineu bez tier klasifikacije').toEqual([]);
  });

  it('klasifikacija nema mrtvih unosa ni preklapanja', () => {
    const dead = [...STUDENT_VISIBLE_CODES, ...FORENSIC_CODES]
      .filter((c) => !allPipelineCodes.has(c));
    expect(dead, 'kod klasificiran a ne postoji u pipelineu').toEqual([]);
    const overlap = [...STUDENT_VISIBLE_CODES].filter((c) => FORENSIC_CODES.has(c));
    expect(overlap).toEqual([]);
  });

  it('forenzicki moduli su u cijelosti skriveni, njihovi kodovi nisu STUDENT', () => {
    for (const mod of STUDENT_HIDDEN_MODULES) {
      for (const code of codesFixture.codes[mod] ?? []) {
        expect(STUDENT_VISIBLE_CODES.has(code), `${mod}/${code}`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------- //
describe('filterReportForTier: studentska razina', () => {
  it('nepoznat kod je skriven (fail-closed)', () => {
    const r = report([{
      module_id: 'm6_stilometrija', module_name: 'Buduci modul',
      skipped: false, skip_reason: '',
      findings: [finding({ module: 'm6', code: 'STYLE_SHIFT', severity: 'HIGH' })],
    }]);
    const out = filterReportForTier(r, 'student', 'full');
    expect(out.modules[0].findings).toEqual([]);
    expect(out.severity_counts.HIGH).toBe(0);
  });

  it('m1_rsid i m3_websim se uklanjaju u cijelosti, bez prazne ljuske', () => {
    const r = report([
      { module_id: 'm1_rsid', module_name: 'RSID', skipped: false, skip_reason: '',
        findings: [finding({ code: 'RSID_SINGLE_PASTE', severity: 'HIGH' })] },
      { module_id: 'm2_citations', module_name: 'Citati', skipped: false,
        skip_reason: '', findings: [finding({ code: 'OK_CITATIONS', positive: true })] },
    ]);
    const out = filterReportForTier(r, 'student', 'full');
    expect(out.modules.map((m) => m.module_id)).toEqual(['m2_citations']);
  });

  it('severity_counts se rekomputira nad filtriranim (skriveni HIGH ne curi)', () => {
    const r = report([
      { module_id: 'm1_metadata', module_name: 'Meta', skipped: false, skip_reason: '',
        findings: [
          finding({ code: 'META_TOTALTIME_LOW', severity: 'HIGH' }),
          finding({ code: 'META_IDENTITY', severity: 'MEDIUM' }),
        ] },
    ]);
    const out = filterReportForTier(r, 'student', 'full');
    expect(out.severity_counts).toEqual({ INFO: 0, LOW: 0, MEDIUM: 1, HIGH: 0, CRITICAL: 0 });
  });

  it('doc_summary ide kroz allowlistu: "Uređivanje (min)" ispada', () => {
    const out = filterReportForTier(report([]), 'student', 'full');
    expect(out.doc_summary['Uređivanje (min)']).toBeUndefined();
    expect(out.doc_summary['Datoteka']).toBe('rad.docx');
    for (const key of Object.keys(out.doc_summary)) {
      expect(STUDENT_DOC_SUMMARY_KEYS).toContain(key);
    }
  });

  it('TotalTime redak se skida iz META_IDENTITY evidence (obrana u dubinu)', () => {
    const r = report([{
      module_id: 'm1_metadata', module_name: 'Meta', skipped: false, skip_reason: '',
      findings: [finding({
        code: 'META_IDENTITY',
        evidence: ['Autor (creator): Netko', 'Ukupno uređivanje (min): 4', 'Stranice: 31'],
      })],
    }]);
    const out = filterReportForTier(r, 'student', 'full');
    expect(out.modules[0].findings[0].evidence).toEqual(
      ['Autor (creator): Netko', 'Stranice: 31']);
  });

  it('anti-inference: ispraznjeni m1_metadata dobiva OK_META padding nerazluciv od cistog', () => {
    const r = report([{
      module_id: 'm1_metadata', module_name: 'Meta', skipped: false, skip_reason: '',
      findings: [finding({ code: 'META_SINGLE_SESSION', severity: 'HIGH' })],
    }]);
    const out = filterReportForTier(r, 'student', 'full');
    expect(out.modules[0].findings).toHaveLength(1);
    // Padding MORA biti bajt-identican motorovom OK_META (findings.py:
    // Finding.to_dict + SEVERITY_HR). Da je razlucljiv (npr. drukciji kod ili
    // evidence), sam padding bi odao da je forenzicki nalaz potisnut, cime bi
    // se izgubila anti-inference svrha. Zato deep-equal na tocnu strukturu.
    expect(out.modules[0].findings[0]).toEqual({
      module: 'm1_metadata', code: 'OK_META', severity: 'INFO',
      severity_hr: 'info', title: 'Metapodaci bez anomalija',
      evidence: ['Nema identiteta, nerealnih vremena ni jednosesijskih tragova.'],
      recommendation: '', location: '', positive: true,
    });
  });

  it('mentor vidi sve netaknuto', () => {
    const r = report([{
      module_id: 'm1_rsid', module_name: 'RSID', skipped: false, skip_reason: '',
      findings: [finding({ code: 'RSID_SINGLE_PASTE', severity: 'HIGH' })],
    }]);
    const out = filterReportForTier(r, 'mentor', 'full');
    expect(out.modules[0].findings[0].code).toBe('RSID_SINGLE_PASTE');
    expect(out.doc_summary['Uređivanje (min)']).toBe('3');
  });

  it('serijalizirani studentski odgovor NIKAD ne sadrzi forenzicke tragove', () => {
    const r = report([
      { module_id: 'm1_metadata', module_name: 'Meta', skipped: false, skip_reason: '',
        findings: [
          finding({ code: 'META_TOTALTIME_LOW', severity: 'HIGH',
                    title: 'Vrijeme uređivanja nerealno nisko',
                    evidence: ['TotalTime: 3 min', '3179 riječi po minuti'] }),
          finding({ code: 'META_IDENTITY' }),
        ] },
      { module_id: 'm1_rsid', module_name: 'RSID analiza', skipped: false,
        skip_reason: '', findings: [finding({ code: 'RSID_SINGLE_PASTE',
          title: 'Gotovo sav tekst unesen u jednoj sesiji' })] },
    ]);
    const blob = JSON.stringify(filterReportForTier(r, 'student', 'full'));
    for (const trace of ['RSID', 'TotalTime', 'rsid', 'sesiji', 'riječi po minuti']) {
      expect(blob).not.toContain(trace);
    }
  });
});

// ---------------------------------------------------------------------- //
describe('filterReportForTier: teaser rez', () => {
  it('pozitivni cijeli, uzorak bez dokaza, ostatak izbrojen', () => {
    const r = report([{
      module_id: 'm2_citations', module_name: 'Citati', skipped: false, skip_reason: '',
      findings: [
        finding({ code: 'OK_CITATIONS', positive: true, evidence: ['sve ok'] }),
        finding({ code: 'CITE_PHANTOM', severity: 'HIGH', evidence: ['dokaz 1'] }),
        finding({ code: 'CITE_ORPHAN', severity: 'MEDIUM', evidence: ['dokaz 2'] }),
        finding({ code: 'CITE_STATS', severity: 'INFO', evidence: ['dokaz 3'] }),
      ],
    }]);
    const out = filterReportForTier(r, 'student', 'teaser');
    const [positive, ...rest] = out.modules[0].findings;
    expect(positive.positive).toBe(true);
    expect(positive.evidence).toEqual(['sve ok']);
    expect(rest).toHaveLength(PREFLIGHT_TEASER_SAMPLE);
    for (const f of rest) {
      expect(f.evidence).toEqual([]);
      expect(f.recommendation).toBe('');
    }
    expect(out.teaser_hidden_findings).toBe(1);
    // Brojaci ostaju puni (marketing semafora), dokazi su rezani.
    expect(out.severity_counts.HIGH).toBe(1);
  });
});

// ---------------------------------------------------------------------- //
describe('preflight privola', () => {
  it('build proizvodi valjanu privolu s tocnim tekstom i retencijom', () => {
    const c = buildPreflightConsent({ timestamp: '2026-07-12T12:00:00Z', termsVersion: 'v3' });
    expect(isValidPreflightConsent(c)).toBe(true);
    expect(c.resultRetentionDays).toBe(PREFLIGHT_RESULT_RETENTION_DAYS);
    expect(c.text).toBe(preflightConsentText());
    expect(c.text).toContain('briše');
    expect(c.text).toContain(`${PREFLIGHT_RESULT_RETENTION_DAYS} dana`);
    expect(c.text).toContain('Crossref');
    expect(c.text).toContain('SAD');
    expect(c.text).toContain('rad moj ili da imam pravo');
  });

  it('validator odbija krnje ili lazirane privole', () => {
    expect(isValidPreflightConsent(null)).toBe(false);
    expect(isValidPreflightConsent({})).toBe(false);
    const c = buildPreflightConsent({ timestamp: 't', termsVersion: 'v' });
    expect(isValidPreflightConsent({ ...c, sendsFullFile: false })).toBe(false);
    expect(isValidPreflightConsent({ ...c, ownWork: undefined })).toBe(false);
    expect(isValidPreflightConsent({ ...c, text: '' })).toBe(false);
  });

  it('tekst privole nema em ni en crtica (konvencija repoa)', () => {
    expect(preflightConsentText()).not.toMatch(/[–—]/);
  });
});
