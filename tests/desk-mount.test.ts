import { beforeEach, describe, expect, it } from 'vitest';
import type { DeskItem } from '../src/ui/results/desk-model';
import { mountDesk, type DeskDocument } from '../src/ui/results/desk-mount';
import type { ResultsCockpitAction } from '../src/ui/results/results-cockpit';
import type { VisualFindingModel } from '../src/ui/results/visual-result-model';
import { buildRepairPlan } from '../src/ui/results/repair-plan';
import { repairPlanHtml } from '../src/ui/results/repair-plan-view';

/**
 * OZICENJE STOLA. Brif trazi DVA smjera: klik na nalaz pomakne dokument, klik na oznaceno mjesto
 * aktivira nalaz. Oba se ovdje mjere bez preglednika, jer se dokument ubacuje izvana.
 *
 * Tri tvrdnje koje se najlakse izgube pri sljedecoj izmjeni:
 *   1. Delegacija mora prezivjeti PONOVNO CRTANJE ploce. Izravni slusaci bi radili tocno jednom,
 *      pa bi drugi klik tiho zakazao i izgledao kao nasumican kvar.
 *   2. Zastavica BEZ nalaza ne smije nista pomaknuti. Zastavice gradi drugi put od nalaza i
 *      presjek je manji od oba skupa.
 *   3. Prethodna oznaka mjesta se gasi UVIJEK. Dvije oznake na ekranu ne govore koja vrijedi.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function nalaz(id: string, over: Partial<VisualFindingModel> = {}): VisualFindingModel {
  return {
    id, title: 'Nalaz ' + id, severity: 'warning', category: 'formatting', status: 'open',
    kind: 'document', explanation: 'Objasnjenje.', priorityRank: 0, originalIndex: 0,
    capabilities: { repair: true, preview: true }, scope: { kind: 'document' }, ...over,
  } as unknown as VisualFindingModel;
}

/** Tri nalaza; prvi i treci imaju mjesto u dokumentu, srednji nema. */
function stavke(): DeskItem<VisualFindingModel>[] {
  return [
    { finding: nalaz('a', { scope: { kind: 'anchor', paragraphIndex: 3 } as never }), flagIndex: 0 },
    { finding: nalaz('b'), flagIndex: null },
    { finding: nalaz('c', { scope: { kind: 'anchor', paragraphIndex: 9 } as never }), flagIndex: 2 },
  ];
}

let sekcija: HTMLElement;
let mete: Map<number, HTMLElement>;
let pomaknuto: HTMLElement[];

function dokument(): DeskDocument {
  return { flagTargets: mete };
}

beforeEach(() => {
  document.body.innerHTML = '<section id="stol"></section>';
  sekcija = document.getElementById('stol') as HTMLElement;
  pomaknuto = [];
  mete = new Map();
  // Tri mete: 0 i 2 pripadaju nalazima, 1 je zastavica BEZ nalaza (npr. registar duge recenice).
  [0, 1, 2].forEach((i) => {
    const el = document.createElement('mark');
    el.dataset.flag = String(i);
    document.body.appendChild(el);
    mete.set(i, el);
  });
});

function montiraj(over: Partial<Parameters<typeof mountDesk>[1]> = {}) {
  const akcije: ResultsCockpitAction[] = [];
  const handle = mountDesk(sekcija, {
    items: stavke(), repairAvailable: true, esc,
    mountDocument: async () => dokument(),
    onAction: (a) => akcije.push(a),
    scrollTo: (el) => pomaknuto.push(el),
    ...over,
  });
  return { handle, akcije };
}

const klik = (el: Element | null) => el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

describe('kretanje po stolu', () => {
  it('pocinje na prvom nalazu i broji od jedan', () => {
    montiraj();
    expect(sekcija.querySelector('[data-desk-count]')?.textContent).toBe('1 / 3');
  });

  it('"Sljedeci problem" pomice plocu, i to VISE OD JEDNOM', () => {
    // Tvrdnja 1: drugi klik je ono sto bi palo da su slusaci izravni umjesto delegiranih.
    const { handle } = montiraj();
    klik(sekcija.querySelector('.desk-nav__btn--next'));
    expect(handle.index).toBe(1);
    expect(sekcija.querySelector('[data-desk-count]')?.textContent).toBe('2 / 3');
    klik(sekcija.querySelector('.desk-nav__btn--next'));
    expect(handle.index).toBe(2);
    expect(sekcija.querySelector('[data-desk-count]')?.textContent).toBe('3 / 3');
  });

  it('na kraju popisa se ne omata', () => {
    const { handle } = montiraj();
    handle.goTo(2);
    klik(sekcija.querySelector('.desk-nav__btn--next'));
    expect(handle.index).toBe(2);
  });
});

