import { describe, it, expect } from 'vitest';
import {
  bestCorpusCandidate, corpusMatchFrom, verifyAgainstCorpus, applyCorpusFallback,
  CORPUS_CANDIDATE_MIN, CORPUS_TOP, CORPUS_WEAK_MIN, CORPUS_FOUND_MIN,
  type CorpusCandidate,
} from '../src/citations/corpus-verify';
import type { ExistenceResult } from '../src/citations/verify-existence';

const rad = (title: string, extra: Partial<CorpusCandidate> = {}): CorpusCandidate => ({
  title, year: 2014, institution: 'Sveučilište u Zagrebu, Medicinski fakultet',
  repo: 'dabar', url: 'https://urn.nsk.hr/urn:nbn:hr:105:621611', ...extra,
});

describe('corpus-verify: pragovi preslikani iz pipelinea', () => {
  it('istovjetan naslov je pronadjen', () => {
    const m = corpusMatchFrom({ title: 'Sekundarna hipertenzija', year: 2014 }, [rad('Sekundarna hipertenzija')]);
    expect(m?.verdict).toBe('found');
    expect(m?.score).toBe(1);
    expect(m?.note).toContain('Pronađeno u hrvatskom korpusu');
  });

  it('dijakritika i interpunkcija ne mijenjaju ishod (normalizacija)', () => {
    const m = corpusMatchFrom({ title: 'LIJECENJE HIPERTENZIJE, u posebnim stanjima!' },
      [rad('Liječenje hipertenzije u posebnim stanjima')]);
    expect(m?.verdict).toBe('found');
  });

  it('godina unutar +-1 daje bonus, klamp na 1.0', () => {
    // naslovi moraju biti dovoljno razliciti da bonus NE zapne u klamp na 1.0
    const kandidat = [rad('Analiza podataka u kliničkoj praksi', { year: 2014 })];
    const bezGodine = bestCorpusCandidate({ title: 'Analiza podataka' }, kandidat);
    const sGodinom = bestCorpusCandidate({ title: 'Analiza podataka', year: 2015 }, kandidat);
    expect(bezGodine!.score).toBeLessThan(0.95); // inace test ne mjeri bonus nego klamp
    expect(sGodinom!.score).toBeCloseTo(bezGodine!.score + 0.05, 6);
    // klamp: savrsen naslov + bonus ne smije preci 1
    expect(bestCorpusCandidate({ title: 'Ista stvar', year: 2014 }, [rad('Ista stvar')])!.score).toBe(1);
  });

  it('nesklad godine NE kaznjava (nepoznata/kriva godina ne obara dobar naslov)', () => {
    const m = corpusMatchFrom({ title: 'Sekundarna hipertenzija', year: 1990 }, [rad('Sekundarna hipertenzija', { year: 2014 })]);
    expect(m?.verdict).toBe('found');
  });

  it('bira najbolji medju vise kandidata', () => {
    const m = corpusMatchFrom({ title: 'Volumetrijska analiza sive tvari' }, [
      rad('Nešto posve deseto'), rad('Volumetrijska analiza sive tvari'), rad('Analiza'),
    ]);
    expect(m?.matchedTitle).toBe('Volumetrijska analiza sive tvari');
  });

  it('prag 0,60 dijeli "vjerojatno" od "bez presude"', () => {
    expect(CORPUS_WEAK_MIN).toBe(0.6);
    expect(CORPUS_FOUND_MIN).toBe(0.8);
    // posve nepovezan naslov ne smije proci
    expect(corpusMatchFrom({ title: 'Kvantna kromodinamika u niskoenergetskom rezimu' },
      [rad('Uzgoj vinove loze u Dalmaciji')])).toBeNull();
  });
});

describe('corpus-verify: promasaj NIKAD nije "ne postoji"', () => {
  it('bez kandidata vraca null (bez presude), ne negativan ishod', () => {
    expect(corpusMatchFrom({ title: 'Bilo sto' }, [])).toBeNull();
    expect(corpusMatchFrom({ title: 'Bilo sto' }, null)).toBeNull();
  });

  it('referenca bez naslova vraca null', () => {
    expect(corpusMatchFrom({ title: '' }, [rad('Nesto')])).toBeNull();
    expect(corpusMatchFrom({ title: null }, [rad('Nesto')])).toBeNull();
  });

  it('greska dohvata se guta i vraca null (ostecen indeks ne smije laziti)', async () => {
    const m = await verifyAgainstCorpus({ title: 'Sekundarna hipertenzija' }, async () => {
      throw new Error('baza nedostupna');
    });
    expect(m).toBeNull();
  });

  it('dohvat dobiva pragove iz pipelinea', async () => {
    let seen: any = null;
    await verifyAgainstCorpus({ title: 'Nesto' }, async (t, o) => { seen = { t, o }; return []; });
    expect(seen.t).toBe('Nesto');
    expect(seen.o).toEqual({ min: CORPUS_CANDIDATE_MIN, top: CORPUS_TOP });
  });
});

describe('corpus-verify: spajanje smije SAMO nadograditi', () => {
  const pogodak = corpusMatchFrom({ title: 'Sekundarna hipertenzija' }, [rad('Sekundarna hipertenzija')])!;

  it('nadograđuje neodlucene i negativne ishode', () => {
    for (const v of ['not-found', 'not-indexed', 'unchecked'] as const) {
      const out = applyCorpusFallback({ verdict: v }, pogodak);
      expect(out.verdict, v).toBe('found');
      expect(out.matchedTitle, v).toBe('Sekundarna hipertenzija');
    }
  });

  it('NE dira vec potvrdjen CrossRef ishod (DOI je jaci dokaz)', () => {
    const crossref: ExistenceResult = { verdict: 'found', score: 0.95, doiResolved: true };
    expect(applyCorpusFallback(crossref, pogodak)).toEqual(crossref);
    const weak: ExistenceResult = { verdict: 'weak', score: 0.7 };
    expect(applyCorpusFallback(weak, pogodak)).toEqual(weak);
  });

  it('bez pogotka ostavlja ishod netaknut (posteni not-indexed prezivi)', () => {
    const prev: ExistenceResult = { verdict: 'not-indexed', score: 0.2 };
    expect(applyCorpusFallback(prev, null)).toEqual(prev);
  });
});
