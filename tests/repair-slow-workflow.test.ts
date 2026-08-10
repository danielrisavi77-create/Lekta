import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = resolve(process.cwd(), '.github/workflows/repair-slow.yml');

describe('repair slow workflow contract', () => {
  it('defines the read-only Node 24 closed-loop gate', () => {
    const yaml = readFileSync(workflow, 'utf8');
    expect(yaml).toMatch(/name:\s*repair-slow/);
    expect(yaml).toMatch(/push:/);
    expect(yaml).toMatch(/pull_request:/);
    expect(yaml).toMatch(/workflow_dispatch:/);
    expect(yaml).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(yaml).toMatch(/node-version:\s*24/);
    expect(yaml).toMatch(/run:\s*npm ci/);
    expect(yaml).toMatch(/run:\s*npm run test:slow/);
  });
});
