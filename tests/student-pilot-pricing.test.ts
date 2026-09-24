import { describe, expect, it } from 'vitest';
import { PRICING_TIERS } from '../src/config/pricing-tiers';

describe('student pilot offer', () => {
  it('describes free diagnosis and a fixed price for repaired DOCX by work type', () => {
    const free = PRICING_TIERS.find((tier) => tier.id === 'free')!;
    const paid = PRICING_TIERS.find((tier) => tier.id === 'perwork')!;
    expect(free.desc).toMatch(/dijagnoz/);
    expect(paid.desc).toMatch(/popravljen.*DOCX/i);
    expect(paid.features.join(' ')).toMatch(/3,99.*5,99.*9,99.*24,99/);
    expect(JSON.stringify(PRICING_TIERS)).not.toMatch(/koliko platiš, toliko popravaka/i);
    expect(paid.features.join(' ')).toMatch(/Cijena ne ovisi o broju odabranih zahvata/);
  });
});