describe('nalaz pomice dokument', () => {
  it('prelazak na nalaz s mjestom oznaci i pomakne bas to mjesto', async () => {
    const { handle } = montiraj();
    await Promise.resolve();
    await Promise.resolve();
    handle.goTo(2);
    expect(mete.get(2)?.getAttribute('data-desk-active')).toBe('true');
    expect(pomaknuto.at(-1)).toBe(mete.get(2));
  });

  it('nalaz BEZ mjesta ne pomice dokument i ne ostavlja staru oznaku', async () => {
    // Tvrdnja 3: 61% nalaza nema mjesto, pa je ovo vecinski slucaj. Da se stara oznaka ne gasi,
    // dokument bi tvrdio da nalaz "b" zivi ondje gdje zivi nalaz "a".
    const { handle } = montiraj();
    await Promise.resolve();
    await Promise.resolve();
    handle.goTo(0);
    expect(mete.get(0)?.getAttribute('data-desk-active')).toBe('true');
    const prije = pomaknuto.length;
    handle.goTo(1);
    expect(mete.get(0)?.hasAttribute('data-desk-active')).toBe(false);
    expect([...mete.values()].some((el) => el.hasAttribute('data-desk-active'))).toBe(false);
    expect(pomaknuto.length).toBe(prije);
  });
});

describe('mjesto aktivira nalaz', () => {
  it('klik na oznaceno mjesto otvori bas taj nalaz', async () => {
    const { handle } = montiraj();
    await Promise.resolve();
    await Promise.resolve();
    klik(mete.get(2)!);
    expect(handle.index).toBe(2);
    expect(sekcija.querySelector('[data-desk-count]')?.textContent).toBe('3 / 3');
  });

  it('zastavica BEZ nalaza ne pomice nista', async () => {
    // Tvrdnja 2: zastavice gradi `collectAllPreviewFlags` iz cijelog rezultata, ukljucujuci
    // registre koji nemaju svoj nalaz. Skok na "najblizi" nalaz bi bio izmisljanje veze.
    const { handle } = montiraj();
    await Promise.resolve();
    await Promise.resolve();
    handle.goTo(0);
    klik(mete.get(1)!);
    expect(handle.index).toBe(0);
  });
});

describe('radnje kartice', () => {
  it('gumbi kartice salju iste radnje i POSLIJE ponovnog crtanja', async () => {
    const { handle, akcije } = montiraj();
    klik(sekcija.querySelector('[data-finding-action]'));
    expect(akcije).toEqual([{ kind: 'repair', findingId: 'a' }]);
    handle.goTo(2);
    klik(sekcija.querySelector('[data-finding-action]'));
    expect(akcije.at(-1)).toEqual({ kind: 'repair', findingId: 'c' });
  });

  it('zanemarivanje bez razloga se NE salje', async () => {
    // "Zanemareno bez razloga" je zapis iz kojeg se poslije ne da rekonstruirati odluka.
    const { akcije } = montiraj();
    klik(sekcija.querySelector('[data-finding-ignore]'));
    klik(sekcija.querySelector('[data-finding-ignore-save]'));
    expect(akcije).toEqual([]);
    const polje = sekcija.querySelector<HTMLInputElement>('[data-finding-ignore-reason]')!;
    polje.value = '  mentor je odobrio  ';
    klik(sekcija.querySelector('[data-finding-ignore-save]'));
    expect(akcije).toEqual([{ kind: 'ignore', findingId: 'a', reason: 'mentor je odobrio' }]);
  });

  it('dispose gasi delegaciju, pa odbaceni stol vise ne javlja radnje', () => {
    const { handle, akcije } = montiraj();
    handle.dispose();
    klik(sekcija.querySelector('[data-finding-action]'));
    expect(akcije).toEqual([]);
  });
});

describe('dokument je pomoc, ne uvjet', () => {
  it('stol radi i kad renderer dokumenta zakaze', async () => {
    const { handle } = montiraj({ mountDocument: async () => { throw new Error('renderer pao'); } });
    await Promise.resolve();
    await Promise.resolve();
    klik(sekcija.querySelector('.desk-nav__btn--next'));
    expect(handle.index).toBe(1);
    expect(sekcija.querySelector('[data-desk-pane]')).toBeTruthy();
  });

  it('odbacen stol ne dira dokument koji je stigao kasno', async () => {
    let rijesi: (d: DeskDocument | null) => void = () => {};
    const { handle } = montiraj({ mountDocument: () => new Promise((r) => { rijesi = r; }) });
    handle.dispose();
    rijesi(dokument());
    await Promise.resolve();
    await Promise.resolve();
    expect([...mete.values()].some((el) => el.hasAttribute('data-desk-active'))).toBe(false);
  });

  it('prazan popis nalaza ne rusi montazu', () => {
    const prazan = mountDesk(sekcija, {
      items: [], repairAvailable: false, esc,
      mountDocument: async () => null,
    });
    expect(sekcija.textContent).toContain('Nema otvorenih nalaza');
    prazan.goTo(1);
    expect(prazan.index).toBe(0);
  });
});

