/**
 * Popis autorskih draftova (`data/profiles/<unit>/drafts/*.json`), bez `globSync`.
 *
 * Zasto ne `globSync`: `node:fs.globSync` postoji tek od Node 22, a `package.json` deklarira
 * `{"node":">=20"}` i CI vrti matricu 20 i 24. Grana 20 je zato padala na
 * `tests/profile-rules-server.test.ts`, dok se lokalno nije vidjelo nista, jer je razvojni stroj na
 * Node 24. Kod je time obecavao podrsku koju nije ispunjavao.
 *
 * Zasto ZAJEDNICKI modul a ne dvije izvedbe: generator i njegov drift test MORAJU citati isti skup.
 * Komentar u testu to izricito trazi ("kad bi test gradio bez njih, drift bi prijavio razliku koje
 * nema i tjerao na regeneraciju koja bi dokaze IZBRISALA iz artefakta"). Dvije kopije istog obilaska
 * su tocno oblik koji s vremenom odluta.
 *
 * Vraca REPO-RELATIVNE staze s `/` kao razdjelnikom i sortirane, dakle identicno onome sto je
 * `globSync(..., { cwd: ROOT })` davao; provjereno usporedbom obaju popisa na Node 24.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function draftFilePaths(root: string): string[] {
  const profilesDir = join(root, 'data', 'profiles');
  if (!existsSync(profilesDir)) return [];
  const out: string[] = [];
  for (const unit of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!unit.isDirectory()) continue;
    const draftsDir = join(profilesDir, unit.name, 'drafts');
    if (!existsSync(draftsDir)) continue;
    for (const file of readdirSync(draftsDir, { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.json')) {
        out.push(`data/profiles/${unit.name}/drafts/${file.name}`);
      }
    }
  }
  return out.sort();
}
