import { describe, it } from 'vitest';
import { invariantCases } from './helpers/laya-cases';

describe('Laya invariants - samo ugovor, bez modela', () => {
  for (const test of invariantCases) it(test.name, test.run);
});
