import { resolveProfile } from '../../src/analysis/golden-entry';
import { FIXER_IDS, type FixerId } from '../../src/repair/apply-fixers';
import { repairEntriesFor } from '../../src/profiles/profile-runtime-maps';
import { VERIFIED_PROFILE_REGISTRY } from '../../src/profiles/profile-registry';
import { buildRepairableItems } from '../../src/ui/repair-items';
import { repairSurfaceInventory } from '../../src/repair/repair-surface';
import type { RepairTemplateId } from './repair-templates';

export interface RepairCoverageRow {
  profileId: string;
  ruleId: string;
  fixerId: FixerId;
  checkId: string;
  templateId: RepairTemplateId;
  recommended: boolean;
}

export interface RepairProfileCoverage {
  profileId: string;
  offeredOptionCount: number;
}

export interface RepairCoverageMatrix {
  profiles: RepairProfileCoverage[];
  rows: RepairCoverageRow[];
  surface: ReturnType<typeof repairSurfaceInventory>;
}

/** Jedini mapirni sloj izmedju sposobnosti fixera i reusable DOCX predloska. */
export const FIXER_TEMPLATE_MAP: Readonly<Record<FixerId, RepairTemplateId>> = {
  'margins-fixer': 'basic-text-styles',
  'paper-size-fixer': 'basic-text-styles',
  'font-fixer': 'basic-text-styles',
  'line-spacing-fixer': 'basic-text-styles',
  'alignment-fixer': 'basic-text-styles',
  'paragraph-spacing-fixer': 'basic-text-styles',
  'page-numbering-fixer': 'title-page-sections',
  'footer-page-fixer': 'title-page-sections',
  'section-insert-fixer': 'title-page-sections',
  'empty-paragraph-fixer': 'basic-text-styles',
  'footnote-spacing-fixer': 'footnotes-legal-citations',
  'page-number-alignment-fixer': 'title-page-sections',
  'toc-field-fixer': 'fields-toc',
  'heading-format-fixer': 'headings-numbering',
  'heading-style-fixer': 'headings-numbering',
  'title-page-fixer': 'title-page-sections',
  'footnote-typography-fixer': 'footnotes-legal-citations',
  'heading-case-fixer': 'headings-numbering',
  'element-caption-fixer': 'tables-images',
  'bibliography-repair-fixer': 'bibliography-citations',
  'citation-bibliography-sync-fixer': 'bibliography-citations',
  'legal-footnote-repair-fixer': 'footnotes-legal-citations',
  'final-document-inspector-fixer': 'fields-toc',
  'table-figure-rescue-fixer': 'tables-images',
  'section-surgery-fixer': 'title-page-sections',
  'field-integrity-fixer': 'fields-toc',
  'croatian-typography-fixer': 'basic-text-styles',
  'consistency-fixer': 'basic-text-styles',
  'required-section-fixer': 'headings-numbering',
  'link-doi-fixer': 'links-doi',
  'submission-metadata-fixer': 'basic-text-styles',
};

function isKnownFixer(value: string): value is FixerId {
  return (FIXER_IDS as readonly string[]).includes(value);
}

/**
 * Gradi matricu iz istih runtime zapisa i iste funkcije koju koristi Repair UI.
 * Ako se promijeni ponuda u profile-runtime-maps ili params u repair-items.ts,
 * matrica se automatski promijeni zajedno s njom.
 */
export function buildRepairCoverageMatrix(): RepairCoverageMatrix {
  const profiles: RepairProfileCoverage[] = [];
  const rows: RepairCoverageRow[] = [];

  for (const profile of VERIFIED_PROFILE_REGISTRY) {
    const runtimeEntries = repairEntriesFor(profile.id);
    const items = buildRepairableItems([], resolveProfile(profile.id), runtimeEntries, { includeNonViolated: true });
    profiles.push({ profileId: profile.id, offeredOptionCount: items.length });

    for (const item of items) {
      const entry = runtimeEntries.find((candidate) => candidate.ruleId === item.ruleId);
      if (!entry || !entry.checkId || !isKnownFixer(item.fixerId)) continue;
      const templateId = FIXER_TEMPLATE_MAP[item.fixerId];
      if (!templateId) {
        throw new Error(`Nedostaje DOCX predlozak za fixer ${item.fixerId}`);
      }
      rows.push({
        profileId: profile.id,
        ruleId: item.ruleId,
        fixerId: item.fixerId,
        checkId: entry.checkId,
        templateId,
        recommended: item.recommended === true,
      });
    }
  }

  return { profiles, rows, surface: repairSurfaceInventory() };
}
