import { describe, expect, it, vi } from 'vitest';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import {
  cockpitSteps,
  cockpitStepsHtml,
  renderResultsCockpit,
  resultRendererFor,
  type ResultsCockpitAction,
  type ResultsCockpitOptions,
} from '../src/ui/results/results-cockpit';
import type { RepairOutlookModel } from '../src/ui/results/repair-outlook';

function result(overrides: Record<string, unknown> = {}) {
  return {
    score: 87,
    scoredChecks: 12,
    profile: 'FPZG / Politologija / Diplomski rad',
    profileStatus: 'verified',
    issues: [
      {
        severity: 'error',
        category: 'citations',
        title: 'Citirano nije prona\u0111eno u literaturi',
        detail: 'Provjeri navod Novak 2022 u popisu literature.',
        where: 'Odlomak 42',
      },
      {
        severity: 'warning',
        category: 'formatting',
        title: 'Desna margina odstupa od profila',
        detail: 'Izmjereno 2,0 cm, o\u010Dekivano pribli\u017Eno 2,5 cm.',
        where: 'Postavke stranice',
      },
      {
        severity: 'info',
        category: 'structure',
        title: 'Naslov mo\u017Eda koristi ru\u010Dno oblikovanje',
        detail: 'Provjeri Word stil naslova.',
        where: 'Odlomak 71',
      },
      {
        severity: 'warning',
        category: 'elements',
        title: 'Tablica nema prepoznat naslov',
        detail: 'Provjeri oznaku tablice.',
        where: 'Tablica 4',
      },
    ],
    checks: [],
    categories: {
      formatting: { earned: 20, max: 24 },
      structure: { earned: 18, max: 20 },
      citations: { earned: 19, max: 28 },
    },
    capabilities: { repair: true, preview: true },
    details: { ruleAuthority: 'official-source', triage: { counts: { auto: 1, assisted: 0, manual: 0, total: 1 }, findings: [{ id: 'citation', category: 'citations', title: 'Citirano nije prona\u0111eno u literaturi', severity: 'error', fixability: 'auto', fixId: 'citation-fixer', locations: [{ paragraphIndex: 42 }] }] } },
    ...overrides,
  } as never;
}

