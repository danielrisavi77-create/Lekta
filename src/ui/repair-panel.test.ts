import { describe, it, expect, beforeEach } from 'vitest';
import { renderRepairPanel, type LegalFootnoteRepairFormDefinition, type FinalDocumentInspectorFormDefinition, type RepairableItem } from './repair-panel';
import { singleSectionDocx } from '../../tests/helpers/synthetic-docx';
import type { Check } from '../scoring/checks';

function chk(title: string, status: string, earned: number, max: number): Check {
  return { category: 'formatting', title, status, earned, max, detail: '', issue: null, scored: max > 0 };
}

/** Cekaj dok uvjet ne postane istinit (async DOM nakon klika: dinamicki import + applyFixers + reanalyze).
 *  Timeout je namjerno velikodusan: taj lanac izolirano traje ~1-4 s, ali u punom `npm run check`
 *  (268 test datoteka paralelno) zna prijeci 4 s i tada je test padao kao flake, bez ikakve veze sa
 *  stvarnim ponasanjem. Granica sluzi samo da se test ne vrti zauvijek. */
async function waitFor(fn: () => boolean, timeout = 30_000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

// DOM ponasanje panela (happy-dom): sortiranje/mapiranje checkboxa, podnaslov
// grupe, deep-preklopnik, klik s 0 odabranih. Ne pokrece stvarni applyFixers
// (dinamicki import se ne dosegne dok je 0 odabrano ili dok ne kliknemo download).

function item(over: Partial<RepairableItem>): RepairableItem {
  return { ruleId: 'r', fixerId: 'margins-fixer', label: 'L', params: {}, violated: true, ...over };
}

function mount(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

/** Ledger je od ovog vala UVIJEK jedini vidljivi prikaz (list ostaje skriveni izvor istine za
 *  checkboxove) - otvori ga kao korisnik: klik na "Prilagodi popravke ->". */
function openLedger(mountEl: HTMLElement): HTMLElement {
  mountEl.querySelector<HTMLButtonElement>('.lekta-repair-trigger__btn')!.click();
  return document.querySelector<HTMLElement>('.modal-backdrop[data-lekta-repair-ledger-modal]')!;
}

/** Tier A: klikni "{label} (N) ->" na ledger retku ciji tekst pocinje danim prefiksom, vrati
 *  novootvoreni, zaseban item-modal (drugi modal-backdrop, BEZ ledger oznake). */
function openTierAItem(ledger: HTMLElement, labelPrefix: string): HTMLElement {
  const btn = Array.from(ledger.querySelectorAll<HTMLButtonElement>('.lekta-repair-ledger-row-edit')).find((b) =>
    b.textContent?.startsWith(labelPrefix),
  )!;
  btn.click();
  return document.querySelector<HTMLElement>('.modal-backdrop:not([data-lekta-repair-ledger-modal])')!;
}

/** Tier B: otvori inline <details> na ledger retku (dispatchamo 'toggle' rucno - ne oslanjamo se
 *  na to hoce li happy-dom sam ispaliti event pri programatskom otvaranju). */
function openTierBDetails(ledger: HTMLElement): HTMLDetailsElement {
  const details = ledger.querySelector<HTMLDetailsElement>('details.lekta-repair-panel__more')!;
  details.open = true;
  details.dispatchEvent(new Event('toggle'));
  return details;
}

const ctxBase = {
  getDocxBytes: async () => new Uint8Array(0),
  originalFileName: 'rad.docx',
};

beforeEach(() => {
  document.body.innerHTML = '';
  // triggerDownload zove URL.createObjectURL/revokeObjectURL; happy-dom ih ne mora imati,
  // pa ih stubamo da preuzimanje ne baci (inace bi handler pao u catch i preskocio re-check).
  (globalThis.URL as any).createObjectURL = () => 'blob:mock';
  (globalThis.URL as any).revokeObjectURL = () => {};
});

describe('renderRepairPanel: grupiranje i checkboxi', () => {
  it('pravne fusnote prikazuju pojedinačnu potvrdu i tehnički marker', () => {
    const mountEl = mount();
    const form: LegalFootnoteRepairFormDefinition = {
      candidates: [{ footnoteId: 2, rawText: 'op. cit.', type: 'op-cit', confidence: 'medium', evidence: ['cilj pronađen'], operations: [{ id: 'op', kind: 'replace-op-cit', before: 'op. cit.', after: 'Horvat, Pravo.', replacementText: 'Horvat, Pravo.', reason: 'jasniji kratki navod', confidence: 'medium', selected: false }] }],
      markers: [{ id: 'm', paragraphIndex: 3, footnoteId: 2, rawText: '2', confidence: 'high', selected: true }],
      links: [], warnings: [], summary: '1 fusnota', buildParams: (current) => ({ selected: current.candidates.flatMap((candidate) => candidate.operations.filter((operation) => operation.selected).map((operation) => operation.id)) }),
    };
    const legalItem = item({ fixerId: 'legal-footnote-repair-fixer', legalFootnoteRepairForm: form });
    renderRepairPanel({ ...ctxBase, mountEl, items: [legalItem] });
    const ledger = openLedger(mountEl);
    const itemModal = openTierAItem(ledger, 'Fusnote');
    expect(itemModal.textContent).toContain('Prije:');
    expect(itemModal.textContent).toContain('op. cit.');
    expect(itemModal.querySelectorAll('.lekta-repair-panel__legal-footnote input[type="checkbox"]')).toHaveLength(2);
    const boxes = itemModal.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__legal-footnote input[type="checkbox"]');
    expect(boxes[0].checked).toBe(true);
    boxes[1].click();
    expect(form.candidates[0].operations[0].selected).toBe(true);
  });

  it('finalni inspektor odvaja prihvat i odbacivanje revizija', () => {
    const mountEl = mount();
    const form: FinalDocumentInspectorFormDefinition = {
      summary: '1 revizija i 1 metapodatak',
      findings: [{
        id: 'revisions', category: 'revisions', summary: 'Neprihvaćene izmjene', count: 1, severity: 'warning',
        supported: true, destructive: true, selected: false, action: 'review-revisions',
        evidence: [{ part: 'word/document.xml', location: 'ins:1', fingerprint: 'fp', revisionId: '4', selected: true }],
      }, {
        id: 'diagnostic', category: 'watermark', summary: 'Vodeni žig', count: 1, severity: 'warning',
        supported: false, destructive: true, selected: false, action: 'review-only', evidence: [],
      }],
      buildParams: () => ({}),
    };
    const inspectorItem = item({ fixerId: 'final-document-inspector-fixer', finalDocumentInspectorForm: form });
    renderRepairPanel({ ...ctxBase, mountEl, items: [inspectorItem] });
    const ledger = openLedger(mountEl);
    const details = openTierBDetails(ledger);
    expect(details.querySelector('.lekta-repair-panel__final-inspector')).not.toBeNull();
    expect(details.textContent).toContain('nova čista kopija');
    const select = details.querySelector<HTMLSelectElement>('.lekta-repair-panel__final-inspector select')!;
    expect(select.value).toBe('accept');
    select.value = 'reject';
    select.dispatchEvent(new Event('change'));
    expect(form.findings[0].evidence[0].revisionAction).toBe('reject');
    const disabled = details.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__final-inspector input[disabled]');
    expect(disabled).toHaveLength(1);
  });

  it('prekrsene su predodabrane, neprekrsene odznacene i iza podnaslova', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [
        item({ ruleId: 'v', label: 'Prekrseno', violated: true }),
        item({ ruleId: 'n', label: 'Uredno', violated: false, fixerId: 'font-fixer' }),
      ],
    });
    const boxes = mountEl.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__list input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    // data-idx mapira na ORIGINALNI ctx.items indeks (ne poredak u prikazu).
    const byLabel = (t: string) =>
      Array.from(mountEl.querySelectorAll('.lekta-repair-panel__item')).find((li) => li.textContent?.includes(t))!;
    expect(byLabel('Prekrseno').querySelector('input')!.checked).toBe(true);
    expect(byLabel('Uredno').querySelector('input')!.checked).toBe(false);
    expect(mountEl.querySelector('.lekta-repair-panel__subtitle')?.textContent).toContain('Uskladi i ostalo');
  });

  it('assisted plan prikazuje mapiranje razine, broj i uklanjanje ručnog prefiksa', () => {
    const mountEl = mount();
    const numberingItem = item({
      fixerId: 'heading-style-fixer',
      params: { targets: [{ paragraphIndex: 2, level: 1, numbered: true, removeManualNumbering: true }] },
      headingNumberingPlan: {
        rules: { maxLevel: 3, format: 'decimal', trailingDot: true },
        mappings: [{
          paragraphIndex: 2,
          text: '1. Uvod',
          level: 1,
          numbered: true,
          removeManualNumbering: true,
          manualPrefix: '1.',
          confidence: 'high',
          existingHeading: false,
          selectedByDefault: true,
          evidence: ['numerirani prefiks'],
        }],
        warnings: [],
        summary: { total: 1, numbered: 1, unnumbered: 0, removeManualPrefixes: 1, needsConfirmation: 1 },
        tocComparison: { hasTocField: false, tocEntryCount: 0, expectedHeadingCount: 1, status: 'not-present' },
      },
    });
    renderRepairPanel({ ...ctxBase, mountEl, items: [numberingItem] });
    const ledger = openLedger(mountEl);
    const itemModal = openTierAItem(ledger, 'Naslovi');
    const row = itemModal.querySelector('.lekta-repair-panel__heading-numbering-node')!;
    expect(row.querySelector('select')?.querySelectorAll('option')).toHaveLength(3);
    expect(row.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(itemModal.textContent).toContain('1 ručnih prefiksa');
    const autoNumber = row.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];
    autoNumber.click();
    expect((numberingItem.params.targets as Array<Record<string, unknown>>)[0].numbered).toBe(false);
  });

  it('kad NISTA nije prekrseno, podnaslov je pozitivan (ne "i ostalo")', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [item({ ruleId: 'n', label: 'Uredno', violated: false })],
    });
    const sub = mountEl.querySelector('.lekta-repair-panel__subtitle');
    expect(sub?.textContent).toContain('Sve prepoznato je usklađeno');
    expect(sub?.textContent).not.toContain('i ostalo');
  });

  it('data-idx pokazuje na tocan ctx.items element nakon sortiranja', () => {
    const mountEl = mount();
    const items = [
      item({ ruleId: 'n', label: 'Uredno', violated: false, fixerId: 'font-fixer' }), // ide DOLJE
      item({ ruleId: 'v', label: 'Prekrseno', violated: true }), // ide GORE
    ];
    renderRepairPanel({ ...ctxBase, mountEl, items });
    const first = mountEl.querySelector<HTMLInputElement>('.lekta-repair-panel__item input')!;
    // Prvi prikazani je "Prekrseno" (originalni indeks 1).
    expect(Number(first.dataset.idx)).toBe(1);
    expect(items[Number(first.dataset.idx)].ruleId).toBe('v');
  });

  it('deep preklopnik postoji samo kad ima DEEP_CAPABLE stavki', () => {
    const withFont = mount();
    renderRepairPanel({ ...ctxBase, mountEl: withFont, items: [item({ fixerId: 'font-fixer' })] });
    expect(withFont.querySelector('.lekta-repair-panel__deep')).not.toBeNull();

    const marginsOnly = mount();
    renderRepairPanel({ ...ctxBase, mountEl: marginsOnly, items: [item({ fixerId: 'margins-fixer' })] });
    expect(marginsOnly.querySelector('.lekta-repair-panel__deep')).toBeNull();
  });
});

