/** CLI: generira pregled pokrivenosti profila, pravila, fixera i DOCX predlozaka. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRepairCoverageMatrix } from '../tests/helpers/repair-coverage';
import { FIXER_IDS } from '../src/repair/apply-fixers';
import { REPAIR_TEMPLATES } from '../tests/helpers/repair-templates';
import { FIXER_TEMPLATE_MAP } from '../tests/helpers/repair-coverage';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const matrix = buildRepairCoverageMatrix();
const report = {
  schemaVersion: 1,
  profiles: matrix.profiles,
  rows: matrix.rows,
  surface: matrix.surface,
  fixerTemplateMap: Object.fromEntries(FIXER_IDS.map((fixerId) => [fixerId, FIXER_TEMPLATE_MAP[fixerId]])),
  templateInventory: REPAIR_TEMPLATES.map(({ id, description, requiredEntries, requiredMarkers }) => ({
    id,
    description,
    requiredEntries,
    requiredMarkers,
  })),
  summary: {
    profileCount: matrix.profiles.length,
    profileOptionCount: matrix.profiles.reduce((total, profile) => total + profile.offeredOptionCount, 0),
    rowCount: matrix.rows.length,
    fixerCount: new Set(matrix.rows.map((row) => row.fixerId)).size,
    registeredFixerCount: FIXER_IDS.length,
    profileFixerCount: matrix.surface.filter((entry) => entry.kind === 'profile').length,
    uiAssistedFixerCount: matrix.surface.filter((entry) => entry.kind === 'ui-assisted').length,
    dispatchOnlyFixerCount: matrix.surface.filter((entry) => entry.kind === 'dispatch-only').length,
    templateCount: REPAIR_TEMPLATES.length,
    usedTemplateCount: new Set(matrix.rows.map((row) => row.templateId)).size,
  },
};

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(join(root, 'docs', 'generated', 'repair-coverage.json'), JSON.stringify(report, null, 2) + '\n');

console.log('=== Pokrivenost popravaka ===');
console.log(`profila: ${report.summary.profileCount}, opcija: ${report.summary.profileOptionCount}, redaka: ${report.summary.rowCount}`);
console.log(`fixera u profilima: ${report.summary.fixerCount}, UI-asistiranih: ${report.summary.uiAssistedFixerCount}, dispatch-only: ${report.summary.dispatchOnlyFixerCount}`);
console.log(`registriranih: ${report.summary.registeredFixerCount}, predlozaka u inventaru: ${report.summary.templateCount}, koristenih: ${report.summary.usedTemplateCount}`);
console.log('zapisano: docs/generated/repair-coverage.json');
