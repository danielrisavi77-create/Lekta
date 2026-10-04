/**
 * REZULTAT: SVE U JEDNOM (ALIGNMENT Z34): model, prikaz i gardovi.
 *
 * Dokazuje se ISTINITOST, ne izgled:
 *   - filtar kategorija daje "Citati 1 od 1" i kategorija bez nalaza je kvacica bez klika;
 *   - zeleni luk je `repairOutlook.ceilingScore` i NE mijenja se kad se zahvat ukljuci ili iskljuci;
 *     mijenja se samo broj zahvata u ladici (odluka vlasnika: bodovi po zahvatu ne postoje);
 *   - nigdje nema "+N" ni cijene; "Nakon plana" pokazuje samo zahvate sa stvarnim parametrima;
 *   - traka stranica postoji samo uz stvaran broj stranica, a stranica nalaza samo uz Wordove
 *     prijelome koji se s njim slazu;
 *   - stari stol Z8 ostaje kad `live` nije predan ili je presuda `clear`.
 * Izgled i tok u pregledniku mjeri `tests/ux/result-live.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import { renderResultsCockpit, type ResultsCockpitAction } from '../src/ui/results/results-cockpit';
import { deskItems } from '../src/ui/results/desk-model';
import type { RepairOutlookModel } from '../src/ui/results/repair-outlook';
import {
  filtriraj, izgledNakon, izgledSada, jezicci, ladica, pocetniOdabir, polozaj, prebaci, prsten, rokTekst,
  stranicaZaNalaz, trakaStranica, ulogaNalaza, uPlanu, vidljiviZahvati, zahvatiPlana, type LiveStavka,
} from '../src/ui/result-live/result-live-model';
import { copyProblems, liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';
import { cijenaProblems, plusBodProblems } from './helpers/result-live-guard';

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r/g, '');

/* ------------------------------------------------------------------ fixture */

const NASLOV_MARGINE = 'Desna margina odstupa od profila';

function result(overrides: Record<string, unknown> = {}) {
  return {
    score: 87,
    scoredChecks: 12,
    file: { name: 'diplomski-rad.docx' },
    profile: 'FPZG / Politologija / Diplomski rad',
    profileStatus: 'verified',
    issues: [
      { severity: 'error', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', detail: 'U popisu literature nema djela autora Novak iz 2022.', where: 'Odlomak 42' },
      { severity: 'warning', category: 'formatting', title: NASLOV_MARGINE, detail: 'Izmjereno 2,0 cm, očekivano 2,5 cm.', where: 'Postavke stranice' },
      { severity: 'info', category: 'structure', title: 'Naslov 2.3 nije u sadržaju', detail: 'Primijeni stil Naslov 2.', where: 'Odlomak 71' },
      { severity: 'warning', category: 'elements', title: 'Tablica nema prepoznat naslov', detail: 'Provjeri oznaku tablice.', where: 'Tablica 4' },
    ],
    checks: [],
    categories: { formatting: { earned: 20, max: 24 }, structure: { earned: 18, max: 20 }, citations: { earned: 19, max: 28 } },
    details: {
      ruleAuthority: 'official-source',
      // Sidra nalaza dolaze iz trijaze (`locations`), kao u stvarnom rezultatu.
      triage: {
        counts: { auto: 1, assisted: 0, manual: 2, total: 3 },
        findings: [
          { id: 'novak', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', severity: 'error', fixability: 'manual', locations: [{ paragraphIndex: 42 }] },
          { id: 'naslov', category: 'structure', title: 'Naslov 2.3 nije u sadržaju', severity: 'info', fixability: 'manual', locations: [{ paragraphIndex: 71 }] },
        ],
      },
    },
    ...overrides,
  } as never;
}

/** 80 odlomaka, Wordov prijelom iza svakog dvadesetog: 4 stranice, isto kao `storedPages`. */
function preview(prijelomi = [20, 40, 60]) {
  return {
    truncated: false,
    baseFont: 'Calibri',
    baseSize: 11,
    page: { margins: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, size: { w: 21, h: 29.7 } },
    paragraphs: Array.from({ length: 80 }, (_, k) => ({
      index: k + 1,
      text: k === 0 ? 'Uvod' : `Odlomak broj ${k + 1} studentskog rada.`,
      headingLevel: k === 0 ? 1 : null,
      pageBreakAfter: prijelomi.includes(k + 1),
      lineHeight: 1,
    })),
  };
}

const STAVKA_MARGINE: LiveStavka = {
  ruleId: 'fpzg-margins', label: 'Margine', violated: true, matchKeys: [NASLOV_MARGINE],
  fixerId: 'margins-fixer', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 },
};
const OUTLOOK: RepairOutlookModel = {
  kind: 'available', currentScore: 87, ceilingScore: 95, headroom: 8,
  counts: { auto: 1, assisted: 0, manual: 1 }, manualItems: [], preselected: 1, atCeiling: false,
};

interface Montaza { mount: HTMLElement; akcije: Array<{ action: ResultsCockpitAction }> }

async function montiraj(opts: { live?: boolean; stavke?: LiveStavka[]; r?: Record<string, unknown>; mount?: HTMLElement } = {}): Promise<Montaza> {
  const model = buildVisualResultModel(result(opts.r ?? {}));
  const mount = opts.mount ?? document.createElement('section');
  if (!mount.isConnected) document.body.append(mount);
  const akcije: Montaza['akcije'] = [];
  renderResultsCockpit(mount, model, {
    repairAvailable: true,
    repairOutlook: OUTLOOK,
    onAction: (action) => akcije.push({ action }),
    desk: {
      items: deskItems(model.findings.document, []),
      planItems: opts.stavke ?? [STAVKA_MARGINE],
      mountDocument: async () => null,
      ...(opts.live === false ? {} : { live: { preview: preview(), storedPages: 4 } }),
    },
  });
  if (opts.live !== false) await vi.waitFor(() => expect(mount.dataset.rlReady).toBe('true'));
  return { mount, akcije };
}

const ladicaEl = (): HTMLElement => document.querySelector<HTMLElement>('[data-rl-tray]')!;
const klikni = (el: Element | null): void => { (el as HTMLElement).click(); };
const karticaNaslov = (m: HTMLElement): string => m.querySelector('.rl-card__title')?.textContent ?? '';

afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset.motion;
});

