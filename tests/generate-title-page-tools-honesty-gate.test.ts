/**
 * scripts/generate-title-page-tools.mjs: honesty-gate testovi (B5.4). Generator SMIJE
 * proizvesti staticku SEO stranicu SAMO za predloske s provenance.status==='official' (imamo
 * doslovan citat pravilnika). 'derived' (konsenzus javnih radova, sablonski tekst) i jedinice
 * bez ikakvog predloska NE smiju dobiti stranicu - eksplicitan regresijski test da se ovaj
 * gate ne raspadne tihom izmjenom filtra (isti princip kao "skip, ne noindex" u
 * generate-faculty-pages.mjs).
 */
import { describe, it, expect } from 'vitest';
import { selectOfficialPages } from '../scripts/generate-title-page-tools.mjs';
import rawTemplates from '../data/title-pages/templates.json';

describe('selectOfficialPages: sinteticki fixture', () => {
  const t = (id, unitId, level, status) => ({
    id, unitId, level, provenance: { status }, status: 'draft',
  });

  it('derived-only jedinica ne proizvodi nijednu stranicu', () => {
    const templates = [t('x-final', 'x', 'final', 'derived')];
    expect(selectOfficialPages(templates)).toEqual([]);
  });

  it('jedinica bez ijednog predloska (prazan niz) ne proizvodi nista', () => {
    expect(selectOfficialPages([])).toEqual([]);
  });

  it('mjesovita grupa (official + derived) uzima SAMO official zapise', () => {
    const templates = [
      t('x-final', 'x', 'final', 'official'),
      t('x-graduate', 'x', 'graduate', 'derived'),
    ];
    const result = selectOfficialPages(templates);
    expect(result).toHaveLength(1);
    expect(result[0].template.id).toBe('x-final');
  });

  it('jedinica s TOCNO JEDNIM official predloskom: disambiguate=false', () => {
    const templates = [t('y', 'y', null, 'official')];
    const result = selectOfficialPages(templates);
    expect(result).toEqual([{ template: templates[0], disambiguate: false }]);
  });

  it('jedinica s VISE official predlozaka (razlicite razine): disambiguate=true za SVAKI', () => {
    const templates = [
      t('z-final', 'z', 'final', 'official'),
      t('z-doctoral', 'z', 'doctoral', 'official'),
    ];
    const result = selectOfficialPages(templates);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.disambiguate === true)).toBe(true);
  });
});

describe('selectOfficialPages: nad stvarnim data/title-pages/templates.json', () => {
  const selected = selectOfficialPages(rawTemplates);

  it('svaki odabrani zapis ima provenance.status==="official" (nikad derived/generic)', () => {
    for (const { template } of selected) {
      expect(template.provenance.status, template.id).toBe('official');
    }
  });

  it('broj odabranih stranica odgovara broju official zapisa u sirovim podacima', () => {
    const officialCount = rawTemplates.filter((t) => t.provenance.status === 'official').length;
    expect(selected).toHaveLength(officialCount);
  });

  it('jedinice s vise official zapisa (razlicite razine) su SVE oznacene disambiguate=true', () => {
    const byUnit = new Map();
    for (const { template, disambiguate } of selected) {
      if (!byUnit.has(template.unitId)) byUnit.set(template.unitId, []);
      byUnit.get(template.unitId).push(disambiguate);
    }
    for (const [unitId, flags] of byUnit) {
      const expected = flags.length > 1;
      expect(flags.every((f) => f === expected), unitId).toBe(true);
    }
  });

  it('barem jedna jedinica ima vise od jednog official predloska (dokazuje disambiguate granu)', () => {
    const byUnit = new Map();
    for (const { template } of selected) byUnit.set(template.unitId, (byUnit.get(template.unitId) || 0) + 1);
    expect([...byUnit.values()].some((n) => n > 1)).toBe(true);
  });
});
