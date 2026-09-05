/**
 * Detektor profila pri ulazu stvarnih radova u korpus (src/corpus/detect-profile.ts).
 *
 * Izmjereno 2026-09-05 nad 195 radova iz Downloads: stara pravila su prepoznala 115, a 80 je ostalo bez
 * profila iako 78 ima ustanovu s popisa. Uzroci: padezi ("seminarskog rada"), umetak ("zavrsni strucni rad"),
 * esej i rad kolegija bez rijeci "seminarski". Nova pravila vracaju 48 od tih 80, a nad 115 prepoznatih ne
 * mijenjaju NIJEDNU vrstu. Najvazniji gard je negativan: "diplomski studij" je ime programa, ne vrsta rada.
 */
import { describe, expect, it } from 'vitest';
import { detectCorpusProfile, detectWorkType, detectWorkTypeWithSource, workTypeFromFileName } from '../src/corpus/detect-profile';

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
      profileId: 'fpzg-opci-akademski-rad', unitId: 'fpzg', workType: 'seminar', source: 'front',
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

describe('rezerve iza naslovnice (2026-09-05: 17 od 32 rada bez profila)', () => {
  const NASLOVNICA = 'Sveučilište u Zagrebu Fakultet političkih znanosti Naslov rada Ime Prezime Zagreb, 2025.';
  const IZJAVA = 'Izjava o akademskoj čestitosti. Izjavljujem da sam ovaj diplomski rad izradio samostalno.';

  it('izjava ili sazetak iza naslovnice imenuju rad kad naslovnica ne imenuje', () => {
    expect(detectWorkTypeWithSource(NASLOVNICA, { extended: NASLOVNICA + ' ' + IZJAVA })).toEqual({ workType: 'graduate', source: 'lead' });
    expect(detectWorkType(NASLOVNICA, { extended: 'Sažetak. Ovaj završni rad analizira ...' })).toBe('final');
  });

  it('naslovnica ima prednost pred prvim stranicama i imenom datoteke', () => {
    expect(detectWorkTypeWithSource('Naslov seminarskog rada: X', { extended: IZJAVA, fileName: 'diplomski.docx' })).toEqual({ workType: 'seminar', source: 'front' });
  });

  it('u prvim stranicama vrijede samo doslovne fraze rada: esej, kolegij i ime programa ne', () => {
    expect(detectWorkType(NASLOVNICA, { extended: NASLOVNICA + ' Diplomski studij politologije. Kolegij: Uvod. Esej.' })).toBeNull();
  });

  it('ime datoteke je zadnja rezerva; "diplomski_studij" u imenu je program', () => {
    expect(detectWorkTypeWithSource(NASLOVNICA, { fileName: 'ZOU_seminar_ISPRAVLJENO_v4.docx' })).toEqual({ workType: 'seminar', source: 'file-name' });
    expect(workTypeFromFileName('Petak_diplomski.docx')).toBe('graduate');
    expect(workTypeFromFileName('zavrsni_rad_final.docx')).toBe('final');
    expect(workTypeFromFileName('Esej_politicka_teorija.docx')).toBe('seminar');
    expect(workTypeFromFileName('diplomski_studij_raspored.docx')).toBeNull();
    expect(workTypeFromFileName('Naslov rada.docx')).toBeNull();
    // izjava iza naslovnice ima prednost pred imenom datoteke
    expect(detectWorkTypeWithSource(NASLOVNICA, { extended: IZJAVA, fileName: 'seminar.docx' })).toEqual({ workType: 'graduate', source: 'lead' });
  });

  it('profil nosi izvor odluke', () => {
    const p = detectCorpusProfile(NASLOVNICA, REGISTAR, { fileName: 'seminar.docx' });
    expect(p).toEqual({ profileId: 'fpzg-opci-akademski-rad', unitId: 'fpzg', workType: 'seminar', source: 'file-name' });
  });
});
