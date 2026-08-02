import { describe, expect, it } from 'vitest';
import { readZip } from '../src/repair/zip-codec';
import { buildRepairTemplate, REPAIR_TEMPLATES } from './helpers/repair-templates';

describe('Repair Engine capability predlosci', () => {
  it('svaki predlozak je jedinstven, otvara se kao ZIP i sadrzi svoje markere', async () => {
    expect(new Set(REPAIR_TEMPLATES.map((template) => template.id)).size).toBe(REPAIR_TEMPLATES.length);
    expect(REPAIR_TEMPLATES).toHaveLength(8);

    for (const template of REPAIR_TEMPLATES) {
      const bytes = await buildRepairTemplate(template.id);
      const entries = await readZip(bytes);
      const byName = new Map(entries.map((entry) => [entry.name, new TextDecoder().decode(entry.data)]));

      for (const entryName of template.requiredEntries) {
        expect(byName.has(entryName), `${template.id}: nedostaje ${entryName}`).toBe(true);
      }
      for (const [entryName, markers] of Object.entries(template.requiredMarkers)) {
        const content = byName.get(entryName);
        expect(content, `${template.id}: nema sadrzaja za ${entryName}`).toBeDefined();
        for (const marker of markers) expect(content, `${template.id}: ${entryName} nema marker ${marker}`).toContain(marker);
      }
    }
  });
});
