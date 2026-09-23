/**
 * NALAZ (2026-09-13): `tests/ux/workspace-a11y.spec.ts` "list profila" pada na CI-ju (ubuntu,
 * chromium i mobile-chromium, brz stroj) u PRVOM pokusaju, a prolazi u retryju; lokalno na
 * sporijem Windowsu prolazi bez retryja. Uzrok je bio VREMENSKI PROZOR u `trapModal`
 * (`src/ui/modal-utils.ts`): zapis "zadnji pointerdown" vrijedio je "svjezim" ako je
 * `Date.now() - _lastPointerAt < 500`, bez obzira sto se izmedju dogodilo.
 *
 * Stvaran redoslijed u testu: `beforeEach` klikne traku privole (`#analyticsDecline`), sto ostavi
 * `_lastPointerTarget = declineBtn`. Na brzom stroju sve sljedece (upload, cekanje koraka 2, fokus
 * na `[data-change-profile]`, Enter) stane u tih 500 ms, pa `trapModal` pri otvaranju
 * `#profileSheet` zapis od trake privole tumaci kao svjez klik na "Promijeni" i njega sprema kao
 * okidac umjesto STVARNO aktivnog elementa. Escape poslije vraca fokus na (vec uklonjeni) gumb
 * trake, ne na "Promijeni". Na sporijem stroju isti niz koraka potrosi vise od 500 ms, prozor
 * istekne, i test prolazi - otud CI crven / lokalno zeleno.
 *
 * Popravak brise oslanjanje na sat: zapis vrijedi dok ga ne potrosi tocno jedan `trapModal` ILI
 * dok se ne dogodi sljedeci `focusin` (stvaran pomak fokusa dokazuje da zapis vise ne opisuje
 * trenutni okidac). Tipkovnicki put je time siguran bez ijednog mjerenja vremena: da bi se Enter
 * uopce pritisnuo na okidacu, okidac je prije toga MORAO primiti fokus, sto je vec jedan
 * `focusin` koji je obrisao stariji, nepovezani zapis.
 *
 * MUTACIJA (rucno provjerena, ne ostaje u kodu): vracanje starog `Date.now() - _lastPointerAt <
 * 500` bez `focusin` slusaca cini prvi test u ovoj datoteci PADAJUCIM (fokus zavrsi na `decline`
 * umjesto na `trigger`), jer izvrsavanje testa u vitestu traje bitno manje od 500 ms.
 */
import { describe, it, expect } from 'vitest';
import { trapModal, releaseModal } from '../src/ui/modal-utils';

describe('trapModal: povrat fokusa se ne oslanja na proteklo vrijeme', () => {
  it('nepovezan raniji pointerdown (npr. traka privole) se ne koristi kao okidac kad je izmedju bilo pravog fokusa', () => {
    document.body.innerHTML = `
      <button id="decline">Odbij</button>
      <button id="trigger">Promijeni</button>
      <div id="modal"><button class="modal-close">Zatvori</button></div>
    `;
    const decline = document.getElementById('decline') as HTMLButtonElement;
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    const modal = document.getElementById('modal') as HTMLElement;

    // Klik na traku privole: pointerdown pa fokus (Chromium fokusira <button> na klik misem).
    decline.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    decline.focus();
    expect(document.activeElement).toBe(decline);

    // Kasnije, tipkovnicki: korisnik fokusira "Promijeni" i otvara modal Enterom. Aktivacija
    // tipkovnicom ne stvara pointerdown, pa jedini trag koji trapModal smije koristiti je
    // document.activeElement.
    trigger.focus();
    trapModal(modal);
    releaseModal(modal);

    expect(document.activeElement, 'fokus se mora vratiti na trigger, ne na stariji decline').toBe(trigger);
  });

  it('WebKit: klik misem ne fokusira gumb, fokus se ipak vraca na stvarni okidac preko pointerdown zapisa', () => {
    document.body.innerHTML = `
      <button id="trigger2">Promijeni</button>
      <div id="modal2"><button class="modal-close">Zatvori</button></div>
    `;
    const trigger = document.getElementById('trigger2') as HTMLButtonElement;
    const modal = document.getElementById('modal2') as HTMLElement;

    // WebKit ne fokusira <button> na klik misem: pointerdown postoji, focus() se NE zove.
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.activeElement).not.toBe(trigger);

    trapModal(modal);
    releaseModal(modal);

    expect(document.activeElement, 'WebKit put mora i dalje vracati fokus na stvarni okidac').toBe(trigger);
  });
});

/**
 * NALAZ (2026-09-23): isti povrat fokusa pada u WebKitu iz DRUGOG razloga, koji je gornji popravak
 * propustio. WebKit gumb ne fokusira na klik, ali fokus ne ostavlja ni na miru: fokusira NAJBLIZEG
 * fokusabilnog PRETKA kliknutog elementa. Na `/rad/` je to `<main id="workspace">`, fokusabilan
 * (`tabindex="-1"`) jer je meta preskocne poveznice (`src/shared/skip-link.ts`).
 *
 * IZMJERENO 2026-09-23 (`mobile-webkit`, sonda nad `/rad/`, capture slusaci na dokumentu):
 *
 *     17358 ms  pointerdown  BUTTON  (unutar [data-change-profile])
 *     17358 ms  focusin      MAIN#workspace
 *     17370 ms  click        BUTTON  (unutar [data-change-profile])
 *
 * Taj `focusin` dolazi iz ISTE geste i PRIJE `click`-a, pa je gornji slusac brisao zapis prije
 * nego ga je `trapModal` stigao procitati; `_modalReturnFocus` je padao na `document.activeElement`,
 * dakle na `<main>`. Mjereno nad zatecenim masterom (45208425): 9 od 10 prolaza
 * `tests/ux/workspace-entry.spec.ts` ("list profila", mobile-webkit) palo je na toj tvrdnji.
 *
 * MUTACIJA (izvedena): u `modal-utils.ts` vracen bezuvjetni `_lastPointerTarget = null` -> test
 * ispod pada (fokus zavrsi na `<main>`), dok prvi test u ovoj datoteci i dalje prolazi, pa je
 * pokriveno oboje: i sto novo pravilo mora propustiti i sto i dalje mora potrositi.
 */
describe('trapModal: preglednik koji fokusira PRETKA okidaca', () => {
  it('fokus se vraca na okidac kad je fokus usput otisao na njegova fokusabilnog pretka', () => {
    document.body.innerHTML = `
      <main id="workspace" tabindex="-1">
        <button id="trigger3" data-change-profile>Promijeni</button>
      </main>
      <div id="modal3"><button class="modal-close">Zatvori</button></div>
    `;
    const trigger = document.getElementById('trigger3') as HTMLButtonElement;
    const glavni = document.getElementById('workspace') as HTMLElement;
    const modal = document.getElementById('modal3') as HTMLElement;

    // Redoslijed dogadjaja tocno kako ga je sonda izmjerila u WebKitu.
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    glavni.focus();
    // Sentinel: simulacija je stvarno pomaknula fokus na pretka; bez toga bi tvrdnja ispod
    // prolazila i nad testom koji nista ne radi.
    expect(document.activeElement, 'sentinel: pretak nije primio fokus').toBe(glavni);

    trapModal(modal);
    releaseModal(modal);

    expect(document.activeElement, 'fokus se nije vratio na okidac nego na njegova pretka').toBe(trigger);
  });
});
