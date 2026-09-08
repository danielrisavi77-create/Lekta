import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../src/ui/results/desk-model';
import { trakaZaOpseg } from '../src/ui/results/desk-model';
import { deskHtml, deskNav, deskNavHtml, deskPaneHtml, deskTraka } from '../src/ui/results/desk-view';
import type { VisualFindingModel } from '../src/ui/results/visual-result-model';

/**
 * KOREKTORSKI STOL, PRIKAZ. Dvije tvrdnje nose cijeli osjecaj stola i obje se lako izgube:
 *
 *   1. Navigacija NE OMATA. Na zadnjem nalazu "Sljedeci problem" je ugasen. Omatanje bi bilo
 *      lakse napisati i izgledalo bi zivlje, ali stol na kojem se vrtis u krug ne moze odgovoriti
 *      na pitanje "jesam li gotov", a upravo to korisnik broji.
 *   2. Kad mjesto nije poznato, dokument ostaje NEOZNACEN i iznad njega stoji recenica. Izmjereno
 *      je da 61% nalaza nema odlomak, dakle to je vecinski slucaj, a ne rub.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function nalaz(over: Partial<VisualFindingModel> = {}): VisualFindingModel {
  return {
    id: 'f1', title: 'Prored nije 1,5', severity: 'error', category: 'formatting',
    status: 'open', kind: 'document', explanation: 'Izmjereno 1,15.', priorityRank: 0,
    originalIndex: 0, capabilities: { repair: true, preview: true },
    scope: { kind: 'document' }, ...over,
  } as unknown as VisualFindingModel;
}
const stavka = (over: Partial<VisualFindingModel> = {}, flagIndex: number | null = null): DeskItem<VisualFindingModel> =>
  ({ finding: nalaz(over), flagIndex });

/**
 * Popis od N nalaza. Postoji otkad je desna strana RED CEKANJA: polozaj u navigaciji mora imati
 * pokrice u popisu, jer se detalj otvara na retku koji tom polozaju odgovara. Prva izvedba je za
 * `svi` imala zadanu vrijednost `[item]`, pa je pri neslaganju detalj tiho nestajao; testovi su to
 * uhvatili i zadana vrijednost je uklonjena.
 */
const popis = (n: number): DeskItem<VisualFindingModel>[] =>
  Array.from({ length: n }, (_, i) => stavka({ id: `f${i}`, title: `Nalaz ${i + 1}` }));

describe('navigacija stola', () => {
  it('NE OMATA: na prvom nema prethodnog, na zadnjem nema sljedeceg', () => {
    expect(deskNav(6, 0).prethodni).toBeNull();
    expect(deskNav(6, 0).sljedeci).toBe(1);
    expect(deskNav(6, 5).sljedeci).toBeNull();
    expect(deskNav(6, 5).prethodni).toBe(4);
  });

  it('MUTACIJA: da omata, krajevi bi imali metu i gumbi ne bi bili ugaseni', () => {
    const zadnji = deskNav(6, 5);
    // Omatanje bi ovdje dalo 0 umjesto null, pa bi gumb izgubio `disabled`.
    expect(zadnji.sljedeci).not.toBe(0);
    expect(deskNavHtml(zadnji, esc)).toContain('desk-nav__btn--next" data-desk-go="" disabled');
    expect(deskNavHtml(deskNav(6, 0), esc)).toContain('desk-nav__btn--prev" data-desk-go="" disabled');
  });

  it('polozaj se stisce u raspon, jer indeks dolazi iz klika i moze zaostati', () => {
    expect(deskNav(3, 99).index).toBe(2);
    expect(deskNav(3, -5).index).toBe(0);
    expect(deskNav(3, 1.9).index).toBe(1);
  });

  it('prazan popis ne izmislja polozaj', () => {
    const n = deskNav(0, 4);
    expect(n.oznaka).toBe('0 / 0');
    expect(n.prethodni).toBeNull();
    expect(n.sljedeci).toBeNull();
  });

  it('oznaka je 1-based, jer "0 / 6" korisnik cita kao kvar', () => {
    expect(deskNav(6, 0).oznaka).toBe('1 / 6');
    expect(deskNav(6, 5).oznaka).toBe('6 / 6');
  });
});

