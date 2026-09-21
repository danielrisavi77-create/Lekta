import { describe, it } from 'vitest';
import { contractCases } from './helpers/laya-cases';

describe('Laya contract - samo ugovor, bez modela', () => {
  for (const test of contractCases) it(test.name, test.run);
});
