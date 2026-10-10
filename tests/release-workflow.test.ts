import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { releaseWorkflowProblems } from './helpers/release-workflow';
import { anonKeyClaims, anonKeyLiveProblem, canonicalProductionAnonKey, canonicalProductionRef, releaseInputProblems, TARGETS } from '../scripts/release-inputs.mjs';
import { rollbackPlan } from '../scripts/release-edge-rollback.mjs';
import { isKatedraVersion, stagingHistoryPlan } from '../scripts/release-staging-history.mjs';
import { migrationKey, missingMigrations, parseArgs } from '../scripts/release-migration-check.mjs';

const root = join(import.meta.dirname, '..');
const SHA = 'a'.repeat(40);
const DEPLOYMENT_TS = readFileSync(join(root, 'src', 'config', 'deployment.ts'), 'utf8');

/** Nepotpisan JWT s danim tvrdnjama; gard cita samo `ref` i `role`. */
function jwt(claims: object): string {
  return `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`;
}
const STAGING_ANON = jwt({ ref: 'bnyemcnsphlitjradrst', role: 'anon' });

function facts(over: Partial<Parameters<typeof releaseInputProblems>[0]> = {}) {
  return {
    sha: SHA,
    head: SHA,
    onMaster: true,
    functions: 'repair-docx create-checkout',
    migrations: '0207_monetizacija_v1 0209_repair_limit_po_korisniku',
    functionDirs: readdirSync(join(root, 'supabase', 'functions')).filter((d) => d !== '_shared' && !d.includes('.')),
    migrationFiles: readdirSync(join(root, 'supabase', 'migrations')),
    projectRef: 'bnyemcnsphlitjradrst',
    siteOrigin: 'https://lekta-staging.netlify.app',
    netlifySiteId: 'f432ae00-c4f6-4ded-8c22-d4b71c7b8687',
    target: 'staging',
    canonicalProdRef: 'zrrjttizjyfcxmcpgzml',
    anonKey: STAGING_ANON,
    prodAnonKey: canonicalProductionAnonKey(DEPLOYMENT_TS),
    ...over,
  };
}

describe('objava jednim gumbom: workflow', () => {
  it('release.yml cuva okidac, odobrenje, redoslijed i tvrdi dokaz (baseline)', () => {
    expect(releaseWorkflowProblems()).toEqual([]);
  });
});

