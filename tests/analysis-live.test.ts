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
import { copyProblems, liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';

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
    expect(kraj.stats).toEqual({
      pages: { text: '41', title: '' },
      words: { text: (11240).toLocaleString('hr-HR'), title: '' },
      sources: { text: '38', title: '' },
    });
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
      // Brojki nema: svaka celija je "-" uz razlog, nikad prazna oznaka.
      expect(Object.values(f.stats).map((c) => c.text)).toEqual(['-', '-', '-']);
      expect(Object.values(f.stats).every((c) => c.title === 'Broj je poznat kad provjera završi.')).toBe(true);
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
    // Brojac bez broja nikad nije prazna oznaka: "-" uz razlog u `title`.
    expect(kraj.stats).toEqual({
      pages: { text: '-', title: 'Word nije zapisao broj stranica u datoteku.' },
      words: { text: '-', title: 'Broj riječi nije izmjeren.' },
      sources: { text: '-', title: 'Broj izvora nije izmjeren.' },
    });
    expect(kraj.verdict.plan, 'bez automatskog popravka nema gumba plana').toBe(false);
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
    expect(f.verdict).toEqual({ shown: true, text: plan.verdict, caret: false, metaVisible: true, plan: true });
    expect(f.flying).toEqual([]);
  });

  it('otkrivanje traje ograniceno (rezultat kasni najvise toliko)', () => {
    const plan = buildLivePlan(sampleResult());
    expect(revealDuration(plan, true)).toBeLessThanOrEqual(4000);
  });
});

/** Generator NAJGOREG slucaja: sest nalaza u zadnjem retku (cedulje lete zadnje), dugi naslovi. */
function longResult() {
  const r = sampleResult();
  const dugi = (n: number) => `Citat ${n} u poglavlju o metodologiji istrazivanja nema odgovarajuci zapis u popisu literature`;
  const issues = Array.from({ length: 6 }, (_, n) => issue('error', 'citations', dugi(n)));
  return {
    ...r,
    checks: issues.map((i) => check('citations', i.title, 'fail', 0, 5, '1 citatnica bez podudaranja', i)),
    issues,
  };
}

describe('Z33 trajanje (F31 a: najvise oko 4 s)', () => {
  it('generator: sest nalaza u zadnjem citatnom retku, naslovi preko 80 znakova', () => {
    const plan = buildLivePlan(longResult());
    expect(plan.findings).toHaveLength(6);
    expect(plan.findings.every((f) => f.row === 'citati' && f.title.length > 80)).toBe(true);
  });

  it('i najgori slucaj traje najvise 4 s, siroko i usko, a na kraju je sve otipkano', () => {
    for (const result of [sampleResult(), longResult()]) {
      const plan = buildLivePlan(result);
      for (const wide of [true, false]) {
        const d = revealDuration(plan, wide);
        expect(d).toBeLessThanOrEqual(4000);
        const kraj = revealFrame(plan, d, wide);
        expect(kraj.phase).toBe('final');
        expect(kraj.slots.map((s) => s.title)).toEqual(plan.findings.map((f) => f.title));
        expect(kraj.verdict.text).toBe(plan.verdict);
        expect(kraj.flying).toEqual([]);
      }
    }
  });

  it('list presude stoji gotov i miran barem 1,2 s prije kraja, da se gumbi stignu kliknuti', () => {
    for (const result of [sampleResult(), longResult()]) {
      const plan = buildLivePlan(result);
      for (const wide of [true, false]) {
        const f = revealFrame(plan, revealDuration(plan, wide) - 1200, wide);
        expect(f.verdict.metaVisible).toBe(true);
        expect(f.verdict.plan).toBe(true);
        // Skrol do presude je vec bio (na pocetku tipkanja presude), pa se gumb vise ne mice.
        expect(f.scrollToVerdict).toBe(true);
      }
    }
  });
});

