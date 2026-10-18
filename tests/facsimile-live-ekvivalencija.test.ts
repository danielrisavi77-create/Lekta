/**
 * Z35 prema Z9 nad ISTIM rezultatom. Faksimil Z35 zamjenjuje faksimil Z9 (`render-facsimile.ts`) na
 * ruti faksimila, pa mora pokazati iste podatke: isti tekst odlomaka istim redom, istu velicinu,
 * poravnanje i razmake iz dokumenta, a oznake samo na odlomcima koje i Z9 oznacava. Svaka NAMJERNA
 * razlika je izricito popisana u `NAMJERNE_RAZLIKE` (i u F stavkama, `docs/agents/orchestrator-backlog.md`),
 * a test tvrdi i da se svaka popisana razlika STVARNO dogada, da popis ne postane tiha iznimka.
 *
 * Generator ulaza nosi svaku klasu koju razlike imenuju: prijelome stranica (trag na prvom odlomku
 * nove stranice), naslov, celije tablice, sliku, oznaku i tekst fusnote, nalaz tipografije bez nalaza
 * na presudi, i nalaze sa sidrom koje Z9 oznacava iz istog rezultata.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import { renderResultsCockpit } from '../src/ui/results/results-cockpit';
import { deskItems } from '../src/ui/results/desk-model';
import { renderFacsimile } from '../src/preview/render-facsimile';
import { collectAllPreviewFlags, type PreviewModel } from '../src/preview/preview-anchors';

/** Namjerne razlike Z35 prema Z9. Kljuc je ono sto test mjeri; tekst je razlog. */
const NAMJERNE_RAZLIKE = {
  'prijelom-stranice': 'Odlomak s Wordovim tragom prijeloma POCINJE novu stranicu (lastRenderedPageBreak, F37); Z9 ga ostavlja zadnjim na listu',
  'jedan-list': 'Z35 crta jedan list i lista ga; Z9 crta sve listove jedan ispod drugoga',
  'broj-stranice': 'Z9 pise redni broj lista na svaki list; Z35 broj pise samo kad plan numerira stranice (poslije, ili "Pokaži popravak")',
  'samo-nalazi': 'Tocke i biljeske Z35 su samo nalazi presude; Z9 oznacava i tipografske napomene bez nalaza',
  'tablica-i-slika': 'Z35 crta tekst celija kao odlomke i ne crta slike; Z9 slaze celije u tablicu i crta slike',
  'fusnote': 'Z35 ne crta oznake ni tekst fusnota (nalaz u fusnoti je u redu cekanja); Z9 ih crta na zadnjem listu',
  'prored-css': 'Prored iz dokumenta Z35 crta kao 1,15 x visekratnik (Word jednostruki redak); Z9 pise visekratnik doslovno',
} as const;

function pregled(): PreviewModel {
  const prijelomi = [11, 21];
  return {
    truncated: false,
    baseFont: 'Times New Roman',
    baseSize: 12,
    page: { margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 }, size: { w: 21, h: 29.7 } },
    footnotes: [{ id: 1, text: 'Tekst prve fusnote.' }],
    paragraphs: Array.from({ length: 30 }, (_, k) => {
      const index = k + 1;
      const naslov = index === 1 || index === 11;
      return {
        index,
        text: index === 8 ? '' : naslov ? `Naslov ${index}` : `Odlomak ${index} s tekstom rada.`,
        headingLevel: naslov ? 1 : null,
        align: naslov ? 'center' : 'both',
        size: naslov ? 16 : 12,
        spaceBefore: naslov ? 12 : null,
        spaceAfter: 6,
        lineHeight: naslov ? null : 1.5,
        pageBreakAfter: prijelomi.includes(index),
        runs: [{ text: naslov ? `Naslov ${index}` : `Odlomak ${index} s tekstom rada.`, bold: naslov, italic: false, font: 'Times New Roman', size: naslov ? 16 : 12 }],
        ...(index === 3 ? { markers: [{ id: 1, offset: 9 }] } : {}),
        ...(index === 2 ? { images: [{ src: 'data:image/png;base64,iVBORw0KGgo=', wCm: 2, hCm: 2 }] } : {}),
        ...(index === 5 || index === 6 ? { cell: { tableId: 0, row: 0, col: index - 5 } } : {}),
      };
    }),
  } as PreviewModel;
}

