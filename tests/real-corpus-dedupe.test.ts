/**
 * T83: jedan dokument, jedan glas. Isti rad iz vise korijena korpusa mjeri se jednom; nesuglasni
 * duplikati i isti sadrzaj pod dva imena rusu mjerenje; ovjera odbija napuhano ili palo mjerenje, a
 * potpis ostaje samo uz ISTO potpisano mjerenje. Nalazi Codex pregleda #185 (T83-01 do T83-06).
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  dedupeManifest, discoverRealCorpus, REAL_CORPUS_ROOT, runRealCorpus, type RealCorpusManifestEntry,
} from './real-corpus/harness';
import { attestationProblems, type CorpusAttestation } from '../src/verification/real-corpus-attestation';
import {
  FINGERPRINT_VERSION, attestationRefusals, corpusFingerprintV2, inheritedSignature,
} from '../scripts/lib/corpus-attestation-core.mjs';

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

  const potpisana = {
    fingerprintVersion: FINGERPRINT_VERSION,
    corpusFingerprint: corpusFingerprintV2(ids),
    measuredAt: '2026-09-28T09:00:00.000Z',
    measuredFromCommit: 'a'.repeat(40),
    signedBy: 'Vlasnik',
    signedAt: '2026-09-28T10:00:00.000Z',
    signatureNote: null,
  };
  const isto = { fingerprintVersion: 2, corpusFingerprint: potpisana.corpusFingerprint, measuredAt: potpisana.measuredAt, measuredFromCommit: potpisana.measuredFromCommit };

  it('isto potpisano mjerenje zadrzava potpis', () => {
    expect(inheritedSignature(potpisana, isto)).toEqual({ signedBy: 'Vlasnik', signedAt: potpisana.signedAt, signatureNote: null });
  });

  it('T83-05: drugo mjerenje istog skupa ne nasljeduje potpis ni kad je potpis noviji od njega', () => {
    // Mjerenje 09:00, potpis 10:00, novo mjerenje 09:30: potpis je noviji, ali pokriva drugo mjerenje.
    expect(inheritedSignature(potpisana, { ...isto, measuredAt: '2026-09-28T09:30:00.000Z' })).toBeNull();
    expect(inheritedSignature(potpisana, { ...isto, measuredFromCommit: 'b'.repeat(40) })).toBeNull();
    expect(inheritedSignature(potpisana, { ...isto, corpusFingerprint: corpusFingerprintV2(['x']) })).toBeNull();
    // Stvarni slucaj: potpisana v1 ovjera a74d93d5 (bez fingerprintVersion), isti v1 otisak i isto mjerenje.
    const staraV1 = {
      corpusFingerprint: '8e5bd529d4f2b596ccf8fa0ef58c029d', measuredAt: '2026-09-10T08:28:07.311Z',
      measuredFromCommit: '59adbc8c', signedBy: 'Daniel', signedAt: '2026-09-12T22:00:26.856Z',
    };
    expect(inheritedSignature(staraV1, { fingerprintVersion: 2, corpusFingerprint: staraV1.corpusFingerprint, measuredAt: staraV1.measuredAt, measuredFromCommit: staraV1.measuredFromCommit })).toBeNull();
    expect(inheritedSignature(null, isto)).toBeNull();
  });

  it('T83-03: pad isporuke, ostecen paket ili dvostruki id odbijaju ovjeru', () => {
    const r = (documentId: string, extra: Record<string, unknown> = {}) => ({ documentId, outcome: 'review', integrityFailure: null, ...extra });
    expect(attestationRefusals([r('a'), r('b')])).toEqual([]);
    expect(attestationRefusals([r('a'), r('b', { outcome: 'fail' })])).toEqual(['1 dokumenata ima pad isporuke (outcome fail)']);
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
  const mjerenje = (ids: string[], generatedAt: string, extra: Record<string, unknown> = {}) => ({
    generatedAt,
    generatedFromCommit: 'c'.repeat(40),
    scope: { duplicateDocumentCount: 0 },
    results: ids.map((documentId) => ({
      documentId, profileId: profil, holdout: false, expectationProvenance: 'derived', outcome: 'review',
      statusChanges: [], integrityFailure: null, ...extra,
    })),
  });
  const pokreni = (dir: string, args: string[] = []) => spawnSync(process.execPath, ['scripts/attest-real-corpus.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, LEKTA_ATTEST_INPUT: join(dir, 'mjerenje.json'), LEKTA_ATTEST_OUTPUT: join(dir, 'ovjera.json') },
  });

  it('odbija napuhano i palo mjerenje, a potpis zadrzava samo uz isto mjerenje', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-t83-attest-'));
    try {
      writeFileSync(join(dir, 'mjerenje.json'), JSON.stringify(mjerenje(['corpus-a', 'corpus-a'], '2026-09-20T09:00:00.000Z')));
      const dvostruko = pokreni(dir);
      expect(dvostruko.status).toBe(1);
      expect(dvostruko.stderr).toMatch(/dvostrukih documentId/);

      writeFileSync(join(dir, 'mjerenje.json'), JSON.stringify(mjerenje(['corpus-a'], '2026-09-20T09:00:00.000Z', { outcome: 'fail' })));
      expect(pokreni(dir).status).toBe(1);

      writeFileSync(join(dir, 'mjerenje.json'), JSON.stringify(mjerenje(['corpus-a', 'corpus-b'], '2026-09-20T09:00:00.000Z')));
      expect(pokreni(dir, ['--sign', 'Vlasnik']).status).toBe(0);
      const potpisana = JSON.parse(readFileSync(join(dir, 'ovjera.json'), 'utf8'));
      expect(potpisana.fingerprintVersion).toBe(2);
      expect(potpisana.protocol).toMatchObject({ duplicateDocumentCount: 0, uniqueDocumentCount: 2, rawDocumentCount: 2 });
      expect(attestationProblems(potpisana)).toEqual([]);

      // Ista ovjera ponovljena nad ISTIM mjerenjem zadrzava potpis.
      expect(pokreni(dir).status).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, 'ovjera.json'), 'utf8')).signedBy).toBe('Vlasnik');

      // Novo mjerenje istog skupa (isti otisak, drugo vrijeme) gubi potpis.
      writeFileSync(join(dir, 'mjerenje.json'), JSON.stringify(mjerenje(['corpus-a', 'corpus-b'], '2026-09-20T09:30:00.000Z')));
      expect(pokreni(dir).status).toBe(0);
      const nova = JSON.parse(readFileSync(join(dir, 'ovjera.json'), 'utf8'));
      expect(nova.corpusFingerprint).toBe(potpisana.corpusFingerprint);
      expect(nova.signedBy).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('attestationProblems: dvostruko brojanje i verzija otiska', () => {
  const ovjera = (extra: Record<string, unknown> = {}, protocol: Record<string, unknown> = {}): CorpusAttestation => ({
    schemaVersion: 1,
    corpusFingerprint: 'f'.repeat(32),
    measuredAt: '2026-09-27T15:00:00.000Z',
    measuredFromCommit: 'a'.repeat(40),
    oracles: ['scripts/repair-real-corpus.mts'],
    environment: { wordVersion: null },
    protocol: { holdoutExcluded: true, holdoutDocumentCount: 0, independentlyConfirmedCount: 0, derivedExpectationCount: 1, ...protocol },
    signedBy: 'Vlasnik',
    signedAt: '2026-09-27T16:00:00.000Z',
    signatureNote: null,
    entries: [{ unitId: 'fer', workType: 'graduate', profileIds: ['fer-diplomski'], documentCount: 1, cleanCount: 1, regressedChecks: [] }],
    ...extra,
  } as unknown as CorpusAttestation);

  it('v1 ovjera (bez verzije) ostaje citljiva; dvostruko brojanje je problem', () => {
    expect(attestationProblems(ovjera())).toEqual([]);
    expect(attestationProblems(ovjera({}, { duplicateDocumentCount: 3 }))).toContain('mjerenje je iste dokumente brojalo vise puta');
  });

  it('T83-04: v2 bez uskladjenih brojeva i nepoznata verzija su problem', () => {
    const cista = { duplicateDocumentCount: 0, uniqueDocumentCount: 219, rawDocumentCount: 321 };
    expect(attestationProblems(ovjera({ fingerprintVersion: 2 }, cista))).toEqual([]);
    expect(attestationProblems(ovjera({ fingerprintVersion: 2 }))).toContain('ovjera v2 nema uskladjene brojeve dokumenata');
    expect(attestationProblems(ovjera({ fingerprintVersion: 2 }, { ...cista, rawDocumentCount: 100 }))).toContain('ovjera v2 nema uskladjene brojeve dokumenata');
    expect(attestationProblems(ovjera({ fingerprintVersion: 3 }, cista))).toContain('nepoznata verzija otiska korpusa');
  });
});
