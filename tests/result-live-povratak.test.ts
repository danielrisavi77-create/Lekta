/**
 * Z34, Codex R1 (blokira): lijeni uvoz stola Z34 ima ROK, a istek roka, odbijen uvoz i iznimka pri
 * montazi vracaju POTPUN prikaz Z8 (stol, sazetak kategorija i DNA rada), ne prazan stol.
 *
 * Mjerilo potpunosti nije popis selektora nego ISTI kokpit bez Z34: prikaz nakon povratka mora
 * imati isti stol, istu kartu kategorija i istu DNA kao `renderResultsCockpit` kojem `live` nije
 * ni predan. Svaki put (rok, odbijanje, iznimka) ima vlastiti test i vlastitu kontrolu da se put
 * stvarno dogodio (`data-rl-povratak`), jer bi zeleni test bez nje mogao mjeriti obican Z8.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import { deskItems } from '../src/ui/results/desk-model';
import { buildDocumentDnaModel } from '../src/results/document-dna-model';
import type { ResultsCockpitOptions } from '../src/ui/results/results-cockpit';

const MODUL = '../src/ui/result-live/result-live';
const SESIJA = '../src/session/local-document-session';

function rezultat() {
  return {
    score: 81,
    scoredChecks: 9,
    file: { name: 'rad.docx' },
    profile: 'FPZG / Politologija / Diplomski rad',
    profileStatus: 'verified',
    issues: [
      { severity: 'warning', category: 'formatting', title: 'Desna margina odstupa od profila', detail: 'Izmjereno 2,0 cm.', where: 'Postavke stranice' },
      { severity: 'error', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', detail: 'Nema zapisa.', where: 'Odlomak 4' },
    ],
    checks: [],
    categories: { formatting: { earned: 20, max: 24 }, citations: { earned: 10, max: 20 } },
    details: {
      ruleAuthority: 'official-source',
      triage: {
        counts: { auto: 1, assisted: 0, manual: 1, total: 2 },
        findings: [{ id: 'novak', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', severity: 'error', fixability: 'manual', locations: [{ paragraphIndex: 4 }] }],
      },
    },
  } as never;
}

const DNA = buildDocumentDnaModel({
  totalParagraphs: 12,
  findings: [{ id: 'novak', category: 'citations', severity: 'error', title: '(Novak, 2022) nema zapis u literaturi', locations: [{ paragraphIndex: 4, anchorId: 'a4' }] }],
  lastPreviewedParagraph: 12,
  previewTruncated: false,
  headings: [],
  provisional: false,
});

type Render = typeof import('../src/ui/results/results-cockpit').renderResultsCockpit;

function nacrtaj(render: Render, live: boolean, analysisKey = 'test-analysis'): HTMLElement {
  const model = buildVisualResultModel(rezultat());
  const mount = document.createElement('section');
  document.body.append(mount);
  const opcije: ResultsCockpitOptions = {
    repairAvailable: true,
    documentDna: DNA,
    desk: {
      items: deskItems(model.findings.document, []),
      mountDocument: async () => null,
      // Plan sa zahvatom, da Z34 stvarno postavi ladicu u body (ciscenje djelomicne montaze).
      planItems: [{ ruleId: 'm', label: 'Margine', violated: true, matchKeys: ['Desna margina odstupa od profila'] }],
      ...(live ? { live: { preview: { paragraphs: [] }, storedPages: 3, checks: [], analysisKey } } : {}),
    },
  };
  render(mount, model, opcije);
  return mount;
}

/** Ono po cemu se Z8 razlikuje od praznog stola: stol, karta kategorija, DNA i kartica nalaza. */
function z8Otisak(mount: HTMLElement) {
  return {
    stol: !!mount.querySelector('[data-desk]'),
    kartica: mount.querySelector('[data-desk] [data-cockpit-finding] h3')?.textContent ?? null,
    kategorije: [...mount.querySelectorAll('[data-cockpit-category]')].map((k) => k.textContent),
    dna: mount.querySelector('[data-cockpit-dna]')?.outerHTML ?? null,
    z34: !!mount.querySelector('[data-rl]'),
    sekundarno: mount.querySelector('[data-cockpit-secondary]')?.innerHTML ?? null,
  };
}

