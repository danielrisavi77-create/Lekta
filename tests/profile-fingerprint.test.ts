import { describe, expect, it } from 'vitest';
import { hashString, profileFingerprint } from '../src/profiles/profile-fingerprint';
import { APP_VERSION } from '../src/config/app-version';

/**
 * OTISAK PRAVILA PROFILA: selidba iz `app.ts` mora biti BAJT-IDENTICNA (korak A2, 2026-09-10).
 *
 * ZASTO PRIKOVANE VRIJEDNOSTI, a ne samo "funkcija radi": otisci vec zive izvan koda. Stoje u
 * spremljenoj povijesti (`lekta.history.v2`), u `result.details.profileFingerprint`, i putuju do
 * fixera kroz recept popravka. Promijeni li se izlaz i za jedan znak, sve zapisano prije danas
 * prestaje se poklapati, a `ruleChangeNotice` pocinje tvrditi da su se pravila promijenila na
 * svakom starom nalazu. Test koji samo zove funkciju to ne bi vidio.
 *
 * ODAKLE BROJKE: iz NEOVISNE izvedbe u Pythonu, napisane iz specifikacije FNV-1a, ne prijepisom
 * ovog modula. Dva prolaza istim alatom su slaganje, ne provjera; razliku prave razliciti alati.
 * Ta je izvedba prvo provjerena protiv poznatih FNV-1a vektora (prazan niz -> 811c9dc5,
 * "a" -> e40c292c), pa tek onda upotrijebljena kao mjerilo.
 */

/** Potpun profil. Nosi ne-ASCII znakove namjerno, da se dokaze put kroz UTF-16 kodne jedinice. */
const POTPUN = {
  definitionId: 'fpzg-diplomski',
  department: { id: 'novinarstvo' },
  selection: { workType: 'diplomski' },
  citation: 'apa7',
  ruleAuthority: 'faculty',
  font: 'Times New Roman',
  size: 12,
  spacing: 1.5,
  margins: { top: 2.5, bottom: 2.5, left: 3, right: 2.5 },
  wordMin: 8000,
  wordMax: 12000,
  charMin: null,
  charMax: null,
  minReferences: 25,
  requiredSections: [{ key: 'sazetak' }, { key: 'uvod' }, { key: 'zakljucak' }, { key: 'kljucne-rijeci' }],
  headingRules: { numbered: true, maxLevel: 3 },
  sources: [{ url: 'https://fpzg.unizg.hr/upute-za-izradu-diplomskog-rada-cćž' }],
};

/** Prazan profil: dokazuje da `undefined` kljucevi IZLAZE iz zapisa, a ne postaju `null`. */
const PRAZAN = {};

describe('otisak pravila profila', () => {
  it('FNV-1a se slaze s poznatim vektorima iz specifikacije', () => {
    // Sidro prema vanjskom svijetu. Bez njega bi test dokazivao samo da je modul dosljedan sam sebi.
    expect(hashString('')).toBe('811c9dc5');
    expect(hashString('a')).toBe('e40c292c');
  });

  it('potpun profil daje otisak izmjeren neovisnim alatom', () => {
    expect(profileFingerprint(POTPUN)).toBe('LK-2.2.2-86e95037');
  });

  it('prazan profil daje otisak izmjeren neovisnim alatom', () => {
    expect(profileFingerprint(PRAZAN)).toBe('LK-2.2.2-ad528a81');
  });

  /**
   * RED KLJUCEVA JE UGOVOR. `JSON.stringify` serijalizira redom umetanja, pa bi preslagivanje polja
   * u `compact` promijenilo otisak bez ijedne promjene znacenja. Ovo nije tvrdnja o modulu nego o
   * jeziku, i stoji ovdje da sljedeca sesija zna zasto se polja ne smiju "posloziti abecedno".
   */
  it('preslagivanje kljuceva mijenja otisak, pa red nije stvar stila', () => {
    const a = JSON.stringify({ x: 1, y: 2 });
    const b = JSON.stringify({ y: 2, x: 1 });
    expect(a).not.toBe(b);
    expect(hashString(a)).not.toBe(hashString(b));
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji: promjena
   * jedne bodovane dimenzije mora promijeniti otisak, a promjena PRIKAZNOG polja ne smije.
   */
  it('gard grize: bodovana dimenzija mijenja otisak, natpis ne', () => {
    const osnovni = profileFingerprint(POTPUN);

    const drugaVelicina = profileFingerprint({ ...POTPUN, size: 11 });
    expect(drugaVelicina, 'promjena velicine pisma MORA promijeniti otisak').not.toBe(osnovni);

    // `name` i `statusKey` namjerno NE ulaze u otisak: promjena natpisa nije promjena pravila i ne
    // smije obezvrijediti spremljen nalaz.
    const drugiNatpis = profileFingerprint({ ...POTPUN, name: 'Drukciji naziv', statusKey: 'draft' });
    expect(drugiNatpis, 'promjena prikaznog polja NE smije promijeniti otisak').toBe(osnovni);
  });

  it('SENTINEL: otisak nosi verziju aplikacije, pa nije prazan niz ni konstanta', () => {
    expect(profileFingerprint(POTPUN)).toContain(APP_VERSION);
    expect(profileFingerprint(POTPUN)).not.toBe(profileFingerprint(PRAZAN));
  });
});
