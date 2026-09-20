/**
 * Gard: nijedna SQL migracija ne nosi tvrdo upisan endpoint ni Bearer kljuc, i svaki
 * `cron.unschedule` je zasticen (dakle migracija je idempotentna).
 *
 * Motiv je izmjeren 2026-09-20, ne nacelan: `0059_secure_reminder_cron.sql` je srusio `db push`
 * lanac od 24 migracije na stagingu s "could not find valid entry for job
 * send-deadline-reminders (SQLSTATE XX000)" i istovremeno je u repozitoriju drzao produkcijski
 * URL i produkcijski Bearer kljuc. Vidi docs/deploy/MIGRATION_IDENTITY.md i zaglavlje
 * tests/helpers/migration-hygiene.ts.
 *
 * Oblik je preuzet od tests/migration-numbering.test.ts (readdirSync + readFileSync nad
 * supabase/migrations, bez ijednog uvoza iz src/), jer je to vec postojeci presedan za
 * tekstualnu provjeru ove mape.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  migrationHygieneProblems,
  stripSqlComments,
  type MigrationFile,
} from './helpers/migration-hygiene';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

const files: MigrationFile[] = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({ file, sql: readFileSync(join(migrationsDir, file), 'utf8') }));

describe('supabase migracije: higijena tajni i idempotencija crona', () => {
  it('populacija nije prazna (prazan skup bi dao vakuumsko zeleno)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('nijedna migracija ne nosi tvrdo upisan endpoint projekta', () => {
    const bad = migrationHygieneProblems(files).filter((p) => p.kind === 'hardcoded-endpoint');
    expect(bad, bad.map((p) => `${p.file}: ${p.detail}`).join('\n')).toEqual([]);
  });

  it('nijedna migracija ne nosi token-oblik Bearer kljuca', () => {
    const bad = migrationHygieneProblems(files).filter((p) => p.kind === 'bearer-literal');
    expect(bad, bad.map((p) => `${p.file}: ${p.detail}`).join('\n')).toEqual([]);
  });

  it('svaki cron.unschedule je zasticen (idempotentna migracija)', () => {
    const bad = migrationHygieneProblems(files).filter((p) => p.kind === 'unguarded-unschedule');
    expect(bad, bad.map((p) => `${p.file}: ${p.detail}`).join('\n')).toEqual([]);
  });

  /**
   * Bez ove tvrdnje gornje tri prolaze i ako `cron.unschedule` u repozitoriju uopce nema: gard bi
   * bio zelen nad praznim skupom, sto je tocno razred "vakuumsko zeleno" iz vodica.
   */
  it('gard stvarno gleda cron.unschedule pozive (barem deset postojecih)', () => {
    const calls = files.reduce(
      (total, f) => total + stripSqlComments(f.sql).split('cron.unschedule(').length - 1,
      0,
    );
    expect(calls).toBeGreaterThanOrEqual(10);
  });
});

describe('stripSqlComments: samotest citaca komentara', () => {
  it('brise `--` komentar, ali ne dira string s istim sadrzajem', () => {
    const sql = "-- url := 'https://x.supabase.co/functions/v1/a'\nselect 'zivo';\n";
    const out = stripSqlComments(sql);
    expect(out).not.toContain('supabase.co/functions/v1');
    expect(out).toContain("select 'zivo';");
    expect(out).toHaveLength(sql.length);
  });

  it('brise blok komentar, ukljucujuci ugnijezdeni', () => {
    const sql = 'select 1; /* tajna /* jos dublje */ i dalje */ select 2;';
    const out = stripSqlComments(sql);
    expect(out).not.toContain('tajna');
    expect(out).not.toContain('dublje');
    expect(out).toContain('select 2;');
  });

  /**
   * Negativna kontrola za bas one dvije datoteke zbog kojih citac komentara uopce postoji:
   * 0012 i 0027 nose isti oblik URL-a i Bearer zaglavlja, ali u KOMENTIRANOM runbooku s
   * rezerviranim mjestima. Kad bi ih gard prijavljivao, bio bi neupotrebljiv.
   */
  it('komentirani runbook u 0012 i 0027 nije nalaz', () => {
    const runbooks = files.filter((f) => f.file.startsWith('0012_') || f.file.startsWith('0027_'));
    expect(runbooks).toHaveLength(2);
    for (const f of runbooks) {
      expect(f.sql, `${f.file} vise ne sadrzi komentirani primjer`).toContain('supabase.co/functions/v1');
      expect(stripSqlComments(f.sql)).not.toContain('supabase.co/functions/v1');
    }
    expect(migrationHygieneProblems(runbooks)).toEqual([]);
  });
});

