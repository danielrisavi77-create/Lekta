import { describe, it, expect } from 'vitest';
import { buildSourceCheckHtml, summarizeSourceCheck } from '../src/ui/source-check-view';
import type { RepairSourceCheck } from '../src/report/repair-client';

const pogodak = (over: Partial<RepairSourceCheck['found'][number]> = {}) => ({
  index: 0, verdict: 'found' as const, score: 0.91,
  matchedTitle: 'Sekundarna hipertenzija', where: 'Medicinski fakultet u Zagrebu',
  url: 'https://urn.nsk.hr/urn:nbn:hr:105:621611', ...over,
});

const sc = (over: Partial<RepairSourceCheck> = {}): RepairSourceCheck => ({
  found: [pogodak()], checked: 3, total: 3, truncated: false, ...over,
});

describe('source-check-view: brojac je posten', () => {
  it('potpuna provjera imenuje ukupan broj referenci', () => {
    expect(summarizeSourceCheck(sc())).toContain('svih 3 referenci');
  });

  it('DJELOMICNA provjera uvijek kaze koliko od koliko (inace izgleda potpuno)', () => {
    const s = summarizeSourceCheck(sc({ checked: 8, total: 40, truncated: true }));
    expect(s).toContain('8 od 40 referenci');
    expect(s).toContain('nije stigao na red');
  });

  it('znacka prikazuje nazivnik, ne goli broj pogodaka', () => {
    expect(buildSourceCheckHtml(sc({ checked: 8, total: 40, truncated: true }))).toContain('>1 od 8<');
  });

  it('djelomican rezultat nosi vidljivo upozorenje', () => {
    const html = buildSourceCheckHtml(sc({ checked: 8, total: 40, truncated: true }));
    expect(html).toContain('Rezultat je djelomičan');
    expect(buildSourceCheckHtml(sc())).not.toContain('Rezultat je djelomičan');
  });

  it('nedosljedan odgovor (checked < total bez zastavice) svejedno je djelomican', () => {
    expect(buildSourceCheckHtml(sc({ checked: 2, total: 3, truncated: false }))).toContain('Rezultat je djelomičan');
  });
});

describe('source-check-view: promasaj NIKAD nije "ne postoji"', () => {
  it('caveat o dosegu korpusa je uvijek prisutan', () => {
    const html = buildSourceCheckHtml(sc());
    expect(html).toContain('ne znači');
    expect(html).toContain('Dabar');
  });

  it('nula pogodaka ne proglasava literaturu izmisljenom', () => {
    const html = buildSourceCheckHtml(sc({ found: [] }));
    expect(html).toContain('Nijedan navedeni izvor nije prepoznat');
    expect(html.toLowerCase()).not.toContain('izmišljen');
    expect(html.toLowerCase()).not.toContain('ne postoji izvor');
  });

  it('nema provjere -> nema sekcije (prazna bi sugerirala ishod)', () => {
    expect(buildSourceCheckHtml(null)).toBe('');
    expect(buildSourceCheckHtml(undefined)).toBe('');
    expect(buildSourceCheckHtml(sc({ total: 0, checked: 0, found: [] }))).toBe('');
  });
});

describe('source-check-view: prikaz pogotka', () => {
  it('veze pogodak uz TOCAN izvorni navod po indeksu', () => {
    const html = buildSourceCheckHtml(sc({ found: [pogodak({ index: 1 })] }),
      [{ raw: 'Prvi navod' }, { raw: 'Drugi navod' }]);
    expect(html).toContain('Drugi navod');
    expect(html).not.toContain('Prvi navod');
  });

  it('preživi indeks izvan popisa (bez rusenja i bez laznog navoda)', () => {
    const html = buildSourceCheckHtml(sc({ found: [pogodak({ index: 9 })] }), [{ raw: 'Jedini' }]);
    expect(html).toContain('Sekundarna hipertenzija');
    expect(html).not.toContain('Tvoj navod');
  });

  it('slab pogodak trazi rucnu provjeru, ne tvrdi pronalazak', () => {
    const html = buildSourceCheckHtml(sc({ found: [pogodak({ verdict: 'weak' })] }));
    expect(html).toContain('Vjerojatno isti rad, provjeri');
  });

  it('escapea naslov i navod (XSS iz metapodataka)', () => {
    const html = buildSourceCheckHtml(sc({ found: [pogodak({ matchedTitle: '<img src=x onerror=alert(1)>' })] }),
      [{ raw: '<script>alert(2)</script>' }]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });

  it('odbija nesigurnu shemu u poveznici', () => {
    const html = buildSourceCheckHtml(sc({ found: [pogodak({ url: 'javascript:alert(1)' })] }));
    expect(html).not.toContain('javascript:');
  });
});
