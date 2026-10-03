/**
 * ANALIZA UZIVO (ALIGNMENT Z33): model, prikaz pod prigusenim pokretom i gardovi.
 *
 * Ono sto se ovdje dokazuje je ISTINITOST, ne izgled: sve sto ekran pokaze dolazi iz rezultata
 * analize (ili iz praga faze dok rezultata nema), ocjena zavrsava tocno na `result.score`, a pod
 * `prefers-reduced-motion` je sve odmah u zavrsnom stanju. Izgled i tok u pregledniku mjeri
 * `tests/ux/analysis-live.spec.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLivePlan, readingFrame, revealFrame, revealDuration } from '../src/ui/analysis-live/analysis-live-model';
import { mountAnalysisLive } from '../src/ui/analysis-live/analysis-live';
import { SCAN_PHASES } from '../src/ui/progress-scan';
import { liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r/g, '');

const ROW_ORDER = ['font', 'margine', 'prored', 'uvlaka', 'brojevi', 'naslovi', 'citati', 'opseg'];

function check(category: string, title: string, status: string, earned: number, max: number, detail: string, issue: unknown = null) {
  return { category, title, status, earned, max, detail, issue, scored: max > 0 };
}
function issue(severity: string, category: string, title: string, where = 'Dokument') {
  return { severity, category, title, detail: 'Opis.', where };
}

/** Generator: rezultat sa SEDAM otvorenih nalaza u sest redaka (vise od sest mjesta) i jednim ogranicenjem. */
function sampleResult() {
  const iFont = issue('warning', 'formatting', 'Font nije po pravilniku');
  const iMarg = issue('warning', 'formatting', 'Lijeva margina je preuska');
  const iPror = issue('warning', 'formatting', 'Prored je jednostruk');
  const iBroj = issue('error', 'structure', 'Stranice nisu numerirane');
  const iNasl = issue('warning', 'structure', 'Naslov 2.3 nije u sadržaju');
  const iCit = issue('error', 'citations', '(Novak, 2022) nema zapis u literaturi');
  const iDat = issue('warning', 'citations', 'Tri mrežna izvora nemaju datum pristupa');
  const checks = [
    check('formatting', 'Dominantni font', 'warn', 4, 8, 'Calibri 11 pt', iFont),
    check('formatting', 'Margine dokumenta', 'warn', 4, 6, 'Lijeva margina: 2,0 cm', iMarg),
    check('formatting', 'Prored osnovnog teksta', 'warn', 3, 6, '1,0', iPror),
    check('formatting', 'Poravnanje osnovnog teksta', 'pass', 4, 4, 'Obostrano'),
    check('structure', 'Brojevi stranica', 'fail', 0, 4, 'PAGE polje nije pronađeno', iBroj),
    check('structure', 'Naslovi dokumenta ↔ sadržaj', 'warn', 2, 4, '1 naslov izvan sadržaja', iNasl),
    check('citations', 'Citirano → literatura', 'fail', 3, 10, '1 citatnica bez podudaranja', iCit),
    check('citations', 'Datumi pristupa mrežnim izvorima', 'warn', 3, 5, '3 izvora bez datuma', iDat),
    check('structure', 'Profilni opseg riječi', 'pass', 5, 5, '11.240 riječi'),
  ];
  const earned = checks.reduce((s, c) => s + c.earned, 0);
  const max = checks.reduce((s, c) => s + c.max, 0);
  return {
    file: { name: 'rad.docx', size: 1 },
    profile: 'FPZG · Politologija · Diplomski',
    profileStatus: 'verified',
    score: Math.round((earned / max) * 100),
    checks,
    issues: [iFont, iMarg, iPror, iBroj, iNasl, iCit, iDat, issue('info', 'structure', 'Profil nije potpun', 'Odabrani profil')],
    stats: { words: 11240, storedPages: 41, references: 38 },
    preview: { paragraphs: [{ index: 0, text: '2. Teorijski okvir', headingLevel: 1 }, { index: 1, text: 'Prvi odlomak rada.' }] },
    details: { ruleAuthority: 'official-source', sources: [{ title: 'Pravilnik o diplomskom radu', url: 'https://example.org' }], triage: { counts: { auto: 3 } } },
  };
}

const REAL_TITLES = sampleResult().issues.map((i) => i.title);

describe('Z33 model: generator proizvodi ciljanu klasu ulaza', () => {
  it('sedam otvorenih nalaza dokumenta u sest redaka, vise nego mjesta, i jedno ogranicenje', () => {
    const plan = buildLivePlan(sampleResult());
    expect(plan.total).toBe(7);
    expect(new Set(plan.rows.filter((r) => r.count > 0).map((r) => r.id)).size).toBe(6);
    expect(plan.findings.length).toBe(6);
    expect(plan.findings.map((f) => f.title)).not.toContain('Profil nije potpun');
  });
});