describe('traka o opsegu', () => {
  it('sidro sa zastavicom ne trosi traku: mjesto je oznaceno u dokumentu', () => {
    expect(deskTraka(stavka({ scope: { kind: 'anchor', paragraphIndex: 12 } } as never, ), )).not.toBeNull();
    // Isti nalaz, ali sa zastavicom: traka nestaje.
    expect(deskTraka(stavka({ scope: { kind: 'anchor', paragraphIndex: 12 } } as never, 3))).toBeNull();
  });

  it('sidro BEZ zastavice to i kaze, umjesto da suti', () => {
    // Cetvrti slucaj koji model ne zna: nalaz ima odlomak, ali zastavica nije iscrtana. Sutnja bi
    // poslala korisnika u potragu za oznakom koje nema.
    const t = deskTraka(stavka({ scope: { kind: 'anchor', paragraphIndex: 12 } } as never, null));
    expect(t).toContain('nije označeno');
  });

  it('cijeli dokument i podrucje dobiju svoju recenicu, ne okvir', () => {
    expect(deskTraka(stavka({ scope: { kind: 'document' } } as never))).toContain('cijeli rad');
    expect(deskTraka(stavka({ scope: { kind: 'region', label: 'popis literature' } } as never)))
      .toContain('popis literature');
  });

  it('nepoznato mjesto NE dobiva traku, jer bi ponovilo redak "Gdje:" u kartici', () => {
    /**
     * Izmjereno na snimci 2026-09-08: traka i kartica ispisivale su DOSLOVNO ISTU recenicu jedna
     * iznad druge ("Lokacija nije pouzdano dostupna. Nalaz je opisan kao: Struktura rada."), jer
     * `trakaZaOpseg` i `scopeLabel` za `unavailable` oba vracaju `scope.reason`.
     *
     * Razlog i dalje stoji na ekranu, samo jednom. Model (`trakaZaOpseg`) ga NAMJERNO i dalje
     * vraca: on ne zna sto kartica crta, pa odluka o ponavljanju pripada prikazu.
     */
    const opseg = { kind: 'unavailable', reason: 'Pravilo nema mjerljivo mjesto.' };
    expect(deskTraka(stavka({ scope: opseg } as never))).toBeNull();
    expect(trakaZaOpseg(opseg as never)).toBe('Pravilo nema mjerljivo mjesto.');
  });

  it('opseg koji kartica NE objasnjava i dalje dobiva traku', () => {
    // Kontrola uz gornju tvrdnju: da je uklonjena traka za sve, korisnik vise ne bi znao zasto u
    // dokumentu lijevo nema nijedne oznake.
    expect(deskTraka(stavka({ scope: { kind: 'document' } } as never))).toContain('cijeli rad');
    expect(deskTraka(stavka({ scope: { kind: 'region', label: 'sadržaj' } } as never))).toContain('sadržaj');
  });
});

describe('desna strana stola', () => {
  it('redni broj kartice se SLAZE s brojem u navigaciji', () => {
    // Dvije brojke na istom ekranu koje se ne slazu citaju se kao kvar. Kartica dobiva
    // `nav.index + 1`, isti broj koji stoji lijevo od kose crte.
    const html = deskPaneHtml(stavka(), deskNav(6, 2), true, esc, popis(6));
    expect(html).toContain('>03<');
    expect(html).toContain('3 / 6');
  });

  it('MUTACIJA: da kartica uzima vlastiti broj, brojke bi se razisle', () => {
    const nav = deskNav(6, 2);
    const html = deskPaneHtml(stavka(), nav, true, esc, popis(6));
    const kartica = /cockpit-finding__index">(\d+)</.exec(html)?.[1];
    expect(Number(kartica)).toBe(nav.index + 1);
  });

  it('prazan stol kaze da nema nalaza, umjesto da crta praznu karticu', () => {
    const html = deskPaneHtml(null, deskNav(0, 0), true, esc, []);
    expect(html).toContain('Nema otvorenih nalaza');
    expect(html).not.toContain('cockpit-finding');
  });

  it('traka se ne crta kad mjesta IMA, da ekran ne nosi suvisnu recenicu', () => {
    const sMjestom = deskPaneHtml(stavka({ scope: { kind: 'anchor', paragraphIndex: 4 } } as never, 0), deskNav(1, 0), true, esc, popis(1));
    expect(sMjestom).not.toContain('data-desk-traka');
    const bezMjesta = deskPaneHtml(stavka(), deskNav(1, 0), true, esc, popis(1));
    expect(bezMjesta).toContain('data-desk-traka');
  });
});

describe('cijeli stol', () => {
  it('lijeva strana je SAMO domacin, pa ljuska ne vuce teski renderer', () => {
    const html = deskHtml(stavka(), deskNav(6, 0), true, esc, popis(6));
    expect(html).toContain('data-desk-doc');
    expect(html).toContain('data-desk-pane');
    // Dokument se montira izvana; ljuska ne smije unaprijed crtati nijedan odlomak.
    expect(html).not.toContain('lekta-facsimile');
  });
});
