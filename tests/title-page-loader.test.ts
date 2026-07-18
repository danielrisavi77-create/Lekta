/**
 * Testovi sloja predlozaka naslovnice (data/title-pages + src/title-pages).
 * Tri uloge: (1) faithfulness loadera, (2) ponasanje izbora predloska,
 * (3) VALIDACIJSKI GATE za pipeline output: svaki zapis u templates.json i
 * evidence/*.json mora proci strukturna i GDPR pravila (README sloja).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import manifest from '../data/manifest.json';
import rawTemplates from '../data/title-pages/templates.json';
import rawSourceRegistry from '../data/sources/source-registry.json';
import rawVerified from '../data/profiles/verified-profiles.json';

import {
  TITLE_PAGE_TEMPLATES,
  resolveTemplate,
  reuseForLevel,
  findTitlePageTemplate,
  selectTemplate,
  LEVEL_SLUGS,
  workTypeFromSlug,
} from '../src/title-pages/template-loader';
import type {
  TitlePageTemplate,
  TitlePageEvidenceFile,
} from '../src/title-pages/template-schema';
import { findUnit } from '../src/catalog/catalog-loader';
import { WORK_TYPE_LABELS } from '../src/config/config-loader';
import { buildTitlePage } from '../src/tools/title-page';

const EVIDENCE_DIR = join(__dirname, '..', 'data', 'title-pages', 'evidence');

const TITLE_ROLES = new Set([
  'university', 'faculty', 'study',
  'author', 'title', 'subtitle', 'worktype',
  'mentor', 'comentor', 'placeyear',
  // Generator od 2026-07 podrzava i JMBAG/kolegij; predlosci ih smiju modelirati kao elemente.
  // NIKAD u REDACT_WHITELIST (JMBAG je osobni podatak, kolegij moze identificirati rad).
  'studentId', 'course',
]);

/** Uloge cija se vrijednost smije naci u commitanom evidence tekstu (GDPR whitelist). */
const REDACT_WHITELIST = new Set(['university', 'faculty', 'study', 'worktype', 'placeyear']);

function loadEvidenceFiles(): Array<{ file: string; data: TitlePageEvidenceFile }> {
  if (!existsSync(EVIDENCE_DIR)) return [];
  return readdirSync(EVIDENCE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f,
      data: JSON.parse(readFileSync(join(EVIDENCE_DIR, f), 'utf8')) as TitlePageEvidenceFile,
    }));
}

describe('template-loader: faithfulness i manifest', () => {
  it('TITLE_PAGE_TEMPLATES = raw JSON', () => {
    expect(TITLE_PAGE_TEMPLATES).toEqual(rawTemplates);
  });
  it('broj zapisa se slaze s manifestom', () => {
    const row = manifest.find((m) => m.name === 'TITLE_PAGE_TEMPLATES');
    expect(row).toBeDefined();
    expect(TITLE_PAGE_TEMPLATES).toHaveLength(row!.entries);
  });
});

