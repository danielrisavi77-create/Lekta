/**
 * Gard za P0-4 (docs/PLAN_POTPUNA_POKRIVENOST.md): javna tvrdnja o pokrivenosti mora se IZVODITI
 * iz completion ledgera, a ne nastajati u generatoru stranice.
 *
 * Zasto: `pokrivenost.html` je do sada imala vlastitu ljestvicu od cetiri razine, racunatu samo iz
 * udjela bodovanih pravila. Najvisa se zvala "Potpuno pokriveno", a dodjeljivala se profilu kojemu
 * automatski popravak nikad nije pokrenut ni na jednom dokumentu. Dvije ljestvice nad istim
 * podatkom, od kojih jaca ne zna za dokaz, upravo su nacin na koji marketinski tekst prestigne
 * ono sto je dokazano.
 *
 * Test ne provjerava izgled stranice nego LANAC: generator smije tvrdnju samo PREPISATI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLAIM_LADDER, type ClaimLevel } from '../src/verification/completion-ledger';
import ledger from '../docs/generated/completion-ledger.json';

const GENERATOR = 'scripts/generate-coverage-page.mjs';
const source = readFileSync(resolve(process.cwd(), GENERATOR), 'utf8');

describe('stranica pokrivenosti: tvrdnja dolazi iz ledgera', () => {
  it('svaki redak ledgera nosi doslovnu formulaciju svoje razine', () => {
    for (const row of ledger.rows) {
      expect(row.claimLabel, `${row.profileId}: claimLabel ne odgovara razini ${row.claim}`).toBe(
        CLAIM_LADDER[row.claim as ClaimLevel],
      );
    }
  });

  it('generator cita ledger', () => {
    expect(source).toContain('docs/generated/completion-ledger.json');
    expect(source).toContain('claimLabel');
  });

  /**
   * Srz garda: nijedna formulacija razine ne smije postojati kao literal u generatoru. Da smije,
   * copy bi se mogao mijenjati bez prolaska kroz ijednu os ledgera - tocno ono sto P0-4 sprjecava.
   */
  it('nijedna formulacija razine nije hardkodirana u generatoru', () => {
    for (const [level, label] of Object.entries(CLAIM_LADDER)) {
      expect(source, `razina ${level} je prepisana u generator umjesto da se cita iz ledgera`).not.toContain(label);
    }
  });

  it('najjaca oznaka pokrivenosti vise ne tvrdi dovrsenost', () => {
    // "Potpuno pokriveno" je znacilo samo "sva pravila bodovana"; naziv je citan kao "gotovo".
    expect(source).not.toContain('Potpuno pokriveno');
    expect(source).toContain('Sva pravila bodovana');
  });

  it('generirana stranica ne sadrzi tvrdnju koje nema u ledgeru', () => {
    const built = resolve(process.cwd(), 'dist/pokrivenost.html');
    if (!existsSync(built)) return; // stranica se gradi tek nakon `vite build`; suite se sam preskace
    const html = readFileSync(built, 'utf8');
    const used = Object.values(CLAIM_LADDER).filter((label) => html.includes(label));
    const inLedger = new Set(ledger.rows.map((r) => r.claimLabel));
    for (const label of used) expect(inLedger.has(label)).toBe(true);
  });
});
