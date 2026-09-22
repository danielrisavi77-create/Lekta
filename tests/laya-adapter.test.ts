import { describe, it } from 'vitest';
import { adapterCases } from './helpers/laya-cases';
import { boundaryCases } from './helpers/laya-boundary-cases';

describe('Laya adapter - samo ugovor, bez modela', () => {
  for (const test of [...adapterCases, ...boundaryCases]) it(test.name, test.run);
});
