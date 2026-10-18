/**
 * FAKSIMIL: SVE U JEDNOM (ALIGNMENT Z35): model, montaza preko presude Z34 i gardovi.
 *
 * Istinitost prije predloska: faksimil smije pokazati SAMO stvarne nalaze i stvarna sidra, stranicu
 * pise kao "Oko str." (pripis iz Wordovih tragova je priblizan, F37), mjere cita iz stvarnog stila
 * odlomka, a "poslije", duh pravilnika i mjerne linije iz stvarnih parametara popravka. Pecat "Plan
 * spreman" pada tek kad su prekrizeni SVI nalazi. Raspored po sirini slijedi Z37 kad se razlikuje od Z35.
 * Preglednik (sirine, preklapanja, dodir, smanjen pokret) mjeri `tests/ux/facsimile-live.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import { otvoriRutuFaksimila, renderResultsCockpit } from '../src/ui/results/results-cockpit';
import { deskItems } from '../src/ui/results/desk-model';
import type { RepairOutlookModel } from '../src/ui/results/repair-outlook';
import { izgledSada, trakaStranica, zahvatiPlana, type LiveStavka } from '../src/ui/result-live/result-live-model';
import {
  SIRINA_BILJESKI, SIRINA_KARTICE, biljeske, duhPravilnika, isjecak, mjernaOznaka, natpisLista, ocitanje,
  planOblika, planRedak, popravakVidljiv, raspored, redCekanja, stranice,
} from '../src/ui/facsimile-live/facsimile-live-model';
import { copyProblems, liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';
import { cijenaProblems, plusBodIzvorProblems } from './helpers/result-live-guard';
import { fxTipIzPredloska, fxTipProblems, tockeLomaProblems } from './helpers/facsimile-live-guard';

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r/g, '');

/* ------------------------------------------------------------------ fixture: 6 nalaza kao predlozak */

const MARGINA = 'Lijeva margina je preuska';
const PRORED = 'Prored je jednostruk';

