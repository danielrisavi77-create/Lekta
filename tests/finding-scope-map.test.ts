import { describe, expect, it } from 'vitest';
import { scopeForCheckId } from '../src/scoring/finding-scope-map';
import { CHECK_ID_BY_TITLE } from '../src/scoring/check-id-registry';

/**
 * Izmjereno preko svih 19 golden fixtura, 233 nalaza:
 *
 *   prije mape   sidro 6%,  podrucje  0%,  dokument  0%,  nepoznato 94%
 *   poslije      sidro 6%,  podrucje 16%,  dokument 45%,  nepoznato 33%
 *
 * Onih 94% nije bila istina nego IZOSTANAK ODGOVORA: margina vrijedi za svaku stranicu, a
 * korisniku je pisalo da se lokacija ne moze odrediti.
 */
describe('opseg nalaza po checkId', () => {
  it('oblikovanje, stranica i opseg vrijede za CIJELI dokument', () => {
    for (const id of ['format.font.dominant', 'format.size.body', 'format.spacing.body',
      'page.margins', 'page.numbers.present', 'scope.words']) {
      expect(scopeForCheckId(id), id).toEqual({ kind: 'document' });
    }
  });

  it('naslovnica, sadrzaj i literatura su PODRUCJA, ne cijeli dokument', () => {
    expect(scopeForCheckId('title.page.present')).toEqual({ kind: 'region', label: 'naslovna stranica' });
    expect(scopeForCheckId('toc.present')).toEqual({ kind: 'region', label: 'sadržaj' });
    expect(scopeForCheckId('reference.alphabetical')).toEqual({ kind: 'region', label: 'popis literature' });
  });

  it('NE PROIZVODI SIDRO ni za jedan registriran checkId', () => {
    /**
     * Sidro znaci "ovaj odlomak" i mora doci iz motora. Kad bi ga mapa ikad vratila, bila bi to
     * tvrdnja o mjestu u tudjem dokumentu koju nista ne potkrepljuje. Prolazi se CIJELI registar,
     * ne uzorak, jer bi uzorak promasio bas onaj unos koji netko doda sutra.
     */
    for (const id of Object.values(CHECK_ID_BY_TITLE)) {
      const s = scopeForCheckId(id);
      if (s) expect(s.kind, id).not.toBe('anchor');
    }
  });

  it('provjere koje IMAJU tocno mjesto ostaju bez presude', () => {
    // Citat, fusnota, naslov i element zive u odlomku. Proglasiti ih "cijelim dokumentom" znacilo
    // bi reci da mjesta nema, a ono postoji; `null` pusta pozivatelja da kaze "ne znam".
    for (const id of ['citation.recognized', 'footnote.format', 'structure.headings', 'element.lists', 'legal.ibid']) {
      expect(scopeForCheckId(id), id).toBeNull();
    }
  });

  it('rucne provjere predaje nisu mjesto u dokumentu', () => {
    // `manual.*` su potpisi, obrasci i rokovi: korak u postupku, ne dio teksta.
    expect(scopeForCheckId('manual.checks')).toBeNull();
  });

  it('prazan ili nepoznat id ne izmislja opseg', () => {
    expect(scopeForCheckId(undefined)).toBeNull();
    expect(scopeForCheckId('')).toBeNull();
    expect(scopeForCheckId('   ')).toBeNull();
    expect(scopeForCheckId('nepoznato.nesto')).toBeNull();
  });

  it('bira NAJDULJI prefiks, pa se posebna presuda moze dodati bez diranja opcenite', () => {
    // Danas `page.numbers.position` pada pod `page.`; da se ikad doda `page.numbers.` s drugom
    // presudom, mora pobijediti. Tvrdnja cuva to svojstvo prije nego zatreba.
    expect(scopeForCheckId('page.numbers.position')).toEqual({ kind: 'document' });
    expect(scopeForCheckId('format.typography.consistency')).toEqual({ kind: 'document' });
  });
});