describe('objava jednim gumbom: ulazi (scripts/release-inputs.mjs)', () => {
  it('zadani ulazi nad stvarnim stablom su valjani', () => {
    expect(releaseInputProblems(facts())).toEqual([]);
  });

  it('svaki los ulaz daje tocan problem', () => {
    expect(releaseInputProblems(facts({ sha: 'master' }))).toEqual(['sha "master" nije 40-znamenkasti commit malim slovima']);
    // Velika slova: Git ih prihvaca, ali `--expect-commit` usporedjuje doslovno s build-info.json.
    expect(releaseInputProblems(facts({ sha: SHA.toUpperCase(), head: SHA })))
      .toEqual([`sha "${SHA.toUpperCase()}" nije 40-znamenkasti commit malim slovima`]);
    expect(releaseInputProblems(facts({ head: 'b'.repeat(40) }))).toEqual([`checkoutan je ${'b'.repeat(40)}, a trazen ${SHA}`]);
    expect(releaseInputProblems(facts({ onMaster: false }))).toEqual([`commit ${SHA} nije na origin/master`]);
    const bezUgovora = (fn: string) => `objava mora nositi funkciju "${fn}" (dijeli ugovor o privoli s klijentom)`;
    expect(releaseInputProblems(facts({ functions: 'repair-docx create-checkout ; rm -rf /' })))
      .toEqual(['funkcija ";" ne postoji u supabase/functions', 'funkcija "rm" ne postoji u supabase/functions', 'funkcija "-rf" ne postoji u supabase/functions', 'funkcija "/" ne postoji u supabase/functions']);
    expect(releaseInputProblems(facts({ functions: 'repair-docx create-checkout _shared' }))).toEqual(['funkcija "_shared" ne postoji u supabase/functions']);
    expect(releaseInputProblems(facts({ functions: ' ' }))).toEqual(['popis funkcija je prazan', bezUgovora('repair-docx'), bezUgovora('create-checkout')]);
    expect(releaseInputProblems(facts({ migrations: '0207_monetizacija_v1 0209_repair_limit_po_korisniku 0299_ne_postoji' })))
      .toEqual(['migracija "0299_ne_postoji" ne postoji u supabase/migrations']);
    expect(releaseInputProblems(facts({ projectRef: '' }))).toEqual(['vars.SUPABASE_PROJECT_REF "" nije kanonski staging ref bnyemcnsphlitjradrst']);
    expect(releaseInputProblems(facts({ siteOrigin: 'https://lekta-staging.netlify.app/' })))
      .toEqual(['vars.SITE_ORIGIN "https://lekta-staging.netlify.app/" nije kanonski staging origin https://lekta-staging.netlify.app']);
    expect(releaseInputProblems(facts({ netlifySiteId: 'lekta-staging' })))
      .toEqual(['vars.NETLIFY_SITE_ID "lekta-staging" nije kanonski staging site f432ae00-c4f6-4ded-8c22-d4b71c7b8687']);
  });

  it('migracija koju funkcija trazi ne smije ispasti iz popisa (Codex na #339)', () => {
    expect(releaseInputProblems(facts({ migrations: '0207_monetizacija_v1' })))
      .toEqual(['funkcija "repair-docx" trazi migraciju "0209_repair_limit_po_korisniku", a nije u popisu migracija']);
  });

  it('objava nosi obje funkcije ugovora o privoli (Codex na #339)', () => {
    expect(releaseInputProblems(facts({ functions: 'health' })))
      .toEqual(['objava mora nositi funkciju "repair-docx" (dijeli ugovor o privoli s klijentom)', 'objava mora nositi funkciju "create-checkout" (dijeli ugovor o privoli s klijentom)']);
    expect(releaseInputProblems(facts({ functions: 'repair-docx create-checkout health' }))).toEqual([]);
  });

  it('svaki cilj je vezan za kanonski projekt, site i origin (Codex na #339)', () => {
    const prod = { target: 'production', ...TARGETS.production };
    expect(releaseInputProblems(facts(prod))).toEqual([]);
    // Produkcijski environment kopiran sa staginga: sve tri vrijednosti padaju.
    expect(releaseInputProblems(facts({ target: 'production' }))).toEqual([
      'vars.SUPABASE_PROJECT_REF "bnyemcnsphlitjradrst" nije kanonski production ref zrrjttizjyfcxmcpgzml',
      'vars.NETLIFY_SITE_ID "f432ae00-c4f6-4ded-8c22-d4b71c7b8687" nije kanonski production site 1e7526f5-7f0a-480e-8589-d79ee91ff7b0',
      'vars.SITE_ORIGIN "https://lekta-staging.netlify.app" nije kanonski production origin https://lekta.hr',
    ]);
    // Staging s tudjim, ali valjanim refom ne smije doci do db push.
    expect(releaseInputProblems(facts({ projectRef: 'abcdefghijklmnopqrst' })))
      .toEqual(['vars.SUPABASE_PROJECT_REF "abcdefghijklmnopqrst" nije kanonski staging ref bnyemcnsphlitjradrst']);
    expect(releaseInputProblems(facts({ ...prod, canonicalProdRef: null })))
      .toEqual(['kanonski produkcijski ref nije procitan iz src/config/deployment.ts']);
    expect(releaseInputProblems(facts({ ...prod, canonicalProdRef: 'abcdefghijklmnopqrst' })))
      .toEqual(['src/config/deployment.ts cilja abcdefghijklmnopqrst, a TARGETS.production zrrjttizjyfcxmcpgzml']);
    expect(releaseInputProblems(facts({ target: '' }))).toEqual(['nepoznat cilj objave ""']);
  });

  it('anon kljuc mora pripadati projektu cilja (Codex na #339)', () => {
    expect(releaseInputProblems(facts({ anonKey: jwt({ ref: 'zrrjttizjyfcxmcpgzml', role: 'anon' }) })))
      .toEqual(['vars.SUPABASE_ANON_KEY pripada zrrjttizjyfcxmcpgzml (anon), a ne anon kljucu bnyemcnsphlitjradrst']);
    expect(releaseInputProblems(facts({ anonKey: jwt({ ref: 'bnyemcnsphlitjradrst', role: 'service_role' }) })))
      .toEqual(['vars.SUPABASE_ANON_KEY pripada bnyemcnsphlitjradrst (service_role), a ne anon kljucu bnyemcnsphlitjradrst']);
    expect(releaseInputProblems(facts({ anonKey: '' }))).toEqual(['vars.SUPABASE_ANON_KEY nije citljiv Supabase anon JWT']);
    const prod = { target: 'production', ...TARGETS.production };
    expect(releaseInputProblems(facts({ ...prod, prodAnonKey: STAGING_ANON })))
      .toEqual(['PRODUCTION_SUPABASE_ANON_KEY u src/config/deployment.ts pripada bnyemcnsphlitjradrst (anon), a ne anon kljucu zrrjttizjyfcxmcpgzml']);
    expect(anonKeyClaims(canonicalProductionAnonKey(DEPLOYMENT_TS))).toEqual({ ref: TARGETS.production.projectRef, role: 'anon' });
    expect(anonKeyClaims('nije.jwt!.x')).toBeNull();
  });

  it('potpis anon kljuca presudjuje projekt: samo 200 prolazi, bez odgovora je NE ZNAM (Codex na #339)', () => {
    expect(anonKeyLiveProblem(200, 'vars.SUPABASE_ANON_KEY', 'bnyemcnsphlitjradrst')).toBeNull();
    expect(anonKeyLiveProblem(401, 'vars.SUPABASE_ANON_KEY', 'bnyemcnsphlitjradrst'))
      .toBe('vars.SUPABASE_ANON_KEY: projekt bnyemcnsphlitjradrst odbija kljuc (HTTP 401)');
    expect(anonKeyLiveProblem(null, 'vars.SUPABASE_ANON_KEY', 'bnyemcnsphlitjradrst'))
      .toBe('vars.SUPABASE_ANON_KEY: projekt bnyemcnsphlitjradrst nije odgovorio (NE ZNAM)');
  });

  it('kanonski produkcijski ref se cita iz stvarnog src/config/deployment.ts', () => {
    expect(canonicalProductionRef(readFileSync(join(root, 'src', 'config', 'deployment.ts'), 'utf8'))).toBe(TARGETS.production.projectRef);
    expect(canonicalProductionRef("const X = 'y';")).toBeNull();
  });
});

