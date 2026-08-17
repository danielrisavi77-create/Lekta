import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/security-audit.yml'), 'utf8');
const requiredPublicKey = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDyEWJEJSXAqK52WXld1o0CQBkIfLxYnTpPqdgoJ9fUdmbEbTCS6pEuBYSK-6nyGsyygNYwDAtSODs-MSSzQCHA';
const canonicalRegexEntries = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpycmp0dGl6anlmY3htY3Bnem1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODIzMTcsImV4cCI6MjA5OTE1ODMxN30\\.[A-Za-z0-9_-]+',
  'lekta\\.katedra-handoff-result\\.v0\\.1',
  'fixture-2026-08-16',
  requiredPublicKey,
];
const canonicalPathEntries = [
  'data/sources/.*\\.html$',
  '(^|/)package-lock\\.json$',
];
const fixturePublicKey = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/repair-contract-v1/public-key.spki.b64url'),
  'utf8',
).trim();
const allowlist = workflow.match(/\[allowlist\][\s\S]*?GITLEAKS_TOML/)?.[0] ?? '';

function canonicalLiteralEntries(source: string, key: 'regexes' | 'paths', expected: string[]): string[] {
  const body = source.match(new RegExp(`${key}\\s*=\\s*\\[([\\s\\S]*?)\\r?\\n\\s*\\]`))?.[1];
  if (body === undefined) throw new Error(`Nedostaje ${key} TOML array.`);

  const entries: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = line.match(/^'''([^']*)''',$/);
    if (!match) throw new Error(`Neocekivani TOML residue u ${key}: ${line}`);
    entries.push(match[1]);
  }
  if (entries.length !== expected.length || entries.some((entry, index) => entry !== expected[index])) {
    throw new Error(`${key} nije tocni kanonski skup.`);
  }
  return entries;
}

function requireCanonicalAllowlist(source: string): void {
  canonicalLiteralEntries(source, 'regexes', canonicalRegexEntries);
  canonicalLiteralEntries(source, 'paths', canonicalPathEntries);
}

describe('security-audit workflow', () => {
  it('npm-audit job koristi fail-closed policy CLI umjesto golog audit thresholda', () => {
    expect(workflow).toContain('run: node scripts/security/npm-audit-policy.mjs');
    expect(workflow).not.toContain('run: npm audit --omit=dev --audit-level=high');
  });

  it('gitleaks zadrzava tocna cetiri regexa i tocne dvije path iznimke', () => {
    expect(fixturePublicKey).toBe(requiredPublicKey);
    expect(() => requireCanonicalAllowlist(allowlist)).not.toThrow();
  });

  it('odbija dodatni double-quoted regex umjesto ignoriranja valjanog TOML residuea', () => {
    const mutated = allowlist.replace('regexes = [', 'regexes = [\n          "broad.*",');
    expect(() => requireCanonicalAllowlist(mutated)).toThrow(/residue/i);
  });

  it('odbija treci siroki path entry', () => {
    const mutated = allowlist.replace('paths = [', "paths = [\n          '''tests/.*''',");
    expect(() => requireCanonicalAllowlist(mutated)).toThrow(/kanonski skup/i);
  });
});
