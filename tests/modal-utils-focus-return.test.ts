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
import { trapModal, releaseModal, okidacKlika } from '../src/ui/modal-utils';

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

/**
 * NALAZ (2026-09-23, protivnicki pregled): suzeno pravilo iznad cuva zapis kad je fokusirano
 * cvoriste PREDAK zapisanog elementa. Ali klik cesto pogodi POTOMKA okidaca, a preglednik tada
 * fokusira sam okidac, sto je isti oblik odnosa u suprotnom smjeru.
 *
 * Put postoji u proizvodu: `src/ui/finding-view-model.ts:235` i `src/ui/results/priority-findings.ts:32`
 * crtaju `<button ... data-finding-jump>Gdje: odlomak 7 <span aria-hidden="true">&#8594;</span></button>`,
 * a nad tom strelicom nema `pointer-events:none`, pa je legitimna meta klika. Klik na nju otvara
 * `#previewModal` (`src/ui/app.ts:1098` -> `openPreviewAt` -> `openPreview` -> `trapModal`).
 *
 * Bez normalizacije zapisa: `pointerdown` biljezi `<span>`, `focusin` na gumbu je predak pa se zapis
 * NE brise, `trapModal` sprema `<span>`, a `releaseModal` zove `span.focus()`, sto je u pregledniku
 * no-op (fokus zavrsi na `<body>`). Zato `pointerdown` zapisuje STVARNI OKIDAC: najblizeg
 * fokusabilnog pretka kliknutog elementa.
 *
 * MUTACIJA (izvedena 2026-09-23, vitest): zapis se uzme kao `e.target`, bez `okidacKlika` ->
 * `2 failed | 4 passed`, i to bas dva testa ispod (`document.activeElement` je `<span>`), dok
 * cetiri ostala prolaze. Obrnuta mutacija (bezuvjetni `_lastPointerTarget = null` u slusacu
 * `focusin`) daje takodjer `2 failed | 4 passed`, ali druga dva testa (oba WebKit puta), pa
 * nijedno od dva pravila nije suvisno.
 */
describe('trapModal: klik pogodi POTOMKA okidaca', () => {
  it('Chromium: klik na strelicu unutar gumba vraca fokus na gumb, ne na strelicu', () => {
    document.body.innerHTML = `
      <main id="workspace4" tabindex="-1">
        <button id="trigger4" data-finding-jump>Gdje: odlomak 7 <span id="strelica4" aria-hidden="true">&#8594;</span></button>
      </main>
      <div id="modal4"><button class="modal-close">Zatvori</button></div>
    `;
    const trigger = document.getElementById('trigger4') as HTMLButtonElement;
    const strelica = document.getElementById('strelica4') as HTMLElement;
    const modal = document.getElementById('modal4') as HTMLElement;

    // Chromium: pointerdown pogodi <span>, ali fokus dobije <button>.
    strelica.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    trigger.focus();
    expect(document.activeElement, 'sentinel: gumb nije primio fokus').toBe(trigger);

    trapModal(modal);
    releaseModal(modal);

    expect(document.activeElement, 'fokus se vratio na nefokusabilnu strelicu umjesto na gumb').toBe(trigger);
  });

  it('WebKit: klik na strelicu uz fokus na pretku i dalje vraca fokus na gumb', () => {
    document.body.innerHTML = `
      <main id="workspace5" tabindex="-1">
        <button id="trigger5" data-finding-jump>Gdje: odlomak 7 <span id="strelica5" aria-hidden="true">&#8594;</span></button>
      </main>
      <div id="modal5"><button class="modal-close">Zatvori</button></div>
    `;
    const trigger = document.getElementById('trigger5') as HTMLButtonElement;
    const strelica = document.getElementById('strelica5') as HTMLElement;
    const glavni = document.getElementById('workspace5') as HTMLElement;
    const modal = document.getElementById('modal5') as HTMLElement;

    // WebKit: pointerdown na <span>, fokus na najblizeg fokusabilnog PRETKA gumba (<main>).
    strelica.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    glavni.focus();
    expect(document.activeElement, 'sentinel: pretak nije primio fokus').toBe(glavni);

    trapModal(modal);
    releaseModal(modal);

    expect(document.activeElement, 'fokus se nije vratio na okidac').toBe(trigger);
  });
});

/**
 * Izravna tvrdnja o samom pravilu, odvojeno od modala: sto `pointerdown` uopce smije zapisati.
 */
describe('okidacKlika: normalizacija kliknutog elementa', () => {
  it('potomak gumba daje gumb, gumb daje sebe, a element bez fokusabilnog pretka daje null', () => {
    document.body.innerHTML = `
      <main id="workspace6" tabindex="-1">
        <button id="gumb6">Tekst <span id="strelica6">&#8594;</span></button>
        <div id="obicni6">Bez fokusa</div>
        <button id="onemoguceni6" disabled>Ne moze <span id="strelica7">&#8594;</span></button>
      </main>
    `;
    const gumb = document.getElementById('gumb6') as HTMLButtonElement;

    expect(okidacKlika(document.getElementById('strelica6') as HTMLElement)).toBe(gumb);
    expect(okidacKlika(gumb)).toBe(gumb);
    // <main tabindex="-1"> nije tab-fokusabilan pa nije okidac; nema sto zapisati.
    expect(okidacKlika(document.getElementById('obicni6') as HTMLElement)).toBeNull();
    expect(okidacKlika(document.getElementById('strelica7') as HTMLElement)).toBeNull();
  });
});