describe('Results Cockpit V1', () => {
  it('renders one clear status, one technical score and at most three priority findings', () => {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result());

    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      onAction: vi.fn(),
      onAdvancedToggle: vi.fn(),
    });

    expect(mount.querySelector('[data-cockpit-status]')).toBeTruthy();
    expect(mount.querySelectorAll('[data-cockpit-score]')).toHaveLength(1);
    expect(mount.querySelectorAll('[data-cockpit-finding]')).toHaveLength(3);
    expect(mount.textContent).toContain('Nije spremno za predaju');
    expect(mount.textContent).toContain('87');
    expect(mount.textContent).toContain('Citirano nije prona\u0111eno u literaturi');
    expect(mount.textContent).toContain('Za\u0161to');
    expect(mount.textContent).toContain('\u0160to napraviti');
  });

  it('keeps advanced checks behind one explicit disclosure', () => {
    const mount = document.createElement('section');
    renderResultsCockpit(mount, buildVisualResultModel(result()), {
      repairAvailable: false,
      onAction: vi.fn(),
      onAdvancedToggle: vi.fn(),
    });

    const advanced = mount.querySelector<HTMLElement>('[data-cockpit-advanced]');
    expect(advanced).toBeTruthy();
    expect(advanced?.getAttribute('aria-expanded')).toBe('false');
    expect(mount.querySelector('[data-cockpit-action="advanced"]')).toBeTruthy();
  });

  it('routes the primary action to the general repair entry', () => {
    const mount = document.createElement('section');
    const onAction = vi.fn<(action: ResultsCockpitAction) => void>();
    const model = buildVisualResultModel(result());
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      onAction,
      onAdvancedToggle: vi.fn(),
    });

    mount.querySelector<HTMLButtonElement>('[data-cockpit-primary]')?.click();

    // OPCI ULAZ, ne ulaz u prvi popravljiv nalaz iz `findings.top`: vidi `primaryAction`.
    expect(onAction).toHaveBeenCalledWith({ kind: 'repair-safe' });
  });

  it('lets the user open a finding location and the advanced layer', () => {
    const mount = document.createElement('section');
    const onAction = vi.fn<(action: ResultsCockpitAction) => void>();
    const onAdvancedToggle = vi.fn();
    const model = buildVisualResultModel(result());
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      onAction,
      onAdvancedToggle,
    });

    mount.querySelector<HTMLButtonElement>('[data-finding-jump]')?.click();
    mount.querySelector<HTMLButtonElement>('[data-cockpit-advanced]')?.click();

    expect(onAction).toHaveBeenCalledWith({
      kind: 'preview',
      findingId: model.findings.top[0]?.id,
    });
    expect(onAdvancedToggle).toHaveBeenCalledWith(true);
  });

  it('zadrzava rucne odluke na prioritetnom nalazu', () => {
    const mount = document.createElement('section');
    const onAction = vi.fn<(action: ResultsCockpitAction) => void>();
    const model = buildVisualResultModel(result());

    renderResultsCockpit(mount, model, { repairAvailable: true, onAction });
    mount.querySelector<HTMLButtonElement>('[data-finding-confirm]')?.click();
    expect(onAction).toHaveBeenCalledWith({ kind: 'confirm', findingId: model.findings.top[0]?.id });
    mount.querySelector<HTMLButtonElement>('[data-finding-ignore]')?.click();
    const input = mount.querySelector<HTMLInputElement>('[data-finding-ignore-reason]');
    if (input) input.value = 'Potvrdeno s mentorom';
    mount.querySelector<HTMLButtonElement>('[data-finding-ignore-save]')?.click();
    expect(onAction).toHaveBeenLastCalledWith({ kind: 'ignore', findingId: model.findings.top[0]?.id, reason: 'Potvrdeno s mentorom' });
  });

  it('prikazuje kategorije kao sekundarne trake bez drugog glavnog indikatora', () => {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result());

    renderResultsCockpit(mount, model, { repairAvailable: true });

    expect(model.categories).toHaveLength(3);
    expect(mount.querySelectorAll('[data-cockpit-category]')).toHaveLength(3);
    expect(mount.querySelectorAll('[data-cockpit-score]')).toHaveLength(1);
    expect(mount.textContent).toContain('Oblikovanje');
    expect(mount.querySelector('[data-cockpit-category="formatting"] [role="progressbar"]')).toBeTruthy();
  });

  it('izvodi stvarne signale spremnosti iz nalaza, provjera i triage podataka', () => {
    const model = buildVisualResultModel(result({
      checks: [
        { category: 'formatting', title: 'Font', status: 'pass', earned: 2, max: 2, detail: '', issue: null, scored: true },
        { category: 'formatting', title: 'Margine', status: 'fail', earned: 0, max: 2, detail: '', issue: null, scored: true },
        { category: 'structure', title: 'Informativna provjera', status: 'informational', earned: 0, max: 0, detail: '', issue: null, scored: false },
      ],
      details: { triage: { counts: { auto: 3, assisted: 1, manual: 2, total: 6 }, findings: [] }, ruleAuthority: 'official-source' },
    }));

    expect(model.signals).toMatchObject({
      blockers: 1,
      warnings: 2,
      manualReviews: 1,
      automaticFixes: 3,
      informationalChecks: 1,
      totalChecks: 3,
    });
  });

  it('ne prikazuje izmišljenu ocjenu kada nema bodovanih provjera', () => {
    const model = buildVisualResultModel(result({ score: 92, scoredChecks: 0, checks: [] }));

    expect(model.score.kind).toBe('unscored');
  });

  it('izlaže sažete podatke dokumenta u zaglavlju', () => {
    const model = buildVisualResultModel(result({
      file: { name: 'DIPLOMSKI_RAD.docx' },
    }));

    expect(model.header).toMatchObject({
      documentName: 'DIPLOMSKI_RAD.docx',
      profile: 'FPZG / Politologija / Diplomski rad',
      profileConfirmed: true,
    });
  });

  it('sazetak nalaza je glavni pokazatelj, a ocjena sporedna', () => {
    /**
     * Do 2026-09-07 je ovdje stajao Readiness Halo: tamni uredaj s tri sloja prstena oko ocjene.
     * Brif vlasnika ga uklanja jer je ocjeni davao autoritet koji pripada nalazima. Namjera testa
     * je ista kao prije (JEDAN glavni pokazatelj, brojke iz stvarnih signala), promijenio se prikaz.
     */
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result({ file: { name: 'DIPLOMSKI_RAD.docx' } }));

    renderResultsCockpit(mount, model, { repairAvailable: true });

    expect(mount.querySelectorAll('[data-cockpit-score]')).toHaveLength(1);
    expect(mount.querySelector('[data-finding-summary]')).toBeTruthy();
    // Halo i njegovi slojevi vise ne postoje; povratak bi znacio povratak stare hijerarhije.
    expect(mount.querySelector('[data-readiness-halo]')).toBeNull();
    expect(mount.querySelectorAll('[data-halo-layer]')).toHaveLength(0);

    // Razine su particija po ozbiljnosti: moraju se zbrojiti u broj iz naslova. Tvrdnja pada ako
    // se u taj stupac ikad uvuce redak s druge osi (automatski popravci).
    const razine = [...mount.querySelectorAll('.fsum-razina b')].map((b) => Number(b.textContent));
    const naslov = mount.querySelector('.fsum-naslov')?.textContent ?? '';
    expect(razine.length).toBeGreaterThan(0);
    expect(razine.reduce((a, b) => a + b, 0)).toBe(Number(naslov.match(/^\d+/)?.[0]));
    // Automatski popravci stoje IZVAN tog zbroja, uz "od toga".
    expect(mount.querySelector('.fsum-auto')?.textContent).toContain('od toga');
  });

  it('kod nebodovanog rezultata prikazuje provjerena pravila bez izmišljene ocjene', () => {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result({
      score: null,
      scoredChecks: 0,
      checks: [
        { category: 'formatting', title: 'A', status: 'informational', earned: 0, max: 0, detail: '', issue: null, scored: false },
        { category: 'structure', title: 'B', status: 'informational', earned: 0, max: 0, detail: '', issue: null, scored: false },
        { category: 'citations', title: 'C', status: 'informational', earned: 0, max: 0, detail: '', issue: null, scored: false },
        { category: 'elements', title: 'D', status: 'informational', earned: 0, max: 0, detail: '', issue: null, scored: false },
      ],
    }));

    renderResultsCockpit(mount, model, { repairAvailable: false });

    const score = mount.querySelector('[data-cockpit-score]');
    expect(score?.textContent).not.toContain('/ 100');
    expect(mount.textContent).toContain('Provjereno 4 pravila');
    expect(mount.textContent).not.toContain('92');
  });

  it('prikazuje dokument, profil i autoritet izvora u eyebrowu lista presude', () => {
    /**
     * Z8: zaglavlje (`cockpit-header`) i zaseban blok autoriteta (`cockpit-authority`) su ukinuti;
     * sve troje stoji u JEDNOM retku iznad presude. Namjera tvrdnje je ista kao prije: tri podatka
     * o tome STO je mjereno i PO CEMU moraju biti na ekranu prije presude.
     */
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result({ file: { name: 'DIPLOMSKI_RAD.docx' } }));

    renderResultsCockpit(mount, model, { repairAvailable: true });

    expect(mount.querySelector('[data-cockpit-eyebrow]')?.textContent).toContain('DIPLOMSKI_RAD.docx');
    expect(mount.textContent).toContain('FPZG / Politologija / Diplomski rad');
    expect(mount.textContent).toContain('Provjereni fakultetski izvor');
  });

  it('usmjerava preostale akcije lista presude na postojeće callbacke', () => {
    /**
     * Z8 gasi redak s TRI gumba: "Pregledaj nalaze", "Simuliraj popravak" i "Popravi sigurne
     * stavke" vodili su u isti panel, pa je izbor medu njima bio lazan. Ostaje jedan primarni
     * gumb i jedna tekstualna poveznica. RADNJE ostaju iste: primarni gumb i dalje emitira
     * `repair-safe`, samo ih je sada jedan umjesto tri.
     */
    const mount = document.createElement('section');
    const onAction = vi.fn<(action: ResultsCockpitAction) => void>();
    const model = buildVisualResultModel(result());

    renderResultsCockpit(mount, model, { repairAvailable: true, onAction });
    mount.querySelector<HTMLButtonElement>('[data-cockpit-action="open-findings"]')?.click();

    expect(onAction).toHaveBeenNthCalledWith(1, { kind: 'open-findings' });
    // Tri gumba su pala na jedan: `simulate-repair` i `repair-safe` se ne crtaju istovremeno.
    expect(mount.querySelectorAll('[data-cockpit-action="simulate-repair"]')).toHaveLength(0);
    expect(mount.querySelectorAll('[data-cockpit-action="repair-safe"]')).toHaveLength(1);
    expect(mount.querySelectorAll('[data-cockpit-primary]')).toHaveLength(1);
  });

  it('uses cockpit by default and allows an explicit legacy opt-out', () => {
    expect(resultRendererFor(document)).toBe('cockpit');
    const cockpitView = document.implementation.createHTMLDocument('cockpit');
    cockpitView.documentElement.dataset.resultRenderer = 'cockpit';
    Object.defineProperty(cockpitView, 'defaultView', { value: { location: { search: '' } } });
    expect(resultRendererFor(cockpitView)).toBe('cockpit');
    const legacyView = document.implementation.createHTMLDocument('legacy');
    legacyView.documentElement.dataset.resultRenderer = 'cockpit';
    Object.defineProperty(legacyView, 'defaultView', { value: { location: { search: '?resultRenderer=legacy' } } });
    expect(resultRendererFor(legacyView)).toBe('legacy');
  });

  it('exposes the correction-desk visual structure without changing the result contract', () => {
    const mount = document.createElement('section');
    renderResultsCockpit(mount, buildVisualResultModel(result()), { repairAvailable: true });

    expect(mount.dataset.cockpitExperience).toBe('correction-desk');
    expect(mount.querySelector('[data-cockpit-verdict-sheet]')).toBeTruthy();
    expect(mount.querySelectorAll('[data-cockpit-priority-card]')).toHaveLength(3);
  });
});

