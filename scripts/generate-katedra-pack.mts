/**
 * scripts/generate-katedra-pack.mts - generira dist-packs/katedra-pack.json (+ .min.json).
 *
 * Izlaz je jednosmjeran, informativni izvoz Lektinih verificiranih profila za sestrinski
 * proizvod Katedru (vidi CLAUDE.md "Lekta nikad ne generira niti ne prepravlja sadrzaj rada").
 * Logika je u src/integrations/katedra-pack.ts (cista funkcija) da je tests/katedra-pack.test.ts
 * moze pozvati bez duplicirane logike; ovaj fajl samo skuplja izvore i pise na disk.
 *
 * Pokreni:  npm run pack:katedra   (vite-node, jer VERIFIED_PROFILES_WITH_DRAFTS dolazi
 * preko import.meta.glob nad draft datotekama; obican Node to ne razrjesava.)
 * Drift izmedu commitanog pack-a i izvora hvata tests/katedra-pack.test.ts.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { ZAGREB_CATALOG } from '../src/catalog/catalog-loader';
import { buildKatedraPack } from '../src/integrations/katedra-pack';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const statusLabels = JSON.parse(readFileSync(join(root, 'data/profiles/profile-status.json'), 'utf8'));

const pack = buildKatedraPack(VERIFIED_PROFILES_WITH_DRAFTS, ZAGREB_CATALOG, statusLabels);

const outDir = join(root, 'dist-packs');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'katedra-pack.json'), JSON.stringify(pack, null, 1) + '\n');
writeFileSync(join(outDir, 'katedra-pack.min.json'), JSON.stringify(pack));

const kb = (name: string) => Math.round(readFileSync(join(outDir, name)).length / 1024);
console.log(`katedra-pack: ${pack.meta.counts.profiles} profila, ${pack.meta.counts.units} unita`);
console.log(`  dist-packs/katedra-pack.json      ${kb('katedra-pack.json')} KB`);
console.log(`  dist-packs/katedra-pack.min.json  ${kb('katedra-pack.min.json')} KB`);