/* ------------------------------------------------------------------ model */

describe('Z34 model: kategorije i polozaj', () => {
  const nalazi = [{ category: 'citations' }, { category: 'formatting' }, { category: 'structure' }, { category: 'elements' }, { category: 'nepoznato' }];

  it('jezicci broje nalaze po kategoriji; prazna kategorija nije klikabilna', () => {
    expect(jezicci(nalazi).map((j) => [j.label, j.n, j.prazan])).toEqual([
      ['Sve', 5, false], ['Format', 1, false], ['Struktura', 2, false], ['Citati', 1, false], ['Predaja', 0, true],
    ]);
  });

  it('filtar Citati pokazuje 1 od 1, bez susjeda', () => {
    const citati = filtriraj(nalazi, 'Citati');
    expect(citati).toEqual([0]);
    expect(polozaj(citati, 0)).toEqual({ k: 0, oznaka: '1 od 1', prethodni: null, sljedeci: null });
  });

  it('navigacija ne omata: na kraju filtra sljedeceg nema', () => {
    const struktura = filtriraj(nalazi, 'Struktura');
    expect(struktura).toEqual([2, 3]);
    expect(polozaj(struktura, 3)).toEqual({ k: 1, oznaka: '2 od 2', prethodni: 2, sljedeci: null });
    expect(filtriraj(nalazi, 'all')).toHaveLength(5);
  });
});