describe('Z33 model: stvarni nalazi u redoslijed animacije', () => {
  it('nalazi idu redoslijedom redaka provjere, a izbor mjesta je po prioritetu', () => {
    const plan = buildLivePlan(sampleResult());
    const idx = plan.findings.map((f) => ROW_ORDER.indexOf(f.row));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(plan.findings.map((f) => f.title)).toEqual([
      'Font nije po pravilniku', 'Lijeva margina je preuska', 'Prored je jednostruk',
      'Stranice nisu numerirane', 'Naslov 2.3 nije u sadržaju', '(Novak, 2022) nema zapis u literaturi',
    ]);
  });

  it('retci: nalaz je ✗ s brojem, prolaz je ✓, a zavrsna ocjena je tocno result.score', () => {
    const result = sampleResult();
    const plan = buildLivePlan(result);
    const kraj = revealFrame(plan, Infinity, true);
    const red = (label: string) => kraj.rows.find((r) => r.label === label)!;
    expect(red('Font i veličina')).toMatchObject({ icon: '✗', count: '1 nalaz' });
    expect(red('Citati i literatura')).toMatchObject({ icon: '✗', count: '2 nalaza' });
    expect(red('Uvlaka i poravnanje')).toMatchObject({ icon: '✓', count: '' });
    expect(red('Opseg')).toMatchObject({ icon: '✓' });
    expect(kraj.score).toBe(String(result.score));
    expect(kraj.stamp).toBe(`7 nalaza · ${result.score}`);
    expect(kraj.foundLine).toBe('7 od 7 pronađeno');
    expect(kraj.verdict.text).toBe('Nije spremno za predaju');
    expect(kraj.stats).toEqual({ pages: '41', words: (11240).toLocaleString('hr-HR'), sources: '38' });
    expect(plan.summary).toBe('7 stvari traži tvoju pažnju. Od toga 3 mogu popraviti automatski.');
  });

  it('ocjena pada od 100 kroz stvarne gubitke i ne ide ispod rezultata', () => {
    const result = sampleResult();
    const plan = buildLivePlan(result);
    const kraj = revealDuration(plan, true);
    let prije = 100;
    const vidjene = new Set<number>();
    for (let t = 0; t <= kraj; t += 25) {
      const s = Number(revealFrame(plan, t, true).score);
      expect(s).toBeLessThanOrEqual(prije);
      expect(s).toBeGreaterThanOrEqual(result.score);
      vidjene.add(s);
      prije = s;
    }
    expect(prije).toBe(result.score);
    expect(vidjene.size, 'ocjena mora padati postupno, ne skociti').toBeGreaterThan(5);
  });
});

describe('Z33 model: ne izmislja podatke', () => {
  it('svaki ispisan naslov je (pocetak) stvarnog naslova nalaza, u svakom trenutku', () => {
    const plan = buildLivePlan(sampleResult());
    for (let t = 0; t <= revealDuration(plan, true) + 100; t += 40) {
      const f = revealFrame(plan, t, true);
      for (const s of f.slots.filter((x) => x.state === 'filled')) {
        expect(REAL_TITLES.some((title) => title.startsWith(s.title))).toBe(true);
      }
      for (const n of f.notes) expect(REAL_TITLES).toContain(n.title);
    }
  });

  it('dok analiza traje nema nalaza, brojki ni presude; ✓ i ✗ cekaju rezultat', () => {
    for (const pct of [0, 8, 35, 52, 68, 96, 100]) {
      const f = readingFrame(pct);
      expect(f.stats).toBeNull();
      expect(f.notes).toEqual([]);
      expect(f.slots.every((s) => s.state === 'placeholder')).toBe(true);
      expect(f.verdict.shown).toBe(false);
      expect(f.rows.some((r) => r.icon === '✓' || r.icon === '✗')).toBe(false);
      expect(f.statusLine).toBe('PROVJERA 0 / 8');
    }
    expect(readingFrame(0).rows.every((r) => r.icon === '○')).toBe(true);
    expect(readingFrame(35).rows.map((r) => r.icon)).toEqual(['●', '●', '●', '●', '○', '○', '○', '○']);
    expect(readingFrame(52).rows.map((r) => r.icon)).toEqual(['●', '●', '●', '●', '●', '●', '○', '●']);
  });

  it('pragovi redaka su stvarni pragovi faza motora', () => {
    const pragovi = SCAN_PHASES.map((p) => p.pct);
    for (const pct of [35, 52, 68]) expect(pragovi).toContain(pct);
  });

  it('bez nalaza, ocjene i statistike ekran kaze to, a ne izmislja', () => {
    const plan = buildLivePlan({ file: { name: 'x.docx' }, checks: [], issues: [] });
    const kraj = revealFrame(plan, Infinity, true);
    expect(plan.findings).toEqual([]);
    expect(kraj.slots).toEqual([]);
    expect(kraj.foundLine).toBe('Nema otvorenih nalaza');
    expect(kraj.score).toBe('Nije bodovano');
    expect(kraj.stats).toEqual({ pages: '', words: '', sources: '' });
    expect(kraj.rows.every((r) => r.icon === '○' && r.state === 'unchecked')).toBe(true);
    expect(plan.summary).toBe('Nema otvorenih nalaza.');
  });
});

