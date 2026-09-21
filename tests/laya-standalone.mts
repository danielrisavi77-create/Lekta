/** Iste tvrdnje kao Vitest; offline dijagnostika na Node >=22.6. Nije puni repo gate. */
import { test } from 'node:test';
import { contractCases, adapterCases, invariantCases } from './helpers/laya-cases.ts';
for (const entry of [...contractCases, ...adapterCases, ...invariantCases]) test(entry.name, entry.run);