describe('Z33 Preskoči, obavijest i plan popravka u modelu', () => {
  it('"Preskoči" postoji samo dok otkrivanje traje', () => {
    const plan = buildLivePlan(sampleResult());
    expect(readingFrame(52).skip).toBe(false);
    expect(revealFrame(plan, 0, true).skip).toBe(true);
    expect(revealFrame(plan, revealDuration(plan, true) - 1, true).skip).toBe(true);
    expect(revealFrame(plan, Infinity, true).skip).toBe(false);
  });

  it('ponuda obavijesti postoji samo dok provjera traje; gotova provjera ne obecaje obavijest', () => {
    expect(readingFrame(0).notify).toBe(true);
    expect(readingFrame(100).notify).toBe(true);
    const plan = buildLivePlan(sampleResult());
    for (const t of [0, 1000, revealDuration(plan, true), Infinity]) expect(revealFrame(plan, t, true).notify).toBe(false);
  });

  it('"Napravi plan popravka" samo kad je popravak dostupan (ne demo, barem jedan automatski)', () => {
    expect(buildLivePlan(sampleResult()).repair).toBe(true);
    expect(revealFrame(buildLivePlan(sampleResult()), Infinity, true).verdict.plan).toBe(true);
    const bez = sampleResult();
    bez.details.triage.counts.auto = 0;
    expect(buildLivePlan(bez).repair).toBe(false);
    expect(revealFrame(buildLivePlan(bez), Infinity, true).verdict.plan).toBe(false);
    expect(buildLivePlan({ ...sampleResult(), demo: true }).repair).toBe(false);
    expect(readingFrame(96).verdict.plan).toBe(false);
  });
});

describe('Z33 brojac stranica bez storedPages', () => {
  it('Word bez zapisanog broja stranica: "-" s razlogom, ostali brojaci stvarni', () => {
    const r = sampleResult();
    const plan = buildLivePlan({ ...r, stats: { words: 11240, references: 38 } });
    const s = revealFrame(plan, Infinity, true).stats;
    expect(s.pages).toEqual({ text: '-', title: 'Word nije zapisao broj stranica u datoteku.' });
    expect(s.words.text).toBe((11240).toLocaleString('hr-HR'));
    expect(s.sources.text).toBe('38');
    for (const t of [0, 500, 2000]) {
      const f = revealFrame(plan, t, true);
      expect(Object.values(f.stats).every((c) => c.text !== '')).toBe(true);
    }
  });
});

/**
 * Generator za POLOZAJ TRAGOVA: 100 izmjerenih odlomaka, naslov u odlomku 10, citat u odlomku 90,
 * brojevi stranica vezani uz fusnotu (zaseban prostor, dakle bez polozaja), ostali bez sidra.
 */
function locatedResult(paragraphs: number | null = 100, novakAt = 90) {
  const r = sampleResult();
  const findings = [
    { category: 'structure', title: 'Naslov 2.3 nije u sadržaju', locations: [{ paragraphIndex: 10, anchorId: 'p10' }] },
    { category: 'citations', title: '(Novak, 2022) nema zapis u literaturi', locations: [{ paragraphIndex: novakAt, anchorId: 'p' + novakAt }] },
    { category: 'structure', title: 'Stranice nisu numerirane', locations: [{ paragraphIndex: 0, footnoteId: 3, anchorId: 'f3' }] },
  ];
  return {
    ...r,
    details: {
      ...r.details,
      triage: { ...r.details.triage, findings },
      ...(paragraphs == null ? {} : { measurements: { counts: { paragraphs } } }),
    },
  };
}

