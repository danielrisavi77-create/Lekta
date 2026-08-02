import { describe, it, expect } from 'vitest';
import { DOMAINS, NUMBER_UNIT_RE, detectDomain, genericFallbackKeywords, extractUniversalClaims } from '../src/analysis/domains';

function unitMatches(text: string): Array<{ value: string; unit: string }> {
  NUMBER_UNIT_RE.lastIndex = 0;
  const out: Array<{ value: string; unit: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = NUMBER_UNIT_RE.exec(text))) out.push({ value: m[1], unit: m[2] });
  return out;
}

describe('detectDomain', () => {
  it('prepoznaje celik iz gustoce kljucnih rijeci', () => {
    const text = 'Stup i greda nose panel krovišta. Sidra su ucvrscena u temelj. Profil je od celika.';
    const { domain, scores } = detectDomain(text);
    expect(domain).toBe('celik');
    expect(scores.find((s) => s.id === 'celik')!.score).toBeGreaterThanOrEqual(3);
  });

  it('prepoznaje elektro iz gustoce kljucnih rijeci', () => {
    const text = 'Napon na transformatoru i struja kroz kabel odredjuju otpor sklopke i releja.';
    const { domain } = detectDomain(text);
    expect(domain).toBe('elektro');
  });

  it('vraca generic kad nijedna domena ne prijedje prag', () => {
    const text = 'Ovo je opcenit tekst o povijesti umjetnosti bez ijedne tehnicke rijeci.';
    const { domain, scores } = detectDomain(text);
    expect(domain).toBe('generic');
    expect(scores.every((s) => s.score < 3)).toBe(true);
  });

  it('tie-break: kad su bodovi jednaki, pobjedjuje domena ranija u DOMAINS popisu', () => {
    // po jedan pogodak za celik ('stup') i elektro ('napon'), oba ispod praga (score 1 < minScore 3)
    // pa test provjerava da explicitni minScore=1 svejedno postuje poredak DOMAINS pri izjednacenju.
    const text = 'stup napon';
    const { domain } = detectDomain(text, 1);
    expect(DOMAINS.findIndex((d) => d.id === 'celik')).toBeLessThan(DOMAINS.findIndex((d) => d.id === 'elektro'));
    expect(domain).toBe('celik');
  });
});

describe('genericFallbackKeywords', () => {
  it('nalazi rijec koja se ponavlja ispred broja barem minCount puta', () => {
    const text = 'Zaposlenika ima 12. Zaposlenika je bilo 15 prosle godine. Broj zaposlenika iznosi 20.';
    const kws = genericFallbackKeywords(text);
    expect(kws).toContain('zaposlenika');
  });

  it('iskljucuje kratke rijeci i stop-listu', () => {
    const text = 'To je 5. To je i 6. To je 7.';
    const kws = genericFallbackKeywords(text);
    expect(kws).not.toContain('to');
    expect(kws).not.toContain('je');
  });

  it('ne vraca rijeci ispod minCount praga', () => {
    const text = 'Jedanputa spomenuti pojam uz broj 5.';
    const kws = genericFallbackKeywords(text, { minCount: 3 });
    expect(kws).not.toContain('spomenuti');
  });
});

describe('NUMBER_UNIT_RE granice', () => {
  it('"45 %" prepoznaje jedinicu %', () => {
    expect(unitMatches('vrijednost je 45 %')).toEqual([{ value: '45', unit: '%' }]);
  });

  it('razlikuje kut (10°) od temperature (20 °C)', () => {
    expect(unitMatches('kut je 10° a temperatura 20 °C')).toEqual([
      { value: '10', unit: '°' },
      { value: '20', unit: '°C' },
    ]);
  });

  it('"10 kVA" prepoznaje kVA, ne kV', () => {
    expect(unitMatches('transformator od 10 kVA')).toEqual([{ value: '10', unit: 'kVA' }]);
  });

  it('"5 ms" prepoznaje ms, ne m', () => {
    expect(unitMatches('kasnjenje od 5 ms')).toEqual([{ value: '5', unit: 'ms' }]);
  });

  it('"5 m/s" prepoznaje m/s, ne m', () => {
    expect(unitMatches('brzina od 5 m/s')).toEqual([{ value: '5', unit: 'm/s' }]);
  });

  it('Unicode granica: "5 mšume" NE prepoznaje jedinicu m (iza slijedi slovo s dijakritikom)', () => {
    expect(unitMatches('ima 5 mšume')).toEqual([]);
  });

  it('spelled-out "40 tona" ne pogadja jedinicu t (iza t slijedi slovo)', () => {
    expect(unitMatches('teret od 40 tona')).toEqual([]);
  });
});

describe('extractUniversalClaims', () => {
  it('prepoznaje broj+jedinicu kao number-unit tvrdnju', () => {
    const claims = extractUniversalClaims([{ index: 1, text: 'Sila je 45 kg u prvom mjerenju.' }]);
    expect(claims.some((c) => c.kind === 'number-unit' && c.raw === '45 kg' && c.paragraphIndex === 1)).toBe(true);
  });

  it('prepoznaje HRN EN normu', () => {
    const claims = extractUniversalClaims([{ index: 3, text: 'Prema normi HRN EN 1993-1-1:2022 provedena je provjera.' }]);
    expect(claims.some((c) => c.kind === 'hrn-norm' && c.raw === 'HRN EN 1993-1-1:2022')).toBe(true);
  });

  it('prepoznaje oznaku projekta (NNN(N)-NN)', () => {
    const claims = extractUniversalClaims([{ index: 5, text: 'Ugovor broj 2022-61 potpisan je u lipnju.' }]);
    expect(claims.some((c) => c.kind === 'project-code' && c.raw === '2022-61')).toBe(true);
  });

  it('prepoznaje golu vecu brojku (>=10) kao bare-number', () => {
    const claims = extractUniversalClaims([{ index: 7, text: 'Izvedeno je 45 mjerenja u sklopu istrazivanja.' }]);
    expect(claims.some((c) => c.kind === 'bare-number' && c.raw === '45')).toBe(true);
  });

  it('filtrira zero-padded brojke ciju parsiranu vrijednost je < 10 (npr. "05")', () => {
    const claims = extractUniversalClaims([{ index: 9, text: 'Šifra 05 označava prvu kategoriju.' }]);
    expect(claims.some((c) => c.kind === 'bare-number' && c.raw === '05')).toBe(false);
  });

  it('dedupe: isti (kind, raw) unutar odlomka javlja se samo jednom', () => {
    const claims = extractUniversalClaims([{ index: 1, text: 'Mjereno je 45 kg, a zatim ponovno 45 kg.' }]);
    expect(claims.filter((c) => c.kind === 'number-unit' && c.raw === '45 kg')).toHaveLength(1);
  });
});
