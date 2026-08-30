/**
 * Jedinicni testovi ciste detekcije profila (BL-P0-05-8): detectContextFromText radi po SVIM
 * institucijama (ne samo unizg), longest-match s guardom, i needsProfileConfirmation predikat.
 * Koristi pravi normalize (isti kao runtime), pa tekst sadrzi nazive doslovno da se poklope.
 */
import { describe, it, expect } from 'vitest';
import { detectContextFromText, needsProfileConfirmation, isConfidentDetection, type DetectUnit } from '../src/ui/profile-detect';

const UNITS: DetectUnit[] = [
  { id: 'fpzg', name: 'Fakultet političkih znanosti', institutionId: 'unizg', institutionName: 'Sveučilište u Zagrebu', programs: ['Politologija', 'Novinarstvo', 'Opći profil'] },
  // Puni sluzbeni nazivi, kakvi doista stoje u katalogu (i kakve je stari kod preskakao).
  { id: 'fpzgx', name: 'Fakultet političkih znanosti Zagreb', institutionId: 'unizg', institutionName: 'Sveučilište u Zagrebu', programs: ['Prijediplomski studij Politologija', 'Diplomski studij Politologija', 'Diplomski studiji Fakulteta političkih znanosti Zagreb'] },
  { id: 'gradri', name: 'Građevinski fakultet u Rijeci', institutionId: 'uniri', institutionName: 'Sveučilište u Rijeci', programs: ['Stručni prijediplomski studij Građevinarstvo', 'Sveučilišni prijediplomski studij Građevinarstvo'] },
  { id: 'unizdhisp', name: 'Odjel za hispanistiku', institutionId: 'unizd', institutionName: 'Sveučilište u Zadru', programs: ['Odjel za hispanistiku i iberske studije (diplomski rad, Zadar)', 'Odjel za zdravstvene studije (diplomski rad, Zadar)'] },
  { id: 'ffri', name: 'Filozofski fakultet u Rijeci', institutionId: 'uniri', institutionName: 'Sveučilište u Rijeci', programs: ['Povijest', 'Opći profil ustanove'] },
  { id: 'ffzg', name: 'Filozofski fakultet', institutionId: 'unizg', institutionName: 'Sveučilište u Zagrebu', programs: ['Filozofija'] },
  // Jedinice cije ime pocinje ZENSKIM pridjevom: njihov lokativ ("Muzickoj akademiji") je bio
  // neprepoznatljiv dok `CASE_ENDINGS` nije imao nastavak `oj`.
  { id: 'muza', name: 'Muzička akademija', institutionId: 'unizg', institutionName: 'Sveučilište u Zagrebu', programs: ['Kompozicija'] },
  { id: 'zsem', name: 'Zagrebačka škola ekonomije i managementa', institutionId: 'zsem', institutionName: 'ZŠEM', programs: ['Ekonomija'] },
];

