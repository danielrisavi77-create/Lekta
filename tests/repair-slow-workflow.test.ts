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
    // Od CI kesiranja ovisnosti (BL-P3-XX) instalacija ide kroz composite akciju, ne kroz
    // izravan `run: npm ci` korak; ta akcija (tests/ci-workflow-cache.test.ts) sama dokazuje
    // da INTERNO stvarno pokrece `npm ci` na promasaj kesa.
    expect(yaml).toMatch(/uses:\s*\.\/\.github\/actions\/setup-deps/);
    expect(yaml).toMatch(/run:\s*npm run test:slow/);
  });
});