async function referenca(): Promise<ReturnType<typeof z8Otisak>> {
  const { renderResultsCockpit } = await vi.importActual<typeof import('../src/ui/results/results-cockpit')>('../src/ui/results/results-cockpit');
  return z8Otisak(nacrtaj(renderResultsCockpit, false));
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock(MODUL);
  vi.doUnmock(SESIJA);
  vi.resetModules();
  document.body.innerHTML = '';
});

describe('Z34 Codex R1: povratak na potpun Z8', () => {
  it('KONTROLA: referentni Z8 ima stol, kategorije i DNA (inace test ne bi nista mjerio)', async () => {
    const z8 = await referenca();
    expect(z8.stol).toBe(true);
    expect(z8.kategorije.length).toBe(2);
    expect(z8.dna).toContain('data-cockpit-dna');
    expect(z8.z34).toBe(false);
    // Isti fixture s ispravnim modulom stvarno montira Z34 i ladicu (ono sto povratak mora pocistiti).
    const { renderResultsCockpit } = await import('../src/ui/results/results-cockpit');
    const z34 = nacrtaj(renderResultsCockpit, true);
    await vi.waitFor(() => expect(z34.dataset.rlReady).toBe('true'));
    expect(z8Otisak(z34).z34).toBe(true);
    expect(document.querySelectorAll('[data-rl-tray]')).toHaveLength(1);
    expect(z34.dataset.rlPovratak).toBeUndefined();
  });

  it('uvoz koji nikad ne zavrsi: nakon roka stoji potpun Z8, a kasni modul ne preuzima stol', async () => {
    const z8 = await referenca();
    vi.resetModules();
    let pusti: (m: unknown) => void = () => {};
    vi.doMock(MODUL, () => new Promise((res) => { pusti = res; }));
    const { renderResultsCockpit } = await import('../src/ui/results/results-cockpit');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const mount = nacrtaj(renderResultsCockpit, true);
    expect(z8Otisak(mount), 'puni Z8 ostaje vidljiv dok uvoz traje').toEqual(z8);
    expect(mount.dataset.rlPending).toBe('true');
    expect(mount.dataset.rlReady).toBeUndefined();
    expect(mount.querySelector('[data-rl-cekanje]')).toBeNull();
    expect(document.querySelectorAll('[data-rl-tray]')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mount.dataset.rlPovratak).toBe('rok');
    expect(mount.dataset.rlPending).toBeUndefined();
    expect(z8Otisak(mount)).toEqual(z8);
    expect(document.querySelectorAll('[data-rl-tray]')).toHaveLength(0);
    vi.useRealTimers();
    pusti(await vi.importActual(MODUL));
    await new Promise((r) => setTimeout(r, 0));
    expect(z8Otisak(mount), 'kasni modul ne smije zamijeniti Z8 pod prstima').toEqual(z8);
  });

  it('odbijen uvoz: potpun Z8 sa sazetkom kategorija i DNA', async () => {
    const z8 = await referenca();
    vi.resetModules();
    vi.doMock(MODUL, () => { throw new Error('mreza pala'); });
    const { renderResultsCockpit } = await import('../src/ui/results/results-cockpit');
    const mount = nacrtaj(renderResultsCockpit, true);
    await vi.waitFor(() => expect(mount.dataset.rlPovratak).toBe('uvoz'));
    expect(z8Otisak(mount)).toEqual(z8);
  });

  it('iznimka u mountResultLive: potpun Z8, bez ostataka Z34 (ladica, slusaci)', async () => {
    const z8 = await referenca();
    vi.resetModules();
    // Pravi modul krene (ladica u body, promatrac, slusaci na domacinu), pa padne USRED montaze:
    // citanje sesije za rok poziva se tek nakon ladice, pa kvar ondje ostavlja djelomicnu montazu.
    let pozvano = 0;
    vi.doMock(SESIJA, async () => ({
      ...(await vi.importActual<object>(SESIJA)),
      parseSessionFragment: () => { pozvano += 1; throw new Error('kvar pri montazi'); },
    }));
    const { renderResultsCockpit } = await import('../src/ui/results/results-cockpit');
    const greske: unknown[] = [];
    const hvataj = (e: PromiseRejectionEvent | ErrorEvent): void => { greske.push(e); };
    window.addEventListener('unhandledrejection', hvataj as EventListener);
    const mount = nacrtaj(renderResultsCockpit, true);
    await vi.waitFor(() => expect(mount.dataset.rlPovratak).toBe('montaza'));
    window.removeEventListener('unhandledrejection', hvataj as EventListener);
    expect(pozvano, 'KONTROLA: montaza je stvarno dosla do kvara').toBe(1);
    expect(z8Otisak(mount)).toEqual(z8);
    expect(document.querySelectorAll('[data-rl-tray]'), 'ladica djelomicne montaze je uklonjena').toHaveLength(0);
    expect(mount.dataset.rlReady).toBeUndefined();
    expect(greske).toEqual([]);
  });

  it('nakon povratka ponovno crtanje istog rezultata ostaje Z8 odmah, bez novog cekanja roka', async () => {
    const z8 = await referenca();
    vi.resetModules();
    vi.doMock(MODUL, () => { throw new Error('mreza pala'); });
    const { renderResultsCockpit } = await import('../src/ui/results/results-cockpit');
    const mount = nacrtaj(renderResultsCockpit, true);
    await vi.waitFor(() => expect(mount.dataset.rlPovratak).toBe('uvoz'));
    const model = buildVisualResultModel(rezultat());
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      documentDna: DNA,
      desk: { items: deskItems(model.findings.document, []), mountDocument: async () => null, planItems: [{ ruleId: 'm', label: 'Margine', violated: true, matchKeys: ['Desna margina odstupa od profila'] }], live: { preview: { paragraphs: [] }, storedPages: 3, checks: [] } },
    });
    expect(z8Otisak(mount), 'sinkrono, bez ponovnog praznog stola').toEqual(z8);
  });

  it('nova analiza istog naziva i ocjene ne naslijedi stanje stare analize', async () => {
    const { renderResultsCockpit } = await import('../src/ui/results/results-cockpit');
    const model = buildVisualResultModel(rezultat());
    const mount = document.createElement('section');
    document.body.append(mount);
    const opcije = (analysisKey: string): ResultsCockpitOptions => ({
      repairAvailable: true,
      documentDna: DNA,
      desk: {
        items: deskItems(model.findings.document, []),
        mountDocument: async () => null,
        planItems: [{ ruleId: 'm', label: 'Margine', violated: true, matchKeys: ['Desna margina odstupa od profila'] }],
        live: { preview: { paragraphs: [] }, storedPages: 3, checks: [], analysisKey },
      },
    });
    renderResultsCockpit(mount, model, opcije('analysis-a'));
    await vi.waitFor(() => expect(mount.dataset.rlReady).toBe('true'));
    const prvo = (mount as HTMLElement & { _live?: { stanje(): { cat: string } } })._live!;
    expect(prvo.stanje().cat).toBe('all');
    mount.querySelector<HTMLElement>('[data-rl-tab="Format"]')?.click();
    expect(prvo.stanje().cat).not.toBe('all');

    renderResultsCockpit(mount, model, opcije('analysis-b'));
    await vi.waitFor(() => expect((mount as HTMLElement & { _live?: { stanje(): { cat: string } } })._live).toBeTruthy());
    const drugo = (mount as HTMLElement & { _live?: { stanje(): { cat: string } } })._live!;
    expect(drugo.stanje().cat).toBe('all');
  });
});
