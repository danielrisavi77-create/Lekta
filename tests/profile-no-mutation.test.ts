/**
 * Faza D: analiza NE SMIJE mutirati ulazni profil. Povijesno je analyzeDocx pisao
 * profile._scopedWords/_scopedChars/_scopeLabel (bocni efekt evaluacije opsega) pa
 * analiza nije bila idempotentna nad profilom i cista evaluate funkcija nije bila
 * moguca. Sada je opseg lokalno stanje; ovaj test cuva da se mutacija ne vrati.
 *
 * PROTIV VAKUUMA: profil se predaje kroz opts.profile pa se tvrdi nad TOCNO onim
 * objektom koji analiza koristi (resolveProfile klonira, pa bi probe bez overridea
 * bio drugi objekt i test ne bi grizao).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';

const FIXTURES = resolve(__dirname, 'fixtures', 'docx');
const files = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((f) => f.endsWith('.docx')) : [];

function profileIdFor(name: string): string | null {
  const metaPath = resolve(FIXTURES, name.replace(/\.docx$/, '.json'));
  if (!existsSync(metaPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { profileId?: string };
  return meta.profileId ?? null;
}

const sample = files
  .map((name) => ({ name, profileId: profileIdFor(name) }))
  .filter((f): f is { name: string; profileId: string } => !!f.profileId)
  .slice(0, 2);

describe.skipIf(!sample.length)('analiza ne mutira profil', () => {
  for (const { name, profileId } of sample) {
    it(`${name}: analizirani profil identican prije i poslije`, async () => {
      const probe = resolveProfile(profileId);
      const keysBefore = Object.keys(probe).sort().join('|');
      const snapshotBefore = JSON.stringify(probe);

      const buf = readFileSync(resolve(FIXTURES, name));
      await analyzeFixture(new File([buf], name), { profileId, profile: probe });

      expect(Object.keys(probe).sort().join('|'), 'analiza je dodala kljuceve na profil').toBe(keysBefore);
      expect(JSON.stringify(probe), 'analiza je promijenila vrijednosti profila').toBe(snapshotBefore);
    }, 120000);
  }
});
