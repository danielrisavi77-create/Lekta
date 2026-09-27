/**
 * Gard nad RUNBOOKOM naplate. Kod i runbook su ovdje jedan mehanizam, ne dvije stvari.
 *
 * Porijeklo: master (81a89f2f, daf5f53a, 2f1621bf) za prijasnjeg pruzatelja; pri spajanju mastera
 * u design/pack3 (2026-09-26) prenesen na Stripe (F18). `webhook-mor` obradjuje TOCNO dva
 * dogadjaja (`payment_intent.succeeded`, `charge.refunded`). Dvije stvari su nosive za novac, a
 * nijedna se ne vidi iz koda:
 *  - skup PRETPLACENIH dogadjaja postavlja covjek u Stripe sucelju. Tko pretplati samo
 *    `payment_intent.succeeded` dobije naplatu koja radi i povrate koji se nikad ne obrade
 *    (entitlement ostaje `paid`, referral nagrada se ne povuce), bez ijedne greske;
 *  - ishodi `ignored` i `refused` NISU u djelomicnom indeksu `webhook_events_unresolved`
 *    (migracija 0092), pa ih standardni upit nad neobradjenima ne vraca.
 *
 * Popis ishoda i imena log redaka se IZVODI iz izvora handlera, pa novi ishod u kodu obara ovaj
 * test dok se ne opise u runbooku. To je namjerno: dokumentacija ovdje nije uljudnost nego dio garda.
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  handlerOutcomes,
  naplataRunbookProblems,
  runbookLogNameProblems,
  runbookSqlColumnProblems,
  runbookSqlQueryCount,
  webhookEventsColumns,
  webhookMorLogNames,
  readTextLf,
} from './helpers/naplata-env';
import { IGNORE_REASON_PREFIXES } from '../src/report/webhook';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// readTextLf: normalizira CRLF u LF pri citanju, da mutacije s doslovnim `\n` u ovoj datoteci
// pogode redak i u checkoutu s core.autocrlf=true (vidi tests/helpers/naplata-env.ts).
const read = (p: string): string => readTextLf(resolve(ROOT, p));

const RUNBOOK = read('docs/GO_LIVE_NAPLATA.md');
// Obrada dogadjaja (settle, log redci) zivi u handler.ts; index.ts cita samo okolinu.
const HANDLER = read('supabase/functions/webhook-mor/handler.ts');
const MIGRACIJA = read('supabase/migrations/0092_webhook_events_inbox.sql');

describe('runbook naplate pokriva dogadjaje i ishode koje handler stvarno proizvodi', () => {
  it('mjerenje je netrivijalno (prazan izvod ne smije "proci")', () => {
    expect(RUNBOOK.length).toBeGreaterThan(4000);
    const outcomes = handlerOutcomes(HANDLER);
    expect(outcomes.length).toBeGreaterThanOrEqual(5);
    expect(outcomes).toContain('ignored');
    expect(outcomes).toContain('refused');
    expect(outcomes).toContain('processed');
    expect(outcomes).toContain('needs_manual_link');
  });

  it('BASELINE: runbook nema nijedan od poznatih propusta', () => {
    const problems = naplataRunbookProblems(RUNBOOK, handlerOutcomes(HANDLER), IGNORE_REASON_PREFIXES);
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('gard grize: razlog iz outcome_detail bez retka u runbooku se prijavi', () => {
    // Ishod `ignored` pokriva vise razloga s razlicitim radnjama; ime ishoda nije dovoljno.
    const problems = naplataRunbookProblems(RUNBOOK, handlerOutcomes(HANDLER), [
      ...IGNORE_REASON_PREFIXES,
      'nov_razlog:',
    ]);
    expect(problems.join('; ')).toContain('nov_razlog:');
  });

  it('runbook opisuje postupak rucnog vezivanja, ne samo ime ishoda', () => {
    expect(RUNBOOK).toContain('Ručno vezivanje');
    expect(RUNBOOK).toMatch(/entitlements/);
    expect(RUNBOOK).toContain("outcome = 'processed'");
  });

  it('gard grize: runbook bez imena dogadjaja charge.refunded se prijavi', () => {
    // MUTACIJA u memoriji: runbook koji povrat ne imenuje kao dogadjaj za pretplatu.
    const mutated = RUNBOOK.split('`charge.refunded`').join('povrat');
    expect(mutated).not.toBe(RUNBOOK);
    expect(naplataRunbookProblems(mutated, handlerOutcomes(HANDLER)).join('; ')).toContain('charge.refunded');
  });

  it('gard grize: runbook bez opisa ishoda refused se prijavi', () => {
    const mutated = RUNBOOK.split('`refused`').join('odbijeno');
    expect(mutated).not.toBe(RUNBOOK);
    expect(naplataRunbookProblems(mutated, handlerOutcomes(HANDLER)).join('; ')).toContain('refused');
  });

  it('gard grize: runbook bez razloga payment_status: (uplata bez potvrdjene naplate) se prijavi', () => {
    const mutated = RUNBOOK.split('`payment_status:`').join('status');
    expect(mutated).not.toBe(RUNBOOK);
    expect(naplataRunbookProblems(mutated, handlerOutcomes(HANDLER), IGNORE_REASON_PREFIXES).join('; '))
      .toContain('payment_status:');
  });

  it('gard grize: nov ishod u kodu bez retka u runbooku se prijavi', () => {
    // MUTACIJA: izmisljen ishod koji runbook ne poznaje. Dokazuje da popis nije zamrznut.
    const problems = naplataRunbookProblems(RUNBOOK, [...handlerOutcomes(HANDLER), 'nov_ishod']);
    expect(problems.join('; ')).toContain('nov_ishod');
  });

  it('naplataRunbookProblems daje isti rezultat nad CRLF i LF verzijom runbooka', () => {
    const crlfRunbook = RUNBOOK.replace(/\n/g, '\r\n');
    expect(crlfRunbook).not.toBe(RUNBOOK);
    const outcomes = handlerOutcomes(HANDLER);
    expect(naplataRunbookProblems(crlfRunbook, outcomes, IGNORE_REASON_PREFIXES)).toEqual(
      naplataRunbookProblems(RUNBOOK, outcomes, IGNORE_REASON_PREFIXES),
    );
  });
});

/**
 * IME LOG RETKA KOJE IZVOR NE ISPISUJE NIJE IME (nalaz pregleda 2026-09-23).
 *
 * Na masteru je runbook spominjao `webhook-mor ignored_unpaid_order`, redak koji izvor nikad nije
 * pisao (stvarno ime je `ignored_needs_attention`). Popis imena se izvodi iz izvora handlera, ne
 * prepisuje rucno, pa promjena imena u kodu bez pratece izmjene runbooka obara ovaj test.
 */
