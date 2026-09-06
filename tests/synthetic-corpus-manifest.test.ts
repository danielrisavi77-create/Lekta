/**
 * GARD NAD MANIFESTOM SINTETICKOG KORPUSA (`data/verification/synthetic-corpus-manifest.json`).
 *
 * Tri pitanja, i trece je vaznije od prva dva:
 *
 * 1. Je li commitani artefakt jednak svjezem izracunu (drift).
 * 2. Je li mjerenje netrivijalno (nije prazno, nije jednolicno).
 * 3. IZGOVARA LI izvjestaj svoje rupe. Popis od 720 redaka koji presuti da 444 nema fakultetsko
 *    pravilo izgleda kao puna matrica, a znaci da se vecina korpusa pise po obiteljskom baselineu.
 *    Rupa se zato prikiva BROJKOM: kad se smanji, netko je mora svjesno spustiti, i to je jedini
 *    nacin da napredak bude vidljiv umjesto da se izgubi u velikom broju.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateRows, rulesDigestFor } from '../scripts/corpus-gen/rows.mts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'data', 'verification', 'synthetic-corpus-manifest.json');

interface ManifestRow {
  id: string;
  unitId: string;
  workType: string;
  level: string;
  routedProfileId: string | null;
  wordTarget: number;
  wordTargetSource: string;
  rules: Record<string, unknown>;
}
interface Manifest {
  schemaVersion: number;
  summary: {
    rowCount: number;
    unitCount: number;
    withoutFacultyProfile: number;
    defaultWordTarget: number;
    totalWords: number;
  };
  rows: ManifestRow[];
  generatedAt?: string;
  generatedFromCommit?: string | null;
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;

/**
 * Izmjereno 2026-09-06, i svaka je brojka razlog za odluku, ne ukras.
 *
 * `BEZ_PROFILA` je najvazniji: 443 od 720 redaka nema fakultetski profil, pa se pisu po obiteljskom
 * baselineu. Medju njima postoje samo TRI razlicita skupa pravila, dakle ta 443 dokumenta razlikuju
 * se naslovnicom i prozom, ne oblikovanjem. Ratchet smije samo PADATI: svaki novi fakultetski profil
 * ga spusta, a porast znaci da je profil nestao ili da je rutiranje puklo.
 *
 * Bilo je 444 dok se varijanta nije birala: `fpzg--final--prijediplomski` ima dva kandidata i oba
 * nose varijantu, pa je `resolveDefinition` vracao nista i redak je ispadao kao "bez pravila".
 */
const BEZ_PROFILA_RATCHET = 443;
const OCEKIVANO_REDAKA = 720;

describe('manifest sintetickog korpusa', () => {
  it('commitani artefakt je jednak svjezem izracunu (nije ustajao)', () => {
    const svjeze = enumerateRows().map((r) => ({ ...r, rules: rulesDigestFor(r) }));
    expect(svjeze.length).toBe(manifest.rows.length);
    expect(svjeze.map((r) => r.id)).toEqual(manifest.rows.map((r) => r.id));
    expect(svjeze).toEqual(manifest.rows);
  }, 120_000);

  it('nosi provenijenciju: bez nje se ne zna je li star artefakt ili nov izvor', () => {
    expect(manifest.generatedAt).toBeTruthy();
    expect(manifest.generatedFromCommit === null || typeof manifest.generatedFromCommit === 'string').toBe(true);
  });

  it('mjerenje nije prazno ni jednolicno', () => {
    expect(manifest.summary.rowCount).toBe(OCEKIVANO_REDAKA);
    expect(manifest.summary.unitCount).toBeGreaterThan(130);
    expect(new Set(manifest.rows.map((r) => r.workType)).size).toBeGreaterThan(4);
    expect(new Set(manifest.rows.map((r) => r.level)).size).toBe(3);
  });

  it('svaki redak ima id, jedinicu, vrstu rada, razinu i ciljani opseg', () => {
    for (const r of manifest.rows) {
      expect(r.id, r.id).toBe(`${r.unitId}--${r.workType}--${r.level}`);
      expect(r.wordTarget, r.id).toBeGreaterThan(0);
      expect(['rule', 'default'], r.id).toContain(r.wordTargetSource);
    }
    expect(new Set(manifest.rows.map((r) => r.id)).size).toBe(manifest.rows.length);
  });

  /**
   * Ovo je rupa iz odjeljka 2.1 plana i mora se VIDJETI, ne izgubiti u zbroju: registar ima sedam
   * vrsta rada i nema poslijediplomski seminar, pa seminarski redci gotovo redom padaju na obiteljski
   * baseline. Tvrdnja je zato imenovana po vrsti rada, a ne samo ukupna.
   */
  it('izgovara koliko redaka nema fakultetsko pravilo, po vrsti rada', () => {
    const bezProfila = manifest.rows.filter((r) => r.routedProfileId === null);
    expect(bezProfila.length).toBe(manifest.summary.withoutFacultyProfile);
    expect(
      bezProfila.length,
      'redaka bez fakultetskog profila je poraslo; profil je nestao ili je rutiranje puklo',
    ).toBeLessThanOrEqual(BEZ_PROFILA_RATCHET);

    const seminarski = manifest.rows.filter((r) => r.workType === 'seminar');
    const seminarskiBezProfila = seminarski.filter((r) => r.routedProfileId === null);
    // Vecina seminarskih redaka nema fakultetsko pravilo; kad to prestane biti istina, tvrdnja pada
    // i netko mora primijetiti da su fakulteti seminare poceli propisivati.
    expect(seminarskiBezProfila.length).toBeGreaterThan(seminarski.length * 0.8);
  });

  it('ciljani opseg gotovo nigdje ne dolazi iz pravila, i to artefakt priznaje', () => {
    const izPravila = manifest.rows.filter((r) => r.wordTargetSource === 'rule');
    // Izmjereno: 3 od 720. Pretpostavka se ne smije citati kao fakultetsko pravilo, pa je odvojeno
    // imenovana; kad ovaj broj poraste, profili su dobili opseg i to je dobra vijest koja se vidi.
    expect(izPravila.length).toBeLessThan(20);
    expect(manifest.summary.defaultWordTarget).toBe(manifest.rows.length - izPravila.length);
  });
});
