/**
 * CI KESIRANJE OVISNOSTI (BL-P3-XX): svaki job koji zove `npm ci` mora ici kroz
 * `./.github/actions/setup-deps`, a ta composite akcija mora stvarno kesirati `node_modules`
 * po hashu `package-lock.json` i preskociti `npm ci` na pogodak kesa.
 *
 * Zasto zaseban gard, ne samo procitati YAML rucno: `actions/setup-node` s `cache: npm` kesira
 * SAMO `~/.npm`, ne `node_modules`, pa je izgledalo kao kesiranje bez da ista stvarno ubrzava
 * `npm ci`. Ovaj test drzi da SVAKI posao koji instalira ovisnosti prolazi kroz composite akciju
 * koja kesira pravu stvar, i da ta akcija stvarno preskace `npm ci` na pogodak.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasConditionalNpmCiStep,
  hasLockfileHashedCacheStep,
  jobsWithBareNpmCi,
  unpinnedExternalUses,
} from './helpers/ci-workflow-cache';

const ROOT = join(import.meta.dirname, '..');
const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');
const SETUP_DEPS_ACTION = join(ROOT, '.github', 'actions', 'setup-deps', 'action.yml');

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

function readText(path: string): string {
  // Tekstualne usporedbe normaliziraju CR (CLAUDE.md): radna kopija moze biti CRLF na Windowsu.
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('composite akcija setup-deps postoji i stvarno kesira node_modules', () => {
  const actionText = readText(SETUP_DEPS_ACTION);

  it('ima kes korak ciji kljuc ovisi o package-lock.json hashu', () => {
    expect(hasLockfileHashedCacheStep(actionText)).toBe(true);
  });

  it('pokrece npm ci SAMO na promasaj kesa (uvjet na cache-hit)', () => {
    expect(hasConditionalNpmCiStep(actionText)).toBe(true);
  });

  it('svi vanjski uses: unutar akcije su pinani SHA-om (40 heks) uz komentar verzije', () => {
    expect(unpinnedExternalUses(actionText)).toEqual([]);
  });
});

describe('svaki job koji instalira npm ovisnosti ide kroz setup-deps', () => {
  // Poslovi koji NAMJERNO rade cistu instalaciju mimo composite akcije, uz razlog. Prazno je
  // namjerno: nijedan poznat posao trenutno ne treba zaobici kes.
  const CISTA_INSTALACIJA_DOPUSTENA: ReadonlyArray<{ file: string; job: string }> = [];

  for (const file of workflowFiles()) {
    it(`${file}: nijedan job ne zove "npm ci" mimo setup-deps`, () => {
      const text = readText(join(WORKFLOWS_DIR, file));
      const offenders = jobsWithBareNpmCi(text).filter(
        (job) => !CISTA_INSTALACIJA_DOPUSTENA.some((x) => x.file === file && x.job === job),
      );
      expect(
        offenders,
        `Job(ovi) ${offenders.join(', ')} u ${file} zovu "npm ci" izravno. `
          + 'Presloziti kroz `uses: ./.github/actions/setup-deps` ili imenovati kao svjesnu iznimku.',
      ).toEqual([]);
    });
  }
});

describe('sve uses: akcije u workflowima su pinane SHA-om uz komentar verzije', () => {
  for (const file of workflowFiles()) {
    it(`${file}: nema nepinanih vanjskih akcija`, () => {
      const text = readText(join(WORKFLOWS_DIR, file));
      const offenders = unpinnedExternalUses(text);
      expect(
        offenders,
        offenders.map((o) => `redak ${o.line}: ${o.text}`).join('\n'),
      ).toEqual([]);
    });
  }
});