describe('MUTACIJA: indeks nalaza NIJE indeks zastavice', () => {
  it('nalaz na polozaju 1 ne smije oznaciti zastavicu 1', async () => {
    /**
     * Najvjerojatniji buduci kvar je zamjena dvaju brojeva koji ovdje slucajno izgledaju slicno:
     * REDNI BROJ nalaza na stolu i INDEKS zastavice u dokumentu. Fixtura je namjerno postavljena
     * tako da ta zamjena ne moze proci tiho: nalaz na polozaju 1 NEMA mjesto, a zastavica 1
     * POSTOJI i pripada necemu drugom.
     *
     * Da kod koristi polozaj umjesto `flagIndex`, polozaji 0 i 2 bi i dalje "radili", pa bi test
     * koji gleda samo njih bio zelen nad pokvarenim kodom. Pada iskljucivo ovdje.
     */
    const { handle } = montiraj();
    await Promise.resolve();
    await Promise.resolve();
    handle.goTo(1);
    expect(mete.get(1)?.hasAttribute('data-desk-active')).toBe(false);
    expect(pomaknuto).not.toContain(mete.get(1));
  });
});

describe('plan ispravaka kao drugi nacin rada', () => {
  const PLAN = '<div class="rp" data-repair-plan><button type="button" data-repair-plan-go>Izradi</button></div>';

  it('bez plana stol NE nudi ulaz u njega', () => {
    // Gumb koji vodi na "nema zahvata" losiji je od izostanka gumba.
    montiraj();
    expect(sekcija.querySelector('[data-desk-plan-open]')).toBeNull();
  });

  it('otvaranje plana emitira `plan-opened` (T14: repair_plan_opened na stvarnoj promjeni stanja)', () => {
    const { akcije } = montiraj({ planHtml: PLAN });
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    expect(akcije).toEqual([{ kind: 'plan-opened' }]);
  });

  it('klik na "Otvori plan" ZAMJENJUJE popis nalaza planom', () => {
    // Plan i popis su dva pogleda na isti posao; jedan ispod drugoga trazio bi dvostruko citanje.
    montiraj({ planHtml: PLAN });
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    expect(sekcija.querySelector('[data-repair-plan]')).toBeTruthy();
    expect(sekcija.querySelector('[data-desk-queue]')).toBeNull();
  });

  it('povratak vraca nalaze i cuva polozaj, jer plan je odluka a ne izlazak', () => {
    const { handle } = montiraj({ planHtml: PLAN });
    handle.goTo(2);
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    klik(sekcija.querySelector('[data-desk-plan-close]'));
    expect(sekcija.querySelector('[data-desk-count]')?.textContent).toBe('3 / 3');
  });

  it('CTA plana salje radnju ljusci, jer plan ne izvodi popravak sam', () => {
    const { akcije } = montiraj({ planHtml: PLAN });
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    klik(sekcija.querySelector('[data-repair-plan-go]'));
    // T09: radnja nosi ODABIR iz plana; s praznim planom (bez kontrola) je to prazan popis, ne izostanak polja.
    expect(akcije.filter((a) => a.kind !== 'plan-opened')).toEqual([{ kind: 'repair-safe', ruleIds: [] }]);
  });

  it('delegacija radi i u nacinu plan, dakle poslije ponovnog crtanja', () => {
    const { akcije } = montiraj({ planHtml: PLAN });
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    klik(sekcija.querySelector('[data-desk-plan-close]'));
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    klik(sekcija.querySelector('[data-repair-plan-go]'));
    expect(akcije.filter((a) => a.kind !== 'plan-opened')).toEqual([{ kind: 'repair-safe', ruleIds: [] }]);
  });
});

/**
 * T09: plan sa STVARNIM kontrolama. Odabir u planu putuje s radnjom `repair-safe`, brojac i sazetak se ponovno
 * iscrtavaju iz istog modela, a iskljucivanje jednog zahvata ne dira drugi.
 */