describe('detectContextFromText', () => {
  it('prepoznaje NON-unizg jedinicu i vraca njezin institutionId (kriterij c)', () => {
    const ctx = detectContextFromText(UNITS, 'Sveučilište u Rijeci, Filozofski fakultet u Rijeci, diplomski rad iz povijesti');
    expect(ctx).not.toBeNull();
    expect(ctx!.institutionId).toBe('uniri');
    expect(ctx!.unitId).toBe('ffri');
    expect(ctx!.workType).toBe('graduate');
    expect(ctx!.program).toBe('Povijest');
  });

  /**
   * SKLONIDBA. Katalog nosi nominativ ("Politologija"), a naslovnica gotovo uvijek genitiv
   * ("Preddiplomski studij Politologije"). Doslovna usporedba je takav tekst promasivala.
   *
   * Mjereno na stvarnom korpusu od 198 radova bez dodijeljenog profila: JEDINICA je bila
   * prepoznata na 89, a program samo na 7. Kako `isConfidentDetection` trazi program, 82
   * upotrebljive detekcije su se bacale.
   */
  it('program se prepoznaje i u genitivu, ne samo u nominativu', () => {
    const ctx = detectContextFromText(
      UNITS,
      'Sveučilište u Zagrebu Fakultet političkih znanosti Preddiplomski studij Politologije Zagreb, lipanj 2026.',
    );
    expect(ctx!.unitId).toBe('fpzg');
    expect(ctx!.program).toBe('Politologija');
  });

  it('vrsta rada se prepoznaje u genitivu ("izrade diplomskog rada")', () => {
    const ctx = detectContextFromText(
      UNITS,
      'Fakultet političkih znanosti. Ova anketa provodi se u svrhu izrade diplomskog rada.',
    );
    expect(ctx!.unitId).toBe('fpzg');
    expect(ctx!.workType).toBe('graduate');
  });

  it('korijen programa ne pogadja nesrodan pojam', () => {
    // "Novinarstvo" -> korijen "novinar"; tekst o novinama ne smije proglasiti studij novinarstva.
    const ctx = detectContextFromText(UNITS, 'Fakultet političkih znanosti, analiza dnevnih novina i portala');
    expect(ctx!.unitId).toBe('fpzg');
    expect(ctx!.program).toBeNull();
  });

  /**
   * PUN SLUZBENI NAZIV STUDIJA. Katalog nosi "Prijediplomski studij Politologija", a stari kod je
   * preskakao SVAKI naziv koji sadrzi rijec "studij". Izmjereno: to je bilo 513 od 726 programa
   * (71%), a za 82 od 134 jedinice preskocilo je SVAKI program, pa te jedinice nikad nisu mogle
   * dati pouzdanu detekciju.
   */
  it('prepoznaje studij iz punog sluzbenog naziva, uz drugi pravopis razine i genitiv', () => {
    const ctx = detectContextFromText(
      UNITS,
      'Fakultet političkih znanosti Zagreb Preddiplomski studij Politologije Zagreb, 2026.',
    );
    expect(ctx!.unitId).toBe('fpzgx');
    expect(ctx!.program).toBe('Prijediplomski studij Politologija');
  });

  it('razina razdvaja dva studija istog imena', () => {
    const ctx = detectContextFromText(
      UNITS,
      'Fakultet političkih znanosti Zagreb Diplomski studij Politologije, diplomski rad.',
    );
    expect(ctx!.program).toBe('Diplomski studij Politologija');
  });

  it('"strucni" i "sveucilisni" studij istog imena se ne mijesaju', () => {
    const ctx = detectContextFromText(
      UNITS,
      'Građevinski fakultet u Rijeci Stručni prijediplomski studij Građevinarstva.',
    );
    expect(ctx!.program).toBe('Stručni prijediplomski studij Građevinarstvo');
  });

  /**
   * Naziv cija je razlikovna jezgra samo IME ustanove ne govori nista o studiju; pogodio bi svaku
   * naslovnicu te ustanove. Izmjereno: takvi nazivi davali su 85 krivih pogodaka na 668 programa.
   */
  it('naziv koji je samo ime ustanove ne postaje prepoznat studij', () => {
    const ctx = detectContextFromText(UNITS, 'Fakultet političkih znanosti Zagreb, diplomski rad.');
    expect(ctx!.unitId).toBe('fpzgx');
    expect(ctx!.program).toBeNull();
  });

  /**
   * Rijec "studije" ovdje je dio naziva polja ("iberske studije"), ne oznaka razine. Rezanje po njoj
   * ostavilo bi jezgru "diplomski rad zadar", koja pogadja SVAKI odjel te ustanove.
   */
  it('ne reze naziv na rijeci "studije" kad ona nije oznaka razine', () => {
    const ctx = detectContextFromText(
      UNITS,
      'Odjel za hispanistiku i iberske studije (diplomski rad, Zadar)',
    );
    expect(ctx!.program).toBe('Odjel za hispanistiku i iberske studije (diplomski rad, Zadar)');
  });

  /**
   * ZENSKI LOKATIV. Naslovnica najcesce glasi "Rad obranjen NA Muzickoj akademiji", a ne u
   * nominativu. Dok `CASE_ENDINGS` nije imao nastavak `oj`, cetiri jedinice (muza, zsem, umas,
   * mapu) bile su u tom obliku posve neprepoznatljive.
   *
   * Promaklo je jer je raniji pokus lokativ tvorio SAMO muskim obrascem (`-om`), pa ta klasa nikad
   * nije ni nastala. Nasao ju je neovisni verifikator vlastitim sklonidbenim generatorom.
   */
  it('zenski pridjev u lokativu se prepoznaje (Muzickoj, Zagrebackoj)', () => {
    const a = detectContextFromText(UNITS, 'Diplomski rad izrađen na Muzičkoj akademiji, 2026.');
    expect(a?.unitId).toBe('muza');
    const b = detectContextFromText(UNITS, 'Rad obranjen na Zagrebačkoj školi ekonomije i managementa.');
    expect(b?.unitId).toBe('zsem');
  });

  it('naziv jedinice se prepoznaje i u kosom padezu', () => {
    const ctx = detectContextFromText(UNITS, 'Rad predan na Filozofskom fakultetu u Rijeci, 2026.');
    expect(ctx!.unitId).toBe('ffri');
  });

  it('longest-match bira duzi naziv kad tekst sadrzi dva naziva jedinice', () => {
    // Tekst sadrzi i "Filozofski fakultet" (ffzg) i "Filozofski fakultet u Rijeci" (ffri, duzi).
    const ctx = detectContextFromText(UNITS, 'Filozofski fakultet u Rijeci, zavrsni rad');
    expect(ctx!.unitId).toBe('ffri');
  });

  it('prepoznaje unizg FPZG i studij Politologija', () => {
    const ctx = detectContextFromText(UNITS, 'Sveučilište u Zagrebu Fakultet političkih znanosti Politologija diplomski rad');
    expect(ctx!.unitId).toBe('fpzg');
    expect(ctx!.institutionId).toBe('unizg');
    expect(ctx!.program).toBe('Politologija');
    expect(ctx!.workType).toBe('graduate');
  });

  it('workType regexi: doktorski/specijalisticki/diplomski/zavrsni/seminarski', () => {
    const t = (s: string) => detectContextFromText(UNITS, 'Fakultet političkih znanosti ' + s)!.workType;
    expect(t('doktorski rad')).toBe('doctoral');
    expect(t('disertacija')).toBe('doctoral');
    expect(t('specijalistički rad')).toBe('specialist');
    expect(t('diplomski rad')).toBe('graduate');
    expect(t('završni rad')).toBe('final');
    expect(t('seminarski rad')).toBe('seminar');
  });

  it('program preskace Opći i genericke nazive te vraca null kad nema pogotka', () => {
    const ctx = detectContextFromText(UNITS, 'Filozofski fakultet u Rijeci seminarski rad');
    // "Opći profil ustanove" se preskace; nijedan drugi program nije u tekstu -> program null.
    expect(ctx!.program).toBeNull();
  });

  it('kratak/neprepoznat naziv se ne matcha (guard) i prazan tekst vraca null bez bacanja', () => {
    expect(detectContextFromText([{ id: 'x', name: 'ABC' }], 'nešto o ABC-u')).toBeNull();
    expect(detectContextFromText(UNITS, '')).toBeNull();
    expect(detectContextFromText(UNITS, 'potpuno nepovezan tekst bez ustanove')).toBeNull();
  });
});

