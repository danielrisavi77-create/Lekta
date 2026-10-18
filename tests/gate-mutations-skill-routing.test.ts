// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SKILL-ROUTING (mjerenje usmjeravanja skillova, odluka vlasnika 2026-10-13). Mutira se KOPIJA
 * `scripts/agents/skill-routing.mjs` u privremenom direktoriju, a presudu racuna cisti node proces.
 * Tri tvrdnje: parser staje na prvom alatu, timeout je promasaj, gard skupa upita trazi pokrivenost
 * svakog skilla i postojanje imenovanog skilla.
 */
describe('mutacije: scripts/agents/skill-routing.mjs', () => {
  const izvor = readFileSync(resolve(process.cwd(), 'scripts/agents/skill-routing.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const upiti = JSON.parse(readFileSync(resolve('scripts/agents/skill-routing-upiti.json'), 'utf8')) as unknown[];
  const skillovi = readdirSync(resolve('.claude/skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  // Bash pa Skill: ispravno mjerenje staje na Bashu (model nije prvo posegnuo za skillom).
  const tok = [
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Bash' } } },
    { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Skill' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { partial_json: '{"skill":"brief"}' } } },
    { type: 'stream_event', event: { type: 'content_block_stop' } },
  ];
  const timeout = [{ id: 'a', ocekivano: 'brief', alat: 'TIMEOUT', skill: null }];
  // Ulazi garda: stvarni skup uz jedan skill vise (nepokriven) i bez skilla `brief` (nepostojece ime).
  const sNovim = [...skillovi, 'novi-skill'];
  const bezBriefa = skillovi.filter((s) => s !== 'brief');

  interface Presuda { ishod: unknown; promasaja: number; nepokriven: string[]; nepostojeci: string[] }

  function izracunaj(source: string): Presuda {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-routing-mut-'));
    try {
      const file = join(dir, 'skill-routing.mjs');
      writeFileSync(file, source);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `let s = m.pocetnoStanje(), ishod = null;`
        + `for (const ev of ${JSON.stringify(tok)}) { const k = m.korakToka(s, ev); s = k.stanje; if (k.ishod) { ishod = k.ishod; break; } }`
        + `const upiti = ${JSON.stringify(upiti)};`
        + `process.stdout.write(JSON.stringify({ ishod, promasaja: m.sazetak(${JSON.stringify(timeout)}).promasaji.length,`
        + ` nepokriven: m.upitiProblemi(upiti, ${JSON.stringify(sNovim)}), nepostojeci: m.upitiProblemi(upiti, ${JSON.stringify(bezBriefa)}) }));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return JSON.parse(res.stdout) as Presuda;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline: stvarni izvor staje na prvom alatu, broji timeout i hvata oba kvara skupa', () => {
    expect(izracunaj(izvor)).toEqual({
      ishod: { alat: 'Bash', skill: null },
      promasaja: 1,
      nepokriven: ['skill bez pozitivnog upita: novi-skill'],
      nepostojeci: ['nepostojeci skill brief: brief-t57', 'nepostojeci skill brief: h-nova-sesija'],
    });
  });

  it('mutant: alat koji nije Skill se preskace (trazi se bilo koji Skill) se hvata', () => {
    const mutant = izvor.replace("if (alat !== 'Skill') return { stanje, ishod: { alat, skill: null } };", "if (alat !== 'Skill') return { stanje, ishod: null };");
    expect(mutant).not.toBe(izvor);
    expect(izracunaj(mutant).ishod).toEqual({ alat: 'Skill', skill: 'brief' });
  });

  it('mutant: timeout se ne broji u prolaze (tihi preskok) se hvata', () => {
    const mutant = izvor.replace('    s.prolaza += 1;\n', "    if (r.alat === 'TIMEOUT') continue;\n    s.prolaza += 1;\n");
    expect(mutant).not.toBe(izvor);
    expect(izracunaj(mutant).promasaja).toBe(0);
  });

  it('mutant: gard bez provjere pokrivenosti propusta novi skill bez upita', () => {
    const mutant = izvor.replace("  for (const s of skillovi) if (!pokriveni.has(s)) problemi.push(`skill bez pozitivnog upita: ${s}`);\n", '');
    expect(mutant).not.toBe(izvor);
    expect(izracunaj(mutant).nepokriven).toEqual([]);
  });

  it('mutant: gard koji vjeruje imenu propusta skill koji vise ne postoji', () => {
    const mutant = izvor.replace('      if (!skillovi.includes(o)) problemi.push(`nepostojeci skill ${o}: ${u.id}`);\n      else pokriveni.add(o);', '      pokriveni.add(o);');
    expect(mutant).not.toBe(izvor);
    expect(izracunaj(mutant).nepostojeci).toEqual([]);
  });
});
