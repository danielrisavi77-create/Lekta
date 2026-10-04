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
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { buildLivePlan, readingFrame, revealFrame, revealDuration } from '../src/ui/analysis-live/analysis-live-model';
import { mountAnalysisLive } from '../src/ui/analysis-live/analysis-live';
import { SCAN_PHASES } from '../src/ui/progress-scan';
import { renderResultsCockpit } from '../src/ui/results/results-cockpit';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
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
      pages: { text: '41', title: '', note: '' },
      words: { text: (11240).toLocaleString('hr-HR'), title: '', note: '' },
      sources: { text: '38', title: '', note: '' },
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
    // Svih sest mjesta stoji (Z33-04), nijedno nije nalaz.
    expect(kraj.slots).toHaveLength(6);
    expect(kraj.slots.every((s) => s.state === 'empty')).toBe(true);
    expect(kraj.foundLine).toBe('Nema otvorenih nalaza');
    expect(kraj.score).toBe('Nije bodovano');
    // Brojac bez broja nikad nije prazna oznaka: "-" uz razlog u `title`.
    expect(kraj.stats).toEqual({
      pages: { text: '-', title: 'Word nije zapisao broj stranica u datoteku.', note: 'Word nije zapisao' },
      words: { text: '-', title: 'Broj riječi nije izmjeren.', note: 'nije izmjereno' },
      sources: { text: '-', title: 'Broj izvora nije izmjeren.', note: 'nije izmjereno' },
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
    expect(s.pages).toEqual({ text: '-', title: 'Word nije zapisao broj stranica u datoteku.', note: 'Word nije zapisao' });
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

describe('Z33 tragovi po sidru nad STVARNOM analizom (F31 d)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.dataset.motion;
  });

  it('analyzeDocx nad fixtureom s nalazima daje barem jedan trag sa sidrom, a DOM ga oznaci data-located', async () => {
    const ime = 'fer-diplomski-prazni-odlomci.docx'; // izmjereno: 1 od 6 nalaza nosi sidro (par=172)
    const profile = resolveProfile(VERIFIED_PROFILE_REGISTRY[0].id);
    const settings = { profileId: VERIFIED_PROFILE_REGISTRY[0].id, workType: profile.selection.workType, citationStyle: 'fpzg',
      language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {} };
    const file = new File([readFileSync(resolve('tests/fixtures/docx', ime))], ime);
    const result: any = await analyzeDocx(file, profile, settings, () => {});
    const plan = buildLivePlan(result);
    expect(plan.findings.length, 'fixture mora imati nalaze').toBeGreaterThan(0);
    const sSidrom = plan.findings.filter((f) => f.at != null);
    expect(sSidrom.length, 'ni jedan stvarni nalaz ne nosi sidro: izmjereno, nije pretpostavljeno').toBeGreaterThan(0);
    for (const f of sSidrom) expect(f.at!).toBeGreaterThanOrEqual(0);

    document.documentElement.dataset.motion = 'reduce';
    document.body.innerHTML = '<div id="progressView"><p class="sr-only" id="progressMessage">Gotovo</p><p class="pv-local">x</p></div>';
    const v = document.getElementById('progressView')!;
    const h = mountAnalysisLive(v);
    h.start(null);
    await h.reveal(result);
    const tragovi = [...v.querySelectorAll<HTMLElement>('[data-z33="edge"] .z33-edge')];
    expect(tragovi).toHaveLength(plan.findings.length);
    expect(tragovi.some((t) => t.dataset.located === 'true')).toBe(true);
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

    it('fokus na "Preskoči" kad otkrivanje zavrsi samo od sebe: ne pada na body, ide na presudu', async () => {
      const { v, rv } = viewSRezultatom();
      const h = mountAnalysisLive(v);
      h.start(null);
      const skip = v.querySelector<HTMLButtonElement>('[data-z33="skip"]')!;
      vi.useFakeTimers();
      const p = h.reveal(sampleResult());
      expect(skip.hidden).toBe(false);
      skip.focus();
      expect(document.activeElement).toBe(skip);
      await vi.advanceTimersByTimeAsync(10_000);
      await p;
      vi.useRealTimers();
      expect(skip.hidden, 'Preskoči nestaje kad otkrivanje zavrsi').toBe(true);
      await objaviSpremnost(rv);
      expect(document.activeElement?.id).toBe('cockpitVerdictTitle');
    });

    it('prirodni kraj bez fokusa na nestajucem gumbu ne otima fokus', async () => {
      const { v, rv } = viewSRezultatom();
      const drugi = document.createElement('input');
      document.body.append(drugi);
      const h = mountAnalysisLive(v);
      h.start(null);
      vi.useFakeTimers();
      const p = h.reveal(sampleResult());
      drugi.focus();
      await vi.advanceTimersByTimeAsync(10_000);
      await p;
      vi.useRealTimers();
      await objaviSpremnost(rv);
      expect(document.activeElement).toBe(drugi);
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

    it('brojac bez broja ima vidljivu kratku oznaku koja nije u aria-hidden podrucju', async () => {
      document.documentElement.dataset.motion = 'reduce';
      const v = view();
      const h = mountAnalysisLive(v);
      h.start(null);
      const oznaka = (n: string): HTMLElement => v.querySelector<HTMLElement>(`[data-z33="n-${n}"]`)!;
      // Dok provjera traje: sva tri brojaca kazu da se mjere.
      expect(['pages', 'words', 'sources'].map((n) => oznaka(n).textContent)).toEqual(['mjeri se', 'mjeri se', 'mjeri se']);
      await h.reveal({ ...sampleResult(), stats: { words: 11240, references: 38 } });
      expect(oznaka('pages').textContent).toBe('Word nije zapisao');
      expect(oznaka('words').textContent, 'izmjeren broj nema oznaku').toBe('');
      expect(oznaka('sources').textContent).toBe('');
      expect(oznaka('pages').closest('[aria-hidden="true"]'), 'citac zaslona mora doci do oznake').toBeNull();
      expect(v.querySelector('[data-z33="s-pages"]')?.closest('[aria-hidden="true"]')).toBeNull();
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


/* ------------------------------------------------------------------------------------------ */
/*
 * CODEX KRUG NA #268 (Z33-01 do Z33-09). Svaki test ispod je prvo pokrenut nad 58cb5091 i ondje
 * pao (dokaz nalaza), tek zatim je popravljen kod. KONTROLE (bez kvara) pokazuju da test mjeri
 * ono sto tvrdi, a ne da je crven iz drugog razloga.
 */

/** Ekran provjere (s gumbom za prekid, kao u ruti) i ekran rezultata s kokpitom. */
function ekran(): { v: HTMLElement; rv: HTMLElement; primarni: ReturnType<typeof vi.fn> } {
  document.body.innerHTML = '<div id="progressView" role="status" aria-live="polite"><p class="pv-file">rad.docx</p>'
    + '<h3>Provjeravam rad</h3><p class="sr-only" id="progressMessage">Gotovo</p><p class="pv-local">x</p>'
    + '<div class="progress-actions"><button type="button" id="cancelAnalysisBtn">Prekini</button></div></div>'
    + '<div id="resultView"><div id="resultCockpit"><h2 id="cockpitVerdictTitle">Nije spremno za predaju</h2>'
    + '<button type="button" data-cockpit-primary data-cockpit-action="repair-safe">Napravi plan popravka</button></div></div>';
  const primarni = vi.fn();
  const rv = document.getElementById('resultView')!;
  rv.querySelector('[data-cockpit-primary]')!.addEventListener('click', primarni);
  return { v: document.getElementById('progressView')!, rv, primarni };
}
const spremnost = async (rv: HTMLElement): Promise<void> => {
  rv.setAttribute('data-result-ready', '0');
  await Promise.resolve();
  rv.setAttribute('data-result-ready', '1');
  await vi.advanceTimersByTimeAsync(0);
};
const siroko = (): boolean => window.matchMedia?.('(min-width: 980px)')?.matches ?? true;
const faza = (v: HTMLElement): string | null => v.querySelector('.z33')!.getAttribute('data-phase');

describe('Z33-01, Z33-05 i Z33-12: osigurac otkrivanja i skrol', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.motion;
  });

  it('Z33-01: osigurac otkrivanja A ne zavrsava otkrivanje B koje je pocelo prije njegova isteka', async () => {
    const { v } = ekran();
    const h = mountAnalysisLive(v);
    vi.useFakeTimers();
    h.start(null);
    const dA = revealDuration(buildLivePlan(sampleResult()), siroko());
    const a = h.reveal(sampleResult());
    await vi.advanceTimersByTimeAsync(100);
    v.querySelector<HTMLButtonElement>('[data-z33="skip"]')!.click();
    await a;
    // Osigurac A bi opalio u dA + 500; B pocinje 100 ms prije toga.
    await vi.advanceTimersByTimeAsync(dA + 400 - 100);
    h.start(null);
    let gotovB = false;
    const b = h.reveal(sampleResult()).then(() => { gotovB = true; });
    await vi.advanceTimersByTimeAsync(250);
    expect(gotovB, 'osigurac prethodnog otkrivanja je zavrsio novo').toBe(false);
    expect(faza(v)).toBe('revealing');
    await vi.advanceTimersByTimeAsync(dA + 1000);
    await b;
    expect(gotovB).toBe(true);
    expect(faza(v)).toBe('final');
  });

  it('Z33-05 KONTROLA: bez prigusenja i bez korisnikova skrola skrol do presude je gladak, tocno jednom', async () => {
    const { v } = ekran();
    const skrol = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    const h = mountAnalysisLive(v);
    vi.useFakeTimers();
    h.start(null);
    const p = h.reveal(sampleResult());
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(skrol.mock.calls.map(([o]) => (o as ScrollIntoViewOptions | undefined)?.behavior)).toEqual(['smooth']);
  });

  it('Z33-05/12: prigusen pokret ukljucen usred otkrivanja: otkrivanje zavrsava odmah, glatkog skrola nema', async () => {
    const { v } = ekran();
    const skrol = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    const h = mountAnalysisLive(v);
    vi.useFakeTimers();
    h.start(null);
    let gotovo = false;
    const p = h.reveal(sampleResult()).then(() => { gotovo = true; });
    await vi.advanceTimersByTimeAsync(300);
    document.documentElement.dataset.motion = 'reduce';
    await vi.advanceTimersByTimeAsync(100);
    expect(gotovo, 'tipkanje i let se nastavljaju pod prigusenim pokretom').toBe(true);
    expect(faza(v)).toBe('final');
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(skrol.mock.calls.filter(([o]) => (o as ScrollIntoViewOptions | undefined)?.behavior === 'smooth')).toEqual([]);
  });

  it('Z33-05: korisnik je sam skrolao tijekom otkrivanja: stranica mu ne otima prikaz', async () => {
    const { v } = ekran();
    const skrol = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    const h = mountAnalysisLive(v);
    vi.useFakeTimers();
    h.start(null);
    const p = h.reveal(sampleResult());
    await vi.advanceTimersByTimeAsync(300);
    window.dispatchEvent(new Event('wheel'));
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(skrol).not.toHaveBeenCalled();
  });
});

describe('Z33-06 i Z33-07: najava za citac i fokus na kraju', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.motion;
  });

  it('Z33-06: jedna sazeta polite najava (presuda, ocjena, nalazi), upisana jednom; tipkanje nije u live regiji', async () => {
    const { v } = ekran();
    const result = sampleResult();
    const plan = buildLivePlan(result);
    const h = mountAnalysisLive(v);
    const root = v.querySelector<HTMLElement>('.z33')!;
    vi.useFakeTimers();
    h.start(null);
    const zivi = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"]')]
      .filter((e) => e.getAttribute('aria-live') !== 'off');
    expect(zivi(), 'tocno jedna live regija u Z33').toHaveLength(1);
    const najava = zivi()[0];
    expect(najava.closest('[aria-hidden="true"]'), 'najava ne smije biti skrivena od citaca').toBeNull();
    const upisi: string[] = [];
    const obs = new MutationObserver(() => { if (najava.textContent) upisi.push(najava.textContent); });
    obs.observe(najava, { childList: true, characterData: true, subtree: true });
    const p = h.reveal(result);
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    await Promise.resolve();
    obs.disconnect();
    expect(upisi, 'najava se upisuje jednom, ne po slovu ni po nalazu').toHaveLength(1);
    expect(upisi[0]).toContain(plan.verdict);
    expect(upisi[0]).toContain(`ocjena forme ${result.score}`);
    expect(upisi[0]).toContain(plan.summary);
    // Ono sto se tipka (presuda, naslovi nalaza) nije ni u jednoj zivoj regiji.
    const uzivoPredak = (el: Element): string | null => {
      for (let n: Element | null = el; n; n = n.parentElement) if (n.hasAttribute('aria-live')) return n.getAttribute('aria-live');
      return null;
    };
    expect(uzivoPredak(root.querySelector('[data-z33="verdicttext"]')!)).toBe('off');
    expect(uzivoPredak(root.querySelector('[data-z33="slots"]')!)).toBe('off');
  });

  it('Z33-06: veliki kostur ulazi tek kad je ekran provjere vec ugasio aria-live', () => {
    const { v } = ekran();
    const obs = new MutationObserver(() => {});
    obs.observe(v, { childList: true, attributes: true, attributeFilter: ['aria-live'], attributeOldValue: true });
    mountAnalysisLive(v);
    const zapisi = obs.takeRecords();
    obs.disconnect();
    const umetanje = zapisi.findIndex((z) => z.type === 'childList' && [...z.addedNodes].some((n) => (n as Element).classList?.contains('z33')));
    const gasenje = zapisi.findIndex((z) => z.type === 'attributes' && z.oldValue === 'polite');
    expect(umetanje).toBeGreaterThanOrEqual(0);
    expect(gasenje).toBeGreaterThanOrEqual(0);
    expect(gasenje, 'kostur je umetnut dok je roditelj jos bio polite regija').toBeLessThan(umetanje);
  });

  for (const [ime, sel] of [['Pregledaj nalaze', '[data-z33="open"]'], ['Prekini', '#cancelAnalysisBtn']] as const) {
    it(`Z33-07: fokus na "${ime}" kad otkrivanje zavrsi samo od sebe ide na presudu rezultata`, async () => {
      const { v, rv, primarni } = ekran();
      const h = mountAnalysisLive(v);
      vi.useFakeTimers();
      h.start(null);
      const p = h.reveal(sampleResult());
      await vi.advanceTimersByTimeAsync(50);
      v.querySelector<HTMLButtonElement>(sel)!.focus();
      expect(document.activeElement).toBe(v.querySelector(sel));
      await vi.advanceTimersByTimeAsync(10_000);
      await p;
      await spremnost(rv);
      expect(document.activeElement?.id).toBe('cockpitVerdictTitle');
      expect(primarni).not.toHaveBeenCalled();
    });
  }

  it('Z33-07: fokus na "Napravi plan popravka" na prirodnom kraju ide na ulaz u popravak, bez klika', async () => {
    const { v, rv, primarni } = ekran();
    const h = mountAnalysisLive(v);
    vi.useFakeTimers();
    h.start(null);
    const p = h.reveal(sampleResult());
    await vi.advanceTimersByTimeAsync(50);
    const plan = v.querySelector<HTMLButtonElement>('[data-z33="plan"]')!;
    plan.focus();
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    await spremnost(rv);
    expect(document.activeElement).toBe(rv.querySelector('[data-cockpit-primary]'));
    expect(primarni, 'fokus nije klik: plan se ne pokrece sam').not.toHaveBeenCalled();
  });

  it('Z33-07: pod prigusenim pokretom fokus s ponude obavijesti ne pada na body', async () => {
    class FakeNotification { static permission: NotificationPermission = 'default'; static requestPermission = async () => 'granted' as NotificationPermission; }
    vi.stubGlobal('Notification', FakeNotification);
    document.documentElement.dataset.motion = 'reduce';
    const { v, rv } = ekran();
    const h = mountAnalysisLive(v);
    vi.useFakeTimers();
    h.start(null);
    const notify = v.querySelector<HTMLButtonElement>('[data-z33="notify"]')!;
    notify.focus();
    expect(document.activeElement).toBe(notify);
    await h.reveal(sampleResult());
    await spremnost(rv);
    expect(document.activeElement?.id).toBe('cockpitVerdictTitle');
  });

  it('Z33-07 KONTROLA: fokus izvan ekrana provjere ostaje gdje jest', async () => {
    const { v, rv } = ekran();
    const drugi = document.createElement('input');
    document.body.append(drugi);
    const h = mountAnalysisLive(v);
    vi.useFakeTimers();
    h.start(null);
    const p = h.reveal(sampleResult());
    drugi.focus();
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    await spremnost(rv);
    expect(document.activeElement).toBe(drugi);
  });
});

describe('Z33-04: sest stabilnih mjesta za nalaze do prelaska na rezultat', () => {
  /** Generator: tocno JEDAN otvoren nalaz (pet mjesta bi inace nestalo). */
  function jedanNalaz() {
    const r = sampleResult();
    const i = issue('warning', 'formatting', 'Font nije po pravilniku');
    return { ...r, checks: [check('formatting', 'Dominantni font', 'warn', 4, 8, 'Calibri 11 pt', i)], issues: [i] };
  }
  afterEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.dataset.motion;
  });

  it('generator: jedan nalaz', () => {
    expect(buildLivePlan(jedanNalaz()).findings).toHaveLength(1);
  });

  it('broj mjesta je 6 u citanju, kroz cijelo otkrivanje i u zavrsnom stanju, siroko i usko', () => {
    expect(readingFrame(52).slots).toHaveLength(6);
    for (const result of [jedanNalaz(), { file: { name: 'x.docx' }, checks: [], issues: [] }, sampleResult()]) {
      const plan = buildLivePlan(result);
      for (const wide of [true, false]) {
        for (let t = 0; t <= revealDuration(plan, wide) + 100; t += 50) expect(revealFrame(plan, t, wide).slots).toHaveLength(6);
        const kraj = revealFrame(plan, Infinity, wide);
        expect(kraj.slots).toHaveLength(6);
        expect(kraj.slots.filter((s) => s.state === 'filled').map((s) => s.title)).toEqual(plan.findings.map((f) => f.title));
        // Mjesto bez nalaza ne izmislja nalaz ni "ceka provjeru" nakon kraja provjere.
        expect(kraj.slots.filter((s) => s.state !== 'filled').every((s) => s.state === 'empty' && s.title === '' && s.label === '')).toBe(true);
      }
    }
  });

  it('DOM: jedan nalaz zadrzava sest redaka', async () => {
    document.documentElement.dataset.motion = 'reduce';
    document.body.innerHTML = '<div id="progressView"><p class="sr-only" id="progressMessage">Gotovo</p><p class="pv-local">x</p></div>';
    const v = document.getElementById('progressView')!;
    const h = mountAnalysisLive(v);
    h.start(null);
    expect(v.querySelectorAll('.z33-slot')).toHaveLength(6);
    await h.reveal(jedanNalaz());
    expect(v.querySelectorAll('.z33-slot')).toHaveLength(6);
    expect(v.querySelectorAll('.z33-slot[data-state="filled"]')).toHaveLength(1);
  });
});