/** Sest nalaza (kao u predlosku): dva automatska za cijeli rad, cetiri rucna, od kojih tri sa sidrom. */
function rezultat() {
  return {
    score: 71,
    scoredChecks: 12,
    file: { name: 'diplomski-rad.docx' },
    profile: 'FPZG / Politologija / Diplomski rad',
    profileStatus: 'verified',
    issues: [
      { severity: 'warning', category: 'formatting', title: MARGINA, detail: 'Izmjereno 2,0 cm.', where: 'Postavke stranice' },
      { severity: 'error', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', detail: 'U popisu literature nema djela.', where: 'Odlomak 23' },
      { severity: 'info', category: 'structure', title: 'Naslov 2.3 nije u sadržaju', detail: 'Primijeni stil Naslov 2.', where: 'Odlomak 30' },
      { severity: 'warning', category: 'formatting', title: PRORED, detail: 'Izmjereno 1,0.', where: 'Cijeli dokument' },
      { severity: 'warning', category: 'citations', title: 'Citat na str. 3 nema stranicu', detail: 'Izravni citat bez stranice.', where: 'Odlomak 45' },
      { severity: 'warning', category: 'citations', title: 'Bilješka 3 nema broj stranice', detail: 'Bez stranice.', where: 'Bilješka 3' },
    ],
    checks: [],
    categories: { formatting: { earned: 20, max: 24 }, structure: { earned: 18, max: 20 }, citations: { earned: 9, max: 20 } },
    capabilities: { repair: true, preview: true },
    details: {
      ruleAuthority: 'official-source',
      triage: {
        counts: { auto: 2, assisted: 0, manual: 4, total: 6 },
        findings: [
          { id: 'novak', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', severity: 'error', fixability: 'manual', locations: [{ paragraphIndex: 23 }] },
          { id: 'naslov', category: 'structure', title: 'Naslov 2.3 nije u sadržaju', severity: 'info', fixability: 'manual', locations: [{ paragraphIndex: 30 }] },
          { id: 'citat', category: 'citations', title: 'Citat na str. 3 nema stranicu', severity: 'warning', fixability: 'manual', locations: [{ paragraphIndex: 45 }] },
          { id: 'fus', category: 'citations', title: 'Bilješka 3 nema broj stranice', severity: 'warning', fixability: 'manual', locations: [{ paragraphIndex: 0, footnoteId: 3 }] },
        ],
      },
    },
  } as never;
}

/** 80 odlomaka po 20 na stranici, 4 stranice; trag prijeloma na PRVOM odlomku nove stranice (21, 41, 61). */
function pregled(opcije: { prijelomi?: number[]; truncated?: boolean } = {}) {
  const prijelomi = opcije.prijelomi ?? [21, 41, 61];
  return {
    truncated: opcije.truncated ?? false,
    baseFont: 'Calibri',
    baseSize: 11,
    page: { margins: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, size: { w: 21, h: 29.7 } },
    paragraphs: Array.from({ length: 80 }, (_, k) => {
      const index = k + 1;
      const naslov = index === 21 || index === 30;
      return {
        index,
        text: index === 50 ? '' : naslov ? `${index === 21 ? '2.' : '2.3.'} Naslov ${index}` : `Odlomak broj ${index} studentskog rada.`,
        headingLevel: naslov ? (index === 21 ? 1 : 2) : null,
        pageBreakAfter: prijelomi.includes(index),
        lineHeight: naslov ? null : 1,
        align: naslov ? 'left' : 'left',
        size: naslov ? 14 : 11,
        runs: [{ text: `x${index}`, bold: naslov, italic: false, font: 'Calibri', size: naslov ? 14 : 11 }],
      };
    }),
  };
}

const STAVKA_MARGINE: LiveStavka = {
  ruleId: 'margine', label: 'Margine', violated: true, matchKeys: [MARGINA],
  fixerId: 'margins-fixer', params: { top: 2.5, right: 2, bottom: 2.5, left: 2.5 },
};
const STAVKA_PRORED: LiveStavka = {
  ruleId: 'prored', label: 'Prored', violated: true, matchKeys: [PRORED],
  fixerId: 'line-spacing-fixer', params: { multiplier: 1.5 },
};
const OUTLOOK: RepairOutlookModel = {
  kind: 'available', currentScore: 71, ceilingScore: 88, headroom: 17,
  counts: { auto: 2, assisted: 0, manual: 4 }, manualItems: [], preselected: 2, atCeiling: false,
};

function nalaziFixture() {
  const model = buildVisualResultModel(rezultat());
  return { model, items: deskItems(model.findings.document, []) };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-fl-open');
  delete document.documentElement.dataset.motion;
  delete document.documentElement.dataset.resultRenderer;
});

/* ------------------------------------------------------------------ generator ulaza */

describe('Z35 fixture: generator proizvodi ciljanu klasu ulaza', () => {
  it('sest nalaza: dva za cijeli rad, tri sa sidrom u tijelu, jedan u fusnoti; prijelomi daju 4 stranice', () => {
    const { items } = nalaziFixture();
    const scope = items.map((it) => it.finding.scope.kind + (it.finding.scope.kind === 'anchor' && it.finding.scope.footnoteId != null ? ':fn' : ''));
    expect(items).toHaveLength(6);
    expect(scope.filter((s) => s === 'document')).toHaveLength(2);
    expect(scope.filter((s) => s === 'anchor')).toHaveLength(3);
    expect(scope.filter((s) => s === 'anchor:fn')).toHaveLength(1);
    const traka = trakaStranica(pregled(), 4, items);
    expect(traka.pouzdano).toBe(true);
    expect(traka.ukupno).toBe(4);
  });
});

/* ------------------------------------------------------------------ sirine */

describe('Z35 model: raspored po sirini (Z37 ima prednost)', () => {
  it('360, 768, 1024, 1180, 1440 i polozen mobitel', () => {
    expect(raspored(360, 780, false)).toEqual({ biljeske: 'popis', kartica: 'ispod', lampa: false, konac: false, sticky: false });
    // Z35 bi na 768 drzao biljeske uz stranicu; Z37 kaze "bilješke kao popis ispod stranice".
    expect(raspored(768, 1024, true)).toEqual({ biljeske: 'popis', kartica: 'ispod', lampa: true, konac: false, sticky: false });
    expect(raspored(1024, 768, true)).toEqual({ biljeske: 'uz', kartica: 'ispod', lampa: true, konac: true, sticky: false });
    expect(raspored(1180, 800, true)).toEqual({ biljeske: 'uz', kartica: 'uz', lampa: true, konac: true, sticky: true });
    expect(raspored(1440, 900, true)).toEqual({ biljeske: 'uz', kartica: 'uz', lampa: true, konac: true, sticky: true });
    // Polozen mobitel 844 x 390: stranica bez biljeski, popis ispod, bez sticky i bez lampe.
    expect(raspored(844, 390, true)).toEqual({ biljeske: 'popis', kartica: 'ispod', lampa: false, konac: false, sticky: false });
    expect(raspored(1000, 450, true).sticky).toBe(false);
  });

  it('dodir bez misa nema lampu ni povecalo ni na sirokom ekranu', () => {
    expect(raspored(1440, 900, false).lampa).toBe(false);
    expect(raspored(759, 900, true).lampa).toBe(false);
    expect(raspored(760, 900, true).lampa).toBe(true);
  });

  it('tocke loma modela su iz Z37', () => {
    expect([SIRINA_BILJESKI, SIRINA_KARTICE]).toEqual([900, 1180]);
  });
});

/* ------------------------------------------------------------------ stranice i pripis */

describe('Z35 model: listovi su stvarni odlomci, stranica je priblizna', () => {
  const { items } = nalaziFixture();

  it('s pouzdanom kartom: 4 lista, odlomak s tragom POCINJE novu stranicu, natpis "Oko str."', () => {
    const st = stranice(pregled(), trakaStranica(pregled(), 4, items));
    expect(st.pouzdano).toBe(true);
    expect(st.stranice.map((s) => [s.broj, s.odlomci[0]?.index, s.odlomci[s.odlomci.length - 1]?.index])).toEqual([
      [1, 1, 20], [2, 21, 40], [3, 41, 60], [4, 61, 80],
    ]);
    expect(natpisLista(st, 1)).toBe('Oko str. 2 od 4');
    // Prazan odlomak 50 se ne crta, ali je na karti (sidro na njemu zna svoj list).
    expect(st.stranice[2].odlomci.some((p) => p.index === 50)).toBe(false);
    expect(st.polozaj.get(50)).toBe(2);
  });

  it('bez pouzdane karte nema broja stranice: listovi su rasponi odlomaka', () => {
    for (const [p, stored] of [[pregled({ truncated: true }), 4], [pregled(), 7], [pregled(), null]] as const) {
      const st = stranice(p, trakaStranica(p, stored, items));
      expect(st.pouzdano).toBe(false);
      expect(st.ukupno).toBeNull();
      expect(st.stranice.every((s) => s.broj === null)).toBe(true);
      expect(natpisLista(st, 0)).toBe('Odlomci 1 do 12');
      expect(st.stranice.flatMap((s) => s.odlomci.map((x) => x.index))).toHaveLength(79);
    }
  });

  it('biljeske su SAMO stvarni nalazi: cijeli rad bez tocke, sidro samo na svom listu, fusnota nigdje', () => {
    const st = stranice(pregled(), trakaStranica(pregled(), 4, items));
    const naslovi = (k: number) => biljeske(st, k, items.map((it) => it.finding)).map((b) => [items[b.i].finding.title, b.sidro]);
    expect(naslovi(0)).toEqual([[MARGINA, null], [PRORED, null]]);
    expect(naslovi(1)).toEqual([[MARGINA, null], [PRORED, null], ['(Novak, 2022) nema zapis u literaturi', 23], ['Naslov 2.3 nije u sadržaju', 30]]);
    expect(naslovi(2)).toEqual([[MARGINA, null], [PRORED, null], ['Citat na str. 3 nema stranicu', 45]]);
    expect(naslovi(3).map(([t]) => t)).not.toContain('Bilješka 3 nema broj stranice');
  });
});

/* ------------------------------------------------------------------ povecalo i plan */

describe('Z35 model: povecalo cita stvarni stil, plan daje stvarne parametre', () => {
  const { items } = nalaziFixture();
  const st = stranice(pregled(), trakaStranica(pregled(), 4, items));
  const zahvati = zahvatiPlana([STAVKA_MARGINE, STAVKA_PRORED], true);

  it('ocitanje u obliku predloska; sto pregled ne nosi, ne pise se', () => {
    const tijelo = st.stranice[1].odlomci.find((p) => p.index === 22)!;
    const naslov = st.stranice[1].odlomci.find((p) => p.index === 21)!;
    expect(ocitanje(tijelo)).toBe('Calibri 11 pt · prored 1,0 · lijevo');
    expect(ocitanje(naslov)).toBe('Calibri 14 pt · podebljano · naslov 1. razine');
    expect(ocitanje({ ...tijelo, font: null, pt: null, prored: null, poravnanje: null })).toBe('oblik odlomka nije zapisan');
  });

  it('plan mijenja samo ono sto parametri popravka zadaju; duh i mjerna linija iz pravila', () => {
    const sve = new Set(zahvati.map((z) => z.ruleId));
    expect(planOblika([STAVKA_MARGINE, STAVKA_PRORED], sve)).toMatchObject({ font: null, velicinaPt: null, prored: 1.5, margine: { left: 2.5 } });
    expect(planOblika([STAVKA_MARGINE], new Set())).toMatchObject({ margine: null, prored: null });
    const duh = duhPravilnika([STAVKA_MARGINE, STAVKA_PRORED], zahvati);
    expect(duh?.margine?.left).toBe(2.5);
    expect(duhPravilnika([], [])).toBeNull();
    const sada = izgledSada(pregled());
    expect(mjernaOznaka(sada, duh, false)).toBe('2,0 CM · TREBA 2,5');
    expect(mjernaOznaka(sada, duh, true)).toBe('2,5 CM ✓');
    expect(mjernaOznaka(sada, null, false)).toBe('2,0 CM');
    expect(mjernaOznaka({ ...sada, margine: null }, duh, false)).toBeNull();
    const uloga = { kind: 'zahvat' as const, ruleIds: ['margine'], label: 'Margine' };
    expect(popravakVidljiv(uloga, [STAVKA_MARGINE], zahvati)).toBe(true);
    expect(popravakVidljiv({ kind: 'rucno' }, [STAVKA_MARGINE], zahvati)).toBe(false);
  });

  it('isjecak pravilnika samo uz verificiran citat; mjesto kako ga izvor pise', () => {
    expect(isjecak({ exactEvidence: undefined })).toBeNull();
    expect(isjecak({ exactEvidence: { verified: true, sourceId: 's', title: 'Pravilnik', url: 'https://x', quote: 'Margine iznose 2,5 cm.', page: 9, pageLabel: null } }))
      .toEqual({ izvor: 'Pravilnik', mjesto: 'str. 9', recenica: 'Margine iznose 2,5 cm.' });
  });

  it('redak plana: broj zahvata i strop, bez cijene i bez bodova po zahvatu', () => {
    const redak = planRedak(new Set(['margine', 'prored']), zahvati, 71, 88);
    expect(redak).toBe('2 zahvata u planu · 71 → najviše 88');
    expect(planRedak(new Set(['margine']), zahvati, 71, null)).toBe('1 zahvat u planu');
    expect(redak).not.toMatch(/€|\+\s*\d/);
  });
});

/* ------------------------------------------------------------------ red cekanja i pecat */

describe('Z35 model: pecat tek kad su svi nalazi prekrizeni', () => {
  const zahvat = { kind: 'zahvat' as const, ruleIds: ['m'], label: 'M' };
  const rucni = { kind: 'rucno' as const };
  const nalazi = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, status: 'open' as const }));
  const uloge = [zahvat, rucni, rucni, rucni, rucni, rucni];

  it('5 od 6 nije pecat; 6 od 6 jest; prazan red nikad', () => {
    const pet = redCekanja(nalazi, uloge, new Set(['m']), new Set(['b', 'c', 'd', 'e']));
    expect([pet.n, pet.sve]).toEqual([5, false]);
    const sest = redCekanja(nalazi, uloge, new Set(['m']), new Set(['b', 'c', 'd', 'e', 'f']));
    expect([sest.n, sest.sve]).toEqual([6, true]);
    expect(redCekanja([], [], new Set(), new Set()).sve).toBe(false);
  });

  it('zahvat se prekrizi samo planom (zajednicki sa Z34), ne oznakom "sam"; odluka na presudi prekrizi', () => {
    expect(redCekanja([nalazi[0]], [zahvat], new Set(), new Set(['a'])).n).toBe(0);
    expect(redCekanja([{ id: 'a', status: 'ignored' as const }], [rucni], new Set(), new Set()).n).toBe(1);
  });
});

