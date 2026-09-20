// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { renderView } from '../src/ui/wizard-view';
import { FAZA_NATPIS, phaseFor, SVA_STANJA, SVE_FAZE } from '../src/ui/wizard-machine';
import { ubaciStranicu } from './helpers/dom-fixture';

/**
 * TRAKU FAZA PISE JEDINI PISAC PRIKAZA (korak B2, 2026-09-10).
 *
 * Do danas je stanje trake izvodio CSS `:has()` lanac iz `.hidden` i `data-step`, dakle iz MEHANIKE
 * prikaza. Od koraka A1 pisac je jedan, pa traku pise `renderView` iz `phaseFor`, a CSS je samo
 * crta. Ovaj gard tvrdi tri stvari koje se lako izgube: da je stanje tocno, da je tocno JEDAN korak
 * oznacen kao trenutacni, i da traka nije skrivena od citaca ekrana.
 */

function koraci(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.wizard-rail .rail-step[data-rail]'));
}

describe('traka faza', () => {
  beforeEach(() => { ubaciStranicu(); });

  it('SENTINEL: traka postoji, ima tocno tri koraka i nije skrivena od citaca', () => {
    // Bez ovoga bi prazna traka ucinila sve ostale tvrdnje vakuumskima: petlje bi prosle nula puta.
    const traka = document.querySelector('.wizard-rail');
    expect(traka, 'stranica nema traku faza').toBeTruthy();
    expect(traka!.getAttribute('aria-hidden'), 'traka vise ne smije biti skrivena').not.toBe('true');
    expect(traka!.getAttribute('aria-label'), 'traka mora biti imenovana').toBeTruthy();
    expect(koraci()).toHaveLength(3);
    expect(koraci().map((k) => k.dataset.rail)).toEqual([...SVE_FAZE]);
  });

  /**
   * POSLUZENI MARKUP VEC NOSI POCETNO STANJE, i to nije uljepsavanje nego ispravak regresije.
   *
   * Dok je stanje izvodio CSS `:has()` iz statickog `data-step="1"`, traka je bila tocna vec pri
   * prvom iscrtavanju, bez ijednog retka JavaScripta. Cim je stanje postalo podatak koji netko
   * PISE, pojavila se rupa: `renderView` se prvi put zove tek na promjenu stanja, pa je na svjezem
   * `/rad/` traka ostajala bez `data-state` i bez `aria-current`. Uhvatio to je Playwright, ne
   * jedinicni test, jer jedinicni testovi uvijek prvo pozovu `renderView`.
   *
   * Rjesenje je staticko, ne jos jedan poziv pri bootu: markup nosi ono sto je istina u trenutku
   * posluzivanja, pa traka radi i kad JavaScript zakasni ili padne.
   */
  it('posluzeni markup je tocan i prije ijednog poziva renderView', () => {
    const aktivni = koraci().filter((k) => k.dataset.state === 'aktivan');
    expect(aktivni, 'svjeze posluzena traka nema tocno jedan aktivan korak').toHaveLength(1);
    expect(aktivni[0].dataset.rail, 'pocetna faza mora biti Dokument').toBe('dokument');
    expect(koraci().filter((k) => k.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(koraci().map((k) => k.dataset.state)).toEqual(['aktivan', 'slijedi', 'slijedi']);
    expect(koraci().map((k) => k.querySelector('[data-rail-state]')?.textContent))
      .toEqual(['trenutačno', 'slijedi', 'slijedi']);
  });

  it('za svako stanje je tocno jedan korak trenutacan, i to onaj iz phaseFor', () => {
    for (const s of SVA_STANJA) {
      renderView(s, document);
      const aktivni = koraci().filter((k) => k.dataset.state === 'aktivan');
      expect(aktivni, 'stanje ' + s + ': aktivnih koraka nije tocno jedan').toHaveLength(1);
      expect(aktivni[0].dataset.rail, 'stanje ' + s + ' je zavrsilo u krivoj fazi').toBe(phaseFor(s));

      const oznaceni = koraci().filter((k) => k.getAttribute('aria-current') === 'step');
      expect(oznaceni, 'stanje ' + s + ': aria-current nije na tocno jednom koraku').toHaveLength(1);
      expect(oznaceni[0]).toBe(aktivni[0]);
    }
  });

  it('prijedjene faze su gotove, buduce slijede', () => {
    renderView('rezultat', document); // faza Provjera, dakle druga od tri
    const stanja = koraci().map((k) => k.dataset.state);
    expect(stanja).toEqual(['gotov', 'aktivan', 'slijedi']);
  });

  it('citac ekrana dobiva stanje rijecima, ne samo bojom i brojem', () => {
    renderView('rezultat', document);
    const tekstovi = koraci().map((k) => k.querySelector('[data-rail-state]')?.textContent);
    expect(tekstovi).toEqual(['gotovo', 'trenutačno', 'slijedi']);
    // Natpisi faza dolaze iz stroja, pa se markup i stroj ne mogu razici.
    const natpisi = koraci().map((k) => k.querySelector('.rail-lbl')?.textContent);
    expect(natpisi).toEqual(SVE_FAZE.map((f) => FAZA_NATPIS[f]));
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmecu se DVA kvara, jer su razliciti i jedan ne
   * pokriva drugi.
   */
  it('gard grize: zaostali aria-current i zaostalo stanje', () => {
    // 1. Pisac koji POSTAVLJA na novi korak a ne SKIDA sa starog. Vizualno se ne vidi, a citac
    //    ekrana cuje dva "trenutacno", sto zvuci kao tocna informacija.
    renderView('dokument', document);
    koraci()[2].setAttribute('aria-current', 'step'); // podmetnuto
    expect(koraci().filter((k) => k.getAttribute('aria-current') === 'step').length,
      'podmetnut drugi aria-current mora biti vidljiv gardu').toBe(2);

    // Baseline: nemutiran prolaz je cist, inace bi gard vristao na sve.
    renderView('dokument', document);
    expect(koraci().filter((k) => k.getAttribute('aria-current') === 'step')).toHaveLength(1);

    // 2. Stanje koje se ne osvjezi pri povratku unatrag. Bez skidanja `gotov` bi traka tvrdila da
    //    je korisnik prosao fazu u koju se tek vraca.
    renderView('rezultat', document);
    expect(koraci()[0].dataset.state).toBe('gotov');
    renderView('dokument', document);
    expect(koraci()[0].dataset.state, 'povratak unatrag mora ponistiti oznaku gotovo').toBe('aktivan');
    expect(koraci()[1].dataset.state).toBe('slijedi');
  });
});