describe('plan ispravaka: stvarne kontrole odabira (T09)', () => {
  const plan = buildRepairPlan([
    { ruleId: 'margine', label: 'Uskladi margine', violated: true },
    { ruleId: 'prored', label: 'Uskladi prored osnovnog teksta', violated: true },
    { ruleId: 'izjava', label: 'Umetni izjavu o izvornosti', violated: true, requiresConfirmation: true, confirmationText: 'Ti potvrđuješ mjesto.' },
  ], [], true);
  const montirajPlan = () => montiraj({ planHtml: repairPlanHtml(plan, esc), plan });
  const promjena = (el: Element | null) => el?.dispatchEvent(new window.Event('change', { bubbles: true }));

  it('zadani odabir = sigurni zahvati; odluka je iskljucena i ima razlog uz sebe', () => {
    montirajPlan();
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    const kutije = Array.from(sekcija.querySelectorAll<HTMLInputElement>('[data-repair-plan-item]'));
    expect(kutije.map((c) => [c.dataset.repairPlanItem, c.checked])).toEqual([['margine', true], ['prored', true], ['izjava', false]]);
    expect(sekcija.querySelector('[data-repair-plan-count]')?.getAttribute('data-repair-plan-count')).toBe('2');
    expect(sekcija.querySelector('[data-rule="izjava"]')?.textContent).toContain('Ti potvrđuješ mjesto.');
  });

  it('iskljucivanje jednog zahvata mijenja brojac i sazetak, a drugi zahvat ostaje odabran', () => {
    const { akcije } = montirajPlan();
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    const prored = sekcija.querySelector<HTMLInputElement>('[data-repair-plan-item="prored"]')!;
    prored.checked = false;
    promjena(prored);
    expect(sekcija.querySelector('[data-repair-plan-count]')?.getAttribute('data-repair-plan-count')).toBe('1');
    const sazetak = sekcija.querySelector('[data-repair-selected-summary]')?.textContent ?? '';
    expect(sazetak).toContain('Uskladi margine');
    expect(sazetak).not.toContain('Uskladi prored');
    // Kontrola prezivi ponovno crtanje podnozja: ista kutija, isto stanje.
    expect(sekcija.querySelector<HTMLInputElement>('[data-repair-plan-item="margine"]')?.checked).toBe(true);
    klik(sekcija.querySelector('[data-repair-plan-go]'));
    expect(akcije.filter((a) => a.kind !== 'plan-opened')).toEqual([{ kind: 'repair-safe', ruleIds: ['margine'] }]);
  });

  it('ukljucivanje odluke najavljuje potvrdu PRIJE slanja i ulazi u odabir', () => {
    const { akcije } = montirajPlan();
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    const izjava = sekcija.querySelector<HTMLInputElement>('[data-repair-plan-item="izjava"]')!;
    izjava.checked = true;
    promjena(izjava);
    expect(sekcija.querySelector('[data-repair-plan-footer]')?.textContent).toContain('traži se potvrda za: Umetni izjavu o izvornosti');
    klik(sekcija.querySelector('[data-repair-plan-go]'));
    expect(akcije.filter((a) => a.kind !== 'plan-opened')[0]).toEqual({ kind: 'repair-safe', ruleIds: ['margine', 'prored', 'izjava'] });
  });

  it('bez ijednog odabranog zahvata glavna radnja je onemogucena, ne privid', () => {
    montirajPlan();
    klik(sekcija.querySelector('[data-desk-plan-open]'));
    for (const cb of sekcija.querySelectorAll<HTMLInputElement>('[data-repair-plan-item]')) { cb.checked = false; promjena(cb); }
    expect(sekcija.querySelector<HTMLButtonElement>('[data-repair-plan-go]')?.disabled).toBe(true);
    expect(sekcija.querySelector('[data-repair-selected-summary]')?.textContent).toContain('Nijedan zahvat nije odabran');
  });
});

describe('polozaj prezivljava ponovnu montazu', () => {
  it('stol pocinje ondje gdje je stao, a ne od prvog nalaza', () => {
    /**
     * Ljuska iznova crta cijeli kokpit na SVAKU radnju nad nalazom (potvrda, zanemarivanje,
     * povratak), pa se stol ponovno montira. Bez `startIndex` bi korisnik koji potvrdi peti nalaz
     * zavrsio natrag na prvom, sto se cita kao da je radnja ponistila napredak.
     *
     * Uhvatio CI (`browser-matrix`, 2026-09-08): kartica na kojoj je test radio nestala je iz
     * DOM-a jer stol vise nije bio na njoj. Nije bio WebKit hir nego regres.
     */
    const { handle } = montiraj({ startIndex: 2 });
    expect(handle.index).toBe(2);
    expect(sekcija.querySelector('[data-desk-count]')?.textContent).toBe('3 / 3');
  });

  it('polozaj se STISCE kad se popis u medjuvremenu skratio', () => {
    // Zanemarivanje nalaza skracuje popis; zapamcen polozaj tada moze pokazivati izvan njega.
    const { handle } = montiraj({ items: stavke().slice(0, 2), startIndex: 5 });
    expect(handle.index).toBe(1);
  });

  it('bez zapamcenog polozaja stol pocinje od prvog', () => {
    const { handle } = montiraj();
    expect(handle.index).toBe(0);
  });
});
