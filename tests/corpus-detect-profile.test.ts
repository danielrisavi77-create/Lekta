/**
 * Detektor profila pri ulazu stvarnih radova u korpus (src/corpus/detect-profile.ts).
 *
 * Izmjereno 2026-09-05 nad 195 radova iz Downloads: stara pravila su prepoznala 115, a 80 je ostalo bez
 * profila iako 78 ima ustanovu s popisa. Uzroci: padezi ("seminarskog rada"), umetak ("zavrsni strucni rad"),
 * esej i rad kolegija bez rijeci "seminarski". Nova pravila vracaju 48 od tih 80, a nad 115 prepoznatih ne
 * mijenjaju NIJEDNU vrstu. Najvazniji gard je negativan: "diplomski studij" je ime programa, ne vrsta rada.
 */
import { describe, expect, it } from 'vitest';
import { detectCorpusProfile, detectWorkType } from '../src/corpus/detect-profile';

const REGISTAR = [
  { id: 'fpzg-politologija-diplomski', unitId: 'fpzg', workTypes: ['graduate'] },
  { id: 'fpzg-politologija-zavrsni', unitId: 'fpzg', workTypes: ['final'] },
  { id: 'fpzg-opci-akademski-rad', unitId: 'fpzg', workTypes: ['seminar', 'project', 'article'] },
  { id: 'efzg-seminarski', unitId: 'efzg', workTypes: ['seminar'] },
  { id: 'fer-diplomski', unitId: 'fer', workTypes: ['graduate'] },
];
const FPZG = 'Sveučilište u Zagrebu Fakultet političkih znanosti ';

describe('detectWorkType', () => {
  it('nominativ, genitiv i lokativ imenuju rad; umetak do dvije rijeci ne smeta', () => {
    expect(detectWorkType('DIPLOMSKI RAD')).toBe('graduate');
    expect(detectWorkType('Naslov diplomskog rada: Nesto')).toBe('graduate');
    expect(detectWorkType('Naslov seminarskog rada: Nesto')).toBe('seminar');
    expect(detectWorkType('Izjava o završnom radu')).toBe('final');
    expect(detectWorkType('ZAVRŠNI STRUČNI RAD')).toBe('final');
    expect(detectWorkType('Završni prijediplomski rad')).toBe('final');
  });

  it('doktorski i specijalisticki imaju prednost, kao i prije', () => {
    expect(detectWorkType('Doktorska disertacija')).toBe('doctoral');
    expect(detectWorkType('Završni specijalistički rad')).toBe('specialist');
  });

  it('esej je seminar (odluka 2026-09-05: opci akademski rad kolegija)', () => {
    expect(detectWorkType('Esej iz kolegija Politička teorija')).toBe('seminar');
    expect(detectWorkType('ESEJ')).toBe('seminar');
  });

  it('rad kolegija bez rijeci o vrsti je seminar, ali samo kad nijedna fraza rada ne stoji na naslovnici', () => {
    expect(detectWorkType('Kolegij: Znanost o upravljanju. Nositeljica kolegija: doc. dr. sc. A. B.')).toBe('seminar');
    expect(detectWorkType('Diplomski rad. Kolegij: Metodologija')).toBe('graduate');
  });

  it('NEGATIVNA KONTROLA: "diplomski studij" i "preddiplomski studij" su ime programa, ne vrsta rada', () => {
    expect(detectWorkType('Diplomski studij politologije')).toBeNull();
    expect(detectWorkType('Preddiplomski sveučilišni studij novinarstva')).toBeNull();
    expect(detectWorkType('Sveučilišni diplomski studij, smjer Javne politike')).toBeNull();
  });

  it('NEGATIVNA KONTROLA: seminar s naslovnicom koja imenuje diplomski studij NIJE diplomski rad', () => {
    const naslovnica = 'Diplomski studij politologije. Naslov seminarskog rada: Nesto. Kolegij: Politička ekonomija';
    expect(detectWorkType(naslovnica)).toBe('seminar');
    const esej = 'Sveučilišni diplomski studij. Esej. Kolegij: Teorije demokracije';
    expect(detectWorkType(esej)).toBe('seminar');
  });

  it('bez ijednog traga vrste rada vraca null, ne pogadja', () => {
    expect(detectWorkType('Naslov. Ime Prezime. Zagreb, 2026.')).toBeNull();
    expect(detectWorkType('')).toBeNull();
  });
});

describe('detectCorpusProfile', () => {
  it('spaja ustanovu i vrstu rada s profilom iz registra', () => {
    expect(detectCorpusProfile(FPZG + 'Naslov seminarskog rada: X. Kolegij: Y', REGISTAR)).toEqual({
      profileId: 'fpzg-opci-akademski-rad', unitId: 'fpzg', workType: 'seminar',
    });
    expect(detectCorpusProfile(FPZG + 'DIPLOMSKI RAD', REGISTAR)?.profileId).toBe('fpzg-politologija-diplomski');
    expect(detectCorpusProfile('Ekonomski fakultet. Esej iz kolegija Marketing', REGISTAR)?.profileId).toBe('efzg-seminarski');
  });

  it('bez profila u registru za par (ustanova, vrsta) vraca null, ne najblizi profil', () => {
    expect(detectCorpusProfile('Fakultet elektrotehnike i računarstva. Seminarski rad', REGISTAR)).toBeNull();
  });

  it('bez ustanove s popisa vraca null i kad je vrsta rada jasna', () => {
    expect(detectCorpusProfile('Sveučilište u Osijeku, Odjel za fiziku. Diplomski rad', REGISTAR)).toBeNull();
  });
});
