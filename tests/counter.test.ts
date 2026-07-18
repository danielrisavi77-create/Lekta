import { describe, it, expect } from 'vitest';
import { countText, ZNAKOVA_PO_KARTICI } from '../src/tools/counter';

describe('countText', () => {
  it('prazan tekst daje sve nule', () => {
    const m = countText('');
    expect(m).toMatchObject({ words: 0, charsWithSpaces: 0, charsWithoutSpaces: 0, kartice: 0, pages: 0, sentences: 0, paragraphs: 0, readingMinutes: 0 });
  });

  it('sami razmaci: nema sadrzaja pa je i stranica 0 (bez laznog "1")', () => {
    const m = countText('   ');
    expect(m).toMatchObject({ words: 0, sentences: 0, paragraphs: 0, pages: 0, kartice: 0 });
  });

  it('broji rijeci i znakove s razmacima i bez', () => {
    const m = countText('Ana ima macku.');
    expect(m.words).toBe(3);
    expect(m.charsWithSpaces).toBe('Ana ima macku.'.length);
    expect(m.charsWithoutSpaces).toBe('Anaimamacku.'.length);
  });

  it('hrvatski dijakritici se broje kao jedan znak', () => {
    const m = countText('čćšžđ');
    expect(m.charsWithoutSpaces).toBe(5);
  });

  it('prijelomi retka se ne broje u znakove, ali dijele odlomke', () => {
    const m = countText('Prvi odlomak.\n\nDrugi odlomak.');
    expect(m.paragraphs).toBe(2);
    expect(m.charsWithSpaces).toBe('Prvi odlomak.Drugi odlomak.'.length); // prijelomi se ne broje
  });

  it('kartica = znakovi s razmacima / 1800', () => {
    const text = 'a'.repeat(ZNAKOVA_PO_KARTICI);
    const m = countText(text);
    expect(m.charsWithSpaces).toBe(1800);
    expect(m.kartice).toBe(1);
    expect(m.pages).toBe(1);
  });

  it('karticeFrom radi i za alternativnu mjeru (1500 bez razmaka) s istim float-sigurnim zaokruzivanjem', async () => {
    const { karticeFrom } = await import('../src/tools/counter');
    expect(karticeFrom(1500, 1500)).toBe(1);
    expect(karticeFrom(750, 1500)).toBe(0.5);
    // Pola stotinke na 1500 osnovici: 15n+7.5 nije cijeli broj pa uzmi 1507.5 -> nemoguce;
    // ekvivalent 18n+9 slucaja: 3015/1500 = 2.01 tocno, a 2258/1500 = 1.505333 -> 1.51.
    expect(karticeFrom(3015, 1500)).toBe(2.01);
    expect(karticeFrom(2258, 1500)).toBe(1.51);
  });

  it('BUG: 1809 znakova (tocno 1,005 kartica) se zaokruzuje NAGORE na 1,01, ne nadole na 1,00', () => {
    // IEEE-754 double: 1809/1800 se cesto pohrani kao 1.00499999999999989, pa naivni
    // Math.round(x*100)/100 pada na pogresnu (nizu) stranu. Racunanje preko cijelog
    // broja (charsWithSpaces*100) prije dijeljenja to zaobilazi.
    const m = countText('a'.repeat(1809));
    expect(m.charsWithSpaces).toBe(1809);
    expect(m.kartice).toBe(1.01);
  });

  it('pola kartice se zaokruzi na jednu stranicu', () => {
    const m = countText('a'.repeat(900));
    expect(m.kartice).toBe(0.5);
    expect(m.pages).toBe(1);
  });

  it('broji recenice po zavrsnoj interpunkciji, minimalno jedna za tekst', () => {
    expect(countText('Jedan. Dva! Tri?').sentences).toBe(3);
    expect(countText('Bez tocke na kraju').sentences).toBe(1);
  });

  it('kratice ne napuhavaju broj recenica', () => {
    expect(countText('Rad je napisao dr. sc. Ivan Ivić.').sentences).toBe(1);
    expect(countText('Vidi npr. tab. 3 i sl.').sentences).toBe(1);
    expect(countText('Prva rečenica. Druga rečenica.').sentences).toBe(2);
  });

  it('decimale i redni brojevi ne broje se kao kraj recenice', () => {
    expect(countText('Uzorak iznosi 3.5 kg.').sentences).toBe(1);
    expect(countText('Obranjeno 2. svibnja 2020. godine.').sentences).toBe(1);
    expect(countText('Cijena je 1.250,00 eura.').sentences).toBe(1);
  });

  it('dijakriticka kratica "čl." se neutralizira (pravna domena)', () => {
    // Prije popravka je ASCII \b padao ispred č pa se "čl." brojao kao kraj recenice.
    expect(countText('U čl. 5 stoji zabrana.').sentences).toBe(1);
    expect(countText('Prema čl. 3 i čl. 4 ovoga Zakona vrijedi pravilo.').sentences).toBe(1);
  });

  it('leksicka kratica na kraju recenice broji granicu (ne podbraja)', () => {
    // "itd."/"sl." iza kojih slijedi veliko slovo su stvarni kraj recenice.
    expect(countText('Kupili smo jabuke, kruške itd. Vratili smo se kući.').sentences).toBe(2);
    expect(countText('Ima voća, povrća i sl. Zatim smo otišli.').sentences).toBe(2);
    // ali ista kratica usred recenice (malo slovo iza) ne broji granicu.
    expect(countText('Ima jabuka, krušaka itd. u kolicama.').sentences).toBe(1);
  });

  it('tocke unutar URL-a se ne broje kao recenice', () => {
    expect(countText('Posjeti www.example.com za više.').sentences).toBe(1);
    expect(countText('Izvor: https://hrcak.srce.hr/12345 dostupan je.').sentences).toBe(1);
    // URL neposredno prije kraja recenice: zavrsna tocka ostaje terminator.
    expect(countText('Idi na www.x.com. Zatim se vrati.').sentences).toBe(2);
  });

  it('procjena vremena citanja raste s brojem rijeci', () => {
    const m = countText(Array.from({ length: 400 }, () => 'rijec').join(' '));
    expect(m.words).toBe(400);
    expect(m.readingMinutes).toBe(2);
  });

  it('kratica "sv." pred velikim imenom se neutralizira (audit: LEX lookahead ju je sustavno promasivao)', () => {
    expect(countText('Crkva sv. Marka je stara.').sentences).toBe(1);
    expect(countText('Idem u crkvu sv. Ivana danas.').sentences).toBe(1);
  });

  it('"vidi" je puna rijec, ne kratica: "Vidi." na kraju recenice broji granicu', () => {
    expect(countText('Dođi. Vidi.').sentences).toBe(2);
    expect(countText('Vidi npr. tab. 3 i sl.').sentences).toBe(1); // "vidi" bez vlastite tocke i dalje ok
  });

  it('e-mail adrese i gole domene ne broje se kao kraj recenice', () => {
    expect(countText('Kontakt ivan@example.com danas.').sentences).toBe(1);
    expect(countText('Posjeti Google.com za pretragu.').sentences).toBe(1);
    expect(countText('Stranica primjer.hr ima upute.').sentences).toBe(1);
  });

  it('tocka pred velikim slovom bez razmaka ostaje granica (tipfeler, ne domena)', () => {
    expect(countText('Kraj.Novi pocetak je tu.').sentences).toBe(2);
  });

  it('numerirano nabrajanje na pocetku retka ne napuhuje recenice, ni pred velikim slovom', () => {
    expect(countText('1. Uvod\n2. Razrada\n3. Zaključak').sentences).toBe(1);
    expect(countText('1. stavka\n2. stavka').sentences).toBe(1);
    // godina koja legitimno zavrsava recenicu usred retka ostaje granica
    expect(countText('Godina 1990. Danas je drugačije.').sentences).toBe(2);
  });

  it('CRLF ulaz se normalizira: prijelomi se ne broje u znakove, odlomci rade', () => {
    const m = countText('Prvi.\r\n\r\nDrugi.');
    expect(m.charsWithSpaces).toBe('Prvi.Drugi.'.length);
    expect(m.paragraphs).toBe(2);
    expect(m.sentences).toBe(2);
  });

  it('zero-width znakovi i BOM se ne broje ni u jednu metriku znakova', () => {
    const m = countText('﻿a​b');
    expect(m.charsWithSpaces).toBe(2);
    expect(m.charsWithoutSpaces).toBe(2);
  });

  it('emoji (astralni znak) broji se kao jedan znak, ne dva code unita', () => {
    const m = countText('a😀b');
    expect(m.charsWithSpaces).toBe(3);
    expect(m.charsWithoutSpaces).toBe(3);
  });

  it('procjena A4 stranica: prored 1,5, ~2600 znakova po stranici', () => {
    // Djelitelj /2 je odgovarao jednostrukom proredu i podbrajao stranice; sada je osnovica 2600.
    expect(countText('a'.repeat(7200)).pages).toBe(3); // 7200/2600 -> 3 A4 stranice (prored 1,5)
    expect(countText('a'.repeat(1800)).pages).toBe(1); // 1 kartica ~ 2/3 stranice -> 1
    expect(countText('a'.repeat(18000)).pages).toBe(7); // 10 kartica -> 7 stranica
  });

  it('kratki ne-prazan tekst ima minimalno 0.1 min citanja, ne 0', () => {
    expect(countText('Samo tri riječi.').readingMinutes).toBe(0.1);
  });

  it('grupirana zavrsna interpunkcija, trotocka i LEX kratica na samom kraju', () => {
    expect(countText('Što?! Zaista?').sentences).toBe(2);
    expect(countText('Kraj misli… Nova misao.').sentences).toBe(2);
    expect(countText('Kupili smo jabuke itd.').sentences).toBe(1);
  });

  it('NFD (dekomponirani) dijakritici daju isti broj znakova kao NFC (audit #1)', () => {
    // Bez .normalize(NFC) se osnovno slovo + kombinirajuci znak brojalo kao 2, pa je isti
    // vidljivi tekst iz NFD izvora (macOS, neki PDF/CMS) napuhivao karticu.
    const nfc = countText('riječ');
    const nfd = countText('riječ'.normalize('NFD'));
    expect(nfc.charsWithSpaces).toBe(5);
    expect(nfd.charsWithSpaces).toBe(5);
    expect(nfd.kartice).toBe(nfc.kartice);
  });

  it('meki prijelom (U+00AD) i word joiner (U+2060) su nevidljivi, ne broje se (audit #7)', () => {
    expect(countText('a\u00ADb').charsWithSpaces).toBe(2);
    expect(countText('a\u2060b').charsWithSpaces).toBe(2);
  });

  it('vodeci/zavrsni razmaci i prazni redovi ne napuhuju naplatnu karticu (audit #4/#22)', () => {
    // Cist whitespace oko sadrzaja se ne naplacuje: kartice se racunaju iz trimanog teksta.
    expect(countText('Rad.' + ' '.repeat(1800)).charsWithSpaces).toBe(4);
    expect(countText('Rad.' + ' '.repeat(1800)).kartice).toBe(countText('Rad.').kartice);
    expect(countText('x' + ' '.repeat(1799)).kartice).toBe(0);
    expect(countText('   '.repeat(600)).kartice).toBe(0);
  });

  it('NBSP nosi sadrzaj pa ulazi u "znakove bez razmaka" (audit #26)', () => {
    expect(countText('10 kg').charsWithoutSpaces).toBe(5);
  });

  it('samostalna interpunkcija nije rijec; em/en crtica bez razmaka razdvaja (audit #11/#12/#20)', () => {
    expect(countText('prva - druga').words).toBe(2); // samostalna crtica nije rijec
    expect(countText('rijec—rijec').words).toBe(2); // em crtica bez razmaka razdvaja
    expect(countText('dobro-poznat pojam').words).toBe(2); // spojnica ostaje jedna rijec
    expect(countText('.').words).toBe(0);
    expect(countText('...').words).toBe(0);
    expect(countText('. . .').words).toBe(0);
  });

  it('cista interpunkcija nema vremena citanja (audit #20)', () => {
    expect(countText('...').readingMinutes).toBe(0);
  });

  it('tekst ispod jedne minute se ne zaokruzuje na "1 min" (audit #21)', () => {
    const m = countText(Array.from({ length: 190 }, () => 'r').join(' '));
    expect(m.words).toBe(190);
    expect(m.readingMinutes).toBe(0.9); // 0,95 min ostaje ispod 1
  });

  it('raspon brojeva s crticom ne cijepa recenicu (audit #3)', () => {
    expect(countText('Vidi str. 10.-20. za dokaz.').sentences).toBe(1);
    expect(countText('Razdoblje 2020.-2024. bilo je burno.').sentences).toBe(1);
  });

  it('terminator ispred zatvarajuceg navodnika kad se recenica nastavlja (audit #10)', () => {
    expect(countText('Pitao je: Zašto?" i otišao.').sentences).toBe(1);
    // veliko slovo iza zatvorenog navodnika ostaje granica recenice
    expect(countText('Rekao je: Idi." Zatim je otišao.').sentences).toBe(2);
  });
});