describe('renderRepairPanel: preporucene (advisory) stavke', () => {
  it('preporucena stavka je odznacena, ima "Preporučeno" oznaku i vlastiti podnaslov', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [
        item({ ruleId: 'v', label: 'Prekrseno', violated: true }),
        item({ ruleId: 'r', label: 'Institucijska preporuka', violated: false, recommended: true, fixerId: 'font-fixer' }),
      ],
    });
    const byLabel = (t: string) =>
      Array.from(mountEl.querySelectorAll('.lekta-repair-panel__item')).find((li) => li.textContent?.includes(t))!;
    const recLi = byLabel('Institucijska preporuka');
    expect(recLi.querySelector('input')!.checked).toBe(false);
    expect(recLi.querySelector('.lekta-repair-panel__badge')?.textContent).toBe('Preporučeno');
    const subtitles = Array.from(mountEl.querySelectorAll('.lekta-repair-panel__subtitle')).map((s) => s.textContent);
    expect(subtitles.some((t) => t?.includes('Preporučeno, nije obavezno'))).toBe(true);
  });

  it('preporucena stavka ide IZA neprekrsene-ali-bodovane skupine (Feature B)', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [
        item({ ruleId: 'n', label: 'Uredno bodovano', violated: false, fixerId: 'font-fixer' }),
        item({ ruleId: 'r', label: 'Preporuka', violated: false, recommended: true, fixerId: 'margins-fixer' }),
      ],
    });
    const labels = Array.from(mountEl.querySelectorAll('.lekta-repair-panel__item span')).map((s) => s.textContent);
    expect(labels.indexOf('Uredno bodovano')).toBeLessThan(labels.indexOf('Preporuka'));
  });

  it('samo preporucene stavke (institucija bez ijednog bodovanog pravila): jedna skupina, sve odznacene', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [item({ ruleId: 'r', label: 'Preporuka', violated: false, recommended: true, fixerId: 'font-fixer' })],
    });
    const boxes = mountEl.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__list input[type="checkbox"]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].checked).toBe(false);
  });
});

