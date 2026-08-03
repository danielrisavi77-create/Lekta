/**
 * Triage model (src/analysis/triage.ts): klasifikacija nalaza u auto/assisted/manual,
 * fixId/groupKey, lokacije (sidra za skok) i brojaci. Ukljucuje integracijski smoke kroz
 * analyzeFixture da dokaze da analyzeDocx puni details.triage.
 */
import { describe, it, expect } from 'vitest';
import { buildTriage } from '../src/analysis/triage';
import type { Check, Issue } from '../src/scoring/checks';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

function chk(partial: Partial<Check> & { title: string }): Check {
  return {
    category: 'formatting',
    status: 'fail',
    earned: 0,
    max: 8,
    detail: '',
    issue: null,
    scored: true,
    ...partial,
  };
}
function iss(partial: Partial<Issue> & { title: string }): Issue {
  return { severity: 'warning', category: 'formatting', detail: '', where: '', ...partial };
}

describe('buildTriage — klasifikacija', () => {
  it('margine su AUTO s margins-fixer', () => {
    const t = buildTriage({ checks: [chk({ title: 'Margine dokumenta', category: 'formatting' })] });
    expect(t.findings).toHaveLength(1);
    expect(t.findings[0].fixability).toBe('auto');
    expect(t.findings[0].fixId).toBe('margins-fixer');
  });

  it('format papira (dinamican naslov) se hvata prefiksom -> AUTO paper-size-fixer', () => {
    const t = buildTriage({ checks: [chk({ title: 'Format stranice A4', status: 'warn' })] });
    expect(t.findings[0].fixability).toBe('auto');
    expect(t.findings[0].fixId).toBe('paper-size-fixer');
  });

  it('velicina fonta ide na font-fixer (dijeli ga s fontom)', () => {
    const t = buildTriage({ checks: [chk({ title: 'Veličina osnovnog teksta' })] });
    expect(t.findings[0].fixId).toBe('font-fixer');
  });

  it('prazni odlomci: informativna provjera (max=0) s issueom -> AUTO empty-paragraph-fixer', () => {
    const t = buildTriage({
      checks: [
        chk({
          title: 'Prazni odlomci',
          category: 'elements',
          status: 'pass',
          max: 0,
          scored: false,
          issue: iss({ severity: 'info', category: 'elements', title: 'Dokument sadrži mnogo praznih odlomaka' }),
        }),
      ],
    });
    expect(t.findings).toHaveLength(1);
    expect(t.findings[0].fixability).toBe('auto');
    expect(t.findings[0].fixId).toBe('empty-paragraph-fixer');
  });

  it('uporaba Word stilova naslova je ASSISTED (heading.style) s lokacijama iz opisa', () => {
    const t = buildTriage({
      checks: [
        chk({
          title: 'Uporaba Word stilova naslova',
          category: 'structure',
          status: 'warn',
          issue: iss({
            category: 'structure',
            title: 'Neki naslovi možda nisu označeni Word stilom',
            detail: 'odlomak 5: Uvod; odlomak 9: Metode',
          }),
        }),
      ],
    });
    const f = t.findings[0];
    expect(f.fixability).toBe('assisted');
    expect(f.groupKey).toBe('heading.style');
    expect(f.fixId).toBeUndefined();
    expect(f.locations.map((l) => l.anchorId)).toEqual(['loc-p5', 'loc-p9']);
    expect(f.locations[0].paragraphIndex).toBe(5);
  });

  it('naslovi tablica -> ASSISTED caption.table', () => {
    const t = buildTriage({ checks: [chk({ title: 'Naslovi tablica', category: 'elements', status: 'warn' })] });
    expect(t.findings[0].fixability).toBe('assisted');
    expect(t.findings[0].groupKey).toBe('caption.table');
  });

  it('numeriranje od Uvoda -> ASSISTED page.numbering s page-numbering-fixer', () => {
    const t = buildTriage({ checks: [chk({ title: 'Numeriranje od prve stranice Uvoda', category: 'structure', status: 'warn' })] });
    expect(t.findings[0].fixability).toBe('assisted');
    expect(t.findings[0].groupKey).toBe('page.numbering');
    expect(t.findings[0].fixId).toBe('page-numbering-fixer');
  });

  it('citat bez podudaranja u literaturi -> ASSISTED citation-bibliography-sync-fixer, lokacija iz details.missingReferences', () => {
    // Od 5961bdd (2026-08-02) "Citirano -> literatura" ima zivi citation-bibliography-sync-fixer
    // (check-fixer-map.ts STRUCTURAL_CHECK_RULES), pa vise NIJE manual primjer - i dalje je dobar
    // primjer za lokacije izvedene iz details.missingReferences (REF_SOURCE_BY_CHECK nepromijenjen).
    const t = buildTriage({
      checks: [chk({ title: 'Citirano → literatura', category: 'citations', status: 'fail' })],
      details: { missingReferences: [{ p: 12, raw: 'Novak 2022', author: 'Novak', year: '2022' }] },
    });
    const f = t.findings[0];
    expect(f.fixability).toBe('assisted');
    expect(f.fixId).toBe('citation-bibliography-sync-fixer');
    expect(f.locations).toHaveLength(1);
    expect(f.locations[0].anchorId).toBe('loc-p12');
    expect(f.locations[0].excerpt).toContain('Novak');
  });

  it('nalaz u fusnoti dobiva loc-fn sidro', () => {
    const t = buildTriage({
      checks: [
        chk({
          title: 'Potpunost prvog navoda u fusnoti',
          category: 'citations',
          status: 'warn',
          issue: iss({ category: 'citations', title: 'Nepotpun prvi navod', detail: 'bilj. 3 nema izdavača' }),
        }),
      ],
    });
    const loc = t.findings[0].locations[0];
    expect(loc.footnoteId).toBe(3);
    expect(loc.anchorId).toBe('loc-fn3');
    expect(loc.paragraphIndex).toBe(0);
  });

  it('provjere koje prolaze NISU nalazi (fx-cist: nula laznih pozitiva)', () => {
    const t = buildTriage({
      checks: [
        chk({ title: 'Margine dokumenta', status: 'pass', earned: 8 }),
        chk({ title: 'Dominantni font', status: 'pass', earned: 8 }),
        chk({ title: 'Prazni odlomci', category: 'elements', status: 'pass', max: 0, scored: false, issue: null }),
      ],
    });
    expect(t.findings).toHaveLength(0);
    expect(t.counts).toEqual({ auto: 0, assisted: 0, manual: 0, total: 0 });
  });

  it('brojaci se zbrajaju i svaki nalaz ima fixability', () => {
    const t = buildTriage({
      checks: [
        chk({ title: 'Margine dokumenta', status: 'fail' }), // auto
        chk({ title: 'Naslovi tablica', category: 'elements', status: 'warn' }), // assisted
        chk({ title: 'Potpunost bibliografskih zapisa', category: 'citations', status: 'fail' }), // manual (sadrzajno pitanje, fixer ga ne dira)
      ],
    });
    expect(t.counts).toEqual({ auto: 1, assisted: 1, manual: 1, total: 3 });
    expect(t.findings.every((f) => !!f.fixability)).toBe(true);
    expect(t.counts.total).toBe(t.findings.length);
  });

  it('id nalaza je stabilan i bez dijakritike', () => {
    const t = buildTriage({ checks: [chk({ title: 'Veličina osnovnog teksta', category: 'formatting' })] });
    expect(t.findings[0].id).toBe('chk:formatting:velicina-osnovnog-teksta');
  });
});

