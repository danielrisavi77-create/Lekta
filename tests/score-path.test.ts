/**
 * Vrpca "Put do tehnickih 100": model se gradi iz STVARNO PONUDJENIH stavki, prikazne brojke su
 * monotone i klampane na result.score (A0), copy nikad ne obecava "100" kao odrediste.
 */
import { describe, expect, it } from 'vitest';
import { buildScorePathModel, scorePathHasContent, scorePathHtml } from '../src/ui/score-path';
import type { Check } from '../src/scoring/checks';

function mk(id: string, title: string, status: string, earned: number, max: number): Check {
  return { id, category: 'x', title, status, earned, max, detail: '', issue: null, scored: max > 0 };
}

const CHECKS = [
  mk('page.margins', 'Margine dokumenta', 'fail', 0, 6),                              // auto
  mk('reference.alphabetical', 'Poredak literature', 'warn', 2, 5),                   // assisted
  mk('reference.completeness', 'Potpunost bibliografskih zapisa', 'fail', 1, 5),      // manual (-4)
  mk('format.spacing.body', 'Prored osnovnog teksta', 'pass', 6, 6),
];
const OFFERED = [
  { checkIds: ['page.margins'], fixerId: 'margins-fixer' },
  { checkIds: ['reference.alphabetical'], fixerId: 'bibliography-repair-fixer', requiresConfirmation: true },
];

describe('buildScorePathModel', () => {
  it('slojevi su monotoni na prikaznim brojevima i klampani na displayScore', () => {
    const m = buildScorePathModel(CHECKS, OFFERED, 41)!; // sirovi current je 9/22 = 41
    expect(m.current).toBe(41);
    expect(m.afterAuto).toBeGreaterThanOrEqual(m.current);
    expect(m.afterAssisted).toBeGreaterThanOrEqual(m.afterAuto);
    expect(m.autoGain).toBe(m.afterAuto - m.current);
    expect(m.assistedGain).toBe(m.afterAssisted - m.afterAuto);
    expect(m.manualLost).toBe(4);
  });

  it('A0 klamp: displayScore visi od projekcije ne dopusta negativan dobitak', () => {
    const m = buildScorePathModel(CHECKS, [], 95)!; // projekcija bez stavki je 41
    expect(m.current).toBe(95);
    expect(m.afterAuto).toBe(95);
    expect(m.autoGain).toBe(0);
  });

  it('bez ocjene (score null) modela nema', () => {
    expect(buildScorePathModel(CHECKS, OFFERED, null)).toBeNull();
  });

  it('nepokriveni gubici se zbrajaju u uncoveredLost', () => {
    const m = buildScorePathModel(CHECKS, [], 41)!; // nista nije ponudjeno
    expect(m.uncoveredLost).toBe(6 + 3); // margine (auto) + poredak (assisted)
    expect(m.autoGain).toBe(0);
  });
});

describe('scorePathHtml (copy ugovori)', () => {
  it('sadrzi "procjena" i recenicu o ponovnoj provjeri; NIKAD "najmanje" ni "-> 100"', () => {
    const html = scorePathHtml(buildScorePathModel(CHECKS, OFFERED, 41));
    expect(html).toContain('(procjena)');
    expect(html).toContain('konačnu ocjenu potvrđuje ponovna provjera');
    expect(html).toContain('automatski provjerljiva pravila');
    expect(html).not.toContain('najmanje');
    expect(html).not.toMatch(/do\s*<b>100<\/b>/);
  });

  it('rucni segment kaze "traži tvoju provjeru" s bodovima, bez broja 100', () => {
    const html = scorePathHtml(buildScorePathModel(CHECKS, OFFERED, 41));
    expect(html).toContain('traži tvoju provjeru');
    expect(html).toContain('data-path-segment="manual"');
  });

  it('bez dobitka i bez rucnog jaza vrpce nema (prazan string)', () => {
    const cleanChecks = [mk('page.margins', 'Margine dokumenta', 'pass', 6, 6)];
    const model = buildScorePathModel(cleanChecks, [], 100);
    expect(scorePathHasContent(model)).toBe(false);
    expect(scorePathHtml(model)).toBe('');
  });

  it('segmenti s akcijom postoje samo kad nose dobitak', () => {
    const onlyManual = [mk('reference.completeness', 'Potpunost bibliografskih zapisa', 'fail', 1, 5)];
    const html = scorePathHtml(buildScorePathModel(onlyManual, [], 25));
    expect(html).not.toContain('data-path-segment="auto"');
    expect(html).not.toContain('data-path-segment="assisted"');
    expect(html).toContain('data-path-segment="manual"');
  });

  it('nepokriveni bodovi dobivaju postenu napomenu o profilu', () => {
    const html = scorePathHtml(buildScorePathModel(CHECKS, [], 41));
    expect(html).toContain('nema ponuđenog popravka u ovom profilu');
  });
});