/**
 * MUTACIJE (vodic: "gard bez dokaza da grize ne racuna se"). Mutira se SAMO u memoriji.
 * Svaka ima i baseline tvrdnju, inace bi "hvatanje" moglo znaciti samo da gard vristi na sve.
 */
describe('migration-hygiene gard grize', () => {
  const CLEAN = [
    {
      file: '9999_clean.sql',
      sql: [
        'do $$',
        'declare v_url text;',
        'begin',
        "  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'lekta_functions_base_url';",
        '  begin',
        "    perform cron.unschedule('send-deadline-reminders');",
        '  exception when others then',
        '    null;',
        '  end;',
        "  perform cron.schedule('send-deadline-reminders', '0 8 * * *', format('select net.http_post(url := %L);', v_url));",
        'end $$;',
      ].join('\n'),
    },
  ];

  it('baseline: cista migracija ne daje nijedan nalaz', () => {
    expect(migrationHygieneProblems(CLEAN)).toEqual([]);
  });

  it('hvata vraceni produkcijski URL u tijelu cron naredbe', () => {
    const mutated = CLEAN.map((f) => ({
      ...f,
      sql: f.sql.replace('%L);', "https://abcdefghijklmnopqrst.supabase.co/functions/v1/send-reminders);"),
    }));
    expect(migrationHygieneProblems(mutated).map((p) => p.kind)).toContain('hardcoded-endpoint');
  });

  it('hvata vraceni Bearer token, ali ne i legitimnu konkatenaciju iz vault varijable', () => {
    const legit = CLEAN.map((f) => ({ ...f, sql: f.sql.replace('%L);', "%L, ''Bearer '' || v_bearer);") }));
    expect(migrationHygieneProblems(legit)).toEqual([]);

    const mutated = CLEAN.map((f) => ({
      ...f,
      sql: f.sql.replace('%L);', "%L, ''Bearer AbCdEf0123456789_-.XyZQwErTy'');"),
    }));
    expect(migrationHygieneProblems(mutated).map((p) => p.kind)).toContain('bearer-literal');
  });

  it('hvata nezasticen cron.unschedule i kad je u istoj datoteci neki drugi exception blok', () => {
    const mutated = CLEAN.map((f) => ({
      ...f,
      sql: f.sql
        .replace('  begin\n', '')
        .replace('  exception when others then\n    null;\n  end;\n', '')
        .replace('end $$;', 'begin\n  null;\nexception when others then\n  null;\nend;\nend $$;'),
    }));
    const kinds = migrationHygieneProblems(mutated).map((p) => p.kind);
    expect(kinds).toContain('unguarded-unschedule');
  });

  it('hvata cron.unschedule izvan ijednog do bloka (tocan oblik kvara iz 0059)', () => {
    const mutated = [{ file: '9999_bare.sql', sql: "select cron.unschedule('send-deadline-reminders');" }];
    expect(migrationHygieneProblems(mutated).map((p) => p.kind)).toEqual(['unguarded-unschedule']);
  });

  it('prihvaca i drugi valjan oblik zastite (if exists nad cron.job)', () => {
    const alt = [
      {
        file: '9999_alt.sql',
        sql: [
          'do $$',
          'begin',
          "  if exists (select 1 from cron.job where jobname = 'x') then",
          "    perform cron.unschedule('x');",
          '  end if;',
          'end $$;',
        ].join('\n'),
      },
    ];
    expect(migrationHygieneProblems(alt)).toEqual([]);
  });
});
