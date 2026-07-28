import { describe, it, expect, beforeEach } from 'vitest';
import { renderRepairPanel, type RepairableItem } from './repair-panel';
import { singleSectionDocx } from '../../tests/helpers/synthetic-docx';

/** Cekaj dok uvjet ne postane istinit (async DOM nakon klika: dinamicki import + applyFixers + reanalyze). */
async function waitFor(fn: () => boolean, timeout = 4000): Promise<void> {
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