describe('razlomacki bodovi provjera', () => {
  it('manualLost i uncoveredLost su zaokruzeni cijeli brojevi (nema "15.8 bodova")', () => {
    const fractional = [
      mk('reference.completeness', 'Potpunost bibliografskih zapisa', 'warn', 2.2, 5), // manual, -2.8
      mk('page.margins', 'Margine dokumenta', 'warn', 4.4, 6),                       // auto, -1.6 (nepokriveno)
    ];
    const m = buildScorePathModel(fractional, [], 60)!;
    expect(Number.isInteger(m.manualLost)).toBe(true);
    expect(Number.isInteger(m.uncoveredLost)).toBe(true);
    expect(m.manualLost).toBe(3);
    expect(m.uncoveredLost).toBe(2);
    expect(scorePathHtml(m)).not.toMatch(/\d\.\d+ bod/);
  });
});

describe('redoslijed citanja vrpce', () => {
  it('odrediste "do N" dolazi PRIJE rucnog ostatka; rucni ostatak je iza separatora, ne strelice', () => {
    const html = scorePathHtml(buildScorePathModel(CHECKS, OFFERED, 41));
    const target = html.indexOf('score-path__to');
    const manual = html.indexOf('data-path-segment="manual"');
    const rest = html.indexOf('score-path__rest');
    expect(target).toBeGreaterThan(-1);
    expect(manual).toBeGreaterThan(target);
    expect(rest).toBeGreaterThan(target);
    expect(rest).toBeLessThan(manual);
  });
});

describe('traka 0-100', () => {
  it('segmenti trake odgovaraju modelu i zbroj ne prelazi 100', () => {
    const m = buildScorePathModel(CHECKS, OFFERED, 41)!;
    const html = scorePathHtml(m);
    expect(html).toContain('score-path__bar');
    expect(html).toContain('score-path__bar-seg--now" style="width:41.0%"');
    expect(html).toContain('score-path__bar-seg--manual');
    expect(m.maxRaw).toBe(22);
    expect(m.manualPct).toBe(Math.round((4 / 22) * 100));
    const widths = [...html.matchAll(/width:([\d.]+)%/g)].map((x) => Number(x[1]));
    expect(widths.reduce((s, w) => s + w, 0)).toBeLessThanOrEqual(100.05);
  });

  it('A0 klamp (visok displayScore) ne daje traku siru od 100', () => {
    const html = scorePathHtml(buildScorePathModel(CHECKS, [], 95));
    const widths = [...html.matchAll(/width:([\d.]+)%/g)].map((x) => Number(x[1]));
    expect(widths.reduce((s, w) => s + w, 0)).toBeLessThanOrEqual(100.05);
  });

  it('kartica nosi slotove za CTA popravka i linkove (app.ts u njih seli #repairEntry i Rendgen)', () => {
    const html = scorePathHtml(buildScorePathModel(CHECKS, OFFERED, 41));
    expect(html).toContain('data-path-cta');
    expect(html).toContain('data-path-links');
  });
});
