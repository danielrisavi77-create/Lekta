/**
 * Gard nad DOSLOVNIM obrascima izjave izvucenim iz snapshota (P6-3).
 *
 * Ovo je tekst koji student POTPISUJE, pa kvaliteta prijepisa nije kozmetika. Ekstraktor
 * (`scripts/extract_declarations.py`) odbacuje pokvaren tekstualni sloj, a ovdje se cuva da takav
 * tekst ne moze uci u podatke ni zaobilazno.
 */
import { describe, expect, it } from 'vitest';
import declarations from '../data/declarations/declarations.json';
import sourceRegistry from '../data/sources/source-registry.json';
import type { DeclarationTemplate } from '../src/declarations/declaration-schema';

const templates = declarations as unknown as DeclarationTemplate[];
const official = templates.filter((t) => t.provenance.status === 'official');
const sourceIds = new Set((sourceRegistry as Array<{ id: string }>).map((s) => s.id));

describe('doslovni obrasci izjave', () => {
  it('postoji barem jedan (inace je gard vakuuman)', () => {
    expect(official.length).toBeGreaterThan(0);
  });

  /**
   * Bez ijednog dijakritickog znaka tekst je gotovo sigurno izgubio kodiranje. Za izjavu koja nosi
   * ime i prezime studenta to nije sitnica.
   */
  it('svaki nosi hrvatsku dijakritiku', () => {
    for (const t of official) {
      expect(t.wording ?? '', `${t.id}: bez dijakritike`).toMatch(/[čćžšđČĆŽŠĐ]/);
    }
  });

  /** "Sveudili5ta" - znamenka unutar rijeci je potpis pokvarenog tekstualnog sloja. */
  it('nijedan nema znamenku unutar rijeci', () => {
    for (const t of official) {
      expect(t.wording ?? '', `${t.id}: tragovi pokvarenog sloja`).not.toMatch(/[A-Za-zčćžšđ][0-9][A-Za-zčćžšđ]/);
    }
  });

  it('svaki je sljediv do registriranog izvora i stranice', () => {
    for (const t of official) {
      expect(t.provenance.sourceIds?.length, `${t.id}: bez sourceIds`).toBeGreaterThan(0);
      for (const sid of t.provenance.sourceIds ?? []) expect(sourceIds.has(sid), `${t.id}: ${sid}`).toBe(true);
      expect(t.provenance.sourcePage, `${t.id}: bez stranice`).toBeGreaterThan(0);
    }
  });

  /**
   * AI ne proglasava verified. `provenance: official` govori odakle tekst dolazi; `status: draft`
   * govori da vjernost PRIJEPISA jos nitko nije potvrdio (PDF u dva stupca zna izmijesati retke).
   */
  it('nijedan jos nije proglasen verificiranim', () => {
    for (const t of official) expect(t.status, `${t.id}`).toBe('draft');
  });

  it('guidance zapisi i dalje NE nose tekst', () => {
    for (const t of templates.filter((x) => x.provenance.status === 'guidance')) {
      expect(t.wording ?? '', `${t.id}: guidance s tekstom`).toBe('');
    }
  });
});
