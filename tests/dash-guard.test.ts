import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brojCrtica, judgeDashWrite, uOpsegu } from '../scripts/hooks/dash-guard.mjs';

// Crtice se u ovom testu pisu kao escape, jer i tests/ je u opsegu pravila.
const EN = '\u2013';
const EM = '\u2014';

describe('dash-guard: opseg i brojanje', () => {
  it('broji obje crtice, a obicnu crticu i escape tekst ne', () => {
    expect(brojCrtica(`a ${EN} b ${EM} c - d \\u2013`)).toBe(2);
  });

  it('autorske putanje su u opsegu, izvori i fixture nisu', () => {
    expect(uOpsegu('src/ui/app.ts')).toBe(true);
    expect(uOpsegu('docs/agents/README.md')).toBe(true);
    expect(uOpsegu('.claude/skills/brief/SKILL.md')).toBe(true);
    expect(uOpsegu('CLAUDE.md')).toBe(true);
    expect(uOpsegu('data/sources/fpzg.json')).toBe(false);
    expect(uOpsegu('tests/fixtures/docx/a.xml')).toBe(false);
    expect(uOpsegu('docs/generated/x.md')).toBe(false);
    expect(uOpsegu('.claude/katedra-pkg/katedra/SKILL.md')).toBe(false);
  });
});

describe('dash-guard: presuda po delti', () => {
  it('odbija Edit koji uvodi novu en crticu', () => {
    const r = judgeDashWrite({ toolName: 'Edit', rel: 'src/a.ts', toolInput: { old_string: 'x', new_string: `x ${EN} y` }, postojeci: null });
    expect(r.allow).toBe(false);
    expect(r.reason).toContain('src/a.ts');
  });

  it('propusta Edit koji zadrzava postojecu crticu', () => {
    const r = judgeDashWrite({ toolName: 'Edit', rel: 'docs/a.md', toolInput: { old_string: `str. 12${EN}15`, new_string: `str. 12${EN}16` }, postojeci: null });
    expect(r.allow).toBe(true);
  });

  it('propusta Edit koji uklanja crticu', () => {
    const r = judgeDashWrite({ toolName: 'Edit', rel: 'docs/a.md', toolInput: { old_string: `a ${EM} b`, new_string: 'a, b' }, postojeci: null });
    expect(r.allow).toBe(true);
  });

  it('odbija Write nove datoteke s em crticom', () => {
    const r = judgeDashWrite({ toolName: 'Write', rel: 'docs/novo.md', toolInput: { content: `Naslov ${EM} podnaslov` }, postojeci: null });
    expect(r.allow).toBe(false);
  });

  it('propusta Write koji ne povecava broj crtica postojece datoteke', () => {
    const r = judgeDashWrite({ toolName: 'Write', rel: 'docs/a.md', toolInput: { content: `nova ${EN} verzija` }, postojeci: `stara ${EN} verzija` });
    expect(r.allow).toBe(true);
  });

  it('propusta crtice izvan opsega i izvan repozitorija', () => {
    expect(judgeDashWrite({ toolName: 'Write', rel: 'data/sources/x.json', toolInput: { content: EN }, postojeci: null }).allow).toBe(true);
    expect(judgeDashWrite({ toolName: 'Write', rel: null, toolInput: { content: EN }, postojeci: null }).allow).toBe(true);
  });

  it('propusta alate koji nisu Edit ni Write', () => {
    expect(judgeDashWrite({ toolName: 'Read', rel: 'src/a.ts', toolInput: { content: EN }, postojeci: null }).allow).toBe(true);
  });
});

describe('dash-guard: stvarni hook proces (izravni signal)', () => {
  const hook = resolve('scripts/hooks/dash-guard.mjs');

  function pokreni(payload: unknown, cwd: string) {
    return spawnSync(process.execPath, [hook], { input: typeof payload === 'string' ? payload : JSON.stringify(payload), cwd, encoding: 'utf8', timeout: 30_000 });
  }

  it('exit 2 za novu crticu u repou, exit 0 bez nje i za nevaljan ulaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-dash-'));
    try {
      mkdirSync(join(dir, 'docs', 'agents'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'agents', 'tasks.json'), '{"tasks":[]}');
      const file = join(dir, 'docs', 'novo.md');

      const blok = pokreni({ tool_name: 'Write', cwd: dir, tool_input: { file_path: file, content: `a ${EM} b` } }, dir);
      expect(blok.status).toBe(2);
      expect(blok.stderr).toContain('dash-guard: docs/novo.md');

      const ok = pokreni({ tool_name: 'Write', cwd: dir, tool_input: { file_path: file, content: 'a - b' } }, dir);
      expect(ok.status).toBe(0);

      expect(pokreni('nije json', dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
