#!/usr/bin/env node
/**
 * Build-time generator LAGANOG indeksa predlozaka naslovnice (perf: skini ~0,5 MB s
 * naslovnica-*.js glavnog chunka).
 *
 * data/title-pages/templates.json (198 predlozaka, pun sadrzaj: elements, marginsCm,
 * derivation, puna provenijencija...) se staticki uvozi u src/title-pages/template-loader.ts.
 * resolveTemplate() u svakom trenutku koristi TOCNO JEDAN predlozak (ili nijedan); preostalih
 * ~197 je mrtav teret na svakom posjetu naslovnica.html, prije nego korisnik dotakne kaskadni
 * izbornik. Ova skripta dijeli izvor na:
 *   - data/title-pages/templates-index.json : LAGANI indeks (id, unitId, level, name,
 *       provenance.status, status) koji renderCoverageCount()/populateUnits() citaju PRIJE
 *       odabira. Eager, ~198 malih objekata.
 *   - data/title-pages/templates-heavy.json : { id -> PUN predlozak }. Lijeno (dynamic import)
 *       ucitan preko ensureTemplatesHeavy() u template-loader.ts, spojen u light zapise
 *       (mutacija in-place), isti obrazac kao gen-verified-split.mjs (profile-registry).
 *
 * Izvor istine ostaje templates.json. Drift + korektnost hvata tests/title-page-loader.test.ts
 * (regeneriraj pa commitaj: node scripts/gen-title-page-split.mjs).
 *
 * Pokreni:  node scripts/gen-title-page-split.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'data/title-pages/templates.json'), 'utf8'));

/** Lagani indeks: samo polja koja renderCoverageCount/UI citaju prije stvarnog odabira predloska. */
function lightEntry(t) {
  return {
    id: t.id,
    unitId: t.unitId,
    level: t.level,
    name: t.name,
    provenance: { status: t.provenance.status },
    status: t.status,
  };
}

const index = src.map(lightEntry);
const heavy = {};
for (const t of src) heavy[t.id] = t;

writeFileSync(join(root, 'data/title-pages/templates-index.json'), JSON.stringify(index, null, 2) + '\n');
writeFileSync(join(root, 'data/title-pages/templates-heavy.json'), JSON.stringify(heavy, null, 2) + '\n');
console.log(`templates-index.json: ${index.length} predlozaka (light); templates-heavy.json: ${Object.keys(heavy).length} predlozaka (heavy).`);