describe('template-loader: izbor predloska (fallback lanac)', () => {
  const t = (
    id: string,
    unitId: string,
    level: string | null,
    elements?: TitlePageTemplate['elements'],
  ): TitlePageTemplate => ({
    id,
    unitId,
    level: level as TitlePageTemplate['level'],
    name: id,
    provenance: { status: 'official' },
    status: 'draft',
    elements: elements || [
      { role: 'university', required: true, elementProvenance: 'official-rules', group: 0 },
    ],
  });
  const synthetic = [
    t('fpzg-doctoral', 'fpzg', 'doctoral'),
    t('fpzg', 'fpzg', null),
    t('pravo-graduate', 'pravo', 'graduate'),
    t('pravo-final', 'pravo', 'final'),
  ];

  it('tocna razina ima prednost pred level=null zapisom', () => {
    expect(resolveTemplate(synthetic, 'fpzg', 'doctoral')?.id).toBe('fpzg-doctoral');
  });
  it('bez tocne razine pada na level=null zapis jedinice', () => {
    expect(resolveTemplate(synthetic, 'fpzg', 'graduate')?.id).toBe('fpzg');
  });
  it('bez tocne razine i bez null zapisa preuzima fakultetski predlozak druge vrste rada', () => {
    // pravo ima graduate i final, ali ne seminar; REUSE_ORDER preferira graduate.
    expect(resolveTemplate(synthetic, 'pravo', 'seminar')?.id).toBe('pravo-graduate');
    expect(resolveTemplate(synthetic, 'pravo', 'doctoral')?.id).toBe('pravo-graduate');
  });
  it('nepoznata jedinica i dalje daje null (nema sto preuzeti)', () => {
    expect(resolveTemplate(synthetic, 'nepoznat', 'graduate')).toBeNull();
  });
  it('selectTemplate oznaci levelReused kad je predlozak preuzet iz druge vrste rada', () => {
    const exact = selectTemplate('pravo', 'graduate');
    expect(exact.levelReused).toBe(false);
    expect(exact.provenance).toBe('official');

    const reused = selectTemplate('pravo', 'seminar');
    expect(reused.levelReused).toBe(true);
    expect(reused.reusedFromLevel).toBe('graduate');
    expect(reused.provenance).toBe('official');
    expect(reused.template?.id).toBe('pravo-graduate');
  });
  it('reuseForLevel izbacuje sekundarne (dvojezicne) worktype retke, primarni ostaje', () => {
    const bilingual = t('feri', 'feri', 'final', [
      { role: 'faculty', required: true, elementProvenance: 'official-rules', group: 0 },
      { role: 'worktype', required: false, group: 1, fixedText: 'ZAVRŠNI RAD' },
      { role: 'worktype', required: false, group: 1, fixedText: 'BACHELOR THESIS' },
      { role: 'placeyear', required: false, group: 2 },
    ]);
    const reduced = reuseForLevel(bilingual);
    const worktypes = reduced.elements.filter((e) => e.role === 'worktype');
    expect(worktypes.length).toBe(1);
    expect(worktypes[0].fixedText).toBe('ZAVRŠNI RAD');
    // Ostale uloge netaknute (faculty, placeyear).
    expect(reduced.elements.map((e) => e.role)).toEqual(['faculty', 'worktype', 'placeyear']);
  });
  it('reuseForLevel bez viska worktype redaka vraca isti objekt (bez kloniranja)', () => {
    const single = t('x', 'x', 'graduate', [
      { role: 'worktype', required: false, group: 0, fixedText: 'DIPLOMSKI RAD' },
    ]);
    expect(reuseForLevel(single)).toBe(single);
  });
  it('selectTemplate mapira null predlozak na generic provenijenciju', () => {
    expect(selectTemplate(undefined, 'graduate')).toEqual({ template: null, provenance: 'generic' });
    expect(selectTemplate('', 'graduate')).toEqual({ template: null, provenance: 'generic' });
    expect(selectTemplate('sigurno-ne-postoji', 'graduate').provenance).toBe('generic');
  });
  it('findTitlePageTemplate radi nad zivim (trenutno praznim ili punim) registrom', () => {
    const hit = findTitlePageTemplate('sigurno-ne-postoji', 'graduate');
    expect(hit).toBeNull();
  });
});

describe('template-loader: slugovi razina', () => {
  it('LEVEL_SLUGS pokriva sve WorkType kljuceve', () => {
    expect(Object.keys(LEVEL_SLUGS).sort()).toEqual(Object.keys(WORK_TYPE_LABELS).sort());
  });
  it('workTypeFromSlug je inverz LEVEL_SLUGS', () => {
    for (const [wt, slug] of Object.entries(LEVEL_SLUGS)) {
      expect(workTypeFromSlug(slug)).toBe(wt);
    }
    expect(workTypeFromSlug('nepoznato')).toBeNull();
  });
});