describe('objava jednim gumbom: migracije na cilju (scripts/release-migration-check.mjs)', () => {
  const required = ['0207_monetizacija_v1', '0209_repair_limit_po_korisniku'];

  it('migracija se prepoznaje po imenu, i kad je zavedena timestamp verzijom', () => {
    const applied = [
      { version: '0207', name: 'monetizacija_v1' },
      { version: '20261008120000', name: 'Lekta: repair limit po korisniku' },
    ];
    expect(missingMigrations(applied, required)).toEqual([]);
    expect(migrationKey('0209_repair_limit_po_korisniku.sql')).toBe('repair_limit_po_korisniku');
  });

  it('nedostajuca migracija se imenuje; prazno ime je neispravan ulaz, ne prolaz', () => {
    expect(missingMigrations([{ version: '0207', name: 'monetizacija_v1' }], required)).toEqual(['0209_repair_limit_po_korisniku']);
    expect(missingMigrations([], required)).toEqual(required);
    expect(() => missingMigrations([], ['0300_'])).toThrow(/Neispravno ime/);
  });

  it('argumenti: ref mora biti project ref, popis ne smije biti prazan', () => {
    expect(parseArgs(['--ref', 'abcdefghijklmnopqrst', '--migrations', '0207_a 0209_b'])).toEqual({ ref: 'abcdefghijklmnopqrst', required: ['0207_a', '0209_b'] });
    expect(() => parseArgs(['--ref', 'x', '--migrations', 'a'])).toThrow(/--ref/);
    expect(() => parseArgs(['--ref', 'abcdefghijklmnopqrst', '--migrations', ''])).toThrow(/--migrations/);
  });
});

