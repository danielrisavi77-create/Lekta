/**
 * Jednokratna migracija (Faza C.5, reconcile seeda): izvuci inline `ruleEntries` iz
 * pravnih profila u staging datoteku data/profiles/pravo/drafts/law-drafts.json i
 * ukloni ih iz verified-profiles.json i legal-departments.json.
 *
 * Zasto: jedan dom za nacrte (bez dvostrukog odrzavanja, CLAUDE.md). Zivi engine ne
 * cita ruleEntries (cita rules/effectiveRules), pa uklanjanje iz profila ne mijenja
 * ponasanje ni golden snapshote. Verifikacijski moduli citaju staging preko
 * profile-registry.ts (WITH_DRAFTS pogled). Idempotentno: ako profil vec nema
 * ruleEntries, preskace ga (staging ostaje izvor istine).
 *
 * Pokretanje: node scripts/migrate-drafts-to-staging.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);

const verified = JSON.parse(readFileSync(p('data/profiles/verified-profiles.json'), 'utf8'));
const legal = JSON.parse(readFileSync(p('data/profiles/legal-departments.json'), 'utf8'));

const profiles = {};
let stripped = 0;

function harvest(list) {
  for (const item of list) {
    if (Array.isArray(item.ruleEntries) && item.ruleEntries.length) {
      profiles[item.id] = item.ruleEntries;
      delete item.ruleEntries;
      stripped++;
    }
  }
}

harvest(verified);
harvest(legal);

const draftsFile = {
  generatedAt: '2026-06-30',
  source: 'seed-law-drafts (Faza C); izvuceno iz inline profila u Fazi C.5',
  note:
    'Staging nacrti pravnih profila. Svi su status draft/advisory i scored:false dok ih covjek ne verificira kroz verifikacijsku konzolu. Promocija u profil ide tek nakon verifikacije.',
  profiles,
};

writeFileSync(
  p('data/profiles/pravo/drafts/law-drafts.json'),
  JSON.stringify(draftsFile, null, 2) + '\n',
);
writeFileSync(p('data/profiles/verified-profiles.json'), JSON.stringify(verified, null, 2) + '\n');
writeFileSync(p('data/profiles/legal-departments.json'), JSON.stringify(legal, null, 2) + '\n');

const ruleCount = Object.values(profiles).reduce((n, e) => n + e.length, 0);
console.log(
  `Migracija gotova: ${stripped} profila premjesteno u staging, ${Object.keys(profiles).length} kljuceva, ${ruleCount} pravila.`,
);