describe('buildTriage — integracija kroz analyzeFixture', () => {
  it('analyzeDocx puni details.triage; svaki nalaz ima fixability, brojaci se slazu', async () => {
    // Dokument s krivim marginama (2,3 cm) i fontom da okine formatting nalaze.
    const file = buildDocxFile(
      {
        paragraphs: [
          { text: 'Uvod', styleId: 'Heading1' },
          { text: 'Ovo je tijelo rada koje sadrzi dovoljno teksta za analizu i vise recenica.', font: 'Arial', sizePt: 11 },
          { text: 'Drugi odlomak tijela s jos malo sadrzaja za mjerenje dominantnog fonta.', font: 'Arial', sizePt: 11 },
        ],
        marginsCm: { top: 2.3, right: 2.3, bottom: 2.3, left: 2.3 },
      },
      'triage-smoke.docx',
    );
    const result: any = await analyzeFixture(file, { profileId: 'fpzg-politologija-zavrsni' });
    const triage = result.details.triage;
    expect(triage).toBeDefined();
    expect(Array.isArray(triage.findings)).toBe(true);
    expect(triage.findings.length).toBeGreaterThan(0);
    for (const f of triage.findings) {
      expect(['auto', 'assisted', 'manual']).toContain(f.fixability);
    }
    expect(triage.counts.total).toBe(triage.findings.length);
    expect(triage.counts.auto + triage.counts.assisted + triage.counts.manual).toBe(triage.counts.total);
    // Krive margine su AUTO -> barem jedan auto nalaz.
    expect(triage.counts.auto).toBeGreaterThan(0);
  });
});
