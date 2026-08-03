/**
 * Drift-guard za javni benchmark (landing_benchmark.html, P2a): pokreni pravi analyzeFixture
 * nad commitanom public/benchmark/lekta-benchmark-v1.docx i provjeri da stvaran broj
 * pronadjenih seeded gresaka i dalje odgovara katalogu (data/benchmark/lekta-benchmark-v1.json)
 * i literalnom "X/N" tekstu objavljenom na stranici. Ako promjena parsera/audita tiho pomakne
 * benchmark rezultat, ovaj test pada dok se katalog i stranica ne osvjeze (npm run generate-benchmark-fixture).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeFixture } from '../src/analysis/golden-entry';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCX_PATH = join(root, 'public', 'benchmark', 'lekta-benchmark-v1.docx');
const CATALOGUE_PATH = join(root, 'data', 'benchmark', 'lekta-benchmark-v1.json');
const PAGE_PATH = join(root, 'landing_benchmark.html');

interface CatalogueItem {
  id: string;
  checkId: string;
  titleMatch: string;
  description: string;
}
interface Catalogue {
  version: number;
  profileId: string;
  found: number;
  total: number;
  items: CatalogueItem[];
  detected: Record<string, boolean>;
}

describe.skipIf(!existsSync(DOCX_PATH) || !existsSync(CATALOGUE_PATH))('javni benchmark fixture', () => {
  const catalogue: Catalogue = JSON.parse(readFileSync(CATALOGUE_PATH, 'utf8'));

  it('katalog i fixture postoje i katalog nije prazan', () => {
    expect(catalogue.items.length).toBeGreaterThan(0);
    expect(catalogue.total).toBe(catalogue.items.length);
  });

  it('stvaran rezultat pokretanja analyzeFixture i dalje odgovara commitanom katalogu', async () => {
    const bytes = readFileSync(DOCX_PATH);
    const file = new File([bytes], 'lekta-benchmark-v1.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result: any = await analyzeFixture(file, { profileId: catalogue.profileId });
    const checks: any[] = Array.isArray(result.checks) ? result.checks : [];

    let found = 0;
    for (const item of catalogue.items) {
      const c = checks.find((x) => x.scored && typeof x.title === 'string' && x.title.includes(item.titleMatch));
      const isFail = !!c && c.earned < c.max;
      expect(isFail, `checkId "${item.checkId}" (naslov "${item.titleMatch}") ocekivano detektiran=${catalogue.detected[item.checkId]}`).toBe(
        catalogue.detected[item.checkId],
      );
      if (isFail) found++;
    }
    expect(found).toBe(catalogue.found);
  });

  it('landing_benchmark.html objavljuje isti "X/N" rezultat kao katalog', () => {
    const html = readFileSync(PAGE_PATH, 'utf8');
    expect(html).toContain(`${catalogue.found}/${catalogue.total}`);
  });
});
