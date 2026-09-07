import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCHEMAS = [
  'project-ref',
  'artifact-version',
  'finding',
  'fix-plan',
  'verification-receipt',
  'capability-manifest',
] as const;

describe('Academic Suite v0.2 contract pack', () => {
  it('contains all six canonical schemas at version 0.2', () => {
    for (const name of SCHEMAS) {
      const path = join(
        ROOT,
        'contracts',
        'academic-suite',
        'v0.2',
        `${name}.schema.json`,
      );
      const schema = JSON.parse(readFileSync(path, 'utf8')) as {
        $id?: string;
        type?: string;
      };

      expect(schema.$id).toContain('/academic-suite/v0.2/');
      expect(schema.type).toBe('object');
    }
  });
});
