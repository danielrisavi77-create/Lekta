/**
 * Gard nad obilaskom draftova koji DIJELE generator i njegov drift test.
 *
 * Zasto postoji: `scripts/draft-files.mts` je zajednicki, pa greska u njemu pogadja OBJE strane
 * drift usporedbe jednako i drift je po konstrukciji ne vidi. Druga sesija je taj rizik s pravom
 * istaknula kao argument za dvije kopije obilaska.
 *
 * Dvije kopije ga ne rjesavaju: kopiran kod nosi ISTU gresku na obje strane, pa daje jednaku
 * sljepocu, a povrh toga uvodi rizik da kopije s vremenom odlutaju. Unakrsna provjera vrijedi samo
 * kad dolazi od DRUGOG alata, sto je pravilo ovog repozitorija; dvije kopije istog obilaska nisu
 * drugi alat.
 *
 * Zato se rizik pokriva izravno, ovdje: obilazak se mjeri protiv svojstava koja greska u njemu ne
 * moze zadovoljiti. Najopasniji kvar takvog obilaska je da tiho vrati PRAZAN ili okrnjen skup, jer
 * bi tada i generator i test racunali nad nicim i slozili se.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { draftFilePaths } from '../scripts/draft-files';

const ROOT = resolve(__dirname, '..');

describe('obilazak draftova', () => {
  it('ne vraca prazan skup', () => {
    expect(draftFilePaths(ROOT).length, 'prazan popis bi obje strane drifta ucinio slijepima').toBeGreaterThan(0);
  });

  /** Ratchet: broj draftova moze rasti, ali tihi PAD znaci da obilazak gubi datoteke. */
  it('vraca barem zateceni broj draftova', () => {
    expect(draftFilePaths(ROOT).length).toBeGreaterThanOrEqual(300);
  });

  it('svaka vracena staza stvarno postoji', () => {
    const nepostojece = draftFilePaths(ROOT).filter((p) => !existsSync(join(ROOT, p)));
    expect(nepostojece).toEqual([]);
  });

  it('popis je sortiran i bez duplikata', () => {
    const p = draftFilePaths(ROOT);
    expect(p).toEqual([...p].sort());
    expect(p.length).toBe(new Set(p).size);
  });

  /**
   * NEOVISNA PROTUMJERA: skup se prebroji drugim putem (rucno, po direktorijima), pa se usporede
   * BROJEVI. Ovo je jedina tvrdnja koja stvarno hvata gresku u samom obilasku, jer ne koristi njega.
   */
  it('broj se slaze s neovisnim prebrojavanjem', () => {
    const profiles = join(ROOT, 'data', 'profiles');
    let ocekivano = 0;
    for (const unit of readdirSync(profiles, { withFileTypes: true })) {
      if (!unit.isDirectory()) continue;
      const drafts = join(profiles, unit.name, 'drafts');
      if (!existsSync(drafts)) continue;
      ocekivano += readdirSync(drafts).filter((f) => f.endsWith('.json')).length;
    }
    expect(draftFilePaths(ROOT).length).toBe(ocekivano);
  });
});
