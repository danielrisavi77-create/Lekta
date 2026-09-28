/**
 * T83: jedan dokument, jedan glas. Isti rad iz vise korijena korpusa mjeri se jednom; nesuglasni
 * duplikati i isti sadrzaj pod dva imena rusu mjerenje; ovjera odbija napuhano ili palo mjerenje, a
 * potpis ostaje samo uz ISTO potpisano mjerenje. Nalazi Codex pregleda #185 (T83-01 do T83-06).
 */
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  dedupeManifest, discoverRealCorpus, REAL_CORPUS_ROOT, runRealCorpus, type RealCorpusManifestEntry,
} from './real-corpus/harness';
import { attestationProblems, pdfAttestationProblems, signedContentProblem, type CorpusAttestation } from '../src/verification/real-corpus-attestation';
import { attestationContentDigestSync, sha256HexSync } from '../src/verification/attestation-content-digest';
import {
  FINGERPRINT_VERSION, attestInvocationProblems, attestationContentDigest, attestationRefusals, corpusFingerprintV2, inheritedSignature,
} from '../scripts/lib/corpus-attestation-core.mjs';
import { repairSourceHashAtCommit } from '../scripts/lib/repair-source-hash.mjs';

const entry = (documentId: string, root: string, extra: Partial<RealCorpusManifestEntry> = {}): RealCorpusManifestEntry => ({
  documentId,
  fileName: `${documentId}.docx`,
  profileId: 'fer-diplomski',
  root,
  holdout: false,
  expectationProvenance: 'derived',
  ...extra,
});
/** Zadani sadrzaj ovisi o id-u: razliciti radovi imaju razlicite bajtove, kao u stvarnom korpusu. */
const bytes = (map: Record<string, string> = {}) => (e: RealCorpusManifestEntry) =>
  new TextEncoder().encode(map[`${e.root}/${e.documentId}`] ?? `sadrzaj-${e.documentId}`);

describe('dedupeManifest', () => {
  it('ista datoteka iz dva korijena broji se jednom, zadrzava se prva pojava', () => {
    const { entries, duplicates } = dedupeManifest(
      [entry('a', 'docx'), entry('b', 'local'), entry('a', 'local'), entry('b', 'ingest'), entry('c', 'ingest')],
      bytes(),
    );
    expect(entries.map((e) => `${e.root}/${e.documentId}`)).toEqual(['docx/a', 'local/b', 'ingest/c']);
    expect(duplicates).toEqual([
      { documentId: 'a', roots: ['docx', 'local'] },
      { documentId: 'b', roots: ['local', 'ingest'] },
    ]);
  });

  it('tri kopije istog rada daju jedan unos i dvije izbacene kopije', () => {
    const { entries, duplicates } = dedupeManifest([entry('a', 'r1'), entry('a', 'r2'), entry('a', 'r3')], bytes());
    expect(entries).toHaveLength(1);
    expect(duplicates[0].roots).toEqual(['r1', 'r2', 'r3']);
  });

  it('bez duplikata manifest ostaje isti', () => {
    const ulaz = [entry('a', 'r'), entry('b', 'r')];
    const { entries, duplicates } = dedupeManifest(ulaz, bytes());
    expect(entries).toEqual(ulaz);
    expect(duplicates).toEqual([]);
  });

  it('isti id s razlicitim sadrzajem ili profilom baca', () => {
    expect(() => dedupeManifest([entry('a', 'r1'), entry('a', 'r2')], bytes({ 'r1/a': 'jedno', 'r2/a': 'drugo' })))
      .toThrow(/razlicitim sadrzajem ili metapodacima/);
    expect(() => dedupeManifest([entry('a', 'r1'), entry('a', 'r2', { profileId: 'fpzg-diplomski' })], bytes()))
      .toThrow(/razlicitim sadrzajem ili metapodacima/);
  });

  it('T83-02: isti id i bajtovi s razlicitim holdoutom ili porijeklom ocekivanja baca, redoslijed ne odlucuje', () => {
    expect(() => dedupeManifest([entry('a', 'r1'), entry('a', 'r2', { holdout: true })], bytes()))
      .toThrow(/izdvojeni skup/);
    expect(() => dedupeManifest([entry('a', 'r1', { holdout: true }), entry('a', 'r2')], bytes()))
      .toThrow(/izdvojeni skup/);
    expect(() => dedupeManifest([entry('a', 'r1'), entry('a', 'r2', { expectationProvenance: 'independent' })], bytes()))
      .toThrow(/porijeklo ocekivanja/);
  });

  it('T83-01: isti bajtovi pod dva razlicita id-a bacaju', () => {
    expect(() => dedupeManifest([entry('a', 'r1'), entry('b', 'r2')], bytes({ 'r1/a': 'isto', 'r2/b': 'isto' })))
      .toThrow(/isti sadrzaj postoji pod documentId a i b/);
  });
});

