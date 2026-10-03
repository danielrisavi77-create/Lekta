// Laya zlatni skup D1: kandidati, list za oznacavanje i grupirani split, bez modela i bez src/.
import { describe, expect, it } from 'vitest';
import { validateDecisionCase } from '../../scripts/laya/contracts-v2.ts';
import { listZaOznacavanje, pripremiKandidate, sastaviZlatniSkup } from '../../scripts/laya/zlatni-skup.ts';
import type { DokumentZaKandidate, Kandidati } from '../../scripts/laya/zlatni-skup.ts';
import { ENGINE_REV, PROFILE_REV } from '../helpers/laya-v2-fixtures.ts';

const OPTS = { engineRevision: ENGINE_REV, origin: 'owned_synthetic' as const, permissionRef: 'owned-d1-test' };

/** Sinteticki rezultat analize oblika koji cita snapshotFromAnalysis: n nepotpunih zapisa. */
function dokument(ime: string, n: number, extra: Partial<DokumentZaKandidate> = {}): DokumentZaKandidate {
  const references = Array.from({ length: n + 1 }, (_, i) => ({ p: 10 + i }));
  const incompleteReferences = Array.from({ length: n }, (_, i) => ({ p: 11 + i, text: `${ime}: sinteticki zapis ${i} bez godine.` }));
  return {
    naziv: `${ime}.docx`, sha256: ime.padEnd(64, '0').replace(/[^0-9a-f]/g, 'e'), profileId: 'synthetic-profile', profileRevision: PROFILE_REV,
    language: 'hr', sourceGroup: null, templateFamily: null,
    analysis: { checks: [{ id: 'reference.completeness', status: 'warn' }], details: { references, incompleteReferences } },
    ...extra,
  };
}

/** CSV s oznakom za svaki redak prema funkciji; ostali stupci ostaju kako ih je napisao list. */
function oznaci(k: Kandidati, kod: (br: number) => string): string {
  const [zaglavlje, ...redovi] = listZaOznacavanje(k).replace(/^﻿/, '').trimEnd().split('\r\n');
  return [zaglavlje, ...redovi.map((r) => {
    const polja = r.split(';');
    polja[4] = kod(Number(polja[0]));
    return polja.join(';');
  })].join('\r\n');
}

const KODOVI = ['S', 'L', 'E', 'N'];

describe('pripremiKandidate', () => {
  it('gradi valjane caseove kroz isti builder kao runner, s grupama iz hasha dokumenta', () => {
    const k = pripremiKandidate([dokument('a1', 2), dokument('b2', 1)], OPTS);
    expect(k.items.map((i) => i.br)).toEqual([1, 2, 3]);
    for (const i of k.items) expect(validateDecisionCase(i.case)).toEqual(i.case);
    const [x, , z] = k.items.map((i) => i.case.provenance);
    expect(x.documentGroupId).not.toBe(z.documentGroupId);
    // Bez sidecara je dokument sam svoja grupa izvora i predloska.
    expect(new Set([x.documentGroupId, x.sourceGroupId, x.templateFamilyId]).size).toBe(3);
    expect(x).toMatchObject({ localInferenceAllowed: true, trainingAllowed: false, externalInferenceAllowed: false });
  });

  it('isti ulaz daje iste ID-eve (deterministicki), a duplikat dokumenta se ne broji dvaput', () => {
    const a = pripremiKandidate([dokument('a1', 1)], OPTS);
    const b = pripremiKandidate([dokument('a1', 1), dokument('a1', 1)], OPTS);
    expect(b.items.map((i) => i.case.caseId)).toEqual(a.items.map((i) => i.case.caseId));
    expect(b.preskoceno).toEqual({ duplikat_dokumenta: 1 });
  });

  it('isti predlozak iz sidecara daje isti templateFamilyId u razlicitim dokumentima', () => {
    const k = pripremiKandidate([dokument('a1', 1, { templateFamily: 'ffzg-2025' }), dokument('b2', 1, { templateFamily: 'ffzg-2025' })], OPTS);
    expect(k.items[0].case.provenance.templateFamilyId).toBe(k.items[1].case.provenance.templateFamilyId);
  });

  it('nevaljan permissionRef ruši korak, ne tiho prolazi', () => {
    expect(() => pripremiKandidate([dokument('a1', 1)], { ...OPTS, permissionRef: 'ima razmak' })).toThrow();
  });
});