describe('templates.json: validacijski gate za pipeline output', () => {
  const sourceIds = new Set((rawSourceRegistry as Array<{ id: string }>).map((s) => s.id));
  // evidencePid je valjan ako je (a) kuriran publicSource u profilu ILI (b) zabiljezen u
  // commitanoj evidence datoteci (PID-ovi otkriveni OAI discoveryjem zive tamo, ne u profilima).
  const knownPids = new Set<string>();
  for (const { data } of loadEvidenceFiles()) {
    for (const s of data.samples) knownPids.add(s.pid);
  }
  for (const p of rawVerified as Array<{
    fieldValidation?: { publicSources?: Array<{ pid: string }> };
  }>) {
    for (const s of p.fieldValidation?.publicSources || []) knownPids.add(s.pid);
  }
  const workTypeKeys = new Set(Object.keys(WORK_TYPE_LABELS));

  it('id i (unitId, level) selektori su jedinstveni', () => {
    const ids = TITLE_PAGE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const selectors = TITLE_PAGE_TEMPLATES.map((t) => `${t.unitId}::${t.level}`);
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it('svaki predlozak je strukturno valjan', () => {
    for (const t of TITLE_PAGE_TEMPLATES) {
      const ctx = `predlozak ${t.id}`;
      expect(findUnit(t.unitId), `${ctx}: unitId "${t.unitId}" ne postoji u katalogu`).toBeDefined();
      expect(
        t.level === null || workTypeKeys.has(t.level),
        `${ctx}: nepoznata razina "${t.level}"`,
      ).toBe(true);
      expect(['official', 'derived'], `${ctx}: provenance.status`).toContain(t.provenance.status);
      expect(['draft', 'verified'], `${ctx}: status`).toContain(t.status);
      expect(t.elements.length, `${ctx}: elements prazan`).toBeGreaterThan(0);

      let lastGroup = -1;
      for (const el of t.elements) {
        expect(TITLE_ROLES.has(el.role), `${ctx}: nepoznata uloga "${el.role}"`).toBe(true);
        expect(el.group, `${ctx}: group pada (${el.role})`).toBeGreaterThanOrEqual(lastGroup);
        lastGroup = el.group;
        if (el.required) {
          expect(
            el.elementProvenance === 'official-template' || el.elementProvenance === 'official-rules',
            `${ctx}: required=true bez official provenijencije (${el.role})`,
          ).toBe(true);
        }
        if (el.confidence !== undefined) {
          expect(el.confidence, `${ctx}: confidence izvan 0..1`).toBeGreaterThanOrEqual(0);
          expect(el.confidence).toBeLessThanOrEqual(1);
        }
      }

      if (t.provenance.status === 'official') {
        const ids = t.provenance.sourceIds || [];
        expect(ids.length, `${ctx}: official bez sourceIds`).toBeGreaterThan(0);
        for (const sid of ids) {
          expect(sourceIds.has(sid), `${ctx}: sourceId "${sid}" nije u source-registry`).toBe(true);
        }
      }
      for (const pid of t.provenance.evidencePids || []) {
        expect(knownPids.has(pid), `${ctx}: evidencePid "${pid}" nije u publicSources`).toBe(true);
      }
    }
  });
});

describe('buildTitlePage nad stvarnim predloscima s dva "study" elementa (fixedText+label bug)', () => {
  // Regresija: firstOfRole je davao korisnikovom unosu prednost i nad "locked" fixedText, a
  // drugi element uloge bez fixedTexta se tiho gubio (missing=[] iako obavezan). Ovih 9
  // predloska ima dva "study" elementa; provjera radi izravno na ucitanom templates.json,
  // ne na sintetickom fixtureu.
  const byId = (id: string): TitlePageTemplate => {
    const t = TITLE_PAGE_TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error(`predlozak "${id}" ne postoji u templates.json`);
    return t;
  };

  it('svih 9 predlozaka i dalje ima tocno dva "study" elementa (ne bi tiho izasli iz obuhvata)', () => {
    const ids = [
      'biotech-final', 'biotech-graduate', 'efzg-specialist',
      'fkit-final', 'fkit-graduate', 'fmtu-final', 'fmtu-graduate',
      'kbf-final', 'kbf-graduate',
    ];
    for (const id of ids) {
      expect(byId(id).elements.filter((e) => e.role === 'study'), id).toHaveLength(2);
    }
  });

  it('fkit-final/graduate i efzg-specialist: fiksna fraza ostaje, naziv studija se popunjava i vise ne nestaje', () => {
    for (const id of ['fkit-final', 'fkit-graduate', 'efzg-specialist']) {
      const t = byId(id);
      const withInput = buildTitlePage({ study: 'Kemijsko inženjerstvo' }, t);
      const studyLines = withInput.lines.filter((l) => l.role === 'study').map((l) => l.text);
      expect(studyLines, id).toHaveLength(2);
      expect(studyLines[0], id).toBe(t.elements.find((e) => e.role === 'study')!.fixedText);
      expect(studyLines[1], id).toBe('Kemijsko inženjerstvo');

      const withoutInput = buildTitlePage({}, t);
      expect(withoutInput.missing, id).toContain('Naziv studija');
    }
  });

  it('biotech-final: oba retka su fiksna, stray unos u #tp-study se ne prepisuje preko njih', () => {
    const t = byId('biotech-final');
    const [first, second] = t.elements.filter((e) => e.role === 'study');
    const m = buildTitlePage({ study: 'Nešto sasvim drugo' }, t);
    const studyLines = m.lines.filter((l) => l.role === 'study').map((l) => l.text);
    expect(studyLines).toEqual([first.fixedText, second.fixedText]);
    // Ostali obavezni podaci (author/title/placeyear...) nisu popunjeni u ovom testu i ocekivano
    // su missing; provjerava se samo da study rola tu nikad ne zavrsi (oba retka su fiksna).
    expect(m.missing).not.toContain('studij');
  });

  it('fmtu-final/graduate: naziv studija se popunjava, smjer studija je posteno missing (ne tiho izgubljen)', () => {
    for (const id of ['fmtu-final', 'fmtu-graduate']) {
      const t = byId(id);
      const m = buildTitlePage({ study: 'Pomorski menadžment' }, t);
      const studyLines = m.lines.filter((l) => l.role === 'study').map((l) => l.text);
      expect(studyLines, id).toEqual(['Pomorski menadžment']);
      expect(m.missing, id).toContain('Smjer studija');
    }
  });

  it('kbf-final/graduate: naziv studijskoga programa (obavezan) dobiva unos, institut (opcionalan) ostaje tih', () => {
    for (const id of ['kbf-final', 'kbf-graduate']) {
      const t = byId(id);
      const filled = buildTitlePage({ study: 'Teologija' }, t);
      expect(filled.lines.filter((l) => l.role === 'study').map((l) => l.text), id).toEqual(['Teologija']);
      // Ostali obavezni podaci (author/mentor/placeyear...) nisu popunjeni u ovom testu; provjerava
      // se samo da obavezni "Naziv studijskoga programa" ovdje NIJE missing (dobio je unos).
      expect(filled.missing, id).not.toContain('Naziv studijskoga programa');

      const empty = buildTitlePage({}, t);
      expect(empty.lines.filter((l) => l.role === 'study'), id).toHaveLength(0);
      expect(empty.missing, id).toContain('Naziv studijskoga programa');
    }
  });
});

describe('konzistencija s audit poljima (titlePageSequence)', () => {
  // Za unite koji imaju VERIFICIRANI official predlozak I titlePageSequence u rules:
  // redoslijed uloga predloska mora sadrzavati audit sekvencu kao podniz. Crveno znaci
  // da jedan od dva izvora treba ispraviti, svaki svojim tokom (predlozak ovdje,
  // audit polja kroz Option A). Podaci se NIKAD ne sinkroniziraju automatski.
  const LABEL_TO_ROLE: Array<[RegExp, string]> = [
    [/sveucilis/i, 'university'],
    [/fakultet|akademij|veleucilis/i, 'faculty'],
    [/vrsta|rad$/i, 'worktype'],
    [/mentor/i, 'mentor'],
    [/godina|mjesto/i, 'placeyear'],
  ];
  const roleForLabel = (label: string): string | null => {
    for (const [re, role] of LABEL_TO_ROLE) if (re.test(label)) return role;
    return null;
  };

  it('verificirani official predlosci ne proturjece audit sekvenci', () => {
    for (const t of TITLE_PAGE_TEMPLATES) {
      if (t.status !== 'verified' || t.provenance.status !== 'official') continue;
      const profiles = (rawVerified as Array<{
        unitId: string;
        rules?: { titlePageSequence?: Array<{ label: string }> };
      }>).filter((p) => p.unitId === t.unitId && p.rules?.titlePageSequence);
      for (const p of profiles) {
        const wanted = (p.rules!.titlePageSequence || [])
          .map((s) => roleForLabel(s.label))
          .filter((r): r is string => !!r);
        const order = t.elements.map((e) => e.role as string);
        let cursor = 0;
        for (const role of wanted) {
          const found = order.indexOf(role, cursor);
          expect(
            found,
            `predlozak ${t.id}: audit sekvenca trazi "${role}" nakon pozicije ${cursor}, redoslijed je [${order.join(', ')}]`,
          ).toBeGreaterThanOrEqual(0);
          cursor = found + 1;
        }
      }
    }
  });
});

describe('evidence/*.json: GDPR i strukturna pravila', () => {
  const files = loadEvidenceFiles();

  it('svaka evidence datoteka nosi unitId iz kataloga i ime datoteke = unitId', () => {
    for (const { file, data } of files) {
      expect(file).toBe(`${data.unitId}.json`);
      expect(findUnit(data.unitId), `evidence ${file}: nepoznat unitId`).toBeDefined();
    }
  });

  it('redactedText je null izvan whiteliste uloga i bez JMBAG/e-mail uzoraka', () => {
    for (const { file, data } of files) {
      for (const sample of data.samples) {
        expect(sample.pid, `evidence ${file}: uzorak bez pid`).toBeTruthy();
        for (const line of sample.lines) {
          if (!REDACT_WHITELIST.has(line.role)) {
            expect(
              line.redactedText,
              `evidence ${file} ${sample.pid}: uloga "${line.role}" nosi tekst`,
            ).toBeNull();
          }
          if (line.redactedText) {
            expect(line.redactedText).not.toMatch(/\d{10}/);
            expect(line.redactedText).not.toMatch(/@/);
          }
        }
      }
    }
  });
});
