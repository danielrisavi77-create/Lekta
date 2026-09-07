import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CONTRACT_ROOT = join(ROOT, 'contracts', 'academic-suite', 'v0.2');
const SCHEMAS = [
  'project-ref',
  'artifact-version',
  'finding',
  'fix-plan',
  'verification-receipt',
  'capability-manifest',
] as const;

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('Academic Suite v0.2 contract pack', () => {
  it('contains all six canonical schemas at version 0.2', () => {
    for (const name of SCHEMAS) {
      const schema = readJson(join(CONTRACT_ROOT, `${name}.schema.json`)) as {
        $id?: string;
        type?: string;
      };

      expect(schema.$id).toContain('/academic-suite/v0.2/');
      expect(schema.type).toBe('object');
    }
  });

  it('validates every canonical example with JSON Schema 2020-12', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const pairs = [
      ['project-ref', 'project-ref'],
      ['artifact-version', 'artifact-docx'],
      ['finding', 'lekta-margin-finding'],
      ['finding', 'rad-audit-finding'],
      ['verification-receipt', 'word-replica-receipt'],
      ['fix-plan', 'fix-plan-margin'],
    ] as const;

    for (const [schemaName, exampleName] of pairs) {
      const schema = readJson(join(CONTRACT_ROOT, `${schemaName}.schema.json`));
      const example = readJson(join(CONTRACT_ROOT, 'examples', `${exampleName}.json`));
      const validate = ajv.compile(schema);

      expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    }
  });
});
