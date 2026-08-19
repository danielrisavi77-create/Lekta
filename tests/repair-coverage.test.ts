import { describe, expect, it } from 'vitest';
import { FIXER_IDS } from '../src/repair/apply-fixers';
import { repairEntriesFor , ensureRepairMapHeavy } from '../src/profiles/profile-runtime-maps';

// repair-map je lijen; ucitaj ga prije prvog repairEntriesFor u ovom modulu.
await ensureRepairMapHeavy();
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { REPAIR_TEMPLATES } from './helpers/repair-templates';
import { buildRepairCoverageMatrix, FIXER_TEMPLATE_MAP } from './helpers/repair-coverage';
import generatedReport from '../docs/generated/repair-coverage.json';

describe('repair coverage matrix', () => {
  const matrix = buildRepairCoverageMatrix();
  const templateIds = new Set(REPAIR_TEMPLATES.map((template) => template.id));
  const fixerIds = new Set(FIXER_IDS);

  it('covers every verified profile and preserves the offered-option count', () => {
    expect(matrix.profiles.map((profile) => profile.profileId)).toEqual(
      VERIFIED_PROFILE_REGISTRY.map((profile) => profile.id),
    );
    expect(matrix.profiles.length).toBe(VERIFIED_PROFILE_REGISTRY.length);

    for (const profile of matrix.profiles) {
      expect(matrix.rows.filter((row) => row.profileId === profile.profileId)).toHaveLength(profile.offeredOptionCount);
    }
    expect(matrix.rows.length).toBeGreaterThan(0);
  });

  it('has one unambiguous profile/rule row with a known fixer, check and template', () => {
    const keys = matrix.rows.map((row) => `${row.profileId}/${row.ruleId}`);
    expect(new Set(keys).size).toBe(keys.length);

    for (const row of matrix.rows) {
      expect(row.profileId).toBeTruthy();
      expect(row.ruleId).toBeTruthy();
      expect(row.checkId).toBeTruthy();
      expect(fixerIds.has(row.fixerId)).toBe(true);
      expect(templateIds.has(row.templateId)).toBe(true);

      const entry = repairEntriesFor(row.profileId).find((candidate) => candidate.ruleId === row.ruleId);
      expect(entry).toBeDefined();
      expect(entry?.checkId).toBe(row.checkId);
    }
  });

  it('maps every registered fixer to a reusable DOCX capability template', () => {
    expect(Object.keys(FIXER_TEMPLATE_MAP).sort()).toEqual([...FIXER_IDS].sort());
    for (const fixerId of FIXER_IDS) {
      expect(templateIds.has(FIXER_TEMPLATE_MAP[fixerId])).toBe(true);
    }
  });

  it('keeps the committed generated report synchronized with the matrix', () => {
    expect(generatedReport.profiles).toEqual(matrix.profiles);
    expect(generatedReport.rows).toEqual(matrix.rows);
    expect(generatedReport.surface).toEqual(matrix.surface);
    expect(generatedReport.fixerTemplateMap).toEqual(FIXER_TEMPLATE_MAP);
    expect(generatedReport.templateInventory.map((template) => template.id)).toEqual([...templateIds]);
  });

  it('razdvaja profilne, UI-asistirane i pomoćne fixere bez mrtvih registriranih putanja', () => {
    expect(matrix.surface.map((entry) => entry.fixerId)).toEqual([...FIXER_IDS]);
    expect(matrix.surface.filter((entry) => entry.kind === 'profile')).toHaveLength(5);
    expect(matrix.surface.filter((entry) => entry.kind === 'ui-assisted')).toHaveLength(25);
    expect(matrix.surface.filter((entry) => entry.kind === 'dispatch-only')).toEqual([
      expect.objectContaining({ fixerId: 'footer-page-fixer', entryPoint: 'applyFixers' }),
    ]);

    const profileFixers = new Set(matrix.rows.map((row) => row.fixerId));
    for (const entry of matrix.surface) {
      if (entry.kind === 'profile') expect(profileFixers.has(entry.fixerId)).toBe(true);
      if (entry.kind === 'dispatch-only') expect(profileFixers.has(entry.fixerId)).toBe(false);
      expect(entry.entryPoint).toBeTruthy();
      expect(entry.note).toBeTruthy();
    }
  });
});