describe('Z33 tragovi i cedulje po stvarnom mjestu nalaza (F31 d)', () => {
  const EVEN = [8, 22.4, 36.8, 51.2, 65.6, 80];
  const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6));

  it('generator: dva nalaza sa sidrom u tijelu, jedan u fusnoti, tri bez sidra', () => {
    const plan = buildLivePlan(locatedResult());
    const at = Object.fromEntries(plan.findings.map((f) => [f.title, f.at]));
    expect(at['Naslov 2.3 nije u sadržaju']).toBeCloseTo(9 / 99, 9);
    expect(at['(Novak, 2022) nema zapis u literaturi']).toBeCloseTo(89 / 99, 9);
    expect(at['Stranice nisu numerirane']).toBeNull();
    expect(plan.findings.filter((f) => f.at == null)).toHaveLength(4);
  });

  it('nalaz sa sidrom stoji proporcionalno mjestu u radu; bez sidra ide na preostala ravnomjerna mjesta', () => {
    const plan = buildLivePlan(locatedResult());
    const top = (t: string) => plan.findings.find((f) => f.title === t)!.top;
    expect(top('Naslov 2.3 nije u sadržaju')).toBeCloseTo(8 + 72 * (9 / 99), 9);
    expect(top('(Novak, 2022) nema zapis u literaturi')).toBeCloseTo(8 + 72 * (89 / 99), 9);
    expect(top('Naslov 2.3 nije u sadržaju')).toBeLessThan(top('(Novak, 2022) nema zapis u literaturi'));
    // Sidro zauzima najblize ravnomjerno mjesto (8 i 65,6); ostali redom dobivaju preostala.
    close(plan.findings.filter((f) => f.at == null).map((f) => f.top), [22.4, 36.8, 51.2, 80]);
    // Polozaj prati sidro: citat pomaknut u odlomak 30 pomice se gore.
    const pomaknut = buildLivePlan(locatedResult(100, 30));
    expect(pomaknut.findings.find((f) => f.title.startsWith('(Novak'))!.top).toBeCloseTo(8 + 72 * (29 / 99), 9);
  });

  it('KONTROLA bez lokacije: isti nalazi bez sidra su ravnomjerno rasporedjeni (kao prije)', () => {
    const plan = buildLivePlan(sampleResult());
    expect(plan.findings.every((f) => f.at == null)).toBe(true);
    close(plan.findings.map((f) => f.top), EVEN);
  });

  it('bez izmjerenog broja odlomaka ili sa sidrom izvan raspona nema izmisljenog polozaja', () => {
    expect(buildLivePlan(locatedResult(null)).findings.every((f) => f.at == null)).toBe(true);
    const izvan = buildLivePlan(locatedResult(100, 150));
    expect(izvan.findings.find((f) => f.title.startsWith('(Novak'))!.at).toBeNull();
  });

  it('cedulje prate tragove, razmaknute najmanje 12 % i unutar lista', () => {
    for (const plan of [buildLivePlan(locatedResult()), buildLivePlan(locatedResult(100, 11)), buildLivePlan(sampleResult())]) {
      const n = plan.findings.map((f) => f.noteTop).sort((a, b) => a - b);
      n.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(8);
        expect(v).toBeLessThanOrEqual(80);
        if (i) expect(v - n[i - 1]).toBeGreaterThanOrEqual(12 - 1e-9);
      });
    }
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

  describe('Preskoči, plan popravka, brojac i obavijest u DOM-u', () => {
    afterEach(() => { vi.useRealTimers(); });

    /** Ekran provjere uz ekran rezultata s kokpitom (presuda i primarni gumb popravka). */
    function viewSRezultatom(): { v: HTMLElement; rv: HTMLElement; primarni: ReturnType<typeof vi.fn> } {
      const v = view();
      const rv = document.createElement('div');
      rv.id = 'resultView';
      rv.innerHTML = '<div id="resultCockpit"><h2 id="cockpitVerdictTitle">Nije spremno za predaju</h2>'
        + '<button type="button" data-cockpit-primary data-cockpit-action="repair-safe">Napravi plan popravka</button></div>';
      document.body.append(rv);
      const primarni = vi.fn();
      rv.querySelector('[data-cockpit-primary]')!.addEventListener('click', primarni);
      return { v, rv, primarni };
    }
    const objaviSpremnost = async (rv: HTMLElement): Promise<void> => {
      rv.setAttribute('data-result-ready', '0');
      await Promise.resolve();
      rv.setAttribute('data-result-ready', '1');
      await new Promise((r) => { setTimeout(r, 0); });
    };

    it('"Preskoči" je gumb dostupan tipkovnicom, odmah daje zavrsno stanje, a fokus ide na presudu', async () => {
      const { v, rv } = viewSRezultatom();
      const h = mountAnalysisLive(v);
      h.start(null);
      const skip = v.querySelector<HTMLButtonElement>('[data-z33="skip"]')!;
      expect(skip.tagName).toBe('BUTTON');
      expect(skip.textContent).toBe('Preskoči');
      expect(skip.hidden, 'nema sto preskociti dok analiza traje').toBe(true);
      vi.useFakeTimers();
      let gotovo = false;
      const p = h.reveal(sampleResult()).then(() => { gotovo = true; });
      expect(skip.hidden).toBe(false);
      expect(skip.closest('[aria-hidden="true"]'), 'gumb ne smije biti skriven od citaca').toBeNull();
      await vi.advanceTimersByTimeAsync(200);
      expect(gotovo).toBe(false);
      skip.click();
      await p;
      vi.useRealTimers();
      expect(v.querySelector('.z33')?.getAttribute('data-phase')).toBe('final');
      expect(skip.hidden).toBe(true);
      await objaviSpremnost(rv);
      expect(document.activeElement?.id).toBe('cockpitVerdictTitle');
    });

    it('"Napravi plan popravka" otvara rezultat i, kad je gotov, pokrece ulaz u popravak kokpita', async () => {
      const { v, rv, primarni } = viewSRezultatom();
      rv.setAttribute('data-result-ready', '1'); // prethodni rezultat
      const h = mountAnalysisLive(v);
      h.start(null);
      vi.useFakeTimers();
      const p = h.reveal(sampleResult());
      const plan = v.querySelector<HTMLButtonElement>('[data-z33="plan"]')!;
      expect(plan.textContent).toBe('Napravi plan popravka');
      expect(plan.hidden).toBe(false);
      plan.click();
      await p;
      vi.useRealTimers();
      // Stari "1" i ponovni "1" bez novog crtanja nisu spremnost OVOG rezultata.
      rv.setAttribute('data-result-ready', '1');
      await new Promise((r) => { setTimeout(r, 0); });
      expect(primarni).not.toHaveBeenCalled();
      await objaviSpremnost(rv);
      expect(primarni).toHaveBeenCalledTimes(1);
    });

    it('nova analiza prije spremnosti rezultata gasi cekanje plana', async () => {
      const { v, rv, primarni } = viewSRezultatom();
      const h = mountAnalysisLive(v);
      h.start(null);
      vi.useFakeTimers();
      const p = h.reveal(sampleResult());
      v.querySelector<HTMLButtonElement>('[data-z33="plan"]')!.click();
      await p;
      vi.useRealTimers();
      h.start(null);
      await objaviSpremnost(rv);
      expect(primarni).not.toHaveBeenCalled();
    });

    it('bez dostupnog popravka gumba plana nema', async () => {
      document.documentElement.dataset.motion = 'reduce';
      const v = view();
      const h = mountAnalysisLive(v);
      h.start(null);
      const bez = sampleResult();
      bez.details.triage.counts.auto = 0;
      await h.reveal(bez);
      expect(v.querySelector<HTMLButtonElement>('[data-z33="plan"]')!.hidden).toBe(true);
      await h.reveal(sampleResult());
      expect(v.querySelector<HTMLButtonElement>('[data-z33="plan"]')!.hidden).toBe(false);
    });

    it('brojac stranica bez storedPages: "-" i razlog u title, ne prazna oznaka', async () => {
      document.documentElement.dataset.motion = 'reduce';
      const v = view();
      const h = mountAnalysisLive(v);
      h.start(null);
      await h.reveal({ ...sampleResult(), stats: { words: 11240, references: 38 } });
      const b = v.querySelector<HTMLElement>('[data-z33="s-pages"]')!;
      expect(b.textContent).toBe('-');
      expect(b.parentElement?.getAttribute('title')).toBe('Word nije zapisao broj stranica u datoteku.');
      expect(v.querySelector('[data-z33="s-words"]')?.parentElement?.hasAttribute('title')).toBe(false);
    });

    it('kad rezultat stigne, ponuda obavijesti nestaje i ne obecaje buducu obavijest', async () => {
      class FakeNotification { static permission: NotificationPermission = 'granted'; static requestPermission = async () => 'granted' as NotificationPermission; }
      vi.stubGlobal('Notification', FakeNotification);
      const v = view();
      const h = mountAnalysisLive(v);
      h.start(null);
      const btn = v.querySelector<HTMLButtonElement>('[data-z33="notify"]')!;
      btn.click();
      await vi.waitFor(() => expect(btn.textContent).toBe('Javit ću ti kad bude gotovo ✓'));
      vi.useFakeTimers();
      const p = h.reveal(sampleResult());
      expect(btn.hidden, 'provjera je gotova; "Javit ću ti" vise ne smije stajati').toBe(true);
      await vi.advanceTimersByTimeAsync(5000);
      await p;
      expect(btn.hidden).toBe(true);
      const vidljivo = [...v.querySelectorAll<HTMLElement>('.z33-notify > *')].filter((n) => !n.hidden).map((n) => n.textContent).join(' ');
      expect(vidljivo).not.toContain('Javit ću ti');
    });
  });

  describe('obavijest "Provjera je gotova"', () => {
    const poslano: string[] = [];
    async function ukljuci(): Promise<HTMLElement> {
      poslano.length = 0;
      class FakeNotification {
        static permission: NotificationPermission = 'granted';
        static requestPermission = async (): Promise<NotificationPermission> => 'granted';
        constructor(_naslov: string, opcije?: NotificationOptions) { poslano.push(opcije?.body ?? ''); }
      }
      vi.stubGlobal('Notification', FakeNotification);
      const v = view();
      const h = mountAnalysisLive(v);
      (v as HTMLElement & { h?: ReturnType<typeof mountAnalysisLive> }).h = h;
      h.start(null);
      const btn = v.querySelector<HTMLButtonElement>('[data-z33="notify"]')!;
      btn.click();
      await vi.waitFor(() => expect(btn.dataset.on).toBe('true'));
      return v;
    }
    const handle = (v: HTMLElement) => (v as HTMLElement & { h: ReturnType<typeof mountAnalysisLive> }).h;
    afterEach(() => { vi.useRealTimers(); });

    it('prirodni zavrsetak otkrivanja salje tocno jednu obavijest', async () => {
      const v = await ukljuci();
      vi.useFakeTimers();
      const p = handle(v).reveal(sampleResult());
      await vi.advanceTimersByTimeAsync(revealDuration(buildLivePlan(sampleResult()), true) + 2000);
      await p;
      expect(poslano).toHaveLength(1);
      expect(poslano[0]).toContain('Provjera je gotova');
    });

    it('otkazivanje usred otkrivanja (progress(0)) ne salje obavijest', async () => {
      const v = await ukljuci();
      vi.useFakeTimers();
      const h = handle(v);
      const p = h.reveal(sampleResult());
      await vi.advanceTimersByTimeAsync(300);
      h.progress(0);
      await p;
      await vi.advanceTimersByTimeAsync(20000);
      expect(poslano).toEqual([]);
    });

    it('nova analiza usred otkrivanja ne salje obavijest za staru', async () => {
      const v = await ukljuci();
      vi.useFakeTimers();
      const h = handle(v);
      const p = h.reveal(sampleResult());
      await vi.advanceTimersByTimeAsync(300);
      h.start(null);
      await p;
      await vi.advanceTimersByTimeAsync(20000);
      expect(poslano).toEqual([]);
    });
  });
});

describe('Z33 gardovi (baseline; mutacije u gate-mutations.test.ts)', () => {
  it('CSS Z33 animira samo transform, opacity i clip-path, bez backdrop-filter', () => {
    expect(motionCssProblems(read('src/ui/analysis-live/analysis-live.css'))).toEqual([]);
  });

  it('natpisi gumba su doslovno iz predloska; "Preskoči" je zapisano odstupanje u F31', () => {
    expect(copyProblems(read('src/ui/analysis-live/analysis-live.ts'), read('design/templates/analysis/Analysis.dc.html'), ['Preskoči'])).toEqual([]);
    const f31 = read('docs/agents/orchestrator-backlog.md').split('\n').find((l) => l.startsWith('| F31 |')) ?? '';
    expect(f31).toContain('Preskoči');
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
