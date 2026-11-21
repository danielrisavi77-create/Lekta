// @vitest-environment node
/** Negative control for the paid-commerce provider-registration deploy guard. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMERCE_PROVIDER_REGISTRATION_REQUIRED,
  enforceCommerceProviderRegistration,
} from '../scripts/deploy-gate-provider.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = path.join(ROOT, 'scripts/deploy-gate-provider.mjs');

function failuresFor(rule: typeof enforceCommerceProviderRegistration, commerceLive: boolean, providerRegistered: unknown): string[] {
  const failures: string[] = [];
  rule({ commerceLive, provider: { providerRegistered }, fail: (message) => failures.push(message) });
  return failures;
}

describe('mutacije: provider mora biti registriran prije naplate', () => {
  it('baseline odbija nepoznatog/nepotvrđenog pružatelja, a dopušta besplatni ili registrirani tok', () => {
    expect(failuresFor(enforceCommerceProviderRegistration, true, false)).toEqual([
      COMMERCE_PROVIDER_REGISTRATION_REQUIRED,
    ]);
    expect(failuresFor(enforceCommerceProviderRegistration, true, null)).toEqual([
      COMMERCE_PROVIDER_REGISTRATION_REQUIRED,
    ]);
    expect(failuresFor(enforceCommerceProviderRegistration, true, true)).toEqual([]);
    expect(failuresFor(enforceCommerceProviderRegistration, false, false)).toEqual([]);
  });

  it('mutacija koja obrće predikat pokazuje točno oba načina kvara', async () => {
    const source = readFileSync(MODULE_PATH, 'utf8');
    const originalPredicate = 'provider?.providerRegistered === true';
    const mutatedPredicate = 'provider?.providerRegistered !== true';
    expect(source.split(originalPredicate)).toHaveLength(2);
    const mutatedSource = source.replace(originalPredicate, mutatedPredicate);
    const directory = mkdtempSync(path.join(os.tmpdir(), 'lekta-commerce-gate-mutation-'));
    try {
      const modulePath = path.join(directory, 'mutant.mjs');
      writeFileSync(modulePath, mutatedSource, 'utf8');
      const mutant = await import(`${pathToFileURL(modulePath).href}?mutation=${randomUUID()}`);
      const unregisteredCommerceFailures = failuresFor(mutant.enforceCommerceProviderRegistration, true, false);
      const registeredCommerceFailures = failuresFor(mutant.enforceCommerceProviderRegistration, true, true);
      const problems: string[] = [];
      if (unregisteredCommerceFailures.length === 0) problems.push('mutant admits an unregistered provider');
      if (registeredCommerceFailures.length > 0) problems.push('mutant blocks a registered provider');
      expect(problems).toEqual([
        'mutant admits an unregistered provider',
        'mutant blocks a registered provider',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
