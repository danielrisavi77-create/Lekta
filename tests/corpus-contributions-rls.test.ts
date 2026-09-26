/**
 * Gard: korisnik ne smije moci mijenjati vlastiti redak u `corpus_contributions`.
 *
 * IZMJERENO STANJE (do 0203): migracija 0102 je stvorila policy `corpus_contributions_update_own`
 * (`for update using (user_id = auth.uid()) with check (user_id = auth.uid())`), dok komentar u istoj
 * migraciji tvrdi da upis radi iskljucivo service role. Policy je preko PostgREST-a dopustala PATCH
 * BILO KOJEG stupca: `path` (staza pseudonimizirane kopije), `expires_at` (rok cuvanja),
 * `pseudonymization`, `consent_version`, `work_type`. To nije korisnikov sadrzaj nego zapis o tome
 * pod kojom je privolom i sto pohranjeno, dakle trag koji korisnik ne smije prepisati.
 *
 * Povlacenje privole ne ovisi o toj policy: ide kroz Edge funkciju `withdraw-corpus-contribution`
 * koja radi service role klijentom, pa RLS za nju ne vrijedi.
 *
 * Mjeri se nad MIGRACIJAMA, ne nad zivom bazom: baze u testovima nema, a gard koji trazi bazu bio bi
 * tiho preskocen svugdje. Sto u migracijama ne pise, u bazi ne postoji.
 *
 * Integracijski RLS test nad lokalnim Supabaseom NIJE dodan: repozitorij za to nema infrastrukturu
 * (nijedan test ne podize `supabase start`), pa bi novi env-gatiran skip bio gard koji se nigdje ne
 * izvodi. Ovo je staticka provjera sheme i tako je i imenovana.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  FOR_SELECT,
  parseCorpusPolicyHistory,
  type MigrationFile,
} from './helpers/corpus-contributions-rls';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

/** Redoslijed primjene = sortirano ime datoteke (Supabase version je vodeci broj). */
function loadMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }));
}

const MIGRATIONS = loadMigrations();

describe('corpus_contributions: nema UPDATE policy za korisnika', () => {
  it('mjerenje je netrivijalno (prazan izvod ne smije "proci")', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(50);
    // Bez ovoga bi pokvaren regex vratio prazan skup i gard bi bio vakuumski zelen.
    expect(parseCorpusPolicyHistory(MIGRATIONS).createdCount).toBeGreaterThanOrEqual(2);
  });

  it('nakon zadnje migracije ne postoji nijedna for update policy', () => {
    const { remaining } = parseCorpusPolicyHistory(MIGRATIONS);
    expect(
      remaining,
      `korisnik jos smije mijenjati vlastiti redak: ${remaining.join(', ')}`,
    ).toEqual([]);
  });

  it('select policy OSTAJE (korisnik i dalje vidi svoje priloge)', () => {
    // Anti-regresija u drugu stranu: gasenje UPDATE-a ne smije usput oslijepiti popis priloga
    // (`src/report/corpus-contribution-client.ts` cita PostgREST-om, uz RLS select policy).
    const select = parseCorpusPolicyHistory(MIGRATIONS, 'corpus_contributions', FOR_SELECT);
    expect(select.remaining).toEqual(['corpus_contributions_select_own']);
  });

  it('gard grize: bez migracije 0203 ostaje corpus_contributions_update_own', () => {
    // MUTACIJA u memoriji: makni zadnju migraciju iz POPISA, disk se ne dira. To je zatečeno
    // stanje repozitorija prije ove promjene, pa tvrdnja nije o izmisljenom kvaru.
    const bez0203 = MIGRATIONS.filter((m) => !m.file.startsWith('0203_'));
    expect(bez0203.length).toBe(MIGRATIONS.length - 1);
    expect(parseCorpusPolicyHistory(bez0203).remaining).toEqual(['corpus_contributions_update_own']);
  });
});
