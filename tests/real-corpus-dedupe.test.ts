/**
 * T83: jedan dokument, jedan glas. Isti `documentId` iz vise korijena korpusa mjeri se jednom;
 * isti id s razlicitim sadrzajem ili profilom rusi mjerenje; ovjera prijavljuje dvostruko brojanje.
 */
import { describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dedupeManifest, discoverRealCorpus, REAL_CORPUS_ROOT, type RealCorpusManifestEntry } from './real-corpus/harness';
import { attestationProblems, type CorpusAttestation } from '../src/verification/real-corpus-attestation';
import { createHash } from 'node:crypto';
import { FINGERPRINT_VERSION, corpusFingerprintV2, inheritedSignature } from '../scripts/lib/corpus-attestation-core.mjs';

const entry = (documentId: string, root: string, profileId = 'fer-diplomski'): RealCorpusManifestEntry => ({
  documentId,
  fileName: `${documentId}.docx`,
  profileId,
  root,
  holdout: false,
  expectationProvenance: 'derived',
});
const bytes = (map: Record<string, string>) => (e: RealCorpusManifestEntry) =>
  new TextEncoder().encode(map[`${e.root}/${e.documentId}`] ?? 'isto');

describe('dedupeManifest', () => {
  it('ista datoteka iz dva korijena broji se jednom, zadrzava se prva pojava', () => {
    const { entries, duplicates } = dedupeManifest(
      [entry('a', 'docx'), entry('b', 'local'), entry('a', 'local'), entry('b', 'ingest'), entry('c', 'ingest')],
      bytes({}),
    );
    expect(entries.map((e) => `${e.root}/${e.documentId}`)).toEqual(['docx/a', 'local/b', 'ingest/c']);
    expect(duplicates).toEqual([
      { documentId: 'a', roots: ['docx', 'local'] },
      { documentId: 'b', roots: ['local', 'ingest'] },
    ]);
  });

  it('tri kopije istog rada daju jedan unos i dvije izbacene kopije', () => {
    const { entries, duplicates } = dedupeManifest([entry('a', 'r1'), entry('a', 'r2'), entry('a', 'r3')], bytes({}));
    expect(entries).toHaveLength(1);
    expect(duplicates[0].roots).toEqual(['r1', 'r2', 'r3']);
  });

  it('bez duplikata manifest ostaje isti i nista se ne cita', () => {
    const ulaz = [entry('a', 'r'), entry('b', 'r')];
    const { entries, duplicates } = dedupeManifest(ulaz, () => {
      throw new Error('ne smije citati');
    });
    expect(entries).toEqual(ulaz);
    expect(duplicates).toEqual([]);
  });

  it('isti id s razlicitim sadrzajem ili profilom nije duplikat nego kvar i baca', () => {
    expect(() =>
      dedupeManifest([entry('a', 'r1'), entry('a', 'r2')], bytes({ 'r1/a': 'jedno', 'r2/a': 'drugo' })),
    ).toThrow(/razlicitim sadrzajem ili profilom/);
    expect(() =>
      dedupeManifest([entry('a', 'r1', 'fer-diplomski'), entry('a', 'r2', 'fpzg-diplomski')], bytes({})),
    ).toThrow(/razlicitim sadrzajem ili profilom/);
  });

  it('stvarni korijeni na disku: kopija commitane fixture u dva direktorija daje jedan unos', () => {
    const docx = readdirSync(REAL_CORPUS_ROOT).filter((f) => f.endsWith('.docx'));
    const izvor = discoverRealCorpus(REAL_CORPUS_ROOT)[0];
    expect(izvor, 'commitani korpus mora imati bar jedan dopusten dokument').toBeDefined();
    const r1 = mkdtempSync(join(tmpdir(), 'lekta-dedupe-a-'));
    const r2 = mkdtempSync(join(tmpdir(), 'lekta-dedupe-b-'));
    try {
      for (const r of [r1, r2]) {
        copyFileSync(join(REAL_CORPUS_ROOT, izvor.fileName), join(r, izvor.fileName));
        copyFileSync(join(REAL_CORPUS_ROOT, izvor.fileName.replace(/\.docx$/, '.json')), join(r, izvor.fileName.replace(/\.docx$/, '.json')));
      }
      const spoj = [...discoverRealCorpus(r1), ...discoverRealCorpus(r2)];
      // Generator proizvodi ciljanu klasu: isti id, isti bajtovi, dva korijena.
      expect(spoj.map((e) => e.documentId)).toEqual([izvor.documentId, izvor.documentId]);
      expect(readFileSync(join(r1, izvor.fileName)).equals(readFileSync(join(r2, izvor.fileName)))).toBe(true);
      const { entries, duplicates } = dedupeManifest(spoj);
      expect(entries).toHaveLength(1);
      expect(resolve(entries[0].root ?? '')).toBe(resolve(r1));
      expect(duplicates).toHaveLength(1);
      expect(docx.length).toBeGreaterThan(0);
    } finally {
      rmSync(r1, { recursive: true, force: true });
      rmSync(r2, { recursive: true, force: true });
    }
  });
});

