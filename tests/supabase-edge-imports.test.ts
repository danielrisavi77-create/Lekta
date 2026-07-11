import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// P0-02b (dependencies-01): svih 8 Edge funkcija je uvozilo @supabase/supabase-js s
// golim majorom (esm.sh/@supabase/supabase-js@2), bez pina, pa je kod na kojem stoje
// create-checkout i webhook-mor (service_role, potpis kupnje) drift-ao svaki deploy i
// dohvacao se s trece strane bez reproducibilnosti. Ovaj guard pada ako ijedan Edge
// import nije EKSAKTNO pinan (x.y.z) i tako sprjecava povratak golog @2.

const FUNCTIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

// Uhvati verzijski specifikator iz esm.sh URL-a bilo kojeg paketa.
const ESM_IMPORT = /esm\.sh\/(@[^/'"\s]+\/[^@'"\s]+|[^@/'"\s]+)@([^'"\s?]+)/g;
const EXACT_SEMVER = /^\d+\.\d+\.\d+$/;

describe('supabase Edge importi su eksaktno pinani (dependencies-01)', () => {
  const files = collectTsFiles(FUNCTIONS_DIR);

  it('nalazi Edge TypeScript datoteke (sanity)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('svaki esm.sh import ima eksaktnu verziju (x.y.z), nijedan goli major', () => {
    const offenders: string[] = [];
    let importCount = 0;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(ESM_IMPORT)) {
        importCount++;
        const [, pkg, version] = m;
        if (!EXACT_SEMVER.test(version)) {
          const rel = file.replace(FUNCTIONS_DIR, 'supabase/functions').replace(/\\/g, '/');
          offenders.push(`${rel}: ${pkg}@${version}`);
        }
      }
    }
    // Barem supabase-js importi moraju postojati; ako je 0, glob je puknuo.
    expect(importCount).toBeGreaterThan(0);
    expect(offenders, `Nepinan(i) esm.sh import(i):\n${offenders.join('\n')}`).toEqual([]);
  });
});
