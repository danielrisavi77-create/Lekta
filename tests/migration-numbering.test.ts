/**
 * Guard protiv AUD-17: dvije migracije s istim numerickim prefiksom.
 *
 * Supabase izvodi `version` migracije iz vodeceg broja prije prvog `_` i taj je version
 * primarni kljuc u `supabase_migrations.schema_migrations`. Dvije datoteke s istim prefiksom
 * (npr. 0008_analytics_views i 0008_checkout_consent) mapiraju se na isti version pa `db push`
 * tiho preskoci drugu, ostavljajuci njezine objekte (tablice, funkcije, RLS) nestvorenima.
 * Ovaj test rusi build cim se pojavi kolizija.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

describe('supabase migracije: numeriranje', () => {
  it('svaka .sql migracija ima cetveroznamenkasti <prefiks>_<naziv> oblik', () => {
    for (const f of files) {
      expect(f, `nevaljano ime migracije: ${f}`).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    }
  });

  it('nijedan numericki prefiks se ne ponavlja (Supabase version je PK)', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const f of files) {
      const prefix = f.slice(0, 4);
      const prev = seen.get(prefix);
      if (prev) collisions.push(`${prefix}: ${prev} + ${f}`);
      else seen.set(prefix, f);
    }
    expect(collisions, `kolizija numeracije migracija:\n${collisions.join('\n')}`).toEqual([]);
  });

  it('log_retention (definira purge_old_report_generations) primjenjuje se prije revoke_purge', () => {
    // 0015_revoke_purge radi `revoke ... on function purge_old_report_generations` pa funkcija
    // mora vec postojati; cuvamo taj poredak i nakon renumeracije (AUD-17).
    const logRetention = files.find((f) => f.includes('log_retention'));
    const revoke = files.find((f) => f.includes('revoke_purge'));
    expect(logRetention, 'nema log_retention migracije').toBeTruthy();
    expect(revoke, 'nema revoke_purge migracije').toBeTruthy();
    expect(logRetention!.slice(0, 4) < revoke!.slice(0, 4)).toBe(true);
  });
});
