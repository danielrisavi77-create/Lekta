/**
 * Faza 2 (Lekta Error Corpus): stabilni ID-evi pokrivaju SVE provjere, jedinstveni su i
 * dobro oblikovani, a registar nema mrtvih unosa. Ovime korpus testovi mogu keyati po
 * jezicno-neovisnom ID-u umjesto po hrvatskom naslovu (koji se moze preformulirati).
 *
 * Dvostruko pokrivanje: (1) commitani PUNI artefakt (uklj. dinamicke naslove) - iscrpno;
 * (2) mali ZIVI build - tripwire koji odmah uhvati novu provjeru s literalnim naslovom
 * (staticki scan je hvata neovisno o uzorku profila), bez cekanja regeneracije artefakta.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory, type Inventory } from './corpus/inventory/extract-check-inventory';
import { CHECK_ID_BY_TITLE, stableCheckId, isWellFormedCheckId, allCheckIds } from './corpus/ids/check-id-registry';

const artifactPath = resolve(dirname(fileURLToPath(import.meta.url)), 'corpus/generated/current-check-inventory.json');
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Inventory;
const artifactTitles = artifact.checks.map((c) => c.title);

describe('Lekta Error Corpus - stabilni ID-evi provjera (faza 2)', () => {
  let liveTitles: string[];
  beforeAll(async () => {
    const inv = await buildInventory({ sampleLimit: 6 });
    liveTitles = inv.checks.map((c) => c.title);
  }, 30000);

  it('svi ID-evi su jedinstveni', () => {
    const ids = allCheckIds();
    expect(new Set(ids).size, 'duplikat stabilnog ID-a u registru').toBe(ids.length);
  });

  it('svi ID-evi su dobro oblikovani (hijerarhijski, kebab, jezicno-neovisni)', () => {
    for (const [title, id] of Object.entries(CHECK_ID_BY_TITLE)) {
      expect(isWellFormedCheckId(id), `los oblik ID-a "${id}" za "${title}"`).toBe(true);
    }
  });

  it('svaka provjera iz commitanog artefakta ima stabilni ID', () => {
    const missing = artifactTitles.filter((t) => !stableCheckId(t));
    expect(missing, `provjere bez stabilnog ID-a: ${missing.join(', ')}`).toEqual([]);
  });

  it('svaka provjera iz zivog builda ima stabilni ID (tripwire za nove literalne provjere)', () => {
    const missing = liveTitles.filter((t) => !stableCheckId(t));
    expect(missing, `nova provjera bez stabilnog ID-a: ${missing.join(', ')}`).toEqual([]);
  });

  it('registar nema mrtvih unosa (svaki naslov postoji u artefaktu)', () => {
    const known = new Set(artifactTitles);
    const dead = Object.keys(CHECK_ID_BY_TITLE).filter((t) => !known.has(t));
    expect(dead, `registar mapira nepostojeci naslov: ${dead.join(', ')}`).toEqual([]);
  });
});