describe('listZaOznacavanje', () => {
  it('CSV s BOM-om, navodnicima i zastitom od Excel formule', () => {
    const d = dokument('a1', 1);
    d.analysis.details!.incompleteReferences = [{ p: 11, text: '=HYPERLINK("x"); Zakon o "nečemu"' }];
    const csv = listZaOznacavanje(pripremiKandidate([d], OPTS));
    expect(csv.startsWith('﻿br;kontrola;dokument;zapis;oznaka;napomena\r\n')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x""); Zakon o ""nečemu"""`);
  });
});

describe('sastaviZlatniSkup', () => {
  const docs = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'a7', 'b8', 'c9', 'd0'].map((ime) => dokument(ime, 3));
  const k = pripremiKandidate(docs, OPTS);

  it('spaja oznake, dijeli po grupama bez curenja i daje valjane GoldSetove', () => {
    const { calibration, test, statistika } = sastaviZlatniSkup(k, oznaci(k, (br) => KODOVI[br % 4]), { datasetId: 'd1-test', testUdio: 0.3 });
    expect(statistika).toMatchObject({ oznaceno: 30, neoznaceno: 0, grupa: 10 });
    expect(calibration.items.length + test.items.length).toBe(30);
    expect(test.items.length).toBeGreaterThanOrEqual(9);
    const docOf = (g: typeof test) => new Set(g.items.map((i) => i.case.provenance.documentGroupId));
    const cal = docOf(calibration);
    expect([...docOf(test)].filter((d) => cal.has(d))).toEqual([]);
    const brPoCase = new Map(k.items.map((i) => [i.case.caseId, i.br]));
    for (const i of [...calibration.items, ...test.items]) expect(i.gold).toBe(['finding_supported', 'possible_false_positive', 'extraction_uncertain', 'insufficient_evidence'][brPoCase.get(i.case.caseId)! % 4]);
  });

  it('isti ulaz daje isti split (ponovljivo)', () => {
    const csv = oznaci(k, () => 'S');
    const a = sastaviZlatniSkup(k, csv, { datasetId: 'd1-test', testUdio: 0.3 });
    const b = sastaviZlatniSkup(k, csv, { datasetId: 'd1-test', testUdio: 0.3 });
    expect(b.test.items.map((i) => i.case.caseId)).toEqual(a.test.items.map((i) => i.case.caseId));
  });

  it('zajednicki predlozak drzi dokumente u istom splitu', () => {
    const sDijeljenim = pripremiKandidate(docs.map((d, i) => (i < 4 ? { ...d, templateFamily: 'isti' } : d)), OPTS);
    const { calibration, test, statistika } = sastaviZlatniSkup(sDijeljenim, oznaci(sDijeljenim, () => 'L'), { datasetId: 'd1-test', testUdio: 0.3 });
    expect(statistika.grupa).toBe(7);
    const t = new Set(sDijeljenim.items.slice(0, 12).map((i) => i.case.caseId));
    const uTestu = test.items.filter((i) => t.has(i.case.caseId)).length;
    expect([0, 12]).toContain(uTestu);
    expect(calibration.items.length + test.items.length).toBe(30);
  });

  it('prazna oznaka je neoznaceno; zapis bez oznake ne ulazi u skup', () => {
    const { statistika } = sastaviZlatniSkup(k, oznaci(k, (br) => (br <= 20 ? 's' : '')), { datasetId: 'd1-test', testUdio: 0.3 });
    expect(statistika).toMatchObject({ oznaceno: 20, neoznaceno: 10 });
  });

  it('odbija nepoznatu oznaku, krivu kontrolu, ponovljen br i jednu jedinu grupu', () => {
    expect(() => sastaviZlatniSkup(k, oznaci(k, () => 'X'), { datasetId: 'd1-test', testUdio: 0.3 })).toThrow(/S, L, E, N/);
    const pomaknut = oznaci(k, () => 'S').replace(/\r\n1;k-/, '\r\n1;k-0');
    expect(() => sastaviZlatniSkup(k, pomaknut, { datasetId: 'd1-test', testUdio: 0.3 })).toThrow(/kontrola/);
    const csv = oznaci(k, () => 'S');
    const [zaglavlje, prvi, ...ostali] = csv.split('\r\n');
    expect(() => sastaviZlatniSkup(k, [zaglavlje, prvi, prvi, ...ostali].join('\r\n'), { datasetId: 'd1-test', testUdio: 0.3 })).toThrow(/ponavlja/);
    const jedan = pripremiKandidate([dokument('a1', 5)], OPTS);
    expect(() => sastaviZlatniSkup(jedan, oznaci(jedan, () => 'S'), { datasetId: 'd1-test', testUdio: 0.3 })).toThrow(/razdvojiti/);
  });

  it('prihvaca CSV koji je Excel spremio sa zarezom i navodnicima', () => {
    const zarez = oznaci(k, () => 'N').split('\r\n').map((r) => r.split(';').map((p) => `"${p}"`).join(',')).join('\n');
    expect(sastaviZlatniSkup(k, zarez, { datasetId: 'd1-test', testUdio: 0.3 }).statistika.oznaceno).toBe(30);
  });
});
