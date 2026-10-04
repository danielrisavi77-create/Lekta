/**
 * T84 SC-1: source-check i repair-docx salju naslove u `corpus_search_many`; trosak trigram upita raste
 * s duljinom naslova, a budzet ne prekida RPC u tijeku. Gard: nijedan kljuc poslan bazi nije dulji od
 * CORPUS_TITLE_MAX, a normalan naslov prolazi nepromijenjen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CORPUS_TITLE_MAX, runCorpusCheck } from '../supabase/functions/_shared/corpus-check';
import { corpusTitleBoundProblems } from './helpers/corpus-title-bound';

function recorder() {
  const sent: string[][] = [];
  const admin = {
    rpc: async (_fn: string, args: { qs: string[] }) => {
      sent.push(args.qs);
      return { data: [], error: null };
    },
  };
  return { admin, sent };
}

const config = { enabled: true, maxRefs: 60, budgetMs: 45_000, chunkSize: 8 };

describe('T84 SC-1: duljina naslova prema korpusu', () => {
  it('predug naslov se reze prije RPC-a, za svih 60 referenci', async () => {
    const { admin, sent } = recorder();
    const long = 'abcdefghij'.repeat(420); // 4 200 znakova [a-z]
    const refs = Array.from({ length: 60 }, () => ({ title: long, year: 2020 }));
    const result = await runCorpusCheck(admin, refs, config);
    expect(result?.checked).toBe(60);
    const keys = sent.flat();
    expect(keys).toHaveLength(60);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(CORPUS_TITLE_MAX);
  });

  it('normalan naslov stize do baze u istom obliku kao prije (kontrola)', async () => {
    const { admin, sent } = recorder();
    await runCorpusCheck(admin, [{ title: 'Utjecaj drustvenih mreza na politicku participaciju mladih', year: 2021 }], config);
    expect(sent.flat()[0].length).toBeGreaterThan(20);
    expect(sent.flat()[0].length).toBeLessThan(CORPUS_TITLE_MAX);
  });

  it('izvor: naslov se reze na CORPUS_TITLE_MAX prije slanja bazi (baseline garda)', () => {
    const src = readFileSync(resolve(process.cwd(), 'supabase', 'functions', '_shared', 'corpus-check.ts'), 'utf8').replace(/\r\n?/g, '\n');
    expect(corpusTitleBoundProblems(src)).toEqual([]);
  });
});