describe('Z34 model: plan, prsten i ladica', () => {
  const stavke: LiveStavka[] = [
    STAVKA_MARGINE,
    { ruleId: 'potvrda', label: 'Sekcije', requiresConfirmation: true, matchKeys: ['Sekcije'] },
    { ruleId: 'preporuka', label: 'Poravnanje', violated: false, recommended: true, matchKeys: ['Poravnanje'] },
    { ruleId: 'uskladi', label: 'Font', violated: false, matchKeys: ['Font'] },
  ];
  const zahvati = zahvatiPlana(stavke, true);
  const nalaz = (matchKeys: string[], repair = false) => ({ matchKeys, status: 'open' as const, capabilities: { repair, preview: false, exactEvidence: false } });

  it('ista klasifikacija kao plan Z8: sigurni u planu, odluke izvan, "uskladi sve" ne ulazi', () => {
    expect(zahvati.map((z) => [z.ruleId, z.vrsta])).toEqual([['fpzg-margins', 'siguran'], ['potvrda', 'odluka'], ['preporuka', 'odluka']]);
    expect([...pocetniOdabir(zahvati)]).toEqual(['fpzg-margins']);
    expect(zahvatiPlana(stavke, false)).toEqual([]);
  });

  it('uloga nalaza: zahvat po matchKeys, rucno bez stavke, bez kontrole kad je popravljiv a nema stavke', () => {
    expect(ulogaNalaza(nalaz([NASLOV_MARGINE]), zahvati)).toEqual({ kind: 'zahvat', ruleIds: ['fpzg-margins'], label: 'Margine' });
    expect(ulogaNalaza(nalaz(['Citat']), zahvati)).toEqual({ kind: 'rucno' });
    expect(ulogaNalaza(nalaz(['Citat'], true), zahvati)).toEqual({ kind: 'bez' });
  });

  it('ukljucivanje zahvata mijenja ladicu, a NE ocjenu ni zeleni luk (strop = ceilingScore)', () => {
    const uloga = ulogaNalaza(nalaz([NASLOV_MARGINE]), zahvati);
    const prije = pocetniOdabir(zahvati);
    const poslije = prebaci(uloga, prije);
    expect(uPlanu(uloga, prije)).toBe(true);
    expect(uPlanu(uloga, poslije)).toBe(false);
    expect([...prije], 'stari odabir ostaje netaknut').toEqual(['fpzg-margins']);
    expect(ladica(prije, zahvati, 87, OUTLOOK.kind === 'available' ? OUTLOOK.ceilingScore : null))
      .toEqual({ zahvata: 1, racun: '87 → najviše 95' });
    expect(ladica(poslije, zahvati, 87, 95)).toEqual({ zahvata: 0, racun: '87 → najviše 95' });
    expect(ladica(prebaci(ulogaNalaza(nalaz(['Sekcije']), zahvati), prije), zahvati, 87, 95).zahvata).toBe(2);
    // Prsten NEMA ulaz za odabir: strop je isti za svaki plan.
    expect(prsten(87, 95)).toEqual({ sada: 87, strop: 95, opis: 'Ocjena sada 87, najviše 95 ako svi zahvati uspiju' });
  });

  it('bez stropa ili bez ocjene nema zelenog luka ni racuna; strop ispod ocjene se ne crta', () => {
    expect(prsten(87, null)).toEqual({ sada: 87, strop: null, opis: 'Ocjena sada 87' });
    expect(prsten(87, 80)?.strop).toBeNull();
    expect(prsten(null, 95)).toBeNull();
    expect(ladica(new Set(['fpzg-margins']), zahvati, null, 95)).toEqual({ zahvata: 1, racun: null });
  });

  it('nijedan izlaz modela ne nosi "+N"', () => {
    const tekst = [prsten(87, 95)?.opis, ladica(new Set(['fpzg-margins']), zahvati, 87, 95).racun].join(' ');
    expect(plusBodProblems(tekst)).toEqual([]);
  });
});

