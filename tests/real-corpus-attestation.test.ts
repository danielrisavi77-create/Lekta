import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { attestationProblems, provenProfiles, type CorpusAttestation } from '../src/verification/real-corpus-attestation';

/**
 * Gard nad ovjerom dokaza na stvarnim radovima.
 *
 * Ovjera postoji da razina `A` prestane biti nedostizna po konstrukciji: dokaz nastaje nad tudjim
 * studentskim radovima, koji ne smiju u repozitorij, pa u njega ulazi POTPISANA tvrdnja o mjerenju.
 * Zato je najvazniji dio ovog garda ono sto ovjera NE smije uciniti: povecati razinu dokaza bez
 * ljudskog potpisa, ili unatoc nadjenoj regresiji.
 */

const OSNOVA: CorpusAttestation = {
  schemaVersion: 1,
  corpusFingerprint: 'abc123',
  measuredAt: '2026-09-03T00:00:00.000Z',
  measuredFromCommit: 'a'.repeat(40),
  oracles: ['harness'],
  signedBy: 'Netko',
  signedAt: '2026-09-03T00:00:00.000Z',
  entries: [
    { profileId: 'p-cist', workType: 'graduate', documentCount: 3, cleanCount: 3, regressedChecks: [] },
    { profileId: 'p-regresija', workType: 'graduate', documentCount: 3, cleanCount: 2, regressedChecks: ['structure.heading.hierarchy'] },
    { profileId: 'p-prazan', workType: 'graduate', documentCount: 0, cleanCount: 0, regressedChecks: [] },
  ],
};

describe('ovjera: sto se priznaje kao dokaz', () => {
  it('potpisana ovjera dokazuje samo profile bez regresije i s barem jednim cistim radom', () => {
    const d = provenProfiles(OSNOVA);
    expect([...d]).toEqual(['p-cist::graduate']);
  });

  it('regresija ponistava dokaz, jer mjerenje koje nadje regresiju NIJE dokaz da popravak radi', () => {
    expect(provenProfiles(OSNOVA).has('p-regresija::graduate')).toBe(false);
  });

  it('mjerenje nad nula dokumenata nije dokaz', () => {
    expect(provenProfiles(OSNOVA).has('p-prazan::graduate')).toBe(false);
  });
});

describe('ovjera: kad NE vrijedi', () => {
  it('bez potpisa ne vrijedi nista, ma koliko cistih mjerenja imala', () => {
    const bez = { ...OSNOVA, signedBy: null, signedAt: null };
    expect(attestationProblems(bez)).toContain('nije potpisana');
    expect(provenProfiles(bez).size, 'nepotpisana ovjera ne smije dokazati nijedan profil').toBe(0);
  });

  it('bez navedenih alata mjerenja ne vrijedi', () => {
    expect(provenProfiles({ ...OSNOVA, oracles: [] }).size).toBe(0);
  });

  it('bez otiska korpusa ili commita ne vrijedi', () => {
    expect(provenProfiles({ ...OSNOVA, corpusFingerprint: '' }).size).toBe(0);
    expect(provenProfiles({ ...OSNOVA, measuredFromCommit: null }).size).toBe(0);
  });

  it('ovjere koje nema nije isto sto i prazna ovjera', () => {
    expect(attestationProblems(null)).toEqual(['ovjere nema']);
    expect(provenProfiles(null).size).toBe(0);
  });
});

describe('ovjera u repozitoriju', () => {
  const put = path.resolve(__dirname, '..', 'data', 'verification', 'real-corpus-attestation.json');

  it('postoji i ne nosi NISTA iz dokumenata', () => {
    expect(fs.existsSync(put), 'ovjera mora postojati, makar nepotpisana').toBe(true);
    const sirovo = fs.readFileSync(put, 'utf8');
    // Ovjera smije nositi brojke, imena profila i imena provjera; nikad naziv datoteke ni sadrzaj.
    expect(sirovo, 'naziv dokumenta je zavrsio u ovjeri').not.toMatch(/\.docx/i);
    expect(sirovo, 'ovjera ne smije nositi tekst rada').not.toMatch(/paragraphs|preview|text"/i);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno ono zbog cega ovjera postoji:
   * potpisana tvrdnja koja bi dokazala profil unatoc nadjenoj regresiji.
   */
  it('gard stvarno grize', () => {
    const cisto = provenProfiles(OSNOVA);
    expect(cisto.size, 'baseline je izmjeren, ne pretpostavljen').toBe(1);
    const mutiran: CorpusAttestation = {
      ...OSNOVA,
      entries: OSNOVA.entries.map((e) => (e.profileId === 'p-regresija' ? { ...e, regressedChecks: [] } : e)),
    };
    expect(provenProfiles(mutiran).size, 'uklonjena regresija mora promijeniti ishod').toBe(2);
  });
});
