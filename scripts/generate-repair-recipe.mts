/**
 * CLI: zapisi pisani recept popravka (docs/REPAIR_RECIPE.md + docs/generated/repair-recipe.json).
 *
 *   npx vite-node scripts/generate-repair-recipe.mts
 *   npm run repair-recipe
 *
 * Sva logika je u src/repair/recipe.ts (tipizirana, dijeljena s tests/repair-recipe.test.ts, koji
 * pada ako se profili promijene bez regeneriranja). vite-node jer provenijencija dolazi iz draftova
 * preko import.meta.glob, sto obican Node ne razrjesava.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRecipe, renderRecipeMarkdown, hasProfileRules } from '../src/repair/recipe';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const recipe = buildRecipe();
mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(join(root, 'docs', 'generated', 'repair-recipe.json'), JSON.stringify(recipe, null, 2) + '\n');
writeFileSync(join(root, 'docs', 'REPAIR_RECIPE.md'), renderRecipeMarkdown(recipe));

const totalItems = recipe.reduce((n, p) => n + p.items.length, 0);
console.log('=== Recept popravka ===');
// "s popravkom" broji SAMO profile s pravilom iz sluzbene upute: univerzalnu higijenu (prazni
// odlomci) dobiva svaki profil, pa bi ukupan broj bio tocan a bezvrijedan.
console.log(`profila: ${recipe.length}, po uputi fakulteta: ${recipe.filter(hasProfileRules).length}, stavki: ${totalItems}`);
console.log('zapisano: docs/REPAIR_RECIPE.md, docs/generated/repair-recipe.json');
