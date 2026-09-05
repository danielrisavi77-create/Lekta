import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { attestationProblems, provenUnitWorkTypes, type CorpusAttestation } from '../src/verification/real-corpus-attestation';

/**
 * Gard nad ovjerom dokaza na stvarnim radovima. Granularnost je JEDINICA x VRSTA RADA (odluka
 * vlasnika 2026-09-05); `profileIds` biljezi iz kojih je profila dokaz stvarno dosao.
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
    { unitId: 'u-cist', workType: 'graduate', profileIds: ['p-cist'], documentCount: 3, cleanCount: 3, regressedChecks: [] },
    { unitId: 'u-regresija', workType: 'graduate', profileIds: ['p-regresija'], documentCount: 3, cleanCount: 2, regressedChecks: ['structure.heading.hierarchy'] },
    { unitId: 'u-prazan', workType: 'graduate', profileIds: ['p-prazan'], documentCount: 0, cleanCount: 0, regressedChecks: [] },
  ],
};

describe('ovjera: sto se priznaje kao dokaz', () => {
  it('potpisana ovjera dokazuje samo profile bez regresije i s barem jednim cistim radom', () => {
    const d = provenUnitWorkTypes(OSNOVA);
    expect([...d]).toEqual(['u-cist::graduate']);
  });

  it('regresija ponistava dokaz, jer mjerenje koje nadje regresiju NIJE dokaz da popravak radi', () => {
    expect(provenUnitWorkTypes(OSNOVA).has('u-regresija::graduate')).toBe(false);
  });

  it('mjerenje nad nula dokumenata nije dokaz', () => {
    expect(provenUnitWorkTypes(OSNOVA).has('u-prazan::graduate')).toBe(false);
  });
});

describe('ovjera: kad NE vrijedi', () => {
  it('bez potpisa ne vrijedi nista, ma koliko cistih mjerenja imala', () => {
    const bez = { ...OSNOVA, signedBy: null, signedAt: null };
    expect(attestationProblems(bez)).toContain('nije potpisana');
    expect(provenUnitWorkTypes(bez).size, 'nepotpisana ovjera ne smije dokazati nijedan profil').toBe(0);
  });

  it('POTPIS STARIJI OD MJERENJA ne vrijedi, jer ovjerava brojke koje jos nisu postojale', () => {
    // Izmjereno 2026-09-04 na stvarnoj ovjeri: potpis 21:50, mjerenje 23:04. Datoteka je tvrdila da
    // je covjek ovjerio brojke koje u trenutku potpisa nisu postojale. Nijedna dotadasnja provjera
    // to nije vidjela, jer su sve gledale POSTOJI li potpis, nikad sto pokriva.
    const unatrag = { ...OSNOVA, signedAt: '2026-09-03T21:50:42.798Z', measuredAt: '2026-09-03T23:04:26.992Z' };
    expect(attestationProblems(unatrag)).toContain('potpis je stariji od mjerenja koje pokriva');
    expect(provenUnitWorkTypes(unatrag).size, 'ovjera s potpisom unatrag ne smije dokazati nijedan profil').toBe(0);
  });

  it('ovjera BEZ VREMENA MJERENJA ne vrijedi, jer potpis onda ne pokriva nista odredjeno', () => {
    // Bez `measuredAt` gard "potpis stariji od mjerenja" nema sto usporediti i tiho prolazi; zato je
    // odsutnost sama po sebi problem. Neparsabilan niz je isti slucaj u drugom ruhu.
    for (const measuredAt of ['', 'jucer'] as const) {
      const bez = { ...OSNOVA, measuredAt };
      expect(attestationProblems(bez)).toContain('nema vremena mjerenja');
      expect(provenUnitWorkTypes(bez).size, `measuredAt=${JSON.stringify(measuredAt)}`).toBe(0);
    }
    expect(attestationProblems(OSNOVA)).not.toContain('nema vremena mjerenja');
  });

  it('potpis ISTOVREMEN s mjerenjem vrijedi, jer granica ne smije biti stroza nego sto tvrdi', () => {
    // Bez ove tvrdnje bi se `<` i `<=` mogli zamijeniti a da to nitko ne primijeti; ovjera potpisana
    // u istoj milisekundi je uredna.
    const isti = { ...OSNOVA, signedAt: '2026-09-03T23:04:26.992Z', measuredAt: '2026-09-03T23:04:26.992Z' };
    expect(attestationProblems(isti)).not.toContain('potpis je stariji od mjerenja koje pokriva');
  });

  it('bez navedenih alata mjerenja ne vrijedi', () => {
    expect(provenUnitWorkTypes({ ...OSNOVA, oracles: [] }).size).toBe(0);
  });

  it('bez otiska korpusa ili commita ne vrijedi', () => {
    expect(provenUnitWorkTypes({ ...OSNOVA, corpusFingerprint: '' }).size).toBe(0);
    expect(provenUnitWorkTypes({ ...OSNOVA, measuredFromCommit: null }).size).toBe(0);
  });

  it('ovjere koje nema nije isto sto i prazna ovjera', () => {
    expect(attestationProblems(null)).toEqual(['ovjere nema']);
    expect(provenUnitWorkTypes(null).size).toBe(0);
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
    const cisto = provenUnitWorkTypes(OSNOVA);
    expect(cisto.size, 'baseline je izmjeren, ne pretpostavljen').toBe(1);
    const mutiran: CorpusAttestation = {
      ...OSNOVA,
      entries: OSNOVA.entries.map((e) => (e.unitId === 'u-regresija' ? { ...e, regressedChecks: [] } : e)),
    };
    expect(provenUnitWorkTypes(mutiran).size, 'uklonjena regresija mora promijeniti ishod').toBe(2);
  });
});
