// @vitest-environment node
/**
 * T84 SC-1: source-check i repair-docx salju naslove u `corpus_search_many`; trosak trigram upita raste
 * s duljinom, a budzet ne prekida RPC u tijeku. Gard: nijedan kljuc poslan bazi nije dulji od 400 code
 * pointa, normalan naslov ide bazi kao corpusKey(naslov), a presuda se racuna nad PUNIM naslovom
 * (Codex R1, R2, R3 na #291).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCorpusCheck } from '../supabase/functions/_shared/corpus-check';
import { corpusKey } from '../src/citations/corpus-verify';
import { corpusTitleBoundProblems, EXPECTED_CORPUS_TITLE_MAX } from './helpers/corpus-title-bound';

/** Lazna baza: biljezi poslane kljuceve i za svaki vraca zadanog kandidata (ili nista). */
function recorder(candidateTitle: string | null = null) {
  const sent: string[][] = [];
  const admin = {
    rpc: async (_fn: string, args: { qs: string[] }) => {
      sent.push(args.qs);
      const data = candidateTitle === null ? [] : args.qs.map((_k, i) => ({
        q_index: i + 1, title: candidateTitle, year: 2020, institution: 'Sveuciliste', repo: 'dabar', url: null,
      }));
      return { data, error: null };
    },
  };
  return { admin, sent };
}

const config = { enabled: true, maxRefs: 60, budgetMs: 45_000, chunkSize: 8 };
/** n razlicitih rijeci, deterministicki (nema ponavljanja trigrama koje bi slucajno podiglo slicnost). */
const words = (seed: string, n: number) => Array.from({ length: n }, (_, i) => `${seed}${i.toString(36)}x${(i * 7919).toString(36)}`).join(' ');

describe('T84 SC-1: duljina kljuca prema korpusu', () => {
  it('60 naslova od 4 200 znakova: svaki kljuc poslan bazi ima najvise 400 code pointa (neovisno o konstanti)', async () => {
    const { admin, sent } = recorder();
    const refs = Array.from({ length: 60 }, () => ({ title: 'abcdefghij'.repeat(420), year: 2020 }));
    const result = await runCorpusCheck(admin, refs, config);
    expect(result?.checked).toBe(60);
    const keys = sent.flat();
    expect(keys).toHaveLength(60);
    expect(Math.max(...keys.map((k) => Array.from(k).length))).toBeLessThanOrEqual(400);
    expect(EXPECTED_CORPUS_TITLE_MAX).toBe(400);
  });

  it('normalan naslov ide bazi kao corpusKey(naslov), bez ikakve promjene (R3)', async () => {
    const { admin, sent } = recorder();
    const title = 'Utjecaj društvenih mreža na političku participaciju mladih';
    await runCorpusCheck(admin, [{ title, year: 2021 }], config);
    expect(sent.flat()).toEqual([corpusKey(title)]);
  });

  it('dug naslov jednak kandidatu ostaje found jer se bodovanje radi nad punim naslovom (R1)', async () => {
    const long = words('naslov', 140); // > 1 000 znakova
    expect(long.length).toBeGreaterThan(1000);
    const { admin } = recorder(long);
    const result = await runCorpusCheck(admin, [{ title: long, year: 2020 }], config);
    expect(result?.found).toHaveLength(1);
    expect(result?.found[0].verdict).toBe('found');
  });

  it('kandidat jednak samo prvih 400 znakova, upit s dugim podnaslovom: rezanje ne smije podici presudu na found (R1)', async () => {
    // Kandidat je tocno prvih 400 znakova upita: rezanje naslova za bodovanje bi ih proglasilo istima.
    const shared = words('zajednicki', 60).slice(0, 400);
    expect(shared.length).toBe(400);
    const query = `${shared} ${words('podnaslova', 120)}`;
    const candidate = shared;
    const { admin, sent } = recorder(candidate);
    const result = await runCorpusCheck(admin, [{ title: query, year: 2020 }], config);
    expect(Array.from(sent.flat()[0]).length).toBeLessThanOrEqual(400);
    expect(result?.found.filter((f) => f.verdict === 'found')).toEqual([]);
  });

  it('izvor: tocno 400, kljuc se reze, naslov za bodovanje ne (baseline garda)', () => {
    const src = readFileSync(resolve(process.cwd(), 'supabase', 'functions', '_shared', 'corpus-check.ts'), 'utf8').replace(/\r\n?/g, '\n');
    expect(corpusTitleBoundProblems(src)).toEqual([]);
  });
});
