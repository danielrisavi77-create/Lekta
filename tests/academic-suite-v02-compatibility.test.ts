import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAcademicWorkType } from '../src/integration/academic-suite-contracts';

const CONTRACT_ROOT = join(process.cwd(), 'contracts', 'academic-suite', 'v0.2');

const CANONICAL_WORK_TYPES = [
  'seminar',
  'final',
  'graduate',
  'specialist',
  'doctoral',
  'article',
  'project',
] as const;

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

describe('Academic Suite v0.2 compatibility with accepted v0.1 semantics', () => {
  it('keeps the canonical cross-product academic work vocabulary unchanged', () => {
    const schema = readJson<{
      properties: { workType: { enum: string[] } };
    }>(join(CONTRACT_ROOT, 'project-ref.schema.json'));

    expect(schema.properties.workType.enum).toEqual(CANONICAL_WORK_TYPES);
    expect(schema.properties.workType.enum.every(isAcademicWorkType)).toBe(true);
  });

  it('uses the canonical graduate work type in the ProjectRef example', () => {
    const example = readJson<{ workType: string }>(join(CONTRACT_ROOT, 'examples', 'project-ref.json'));

    expect(example.workType).toBe('graduate');
    expect(isAcademicWorkType(example.workType)).toBe(true);
  });
});
