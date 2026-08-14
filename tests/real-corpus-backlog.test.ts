/**
 * Drift guard za real-corpus backlog (docs/generated/real-corpus-backlog.json/.md).
 *
 * Backlog je GENERIRAN iz fakultetske matrice (tests/helpers/faculty-matrix.ts). Bez ovog
 * testa bi prvi novi stvarni DOCX uzorak ili profil ostavio backlog koji tvrdi staru
 * rang-listu. Kad padne: `npm run repair-real-corpus-backlog` pa commitaj regenerirani izlaz.
 */
import { describe, expect, it } from 'vitest';
import bakedJson from '../docs/generated/real-corpus-backlog.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRealCorpusBacklog, renderRealCorpusBacklogMarkdown, type RealCorpusBacklogReport } from './helpers/real-corpus-backlog';

const fresh = buildRealCorpusBacklog();
const bakedMarkdown = readFileSync(resolve(__dirname, '../docs/generated/real-corpus-backlog.md'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('real-corpus backlog je u koraku s fakultetskom matricom', () => {
  it('commitani JSON je bit-identican svjezem izracunu (inace: npm run repair-real-corpus-backlog)', () => {
    expect(fresh).toEqual(bakedJson as unknown as RealCorpusBacklogReport);
  });

  it('commitani markdown je bit-identican svjezem renderu', () => {
    expect(renderRealCorpusBacklogMarkdown(fresh)).toBe(bakedMarkdown);
  });

  it('nije prazan dok god ima profila bez stvarnog DOCX uzorka (sanity)', () => {
    expect(fresh.profilesWithoutSample).toBeGreaterThan(0);
    expect(fresh.entries.length).toBe(fresh.profilesWithoutSample);
  });

  it('rangirano je silazno po offeredOptionCount', () => {
    for (let i = 1; i < fresh.entries.length; i++) {
      expect(fresh.entries[i - 1].offeredOptionCount).toBeGreaterThanOrEqual(fresh.entries[i].offeredOptionCount);
    }
  });
});
