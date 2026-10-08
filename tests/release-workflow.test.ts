import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { releaseWorkflowProblems } from './helpers/release-workflow';
import { releaseInputProblems } from '../scripts/release-inputs.mjs';
import { migrationKey, missingMigrations, parseArgs } from '../scripts/release-migration-check.mjs';

const root = join(import.meta.dirname, '..');
const SHA = 'a'.repeat(40);

function facts(over: Partial<Parameters<typeof releaseInputProblems>[0]> = {}) {
  return {
    sha: SHA,
    head: SHA,
    onMaster: true,
    functions: 'repair-docx create-checkout',
    migrations: '0207_monetizacija_v1 0209_repair_limit_po_korisniku',
    functionDirs: readdirSync(join(root, 'supabase', 'functions')).filter((d) => d !== '_shared' && !d.includes('.')),
    migrationFiles: readdirSync(join(root, 'supabase', 'migrations')),
    projectRef: 'abcdefghijklmnopqrst',
    siteOrigin: 'https://lekta.hr',
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
    expect(releaseInputProblems(facts({ sha: 'master' }))).toEqual(['sha "master" nije 40-znamenkasti commit']);
    expect(releaseInputProblems(facts({ head: 'b'.repeat(40) }))).toEqual([`checkoutan je ${'b'.repeat(40)}, a trazen ${SHA}`]);
    expect(releaseInputProblems(facts({ onMaster: false }))).toEqual([`commit ${SHA} nije na origin/master`]);
    expect(releaseInputProblems(facts({ functions: 'repair-docx; rm -rf /' })))
      .toEqual(['funkcija "repair-docx;" ne postoji u supabase/functions', 'funkcija "rm" ne postoji u supabase/functions', 'funkcija "-rf" ne postoji u supabase/functions', 'funkcija "/" ne postoji u supabase/functions']);
    expect(releaseInputProblems(facts({ functions: '_shared' }))).toEqual(['funkcija "_shared" ne postoji u supabase/functions']);
    expect(releaseInputProblems(facts({ functions: ' ' }))).toEqual(['popis funkcija je prazan']);
    expect(releaseInputProblems(facts({ migrations: '0299_ne_postoji' }))).toEqual(['migracija "0299_ne_postoji" ne postoji u supabase/migrations']);
    expect(releaseInputProblems(facts({ projectRef: '' }))).toEqual(['vars.SUPABASE_PROJECT_REF nije postavljen ili nije project ref']);
    expect(releaseInputProblems(facts({ siteOrigin: 'https://lekta.hr/' }))).toEqual(['vars.SITE_ORIGIN nije https origin bez zavrsne kose crte']);
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