describe('T83-06: stvarno mjerenje kroz runRealCorpus', () => {
  it('ista fixture u commitanom i lokalnom korijenu mjeri se jednom', async () => {
    const izvor = discoverRealCorpus(REAL_CORPUS_ROOT)[0];
    expect(izvor, 'commitani korpus mora imati bar jedan dopusten dokument').toBeDefined();
    const sidecar = izvor.fileName.replace(/\.docx$/, '.json');
    const commitani = mkdtempSync(join(tmpdir(), 'lekta-t83-docx-'));
    const lokalni = mkdtempSync(join(tmpdir(), 'lekta-t83-local-'));
    try {
      for (const r of [commitani, lokalni]) {
        copyFileSync(join(REAL_CORPUS_ROOT, izvor.fileName), join(r, izvor.fileName));
        copyFileSync(join(REAL_CORPUS_ROOT, sidecar), join(r, sidecar));
      }
      // Generator proizvodi ciljanu klasu: isti id, isti bajtovi, dva korijena.
      expect([...discoverRealCorpus(commitani), ...discoverRealCorpus(lokalni)].map((e) => e.documentId))
        .toEqual([izvor.documentId, izvor.documentId]);
      expect(readFileSync(join(commitani, izvor.fileName)).equals(readFileSync(join(lokalni, izvor.fileName)))).toBe(true);
      const report = await runRealCorpus(commitani, { includeLocal: true, localRoot: lokalni, externalRoot: null });
      expect(report.results.map((r) => r.documentId)).toEqual([izvor.documentId]);
      expect(report.scope.duplicateDocumentCount).toBe(1);
      expect(report.scope.localDocumentCount ?? 0).toBe(0);
    } finally {
      rmSync(commitani, { recursive: true, force: true });
      rmSync(lokalni, { recursive: true, force: true });
    }
  }, 180_000);

  /** Commitana fixture u prvom korijenu i njena varijanta u drugom; vraca oba korijena. */
  const dvaKorijena = (varijanta: (izvor: RealCorpusManifestEntry, lokalni: string, sidecar: string) => void) => {
    const izvor = discoverRealCorpus(REAL_CORPUS_ROOT)[0];
    const sidecar = izvor.fileName.replace(/\.docx$/, '.json');
    const commitani = mkdtempSync(join(tmpdir(), 'lekta-t83-docx-'));
    const lokalni = mkdtempSync(join(tmpdir(), 'lekta-t83-local-'));
    copyFileSync(join(REAL_CORPUS_ROOT, izvor.fileName), join(commitani, izvor.fileName));
    copyFileSync(join(REAL_CORPUS_ROOT, sidecar), join(commitani, sidecar));
    varijanta(izvor, lokalni, sidecar);
    return { izvor, commitani, lokalni };
  };

  it('T83-01 kroz mjerenje: isti bajtovi pod drugim imenom rusu runRealCorpus', async () => {
    const { izvor, commitani, lokalni } = dvaKorijena((izvor, lokalni, sidecar) => {
      copyFileSync(join(REAL_CORPUS_ROOT, izvor.fileName), join(lokalni, 'kopija-pod-drugim-imenom.docx'));
      copyFileSync(join(REAL_CORPUS_ROOT, sidecar), join(lokalni, 'kopija-pod-drugim-imenom.json'));
    });
    try {
      // Generator proizvodi ciljanu klasu: dva razlicita id-a, isti bajtovi.
      const ids = [...discoverRealCorpus(commitani), ...discoverRealCorpus(lokalni)].map((e) => e.documentId);
      expect(ids).toEqual([izvor.documentId, 'kopija-pod-drugim-imenom']);
      expect(readFileSync(join(commitani, izvor.fileName)).equals(readFileSync(join(lokalni, 'kopija-pod-drugim-imenom.docx')))).toBe(true);
      await expect(runRealCorpus(commitani, { includeLocal: true, localRoot: lokalni, externalRoot: null }))
        .rejects.toThrow(/isti sadrzaj postoji pod documentId/);
    } finally {
      rmSync(commitani, { recursive: true, force: true });
      rmSync(lokalni, { recursive: true, force: true });
    }
  }, 60_000);

  it('T83-02 kroz mjerenje: ista datoteka s drugacijim holdoutom u sidecaru rusi runRealCorpus', async () => {
    const { izvor, commitani, lokalni } = dvaKorijena((izvor, lokalni, sidecar) => {
      copyFileSync(join(REAL_CORPUS_ROOT, izvor.fileName), join(lokalni, izvor.fileName));
      const meta = JSON.parse(readFileSync(join(REAL_CORPUS_ROOT, sidecar), 'utf8'));
      writeFileSync(join(lokalni, sidecar), JSON.stringify({ ...meta, holdout: !discoverRealCorpus(REAL_CORPUS_ROOT)[0].holdout }));
    });
    try {
      const [a, b] = [...discoverRealCorpus(commitani), ...discoverRealCorpus(lokalni)];
      expect(a.documentId).toBe(b.documentId);
      expect(a.holdout).not.toBe(b.holdout);
      expect(izvor.documentId).toBe(a.documentId);
      await expect(runRealCorpus(commitani, { includeLocal: true, localRoot: lokalni, externalRoot: null }))
        .rejects.toThrow(/izdvojeni skup/);
    } finally {
      rmSync(commitani, { recursive: true, force: true });
      rmSync(lokalni, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('otisak v2, potpis i odbijanje ovjere', () => {
  const ids = ['corpus-a', 'corpus-b', 'corpus-c'];
  const v1 = (list: string[]) => createHash('sha256').update([...list].sort().join('\n')).digest('hex').slice(0, 32);

  it('v2 ne ovisi o ponavljanju ni redoslijedu, a nikad nije jednak v1', () => {
    expect(corpusFingerprintV2([...ids, 'corpus-a', 'corpus-b'])).toBe(corpusFingerprintV2(ids));
    expect(corpusFingerprintV2([...ids].reverse())).toBe(corpusFingerprintV2(ids));
    expect(corpusFingerprintV2(ids)).not.toBe(v1(ids));
    expect(v1([...ids, 'corpus-a'])).not.toBe(v1(ids));
  });

  /** Sadrzaj ovjere bez polja potpisa, kako ga skripta gradi. */
  const sadrzaj = (over: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    fingerprintVersion: FINGERPRINT_VERSION,
    corpusFingerprint: corpusFingerprintV2(ids),
    measuredAt: '2026-09-20T09:00:00.000Z',
    measuredFromCommit: 'a'.repeat(40),
    oracles: ['scripts/repair-real-corpus.mts'],
    environment: { wordVersion: null },
    protocol: { holdoutExcluded: true, holdoutDocumentCount: 1, uniqueDocumentCount: 3, rawDocumentCount: 3, countedDocumentCount: 2, duplicateDocumentCount: 0 },
    entries: [{ unitId: 'fpzg', workType: 'final', profileIds: ['p'], documentCount: 2, cleanCount: 2, regressedChecks: [] }],
    ...over,
  });
  const potpisi = (s: Record<string, unknown>) => ({
    ...s, signedBy: 'Vlasnik', signedAt: '2026-09-20T10:00:00.000Z', signatureNote: null, signedContentDigest: attestationContentDigest(s),
  });

  it('otisak sadrzaja ne ovisi o redoslijedu kljuceva ni o poljima potpisa', () => {
    const s = sadrzaj();
    const obrnuto = Object.fromEntries(Object.entries(s).reverse());
    expect(attestationContentDigest(obrnuto)).toBe(attestationContentDigest(s));
    expect(attestationContentDigest(potpisi(s))).toBe(attestationContentDigest(s));
    expect(attestationContentDigest(sadrzaj({ protocol: { ...s.protocol, holdoutExcluded: false } }))).not.toBe(attestationContentDigest(s));
  });

  it('isti sadrzaj zadrzava potpis', () => {
    const s = sadrzaj();
    expect(inheritedSignature(potpisi(s), s)).toMatchObject({ signedBy: 'Vlasnik', signedContentDigest: attestationContentDigest(s) });
  });

  it('T83-05: drugo mjerenje, --holdout-confirmed ili drugacije brojke ne nasljeduju potpis', () => {
    const s = sadrzaj();
    const p = potpisi(s);
    // Mjerenje 09:00, potpis 10:00, novo mjerenje 09:30.
    expect(inheritedSignature(p, sadrzaj({ measuredAt: '2026-09-20T09:30:00.000Z' }))).toBeNull();
    expect(inheritedSignature(p, sadrzaj({ measuredFromCommit: 'b'.repeat(40) }))).toBeNull();
    // Isto mjerenje ovjereno s --holdout-confirmed: isti otisak, vrijeme i commit, drugi opseg dokaza.
    expect(inheritedSignature(p, sadrzaj({
      protocol: { ...s.protocol, holdoutExcluded: false, countedDocumentCount: 3 },
      entries: [{ ...s.entries[0], documentCount: 3, cleanCount: 3 }],
    }))).toBeNull();
    // Rucno izmijenjena potpisana ovjera: zapisani otisak vise ne odgovara njenom sadrzaju.
    expect(inheritedSignature({ ...p, entries: [{ ...s.entries[0], cleanCount: 1 }] }, sadrzaj({ entries: [{ ...s.entries[0], cleanCount: 1 }] }))).toBeNull();
    // Stvarni slucaj: potpisana v1 ovjera a74d93d5 nema otisak sadrzaja.
    expect(inheritedSignature({ corpusFingerprint: '8e5bd529d4f2b596ccf8fa0ef58c029d', signedBy: 'Daniel', signedAt: '2026-09-12T22:00:26.856Z' }, s)).toBeNull();
    expect(inheritedSignature(null, s)).toBeNull();
  });

  it('T83-03: nedopusten ishod, greska, ostecen paket ili dvostruki id odbijaju ovjeru', () => {
    const r = (documentId: string, extra: Record<string, unknown> = {}) => ({ documentId, outcome: 'review', error: null, integrityFailure: null, ...extra });
    expect(attestationRefusals([r('a'), r('b', { outcome: 'pass' }), r('c', { outcome: 'no-op' })])).toEqual([]);
    expect(attestationRefusals([r('a'), r('b', { outcome: 'fail' })])).toEqual(['1 dokumenata nema dopusten ishod (pass, review, no-op)']);
    expect(attestationRefusals([r('a', { outcome: 'nepoznat' })])).toEqual(['1 dokumenata nema dopusten ishod (pass, review, no-op)']);
    // Codexov primjer iz runde 2: ishod review uz gresku analize.
    expect(attestationRefusals([r('a', { error: 'analysis crashed' })])).toEqual(['1 dokumenata ima gresku mjerenja (error)']);
    expect(attestationRefusals([r('a', { integrityFailure: 'nedostaje dio' })])).toEqual(['1 dokumenata ima ostecen paket (integrityFailure)']);
    expect(attestationRefusals([r('a'), r('a')])[0]).toMatch(/1 dvostrukih documentId/);
  });
});

describe('T83-06: stvarna skripta ovjere', () => {
  const profil = (() => {
    const p = (JSON.parse(readFileSync(resolve('data/profiles/verified-profiles.json'), 'utf8')) as Array<{ id: string; unitId?: string; workTypes?: string[] }>)
      .find((x) => x.unitId && x.workTypes && x.workTypes.length);
    if (!p) throw new Error('registar nema profil s jedinicom');
    return p.id;
  })();
  const mjerenje = (ids: string[], generatedAt: string, extra: Record<string, unknown> = {}, holdoutIds: string[] = []) => ({
    generatedAt,
    // T75: skripta racuna otisak koda popravka iz git objekata commita mjerenja, pa commit mora postojati.
    generatedFromCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: { duplicateDocumentCount: 0 },
    results: ids.map((documentId) => ({
      documentId, profileId: profil, holdout: holdoutIds.includes(documentId), expectationProvenance: 'derived', outcome: 'review',
      statusChanges: [], integrityFailure: null, error: null, ...extra,
    })),
  });
  // Codex #225, nalaz 1: vrsta izvora je obvezan ulaz ovjere; zadano izvorni DOCX, `bezVrste` ga izostavlja.
  const pokreni = (dir: string, args: string[] = [], vrsta: string | null = 'source-docx') =>
    spawnSync(process.execPath, ['scripts/attest-real-corpus.mjs', ...(vrsta ? ['--source-kind', vrsta] : []), ...args], {
    encoding: 'utf8',
    env: { ...process.env, LEKTA_ATTEST_INPUT: join(dir, 'mjerenje.json'), LEKTA_ATTEST_OUTPUT: join(dir, 'ovjera.json') },
  });
  const procitaj = (dir: string) => JSON.parse(readFileSync(join(dir, 'ovjera.json'), 'utf8'));

  it('odbija napuhano, palo i pogresno mjerenje, a potpis zadrzava samo uz isti sadrzaj', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-t83-attest-'));
    const upisi = (m: unknown) => writeFileSync(join(dir, 'mjerenje.json'), JSON.stringify(m));
    try {
      upisi(mjerenje(['corpus-a', 'corpus-a'], '2026-09-20T09:00:00.000Z'));
      const dvostruko = pokreni(dir);
      expect(dvostruko.status).toBe(1);
      expect(dvostruko.stderr).toMatch(/dvostrukih documentId/);

      upisi(mjerenje(['corpus-a'], '2026-09-20T09:00:00.000Z', { outcome: 'fail' }));
      expect(pokreni(dir).status).toBe(1);
      upisi(mjerenje(['corpus-a'], '2026-09-20T09:00:00.000Z', { error: 'analysis crashed' }));
      const greska = pokreni(dir);
      expect(greska.status).toBe(1);
      expect(greska.stderr).toMatch(/gresku mjerenja/);

      const cisto = mjerenje(['corpus-a', 'corpus-b', 'corpus-c'], '2026-09-20T09:00:00.000Z', {}, ['corpus-c']);
      upisi(cisto);
      expect(pokreni(dir, ['--sign', 'Vlasnik']).status).toBe(0);
      const potpisana = procitaj(dir);
      expect(potpisana.fingerprintVersion).toBe(2);
      expect(potpisana.protocol).toMatchObject({ duplicateDocumentCount: 0, uniqueDocumentCount: 3, rawDocumentCount: 3, countedDocumentCount: 2 });
      expect(potpisana.signedContentDigest).toMatch(/^[0-9a-f]{64}$/);
      // T75: skripta upisuje otisak koda popravka commita MJERENJA, ne s diska.
      expect(potpisana.repairSourceHash).toBe(repairSourceHashAtCommit(potpisana.measuredFromCommit).hash);
      expect(attestationProblems(potpisana)).toEqual([]);

      // Ista ovjera ponovljena nad ISTIM mjerenjem zadrzava potpis.
      expect(pokreni(dir).status).toBe(0);
      expect(procitaj(dir).signedBy).toBe('Vlasnik');

      // T83-05: isto mjerenje s --holdout-confirmed mijenja opseg dokaza i gubi potpis.
      expect(pokreni(dir, ['--holdout-confirmed']).status).toBe(0);
      const siriOpseg = procitaj(dir);
      expect(siriOpseg.corpusFingerprint).toBe(potpisana.corpusFingerprint);
      expect(siriOpseg.protocol.countedDocumentCount).toBe(3);
      expect(siriOpseg.signedBy).toBeNull();

      // Novo mjerenje istog skupa (isti otisak, drugo vrijeme) takodjer gubi potpis.
      upisi(cisto);
      expect(pokreni(dir, ['--sign', 'Vlasnik']).status).toBe(0);
      upisi(mjerenje(['corpus-a', 'corpus-b', 'corpus-c'], '2026-09-20T09:30:00.000Z', {}, ['corpus-c']));
      expect(pokreni(dir).status).toBe(0);
      expect(procitaj(dir).signedBy).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('bez --source-kind odbija pisati; PDF izvor upisuje sourceKind i nije prava ovjera (Codex #225, nalaz 1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-225-attest-'));
    try {
      writeFileSync(join(dir, 'mjerenje.json'), JSON.stringify(mjerenje(['corpus-a', 'corpus-b'], '2026-09-20T09:00:00.000Z')));
      const bez = pokreni(dir, ['--sign', 'Vlasnik'], null);
      expect(bez.status).toBe(1);
      expect(bez.stderr).toMatch(/--source-kind/);
      expect(pokreni(dir, ['--sign', 'Vlasnik'], 'nepoznato').status).toBe(1);

      expect(pokreni(dir, ['--sign', 'Vlasnik']).status).toBe(0);
      expect(procitaj(dir).sourceKind).toBe('source-docx');
      expect(attestationProblems(procitaj(dir))).toEqual([]);

      // Codex #229, nalaz 02: PDF ovjera prima samo rezultate s PDF sidecarom (sourceKind iz corpus-ingest).
      const bezPdfSidecara = pokreni(dir, ['--sign', 'Vlasnik'], 'public-pdf-converted');
      expect(bezPdfSidecara.status).toBe(1);
      expect(bezPdfSidecara.stderr).toMatch(/2 rezultata nema sourceKind public-pdf-converted/);
      writeFileSync(
        join(dir, 'mjerenje.json'),
        JSON.stringify(mjerenje(['corpus-a', 'corpus-b'], '2026-09-20T09:00:00.000Z', { sourceKind: 'public-pdf-converted' })),
      );
      expect(pokreni(dir, ['--sign', 'Vlasnik'], 'source-docx').status).toBe(1);
      expect(pokreni(dir, ['--sign', 'Vlasnik'], 'public-pdf-converted').status).toBe(0);
      const pdf = procitaj(dir);
      expect(pdf.sourceKind).toBe('public-pdf-converted');
      expect(pdfAttestationProblems(pdf)).toEqual([]);
      expect(attestationProblems(pdf)).toContain('ovjera nad radovima pretvorenim iz PDF-a nije dokaz na izvornom Word dokumentu');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  // Codex #229, krug popravka (blocker): `npm run attest-corpus` i naredba iz protokola nisu prosljedjivali
  // --source-kind, pa je ovjera od #225 uvijek padala. Pokrece se STVARNA naredba iz package.json.
  it('npm skripte attest-corpus i attest-corpus:pdf nose vrstu i prolaze nad cistim mjerenjem svoje vrste', () => {
    const skripte = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    const dir = mkdtempSync(join(tmpdir(), 'lekta-229-npm-attest-'));
    const izSkripte = (ime: string, extra: Record<string, unknown>) => {
      const [bin, ...argv] = skripte[ime].split(/\s+/);
      expect(bin).toBe('node');
      writeFileSync(join(dir, 'mjerenje.json'), JSON.stringify(mjerenje(['corpus-a', 'corpus-b'], '2026-09-20T09:00:00.000Z', extra)));
      return spawnSync(process.execPath, [...argv, '--sign', 'Vlasnik'], {
        encoding: 'utf8',
        env: { ...process.env, LEKTA_ATTEST_INPUT: join(dir, 'mjerenje.json'), LEKTA_ATTEST_OUTPUT: join(dir, 'ovjera.json') },
      });
    };
    try {
      const docx = izSkripte('attest-corpus', {});
      expect(docx.stderr).not.toMatch(/--source-kind/);
      expect(docx.status).toBe(0);
      expect(procitaj(dir).sourceKind).toBe('source-docx');
      const pdf = izSkripte('attest-corpus:pdf', { sourceKind: 'public-pdf-converted' });
      expect(pdf.status).toBe(0);
      expect(procitaj(dir).sourceKind).toBe('public-pdf-converted');
      // Negativna kontrola: PDF skripta nad mjerenjem bez PDF sidecara i dalje odbija.
      expect(izSkripte('attest-corpus:pdf', {}).status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('svaki poziv ovjere u package.json, protokolu i zaglavlju PDF toka nosi --source-kind', () => {
    for (const putanja of ['package.json', 'docs/quality/real-corpus-protocol.md', 'scripts/pdf-corpus/harvest_pdf_corpus.py']) {
      const tekst = readFileSync(resolve(putanja), 'utf8');
      expect(tekst).toMatch(/node scripts\/attest-real-corpus\.mjs/);
      expect(attestInvocationProblems(tekst, putanja)).toEqual([]);
    }
    expect(attestInvocationProblems('"attest-corpus": "node scripts/attest-real-corpus.mjs",', 'p')).toHaveLength(1);
    expect(attestInvocationProblems('node scripts/attest-real-corpus.mjs --source-kind pdf --sign "Ime"', 'p')).toHaveLength(1);
    expect(attestInvocationProblems('node scripts/attest-real-corpus.mjs --source-kind source-docx-x', 'p')).toHaveLength(1);
  });
});

describe('attestationProblems: dvostruko brojanje, verzija otiska i dosljednost brojeva', () => {
  const cista = { duplicateDocumentCount: 0, uniqueDocumentCount: 219, rawDocumentCount: 321, countedDocumentCount: 178 };
  const ovjera = (extra: Record<string, unknown> = {}, protocol: Record<string, unknown> = {}): CorpusAttestation => ({
    schemaVersion: 1,
    corpusFingerprint: 'f'.repeat(32),
    measuredAt: '2026-09-27T15:00:00.000Z',
    measuredFromCommit: 'a'.repeat(40),
    oracles: ['scripts/repair-real-corpus.mts'],
    environment: { wordVersion: null },
    protocol: { holdoutExcluded: true, holdoutDocumentCount: 41, independentlyConfirmedCount: 0, derivedExpectationCount: 219, ...protocol },
    signedBy: 'Vlasnik',
    signedAt: '2026-09-27T16:00:00.000Z',
    signatureNote: null,
    entries: [{ unitId: 'fer', workType: 'graduate', profileIds: ['fer-diplomski'], documentCount: 2, cleanCount: 2, regressedChecks: [] }],
    ...extra,
  } as unknown as CorpusAttestation);
  /** Potpisana v2 ovjera s ISPRAVNIM otiskom sadrzaja; `extra` moze ga prepisati. */
  const v2 = (protocol: Record<string, unknown> = cista, extra: Record<string, unknown> = {}) => {
    const bez = ovjera({ fingerprintVersion: 2, repairSourceHash: 'e'.repeat(64) }, protocol);
    return { ...bez, signedContentDigest: attestationContentDigestSync(bez), ...extra } as CorpusAttestation;
  };

  it('T75: v1 ovjera (bez verzije) vise nije dokaz; dvostruko brojanje je problem', () => {
    expect(attestationProblems(ovjera())).toEqual(['ovjera v1 (otisak s ponavljanjima) vise nije dokaz']);
    expect(attestationProblems(ovjera({}, { duplicateDocumentCount: 3 }))).toContain('mjerenje je iste dokumente brojalo vise puta');
  });

  it('T83-04: v2 bez uskladjenih brojeva i nepoznata verzija su problem', () => {
    expect(attestationProblems(v2())).toEqual([]);
    expect(attestationProblems(v2({}))).toContain('ovjera v2 nema uskladjene brojeve dokumenata');
    expect(attestationProblems(v2({ ...cista, rawDocumentCount: 100 }))).toContain('ovjera v2 nema uskladjene brojeve dokumenata');
    expect(attestationProblems(v2({ ...cista, countedDocumentCount: 300 }))).toContain('ovjera v2 nema uskladjene brojeve dokumenata');
    expect(attestationProblems(ovjera({ fingerprintVersion: 3 }, cista))).toContain('nepoznata verzija otiska korpusa');
  });

  it('T83-07: nula jedinstvenih uz dokazne unose i nedosljedne brojke po skupini su problem', () => {
    // Codexov primjer iz runde 2.
    expect(attestationProblems(v2({ ...cista, uniqueDocumentCount: 0, rawDocumentCount: 0, countedDocumentCount: 0, holdoutDocumentCount: 0 })))
      .toContain('ovjera v2: brojke po skupini ne odgovaraju broju dokumenata');
    const skupina = { unitId: 'fer', workType: 'graduate', profileIds: ['fer-diplomski'], regressedChecks: [] };
    expect(attestationProblems(v2(cista, { entries: [{ ...skupina, documentCount: 500, cleanCount: 1 }] })))
      .toContain('ovjera v2: brojke po skupini ne odgovaraju broju dokumenata');
    expect(attestationProblems(v2(cista, { entries: [{ ...skupina, documentCount: 2, cleanCount: 3 }] })))
      .toContain('ovjera v2: brojke po skupini ne odgovaraju broju dokumenata');
  });

  it('T83-05: potpisana v2 ovjera mora navesti otisak sadrzaja koji potpis pokriva', () => {
    expect(attestationProblems(v2(cista, { signedContentDigest: null }))).toContain('potpis v2 ovjere ne navodi otisak sadrzaja koji pokriva');
  });

  it('NOVO-01: brojka promijenjena nakon potpisa je problem, nepromijenjena ovjera prolazi', () => {
    const potpisana = v2(cista, { entries: [{ unitId: 'fer', workType: 'graduate', profileIds: ['fer-diplomski'], documentCount: 2, cleanCount: 1, regressedChecks: [] }] });
    // extra je prepisao entries NAKON racunanja otiska, pa ovo vec JEST izmijenjena ovjera; ispravna se gradi ovako:
    const bez = { ...potpisana, signedContentDigest: undefined };
    const cistaPotpisana = { ...potpisana, signedContentDigest: attestationContentDigestSync(bez) } as CorpusAttestation;
    expect(attestationProblems(cistaPotpisana)).toEqual([]);
    // Codexov primjer: cleanCount 1 -> 2 nakon potpisa.
    const izmijenjena = { ...cistaPotpisana, entries: [{ ...cistaPotpisana.entries[0], cleanCount: 2 }] } as CorpusAttestation;
    expect(attestationProblems(izmijenjena)).toContain('sadrzaj ovjere je promijenjen nakon potpisa');
    expect(signedContentProblem(izmijenjena)).toBe('sadrzaj ovjere je promijenjen nakon potpisa');
    // v1 ovjera bez otiska ostaje citljiva.
    expect(signedContentProblem(ovjera())).toBeNull();
  });
});

describe('NOVO-01: isti otisak sadrzaja u pregledniku i u skripti', () => {
  it('sinkroni SHA-256 u src/ daje iste bajtove kao node:crypto, i na granicama bloka', () => {
    for (const s of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(1000), 'čćžšđ ČĆŽŠĐ'.repeat(40)]) {
      expect(sha256HexSync(s), `duljina ${s.length}`).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });

  it('kanonizacija u src/ i u scripts/lib daje isti otisak nad istom ovjerom', () => {
    const o = {
      schemaVersion: 1, fingerprintVersion: 2, corpusFingerprint: 'f'.repeat(32), measuredAt: '2026-09-27T15:00:00.000Z',
      measuredFromCommit: 'a'.repeat(40), oracles: ['scripts/repair-real-corpus.mts'], environment: { wordVersion: null },
      protocol: { holdoutExcluded: true, holdoutDocumentCount: 41, uniqueDocumentCount: 219, rawDocumentCount: 321, countedDocumentCount: 178, duplicateDocumentCount: 0 },
      entries: [{ unitId: 'fpzg', workType: 'final', profileIds: ['fpzg-politologija-zavrsni'], documentCount: 22, cleanCount: 22, regressedChecks: [] }],
      signedBy: 'Vlasnik', signedAt: '2026-09-27T16:00:00.000Z', signatureNote: 'po uputi, čžš', signedContentDigest: 'x',
    };
    expect(attestationContentDigestSync(o)).toBe(attestationContentDigest(o));
  });
});
