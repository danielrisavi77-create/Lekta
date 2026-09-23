/**
 * Gard nad RUNBOOKOM naplate. Kod i runbook su ovdje jedan mehanizam, ne dvije stvari.
 *
 * Od 2026-09-22 `webhook-mor` obradjuje TOCNO dva dogadjaja i pise pet ishoda u `webhook_events`.
 * Oba su nosiva za novac, a nijedno se ne vidi iz koda:
 *  - skup PRETPLACENIH dogadjaja postavlja covjek u Lemon Squeezy sucelju. Tko pretplati samo
 *    `order_created` dobije naplatu koja radi i povrate koji se nikad ne obrade (entitlement ostaje
 *    `paid`, referral nagrada se ne povuce), bez ijedne greske;
 *  - ishodi `needs_manual_link` i `ignored` NISU u djelomicnom indeksu `webhook_events_unresolved`
 *    (migracija 0092), pa ih standardni upit nad neobradjenima ne vraca. Bez upita i postupka u
 *    runbooku, placena narudzba bez `user_id` ostaje redak koji nitko ne gleda.
 *
 * Popis ishoda se IZVODI iz izvora Edge funkcije, pa novi ishod u kodu obara ovaj test dok se ne
 * opise u runbooku. To je namjerno: dokumentacija ovdje nije uljudnost nego dio garda.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { handlerOutcomes, naplataRunbookProblems } from './helpers/naplata-env';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8');

const RUNBOOK = read('docs/GO_LIVE_NAPLATA.md');
const HANDLER = read('supabase/functions/webhook-mor/index.ts');

describe('runbook naplate pokriva dogadjaje i ishode koje handler stvarno proizvodi', () => {
  it('mjerenje je netrivijalno (prazan izvod ne smije "proci")', () => {
    expect(RUNBOOK.length).toBeGreaterThan(4000);
    const outcomes = handlerOutcomes(HANDLER);
    expect(outcomes.length).toBeGreaterThanOrEqual(4);
    expect(outcomes).toContain('needs_manual_link');
    expect(outcomes).toContain('ignored');
  });

  it('BASELINE: runbook nema nijedan od poznatih propusta', () => {
    const problems = naplataRunbookProblems(RUNBOOK, handlerOutcomes(HANDLER));
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('runbook opisuje postupak rucnog vezivanja, ne samo ime ishoda', () => {
    expect(RUNBOOK).toContain('Ručno vezivanje');
    expect(RUNBOOK).toMatch(/entitlements/);
    expect(RUNBOOK).toContain("outcome = 'processed'");
  });

  it('gard grize: runbook bez imena dogadjaja order_refunded se prijavi', () => {
    // MUTACIJA u memoriji: stanje runbooka do ove promjene, gdje je pisalo samo "postavi webhook".
    const mutated = RUNBOOK.split('`order_refunded`').join('povrat');
    expect(mutated).not.toBe(RUNBOOK);
    expect(naplataRunbookProblems(mutated, handlerOutcomes(HANDLER)).join('; ')).toContain('order_refunded');
  });

  it('gard grize: runbook bez opisa ishoda needs_manual_link se prijavi', () => {
    const mutated = RUNBOOK.split('`needs_manual_link`').join('rucno vezivanje');
    expect(mutated).not.toBe(RUNBOOK);
    expect(naplataRunbookProblems(mutated, handlerOutcomes(HANDLER)).join('; ')).toContain('needs_manual_link');
  });

  it('gard grize: nov ishod u kodu bez retka u runbooku se prijavi', () => {
    // MUTACIJA: izmisljen ishod koji runbook ne poznaje. Dokazuje da popis nije zamrznut.
    const problems = naplataRunbookProblems(RUNBOOK, [...handlerOutcomes(HANDLER), 'nov_ishod']);
    expect(problems.join('; ')).toContain('nov_ishod');
  });
});
