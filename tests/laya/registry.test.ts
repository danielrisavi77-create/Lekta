import { describe, expect, it } from 'vitest';
import committed from '../../scripts/laya/registry.json' with { type: 'json' };
import { loadRegistry, pinnedModel } from '../../scripts/laya/registry.ts';
import { modelDigest } from '../../scripts/laya/contracts-v2.ts';
import { LAYA_FIXTURE_MODEL, makePolicy, makeRuntime } from '../helpers/laya-v2-fixtures.ts';

const entry = (over: Record<string, unknown> = {}) => ({
  key: LAYA_FIXTURE_MODEL, manifest: makeRuntime(), policy: makePolicy(), calibrationEvidence: 'docs/laya/fixture-kalibracija.md', ...over,
});

describe('Laya registar pinanih manifesta i pragova (V2.1)', () => {
  it('commitani registar se ucitava i jos nema nijedan model', () => {
    expect(loadRegistry(JSON.parse(JSON.stringify(committed))).entries).toEqual([]);
  });

  it('valjan unos daje pinani manifest, politiku i modelDigest', () => {
    const r = loadRegistry({ schemaVersion: 1, entries: [entry()] });
    const pinned = pinnedModel(r, LAYA_FIXTURE_MODEL);
    expect(pinned?.modelDigest).toBe(modelDigest(makeRuntime()));
    expect(pinned?.policy?.minAnswerConfidence).toBe(0.5);
    expect(pinnedModel(r, 'nepoznat-kljuc')).toBeNull();
  });

  it('unos bez izmjerenog praga je dopusten i nosi policy null', () => {
    const r = loadRegistry({ schemaVersion: 1, entries: [entry({ policy: null, calibrationEvidence: null })] });
    expect(pinnedModel(r, LAYA_FIXTURE_MODEL)?.policy).toBeNull();
  });

  it.each([
    ['politika za drugi modelDigest', entry({ policy: { ...makePolicy(), modelDigest: 'f'.repeat(64) } })],
    ['politika za drugu kalibracijsku reviziju', entry({ policy: { ...makePolicy(), calibrationRevision: 'cal-drugo' } })],
    ['prag 0', entry({ policy: { ...makePolicy(), minAnswerConfidence: 0 } })],
    ['prag iznad 1', entry({ policy: { ...makePolicy(), minAnswerConfidence: 1.5 } })],
    ['politika bez dokaza mjerenja', entry({ calibrationEvidence: null })],
    ['dokaz bez politike', entry({ policy: null })],
    ['dodatno polje u unosu', { ...entry(), weights: 'x' }],
    ['neispravan kljuc', entry({ key: 'A' })],
    ['neispravan manifest', entry({ manifest: { ...makeRuntime(), precision: 'fp64' } })],
  ])('odbija: %s', (_name, bad) => {
    expect(() => loadRegistry({ schemaVersion: 1, entries: [bad] })).toThrow();
  });

  it('odbija dupli kljuc i dupli modelDigest', () => {
    expect(() => loadRegistry({ schemaVersion: 1, entries: [entry(), entry()] })).toThrow();
    expect(() => loadRegistry({ schemaVersion: 1, entries: [entry(), entry({ key: 'drugi-kljuc' })] })).toThrow();
  });

  it('odbija nepoznatu verziju i dodatna polja korijena', () => {
    expect(() => loadRegistry({ schemaVersion: 2, entries: [] })).toThrow();
    expect(() => loadRegistry({ schemaVersion: 1, entries: [], extra: 1 })).toThrow();
  });
});