describe('otisak v2 i nasljedjivanje potpisa', () => {
  const ids = ['corpus-a', 'corpus-b', 'corpus-c'];
  const v1 = (list: string[]) => createHash('sha256').update([...list].sort().join('\n')).digest('hex').slice(0, 32);

  it('v2 ne ovisi o ponavljanju ni redoslijedu, a nikad nije jednak v1', () => {
    expect(corpusFingerprintV2([...ids, 'corpus-a', 'corpus-b'])).toBe(corpusFingerprintV2(ids));
    expect(corpusFingerprintV2([...ids].reverse())).toBe(corpusFingerprintV2(ids));
    expect(corpusFingerprintV2(ids)).not.toBe(v1(ids));
    // v1 je vidio ponavljanja: upravo zato je dvostruko brojani skup dao drugaciji broj, a isti otisak kao potpisani.
    expect(v1([...ids, 'corpus-a'])).not.toBe(v1(ids));
  });

  const potpisana = {
    fingerprintVersion: FINGERPRINT_VERSION,
    corpusFingerprint: corpusFingerprintV2(ids),
    signedBy: 'Vlasnik',
    signedAt: '2026-09-28T10:00:00.000Z',
    signatureNote: null,
  };

  it('isto potpisano mjerenje zadrzava potpis', () => {
    expect(inheritedSignature(potpisana, { fingerprintVersion: 2, corpusFingerprint: potpisana.corpusFingerprint, measuredAt: '2026-09-28T09:00:00.000Z' }))
      .toEqual({ signedBy: 'Vlasnik', signedAt: potpisana.signedAt, signatureNote: null });
  });

  it('novo mjerenje istog skupa, drugi skup ili v1 ovjera NE nasljedjuju potpis', () => {
    const iste = { fingerprintVersion: 2, corpusFingerprint: potpisana.corpusFingerprint };
    expect(inheritedSignature(potpisana, { ...iste, measuredAt: '2026-09-29T09:00:00.000Z' })).toBeNull();
    expect(inheritedSignature(potpisana, { ...iste, corpusFingerprint: corpusFingerprintV2(['x']), measuredAt: '2026-09-28T09:00:00.000Z' })).toBeNull();
    // Stvarni slucaj: potpisana v1 ovjera a74d93d5 (bez fingerprintVersion), isti v1 otisak.
    const staraV1 = { corpusFingerprint: '8e5bd529d4f2b596ccf8fa0ef58c029d', signedBy: 'Daniel', signedAt: '2026-09-12T22:00:26.856Z' };
    expect(inheritedSignature(staraV1, { fingerprintVersion: 2, corpusFingerprint: '8e5bd529d4f2b596ccf8fa0ef58c029d', measuredAt: '2026-09-10T08:28:07.311Z' })).toBeNull();
    expect(inheritedSignature(null, { ...iste, measuredAt: '2026-09-28T09:00:00.000Z' })).toBeNull();
  });
});

describe('attestationProblems: dvostruko brojanje', () => {
  const ovjera = (duplicateDocumentCount?: number): CorpusAttestation => ({
    schemaVersion: 1,
    corpusFingerprint: 'f'.repeat(32),
    measuredAt: '2026-09-27T15:00:00.000Z',
    measuredFromCommit: 'a'.repeat(40),
    oracles: ['scripts/repair-real-corpus.mts'],
    environment: { wordVersion: null },
    protocol: {
      holdoutExcluded: true,
      holdoutDocumentCount: 0,
      independentlyConfirmedCount: 0,
      derivedExpectationCount: 1,
      ...(duplicateDocumentCount === undefined ? {} : { duplicateDocumentCount }),
    },
    signedBy: 'Vlasnik',
    signedAt: '2026-09-27T16:00:00.000Z',
    signatureNote: null,
    entries: [{ unitId: 'fer', workType: 'graduate', profileIds: ['fer-diplomski'], documentCount: 1, cleanCount: 1, regressedChecks: [] }],
  } as unknown as CorpusAttestation);

  it('ovjera s dvostruko brojanim dokumentima ima problem, cista i starija bez polja nemaju', () => {
    expect(attestationProblems(ovjera(3))).toContain('mjerenje je iste dokumente brojalo vise puta');
    expect(attestationProblems(ovjera(0))).toEqual([]);
    expect(attestationProblems(ovjera(undefined))).toEqual([]);
  });
});