describe('needsProfileConfirmation', () => {
  it('samo verificiran i nepotvrdjen profil trazi potvrdu', () => {
    expect(needsProfileConfirmation('verified', false)).toBe(true);
    expect(needsProfileConfirmation('verified', true)).toBe(false);
    expect(needsProfileConfirmation('generic', false)).toBe(false);
    expect(needsProfileConfirmation('partial', false)).toBe(false);
  });
});

describe('isConfidentDetection', () => {
  it('vraca true samo kad je program stvarno prepoznat', () => {
    const ctx = detectContextFromText(UNITS, 'Sveučilište u Zagrebu Fakultet političkih znanosti Politologija diplomski rad');
    expect(ctx!.program).toBe('Politologija');
    expect(isConfidentDetection(ctx)).toBe(true);
  });

  it('vraca false kad je ustanova/fakultet prepoznat ali program NIJE (regresija: tiha potvrda profila)', () => {
    const ctx = detectContextFromText(UNITS, 'Filozofski fakultet u Rijeci seminarski rad');
    expect(ctx!.unitId).toBe('ffri');
    expect(ctx!.program).toBeNull();
    expect(isConfidentDetection(ctx)).toBe(false);
  });

  it('vraca false za null kontekst (nista prepoznato)', () => {
    expect(isConfidentDetection(null)).toBe(false);
  });
});