describe('renderRepairPanel: klik s 0 odabranih', () => {
  it('prazan odabir daje poruku umjesto tihog no-opa', () => {
    const mountEl = mount();
    renderRepairPanel({
      ...ctxBase,
      mountEl,
      items: [item({ violated: false })], // odznaceno po defaultu
    });
    const btn = mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!;
    btn.click();
    const summary = mountEl.querySelector<HTMLElement>('.lekta-repair-panel__summary')!;
    expect(summary.hidden).toBe(false);
    expect(summary.textContent).toContain('Odaberi barem jednu stavku');
  });
});

describe('renderRepairPanel: re-check spremnosti (K3)', () => {
  // Realan popravak nad sintetickim .docx (margine 2,5 -> 3,0 cm) pa reanalyze prikaze
  // "prije -> poslije". Stub reanalyze vraca fiksni score (ne pokrecemo pravu analizu).
  const marginItem = () =>
    item({ ruleId: 'm', fixerId: 'margins-fixer', params: { top: 3, right: 3, bottom: 3, left: 3 }, violated: true });

  it('nakon popravka poziva reanalyze s popravljenim bajtovima i prikaze prije -> poslije', async () => {
    const mountEl = mount();
    let seen: Uint8Array | null = null;
    renderRepairPanel({
      items: [marginItem()],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      beforeScore: { score: 68, categories: { formatting: { earned: 14, max: 20 } } },
      reanalyze: async (bytes) => {
        seen = bytes;
        return { score: 84, categories: { formatting: { earned: 18, max: 20 } } };
      },
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    await waitFor(() => !!mountEl.querySelector('.lekta-repair-panel__recheck'));

    expect(seen).toBeInstanceOf(Uint8Array);
    expect((seen as unknown as Uint8Array).length).toBeGreaterThan(0);
    const recheck = mountEl.querySelector('.lekta-repair-panel__recheck')!;
    expect(recheck.textContent).toContain('68');
    expect(recheck.textContent).toContain('84');
    expect(recheck.textContent).toContain('+16'); // delta
    expect(recheck.textContent).toContain('Oblikovanje'); // kategorijska delta
  });

  it('pad reanalyze ne rusi panel; preuzimanje se svejedno dogodilo', async () => {
    const mountEl = mount();
    let downloaded = false;
    (globalThis.URL as any).createObjectURL = () => {
      downloaded = true;
      return 'blob:x';
    };
    renderRepairPanel({
      items: [marginItem()],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      beforeScore: { score: 68, categories: {} },
      reanalyze: async () => {
        throw new Error('reanalyze pukla');
      },
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    await waitFor(() =>
      (mountEl.querySelector('.lekta-repair-panel__summary')?.textContent || '').includes('nije bilo moguće izračunati'),
    );
    expect(downloaded).toBe(true); // preuzimanje se dogodilo prije re-checka
  });

  it('bez reanalyze (stari pozivatelj) nema re-check bloka', async () => {
    const mountEl = mount();
    renderRepairPanel({
      items: [marginItem()],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    await waitFor(() =>
      (mountEl.querySelector('.lekta-repair-panel__summary')?.textContent || '').includes('Primijenjeno'),
    );
    expect(mountEl.querySelector('.lekta-repair-panel__recheck')).toBeNull();
    expect(mountEl.querySelector('.lekta-repair-panel__recheck-pending')).toBeNull();
  });

  it('kad popravljeni dokument dosegne strop (samo manualne stavke ostale), jasno kaze da je to maksimum', async () => {
    const mountEl = mount();
    renderRepairPanel({
      items: [marginItem()],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      beforeScore: { score: 68, categories: {} },
      reanalyze: async () => ({
        score: 98,
        categories: { citations: { earned: 8, max: 10 }, formatting: { earned: 90, max: 90 } },
        // "Citirano -> literatura" vise NIJE dobar manual primjer (5961bdd: zivi citation-bibliography-
        // sync-fixer), pa strop test koristi "Potpunost bibliografskih zapisa" (ostaje namjerno manual).
        checks: [chk('Potpunost bibliografskih zapisa', 'fail', 8, 10), chk('Dominantni font', 'pass', 90, 90)],
      }),
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    await waitFor(() => !!mountEl.querySelector('.lekta-repair-panel__recheck'));

    const recheck = mountEl.querySelector('.lekta-repair-panel__recheck')!;
    expect(recheck.textContent).toContain('98/100 je maksimalna ocjena');
    expect(recheck.textContent).toContain('Potpunost bibliografskih zapisa');
    expect(mountEl.querySelector('.lekta-repair-panel__ceiling')).not.toBeNull();
  });

  it('kad jos ima auto-popravljivog jaza (score ispod stropa), NE tvrdi da je doseg maksimum', async () => {
    const mountEl = mount();
    renderRepairPanel({
      items: [marginItem()],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      beforeScore: { score: 40, categories: {} },
      reanalyze: async () => ({
        score: 80,
        categories: {},
        // Dominantni font i dalje pada (max=20), a ima zivi auto-fixer -> NIJE manualni jaz.
        checks: [chk('Dominantni font', 'fail', 0, 20), chk('Margine dokumenta', 'pass', 80, 80)],
      }),
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    await waitFor(() => !!mountEl.querySelector('.lekta-repair-panel__recheck'));

    expect(mountEl.querySelector('.lekta-repair-panel__ceiling')).toBeNull();
  });

  it('kad je popravak stigao do 100/100, nema poruke o stropu', async () => {
    const mountEl = mount();
    renderRepairPanel({
      items: [marginItem()],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      beforeScore: { score: 68, categories: {} },
      reanalyze: async () => ({
        score: 100,
        categories: {},
        checks: [chk('Dominantni font', 'pass', 20, 20)],
      }),
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    await waitFor(() => !!mountEl.querySelector('.lekta-repair-panel__recheck'));

    expect(mountEl.querySelector('.lekta-repair-panel__ceiling')).toBeNull();
  });
});

describe('renderRepairPanel: potvrda lokacije (K6 umetanje sekcije)', () => {
  const confirmItem = () =>
    item({
      ruleId: 'sec',
      fixerId: 'section-insert-fixer',
      params: { target: { introParagraphIndex: 2, align: 'center' } },
      violated: true,
      requiresConfirmation: true,
      confirmationText: 'Umetnut ćemo prijelom sekcije prije Uvoda.',
    });

  const ctx = (mountEl: HTMLElement) => ({
    items: [confirmItem()],
    getDocxBytes: async () => singleSectionDocx(),
    originalFileName: 'rad.docx',
    mountEl,
  });

  it('prvi klik prikaze potvrdni korak i NE popravlja odmah', async () => {
    const mountEl = mount();
    renderRepairPanel(ctx(mountEl));
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();

    const box = mountEl.querySelector<HTMLElement>('.lekta-repair-panel__confirm-box')!;
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain('prijelom sekcije prije Uvoda');
    expect(mountEl.querySelector('.lekta-repair-panel__confirm')).not.toBeNull();
    // Popravak NIJE pokrenut (nema dinamickog importa/applyFixers): summary bez "Primijenjeno".
    await new Promise((r) => setTimeout(r, 30));
    expect(mountEl.querySelector('.lekta-repair-panel__summary')?.textContent || '').not.toContain('Primijenjeno');
  });

  it('potvrda ("Potvrdi i popravi") pokrece popravak i zatvori okvir', async () => {
    const mountEl = mount();
    renderRepairPanel(ctx(mountEl));
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__confirm')!.click();

    await waitFor(() =>
      (mountEl.querySelector('.lekta-repair-panel__summary')?.textContent || '').includes('Primijenjeno'),
    );
    expect(mountEl.querySelector<HTMLElement>('.lekta-repair-panel__confirm-box')!.hidden).toBe(true);
  });

  it('"Odustani" zatvori potvrdu bez popravka', async () => {
    const mountEl = mount();
    renderRepairPanel(ctx(mountEl));
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__cancel')!.click();

    expect(mountEl.querySelector<HTMLElement>('.lekta-repair-panel__confirm-box')!.hidden).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(mountEl.querySelector('.lekta-repair-panel__summary')?.textContent || '').not.toContain('Primijenjeno');
  });

  it('stavka bez potvrde popravlja odmah (nema potvrdnog koraka)', async () => {
    const mountEl = mount();
    renderRepairPanel({
      items: [item({ ruleId: 'm', fixerId: 'margins-fixer', params: { top: 3, right: 3, bottom: 3, left: 3 }, violated: true })],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-panel__download')!.click();
    await waitFor(() =>
      (mountEl.querySelector('.lekta-repair-panel__summary')?.textContent || '').includes('Primijenjeno'),
    );
    expect(mountEl.querySelector<HTMLElement>('.lekta-repair-panel__confirm-box')!.hidden).toBe(true);
  });
});

// "Koliko platis, toliko popravaka" (2026-08-01) + redizajn "Uredi.../<details>" (2026-08-03):
// ledger+modal je SADA UVIJEK jedini vidljivi prikaz, bez obzira na mix stavki. Stavke s
// naprednom formom dobivaju "Uredi... ->" (Tier A: zaseban modal) ili inline <details>
// (Tier B) na svom retku umjesto da cijeli panel padne natrag na dugu, neogranicenu listu.
describe('renderRepairPanel: ledger+modal (uvijek, bez obzira na mix stavki)', () => {
  it('sve stavke jednostavne: prikazuje kompaktan trigger, stara lista je skrivena', () => {
    const mountEl = mount();
    renderRepairPanel({
      items: [
        item({ ruleId: 'font', fixerId: 'font-fixer', label: 'Font', violated: true }),
        item({ ruleId: 'margins', fixerId: 'margins-fixer', label: 'Margine', violated: true }),
        item({ ruleId: 'spacing', fixerId: 'line-spacing-fixer', label: 'Prored', violated: false }),
      ],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      ceilingPriceEur: 9.99,
    });
    expect(mountEl.querySelector('.lekta-repair-trigger')).toBeTruthy();
    expect(mountEl.querySelector<HTMLElement>('.lekta-repair-panel__list')!.hidden).toBe(true);
    expect(mountEl.querySelector('.lekta-repair-trigger__price')?.textContent).toMatch(/€/);
  });

  it('stavka s naprednom formom (Tier B): ledger i dalje kompaktan, forma je inline <details> na retku', () => {
    const mountEl = mount();
    const finalForm: FinalDocumentInspectorFormDefinition = {
      findings: [],
      summary: 'sazetak',
      buildParams: () => ({}),
    };
    renderRepairPanel({
      items: [
        item({ ruleId: 'font', fixerId: 'font-fixer', label: 'Font', violated: true }),
        item({ ruleId: 'inspect', fixerId: 'final-document-inspector-fixer', label: 'Inspekcija', violated: true, finalDocumentInspectorForm: finalForm }),
      ],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      ceilingPriceEur: 9.99,
    });
    expect(mountEl.querySelector('.lekta-repair-trigger')).toBeTruthy();
    expect(mountEl.querySelector<HTMLElement>('.lekta-repair-panel__list')!.hidden).toBe(true);
    const ledger = openLedger(mountEl);
    const rows = ledger.querySelectorAll('.lekta-repair-ledger-list > li');
    expect(rows).toHaveLength(2);
    const details = ledger.querySelector<HTMLDetailsElement>('details.lekta-repair-panel__more')!;
    expect(details.querySelector('summary')?.textContent).toBe('Metapodaci i tragovi izrade (0)');
    // Font (obicna stavka) nema ni Tier A gumb ni Tier B <details> na svom retku.
    expect(ledger.querySelectorAll('.lekta-repair-ledger-row-edit')).toHaveLength(0);
    expect(ledger.querySelectorAll('details.lekta-repair-panel__more')).toHaveLength(1);
  });

  it('stavka s naprednom formom (Tier A): ledger nudi "Uredi..." gumb koji otvara zaseban modal', () => {
    const mountEl = mount();
    const bibForm = {
      entries: [
        { id: 'e1', rawText: 'Novak, I. (2022). Naslov.', confidence: 'high' as const, selected: true, evidence: [] },
        { id: 'e2', rawText: 'Horvat, M. (2021). Drugi naslov.', confidence: 'high' as const, selected: true, evidence: [] },
      ],
      summary: '2 zapisa',
      buildParams: () => ({}),
    };
    renderRepairPanel({
      items: [
        item({ ruleId: 'font', fixerId: 'font-fixer', label: 'Font', violated: true }),
        item({ ruleId: 'bib', fixerId: 'bibliography-repair-fixer', label: 'Literatura', violated: true, bibliographyForm: bibForm }),
      ],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      ceilingPriceEur: 9.99,
    });
    const ledger = openLedger(mountEl);
    const itemModal = openTierAItem(ledger, 'Literatura');
    expect(itemModal.querySelectorAll('.lekta-repair-panel__bibliography-row')).toHaveLength(2);
    // Ledger je zatvoren (zamijeni, ne slazi se), samo JEDAN otvoreni modal-backdrop odjednom.
    expect(document.querySelectorAll('.modal-backdrop:not(.hidden)')).toHaveLength(1);
    // "Natrag" vraca na ledger i uklanja item-modal.
    itemModal.querySelector<HTMLButtonElement>('.lekta-repair-ledger-back')!.click();
    expect(document.body.contains(itemModal)).toBe(false);
    expect(ledger.classList.contains('hidden')).toBe(false);
  });

  it('klik na "Prilagodi popravke" otvara modal s redom po stavci, redoslijed po tezini', () => {
    const mountEl = mount();
    renderRepairPanel({
      items: [
        item({ ruleId: 'spacing', fixerId: 'line-spacing-fixer', label: 'Prored', violated: true }),
        item({ ruleId: 'section', fixerId: 'section-insert-fixer', label: 'Prijelom sekcije', violated: true }),
        item({ ruleId: 'font', fixerId: 'font-fixer', label: 'Font', violated: false }),
      ],
      getDocxBytes: async () => singleSectionDocx(),
      originalFileName: 'rad.docx',
      mountEl,
      ceilingPriceEur: 9.99,
    });
    mountEl.querySelector<HTMLButtonElement>('.lekta-repair-trigger__btn')!.click();
    const backdrop = document.querySelector<HTMLElement>('.modal-backdrop[data-lekta-repair-ledger-modal]')!;
    expect(backdrop.classList.contains('hidden')).toBe(false);
    const rows = Array.from(backdrop.querySelectorAll<HTMLButtonElement>('.lekta-repair-ledger-row'));
    // Poredano po tezini (repair-pricing.ts): section-insert-fixer=8, font-fixer=5, line-spacing-fixer=4.
    expect(rows.map((r) => r.querySelector('.lekta-repair-ledger-fill-label')?.textContent)).toEqual([
      'Prijelom sekcije',
      'Font',
      'Prored',
    ]);
    // Pocetno stanje odrazava opt-out default (prored i prijelom sekcije prekrseni -> "on").
    expect(rows[0].classList.contains('on')).toBe(true); // Prijelom sekcije, violated:true
    expect(rows[1].classList.contains('on')).toBe(false); // Font, violated:false
    expect(rows[2].classList.contains('on')).toBe(true); // Prored, violated:true

    // Klik na "Font" red ga ukljuci i azurira checkbox u (skrivenoj) originalnoj listi.
    rows[1].click();
    expect(rows[1].classList.contains('on')).toBe(true);
    const checkedCount = mountEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-idx]:checked').length;
    expect(checkedCount).toBe(3);

    // "Gotovo" zatvara modal.
    backdrop.querySelector<HTMLButtonElement>('.lekta-repair-ledger-done')!.click();
    expect(backdrop.classList.contains('hidden')).toBe(true);
  });
});
