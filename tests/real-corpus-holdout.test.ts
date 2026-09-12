import { describe, expect, it } from 'vitest';
import {
  HOLDOUT_MODULO,
  expectationProvenance,
  fnv1a32,
  isHoldout,
} from './real-corpus/corpus-track';

/**
 * T06 (protokol 2.2 i 2.3): izdvojeni skup i provenijencija ocekivanja.
 *
 * Oba mehanizma postoje da dokaz razine A ne stoji na dokumentima na kojima su se ocekivanja dotjerivala.
 * Testovi zato tvrde DETERMINIZAM (isti ulaz, isti izbor, na svakom stroju) i da nepotpun zapis nikad ne
 * prolazi kao neovisna potvrda.
 */
describe('izdvojeni skup (holdout)', () => {
  it('izbor je deterministican iz imena datoteke i ne ovisi o velicini slova', () => {
    const imena = Array.from({ length: 200 }, (_, i) => `corpus-${i.toString(16).padStart(12, '0')}.docx`);
    const prvi = imena.map((n) => isHoldout(n));
    const drugi = imena.map((n) => isHoldout(n.toUpperCase()));
    expect(drugi).toEqual(prvi);
  });

  it('izdvaja otprilike petinu, ne nula i ne sve (inace mehanizam ne mjeri nista)', () => {
    const imena = Array.from({ length: 1000 }, (_, i) => `corpus-${i.toString(16).padStart(12, '0')}.docx`);
    const udio = imena.filter((n) => isHoldout(n)).length / imena.length;
    expect(udio).toBeGreaterThan(0.1);
    expect(udio).toBeLessThan(0.3);
    expect(HOLDOUT_MODULO).toBe(5);
  });

  it('izricita odluka u sidecaru ima prednost pred hashom, u oba smjera', () => {
    const imena = Array.from({ length: 50 }, (_, i) => `d-${i}.docx`);
    const hashIzdvaja = imena.find((n) => isHoldout(n));
    const hashNeIzdvaja = imena.find((n) => !isHoldout(n));
    expect(hashIzdvaja && hashNeIzdvaja, 'uzorak mora imati oba slucaja').toBeTruthy();
    expect(isHoldout(hashIzdvaja as string, { holdout: false })).toBe(false);
    expect(isHoldout(hashNeIzdvaja as string, { holdout: true })).toBe(true);
    // Vrijednost koja nije odluka se ignorira; "da" kao niz nije odluka.
    expect(isHoldout(hashNeIzdvaja as string, { holdout: 'da' })).toBe(false);
  });

  it('FNV-1a daje poznatu vrijednost (gard protiv tihe promjene hasha, koja bi preslozila skup)', () => {
    // Referentne vrijednosti FNV-1a 32-bit: prazan niz i "a".
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });
});

describe('provenijencija ocekivanja', () => {
  it('neovisna je samo uz osobu I valjan datum', () => {
    expect(expectationProvenance({ expectedBy: 'Daniel', expectedAt: '2026-09-10T08:00:00Z' })).toBe('independent');
  });

  it('nepotpun zapis je derived, ne greska', () => {
    expect(expectationProvenance({})).toBe('derived');
    expect(expectationProvenance({ expectedBy: 'Daniel' })).toBe('derived');
    expect(expectationProvenance({ expectedBy: '  ', expectedAt: '2026-09-10' })).toBe('derived');
    expect(expectationProvenance({ expectedBy: 'Daniel', expectedAt: 'jucer' })).toBe('derived');
    expect(expectationProvenance({ expectedBy: 5, expectedAt: '2026-09-10' })).toBe('derived');
  });
});

describe('mapLimited (ograniceni paralelizam harnessa)', async () => {
  const { mapLimited } = await import('./real-corpus/harness');

  it('cuva redoslijed rezultata i nikad ne prelazi granicu istodobnosti', async () => {
    let live = 0;
    let peak = 0;
    const ulaz = Array.from({ length: 23 }, (_, i) => i);
    const out = await mapLimited(ulaz, async (i) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, (23 - i) % 4));
      live -= 1;
      return i * 2;
    }, 3);
    expect(out).toEqual(ulaz.map((i) => i * 2));
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak, 'granica mora biti stvarno iskoristena, inace test ne mjeri paralelizam').toBeGreaterThan(1);
  });

  it('prazan ulaz daje prazan izlaz bez cekanja', async () => {
    expect(await mapLimited([], async () => 1)).toEqual([]);
  });
});
