/** Iste tvrdnje kao Vitest; offline dijagnostika na Node >=22.6. Nije puni repo gate. */
import { test } from 'node:test';
import { contractCases, adapterCases, invariantCases } from './helpers/laya-cases.ts';
import { boundaryCases } from './helpers/laya-boundary-cases.ts';
import { reviewCases } from './helpers/laya-review-cases.ts';
for (const entry of [...contractCases, ...adapterCases, ...invariantCases, ...boundaryCases, ...reviewCases]) test(entry.name, entry.run);