/**
 * Z33-02 i Z33-03: LIJENI MODUL. `progress-scan.ts` drzi stanje modula, pa svaki test uvozi svjez
 * primjerak (`vi.resetModules`) uz podmetnut modul Z33: onaj koji NIKAD ne stigne, onaj koji stigne
 * kasno i onaj koji baci pri montazi.
 */
describe('Z33-02/03: rezultat ne ceka lijeni modul', () => {
  const MODUL = '../src/ui/analysis-live/analysis-live';
  afterEach(() => {
    vi.doUnmock(MODUL);
    vi.resetModules();
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.motion;
  });
  function ekranProvjere(): HTMLElement {
    document.body.innerHTML = '<div id="progressView" role="status" aria-live="polite"><h3>Provjeravam rad</h3>'
      + '<p class="sr-only" id="progressMessage">Gotovo</p><p class="pv-local">x</p></div>';
    return document.getElementById('progressView')!;
  }
  /** Rjesava se `true` ako obecanje zavrsi unutar `ms` stvarnog vremena; nikad ne visi. */
  const zavrsiUnutar = (p: Promise<unknown>, ms: number): Promise<boolean> => Promise.race([
    p.then(() => true, () => true),
    new Promise<boolean>((r) => { setTimeout(() => r(false), ms); }),
  ]);

  it('modul koji nikad ne stigne: rezultat stize odmah, kompaktni popis faza ostaje', async () => {
    vi.resetModules();
    vi.doMock(MODUL, () => new Promise(() => {}));
    const v = ekranProvjere();
    const ps = await import('../src/ui/progress-scan');
    ps.startLiveAnalysis(null);
    ps.renderProgressScan(0);
    ps.renderProgressScan(52);
    expect(await zavrsiUnutar(ps.revealLiveAnalysis(sampleResult()), 1500), 'rezultat ceka modul koji ne stize').toBe(true);
    expect(v.querySelector('.pscan')).not.toBeNull();
    expect(v.querySelector('.z33')).toBeNull();
    expect(v.dataset.z33).toBeUndefined();
  });

  it('modul koji baci pri montazi: rezultat stize, analiza ne pada', async () => {
    vi.resetModules();
    vi.doMock(MODUL, () => ({ mountAnalysisLive: () => { throw new Error('montaza pala'); } }));
    ekranProvjere();
    const ps = await import('../src/ui/progress-scan');
    ps.startLiveAnalysis(null);
    ps.renderProgressScan(0);
    await new Promise((r) => { setTimeout(r, 0); });
    await expect(ps.revealLiveAnalysis(sampleResult())).resolves.toBeUndefined();
  });

  /** Modul koji stigne tek na `pusti()`; do tada uvoz visi. */
  function kasniModul(): () => void {
    let pusti: () => void = () => {};
    const stigao = new Promise<void>((r) => { pusti = r; });
    vi.doMock(MODUL, async () => { await stigao; return vi.importActual(MODUL); });
    return pusti;
  }
  const pricekajUvoz = (): Promise<void> => new Promise((r) => { setTimeout(r, 300); });

  it('KONTROLA: modul stigne dok analiza traje, a korisnik nije skrolao: prikaz uzivo preuzima ekran', async () => {
    vi.resetModules();
    const pusti = kasniModul();
    const v = ekranProvjere();
    const ps = await import('../src/ui/progress-scan');
    ps.startLiveAnalysis(null);
    ps.renderProgressScan(8);
    expect(v.querySelector('.z33')).toBeNull();
    pusti();
    await pricekajUvoz();
    expect(v.querySelector('.z33')).not.toBeNull();
    expect(v.querySelector('.z33')!.getAttribute('data-phase')).toBe('reading');
  });

  it('modul stigne nakon sto je korisnik skrolao: nema zamjene pod prstom; sljedeca analiza ga koristi odmah', async () => {
    vi.resetModules();
    const pusti = kasniModul();
    document.documentElement.dataset.motion = 'reduce';
    const v = ekranProvjere();
    const ps = await import('../src/ui/progress-scan');
    ps.startLiveAnalysis(null);
    ps.renderProgressScan(8);
    expect(v.querySelector('.pscan'), 'prijelazni kompaktni prikaz').not.toBeNull();
    window.dispatchEvent(new Event('touchmove'));
    pusti();
    await pricekajUvoz();
    ps.renderProgressScan(52);
    expect(v.querySelector('.z33'), 'veliki prikaz je zamijenio popis usred skrola').toBeNull();
    expect(v.dataset.z33).toBeUndefined();
    await ps.revealLiveAnalysis(sampleResult());
    // Sljedeca analiza: modul je tu, montaza je sinkrona, bez prijelaza.
    ps.startLiveAnalysis(null);
    expect(v.querySelector('.z33')).not.toBeNull();
    await ps.revealLiveAnalysis(sampleResult());
    expect(v.querySelector('.z33')!.getAttribute('data-phase')).toBe('final');
  });

  it('modul stigne tek nakon rezultata: rezultat ga ne ceka, a kasni modul ne preuzima ekran', async () => {
    vi.resetModules();
    const pusti = kasniModul();
    const v = ekranProvjere();
    const ps = await import('../src/ui/progress-scan');
    ps.startLiveAnalysis(null);
    ps.renderProgressScan(52);
    expect(await zavrsiUnutar(ps.revealLiveAnalysis(sampleResult()), 1500), 'rezultat ceka modul').toBe(true);
    pusti();
    await pricekajUvoz();
    expect(v.querySelector('.z33')).toBeNull();
  });
});

