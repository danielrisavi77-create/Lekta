import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { privacyPrijelazHtml, privacyStanje } from '../src/ui/privacy-state';

/**
 * PRIVATNOST KAO STANJE (osma tocka vlasnikova pregleda).
 *
 * Tri stvari se ovdje cuvaju, i sve tri se gube tiho:
 *
 *   1. Stanje se STVARNO mijenja. Znacka koja u oba stanja pise isto nije stanje nego ukras, a
 *      tocno to je bio zatecen slucaj.
 *   2. Prijelaz ne gubi nijednu cinjenicu koju je nosila stara pravnicka recenica. Prepisivanje
 *      copyja u "ljepsi" registar je najlaksi nacin da disclosure nestane, a da nitko ne primijeti.
 *   3. Formulacija u markupu se ne razilazi od modula. Zateceno stanje je bilo CETIRI znaka u TRI
 *      formulacije; jedan izvor istine vrijedi samo dok ga nesto drzi.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Rute se citaju s diska, pa CR mora van: `core.autocrlf` inace mjeri konfiguraciju gita. */
function bezCr(putanja: string): string {
  return readFileSync(putanja, 'utf8').replace(/\r/g, '');
}

describe('dva stanja, i razlika medju njima', () => {
  it('lokalno stanje nosi vlasnikovu formulaciju doslovno', () => {
    expect(privacyStanje('lokalno').znacka).toBe('Lokalno na ovom uređaju');
  });

  it('MUTACIJA: znacka koja se ne mijenja nije stanje', () => {
    // Da su oba stanja jednaka, korisnik ne bi imao nijedan znak da dokument odlazi s uredaja, a
    // ekran bi i dalje izgledao kao da je sve pod kontrolom. Zatecen kvar je bio upravo taj.
    const l = privacyStanje('lokalno');
    const s = privacyStanje('slanje');
    expect(s.znacka).not.toBe(l.znacka);
    expect(s.objasnjenje).not.toBe(l.objasnjenje);
  });

  it('stanje slanja imenuje TKO dobiva dokument, ne samo da se salje', () => {
    // "Salje se" bez primatelja je tocno onaj bezlicni registar koji brif odbija.
    expect(privacyStanje('slanje').znacka).toContain('Lekti');
  });

  it('nepoznata faza pada natrag na lokalno, jer je to sigurniji smjer', () => {
    expect(privacyStanje('nepostojeca' as never).faza).toBe('lokalno');
  });
});

describe('prijelaz ne gubi nijednu cinjenicu', () => {
  const html = privacyPrijelazHtml(esc);

  /**
   * Stara recenica je glasila: "Pristajem da se dokument posalje na server i pohrani do brisanja.
   * Besplatna analiza ostaje na uredaju." Sve sto je tvrdila mora ostati; mekši ton nije razlog za
   * manje informacije, i tu se razlikuje "nije legalisticki" od "nije receno".
   */
  it('kaze da dokument odlazi, i kome', () => {
    expect(html).toContain('Lekti');
  });

  it('kaze da OSTAJE SPREMLJEN dok ga korisnik ne obrise', () => {
    expect(html).toContain('Moji popravci');
    expect(html).toContain('obrišeš');
  });

  it('kaze da besplatna analiza i dalje radi lokalno', () => {
    expect(html).toContain('lokalno');
  });

  it('odgovara na strah zbog kojeg korisnik oklijeva: original se ne mijenja', () => {
    // Ovo je jedina TVRDNJA koju stara recenica nije imala, i jedina zbog koje se korisnik odluci.
    expect(html).toContain('Original na tvom uređaju se ne mijenja');
  });

  it('NE PLASI: bez usklicnika, upozorenja i pravnog registra', () => {
    expect(html).not.toContain('!');
    expect(html.toLowerCase()).not.toContain('upozorenje');
    expect(html.toLowerCase()).not.toContain('pristajem');
  });

  it('nosi kuku po kojoj se blok moze naci u ekranu i u testu', () => {
    expect(html).toContain('data-privacy-prijelaz');
  });
});

describe('markup se ne razilazi od modula', () => {
  const rad = bezCr('rad/index.html');

  it('znacka na /rad/ pise ono sto modul tvrdi', () => {
    expect(rad).toContain(privacyStanje('lokalno').znacka);
  });

  it('MUTACIJA: stare formulacije vise ne postoje', () => {
    // Cetiri znaka u tri formulacije su se prije ili kasnije razisla. Ovo je razlog zasto modul
    // uopce postoji, pa gard mora pasti ako se stara formulacija vrati.
    expect(rad).not.toContain('lock"></i> Lokalno<');
    expect(rad).not.toContain('Lokalna obrada');
  });

  it('oba znaka nose istu kuku, pa se stanje moze mijenjati na jednom mjestu', () => {
    expect(rad.split('data-privacy-badge').length - 1).toBeGreaterThanOrEqual(2);
  });
});
