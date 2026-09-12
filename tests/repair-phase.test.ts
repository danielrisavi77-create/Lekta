// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { enterRepairPhase, leaveRepairPhase, uFaziPopravka, wireRepairPhase } from '../src/ui/repair-phase';
import { renderView, resetirajPrikaz, stanjeSada } from '../src/ui/wizard-view';
import { ubaciStranicu } from './helpers/dom-fixture';

/**
 * FAZA POPRAVKA KAO VLASTITA POVRSINA (korak B3, 2026-09-12).
 *
 * Tri stvari koje ovaj gard drzi, i sve tri su se u ovom repozitoriju vec jednom izgubile:
 *  - da se u fazu NE MOZE uci iz stanja u kojem nema nalaza (ponuda nad praznim),
 *  - da povratak vodi na NALAZ a ne na pocetak (inace odabir nestane),
 *  - da mount NIJE unutar necega sto se prepisuje (odabir prezivljava jer ga nista ne dira).
 */

function vidljive(): string[] {
  return ['wizardView', 'progressView', 'resultView', 'repairView']
    .filter((id) => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); });
}

describe('faza popravka', () => {
  beforeEach(() => { ubaciStranicu(); resetirajPrikaz('dokument'); renderView('dokument', document); });

  it('SENTINEL: povrsina i mount postoje, i mount je IZVAN kartice spremnosti', () => {
    const povrsina = document.getElementById('repairView');
    const mount = document.getElementById('repairPanelMount');
    expect(povrsina, 'stranica nema povrsinu popravka').toBeTruthy();
    expect(mount, 'stranica nema mount panela').toBeTruthy();
    expect(povrsina!.contains(mount!), 'mount mora zivjeti unutar vlastite povrsine').toBe(true);
    // Ovo je srz zahvata: dok je mount bio u `innerHTML` kartice, svaki njezin re-render ga je
    // pregazio, pa se odabir cuvao keSiranjem cvora. Sada ga nista ne prepisuje.
    expect(document.getElementById('submissionChecklist')?.contains(mount!) ?? false).toBe(false);
    expect(document.getElementById('repairBackToResults'), 'nema gumba za povratak').toBeTruthy();
  });

  it('iz faze bez nalaza se u popravak NE ulazi', () => {
    expect(enterRepairPhase(null, document), 'ulaz iz stanja dokument mora biti odbijen').toBe(false);
    expect(uFaziPopravka()).toBe(false);
    // Odbijen prijelaz NE DIRA DOM: prikaz mora ostati onaj koji je bio.
    expect(vidljive()).toEqual(['wizardView']);
  });

  it('iz nalaza se ulazi, i tada je vidljiva TOCNO povrsina popravka', () => {
    renderView('rezultat', document);
    expect(vidljive()).toEqual(['resultView']);
    expect(enterRepairPhase(null, document)).toBe(true);
    expect(stanjeSada()).toBe('popravak');
    expect(vidljive()).toEqual(['repairView']);
  });

  it('povratak vodi na NALAZ, ne na pocetak', () => {
    renderView('rezultat', document);
    enterRepairPhase(null, document);
    expect(leaveRepairPhase(document)).toBe(true);
    expect(stanjeSada()).toBe('rezultat');
    expect(vidljive()).toEqual(['resultView']);
  });

  it('fokus se vraca na okidac koji je fazu otvorio', () => {
    renderView('rezultat', document);
    const okidac = document.createElement('button');
    okidac.id = 'probni-okidac';
    document.body.appendChild(okidac);
    enterRepairPhase(okidac, document);
    leaveRepairPhase(document);
    expect(document.activeElement?.id, 'korisnik tipkovnice inace pada na vrh dokumenta').toBe('probni-okidac');
  });

  it('gumb za povratak radi, i veze se uz AbortSignal', () => {
    const ac = new AbortController();
    wireRepairPhase(document, ac.signal);
    renderView('rezultat', document);
    enterRepairPhase(null, document);
    (document.getElementById('repairBackToResults') as HTMLElement).click();
    expect(stanjeSada(), 'klik na povratak nije vratio na nalaz').toBe('rezultat');

    // Nakon `abort` slusac vise ne smije reagirati; `bind()` u `app.ts` to jos ne postize i to je
    // priznato ogranicenje, ali nova ozicenja ga ne smiju povecavati.
    ac.abort();
    enterRepairPhase(null, document);
    (document.getElementById('repairBackToResults') as HTMLElement).click();
    expect(stanjeSada(), 'slusac je prezivio abort').toBe('popravak');
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmecu se dva kvara koja bi prosla neprimijeceno.
   */
  it('gard grize: skok u popravak mimo tablice i povratak na pocetak', () => {
    // 1. Izravno crtanje mimo `posalji` preskace tablicu. Tako bi se u popravak stiglo iz faze u
    //    kojoj nalaza nema, i korisnik bi dobio prazan panel.
    renderView('popravak', document);
    expect(vidljive(), 'podmetnut skok mora biti vidljiv u prikazu').toEqual(['repairView']);
    expect(stanjeSada()).toBe('popravak');

    // Baseline: kroz `enterRepairPhase` isti skok NIJE moguc.
    resetirajPrikaz('dokument');
    renderView('dokument', document);
    expect(enterRepairPhase(null, document)).toBe(false);

    // 2. Povratak koji vodi na pocetak umjesto na nalaz bacio bi odabir popravaka.
    renderView('rezultat', document);
    enterRepairPhase(null, document);
    leaveRepairPhase(document);
    expect(stanjeSada(), 'povratak na dokument bi bacio odabir').not.toBe('dokument');
  });
});