/**
 * Z8, PRVI KRUG: ekran `/rad/` kao vodic u cetiri koraka.
 *
 * Svaka tvrdnja ovdje ima MUTACIJU uz sebe: gard koji nije vidio vlastiti kvar ne dokazuje nista,
 * a upravo ovaj sloj (prikaz) najlakse tiho odluta od modela.
 */
describe('Z8: stepper, list presude, pager i sekundarni listovi', () => {
  const OUTLOOK: RepairOutlookModel = {
    kind: 'available',
    currentScore: 87,
    ceilingScore: 94,
    headroom: 7,
    counts: { auto: 1, assisted: 0, manual: 2 },
    manualItems: [],
    preselected: 1,
    atCeiling: false,
  };

  function renderaj(over: Record<string, unknown> = {}, options: Partial<ResultsCockpitOptions> = {}) {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result(over));
    renderResultsCockpit(mount, model, { repairAvailable: true, ...options });
    return { mount, model };
  }

  /** Stol s pravim nalazima; dokument se ne crta, jer faksimil nije predmet ove tvrdnje. */
  function saStolom(over: Record<string, unknown> = {}) {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result(over));
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      desk: {
        items: model.findings.document.map((finding) => ({ finding, flagIndex: null })),
        mountDocument: async () => null,
      },
    });
    return { mount, model };
  }

  const klik = (el: Element | null) => (el as HTMLElement | null)?.click();

  it('stepper ima cetiri koraka i tocno jedan aktivan', () => {
    const { mount } = renderaj();
    const koraci = [...mount.querySelectorAll('[data-cockpit-steps] .cockpit-step')];

    expect(koraci).toHaveLength(4);
    expect(koraci.map((k) => k.textContent)).toEqual(['01 Nalazi', '02 Plan', '03 Plaćanje', '04 Rezultat']);
    expect(koraci.filter((k) => k.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(koraci[0].getAttribute('aria-current')).toBe('step');
    expect(koraci[0].classList.contains('cockpit-step--active')).toBe(true);
  });

  it('neaktivni koraci su aria-disabled, a NE disabled, jer nisu kontrole', () => {
    const { mount } = renderaj();
    const neaktivni = [...mount.querySelectorAll('[data-cockpit-steps] .cockpit-step')].slice(1);

    expect(neaktivni).toHaveLength(3);
    for (const korak of neaktivni) {
      expect(korak.getAttribute('aria-disabled')).toBe('true');
      // `disabled` na `li` preglednik tiho zanemari, pa bi korak izgledao dostupan.
      expect(korak.hasAttribute('disabled')).toBe(false);
      expect(korak.tagName).toBe('LI');
    }
  });

  it('stanje analize nema korake, jer nalaza jos nema', () => {
    expect(cockpitSteps('scanning')).toEqual([]);
    expect(cockpitStepsHtml(cockpitSteps('scanning'))).toBe('');
    expect(cockpitSteps('findings')).toHaveLength(4);
  });

  it('MUTACIJA: dva aktivna koraka i korak s `disabled` padaju na istim tvrdnjama', () => {
    const dvaAktivna = cockpitSteps('findings').map((k) => ({ ...k, active: true }));
    const html = cockpitStepsHtml(dvaAktivna);
    expect((html.match(/aria-current="step"/g) ?? []).length).not.toBe(1);
    // Kontrola: neizmijenjen niz i dalje daje tocno jedan aktivan.
    expect((cockpitStepsHtml(cockpitSteps('findings')).match(/aria-current="step"/g) ?? []).length).toBe(1);
  });

  it('list presude nosi TOCNO JEDAN primarni gumb', () => {
    const { mount } = renderaj();
    const list = mount.querySelector<HTMLElement>('[data-cockpit-verdict-sheet]');

    expect(list).toBeTruthy();
    expect(list!.querySelectorAll('button.button-primary')).toHaveLength(1);
    expect(list!.querySelector('[data-cockpit-primary]')?.textContent).toContain('Napravi plan popravka');
    expect(list!.querySelector('[data-cockpit-action="open-findings"]')?.textContent).toContain('Pregledaj nalaze');
  });

  it('MUTACIJA: broj primarnih gumba ostaje JEDAN i kad ULAZ promijeni koju radnju gumb nosi', () => {
    // Prava mutacija mijenja ULAZ i ponovno renderira, umjesto da doda gumb izravno u vec
    // iscrtan DOM: ono drugo bi prosao i predikat bez obzira crta li `renderResultsCockpit`
    // ijedan gumb ili deset, jer bi test sam dodao onaj koji broji.
    //
    // `repairAvailable: false` mijenja `primaryAction` u DRUGU granu (nema opceg ulaza u popravak,
    // natpis postaje "Otvori prvi nalaz"), a ugovor "tocno jedan primarni gumb" mora vrijediti i
    // ovdje, ne samo na baseline granu s popravkom.
    const bezPopravka = renderaj({}, { repairAvailable: false });
    const listBez = bezPopravka.mount.querySelector<HTMLElement>('[data-cockpit-verdict-sheet]')!;
    expect(listBez.querySelectorAll('button.button-primary')).toHaveLength(1);
    expect(listBez.querySelector('[data-cockpit-primary]')?.textContent).toContain('Otvori prvi nalaz');

    const sPopravkom = renderaj();
    const listS = sPopravkom.mount.querySelector<HTMLElement>('[data-cockpit-verdict-sheet]')!;
    expect(listS.querySelectorAll('button.button-primary')).toHaveLength(1);
    expect(listS.querySelector('[data-cockpit-primary]')?.textContent).not.toContain('Otvori prvi nalaz');
  });

  it('eyebrow spaja ime datoteke, profil i autoritet izvora u jedan redak', () => {
    const { mount, model } = renderaj({ file: { name: 'DIPLOMSKI_RAD.docx' } });
    const eyebrow = mount.querySelector('[data-cockpit-eyebrow]')?.textContent ?? '';

    expect(eyebrow).toContain('DIPLOMSKI_RAD.docx');
    expect(eyebrow).toContain('FPZG / Politologija / Diplomski rad');
    // AUTORITET IZVORA je `model.authority.label`, a ne `header.authorityLabel` (opseg provjere):
    // to su dvije razlicite tvrdnje i eyebrow nosi onu o IZVORU.
    expect(model.authority.label).toBe('Provjereni fakultetski izvor');
    expect(eyebrow).toContain(model.authority.label);
    // Zaseban blok autoriteta je ukinut; tvrdnja pada ako se vrati.
    expect(mount.querySelector('[data-cockpit-authority]')).toBeNull();
  });

  it('redoslijed lista presude je eyebrow -> H1 -> sazetak -> ograda -> gumb + poveznica', () => {
    /**
     * ALIGNMENT Z8 (popravak drugog kruga): ograda izvora ide ISPOD sazetka, ne izmedju eyebrowa
     * i H1, jer ogranicava upravo procitanu tvrdnju. `cockpit-marks` uopce nije dijete
     * `cockpit-sheet__lead`; stoji uz prsten presude.
     */
    const { mount } = renderaj();
    const lead = mount.querySelector<HTMLElement>('[data-cockpit-sheet-lead]')!;
    const djeca = [...lead.children];
    const indeks = (selector: string) => djeca.findIndex((el) => el.matches(selector));

    const iEyebrow = indeks('[data-cockpit-eyebrow]');
    const iNaslov = indeks('[data-cockpit-verdict-title]');
    const iSazetak = indeks('[data-finding-summary]');
    const iOgrada = indeks('[data-cockpit-caveat]');
    const iRadnje = indeks('.cockpit-sheet__actions');

    expect([iEyebrow, iNaslov, iSazetak, iOgrada, iRadnje]).toEqual([0, 1, 2, 3, 4]);
    // `cockpit-marks` NIJE dijete lista presude: stoji uz prsten (`verdictRingHtml`).
    expect(lead.querySelector('.cockpit-marks')).toBeNull();
    expect(mount.querySelector('.cockpit-ring-wrap .cockpit-marks')).not.toBeNull();
  });

  it('MUTACIJA: ograda prije H1 (stari raspored) pada na tvrdnji o redoslijedu', () => {
    // Prava mutacija mijenja ULAZ tako da renderer proizvede DRUGACIJI, ali i dalje STVARAN DOM
    // (ovdje: rucno sastavljen ekvivalent stare, pogresne izvedbe Z8), i tvrdi da gard koji cuva
    // redoslijed pada na njemu. Ne mijenja se vec iscrtan ispravan DOM.
    const stariRaspored = document.createElement('div');
    stariRaspored.dataset.cockpitSheetLead = '';
    stariRaspored.innerHTML = '<p data-cockpit-eyebrow>eyebrow</p>'
      + '<p class="cockpit-marks">marks</p>'
      + '<p data-cockpit-caveat="verified">ograda</p>'
      + '<h1 data-cockpit-verdict-title>Presuda</h1>'
      + '<div data-finding-summary>sazetak</div>'
      + '<div class="cockpit-sheet__actions">radnje</div>';

    const djeca = [...stariRaspored.children];
    const indeks = (selector: string) => djeca.findIndex((el) => el.matches(selector));
    const poredak = [
      indeks('[data-cockpit-eyebrow]'),
      indeks('[data-cockpit-verdict-title]'),
      indeks('[data-finding-summary]'),
      indeks('[data-cockpit-caveat]'),
      indeks('.cockpit-sheet__actions'),
    ];
    expect(poredak).not.toEqual([0, 1, 2, 3, 4]);
  });

  it('ograda ogradjenog profila ostaje na listu presude, ne nestaje s ekrana', () => {
    /**
     * Prva izvedba Z8 je autoritet uzela iz `header.authorityLabel`, pa `model.authority` vise
     * nijedan prikaz nije citao: recenica "nalazi su moguca odstupanja, ne potvrdjeni zahtjevi"
     * nestala je s ekrana umjesto da se premjesti. Ograda je tvrdnja o tome koliko izvor obvezuje
     * i mora stajati uz presudu.
     */
    const { mount, model } = renderaj({ profileStatus: 'draft', details: { ruleAuthority: 'institution' } });

    expect(model.authority.kind).toBe('limited');
    expect(mount.querySelector('[data-cockpit-eyebrow]')?.textContent).toContain('Djelomično provjeren izvor');
    expect(mount.querySelector('[data-cockpit-caveat]')?.textContent).toBe(model.authority.description);
    expect(mount.textContent).toContain('moguća odstupanja');
  });

  it('MUTACIJA: ograda koja se cita iz krivog polja modela ne prati autoritet izvora', () => {
    // Kontrola: ogradjen profil ima DRUGU ogradu od provjerenog. Da prikaz cita `header`, oba bi
    // ekrana nosila isti tekst i ova bi tvrdnja pala.
    const ogradjen = renderaj({ profileStatus: 'draft', details: { ruleAuthority: 'institution' } });
    const provjeren = renderaj();
    const a = ogradjen.mount.querySelector('[data-cockpit-caveat]')?.textContent ?? '';
    const b = provjeren.mount.querySelector('[data-cockpit-caveat]')?.textContent ?? '';

    expect(a).not.toBe('');
    expect(b).not.toBe('');
    expect(a === b).toBe(false);
  });

  it('opci ulaz u popravak stoji na primarnom gumbu i kad vodeca tri nalaza nisu popravljiva', () => {
    /**
     * UGOVOR `repair-entry`: kad je popravak dostupan, ulaz postoji UVIJEK i tocno jednom. Prva
     * izvedba Z8 ga je vezala uz prvi popravljiv nalaz iz `findings.top`, pa je dokument kojem su
     * sva tri vodeca nalaza nepopravljiva ostajao bez ijednog ulaza. Sest Playwright specova
     * (`repair-panel`, `repair-cta-opens-panel`, `repair-selection-restore`, `workspace-a11y`,
     * `workspace-viewports`, `ux-dist/critical-path`) trazi bas taj atribut unutar `#resultCockpit`.
     */
    const bezPopravka = {
      capabilities: { repair: false, preview: true },
      details: {
        ruleAuthority: 'official-source',
        triage: { counts: { auto: 2, assisted: 0, manual: 0, total: 2 }, findings: [] },
      },
    };
    const { mount } = renderaj(bezPopravka);
    const gumb = mount.querySelector<HTMLElement>('[data-cockpit-primary]');

    expect(mount.querySelectorAll('[data-testid="repair-entry"]')).toHaveLength(1);
    expect(gumb?.dataset.testid).toBe('repair-entry');
    expect(gumb?.dataset.cockpitAction).toBe('repair-safe');
    expect(gumb?.hasAttribute('disabled')).toBe(false);
  });

  it('bez ijedne automatske stavke ulaz je simulacija, jer plan popravka nad praznim skupom laze', () => {
    const { mount } = renderaj({
      details: {
        ruleAuthority: 'official-source',
        triage: { counts: { auto: 0, assisted: 1, manual: 2, total: 3 }, findings: [] },
      },
    });
    const gumb = mount.querySelector<HTMLElement>('[data-cockpit-primary]');

    expect(gumb?.dataset.cockpitAction).toBe('simulate-repair');
    expect(gumb?.textContent).toContain('Simuliraj popravak');
    expect(gumb?.dataset.testid).toBe('repair-entry');
  });

  it('bez dostupnog popravka nema oznake ulaza, jer bi tvrdila ponudu koje nema', () => {
    const { mount } = renderaj({}, { repairAvailable: false });

    expect(mount.querySelectorAll('[data-testid="repair-entry"]')).toHaveLength(0);
    expect(mount.querySelector('[data-cockpit-primary]')?.textContent).toContain('Otvori prvi nalaz');
  });

  it('MUTACIJA: ulaz vezan uz prva tri nalaza pada na dokumentu bez popravljivog vodeceg nalaza', () => {
    // Stara izvedba: `findings.top.find((f) => f.capabilities.repair)`. Nad istim modelom vraca
    // `undefined`, dakle nijedan ulaz; nova izvedba ga ipak daje.
    const { mount, model } = renderaj({
      capabilities: { repair: false, preview: true },
      details: {
        ruleAuthority: 'official-source',
        triage: { counts: { auto: 2, assisted: 0, manual: 0, total: 2 }, findings: [] },
      },
    });

    expect(model.findings.top.some((nalaz) => nalaz.capabilities.repair)).toBe(false);
    expect(mount.querySelectorAll('[data-testid="repair-entry"]').length === 0).toBe(false);
  });

  it('spojena rečenica nosi OBA broja kad je strop poznat', () => {
    const { mount } = renderaj({}, { repairOutlook: OUTLOOK });
    const redak = mount.querySelector('.fsum-auto')?.textContent ?? '';

    expect(redak).toContain('od toga');
    expect(redak).toContain('mogu popraviti automatski');
    expect(redak).toContain('automatika može doseći najviše');
    expect(redak).toContain('94');
  });

  it('bez poznatog stropa druga polovica rečenice izostaje umjesto da se izmisli broj', () => {
    const { mount } = renderaj({}, {
      repairOutlook: { kind: 'unavailable', reason: 'Ovaj profil nema bodovanih provjera.' },
    });
    const redak = mount.querySelector('.fsum-auto')?.textContent ?? '';

    expect(redak).toContain('mogu popraviti automatski');
    expect(redak).not.toContain('automatika može doseći');
    expect(redak).not.toContain('94');
  });

  it('MUTACIJA: strop koji se cita mimo modela ne bi pratio model', () => {
    // Prava brojka dolazi iz `repairOutlook.ceilingScore`. Fiksni 88 iz predloska bi prosao na
    // jednom profilu i lagao na svakom drugom.
    const sStropom = renderaj({}, { repairOutlook: { ...OUTLOOK, ceilingScore: 71 } });
    const redak = sStropom.mount.querySelector('.fsum-auto')?.textContent ?? '';
    expect(redak).toContain('71');
    expect(redak.includes('88')).toBe(false);
  });

  it('prsten nosi ton presude, a ne ton ocjene', () => {
    const { mount } = renderaj();
    const prsten = mount.querySelector<HTMLElement>('[data-cockpit-score]');
    const list = mount.querySelector<HTMLElement>('[data-cockpit-verdict-sheet]');

    expect(prsten?.dataset.verdictTone).toBe('blocked');
    expect(prsten?.dataset.verdictTone).toBe(list?.dataset.cockpitStatus);
  });

  it('MUTACIJA: prsten prati ton presude i kad ULAZ promijeni presudu u "clear"', () => {
    // Prava mutacija mijenja ULAZ, ne vec iscrtan DOM: bez blokatora, dorada i rucnih provjera
    // `resultReadiness` vraca `clear`, sto je DRUGI ton od baseline `blocked` testa iznad. Da je
    // `verdictRingHtml` pozvan s prepisanim ili fiksnim tonom (npr. uvijek 'blocked'), ova tvrdnja
    // bi pala na ovom, drugom modelu, dok bi baseline i dalje bio zelen.
    const { mount } = renderaj({ issues: [] });
    const prsten = mount.querySelector<HTMLElement>('[data-cockpit-score]');
    const list = mount.querySelector<HTMLElement>('[data-cockpit-verdict-sheet]');

    expect(list?.dataset.cockpitStatus).toBe('clear');
    expect(prsten?.dataset.verdictTone).toBe('clear');
    expect(prsten?.dataset.verdictTone).toBe(list?.dataset.cockpitStatus);
    expect(prsten?.dataset.verdictTone).not.toBe('blocked');
  });

  it('pečat stoji IZVAN elementa s tekstom presude', () => {
    const { mount } = renderaj();
    const pecat = mount.querySelector<HTMLElement>('[data-cockpit-stamp]');
    const presuda = mount.querySelector<HTMLElement>('[data-cockpit-verdict-title]');

    expect(pecat).toBeTruthy();
    expect(presuda?.textContent).toContain('Nije spremno za predaju');
    // Struktura, ne pikseli: pecat nije potomak ni presude ni lijevog stupca s tekstom.
    expect(presuda!.contains(pecat!)).toBe(false);
    expect(mount.querySelector<HTMLElement>('[data-cockpit-sheet-lead]')!.contains(pecat!)).toBe(false);
  });

  it('desni pano stola prikazuje JEDNU karticu, a strelice mijenjaju prikazanu', () => {
    const { mount, model } = saStolom();
    const naslov = () => mount.querySelector('[data-desk-pane] .cockpit-finding h3')?.textContent;

    expect(model.findings.document.length).toBeGreaterThan(1);
    expect(mount.querySelectorAll('[data-desk-pane] article.cockpit-finding')).toHaveLength(1);
    expect(mount.querySelector('[data-desk-pane] [data-desk-count]')?.textContent)
      .toBe(`1 od ${model.findings.document.length}`);
    const prvi = naslov();

    klik(mount.querySelector('[data-desk-pane] .desk-nav__btn--next'));
    expect(mount.querySelector('[data-desk-pane] [data-desk-count]')?.textContent)
      .toBe(`2 od ${model.findings.document.length}`);
    expect(naslov()).not.toBe(prvi);

    klik(mount.querySelector('[data-desk-pane] .desk-nav__btn--prev'));
    expect(naslov()).toBe(prvi);
  });

  it('red čekanja stoji ISPOD kartice i nabraja sve nalaze', () => {
    /**
     * Z8 vadi karticu iz reda cekanja i daje joj pager; red cekanja se time NE ukida (Z9 ga
     * izricito trazi ispod kartice, a `tests/ux/korektorski-stol.spec.ts` ga mjeri kao ugovor).
     * Detalj vise NE zivi u retku, inace bi isti nalaz bio nacrtan dvaput.
     */
    const { mount, model } = saStolom();
    const redci = [...mount.querySelectorAll('[data-desk-queue] .dq-item')];
    const kartica = mount.querySelector<HTMLElement>('[data-desk-pane] article.cockpit-finding');
    const popis = mount.querySelector<HTMLElement>('[data-desk-queue]');

    expect(redci).toHaveLength(model.findings.document.length);
    expect(mount.querySelectorAll('[data-desk-queue] .cockpit-finding')).toHaveLength(0);
    expect(mount.querySelectorAll('[data-desk-queue] .dq-item--open')).toHaveLength(1);
    // Struktura, ne pikseli: popis slijedi karticu unutar istog panoa.
    const djeca = [...(kartica!.parentElement?.children ?? [])];
    expect(djeca.indexOf(popis!)).toBeGreaterThan(djeca.indexOf(kartica!));
  });

  it('MUTACIJA: red čekanja prati BROJ nalaza kojih stol dobije, ne fiksnu brojku', () => {
    // Prava mutacija mijenja ULAZ (koliko nalaza stol dobije) i ponovno renderira, umjesto da
    // rucno makne redke iz vec iscrtanog DOM-a: to drugo bi bilo istinito bez obzira crta li
    // `queueRedci` uopce iz `svi`, pa gard ne bi hvatao regresiju u pravom kodu.
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result());
    expect(model.findings.document.length).toBeGreaterThan(1);
    // ULAZ je namjerno OSAKACEN na jedan nalaz, kao da bi pozivatelj (buduci bug) proslijedio
    // samo prikazani umjesto SVIH: ako `queueRedci` prestane citati `desk.items` i pocne crtati
    // fiksan broj redaka, ova tvrdnja pada.
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      desk: {
        items: model.findings.document.slice(0, 1).map((finding) => ({ finding, flagIndex: null })),
        mountDocument: async () => null,
      },
    });
    const popis = mount.querySelector<HTMLElement>('[data-desk-queue]')!;
    expect(popis.querySelectorAll('.dq-item')).toHaveLength(1);
    expect(popis.querySelectorAll('.dq-item').length === model.findings.document.length).toBe(false);
  });

  it('`#resultCockpit article.cockpit-finding` i dalje pogađa barem jednu karticu', () => {
    // Ugovor koji `tests/ux/desktop-flow.spec.ts` broji. Pager prikazuje jednu po jednu, pa je
    // broj tocno 1; spec trazi samo "vise od nule", pa ostaje zelen bez izmjene.
    const { mount } = saStolom();
    expect(mount.querySelectorAll('article.cockpit-finding').length).toBeGreaterThan(0);
  });

  it('DNA i kategorije stoje u jednom redu ISPOD stola', () => {
    const { mount } = saStolom();
    const sekundarni = mount.querySelector<HTMLElement>('[data-cockpit-secondary]');
    const stol = mount.querySelector<HTMLElement>('.cockpit-priority');

    expect(sekundarni).toBeTruthy();
    expect(sekundarni!.querySelector('[data-cockpit-category]')).toBeTruthy();
    const djeca = [...mount.children];
    expect(djeca.indexOf(sekundarni!)).toBeGreaterThan(djeca.indexOf(stol!));
  });

  it('poveznica "Sve provjere (N)" nosi STVARAN broj provjera i vodi na napredni panel', () => {
    const provjere = [
      { category: 'formatting', title: 'A', status: 'pass', earned: 2, max: 2, detail: '', issue: null, scored: true },
      { category: 'formatting', title: 'B', status: 'fail', earned: 0, max: 2, detail: '', issue: null, scored: true },
      { category: 'structure', title: 'C', status: 'informational', earned: 0, max: 0, detail: '', issue: null, scored: false },
    ];
    const onAdvancedToggle = vi.fn();
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result({ checks: provjere }));
    renderResultsCockpit(mount, model, { repairAvailable: true, onAdvancedToggle });

    const veza = mount.querySelector<HTMLElement>('[data-cockpit-advanced]');
    expect(model.signals.totalChecks).toBe(3);
    expect(veza?.textContent).toBe('Sve provjere (3)');
    expect(mount.querySelector('.cockpit-advanced-toggle')).toBeNull();
    veza?.click();
    expect(onAdvancedToggle).toHaveBeenCalledWith(true);
  });

  it('MUTACIJA: fiksan broj provjera iz predloška ne prati model', () => {
    const mount = document.createElement('section');
    const model = buildVisualResultModel(result({
      checks: [{ category: 'formatting', title: 'A', status: 'pass', earned: 2, max: 2, detail: '', issue: null, scored: true }],
    }));
    renderResultsCockpit(mount, model, { repairAvailable: true });

    const tekst = mount.querySelector('[data-cockpit-advanced]')?.textContent;
    expect(tekst).toBe(`Sve provjere (${model.signals.totalChecks})`);
    // Predlozak pise "(24)"; da je brojka prepisana, tvrdnja iznad bi pala na svakom drugom radu.
    expect(tekst === 'Sve provjere (24)').toBe(false);
  });

  it('zasebna sekcija "Sto automatika moze" je uklonjena iz DOM-a', () => {
    const { mount } = renderaj({}, { repairOutlook: OUTLOOK });
    expect(mount.querySelector('[data-cockpit-outlook]')).toBeNull();
    // Model se i dalje koristi: strop je u sazetku.
    expect(mount.querySelector('.fsum-auto')?.textContent).toContain('94');
  });
});
