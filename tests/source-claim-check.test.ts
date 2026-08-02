import { describe, it, expect } from 'vitest';
import { crossCheckClaims, findContext } from '../src/analysis/source-claim-check';
import type { ExtractedClaim } from '../src/analysis/domains';

function claim(raw: string, kind: ExtractedClaim['kind'] = 'number-unit', paragraphIndex = 1): ExtractedClaim {
  return { kind, raw, paragraphIndex };
}

describe('findContext', () => {
  it('dokumentirani lazni pozitivac: "40 t" pronadjeno unutar "40 tvrtke" preko granice rijeci, kontekst to pokazuje', () => {
    const rawText = 'U izvještaju se navodi da je iznos 40 tvrtke sudjelovalo u realizaciji projekta.';
    const res = findContext(rawText, '40 t');
    expect(res.found).toBe(true);
    expect(res.context).toContain('40 tvrtke');
  });

  it('nalazi tvrdnju razdvojenu prijelomom retka', () => {
    const rawText = 'Masa je bila 45\nkg prema mjerenju.';
    const res = findContext(rawText, '45 kg');
    expect(res.found).toBe(true);
    expect(res.context).toContain('45');
    expect(res.context).toContain('kg');
  });

  it('vraca found:false kad tvrdnja uopce ne postoji u tekstu', () => {
    const res = findContext('Sasvim nepovezan tekst bez brojki.', '99 kg');
    expect(res.found).toBe(false);
    expect(res.context).toBeNull();
  });
});

describe('crossCheckClaims', () => {
  const sources = [
    { fileName: 'izvjesce-01.docx', rawText: 'Ukupna masa čeličnih profila iznosi 45 kg prema mjerenju na terenu.' },
    { fileName: 'izvjesce-02.docx', rawText: 'Ovaj dokument ne spominje relevantne brojke.' },
  ];

  it('foundInAnySource=true kad je tvrdnja u barem jednom izvoru, s kontekstom', () => {
    const [result] = crossCheckClaims([claim('45 kg')], sources);
    expect(result.foundInAnySource).toBe(true);
    const hit = result.perSource.find((s) => s.fileName === 'izvjesce-01.docx');
    expect(hit?.found).toBe(true);
    expect(hit?.context).toContain('45');
    const miss = result.perSource.find((s) => s.fileName === 'izvjesce-02.docx');
    expect(miss?.found).toBe(false);
    expect(miss?.context).toBeNull();
  });

  it('foundInAnySource=false kad tvrdnja nije ni u jednom izvoru', () => {
    const [result] = crossCheckClaims([claim('999 kg')], sources);
    expect(result.foundInAnySource).toBe(false);
    expect(result.perSource.every((s) => !s.found)).toBe(true);
  });
});
