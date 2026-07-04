/**
 * Regresija sigurnosti izvoza (pre-launch checklist P0 5.1): svaki korisnicki izveden string
 * (naslov, autor, citat) umece se u standalone HTML izvjestaj iskljucivo kroz escapeHtml, a
 * href vrijednosti kroz safeHref. Ovi testovi dokazuju da <script> i navodnici ne mogu izbiti
 * iz teksta ni atributa, te da se izvrsive sheme (javascript:) neutraliziraju.
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, safeHref } from '../src/utils/helpers';

describe('escapeHtml (P0 5.1 XSS u izvezenom izvjestaju)', () => {
  it('neutralizira <script> u naslovu dokumenta', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script');
  });
  it('escapa dvostruki i jednostruki navodnik (bijeg iz atributa)', () => {
    expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
    expect(escapeHtml("' onerror='x")).toBe('&#39; onerror=&#39;x');
  });
  it('escapa & prvi (nema dvostrukog dekodiranja)', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });
  it('prazan/undefined ulaz ne baca', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
  });
  it('realisticki naslov s napadom ostaje inertan', () => {
    const title = 'Diplomski "<img src=x onerror=alert(document.cookie)>"';
    const out = escapeHtml(title);
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toContain('"');
  });
});

describe('safeHref (P0 5.1 injekcija sheme u href)', () => {
  it('propusta http(s) i mailto', () => {
    expect(safeHref('https://ffzg.unizg.hr')).toBe('https://ffzg.unizg.hr');
    expect(safeHref('http://x.hr/a')).toBe('http://x.hr/a');
    expect(safeHref('mailto:x@y.hr')).toBe('mailto:x@y.hr');
  });
  it('propusta relativne i sidrene putanje', () => {
    expect(safeHref('/upute.pdf')).toBe('/upute.pdf');
    expect(safeHref('#top')).toBe('#top');
  });
  it('svede javascript: i data: i vbscript: na #', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref(' JavaScript:alert(1)')).toBe('#');
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(safeHref('vbscript:msgbox(1)')).toBe('#');
  });
  it('prazan/undefined -> #', () => {
    expect(safeHref('')).toBe('#');
    expect(safeHref(undefined)).toBe('#');
  });
});
