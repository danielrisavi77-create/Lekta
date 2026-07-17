/**
 * Brzi tripwire za fallback baseline u redovnom `npm run check` (puna matrica je u
 * tests/conformance/baseline.test.ts, samo pod `npm run conformance`). Dva slucaja: jedan lightBaseline
 * (seminar, requireToc off) i jedan tezak (graduate), da regresija generickog puta padne odmah, ne tek
 * u zasebnom conformance runu. Baseline je ono sto student iz NEPORTANOG fakulteta stvarno dobije.
 */
import { describe, it } from 'vitest';
import { expectBaselineConformance } from './helpers/conformance';

describe('fallback baseline tripwire (uzorak u check)', () => {
  it('social/seminar (lightBaseline, requireToc off)', () => expectBaselineConformance('social', 'seminar'), 30000);
  it('social/graduate (tezak baseline)', () => expectBaselineConformance('social', 'graduate'), 30000);
});