describe('Z33 model: uzak ekran i prigusen pokret', () => {
  it('< 980 px: nema cedulja ni leta, nalaz se ispisuje izravno na mjestu', () => {
    const plan = buildLivePlan(sampleResult());
    for (let t = 0; t <= revealDuration(plan, false); t += 50) {
      const f = revealFrame(plan, t, false);
      expect(f.notes).toEqual([]);
      expect(f.flying).toEqual([]);
    }
    expect(revealDuration(plan, false)).toBeLessThanOrEqual(revealDuration(plan, true));
    const css = read('src/ui/analysis-live/analysis-live.css');
    const uski = css.slice(css.indexOf('@media (max-width: 979.98px)'));
    expect(uski.slice(0, uski.indexOf('}\n}'))).toMatch(/\.z33-notes\s*\{\s*display:\s*none/);
  });

  it('zavrsno stanje (reduced-motion) je potpuno: svi nalazi, presuda, pecat', () => {
    const plan = buildLivePlan(sampleResult());
    const f = revealFrame(plan, Infinity, true);
    expect(f.phase).toBe('final');
    expect(f.done).toBe(true);
    expect(f.slots.map((s) => s.title)).toEqual(plan.findings.map((x) => x.title));
    expect(f.slots.every((s) => s.metaVisible)).toBe(true);
    expect(f.verdict).toEqual({ shown: true, text: plan.verdict, caret: false, metaVisible: true });
    expect(f.flying).toEqual([]);
  });

  it('otkrivanje traje ograniceno (rezultat kasni najvise toliko)', () => {
    const plan = buildLivePlan(sampleResult());
    expect(revealDuration(plan, true)).toBeLessThanOrEqual(9000);
  });
});

describe('Z33 prikaz', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.dataset.motion;
    vi.unstubAllGlobals();
  });

  function view(): HTMLElement {
    document.body.innerHTML = '<div id="progressView" role="status" aria-live="polite"><p class="pv-file">rad.docx</p><h3>Provjeravam rad</h3><p class="sr-only" id="progressMessage">Gotovo</p><p class="pv-local">x</p></div>';
    return document.getElementById('progressView')!;
  }

  it('pod prigusenim pokretom rezultat ne ceka: odmah zavrsno stanje', async () => {
    document.documentElement.dataset.motion = 'reduce';
    const v = view();
    const h = mountAnalysisLive(v);
    h.start({ name: 'FPZG · Politologija · Diplomski', sources: [{ title: 'Pravilnik' }] });
    expect(v.querySelector('.z33')?.getAttribute('data-phase')).toBe('reading');
    const t0 = Date.now();
    await h.reveal(sampleResult());
    expect(Date.now() - t0).toBeLessThan(500);
    const root = v.querySelector('.z33')!;
    expect(root.getAttribute('data-phase')).toBe('final');
    const naslovi = [...root.querySelectorAll('.z33-slot-title')].map((n) => n.textContent);
    expect(naslovi).toEqual(buildLivePlan(sampleResult()).findings.map((f) => f.title));
    expect(root.querySelector('[data-z33="verdicttext"]')?.textContent).toBe('Nije spremno za predaju');
    expect(v.getAttribute('aria-live')).toBe('off');
    expect(v.querySelector('#progressMessage')?.getAttribute('aria-live')).toBe('polite');
  });

  it('Notification: dopustenje se trazi tek na klik', async () => {
    const request = vi.fn(async () => 'granted' as NotificationPermission);
    class FakeNotification { static permission: NotificationPermission = 'default'; static requestPermission = request; }
    vi.stubGlobal('Notification', FakeNotification);
    const v = view();
    mountAnalysisLive(v).start(null);
    const btn = v.querySelector<HTMLButtonElement>('[data-z33="notify"]')!;
    expect(btn.hidden).toBe(false);
    expect(request).not.toHaveBeenCalled();
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Javit ću ti kad bude gotovo ✓'));
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('Z33 gardovi (baseline; mutacije u gate-mutations.test.ts)', () => {
  it('CSS Z33 animira samo transform, opacity i clip-path, bez backdrop-filter', () => {
    expect(motionCssProblems(read('src/ui/analysis-live/analysis-live.css'))).toEqual([]);
  });

  it('kod Z33 ulazi samo dinamickim uvozom', () => {
    const izvori = {
      'src/ui/progress-scan.ts': read('src/ui/progress-scan.ts'),
      'src/ui/app.ts': read('src/ui/app.ts'),
      'src/routes/workspace/main.ts': read('src/routes/workspace/main.ts'),
    };
    expect(liveBoundaryProblems(izvori, 'src/ui/progress-scan.ts')).toEqual([]);
  });
});
