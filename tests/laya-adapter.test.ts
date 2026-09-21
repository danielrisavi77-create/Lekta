import { describe, it } from 'vitest';
import { adapterCases } from './helpers/laya-cases';

describe('Laya adapter - samo ugovor, bez modela', () => {
  for (const test of adapterCases) it(test.name, test.run);
});