function rezultat() {
  return {
    score: 80,
    scoredChecks: 8,
    file: { name: 'rad.docx' },
    profile: 'FPZG / Politologija / Diplomski rad',
    profileStatus: 'verified',
    issues: [
      { severity: 'error', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', detail: 'Citat bez izvora u odlomak 14: Novak.', where: 'Odlomak 14' },
      { severity: 'warning', category: 'structure', title: 'Naslov nije u sadržaju', detail: 'Naslov u odlomak 11.', where: 'Odlomak 11' },
      { severity: 'warning', category: 'formatting', title: 'Lijeva margina je preuska', detail: 'Izmjereno 3,0 cm.', where: 'Postavke stranice' },
    ],
    checks: [],
    categories: { formatting: { earned: 20, max: 24 } },
    capabilities: { repair: true, preview: true },
    details: {
      ruleAuthority: 'official-source',
      typoLint: { findings: [{ paragraphIndex: 3, kind: 'razmak', excerpt: 'Odlomak' }] },
      triage: {
        counts: { auto: 0, assisted: 0, manual: 2, total: 2 },
        findings: [
          { id: 'novak', category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', severity: 'error', fixability: 'manual', locations: [{ paragraphIndex: 14 }] },
          { id: 'naslov', category: 'structure', title: 'Naslov nije u sadržaju', severity: 'warning', fixability: 'manual', locations: [{ paragraphIndex: 11 }] },
        ],
      },
    },
  };
}

interface Odlomak { index: number; text: string; pt: string; align: string; mt: string; mb: string; lh: string }

/** Z9: svaki list, odlomci s izracunatim stilom; tekst bez oznake fusnote. */
function z9() {
  const r = renderFacsimile(pregled(), collectAllPreviewFlags(rezultat()), { doc: document });
  const listovi = [...r.root.querySelectorAll<HTMLElement>('.lekta-fac-page')].map((page) =>
    [...page.querySelectorAll<HTMLElement>('[data-p-index]')].map((el): Odlomak => ({
      index: Number(el.dataset.pIndex),
      text: el.textContent ?? '',
      pt: el.style.fontSize.replace('pt', ''),
      align: el.style.textAlign,
      mt: el.style.marginTop.replace('pt', ''),
      mb: el.style.marginBottom.replace('pt', ''),
      lh: el.style.lineHeight,
    })));
  const oznaceni = new Set([...r.root.querySelectorAll<HTMLElement>('.lekta-fac-para--flagged')].map((el) => Number(el.dataset.pIndex)));
  return { root: r.root, listovi, oznaceni };
}

/** Z35 preko presude Z34: svi listovi listanjem, odlomci s inline stilom iz modela. */
async function z35() {
  const model = buildVisualResultModel(rezultat() as never);
  const items = deskItems(model.findings.document, []);
  const mount = document.createElement('section');
  document.body.append(mount);
  renderResultsCockpit(mount, model, {
    repairAvailable: true,
    desk: { items, planItems: [], mountDocument: async () => null, live: { preview: pregled(), storedPages: 3 } },
  });
  await vi.waitFor(() => expect(mount.dataset.rlReady).toBe('true'));
  mount.querySelector<HTMLButtonElement>('[data-rl-fax]')!.click();
  await vi.waitFor(() => expect(document.querySelector('[data-fl-ready]')).not.toBeNull());
  const fl = document.querySelector<HTMLElement>('[data-fl]')!;
  while (!fl.querySelector<HTMLButtonElement>('[data-fl-flip="-1"]')!.disabled) fl.querySelector<HTMLElement>('[data-fl-flip="-1"]')!.click();
  const listovi: Odlomak[][] = [];
  const tocke = new Set<number>();
  for (;;) {
    listovi.push([...fl.querySelectorAll<HTMLElement>('[data-fl-text="now"] [data-fl-p]')].map((el): Odlomak => {
      const st = el.getAttribute('style') ?? '';
      const calc = (svojstvo: string): string => st.match(new RegExp(`${svojstvo}:calc\\(([\\d.]+) \\* var\\(--fl-ptu\\)\\)`))?.[1] ?? '';
      return {
        index: Number(el.dataset.flP),
        text: el.textContent ?? '',
        pt: el.style.getPropertyValue('--fl-pt'),
        align: el.style.textAlign,
        mt: calc('margin-top'),
        mb: calc('margin-bottom'),
        lh: el.style.getPropertyValue('--fl-lh'),
      };
    }));
    fl.querySelectorAll<HTMLElement>('[data-fl-dot]').forEach((d) => tocke.add(Number(d.dataset.flZa)));
    const dalje = fl.querySelector<HTMLButtonElement>('[data-fl-flip="1"]')!;
    if (dalje.disabled) break;
    dalje.click();
  }
  return { fl, listovi, tocke };
}

afterEach(() => { document.body.innerHTML = ''; document.documentElement.removeAttribute('data-fl-open'); });

describe('Z35 prema Z9 nad istim rezultatom', () => {
  it('generator nosi svaku klasu ulaza koju razlike imenuju', () => {
    const p = pregled();
    expect(p.paragraphs.filter((x) => x.pageBreakAfter).map((x) => x.index)).toEqual([11, 21]);
    expect(p.paragraphs.some((x) => x.cell)).toBe(true);
    expect(p.paragraphs.some((x) => x.images?.length)).toBe(true);
    expect(p.paragraphs.some((x) => x.markers?.length)).toBe(true);
    expect(p.footnotes?.length).toBe(1);
    const flags = collectAllPreviewFlags(rezultat());
    expect(flags.some((f) => f.source === 'typo')).toBe(true);
    expect(flags.some((f) => f.source === 'issue-anchor')).toBe(true);
  });

  it('isti tekst odlomaka istim redom (bez oznake fusnote), isti stil iz dokumenta', async () => {
    const a = z9().listovi.flat();
    const b = (await z35()).listovi.flat();
    // Z9 crta i prazan odlomak; Z35 crta samo odlomke s tekstom (prazan je na karti, ne na listu).
    const z9Tekst = a.filter((x) => x.text.trim());
    expect(b.map((x) => x.index)).toEqual(z9Tekst.map((x) => x.index));
    expect(b.map((x) => x.text)).toEqual(z9Tekst.map((x) => (x.index === 3 ? x.text.replace(/^(.{9})1/, '$1') : x.text)));
    for (const [i, x] of b.entries()) {
      const y = z9Tekst[i];
      expect([x.pt, x.align, x.mt, x.mb], `odlomak ${x.index}`).toEqual([y.pt, y.align, y.mt, y.mb]);
    }
  });

  it('svaka tocka Z35 stoji na odlomku koji i Z9 oznacava', async () => {
    const { oznaceni } = z9();
    const { tocke } = await z35();
    expect([...tocke].sort((x, y) => x - y)).toEqual([11, 14]);
    for (const t of tocke) expect(oznaceni.has(t), `odlomak ${t}`).toBe(true);
  });

  it('NAMJERNE RAZLIKE se stvarno dogadaju (popis nije tiha iznimka)', async () => {
    const a = z9();
    const b = await z35();
    const prvi = (l: Odlomak[][]) => l.map((s) => s[0]?.index);
    const zadnji = (l: Odlomak[][]) => l.map((s) => s[s.length - 1]?.index);
    const dogodilo: Record<keyof typeof NAMJERNE_RAZLIKE, boolean> = {
      // Z9: [1..11], [12..21], [22..30]; Z35: [1..10], [11..20], [21..30].
      'prijelom-stranice': JSON.stringify(zadnji(a.listovi)) === '[11,21,30]' && JSON.stringify(prvi(b.listovi)) === '[1,11,21]',
      'jedan-list': a.root.querySelectorAll('.lekta-fac-page').length === 3 && b.fl.querySelectorAll('[data-fl-page]').length === 1,
      'broj-stranice': a.root.querySelectorAll('.lekta-fac-pagenum').length === 3 && b.fl.querySelectorAll('.fl-pn').length === 0,
      'samo-nalazi': a.oznaceni.has(4) && !b.tocke.has(4),
      'tablica-i-slika': a.root.querySelectorAll('table.lekta-fac-table').length === 1 && a.root.querySelectorAll('img').length === 1
        && b.fl.querySelectorAll('table, img').length === 0 && b.listovi.flat().some((x) => x.index === 5),
      'fusnote': a.root.querySelectorAll('[data-fn-id], sup').length > 0 && b.fl.querySelectorAll('[data-fn-id], sup').length === 0,
      'prored-css': a.listovi.flat().find((x) => x.index === 2)?.lh === '1.5' && b.listovi.flat().find((x) => x.index === 2)?.lh === '1.725',
    };
    expect(Object.entries(dogodilo).filter(([, d]) => !d).map(([k]) => k)).toEqual([]);
    expect(Object.keys(NAMJERNE_RAZLIKE)).toHaveLength(7);
  });
});