describe('runbook imenuje samo log retke koji stvarno postoje u izvoru webhook-mor', () => {
  it('mjerenje je netrivijalno (izvod imena iz izvora nije prazan)', () => {
    const imena = webhookMorLogNames(HANDLER);
    expect(imena.size).toBeGreaterThanOrEqual(5);
    // `event_ignored` vise ne postoji: gate gleda samo porijeklo, vrstu odlucuje klasifikator
    // (krug 2 spajanja, 2026-09-26). Placena uplata bez korisnika ima vlastiti ERROR redak.
    expect(imena.has('event_ignored')).toBe(false);
    expect(imena.has('needs_manual_link')).toBe(true);
    expect(imena.has('event_refused')).toBe(true);
    expect(imena.has('ignored_needs_attention')).toBe(true);
    expect(imena.has('ignored_foreign_event')).toBe(true);
    expect(imena.has('foreign_event_ignored')).toBe(true);
  });

  it('BASELINE: runbook ne spominje nijedno izmisljeno ime', () => {
    const problems = runbookLogNameProblems(RUNBOOK, webhookMorLogNames(HANDLER));
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('gard grize: ime koje izvor ne ispisuje se prijavi', () => {
    // MUTACIJA: tocno stanje runbooka prije ispravka (pogresno ime umjesto stvarnog).
    const mutated = RUNBOOK.split('`webhook-mor ignored_needs_attention`').join('`webhook-mor ignored_unpaid_order`');
    expect(mutated).not.toBe(RUNBOOK);
    const problems = runbookLogNameProblems(mutated, webhookMorLogNames(HANDLER));
    expect(problems.join('; ')).toContain('ignored_unpaid_order');
  });
});

/**
 * UPIT KOJI SE NE MOZE IZVRSITI NIJE UPIT (nalaz pregleda 2026-09-23).
 *
 * Na masteru su oba upita u sekciji 5.1 citala i sortirala po `created_at`, stupcu kojeg
 * `webhook_events` nema: migracija 0092 definira `received_at` i `processed_at`. Operater bi u
 * tjednu lansiranja umjesto popisa dobio `ERROR: 42703 column "created_at" does not exist`. Bas ti
 * upiti su jedina zamjena za djelomicni indeks `webhook_events_unresolved`, koji ishode `ignored`
 * i `refused` namjerno ne pokriva.
 *
 * Stari gard to nije mogao vidjeti: trazio je samo da se niz `from webhook_events` negdje pojavi.
 */
describe('SQL upiti u runbooku gadjaju stupce koje tablica stvarno ima', () => {
  it('mjerenje je netrivijalno (izvod stupaca i broj upita nisu prazni)', () => {
    const stupci = webhookEventsColumns(MIGRACIJA);
    expect(stupci).toContain('received_at');
    expect(stupci).not.toContain('created_at');
    expect(stupci.length).toBeGreaterThanOrEqual(10);
    expect(runbookSqlQueryCount(RUNBOOK)).toBeGreaterThanOrEqual(2);
  });

  it('BASELINE: nijedan upit ne koristi nepostojeci stupac', () => {
    const problems = runbookSqlColumnProblems(RUNBOOK, MIGRACIJA);
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('gard grize: vracanje na created_at se prijavi', () => {
    // MUTACIJA u memoriji: tocno stanje runbooka prije ovog ispravka.
    const mutated = RUNBOOK.split('received_at').join('created_at');
    expect(mutated).not.toBe(RUNBOOK);
    expect(runbookSqlColumnProblems(mutated, MIGRACIJA).join('; ')).toContain('created_at');
  });

  it('gard grize: runbook bez ijednog upita nad webhook_events se prijavi', () => {
    const mutated = RUNBOOK.split('webhook_events').join('neka_druga_tablica');
    expect(runbookSqlColumnProblems(mutated, MIGRACIJA).join('; ')).toContain('nema sto mjeriti');
  });

  /**
   * DOKAZ CRLF NEOSJETLJIVOSTI (izmjereno 2026-09-23 u drugom worktreeu, core.autocrlf=true).
   *
   * `runbookSqlColumnProblems` vec razlikuje ograde koda s `\r?\n`, pa je funkcija sama po sebi
   * neosjetljiva na zavrsetak redaka. Ovaj test to dokazuje umjesto da to samo tvrdi: umjetno
   * vraca CRLF u i runbook i migraciju i pokazuje isti rezultat kao nad LF verzijom.
   */
  it('runbookSqlColumnProblems daje isti rezultat nad CRLF i LF verzijom runbooka i migracije', () => {
    const crlfRunbook = RUNBOOK.replace(/\n/g, '\r\n');
    const crlfMigracija = MIGRACIJA.replace(/\n/g, '\r\n');
    expect(crlfRunbook).not.toBe(RUNBOOK);
    expect(crlfMigracija).not.toBe(MIGRACIJA);
    expect(runbookSqlColumnProblems(crlfRunbook, crlfMigracija)).toEqual(
      runbookSqlColumnProblems(RUNBOOK, MIGRACIJA),
    );
  });
});