describe('Z34 model: Sada / Nakon plana iz stvarnih parametara', () => {
  const stavke: LiveStavka[] = [
    STAVKA_MARGINE,
    { ruleId: 'font', label: 'Font', violated: true, fixerId: 'font-fixer', params: { fontName: 'Times New Roman' } },
    { ruleId: 'prored', label: 'Prored', violated: true, fixerId: 'line-spacing-fixer', params: { multiplier: 1.5 } },
    { ruleId: 'brojevi', label: 'Brojevi', violated: true, fixerId: 'page-numbering-fixer', params: { targets: [] } },
    { ruleId: 'fusnote', label: 'Fusnote', violated: true, fixerId: 'footnote-spacing-fixer', params: {} },
  ];
  const zahvati = zahvatiPlana(stavke, true);
  const sada = izgledSada(preview() as never);

  it('Sada je stvarni izgled dokumenta iz pregleda', () => {
    expect(sada).toEqual({ font: 'Calibri', velicinaPt: 11, margine: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, prored: 1, brojStranice: false });
  });

  it('vidljivi su samo zahvati koje stranica zna pokazati (font, margine, prored, broj stranice)', () => {
    expect(vidljiviZahvati(stavke, zahvati).sort()).toEqual(['broj', 'font', 'margine', 'prored']);
    expect(vidljiviZahvati([stavke[4]], zahvatiPlana([stavke[4]], true))).toEqual([]);
  });

  it('Nakon plana primjenjuje SAMO odabrane zahvate', () => {
    expect(izgledNakon(sada, stavke, new Set(['fpzg-margins']))).toEqual({ ...sada, margine: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 } });
    expect(izgledNakon(sada, stavke, new Set(['font', 'prored', 'brojevi']))).toEqual({ ...sada, font: 'Times New Roman', prored: 1.5, brojStranice: true });
    expect(izgledNakon(sada, stavke, new Set())).toEqual(sada);
  });
});

describe('Z34 model: traka stranica i stranica nalaza', () => {
  const model = buildVisualResultModel(result());
  const items = deskItems(model.findings.document, []);
  const indeks = (naslov: string): number => items.findIndex((it) => it.finding.title.startsWith(naslov));

  it('bez stvarnog broja stranica nema trake', () => {
    expect(trakaStranica(preview() as never, null, items)).toBeNull();
    expect(trakaStranica(preview() as never, 0, items)).toBeNull();
    expect(trakaStranica(preview() as never, 4.5, items)).toBeNull();
  });

  it('Wordovi prijelomi koji se slazu s brojem stranica daju jantarne stranice; cijeli rad ide na crvenu crtu', () => {
    const t = trakaStranica(preview() as never, 4, items)!;
    expect(t.pouzdano).toBe(true);
    expect(t.ukupno).toBe(4);
    expect(t.poStranici.get(3)).toEqual([indeks('(Novak')]);
    expect(t.poStranici.get(4)).toEqual([indeks('Naslov 2.3')]);
    expect(t.cijeliRad).toEqual([indeks('Desna margina')]);
  });

  it('prijelomi koji se NE slazu s brojem stranica ne daju nijednu stranicu (bez pogadjanja)', () => {
    const t = trakaStranica(preview([20]) as never, 4, items)!;
    expect(t.pouzdano).toBe(false);
    expect(t.poStranici.size).toBe(0);
    const skracen = trakaStranica({ ...preview(), truncated: true } as never, 4, items)!;
    expect(skracen.pouzdano).toBe(false);
  });

  it('stranica nalaza: odlomci te stranice i sidro; bez sidra pocetak tijela i bez zuma', () => {
    const t = trakaStranica(preview() as never, 4, items);
    const novak = stranicaZaNalaz(preview() as never, items[indeks('(Novak')].finding.scope, t);
    expect(novak.broj).toBe(3);
    expect(novak.sidro).toBe(42);
    expect(novak.odlomci.map((p) => p.index)).toEqual(Array.from({ length: 20 }, (_, k) => 41 + k));
    const margina = stranicaZaNalaz(preview() as never, items[indeks('Desna margina')].finding.scope, t);
    expect(margina.sidro).toBeNull();
    expect(margina.broj).toBe(1);
    const bezKarte = stranicaZaNalaz(preview([20]) as never, items[indeks('(Novak')].finding.scope, null);
    expect(bezKarte.broj).toBeNull();
    expect(bezKarte.odlomci.map((p) => p.index)).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
  });

  it('rok iz Z32: oblik iz ALIGNMENT-a, rubni oblici doslovno', () => {
    const danas = new Date(2026, 9, 4);
    expect(rokTekst({ datum: '2026-10-25', neznam: false }, danas)).toBe('Rok 25. 10. · još 21 dan');
    expect(rokTekst({ datum: '2026-10-04', neznam: false }, danas)).toBe('Rok 4. 10. · danas');
    expect(rokTekst({ datum: '2026-10-01', neznam: false }, danas)).toBe('Rok 1. 10. · prošao');
    expect(rokTekst({ datum: null, neznam: true }, danas)).toBe('Rok nije zadan');
    expect(rokTekst({ datum: null, neznam: false }, danas)).toBeNull();
    expect(rokTekst(null, danas)).toBeNull();
  });
});

