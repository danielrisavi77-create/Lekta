/**
 * Z34 prema Z8 nad ISTIM rezultatom (Codex R10). Z34 zamjenjuje stol Z8 kad presuda nije `clear`,
 * pa mora reci isto: istu presudu i ogradu, iste nalaze s istim mjerama, dokazom, uputom, mjestom i
 * odlukom, iste savjetodavne nalaze i isto stanje rucne provjere. Svaka NAMJERNA razlika je
 * izricito popisana u `NAMJERNE_RAZLIKE` (i u F37, `docs/agents/orchestrator-backlog.md`), a test
 * tvrdi i da se svaka popisana razlika STVARNO dogada, da popis ne postane tiha iznimka.
 *
 * Kartica Z8 je `priorityFindingHtml` (isti HTML koji crta stol Z8, `desk-view.ts`), pa se za svaki
 * nalaz usporeduje s tocno onim sto bi Z8 pokazao, ne s prepisanim ocekivanjem.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVisualResultModel, type VisualFindingModel, type VisualResultModel } from '../src/ui/results/visual-result-model';
import { renderResultsCockpit } from '../src/ui/results/results-cockpit';
import { deskItems } from '../src/ui/results/desk-model';
import { priorityFindingHtml } from '../src/ui/results/priority-findings';
import { buildDocumentDnaModel } from '../src/results/document-dna-model';
import type { RepairOutlookModel } from '../src/ui/results/repair-outlook';

/** Namjerne razlike Z34 prema Z8. Kljuc je ono sto test mjeri; tekst je razlog (isti kao u F37). */
const NAMJERNE_RAZLIKE = {
  'kategorije-bodovi': 'R7: jezicci nose broj nalaza i opseg mjerenja, ne postotak ni earned/max (bodovi ostaju u "Sve provjere")',
  'dna-traka': 'DNA po odlomcima zamjenjuje traka stranica sa skupinama cijeli rad, fusnote, bez stranice',
  'red-cekanja': 'Red cekanja Z8 zamjenjuju jezicci i hrpa kartica; svi nalazi ostaju dohvatljivi strelicama',
  'ozbiljnost-copy': 'Natpisi ozbiljnosti i kategorije doslovno iz predloska (Blokira predaju, Format...), ista ljestvica',
  'radnja-kartice': 'Gumb "Popravi automatski / Otvori mjesto / Prikazi detalje" zamjenjuje preklopnik plana ili "Ovo dodajes sam"',
  'natpis-ocekivano': '"Pravilnik" umjesto "Ocekivano" samo uz verificiran citat pravila',
  'prsten-opis': 'Prsten nosi opis "Ocjena sada N, najvise M ako svi zahvati uspiju" umjesto "Tehnicka ocjena N od 100"',
} as const;

const NASLOV_MARGINE = 'Desna margina odstupa od profila';
const CITAT = 'Margine iznose 2,5 cm sa svih strana.';

