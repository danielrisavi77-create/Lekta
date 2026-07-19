import { describe, it, expect } from 'vitest';
import { runSpellcheckHr, type SpellChecker, type SpellParagraph } from '../src/audits/spellcheck-hr';

/** Fake provjernik: ispravno = u skupu poznatih (uz prihvat velikog pocetnog slova, kao Hunspell). */
function fakeChecker(known: string[], suggestions: Record<string, string[]> = {}): SpellChecker & { suggestCalls: string[] } {
  const set = new Set(known);
  const suggestCalls: string[] = [];
  return {
    suggestCalls,
    correct: (w) => set.has(w) || set.has(w.toLowerCase()),
    suggest: (w) => {
      suggestCalls.push(w);
      return suggestions[w.toLowerCase()] ?? [];
    },
  };
}

function paras(...texts: string[]): SpellParagraph[] {
  return texts.map((text, i) => ({ index: i + 1, text }));
}

describe('runSpellcheckHr: osnovno oznacavanje', () => {
  it('oznaci pogresnu malu rijec, vrati prijedloge i broj pojava s prvim odlomkom', () => {
    const checker = fakeChecker(['ovo', 'je', 'znanost', 'vazna'], { znaonst: ['znanost', 'znanstven'] });
    const res = runSpellcheckHr(paras('ovo je znaonst', 'znaonst je vazna'), checker);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]).toMatchObject({ word: 'znaonst', paragraphIndex: 1, count: 2 });
    expect(res.findings[0].suggestions).toEqual(['znanost', 'znanstven']);
    expect(res.summary).toMatchObject({ reported: 1, flaggedDistinct: 1 });
  });

  it('ispravne rijeci ne daju nalaze', () => {
    const checker = fakeChecker(['ovo', 'je', 'ispravan', 'tekst']);
    const res = runSpellcheckHr(paras('ovo je ispravan tekst'), checker);
    expect(res.findings).toHaveLength(0);
  });

  it('hrvatska dijakritika je dio rijeci (ne lomi token na c/c/dz/s/z)', () => {
    const checker = fakeChecker(['citatelj'], {}); // 'čitatelj' NIJE poznat pa se ocekuje nalaz
    const res = runSpellcheckHr(paras('čitatelj piše'), checker);
    // 'čitatelj' se provjerava kao cjelovita rijec (nije razbijen na "itatelj")
    expect(res.findings.map((f) => f.word)).toContain('čitatelj');
  });
});

describe('runSpellcheckHr: filtri (niski false-positive)', () => {
  it('preskace vlastito ime (veliko slovo usred recenice), ali provjeri istu na pocetku recenice', () => {
    const checker = fakeChecker(['ovaj', 'rad', 'napisao', 'je', 'prije']);
    const mid = runSpellcheckHr(paras('ovaj rad napisao je Watson prije'), checker);
    expect(mid.findings.map((f) => f.word)).not.toContain('Watson'); // usred recenice = vlastito ime, preskoci

    const start = runSpellcheckHr(paras('Watson je napisao'), checker);
    expect(start.findings.map((f) => f.word)).toContain('Watson'); // pocetak recenice = provjeri se
  });

  it('preskace akronime (SVE velika), poznate kratice i prekratke rijeci', () => {
    const checker = fakeChecker(['diplomski', 'rad', 'na']);
    const res = runSpellcheckHr(paras('FPZG i EU · npr. itd. tj. na diplomski rad'), checker);
    expect(res.findings).toHaveLength(0);
  });

  it('preskace brend s unutarnjim velikim slovom (iPhone, LaTeX)', () => {
    const checker = fakeChecker(['rad', 'pisan', 'u']);
    const res = runSpellcheckHr(paras('rad pisan u LaTeX i na iPhone'), checker);
    expect(res.findings.map((f) => f.word)).toEqual([]);
  });

  it('mice poveznice i e-adrese prije tokenizacije (dijelovi nisu kandidati)', () => {
    const checker = fakeChecker(['vidi', 'kontakt']);
    const res = runSpellcheckHr(paras('vidi https://www.foo.hr/bar i kontakt ime@primjer.hr'), checker);
    // ni "www", "foo", "bar", "https", "primjer" ne smiju biti prijavljeni
    expect(res.findings).toHaveLength(0);
  });
});

describe('runSpellcheckHr: dedup, sortiranje, cap', () => {
  it('sortira po broju pojava (silazno) i primjenjuje cap uz truncated', () => {
    const checker = fakeChecker([]); // sve je "pogresno"
    const res = runSpellcheckHr(paras('aaa aaa aaa bbb bbb ccc'), checker, { maxFindings: 2 });
    expect(res.findings.map((f) => f.word)).toEqual(['aaa', 'bbb']); // ccc odrezan
    expect(res.summary).toMatchObject({ reported: 2, flaggedDistinct: 3, truncated: true });
  });

  it('suggest() se poziva SAMO za prikazane rijeci (nakon capa), ne za odrezane', () => {
    const checker = fakeChecker([]);
    const res = runSpellcheckHr(paras('aaa aaa bbb bbb ccc'), checker, { maxFindings: 1 });
    expect(res.findings).toHaveLength(1);
    // 3 razlicite pogresne rijeci provjerene, ali suggest samo za 1 prikazanu
    expect(checker.suggestCalls).toEqual(['aaa']);
  });

  it('prazan ulaz i nevaljani odlomci ne rusi, vracaju prazan rezultat', () => {
    const checker = fakeChecker([]);
    expect(runSpellcheckHr([], checker).findings).toHaveLength(0);
    expect(runSpellcheckHr(null as any, checker).findings).toHaveLength(0);
    const res = runSpellcheckHr([{ index: NaN, text: 'nesto' } as any, { index: 1, text: 42 } as any], checker);
    expect(res.findings).toHaveLength(0);
  });
});