describe('objava jednim gumbom: povijest staginga (scripts/release-staging-history.mjs)', () => {
  const local = ['0103_health_ping.sql', '0200_a.sql', '0207_monetizacija_v1.sql', 'README.md'];

  it('Katedrine verzije samo u bazi dobivaju placeholder, poklopljene se ne diraju', () => {
    const applied = [
      { version: '0103', name: 'health_ping' },
      { version: '0104', name: 'katedra_projects' },
      { version: '0114', name: 'katedra_x' },
      { version: '0200', name: 'a' },
    ];
    expect(stagingHistoryPlan(applied, local)).toEqual({ placeholders: ['0104', '0114'], problems: [] });
  });

  it('nepoznata verzija samo u bazi, preimenovana i ista pod drugom verzijom su pad, ne placeholder', () => {
    expect(stagingHistoryPlan([{ version: '0230', name: 'tudje' }], local).problems)
      .toEqual(['verzija 0230 ("tudje") postoji samo u bazi i nije u Katedrinom rasponu 0104 do 0199']);
    expect(stagingHistoryPlan([{ version: '20261008120000', name: 'Lekta: monetizacija v1' }], local).problems)
      .toEqual(['migracija monetizacija_v1 je u bazi pod verzijom 20261008120000, a lokalno 0207; db push bi je ponovio']);
    expect(stagingHistoryPlan([{ version: '0200', name: 'b' }], local).problems)
      .toEqual(['verzija 0200 je u bazi "b", a lokalno a']);
    // Katedrina verzija ciji naziv odgovara lokalnoj migraciji nije Katedrina.
    expect(stagingHistoryPlan([{ version: '0150', name: 'monetizacija_v1' }], local).placeholders).toEqual([]);
  });

  it('Katedrin raspon je tocno 0104 do 0199', () => {
    expect(['0103', '0104', '0199', '0200', '104', '20261008120000'].map(isKatedraVersion)).toEqual([false, true, true, false, false, false]);
  });
});

describe('objava jednim gumbom: povrat funkcija (scripts/release-edge-rollback.mjs)', () => {
  const B = 'b'.repeat(40);
  const fns = 'repair-docx create-checkout';

  it('zivi klijent na starom commitu: vracaju se funkcije koje ondje postoje, ostale se imenuju', () => {
    expect(rollbackPlan({ liveCommit: B, releaseSha: SHA, functions: fns, prevHas: () => true }))
      .toEqual({ action: 'deploy', deploy: ['repair-docx', 'create-checkout'], missing: [] });
    expect(rollbackPlan({ liveCommit: B, releaseSha: SHA, functions: fns, prevHas: (f: string) => f === 'repair-docx' }))
      .toEqual({ action: 'deploy', deploy: ['repair-docx'], missing: ['create-checkout'] });
  });

  it('zivi klijent vec nosi izdanje: nista; necitljiv commit: NE ZNAM, ne pogadjanje', () => {
    const never = () => { throw new Error('prevHas se ne smije zvati'); };
    expect(rollbackPlan({ liveCommit: SHA, releaseSha: SHA, functions: fns, prevHas: never }).action).toBe('none');
    expect(rollbackPlan({ liveCommit: null, releaseSha: SHA, functions: fns, prevHas: never }).action).toBe('unknown');
    expect(rollbackPlan({ liveCommit: 'abc123', releaseSha: SHA, functions: fns, prevHas: never }).action).toBe('unknown');
  });
});
