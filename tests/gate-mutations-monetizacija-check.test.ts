/**
 * Mutacije Monetizacije V1: brisanje CHECK ogranicenja (Codex M3).
 * T106: izdvojeno iz tests/gate-mutations.test.ts doslovno (isti naslov bloka i testova), da PGlite
 * testovi ne drze jednog Vitest radnika 137 s u jednoj datoteci. Ugovor isti: cisti baseline, pa mutacija
 * koja mora oboriti gard.
 */
import { describe, it, expect } from 'vitest';
import { constraintDropProblems } from './helpers/monetizacija-v1-sql';
import { ROK_SQL, mutiraj, mutirajRe } from './helpers/monetizacija-mutations';

/**
 * Monetizacija V1 (M2) krug 3: asinkroni gardovi. Zajednicko citanje pristupa se IZVRSAVA, a 0207 se
 * izvrsava u stvarnom Postgresu (PGlite, tests/helpers/monetizacija-v1-sql.ts). Isti ugovor kao
 * MUTATIONS: cisti baseline, pa mutacija koja mora oboriti gard.
 */
describe('mutacije: Monetizacija V1 izvrseni gardovi', () => {
  it('Codex PR #217 M3: brisanje CHECK-ova baseline cisto', async () => {
    expect(await constraintDropProblems()).toEqual([]);
  }, ROK_SQL);

  it('Codex PR #217 M3: work_type CHECK se brise bez provjere imena i definicije (stanje f466d454) i obara gard', async () => {
    const mutated = mutiraj("raise exception '0207: neocekivan work_type CHECK %.% (%); ne brise se naslijepo', r.tabela, r.ime, r.def;", 'null;');
    const p = await constraintDropProblems(mutated);
    expect(p.some((x) => x.includes('tiho brise entitlements_doktorski_slotovi'))).toBe(true);
    expect(p.some((x) => x.includes('ne pada glasno (RAISE EXCEPTION) na repair_jobs_work_type_check'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 M3: bonus_outbox status CHECK se brise bez provjere i obara gard', async () => {
    const mutated = mutiraj("raise exception '0207: neocekivan status CHECK bonus_outbox.% (%); ne brise se naslijepo', r.ime, r.def;", 'null;');
    expect((await constraintDropProblems(mutated)).some((x) => x.includes('tiho brise bonus_outbox_pending_pokusaji'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 r2 M3: work_type CHECK bez usporedbe cijelog izraza (samo ime i stupac) tiho brise stroziji izraz istog imena i obara gard', async () => {
    const mutated = mutirajRe(/       or not v_poznat then\r?\n      raise exception '0207: neocekivan work_type/, "       or false then\n      raise exception '0207: neocekivan work_type");
    const p = await constraintDropProblems(mutated);
    expect(p.some((x) => x.includes('stroziji izraz (work_type)') && x.includes('tiho brise corpus_contributions_work_type_check'))).toBe(true);
  }, ROK_SQL);

  it('Codex PR #217 r2 M3: bonus_outbox status CHECK bez usporedbe cijelog izraza tiho brise stroziji izraz istog imena i obara gard', async () => {
    const mutated = mutirajRe(/       or not v_poznat then\r?\n      raise exception '0207: neocekivan status CHECK/, "       or false then\n      raise exception '0207: neocekivan status CHECK");
    const p = await constraintDropProblems(mutated);
    expect(p.some((x) => x.includes('stroziji izraz (bonus_outbox.status)') && x.includes('tiho brise bonus_outbox_status_check'))).toBe(true);
  }, ROK_SQL);
});
