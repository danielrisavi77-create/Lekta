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
  filtriraj, izgledNakon, izgledSada, jezicci, ladica, natpisMjesta, opsegMjerenja, oznakaTrake, pocetniOdabir, polozaj,
  prebaci, prsten, rokTekst, stranicaNalaza, stranicaZaNalaz, trakaStranica, ulogaNalaza, uPlanu, vidljiviZahvati, zahvatiPlana,
  type LiveStavka,
} from '../src/ui/result-live/result-live-model';
import { copyProblems, liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';
import { cijenaProblems, plusBodIzvorProblems, plusBodProblems } from './helpers/result-live-guard';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';

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

/**
 * 80 odlomaka po 20 na stranici: 4 stranice, isto kao `storedPages`. Trag prijeloma nosi PRVI
 * odlomak nove stranice (21, 41, 61), kao Wordov `w:lastRenderedPageBreak`.
 */
function preview(prijelomi = [21, 41, 61]) {
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
    const opseg = opsegMjerenja([{ category: 'formatting', status: 'pass' }]);
    expect(jezicci(nalazi, opseg).map((j) => [j.label, j.n, j.prazan])).toEqual([
      ['Sve', 5, false], ['Format', 1, false], ['Struktura', 2, false], ['Citati', 1, false], ['Predaja', 0, true],
    ]);
  });

  it('Codex R2: opseg mjerenja dolazi iz checks; kvacica samo za izmjerenu kategoriju bez nalaza', () => {
    const opseg = opsegMjerenja([
      { category: 'typography', status: 'warn' }, { category: 'formatting', status: 'unmeasurable' },
      { category: 'scope', status: 'informational' }, { category: 'submission', status: 'nepoznat' }, null, { status: 'pass' },
    ]);
    // unmeasurable i nepoznat status nisu mjerenje; typography je Format, scope je Predaja.
    expect([...opseg.entries()]).toEqual([['Format', 1], ['Predaja', 1]]);
    const stanja = (o: ReturnType<typeof opsegMjerenja>) => jezicci([{ category: 'citations' }], o).map((j) => [j.key, j.stanje]);
    expect(stanja(opseg)).toEqual([['all', 'nalazi'], ['Format', 'cisto'], ['Struktura', 'nemjereno'], ['Citati', 'nalazi'], ['Predaja', 'cisto']]);
    // KONTROLA: bez ijedne provjere (ili ulaz koji nije lista) nijedna kategorija nije "cisto".
    for (const ulaz of [[], undefined, 'checks', { length: 2 }]) {
      expect(stanja(opsegMjerenja(ulaz)).filter(([, st]) => st === 'cisto'), String(ulaz)).toEqual([]);
    }
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

  it('bez stvarnog broja stranica nema celija ni pripisa, ali skupine ostaju (Codex R5)', () => {
    for (const pages of [null, 0, 4.5, 'cetiri', 2001]) {
      const t = trakaStranica(preview() as never, pages, items);
      expect(t.ukupno, String(pages)).toBeNull();
      expect(t.poStranici.size).toBe(0);
      expect(t.pouzdano).toBe(false);
      expect(t.cijeliRad).toEqual([indeks('Desna margina')]);
      expect(t.bezStranice.length).toBe(items.length - 1);
    }
  });

  it('Codex R5: svaki nalaz je u TOCNO jednoj skupini (stranica, cijeli rad, fusnote, bez stranice)', () => {
    const fus = { finding: { ...items[0].finding, id: 'fus', scope: { kind: 'anchor' as const, paragraphIndex: 0, footnoteId: 7 } }, flagIndex: null };
    const regija = { finding: { ...items[0].finding, id: 'reg', scope: { kind: 'region' as const, label: 'naslovnica' } }, flagIndex: null };
    const svi = [...items, fus, regija];
    const t = trakaStranica(preview() as never, 4, svi);
    const skupljeno = [...[...t.poStranici.values()].flat(), ...t.cijeliRad, ...t.fusnote, ...t.bezStranice].sort((a, b) => a - b);
    expect(skupljeno).toEqual(svi.map((_, i) => i));
    expect(t.fusnote).toEqual([svi.length - 2]);
    expect(t.bezStranice).toContain(svi.length - 1);
    expect(stranicaNalaza(t, indeks('(Novak'))).toBe(3);
    expect(stranicaNalaza(t, svi.length - 2)).toBeNull();
    expect(oznakaTrake(fus.finding.scope, null)).toBe('Bilješka 7');
    expect(oznakaTrake(regija.finding.scope, null)).toBe('Stranica nije poznata');
    expect(oznakaTrake(regija.finding.scope, 2)).toBe('Oko str. 2');
  });

  it('Codex R4/R5: natpis mjesta govori o nalazu, ne o prikazanom ulomku', () => {
    const t = trakaStranica(preview() as never, 4, items);
    const za = (scope: Parameters<typeof natpisMjesta>[0]) => natpisMjesta(scope, stranicaZaNalaz(preview() as never, scope, t), t);
    expect(za({ kind: 'document' }), 'ulomak je str. 1, ali nalaz vrijedi za cijeli rad').toBe('Cijeli rad');
    expect(stranicaZaNalaz(preview() as never, { kind: 'document' }, t).broj, 'KONTROLA: ulomak stvarno jest str. 1').toBe(1);
    expect(za({ kind: 'anchor', paragraphIndex: 42 })).toBe('Oko str. 3 od 4');
    expect(za({ kind: 'anchor', paragraphIndex: 0, footnoteId: 3 })).toBe('Bilješka 3');
    expect(za({ kind: 'region', label: 'popis literature' })).toBe('Popis literature');
    expect(za({ kind: 'unavailable', reason: 'x' })).toBe('Mjesto nije poznato');
    expect(za({ kind: 'anchor', paragraphIndex: 500 })).toBe('Odlomak 500, izvan pregleda');
    const bezKarte = trakaStranica(preview([20]) as never, 4, items);
    expect(natpisMjesta({ kind: 'anchor', paragraphIndex: 42 }, stranicaZaNalaz(preview([20]) as never, { kind: 'anchor', paragraphIndex: 42 }, bezKarte), bezKarte)).toBe('Odlomak 42');
  });

  it('Wordovi prijelomi koji se slazu s brojem stranica daju jantarne stranice; cijeli rad ide na crvenu crtu', () => {
    const t = trakaStranica(preview() as never, 4, items);
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

  it('odlomak koji nosi lastRenderedPageBreak je PRVI na novoj stranici, ne zadnji na prethodnoj', () => {
    // Trag na 41: stranica 3 su odlomci 41 do 60. Stari pripis (prijelom IZA odlomka) dao bi 42 do 61.
    const t = trakaStranica(preview([21, 41, 61]) as never, 4, items)!;
    expect(t.pouzdano).toBe(true);
    const novak = stranicaZaNalaz(preview([21, 41, 61]) as never, items[indeks('(Novak')].finding.scope, t);
    expect(novak.broj).toBe(3);
    expect(novak.odlomci[0].index).toBe(41);
    expect(novak.odlomci.at(-1)?.index).toBe(60);
    // Trag na prvom odlomku rada ne otvara drugu stranicu.
    expect(trakaStranica(preview([1, 21, 41, 61]) as never, 4, items)!.pouzdano).toBe(true);
  });

  it('stvarni .docx: odlomak s w:lastRenderedPageBreak kroz analizu pocinje drugu stranicu', async () => {
    const r = (tekst: string, lrpb = false): { text: string; raw: string } => ({
      text: tekst,
      raw: `<w:p><w:r>${lrpb ? '<w:lastRenderedPageBreak/>' : ''}<w:t>${tekst}</w:t></w:r></w:p>`,
    });
    const datoteka = buildDocxFile({ paragraphs: [r('Prva stranica, prvi odlomak.'), r('Prva stranica, drugi odlomak.'), r('Druga stranica pocinje ovdje.', true), r('Druga stranica, drugi odlomak.')] });
    const profile = resolveProfile(VERIFIED_PROFILE_REGISTRY[0].id);
    const settings = { profileId: VERIFIED_PROFILE_REGISTRY[0].id, workType: profile.selection.workType, citationStyle: 'fpzg',
      language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {} };
    const rez = await analyzeDocx(datoteka, profile, settings as never, () => {}) as { preview?: unknown };
    const pv = rez.preview as { paragraphs: Array<{ index: number; text: string; pageBreakAfter: boolean }> };
    const nosi = pv.paragraphs.find((x) => x.text.startsWith('Druga stranica pocinje'))!;
    expect(nosi.pageBreakAfter, 'analiza mora oznaciti odlomak s tragom').toBe(true);
    const t = trakaStranica(pv as never, 2, [])!;
    expect(t.pouzdano).toBe(true);
    const s = stranicaZaNalaz(pv as never, { kind: 'anchor', paragraphIndex: nosi.index }, t);
    expect(s.broj).toBe(2);
    expect(s.odlomci.map((x) => x.text)).toEqual(['Druga stranica pocinje ovdje.', 'Druga stranica, drugi odlomak.']);
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
  it('jezicci: Sve 4, prazna Predaja bez klika; filtar Citati pokazuje 1 od 1', async () => {
    const { mount } = await montiraj();
    const tabs = [...mount.querySelectorAll<HTMLButtonElement>('[data-rl-tab]')];
    // Fixture nema nijednu provjeru Predaje, pa je to "nije mjereno", ne kvacica (Codex R2).
    expect(tabs.map((t) => t.textContent)).toEqual(['Sve4', 'Format1', 'Struktura2', 'Citati1', 'Predajanije mjereno']);
    expect(tabs[4].disabled).toBe(true);
    klikni(tabs[4]);
    expect(mount.querySelector('[data-rl-tab="all"]')?.getAttribute('aria-selected')).toBe('true');
    klikni(mount.querySelector('[data-rl-tab="Citati"]'));
    expect(mount.querySelector('[data-desk-count]')?.textContent).toBe('1 od 1');
    expect(karticaNaslov(mount)).toBe('(Novak, 2022) nema zapis u literaturi');
    expect(mount.querySelector<HTMLButtonElement>('.desk-nav__btn--next')?.disabled).toBe(true);
    expect(mount.querySelector('[data-rl-manual]')?.textContent).toBe('Ovo dodaješ sam. Lekta ne mijenja sadržaj rada, samo oblik.');
  });

  it('otkazuje zastarjelo listanje nakon promjene jezicka', async () => {
    const { mount } = await montiraj();
    const prvi = karticaNaslov(mount);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      klikni(mount.querySelector('.desk-nav__btn--next'));
      klikni(mount.querySelector('[data-rl-tab="Format"]'));
      klikni(mount.querySelector('[data-rl-tab="all"]'));
      const nakonFiltra = karticaNaslov(mount);
      await vi.advanceTimersByTimeAsync(250);
      expect(nakonFiltra).toBe(prvi);
      expect(karticaNaslov(mount)).toBe(prvi);
    } finally {
      vi.useRealTimers();
    }
  });

  it('otkazuje zastarjelo listanje kad se promijeni prikaz Sada / Nakon plana', async () => {
    const { mount } = await montiraj();
    const prvi = karticaNaslov(mount);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      klikni(mount.querySelector('.desk-nav__btn--next'));
      klikni(mount.querySelector('[data-rl-mode="after"]'));
      await vi.advanceTimersByTimeAsync(250);
      expect(karticaNaslov(mount)).toBe(prvi);
    } finally {
      vi.useRealTimers();
    }
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
    expect(mount.querySelector('[data-rl-pagelabel]')?.textContent).toBe('Oko str. 3 od 4');
    expect(mount.querySelector('[data-rl-p="42"]')?.hasAttribute('data-rl-hit')).toBe(true);
    klikni(mount.querySelector('[data-rl-mode="after"]'));
    expect(mount.querySelector<HTMLElement>('[data-rl-page]')?.dataset.mode).toBe('after');
    expect(mount.querySelector<HTMLElement>('[data-rl-text="after"]')?.style.getPropertyValue('--rl-pad')).toBe('11.90cqw 11.90cqw 11.90cqw 14.29cqw');
    expect(mount.querySelector<HTMLElement>('[data-rl-text="now"]')?.style.getPropertyValue('--rl-pad')).toBe('11.90cqw 9.52cqw 11.90cqw 9.52cqw');
    expect(mount.querySelector('[data-rl-note]')?.textContent).toBe('Ovo dodaješ sam: (Novak, 2022) nema zapis u literaturi, Naslov 2.3 nije u sadržaju, Tablica nema prepoznat naslov.');
  });

  it('traka stranica: stvaran broj celija, crvena crta za cijeli rad, gumb stranice otvara nalaz', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const { mount } = await montiraj();
    expect(mount.querySelectorAll('.rl-cell')).toHaveLength(4);
    expect(mount.querySelectorAll('.rl-cell--hit')).toHaveLength(2);
    // Celije su karta (Codex R8): nijedna nije gumb, mete su gumbi stranica ispod nje.
    expect(mount.querySelectorAll('.rl-cell[data-rl-page-go], button.rl-cell')).toHaveLength(0);
    expect(mount.querySelector('.rl-strip__cells')?.getAttribute('aria-hidden')).toBe('true');
    const stranice = [...mount.querySelectorAll('[data-rl-page-go]')];
    expect(stranice.map((c) => c.textContent)).toEqual(['str. 3', 'str. 4']);
    for (const c of stranice) expect(c.getAttribute('aria-label')).toMatch(/^Oko stranice [0-9]+, [0-9]+ nalaz/);
    expect(mount.querySelector('.rl-strip__line')).not.toBeNull();
    expect(mount.querySelector('.rl-strip__legend')?.textContent).toBe('Crvena crta: 1 nalaz vrijedi za cijeli rad. Jantarna stranica nosi nalaze; pripis stranici je približan.');
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
      'src/ui/results/results-cockpit-live.ts': read('src/ui/results/results-cockpit-live.ts'),
      'src/ui/app.ts': read('src/ui/app.ts'),
      'src/ui/progress-scan.ts': read('src/ui/progress-scan.ts'),
    };
    expect(izvori['src/ui/results/results-cockpit.ts']).toContain("import('./results-cockpit-live')");
    expect(liveBoundaryProblems(izvori, 'src/ui/results/results-cockpit-live.ts', '../result-live/result-live')).toEqual([]);
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

  it('u izvoru Z34 nema bodova po zahvatu (Codex R11; mutacija u gate-mutations)', () => {
    expect(plusBodIzvorProblems({
      'src/ui/result-live/result-live.ts': read('src/ui/result-live/result-live.ts'),
      'src/ui/result-live/result-live-model.ts': read('src/ui/result-live/result-live-model.ts'),
    })).toEqual([]);
  });

  it('predlozak doista nosi ono sto gardovi odbijaju (generator ulaza nije prazan)', () => {
    const predlozak = read('design/templates/result-live/ResultLive.dc.html');
    expect(cijenaProblems({ predlozak })).toEqual(['predlozak: znak eura']);
    expect(plusBodProblems('Uključi u plan · +7')).toEqual(['bodovi po zahvatu: "+7"']);
    expect(predlozak).toContain('Uključi u plan · +{{ cur.p }}');
  });
});

/* ------------------------------------------------------------------ Codex runda (PR #308) */

/**
 * Codex R2 do R6 i R9 nad ISTIM rezultatom: istinitost kartice, mjesta i trake. Fixture nosi svaku
 * klasu ulaza koju nalaz imenuje (nalaz cijelog rada s izmjerenim bez ocekivanog, nalaz u fusnoti,
 * nalaz bez pripisive stranice, verificiran citat pravila) i to prvi test i tvrdi, da zeleni test
 * ne bi mjerio fixture bez ciljanog ulaza.
 */
describe('Z34 Codex runda: kartica, mjesto i traka govore istinu', () => {
  const NASLOV_FUSNOTA = 'Bilješka 3 nema broj stranice';
  const CITAT = 'Margine iznose 2,5 cm sa svih strana.';
  const runda = (extra: Record<string, unknown> = {}) => result({
    issues: [
      { severity: 'error', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', detail: 'U popisu literature nema djela autora Novak iz 2022.', where: 'Odlomak 42' },
      { severity: 'warning', category: 'formatting', title: NASLOV_MARGINE, detail: 'Izmjereno 2,0 cm, očekivano 2,5 cm.', where: 'Postavke stranice' },
      { severity: 'warning', category: 'citations', title: NASLOV_FUSNOTA, detail: 'Izravni citat u bilješci nema stranicu.', where: 'Bilješka 3' },
      { severity: 'warning', category: 'elements', title: 'Tablica nema prepoznat naslov', detail: 'Provjeri oznaku tablice.', where: 'Tablica 4' },
    ],
    checks: [
      { category: 'formatting', title: NASLOV_MARGINE, status: 'warn', earned: 4, max: 6, detail: 'Desna margina 2,0 cm', issue: null, scored: true },
      { category: 'citations', title: 'Citati u tekstu', status: 'fail', earned: 0, max: 8, detail: 'Dva citata bez zapisa.', issue: null, scored: true },
      { category: 'elements', title: 'Natpisi tablica', status: 'warn', earned: 1, max: 2, detail: 'Jedna tablica bez natpisa.', issue: null, scored: true },
    ],
    details: {
      ruleAuthority: 'official-source',
      triage: {
        counts: { auto: 1, assisted: 0, manual: 2, total: 3 },
        findings: [
          { id: 'novak', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', severity: 'error', fixability: 'manual', locations: [{ paragraphIndex: 42 }] },
          { id: 'fus', category: 'citations', title: NASLOV_FUSNOTA, severity: 'warning', fixability: 'manual', locations: [{ paragraphIndex: 0, footnoteId: 3 }] },
        ],
      },
    },
    capabilities: { repair: true, preview: true },
    ...extra,
  });

  async function montirajRundu(extra: Record<string, unknown> = {}): Promise<HTMLElement> {
    document.documentElement.dataset.motion = 'reduce';
    const r = runda(extra);
    const prvi = buildVisualResultModel(r);
    const margina = prvi.findings.document.find((f) => f.title === NASLOV_MARGINE)!;
    const model = buildVisualResultModel(r, {
      repairItems: [{ fixerId: 'margins-fixer', matchKeys: [NASLOV_MARGINE] }],
      exactEvidence: { [margina.id]: { verified: true, sourceId: 'fpzg-pravilnik', title: 'Pravilnik o završnom radu', url: 'https://www.fpzg.unizg.hr/pravilnik.pdf', quote: CITAT, page: 4, expected: '2,5 cm' } },
    });
    const mount = document.createElement('section');
    document.body.append(mount);
    const checks = (r as { checks: unknown[] }).checks;
    renderResultsCockpit(mount, model, {
      repairAvailable: true,
      repairOutlook: OUTLOOK,
      desk: { items: deskItems(model.findings.document, []), planItems: [STAVKA_MARGINE], mountDocument: async () => null, live: { preview: preview(), storedPages: 4, checks } },
    });
    await vi.waitFor(() => expect(mount.dataset.rlReady).toBe('true'));
    return mount;
  }

  const idiNa = (m: HTMLElement, naslov: string): void => {
    klikni(m.querySelector('[data-rl-tab="all"]'));
    for (let i = 0; i < 10 && karticaNaslov(m) !== naslov; i += 1) klikni(m.querySelector('.desk-nav__btn--next'));
    expect(karticaNaslov(m)).toBe(naslov);
  };

  it('KONTROLA: fixture nosi ciljane klase ulaza (cijeli rad, fusnota, bez mjesta, citat)', () => {
    const model = buildVisualResultModel(runda());
    const opseg = Object.fromEntries(model.findings.document.map((f) => [f.title, f.scope.kind === 'anchor' && f.scope.footnoteId != null ? 'fusnota' : f.scope.kind]));
    expect(opseg).toEqual({ '(Novak, 2022) nema zapis u literaturi': 'anchor', [NASLOV_MARGINE]: 'document', [NASLOV_FUSNOTA]: 'fusnota', 'Tablica nema prepoznat naslov': 'unavailable' });
    const margina = model.findings.document.find((f) => f.title === NASLOV_MARGINE)!;
    expect(margina.measured).toBe('Desna margina 2,0 cm');
    expect(margina.expected, 'bez citata nema ocekivanog').toBeUndefined();
  });

  it('R2: kategorija bez nalaza nosi kvacicu SAMO kad je mjerena; nemjerena kaze "nije mjereno"', async () => {
    const m = await montirajRundu();
    const predaja = m.querySelector<HTMLButtonElement>('[data-rl-tab="Predaja"]')!;
    expect(predaja.textContent, 'Predaja nema nijednu provjeru, pa nema ni kvacice').toBe('Predajanije mjereno');
    expect(predaja.disabled).toBe(true);
    expect(m.querySelector('[data-rl-tab="Struktura"]')?.textContent).toBe('Struktura1');
    document.body.innerHTML = '';
    // Ista kategorija s izmjerenom provjerom i bez nalaza: tek tada kvacica.
    const r = runda();
    const s = await montirajRundu({ checks: [...(r as { checks: unknown[] }).checks, { category: 'submission', title: 'Predajni paket', status: 'pass', earned: 2, max: 2, detail: 'Uredno.', issue: null, scored: true }] });
    expect(s.querySelector('[data-rl-tab="Predaja"]')?.textContent).toBe('Predaja✓');
  });

  it('R3: izmjereno bez ocekivanog ostaje vidljivo; kartica nosi citat pravila, izvor i uputu', async () => {
    const m = await montirajRundu();
    idiNa(m, '(Novak, 2022) nema zapis u literaturi');
    const novak = m.querySelector('[data-rl-card]')!;
    expect(novak.querySelector('[data-rl-izmjereno]'), 'Novak nema izmjereno').toBeNull();
    expect(novak.querySelector('[data-rl-uputa]')?.textContent).toBe('Što napravitiOtvorite označeno mjesto i provjerite ga prema uputama.');
    idiNa(m, NASLOV_MARGINE);
    const k = m.querySelector('[data-rl-card]')!;
    expect(k.querySelector('[data-rl-izmjereno]')?.textContent).toContain('Desna margina 2,0 cm');
    expect(k.querySelector('[data-rl-ocekivano]')?.textContent).toContain('2,5 cm');
    expect(k.querySelector('.cockpit-finding__evidence p')?.textContent).toBe(CITAT);
    expect(k.querySelector('.cockpit-finding__evidence small')?.textContent).toBe('Pravilnik o završnom radu, str. 4');
    expect(k.querySelector<HTMLAnchorElement>('.cockpit-finding__source')?.getAttribute('href')).toBe('https://www.fpzg.unizg.hr/pravilnik.pdf');
    expect(k.querySelector('[data-rl-uputa]')?.textContent).toBe('Što napravitiPokrenite automatski popravak, zatim ponovno provjerite dokument.');
    document.body.innerHTML = '';
    // Izmjereno BEZ ocekivanog (nema citata): mjera se ne skriva.
    const bez = document.createElement('section');
    document.body.append(bez);
    const model = buildVisualResultModel(runda());
    renderResultsCockpit(bez, model, { repairAvailable: true, desk: { items: deskItems(model.findings.document, []), mountDocument: async () => null, live: { preview: preview(), storedPages: 4, checks: [] } } });
    await vi.waitFor(() => expect(bez.dataset.rlReady).toBe('true'));
    idiNa(bez, NASLOV_MARGINE);
    expect(bez.querySelector('[data-rl-card] [data-rl-izmjereno]')?.textContent).toContain('Desna margina 2,0 cm');
    expect(bez.querySelector('[data-rl-card] [data-rl-ocekivano]')).toBeNull();
  });

  it('R4: nalaz za cijeli rad nosi "Cijeli rad", ne "Oko str. 1"', async () => {
    const m = await montirajRundu();
    idiNa(m, NASLOV_MARGINE);
    expect(m.querySelector('[data-rl-pagelabel]')?.textContent).toBe('Cijeli rad');
    expect(m.querySelector('[data-rl-pagenote]')?.textContent).toBe('Cijeli rad');
  });

  it('R5: fusnota i nalaz bez pripisive stranice vidljivi su u traci i na kartici (scope)', async () => {
    const m = await montirajRundu();
    const traka = (): Element => m.querySelector('[data-rl-strip]')!;
    expect(traka().querySelector('[data-rl-skup="fusnote"]')?.textContent).toBe('Fusnote · 1');
    expect(traka().querySelector('[data-rl-skup="bez"]')?.textContent).toBe('Bez stranice · 1');
    idiNa(m, NASLOV_FUSNOTA);
    expect(m.querySelector('[data-rl-card] .cockpit-finding__location')?.textContent).toBe('Gdje: Bilješka 3 →');
    expect(m.querySelector('[data-rl-pagelabel]')?.textContent).toBe('Bilješka 3');
    expect(m.querySelector('[data-rl-pagenote]')?.textContent).toBe('Bilješka 3');
    idiNa(m, 'Tablica nema prepoznat naslov');
    expect(m.querySelector('[data-rl-card] .cockpit-finding__location')?.textContent).toMatch(/^Gdje: Lokacija nije pouzdano dostupna/);
    expect(m.querySelector('[data-rl-pagelabel]')?.textContent).toBe('Mjesto nije poznato');
    // Skup otvara svoj prvi nalaz.
    klikni(traka().querySelector('[data-rl-skup="fusnote"]'));
    expect(karticaNaslov(m)).toBe(NASLOV_FUSNOTA);
  });

  it('R6: nakon zamjene kartice strelicom fokus ostaje na strelici nove kartice (oba smjera)', async () => {
    const m = await montirajRundu();
    const dalje = m.querySelector<HTMLButtonElement>('.desk-nav__btn--next')!;
    dalje.focus();
    dalje.click();
    const nakon = document.activeElement as HTMLElement;
    expect(nakon.closest('[data-rl-card]'), 'fokus je u novoj kartici').not.toBeNull();
    expect(nakon.classList.contains('desk-nav__btn--next')).toBe(true);
    expect(m.querySelector('[data-desk-count]')?.textContent).toBe('2 od 4');
    const natrag = m.querySelector<HTMLButtonElement>('.desk-nav__btn--prev')!;
    natrag.focus();
    natrag.click();
    // Na prvoj kartici "Prethodni" je ugasen, pa fokus ide na "Sljedeci", ne na body.
    expect(m.querySelector('[data-desk-count]')?.textContent).toBe('1 od 4');
    expect((document.activeElement as HTMLElement).classList.contains('desk-nav__btn--next')).toBe(true);
  });

  it('R9: legenda trake ne tvrdi "tocno jednom mjestu"; pripis je priblizan', async () => {
    const m = await montirajRundu();
    const legenda = m.querySelector('.rl-strip__legend')?.textContent ?? '';
    expect(legenda).not.toContain('točno jednom mjestu');
    expect(legenda).toContain('približ');
  });
});