/**
 * Z33-09: ISTI ULAZ, DVA PRIKAZA. Stvarna analiza fixturea ide kroz postojeci prikaz rezultata
 * (`renderResultsCockpit` nad `buildVisualResultModel`, kao u `app.ts`) i kroz zavrsno stanje
 * analize uzivo. Presuda, ocjena, broj nalaza, broj automatskih popravaka i najvazniji nalazi
 * moraju biti isti; uzivo smije pokazati vise nalaza (do sest), nikad drugacije.
 */
describe('Z33-09: zavrsno stanje uzivo = postojeci prikaz rezultata nad istim ulazom', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.dataset.motion;
  });

  for (const ime of ['lo-fpzg-zavrsni-neuskladjen.docx', 'fer-diplomski-prazni-odlomci.docx']) {
    it(ime, async () => {
      const profile = resolveProfile(VERIFIED_PROFILE_REGISTRY[0].id);
      const settings = { profileId: VERIFIED_PROFILE_REGISTRY[0].id, workType: profile.selection.workType, citationStyle: 'fpzg',
        language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {} };
      const result: any = await analyzeDocx(new File([readFileSync(resolve('tests/fixtures/docx', ime))], ime), profile, settings, () => {});

      document.documentElement.dataset.motion = 'reduce';
      document.body.innerHTML = '<div id="progressView"><p class="sr-only" id="progressMessage">Gotovo</p><p class="pv-local">x</p></div><div id="resultCockpit"></div>';
      const v = document.getElementById('progressView')!;
      const h = mountAnalysisLive(v);
      h.start(null);
      await h.reveal(result);
      const kokpit = document.getElementById('resultCockpit')!;
      renderResultsCockpit(kokpit, buildVisualResultModel(result), { repairAvailable: !result.demo });

      const t = (root: ParentNode, s: string): string => (root.querySelector(s)?.textContent ?? '').trim();
      // Presuda.
      expect(t(v, '[data-z33="verdicttext"]')).toBe(t(kokpit, '#cockpitVerdictTitle'));
      // Ocjena: prsten kokpita i prsten uzivo.
      const bodovano = kokpit.querySelector('.cockpit-ring')?.getAttribute('data-cockpit-score') === 'scored';
      expect(bodovano).toBe(typeof result.score === 'number');
      if (bodovano) expect(t(v, '[data-z33="ringnum"]')).toBe(t(kokpit, '.cockpit-ring__core'));
      // Broj nalaza i broj automatskih popravaka (sazetak kokpita).
      const sazetak = t(v, '[data-z33="summary"]');
      expect(sazetak.startsWith(t(kokpit, '.fsum-naslov') + '.')).toBe(true);
      const auto = t(kokpit, '.fsum-auto b');
      if (auto && auto !== '0') expect(sazetak).toContain(`Od toga ${auto} mogu popraviti automatski.`);
      else expect(sazetak).not.toContain('Od toga');
      // Najvazniji nalazi kokpita su medju nalazima uzivo; uzivo nema nijednog nalaza izvan rezultata.
      const kartice = [...kokpit.querySelectorAll('[data-cockpit-priority-card] h3')].map((n) => n.textContent?.trim());
      const uzivo = [...v.querySelectorAll('.z33-slot[data-state="filled"] .z33-slot-title')].map((n) => n.textContent?.trim());
      expect(kartice.length, 'fixture mora imati nalaze').toBeGreaterThan(0);
      for (const k of kartice) expect(uzivo).toContain(k);
      const svi = buildVisualResultModel(result).findings.document.map((f) => f.title);
      for (const u of uzivo) expect(svi).toContain(u);
      // Gumb plana uzivo postoji tocno kad kokpit nudi `repair-safe`.
      const plan = !v.querySelector<HTMLButtonElement>('[data-z33="plan"]')!.hidden;
      expect(plan).toBe(!!kokpit.querySelector('[data-cockpit-primary][data-cockpit-action="repair-safe"]'));
      // Na stvarnom ulazu list presude stoji gotov barem 1,2 s prije kraja, siroko i usko.
      const zivi = buildLivePlan(result);
      for (const wide of [true, false]) expect(revealFrame(zivi, revealDuration(zivi, wide) - 1200, wide).verdict.metaVisible).toBe(true);
    });
  }
});
