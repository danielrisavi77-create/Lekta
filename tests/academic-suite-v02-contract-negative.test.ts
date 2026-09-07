import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CONTRACT_ROOT = join(ROOT, 'contracts', 'academic-suite', 'v0.2');

const readJson = <T = unknown>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const clone = <T>(value: T): T => structuredClone(value);

const compile = (schemaName: string) => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = readJson(join(CONTRACT_ROOT, `${schemaName}.schema.json`));
  return ajv.compile(schema);
};

describe('Academic Suite v0.2 contract rejection tripwires', () => {
  it('rejects a project ref without projectId', () => {
    const validate = compile('project-ref');
    const example = clone(readJson<Record<string, unknown>>(join(CONTRACT_ROOT, 'examples', 'project-ref.json')));

    delete example.projectId;

    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((error) => error.keyword === 'required' && error.params.missingProperty === 'projectId')).toBe(true);
  });

  it('rejects an artifact version with an invalid DOCX SHA-256 identity', () => {
    const validate = compile('artifact-version');
    const example = clone(readJson<Record<string, unknown>>(join(CONTRACT_ROOT, 'examples', 'artifact-docx.json')));
    const identity = example.identity as Record<string, unknown>;

    identity.fileSha256 = 'short';

    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((error) => error.instancePath === '/identity/fileSha256' && error.keyword === 'pattern')).toBe(true);
  });

  it('rejects an automatic finding that has no real fixerId', () => {
    const validate = compile('finding');
    const example = clone(readJson<Record<string, unknown>>(join(CONTRACT_ROOT, 'examples', 'lekta-margin-finding.json')));

    example.fixCapability = 'automatic';
    delete example.fixerId;

    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((error) => error.keyword === 'required' && error.params.missingProperty === 'fixerId')).toBe(true);
  });

  it('rejects a finding with a lifecycle status outside the canonical state machine', () => {
    const validate = compile('finding');
    const example = clone(readJson<Record<string, unknown>>(join(CONTRACT_ROOT, 'examples', 'rad-audit-finding.json')));

    example.status = 'FIXED';

    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((error) => error.instancePath === '/status' && error.keyword === 'enum')).toBe(true);
  });

  it('rejects a fix plan that points to no findings', () => {
    const validate = compile('fix-plan');
    const example = clone(readJson<Record<string, unknown>>(join(CONTRACT_ROOT, 'examples', 'fix-plan-margin.json')));

    example.findingIds = [];

    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((error) => error.instancePath === '/findingIds' && error.keyword === 'minItems')).toBe(true);
  });

  it('rejects a verification receipt with a non-canonical outcome', () => {
    const validate = compile('verification-receipt');
    const example = clone(readJson<Record<string, unknown>>(join(CONTRACT_ROOT, 'examples', 'word-replica-receipt.json')));

    example.outcome = 'GREEN';

    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((error) => error.instancePath === '/outcome' && error.keyword === 'enum')).toBe(true);
  });

  it('rejects a capability manifest that advertises no capabilities', () => {
    const validate = compile('capability-manifest');
    const example = {
      schemaVersion: '0.2',
      engine: 'lekta',
      engineVersion: '2.2.2',
      capabilities: [],
    };

    expect(validate(example)).toBe(false);
    expect(validate.errors?.some((error) => error.instancePath === '/capabilities' && error.keyword === 'minItems')).toBe(true);
  });
});