/* ------------------------------------------------------------------ prikaz */

describe('Z34 prikaz: rezultat sve u jednom', () => {
  it('jezicci: Sve 4, Predaja je kvacica bez klika; filtar Citati pokazuje 1 od 1', async () => {
    const { mount } = await montiraj();
    const tabs = [...mount.querySelectorAll<HTMLButtonElement>('[data-rl-tab]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Sve4', 'Format1', 'Struktura2', 'Citati1', 'Predaja✓']);
    expect(tabs[4].disabled).toBe(true);
    klikni(tabs[4]);
    expect(mount.querySelector('[data-rl-tab="all"]')?.getAttribute('aria-selected')).toBe('true');
    klikni(mount.querySelector('[data-rl-tab="Citati"]'));
    expect(mount.querySelector('[data-desk-count]')?.textContent).toBe('1 od 1');
    expect(karticaNaslov(mount)).toBe('(Novak, 2022) nema zapis u literaturi');
    expect(mount.querySelector<HTMLButtonElement>('.desk-nav__btn--next')?.disabled).toBe(true);
    expect(mount.querySelector('[data-rl-manual]')?.textContent).toBe('Ovo dodaješ sam. Lekta ne mijenja sadržaj rada, samo oblik.');
  });

  it('ukljucivanje zahvata mijenja ladicu, ali ne ocjenu ni zeleni luk', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const { mount } = await montiraj();
    const ring = mount.querySelector<HTMLElement>('.cockpit-ring')!;
    const luk = ring.style.getPropertyValue('--rl-ceil');
    const opis = ring.getAttribute('aria-label');
    expect(luk).toBe('95');
    expect(opis).toBe('Ocjena sada 87, najviše 95 ako svi zahvati uspiju');
    expect(mount.querySelector('[data-rl-legend]')?.textContent).toBe('sada 87najviše 95 ako svi zahvati uspiju');
    expect(ladicaEl().querySelector('[data-rl-tray-n]')?.textContent).toBe('1 zahvat');
    expect(ladicaEl().querySelector('[data-rl-tray-r]')?.textContent).toBe('87 → najviše 95');

    klikni(mount.querySelector('[data-rl-tab="Format"]'));
    const gumb = mount.querySelector<HTMLButtonElement>('[data-rl-toggle]')!;
    expect(gumb.textContent).toBe('U planu ✓');
    klikni(gumb);
    expect(mount.querySelector('[data-rl-toggle]')?.textContent).toBe('Uključi u plan');
    expect(ladicaEl().querySelector('[data-rl-tray-n]')?.textContent).toBe('0 zahvata');
    expect(ladicaEl().querySelector<HTMLButtonElement>('[data-rl-plan-go]')?.disabled).toBe(true);
    expect(ring.style.getPropertyValue('--rl-ceil'), 'zeleni luk je strop, ne zbroj plana').toBe(luk);
    expect(ring.getAttribute('aria-label')).toBe(opis);
    expect(ring.querySelector('.cockpit-ring__core')?.textContent).toBe('87');
    expect(ladicaEl().querySelector('[data-rl-tray-r]')?.textContent).toBe('87 → najviše 95');
  });

  it('nigdje "+N" ni cijena; ladica nosi postojecu recenicu toka popravka', async () => {
    const { mount } = await montiraj();
    klikni(mount.querySelector('[data-rl-tab="Format"]'));
    const vidljivo = `${mount.textContent} ${ladicaEl().textContent}`;
    expect(plusBodProblems(vidljivo)).toEqual([]);
    expect(vidljivo).not.toContain('€');
    expect(ladicaEl().querySelector('.rl-tray__p')?.textContent).toBe('Cijena ne ovisi o odabiru.');
  });

  it('ulaz u popravak: primarni gumb nosi odabir tek kad ga je korisnik promijenio, ladica uvijek', async () => {
    const { mount, akcije } = await montiraj();
    klikni(mount.querySelector('[data-cockpit-primary]'));
    expect(akcije.at(-1)?.action).toEqual({ kind: 'repair-safe' });
    klikni(ladicaEl().querySelector('[data-rl-plan-go]'));
    expect(akcije.at(-1)?.action).toEqual({ kind: 'repair-safe', ruleIds: ['fpzg-margins'] });
    klikni(mount.querySelector('[data-rl-tab="Format"]'));
    klikni(mount.querySelector('[data-rl-toggle]'));
    klikni(mount.querySelector('[data-cockpit-primary]'));
    expect(akcije.at(-1)?.action).toEqual({ kind: 'repair-safe', ruleIds: [] });
  });

  it('stranica: sidro je oznaceno, natpis je stvarna stranica; Nakon plana nosi stvarnu marginu', async () => {
    const { mount } = await montiraj();
    klikni(mount.querySelector('[data-rl-tab="Citati"]'));
    expect(mount.querySelector('[data-rl-pagelabel]')?.textContent).toBe('Str. 3 od 4');
    expect(mount.querySelector('[data-rl-p="42"]')?.hasAttribute('data-rl-hit')).toBe(true);
    klikni(mount.querySelector('[data-rl-mode="after"]'));
    expect(mount.querySelector<HTMLElement>('[data-rl-page]')?.dataset.mode).toBe('after');
    expect(mount.querySelector<HTMLElement>('[data-rl-text="after"]')?.style.getPropertyValue('--rl-pad')).toBe('11.90cqw 11.90cqw 11.90cqw 14.29cqw');
    expect(mount.querySelector<HTMLElement>('[data-rl-text="now"]')?.style.getPropertyValue('--rl-pad')).toBe('11.90cqw 9.52cqw 11.90cqw 9.52cqw');
    expect(mount.querySelector('[data-rl-note]')?.textContent).toBe('Ovo dodaješ sam: (Novak, 2022) nema zapis u literaturi, Naslov 2.3 nije u sadržaju, Tablica nema prepoznat naslov.');
  });

  it('traka stranica: stvaran broj celija, crvena crta za cijeli rad, jantarna stranica otvara nalaz', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const { mount } = await montiraj();
    expect(mount.querySelectorAll('.rl-cell')).toHaveLength(4);
    expect(mount.querySelectorAll('.rl-cell--hit')).toHaveLength(2);
    expect(mount.querySelector('.rl-strip__line')).not.toBeNull();
    expect(mount.querySelector('.rl-strip__legend')?.textContent).toBe('Crvena crta: 1 nalaz vrijedi za cijeli rad. Jantarna stranica ima nalaze na točno jednom mjestu.');
    klikni(mount.querySelector('[data-rl-page-go="4"]'));
    expect(karticaNaslov(mount)).toBe('Naslov 2.3 nije u sadržaju');
  });

  it('pod smanjenim pokretom nema brojanja ni zuma: ocjena i pecat su odmah zavrsni', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const { mount } = await montiraj();
    expect(mount.querySelector('.cockpit-ring__core')?.textContent).toBe('87');
    expect(mount.querySelector<HTMLElement>('[data-cockpit-stamp]')?.dataset.rlStamp).toBe('stoji');
    expect(mount.querySelector<HTMLElement>('[data-rl-zoom]')?.style.transform).toBe('');
  });

  it('bez smanjenog pokreta ocjena krece od 0, a pecat ceka kraj brojanja', async () => {
    const { mount } = await montiraj();
    const pecat = mount.querySelector<HTMLElement>('[data-cockpit-stamp]');
    expect(['ceka', 'pada']).toContain(pecat?.dataset.rlStamp);
    await vi.waitFor(() => expect(pecat?.dataset.rlStamp).toBe('pada'), { timeout: 3000 });
    expect(mount.querySelector('.cockpit-ring__core')?.textContent).toBe('87');
  });

  it('ponovna montaza istog rezultata cuva filtar i plan, i ne ponavlja ulaz', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const { mount } = await montiraj();
    klikni(mount.querySelector('[data-rl-tab="Format"]'));
    klikni(mount.querySelector('[data-rl-toggle]'));
    delete mount.dataset.rlReady;
    delete document.documentElement.dataset.motion;
    await montiraj({ mount });
    expect(mount.querySelector('[data-rl-tab="Format"]')?.getAttribute('aria-selected')).toBe('true');
    expect(mount.querySelector('[data-rl-toggle]')?.textContent).toBe('Uključi u plan');
    expect(document.querySelectorAll('[data-rl-tray]'), 'stara ladica je uklonjena').toHaveLength(1);
    expect(mount.querySelector<HTMLElement>('[data-cockpit-stamp]')?.dataset.rlStamp).toBe('stoji');
  });

  it('bez `live` ili s presudom clear ostaje stol Z8', async () => {
    const { mount } = await montiraj({ live: false });
    expect(mount.querySelector('[data-rl-host]')).toBeNull();
    expect(mount.querySelector('[data-desk]')).not.toBeNull();
    // Rucna provjera (ne `clear`) je i dalje stanje s nalazima, pa dobiva Z34.
    const rucno = document.createElement('section');
    document.body.append(rucno);
    const jedan = buildVisualResultModel(result({ issues: [{ severity: 'info', category: 'structure', title: 'Savjet', detail: 'Opis.', where: 'Odlomak 3' }] }));
    renderResultsCockpit(rucno, jedan, {
      repairAvailable: true,
      desk: { items: deskItems(jedan.findings.document, []), mountDocument: async () => null, live: { preview: preview(), storedPages: 4 } },
    });
    expect(rucno.className).toContain('result-cockpit--manual-review');
    expect(rucno.querySelector('[data-rl-host]')).not.toBeNull();
    await vi.waitFor(() => expect(rucno.dataset.rlReady).toBe('true'));
    // `clear` ostaje Z8: Z34 zamjenjuje samo stanje s nalazima.
    const cist = document.createElement('section');
    document.body.append(cist);
    const model = buildVisualResultModel(result({ issues: [] }));
    const nalazUzCist = deskItems(jedan.findings.document, []);
    renderResultsCockpit(cist, model, {
      repairAvailable: true,
      desk: { items: nalazUzCist, mountDocument: async () => null, live: { preview: preview(), storedPages: 4 } },
    });
    expect(cist.className).toContain('result-cockpit--clear');
    expect(cist.querySelector('[data-rl-host]')).toBeNull();
    expect(cist.querySelector('[data-desk]')).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ gardovi */

describe('Z34 gardovi: pokret, lijena granica, copy i cijena', () => {
  it('list Z34 animira samo transform, opacity i clip-path', () => {
    expect(motionCssProblems(read('src/ui/result-live/result-live.css'))).toEqual([]);
  });

  it('kod Z34 ulazi samo dinamickim uvozom iz kokpita', () => {
    const izvori = {
      'src/ui/results/results-cockpit.ts': read('src/ui/results/results-cockpit.ts'),
      'src/ui/app.ts': read('src/ui/app.ts'),
      'src/ui/progress-scan.ts': read('src/ui/progress-scan.ts'),
    };
    expect(liveBoundaryProblems(izvori, 'src/ui/results/results-cockpit.ts', '../result-live/result-live')).toEqual([]);
  });

  it('natpisi gumba su doslovno iz predloska ResultLive.dc.html', () => {
    expect(copyProblems(read('src/ui/result-live/result-live.ts'), read('design/templates/result-live/ResultLive.dc.html'), [])).toEqual([]);
  });

  it('u kodu Z34 nema cijene', () => {
    expect(cijenaProblems({
      'src/ui/result-live/result-live.ts': read('src/ui/result-live/result-live.ts'),
      'src/ui/result-live/result-live-model.ts': read('src/ui/result-live/result-live-model.ts'),
      'src/ui/result-live/result-live.css': read('src/ui/result-live/result-live.css'),
    })).toEqual([]);
  });

  it('predlozak doista nosi ono sto gardovi odbijaju (generator ulaza nije prazan)', () => {
    const predlozak = read('design/templates/result-live/ResultLive.dc.html');
    expect(cijenaProblems({ predlozak })).toEqual(['predlozak: znak eura']);
    expect(plusBodProblems('Uključi u plan · +7')).toEqual(['bodovi po zahvatu: "+7"']);
    expect(predlozak).toContain('Uključi u plan · +{{ cur.p }}');
  });
});
