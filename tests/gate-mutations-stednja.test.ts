// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUTO_COMPACT_WINDOW } from './helpers/hook-discipline';

/**
 * STEDNJA KONTEKSTA GARD (odluka vlasnika 2026-10-17). Korijenski CLAUDE.md i AGENTS.md pisu se u paru:
 * isti odjeljak, najvise 12 redaka, sest pravila, a pravilo 5 navodi prozor iz `.claude/settings.json`.
 */
/** Odjeljak `## Stednja konteksta` iz markdowna (do sljedeceg `## `), CR normaliziran; null ako ga nema. */
function stednjaSection(markdown: string): string | null {
  const text = markdown.replace(/\r/g, '');
  const start = text.indexOf('\n## Stednja konteksta\n');
  if (start < 0) return null;
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start + 1, next < 0 ? undefined : next).trim();
}

/**
 * CLAUDE.md i AGENTS.md pisu se u paru: isti odjeljak Stednja konteksta, najvise 12 redaka, sest pravila,
 * a pravilo 5 navodi isti prozor kao `env` u postavkama (400.000 = AUTO_COMPACT_WINDOW).
 */
function stednjaPairProblems(claudeMd: string, agentsMd: string): string[] {
  const a = stednjaSection(claudeMd);
  const b = stednjaSection(agentsMd);
  if (a === null || b === null) return [`nema odjeljka: ${a === null ? 'CLAUDE.md' : 'AGENTS.md'}`];
  const problems: string[] = [];
  if (a !== b) problems.push('odjeljci CLAUDE.md i AGENTS.md se razlikuju');
  const lines = a.split('\n');
  if (lines.length > 12) problems.push(`odjeljak ima ${lines.length} redaka`);
  const rules = lines.filter((l) => /^\d+\. /.test(l)).map((l) => Number(l.split('.')[0]));
  if (rules.join(',') !== '1,2,3,4,5,6') problems.push(`pravila: ${rules.join(',')}`);
  const prozor = AUTO_COMPACT_WINDOW.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (!a.includes(`Prozor je ${prozor} tokena`)) problems.push(`pravilo 5 ne navodi prozor ${prozor}`);
  if (!a.includes('STANJE.md')) problems.push('nema STANJE.md');
  return problems;
}

/** PAR CLAUDE.md i AGENTS.md (Stednja konteksta). Mutira se procitani tekst, nikad datoteka. */
describe('mutacije: odjeljak Stednja konteksta u paru CLAUDE.md i AGENTS.md', () => {
  const claude = readFileSync(resolve('CLAUDE.md'), 'utf8');
  const agents = readFileSync(resolve('AGENTS.md'), 'utf8');
  const promijeni = (text: string, from: string, to: string): string => {
    const m = text.replace(from, to);
    expect(m, from).not.toBe(text);
    return m;
  };

  it('BASELINE: stvarni par je cist (i uz CRLF)', () => {
    expect(stednjaPairProblems(claude, agents)).toEqual([]);
    expect(stednjaPairProblems(claude.replace(/\r?\n/g, '\r\n'), agents)).toEqual([]);
  });

  it('mutant: odjeljak uklonjen iz AGENTS.md se hvata', () => {
    expect(stednjaPairProblems(claude, promijeni(agents, '## Stednja konteksta', '## Stednja'))).toEqual(['nema odjeljka: AGENTS.md']);
  });

  it('mutant: AGENTS.md razmimoiden od CLAUDE.md se hvata', () => {
    expect(stednjaPairProblems(claude, promijeni(agents, 'najvise 5 redaka', 'najvise 9 redaka'))).toEqual(['odjeljci CLAUDE.md i AGENTS.md se razlikuju']);
  });

  it('mutant: prozor u pravilu 5 razlicit od settings env se hvata', () => {
    const c = promijeni(claude, 'Prozor je 400.000 tokena', 'Prozor je 1.000.000 tokena');
    const a = promijeni(agents, 'Prozor je 400.000 tokena', 'Prozor je 1.000.000 tokena');
    expect(stednjaPairProblems(c, a)).toEqual(['pravilo 5 ne navodi prozor 400.000']);
  });

  it('mutant: sesto pravilo uklonjeno ili odjeljak dulji od 12 redaka se hvata', () => {
    const pravilo6 = '6. Ne ucitavaj po navici cijele vodice: grep po naslovu, samo odjeljak domene.';
    const c = promijeni(claude, pravilo6, '');
    const a = promijeni(agents, pravilo6, '');
    expect(stednjaPairProblems(c, a)).toEqual(['pravila: 1,2,3,4,5']);
    const dodatak = `${pravilo6}\n   x\n   y\n   z`;
    expect(stednjaPairProblems(promijeni(claude, pravilo6, dodatak), promijeni(agents, pravilo6, dodatak))).toEqual(['odjeljak ima 15 redaka']);
  });
});