/* ------------------------------------------------------------------ montaza preko presude Z34 */

async function presudaIFaksimil(opcije: { stavke?: LiveStavka[] } = {}) {
  const { model, items } = nalaziFixture();
  const mount = document.createElement('section');
  document.body.append(mount);
  const akcije: unknown[] = [];
  renderResultsCockpit(mount, model, {
    repairAvailable: true,
    repairOutlook: OUTLOOK,
    onAction: (a) => akcije.push(a),
    desk: { items, planItems: opcije.stavke ?? [STAVKA_MARGINE, STAVKA_PRORED], mountDocument: async () => null, live: { preview: pregled(), storedPages: 4 } },
  });
  await vi.waitFor(() => expect(mount.dataset.rlReady).toBe('true'));
  const ulaz = mount.querySelector<HTMLButtonElement>('[data-rl-fax]');
  expect(ulaz, 'presuda Z34 nudi ulaz u faksimil').not.toBeNull();
  ulaz!.click();
  await vi.waitFor(() => expect(document.querySelector('[data-fl]')?.getAttribute('data-fl-ready')).toBe('true'));
  return { mount, akcije, fl: document.querySelector<HTMLElement>('[data-fl]')! };
}

describe('Z35 montaza: stvarni nalazi, dijeljeni plan, pecat', () => {
  it('otvara se s presude, nosi zaglavlje rada i vraca se na presudu', async () => {
    const { mount, fl } = await presudaIFaksimil();
    expect(fl.getAttribute('role')).toBe('dialog');
    expect(fl.querySelector('.fl-doc')?.textContent).toBe('diplomski-rad.docx · FPZG / Politologija / Diplomski rad');
    expect(document.documentElement.hasAttribute('data-fl-open')).toBe(true);
    fl.querySelector<HTMLElement>('[data-fl-back]')!.click();
    expect(document.querySelector('[data-fl]')).toBeNull();
    expect(document.documentElement.hasAttribute('data-fl-open')).toBe(false);
    expect(mount.dataset.rlReady).toBe('true');
  });

  it('tocke samo uz nalaze sa sidrom na listu; natpis "Oko str."; tekst je tekst rada', async () => {
    const { fl } = await presudaIFaksimil();
    // Pocetni nalaz presude je prvi (margina, cijeli rad): list s prvim naslovom 1. razine (str. 2).
    expect(fl.querySelector('[data-fl-natpis]')?.textContent).toBe('Oko str. 2 od 4');
    const tocke = [...fl.querySelectorAll<HTMLElement>('[data-fl-dot]')].map((d) => d.dataset.flZa);
    expect(tocke).toEqual(['23', '30']);
    expect(fl.querySelectorAll('[data-fl-notes] [data-fl-note]')).toHaveLength(4);
    const tekst = [...fl.querySelectorAll('[data-fl-text="now"] [data-fl-p]')].map((p) => p.textContent);
    expect(tekst[0]).toBe('2. Naslov 21');
    expect(tekst).toHaveLength(20);
    fl.querySelector<HTMLElement>('[data-fl-flip="1"]')!.click();
    expect(fl.querySelector('[data-fl-natpis]')?.textContent).toBe('Oko str. 3 od 4');
    expect([...fl.querySelectorAll<HTMLElement>('[data-fl-dot]')].map((d) => d.dataset.flZa)).toEqual(['45']);
  });

  it('kartica: mjere, ozbiljnost iz predloska, "Pokaži popravak" samo uz vidljiv zahvat', async () => {
    const { fl } = await presudaIFaksimil();
    const card = fl.querySelector<HTMLElement>('[data-fl-card]')!;
    expect(card.querySelector('.fl-card__t')?.textContent).toBe(MARGINA);
    expect(card.textContent).toContain('NALAZ 1 OD 6');
    expect(card.querySelector('[data-fl-res]')?.textContent).toBe('U planu ✓');
    expect(card.querySelector('[data-fl-prev]')?.textContent).toBe('Pokaži popravak na stranici');
    fl.querySelector<HTMLElement>('[data-fl-q="1"]')!.click();
    expect(card.querySelector('.fl-card__sev')?.textContent).toBe('BLOKIRA PREDAJU');
    expect(card.querySelector('[data-fl-res]')?.textContent).toBe('Napravit ću sam');
    expect(card.querySelector('[data-fl-prev]')).toBeNull();
  });

  it('plan je zajednicki sa Z34: iskljucen zahvat u faksimilu mijenja ladicu presude', async () => {
    const { mount, fl } = await presudaIFaksimil();
    const ladica = (): string => document.querySelector('[data-rl-tray] [data-rl-tray-n]')?.getAttribute('data-rl-tray-n') ?? '';
    expect(ladica()).toBe('2');
    fl.querySelector<HTMLElement>('[data-fl-res]')!.click();
    expect(fl.querySelector('[data-fl-res]')?.textContent).toBe('Uključi u plan');
    expect(ladica()).toBe('1');
    fl.querySelector<HTMLElement>('[data-fl-back]')!.click();
    expect(mount.querySelector('.rl-card__title')?.textContent).toBe(MARGINA);
    expect(mount.querySelector('[data-rl-toggle]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('pecat "Plan spreman" pada tek kad je prekrizen i sesti nalaz; tada "Nastavi na plan popravka"', async () => {
    const { fl, akcije } = await presudaIFaksimil();
    const pecat = () => fl.querySelector('[data-fl-stamp]');
    const brojac = () => fl.querySelector('[data-fl-count]')?.textContent;
    // Dva automatska su zadano u planu; cetiri rucna treba oznaciti "Napravit ću sam".
    expect(brojac()).toBe('RED ČEKANJA · 2 / 6');
    for (const i of [1, 2, 4]) {
      fl.querySelector<HTMLElement>(`[data-fl-q="${i}"]`)!.click();
      fl.querySelector<HTMLElement>('[data-fl-res]')!.click();
      expect(pecat()).toBeNull();
    }
    expect(brojac()).toBe('RED ČEKANJA · 5 / 6');
    expect(fl.querySelector('[data-fl-go]')).toBeNull();
    fl.querySelector<HTMLElement>('[data-fl-q="5"]')!.click();
    fl.querySelector<HTMLElement>('[data-fl-res]')!.click();
    expect(brojac()).toBe('RED ČEKANJA · 6 / 6');
    expect(pecat()?.textContent).toBe('Plan spreman');
    expect(fl.querySelector('[data-fl-done] span')?.textContent).toBe('2 zahvata u planu · 71 → najviše 88');
    fl.querySelector<HTMLElement>('[data-fl-go]')!.click();
    expect(document.querySelector('[data-fl]')).toBeNull();
    expect(akcije.at(-1)).toEqual({ kind: 'repair-safe', ruleIds: ['margine', 'prored'] });
  });

  it('"Napravit ću sam" prezivi zatvaranje: stanje je na presudi Z34', async () => {
    const { mount, fl } = await presudaIFaksimil();
    fl.querySelector<HTMLElement>('[data-fl-q="1"]')!.click();
    fl.querySelector<HTMLElement>('[data-fl-res]')!.click();
    fl.querySelector<HTMLElement>('[data-fl-back]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-rl-fax]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-fl-ready]')).not.toBeNull());
    expect(document.querySelector('[data-fl-count]')?.textContent).toBe('RED ČEKANJA · 3 / 6');
  });

  it('bez parametara popravka nema klizaca, duha ni "Pokaži popravak"', async () => {
    const { fl } = await presudaIFaksimil({ stavke: [{ ruleId: 'margine', label: 'Margine', violated: true, matchKeys: [MARGINA] }] });
    expect(fl.querySelector('[data-fl-slider]')).toBeNull();
    expect(fl.querySelector<HTMLElement>('[data-fl-layer="ghost"]')?.hidden).toBe(true);
    expect(fl.querySelector('[data-fl-prev]')).toBeNull();
  });

  it('slojevi: mjerne linije s izmjerenom marginom, duh s okvirom pravila, klizac nad stranicom', async () => {
    const { fl } = await presudaIFaksimil();
    fl.querySelector<HTMLElement>('[data-fl-layer="rulers"]')!.click();
    expect(fl.querySelector('[data-fl-margin-label]')?.textContent).toBe('2,0 CM · TREBA 2,5');
    fl.querySelector<HTMLElement>('[data-fl-layer="ghost"]')!.click();
    expect(fl.querySelector('[data-fl-ghost] .fl-ghost__frame')).not.toBeNull();
    fl.querySelector<HTMLElement>('[data-fl-slider]')!.click();
    const after = fl.querySelector<HTMLElement>('[data-fl-after]')!;
    expect(after.style.clipPath).toBe('inset(0 50% 0 0)');
    // Poslije plana tijelo dobiva prored 1,5 iz parametra popravka, naslov ostaje bez proreda.
    expect(after.querySelector('[data-fx-par="p"]')?.getAttribute('style')).toContain('--fl-lh:1.725');
    fl.querySelector<HTMLElement>('[data-fl-handle]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(after.style.clipPath).toBe('inset(0 45% 0 0)');
  });

  it('Escape zatvara faksimil', async () => {
    const { fl } = await presudaIFaksimil();
    fl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-fl]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ ruta faksimila: Z35 umjesto Z9 */

/** Presuda nad istim rezultatom; `clear` je stol Z8 (Z34 zamjenjuje samo presudu s blokatorima). */
function kokpit(opcije: { ton?: 'clear'; preview?: unknown } = {}) {
  const { model: m, items } = nalaziFixture();
  const model = opcije.ton === 'clear' ? { ...m, readiness: { ...m.readiness, kind: 'clear' as const } } : m;
  const mount = document.createElement('section');
  document.body.append(mount);
  const akcije: unknown[] = [];
  renderResultsCockpit(mount, model, {
    repairAvailable: true,
    repairOutlook: OUTLOOK,
    onAction: (a) => akcije.push(a),
    desk: {
      items, planItems: [STAVKA_MARGINE, STAVKA_PRORED], mountDocument: async () => null,
      live: { preview: opcije.preview ?? pregled(), storedPages: 4 },
    },
  });
  return { mount, akcije };
}

/** Ono sto faksimil tvrdi o radu: red cekanja, brojac, natpis lista, biljeske i tocke. */
function sadrzajFaksimila(fl: HTMLElement) {
  const tekst = (sel: string): string[] => [...fl.querySelectorAll(sel)].map((e) => e.textContent ?? '');
  return {
    red: tekst('[data-fl-q]'),
    brojac: fl.querySelector('[data-fl-count]')?.textContent,
    natpis: fl.querySelector('[data-fl-natpis]')?.textContent,
    kartica: fl.querySelector('.fl-card__t')?.textContent ?? null,
    biljeske: tekst('[data-fl-note]'),
    tocke: fl.querySelectorAll('[data-fl-dot]').length,
    zaglavlje: fl.querySelector('.fl-doc')?.textContent,
  };
}

/** Ishod kartice "Faksimil" kroz povratne pozive rute: Z35 zatvara pregled, Z9 samo iza legacy, inace poruka. */
function ruta(mount: HTMLElement | null): { zatvori: number; z9: number; poruke: string[] } {
  const r = { zatvori: 0, z9: 0, poruke: [] as string[] };
  otvoriRutuFaksimila(mount, () => { r.zatvori += 1; }, () => { r.z9 += 1; }, (p) => { r.poruke.push(p); });
  return r;
}
const Z35 = { zatvori: 1, z9: 0, poruke: [] };
const BEZ_TEKSTA = { zatvori: 0, z9: 0, poruke: ['Faksimil nije dostupan: pregled nema teksta rada.'] };

/** Rezultat bez ijednog nalaza (F51 a): isti rad, prazni `issues` i trijaza. */
function bezNalaza() {
  const r = rezultat() as unknown as { issues: unknown[]; details: { triage: { counts: unknown; findings: unknown[] } } };
  return { ...r, issues: [], details: { ...r.details, triage: { counts: { auto: 0, assisted: 0, manual: 0, total: 0 }, findings: [] } } } as never;
}

describe('Z35 ruta faksimila: kartica "Faksimil" i stol Z8 vode u Z35, Z9 samo iza legacy', () => {
  it('stol Z8 (presuda bez blokatora) nudi "Otvori faksimil"; Z35 nosi iste nalaze kao s presude Z34', async () => {
    const z8 = kokpit({ ton: 'clear' });
    expect(z8.mount.dataset.rlReady, 'presuda bez blokatora ostaje stol Z8').toBeUndefined();
    expect(z8.mount.querySelector('[data-desk]')).not.toBeNull();
    const gumb = z8.mount.querySelector<HTMLButtonElement>('[data-cockpit-fax]');
    expect(gumb?.textContent).toBe('Otvori faksimil');
    gumb!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-fl]')?.getAttribute('data-fl-ready')).toBe('true'));
    const izZ8 = sadrzajFaksimila(document.querySelector<HTMLElement>('[data-fl]')!);
    expect(izZ8.red).toHaveLength(6);
    expect(izZ8.brojac).toBe('RED ČEKANJA · 2 / 6');
    expect(izZ8.natpis).toBe('Oko str. 2 od 4');
    document.querySelector<HTMLElement>('[data-fl-back]')!.click();
    expect(document.querySelector('[data-fl]')).toBeNull();
    expect(z8.mount.querySelector('[data-desk]'), 'povratak je na isti stol Z8').not.toBeNull();
    z8.mount.remove();

    const { fl } = await presudaIFaksimil();
    expect(sadrzajFaksimila(fl), 'isti rezultat, ista prica u faksimilu bez obzira na ulaz').toEqual(izZ8);
  });

  it('kartica "Faksimil" sa stola Z8 otvara Z35; plan vrijedi dok je faksimil otvoren i ide u popravak', async () => {
    const { mount, akcije } = kokpit({ ton: 'clear' });
    expect(ruta(mount)).toEqual(Z35);
    // Dvostruki klik prije nego lijeni modul stigne ne otvara dva sloja.
    expect(ruta(mount)).toEqual(Z35);
    await vi.waitFor(() => expect(document.querySelector('[data-fl-ready]')).not.toBeNull());
    expect(document.querySelectorAll('[data-fl]')).toHaveLength(1);
    const fl = document.querySelector<HTMLElement>('[data-fl]')!;
    for (const i of [1, 2, 4, 5]) {
      fl.querySelector<HTMLElement>(`[data-fl-q="${i}"]`)!.click();
      fl.querySelector<HTMLElement>('[data-fl-res]')!.click();
    }
    expect(fl.querySelector('[data-fl-stamp]')?.textContent).toBe('Plan spreman');
    fl.querySelector<HTMLElement>('[data-fl-go]')!.click();
    expect(document.querySelector('[data-fl]')).toBeNull();
    expect(akcije.at(-1)).toEqual({ kind: 'repair-safe', ruleIds: ['margine', 'prored'] });
  });

  it('kartica "Faksimil" uz presudu Z34 otvara faksimil TOG stola: plan je zajednicki', async () => {
    const { mount } = kokpit();
    await vi.waitFor(() => expect(mount.dataset.rlReady).toBe('true'));
    expect(ruta(mount)).toEqual(Z35);
    await vi.waitFor(() => expect(document.querySelector('[data-fl-ready]')).not.toBeNull());
    const ladica = (): string => document.querySelector('[data-rl-tray] [data-rl-tray-n]')?.getAttribute('data-rl-tray-n') ?? '';
    expect(ladica()).toBe('2');
    document.querySelector<HTMLElement>('[data-fl-res]')!.click();
    expect(ladica(), 'iskljucen zahvat u faksimilu mijenja ladicu presude Z34').toBe('1');
  });

  it('ponovno crtanje presude zatvara faksimil otvoren sa stola Z8', async () => {
    const { mount } = kokpit({ ton: 'clear' });
    expect(ruta(mount)).toEqual(Z35);
    await vi.waitFor(() => expect(document.querySelector('[data-fl-ready]')).not.toBeNull());
    const { model: m } = nalaziFixture();
    renderResultsCockpit(mount, { ...m, readiness: { ...m.readiness, kind: 'clear' as const } }, { repairAvailable: false });
    expect(document.querySelector('[data-fl]')).toBeNull();
    expect(ruta(mount), 'presuda bez pregleda nema sto nacrtati, i ne pada na Z9').toEqual(BEZ_TEKSTA);
  });

  it('pregled bez teksta i nepostojeca presuda: poruka, nikad Z9; Z9 SAMO iza legacy', async () => {
    expect(ruta(null)).toEqual(BEZ_TEKSTA);
    const prazan = pregled();
    const bezTeksta = { ...prazan, paragraphs: prazan.paragraphs.map((p) => ({ ...p, text: ' ' })) };
    const prazno = kokpit({ ton: 'clear', preview: bezTeksta });
    expect(prazno.mount.querySelector('[data-cockpit-fax]')).toBeNull();
    expect(ruta(prazno.mount)).toEqual(BEZ_TEKSTA);
    const z8 = kokpit({ ton: 'clear' });
    document.documentElement.dataset.resultRenderer = 'legacy';
    expect(ruta(z8.mount)).toEqual({ zatvori: 0, z9: 1, poruke: [] });
    expect(ruta(null), 'legacy i bez presude crta Z9').toEqual({ zatvori: 0, z9: 1, poruke: [] });
    await Promise.resolve();
    expect(document.querySelector('[data-fl]')).toBeNull();
  });

  it('rezultat bez ijednog nalaza: nema stola, a kartica "Faksimil" otvara Z35 s istinitim praznim redom', async () => {
    const model = buildVisualResultModel(bezNalaza());
    expect(model.findings.document, 'generator: rezultat bez nalaza').toHaveLength(0);
    const mount = document.createElement('section');
    document.body.append(mount);
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      desk: { items: [], planItems: [], live: { preview: pregled(), storedPages: 4 } },
    });
    expect(mount.querySelector('[data-desk]'), 'bez nalaza nema stola').toBeNull();
    expect(ruta(mount)).toEqual(Z35);
    await vi.waitFor(() => expect(document.querySelector('[data-fl]')?.getAttribute('data-fl-ready')).toBe('true'));
    const fl = document.querySelector<HTMLElement>('[data-fl]')!;
    expect(fl.querySelector('[data-fl-prazno]')?.textContent).toBe('Nema otvorenih nalaza.');
    expect(fl.querySelectorAll('[data-fl-q], [data-fl-note], [data-fl-dot], [data-fl-count], [data-fl-stamp]')).toHaveLength(0);
    expect(fl.querySelector<HTMLElement>('[data-fl-card]')?.hidden).toBe(true);
    expect(fl.textContent).not.toContain('Prekriži svaki nalaz');
    // Stranica rada je ista kao uz nalaze: pocetak tijela, s tekstom iz pregleda.
    expect(fl.querySelector('[data-fl-natpis]')?.textContent).toBe('Oko str. 2 od 4');
    expect(fl.querySelectorAll('[data-fl-text="now"] [data-fl-p]').length).toBeGreaterThan(0);
    fl.querySelector<HTMLElement>('[data-fl-back]')!.click();
    expect(document.querySelector('[data-fl]')).toBeNull();
  });
});

describe('Z35 na stolu Z8: lijevi pano crta stranice Z35, ne stari Z9 (F51 a)', () => {
  it('listovi Z35, oznaka samo uz odlomke nalaza, klik u oba smjera, fusnota bez izmisljene oznake', async () => {
    // happy-dom ne racuna raspored; stol montira dokument tek kad pano ima sirinu.
    const prije = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    try {
      const { model: m } = nalaziFixture();
      const model = { ...m, readiness: { ...m.readiness, kind: 'clear' as const } };
      // Zastavica 12 nema svoj nalaz (npr. tipografska napomena): meta da, oznaka ne.
      const flags = [{ paragraphIndex: 23 }, { paragraphIndex: 30 }, { paragraphIndex: 45 }, { paragraphIndex: 0, footnoteId: 3 }, { paragraphIndex: 12 }];
      const items = deskItems(model.findings.document, flags);
      expect(items.filter((it) => it.flagIndex !== null).map((it) => it.flagIndex), 'generator: tri sidra u tijelu i fusnota').toEqual([0, 1, 2, 3]);
      const mount = document.createElement('section');
      document.body.append(mount);
      renderResultsCockpit(mount, model, { repairAvailable: true, desk: { items, flags, planItems: [], live: { preview: pregled(), storedPages: 4 } } });
      expect(mount.dataset.rlReady, 'presuda bez blokatora ostaje stol Z8').toBeUndefined();
      await vi.waitFor(() => expect(mount.querySelector('[data-desk-doc] [data-fl-stol]')).not.toBeNull());
      const pano = mount.querySelector<HTMLElement>('[data-desk-doc]')!;
      expect(pano.querySelectorAll('.lekta-fac-page, .lekta-facsimile, .lekta-fac-zoombar')).toHaveLength(0);
      expect([...pano.querySelectorAll('.fl-stol__natpis')].map((e) => e.textContent)).toEqual(['Oko str. 1 od 4', 'Oko str. 2 od 4', 'Oko str. 3 od 4', 'Oko str. 4 od 4']);
      expect([...pano.querySelectorAll<HTMLElement>('[data-fl-hit="nalaz"]')].map((e) => Number(e.dataset.flP))).toEqual([23, 30, 45]);
      // Mjesto aktivira nalaz.
      const i30 = items.findIndex((it) => it.flagIndex === 1);
      pano.querySelector<HTMLElement>('[data-fl-p="30"]')!.click();
      expect(mount.querySelector('[data-desk-count]')?.textContent).toBe(`${i30 + 1} od ${items.length}`);
      expect(pano.querySelector('[data-desk-active]')?.getAttribute('data-fl-p')).toBe('30');
      // Nalaz pomice dokument: odabir drugog nalaza premjesta oznaku.
      const i45 = items.findIndex((it) => it.flagIndex === 2);
      mount.querySelector<HTMLElement>(`[data-desk-go="${i45}"]`)!.click();
      expect(pano.querySelector('[data-desk-active]')?.getAttribute('data-fl-p')).toBe('45');
      // Fusnota se na listu ne crta: stol to kaze trakom, bez oznake na krivom mjestu.
      const iFus = items.findIndex((it) => it.flagIndex === 3);
      mount.querySelector<HTMLElement>(`[data-desk-go="${iFus}"]`)!.click();
      expect(pano.querySelector('[data-desk-active]')).toBeNull();
      // Gumb ispod stola i dalje otvara puni faksimil Z35.
      expect(mount.querySelector('[data-cockpit-fax]')?.textContent).toBe('Otvori faksimil');
    } finally {
      if (prije) Object.defineProperty(HTMLElement.prototype, 'clientWidth', prije);
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });
});

/* ------------------------------------------------------------------ gardovi */

describe('Z35 gardovi: pokret, lijena granica, copy, objasnjenja, tocke loma, cijena', () => {
  const css = read('src/ui/facsimile-live/facsimile-live.css');
  const modul = read('src/ui/facsimile-live/facsimile-live.ts');
  const model = read('src/ui/facsimile-live/facsimile-live-model.ts');
  const predlozak = read('design/templates/facsimile-live/FacsimileLive.dc.html');

  it('list Z35 animira samo transform, opacity i clip-path', () => {
    expect(motionCssProblems(css)).toEqual([]);
  });

  it('kod Z35 ulazi samo dinamickim uvozom iz stola Z34', () => {
    const izvori = {
      'src/ui/result-live/result-live.ts': read('src/ui/result-live/result-live.ts'),
      'src/ui/results/results-cockpit.ts': read('src/ui/results/results-cockpit.ts'),
      'src/ui/results/results-cockpit-live.ts': read('src/ui/results/results-cockpit-live.ts'),
      'src/ui/app.ts': read('src/ui/app.ts'),
    };
    expect(liveBoundaryProblems(izvori, 'src/ui/result-live/result-live.ts', '../facsimile-live/facsimile-live')).toEqual([]);
  });

  it('natpisi gumba su doslovno iz predloska FacsimileLive.dc.html', () => {
    expect(copyProblems(modul, predlozak, [])).toEqual([]);
  });

  it('ulaz s presude je zapisano odstupanje od predloska Z34 (F51)', () => {
    expect(copyProblems(read('src/ui/result-live/result-live.ts'), read('design/templates/result-live/ResultLive.dc.html'), ['Otvori faksimil'])).toEqual([]);
  });

  it('objasnjenja slojeva su doslovno FX_TIP iz predloska (svih pet)', () => {
    expect(fxTipIzPredloska(predlozak).map((t) => t.kljuc)).toEqual(['notes', 'dots', 'rulers', 'ghost', 'slider']);
    expect(fxTipProblems(modul, predlozak)).toEqual([]);
  });

  it('CSS koristi samo tocke loma iz Z37, i tocno one iz modela', () => {
    expect(tockeLomaProblems(css, [SIRINA_BILJESKI, SIRINA_KARTICE])).toEqual([]);
  });

  it('u kodu Z35 nema cijene ni bodova po zahvatu', () => {
    const izvori = {
      'src/ui/facsimile-live/facsimile-live.ts': modul,
      'src/ui/facsimile-live/facsimile-live-model.ts': model,
      'src/ui/facsimile-live/facsimile-live.css': css,
    };
    expect(cijenaProblems(izvori)).toEqual([]);
    expect(plusBodIzvorProblems({ 'src/ui/facsimile-live/facsimile-live.ts': modul, 'src/ui/facsimile-live/facsimile-live-model.ts': model })).toEqual([]);
  });

  it('predlozak doista nosi ono sto gardovi odbijaju (cijena, +N)', () => {
    expect(cijenaProblems({ predlozak })).toEqual(['predlozak: znak eura']);
    expect(predlozak).toContain("'Uključi u plan · +' + FX_P[s.sel]");
  });
});