function rezultat(profil: 'verified' | 'draft', samoSavjeti = false) {
  const issues = samoSavjeti
    ? [{ severity: 'info', category: 'structure', title: 'Savjet o sazetku', detail: 'Sazetak je dulji od preporuke.', where: 'Odlomak 3' }]
    : [
      { severity: 'error', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', detail: 'Nema zapisa.', where: 'Odlomak 42' },
      { severity: 'warning', category: 'formatting', title: NASLOV_MARGINE, detail: 'Izmjereno 2,0 cm.', where: 'Postavke stranice' },
      { severity: 'warning', category: 'citations', title: 'Bilješka 3 nema broj stranice', detail: 'Izravni citat bez stranice.', where: 'Bilješka 3' },
      { severity: 'warning', category: 'elements', title: 'Tablica nema prepoznat naslov', detail: 'Provjeri oznaku.', where: 'Tablica 4' },
      { severity: 'info', category: 'structure', title: 'Naslov 2.3 nije u sadržaju', detail: 'Savjet.', where: 'Odlomak 71' },
      { severity: 'warning', category: 'typography', title: 'Navodnici nisu dosljedni', detail: 'Dvije vrste.', where: 'Odlomak 12' },
    ];
  return {
    score: 74,
    scoredChecks: 10,
    file: { name: 'rad.docx' },
    profile: 'FPZG / Politologija / Diplomski rad',
    profileStatus: profil,
    issues,
    checks: [
      { category: 'formatting', title: NASLOV_MARGINE, status: 'warn', earned: 4, max: 6, detail: 'Desna margina 2,0 cm', issue: null, scored: true },
      { category: 'structure', title: 'Sadržaj', status: 'pass', earned: 5, max: 5, detail: 'Uredno.', issue: null, scored: true },
    ],
    categories: { formatting: { earned: 20, max: 24 }, structure: { earned: 18, max: 20 }, citations: { earned: 9, max: 20 } },
    capabilities: { repair: true, preview: true },
    details: {
      ruleAuthority: profil === 'verified' ? 'official-source' : 'draft',
      inspectionCoverage: { version: 1, status: 'partial', summary: { limitedOccurrences: 1, analyzerSkips: 0 }, items: [{ kind: 'text-box', count: 1 }], analyzerSkips: [] },
      triage: {
        counts: { auto: 1, assisted: 0, manual: 4, total: 5 },
        findings: [
          { id: 'novak', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', severity: 'error', fixability: 'manual', locations: [{ paragraphIndex: 42 }] },
          { id: 'fus', category: 'citations', title: 'Bilješka 3 nema broj stranice', severity: 'warning', fixability: 'manual', locations: [{ paragraphIndex: 0, footnoteId: 3 }] },
          { id: 'naslov', category: 'structure', title: 'Naslov 2.3 nije u sadržaju', severity: 'info', fixability: 'manual', locations: [{ paragraphIndex: 71 }] },
          { id: 'savjet', category: 'structure', title: 'Savjet o sazetku', severity: 'info', fixability: 'manual', locations: [{ paragraphIndex: 3 }] },
        ],
      },
    },
  } as never;
}

function pregled() {
  return {
    truncated: false,
    baseFont: 'Calibri',
    baseSize: 11,
    page: { margins: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, size: { w: 21, h: 29.7 } },
    paragraphs: Array.from({ length: 80 }, (_, k) => ({ index: k + 1, text: `Odlomak ${k + 1}.`, headingLevel: k === 0 ? 1 : null, pageBreakAfter: [21, 41, 61].includes(k + 1), lineHeight: 1 })),
  };
}

const OUTLOOK: RepairOutlookModel = {
  kind: 'available', currentScore: 74, ceilingScore: 90, headroom: 16,
  counts: { auto: 1, assisted: 0, manual: 4 }, manualItems: [], preselected: 1, atCeiling: false,
};

function model(r: ReturnType<typeof rezultat>): VisualResultModel {
  const prvi = buildVisualResultModel(r);
  const margina = prvi.findings.document.find((f) => f.title === NASLOV_MARGINE);
  return buildVisualResultModel(r, {
    repairItems: [{ fixerId: 'margins-fixer', matchKeys: [NASLOV_MARGINE] }],
    exactEvidence: margina ? { [margina.id]: { verified: true, sourceId: 'p', title: 'Pravilnik o završnom radu', url: 'https://www.fpzg.unizg.hr/pravilnik.pdf', quote: CITAT, page: 4, expected: '2,5 cm' } } : {},
  });
}

function nacrtaj(m: VisualResultModel, r: ReturnType<typeof rezultat>, live: boolean): HTMLElement {
  const mount = document.createElement('section');
  document.body.append(mount);
  const dna = buildDocumentDnaModel({ totalParagraphs: 80, lastPreviewedParagraph: 80, previewTruncated: false, headings: [], findings: [], provisional: !m.readiness.authoritative });
  renderResultsCockpit(mount, m, {
    repairAvailable: true,
    repairOutlook: OUTLOOK,
    documentDna: dna,
    desk: {
      items: deskItems(m.findings.document, []),
      planItems: [{ ruleId: 'margine', label: 'Margine', violated: true, matchKeys: [NASLOV_MARGINE] }],
      mountDocument: async () => null,
      ...(live ? { live: { preview: pregled(), storedPages: 4, checks: (r as { checks: unknown }).checks } } : {}),
    },
  });
  return mount;
}

const t = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Sto kartica Z8 kaze o nalazu, procitano iz njezina HTML-a. */
function z8Kartica(f: VisualFindingModel) {
  const d = document.createElement('div');
  d.innerHTML = priorityFindingHtml(f, true);
  const odgovor = (oznaka: string): string | null => {
    const b = [...d.querySelectorAll('.cockpit-finding__answer')].find((x) => t(x.querySelector('strong')) === oznaka);
    return b ? t(b.querySelector('p')) : null;
  };
  return {
    naslov: t(d.querySelector('h3')),
    zasto: odgovor('Zašto'),
    uputa: odgovor('Što napraviti'),
    izmjereno: odgovor('Izmjereno'),
    ocekivano: odgovor('Očekivano'),
    gdje: t(d.querySelector('.cockpit-finding__location')),
    dokaz: d.querySelector('.cockpit-finding__evidence')?.outerHTML ?? null,
    izvor: d.querySelector('.cockpit-finding__source')?.getAttribute('href') ?? null,
    odluke: [...d.querySelectorAll('[data-finding-confirm],[data-finding-ignore],[data-finding-reopen]')].map((b) => t(b)),
    ozbiljnost: [...d.querySelector('[data-cockpit-finding]')!.classList].find((c) => /--(error|warning|info)$/.test(c)),
  };
}

/** Isto, procitano iz kartice Z34. */
function z34Kartica(m: HTMLElement) {
  const k = m.querySelector('[data-rl-card]')!;
  const mjera = (sel: string): string | null => {
    const el = k.querySelector(sel);
    return el ? t(el).replace(/^(Izmjereno|Pravilnik|Očekivano)\s*/, '') : null;
  };
  return {
    id: k.getAttribute('data-finding-id'),
    naslov: t(k.querySelector('.rl-card__title')),
    zasto: k.querySelector('.rl-card__why') ? t(k.querySelector('.rl-card__why')) : null,
    uputa: t(k.querySelector('[data-rl-uputa]')).replace(/^Što napraviti\s*/, ''),
    izmjereno: mjera('[data-rl-izmjereno]'),
    ocekivano: mjera('[data-rl-ocekivano]'),
    natpisOcekivano: t(k.querySelector('[data-rl-ocekivano] .rl-mr__k')) || null,
    gdje: t(k.querySelector('.cockpit-finding__location')),
    dokaz: k.querySelector('.cockpit-finding__evidence')?.outerHTML ?? null,
    izvor: k.querySelector('.cockpit-finding__source')?.getAttribute('href') ?? null,
    odluke: [...k.querySelectorAll('[data-finding-confirm],[data-finding-ignore],[data-finding-reopen]')].map((b) => t(b)),
    ton: k.querySelector('.rl-card__eyebrow')?.getAttribute('data-ton') ?? null,
    radnja: k.querySelector('[data-rl-toggle]') ? 'plan' : k.querySelector('[data-rl-manual]') ? 'rucno' : 'nista',
    z8Radnja: !!k.querySelector('[data-finding-action]'),
  };
}

/** Prolazi SVE kartice Z34 strelicom (filtar Sve) i vraca ih redom. */
function sveKarticeZ34(m: HTMLElement): Array<ReturnType<typeof z34Kartica>> {
  const out: Array<ReturnType<typeof z34Kartica>> = [];
  for (let i = 0; i < 40; i += 1) {
    out.push(z34Kartica(m));
    const dalje = m.querySelector<HTMLButtonElement>('[data-rl-card] .desk-nav__btn--next');
    if (!dalje || dalje.disabled) break;
    dalje.click();
  }
  return out;
}

/** Dio lista presude koji Z34 NE smije mijenjati (pojacava ga, ne zamjenjuje). */
function presuda(m: HTMLElement) {
  return {
    status: m.querySelector('[data-cockpit-verdict-sheet]')?.getAttribute('data-cockpit-status'),
    naslov: t(m.querySelector('#cockpitVerdictTitle')),
    sazetak: t(m.querySelector('.fsum')),
    ograda: [...m.querySelectorAll('.cockpit-caveat')].map((c) => t(c)),
    ogranicenje: t(m.querySelector('[data-cockpit-inspection-limit]')),
    gumb: t(m.querySelector('[data-cockpit-primary]')),
    radnja: m.querySelector('[data-cockpit-primary]')?.getAttribute('data-cockpit-action') ?? null,
    oznake: t(m.querySelector('.cockpit-marks')),
    pecat: t(m.querySelector('[data-cockpit-stamp]')),
    ocjena: t(m.querySelector('.cockpit-ring__core')),
    sveProvjere: t(m.querySelector('[data-cockpit-advanced]')),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset.motion;
});

describe('Z34 prema Z8 nad istim rezultatom (Codex R10)', () => {
  for (const profil of ['verified', 'draft'] as const) {
    it(`${profil}: presuda, ograda, nalazi, mjere, dokaz, uputa, mjesto i odluke su isti`, async () => {
      document.documentElement.dataset.motion = 'reduce';
      const r = rezultat(profil);
      const m = model(r);
      const z8 = nacrtaj(m, r, false);
      const z34 = nacrtaj(m, r, true);
      await vi.waitFor(() => expect(z34.dataset.rlReady).toBe('true'));

      // KONTROLA: fixture nosi svaku klasu ulaza koju usporedba imenuje.
      const opsezi = m.findings.document.map((f) => (f.scope.kind === 'anchor' && f.scope.footnoteId != null ? 'fusnota' : f.scope.kind));
      expect(new Set(opsezi)).toEqual(new Set(['anchor', 'document', 'fusnota', 'unavailable']));
      expect(m.findings.document.some((f) => f.exactEvidence), 'verificiran citat').toBe(true);
      expect(m.findings.document.some((f) => f.severity === 'info'), 'savjetodavni nalaz').toBe(true);
      if (profil === 'draft') expect(z8.querySelector('[data-cockpit-caveat="limited"]'), 'ograda djelomicnog statusa').not.toBeNull();

      // Presuda i ograda: isti list (Z34 ga samo pojacava).
      expect(presuda(z34)).toEqual(presuda(z8));

      // Nalazi: isti skup i isti redoslijed kao stol Z8 (ignorirani su izvan oba).
      const kartice = sveKarticeZ34(z34);
      expect(kartice.map((k) => k.id)).toEqual(m.findings.document.filter((f) => f.status !== 'ignored').map((f) => f.id));
      expect(kartice.map((k) => k.naslov), 'isti popis i redoslijed kao red cekanja stola Z8')
        .toEqual([...z8.querySelectorAll('[data-desk-queue] .dq-title')].map((el) => t(el)));
      expect(kartice.length, 'KONTROLA: usporedba nije prazna').toBe(6);

      for (const k of kartice) {
        const f = m.findings.document.find((x) => x.id === k.id)!;
        const z = z8Kartica(f);
        const ime = f.title;
        expect(k.naslov, ime).toBe(z.naslov);
        expect(k.zasto, `${ime}: zasto`).toBe(z.zasto);
        expect(k.uputa, `${ime}: uputa`).toBe(z.uputa);
        expect(k.izmjereno, `${ime}: izmjereno`).toBe(z.izmjereno);
        expect(k.ocekivano, `${ime}: ocekivano`).toBe(z.ocekivano);
        expect(k.gdje, `${ime}: mjesto`).toBe(z.gdje);
        expect(k.dokaz, `${ime}: dokaz`).toBe(z.dokaz);
        expect(k.izvor, `${ime}: izvor`).toBe(z.izvor);
        expect(k.odluke, `${ime}: odluke`).toEqual(z.odluke);
        // NAMJERNO ('ozbiljnost-copy'): ista ljestvica, drugi natpis.
        const ton = { 'cockpit-finding--error': m.readiness.authoritative ? 'blok' : 'dorada', 'cockpit-finding--warning': 'dorada', 'cockpit-finding--info': 'provjera' }[z.ozbiljnost ?? ''];
        expect(k.ton, `${ime}: ozbiljnost`).toBe(ton);
        // NAMJERNO ('natpis-ocekivano'): "Pravilnik" samo uz verificiran citat.
        if (k.ocekivano) expect(k.natpisOcekivano, ime).toBe(f.exactEvidence ? 'Pravilnik' : 'Očekivano');
        // NAMJERNO ('radnja-kartice'): Z34 nema gumb radnje Z8.
        expect(k.z8Radnja, ime).toBe(false);
      }
      // Namjerne razlike se STVARNO dogadaju (popis nije tiha iznimka).
      expect(kartice.some((k) => k.natpisOcekivano === 'Pravilnik'), NAMJERNE_RAZLIKE['natpis-ocekivano']).toBe(true);
      expect(kartice.some((k) => k.radnja === 'plan') && kartice.some((k) => k.radnja === 'rucno'), NAMJERNE_RAZLIKE['radnja-kartice']).toBe(true);
    });
  }

  it('kategorije, DNA i red cekanja: namjerne razlike, a podatak iza njih je isti', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const r = rezultat('verified');
    const m = model(r);
    const z8 = nacrtaj(m, r, false);
    const z34 = nacrtaj(m, r, true);
    await vi.waitFor(() => expect(z34.dataset.rlReady).toBe('true'));

    // 'kategorije-bodovi' (R7): Z8 crta postotke i bodove, Z34 ne.
    expect(z8.querySelectorAll('[data-cockpit-category]').length, NAMJERNE_RAZLIKE['kategorije-bodovi']).toBe(3);
    expect(z34.querySelectorAll('[data-cockpit-category]')).toHaveLength(0);
    // Broj nalaza po jezicku je broj nalaza te kategorije u ISTOM modelu.
    const broj = (key: string): string => t(z34.querySelector(`[data-rl-tab="${key}"] .rl-tab__n`));
    const poKat = (kat: string[]): number => m.findings.document.filter((f) => kat.includes(f.category)).length;
    expect(broj('Format')).toBe(String(poKat(['formatting', 'typography'])));
    expect(broj('Struktura')).toBe(String(poKat(['structure', 'elements'])));
    expect(broj('Citati')).toBe(String(poKat(['citations'])));
    expect(broj('Predaja'), 'nema provjere Predaje: nije mjereno, ne kvacica').toBe('nije mjereno');
    // "Sve provjere (N)" ostaje u oba, s istim N (bodovi kategorija su ondje).
    expect(t(z34.querySelector('[data-cockpit-advanced]'))).toBe(t(z8.querySelector('[data-cockpit-advanced]')));

    // 'dna-traka': DNA po odlomcima zamjenjuje traka stranica; svaki nalaz je u tocno jednoj skupini.
    expect(z8.querySelector('[data-cockpit-dna]'), NAMJERNE_RAZLIKE['dna-traka']).not.toBeNull();
    expect(z34.querySelector('[data-cockpit-dna]')).toBeNull();
    const skup = (k: string): number => Number(/· (\d+)$/.exec(t(z34.querySelector(`[data-rl-skup="${k}"]`)))?.[1] ?? 0);
    const stranice = [...z34.querySelectorAll('[data-rl-page-go]')].reduce((s, b) => s + Number(/, (\d+) nalaz/.exec(b.getAttribute('aria-label') ?? '')?.[1] ?? 0), 0);
    const nalazi = m.findings.document.filter((f) => f.status !== 'ignored');
    expect(skup('cijeli')).toBe(nalazi.filter((f) => f.scope.kind === 'document').length);
    expect(skup('fusnote')).toBe(nalazi.filter((f) => f.scope.kind === 'anchor' && f.scope.footnoteId != null).length);
    expect(stranice + skup('cijeli') + skup('fusnote') + skup('bez'), 'svaki nalaz je negdje na traci').toBe(nalazi.length);

    // 'red-cekanja': Z8 ima red cekanja, Z34 jezicke; isti broj nalaza.
    expect(z8.querySelector('[data-desk-queue]'), NAMJERNE_RAZLIKE['red-cekanja']).not.toBeNull();
    expect(z34.querySelector('[data-desk-queue]')).toBeNull();
    expect(t(z34.querySelector('[data-rl-tab="all"] .rl-tab__n'))).toBe(String(nalazi.length));

    // 'prsten-opis': isti broj u prstenu, drugi opis.
    expect(z34.querySelector('.cockpit-ring')?.getAttribute('aria-label'), NAMJERNE_RAZLIKE['prsten-opis']).toBe('Ocjena sada 74, najviše 90 ako svi zahvati uspiju');
    expect(z8.querySelector('.cockpit-ring')?.getAttribute('aria-label')).toBe('Tehnička ocjena 74 od 100');
  });

  it('rucna provjera (samo savjetodavni nalazi): ista presuda i isti nalaz u oba prikaza', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const r = rezultat('verified', true);
    const m = model(r);
    expect(m.readiness.kind, 'KONTROLA: stanje je rucna provjera').toBe('manual-review');
    const z8 = nacrtaj(m, r, false);
    const z34 = nacrtaj(m, r, true);
    await vi.waitFor(() => expect(z34.dataset.rlReady).toBe('true'));
    expect(presuda(z34)).toEqual(presuda(z8));
    const [k] = sveKarticeZ34(z34);
    const z = z8Kartica(m.findings.document[0]);
    expect([k.naslov, k.zasto, k.uputa, k.gdje, k.odluke]).toEqual([z.naslov, z.zasto, z.uputa, z.gdje, z.odluke]);
    expect(k.ton).toBe('provjera');
  });
});
