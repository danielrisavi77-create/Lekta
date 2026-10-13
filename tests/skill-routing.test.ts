// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { korakToka, pocetnoStanje, pogodak, sazetak, upitiProblemi } from '../scripts/agents/skill-routing.mjs';

interface RoutingUpit {
  id: string;
  ocekivano: string | null | Array<string | null>;
  upit: string;
}

/** Proteze dogadjaje kroz parser kao CLI: prvi ishod pobjeduje. */
function prviIshod(dogadjaji: Array<Record<string, unknown>>) {
  let stanje = pocetnoStanje();
  for (const ev of dogadjaji) {
    const k = korakToka(stanje, ev);
    stanje = k.stanje;
    if (k.ishod) return k.ishod;
  }
  return null;
}

const se = (event: Record<string, unknown>) => ({ type: 'stream_event', event });
const pocetakAlata = (name: string) => se({ type: 'content_block_start', content_block: { type: 'tool_use', name } });
const delta = (partial_json: string) => se({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json } });

describe('skill-routing: parser toka', () => {
  it('Skill poziv sastavljen iz vise delti daje ime skilla', () => {
    const ishod = prviIshod([
      { type: 'system', subtype: 'init' },
      se({ type: 'content_block_start', content_block: { type: 'text' } }),
      pocetakAlata('Skill'),
      delta('{"skill": "ci-'),
      delta('crveno"}'),
      se({ type: 'content_block_stop' }),
    ]);
    expect(ishod).toEqual({ alat: 'Skill', skill: 'ci-crveno' });
  });

  it('prvi alat koji nije Skill zavrsava mjerenje bez skilla', () => {
    expect(prviIshod([pocetakAlata('Bash'), pocetakAlata('Skill')])).toEqual({ alat: 'Bash', skill: null });
  });

  it('odgovor bez ijednog alata je nijedan skill', () => {
    expect(prviIshod([se({ type: 'content_block_start', content_block: { type: 'text' } }), se({ type: 'message_stop' })]))
      .toEqual({ alat: null, skill: null });
    expect(prviIshod([{ type: 'result', subtype: 'success' }])).toEqual({ alat: null, skill: null });
  });

  it('nepotpun tok nema ishod (CLI ga broji kao PREKID ili TIMEOUT)', () => {
    expect(prviIshod([pocetakAlata('Skill'), delta('{"skill": "ci')])).toBeNull();
  });
});

describe('skill-routing: ocjena', () => {
  it('ocekivano moze biti ime, null ili popis prihvatljivih', () => {
    expect(pogodak('ci-crveno', 'ci-crveno')).toBe(true);
    expect(pogodak('ci-crveno', 'pr-merge')).toBe(false);
    expect(pogodak(null, null)).toBe(true);
    expect(pogodak(null, 'brief')).toBe(false);
    expect(pogodak([null, 'anthropic-skills:fpzg-academic-writing'], 'anthropic-skills:fpzg-academic-writing')).toBe(true);
    expect(pogodak([null, 'anthropic-skills:fpzg-academic-writing'], 'profil-pravilo')).toBe(false);
  });

  it('prekid i timeout su promasaji, ne preskoci', () => {
    const s = sazetak([
      { id: 'a', ocekivano: 'brief', alat: 'Skill', skill: 'brief' },
      { id: 'a', ocekivano: 'brief', alat: 'TIMEOUT', skill: null },
      { id: 'b', ocekivano: null, alat: 'Bash', skill: null },
    ]);
    expect(s.pogodaka).toBe(2);
    expect(s.ukupno).toBe(3);
    expect(s.promasaji.map((p) => p.id)).toEqual(['a']);
    expect(s.upiti.find((u) => u.id === 'a')?.dobiveno).toEqual(['brief', '(TIMEOUT)']);
  });
});

describe('skill-routing: skup upita u repou', () => {
  const upiti = JSON.parse(readFileSync(resolve('scripts/agents/skill-routing-upiti.json'), 'utf8')) as RoutingUpit[];
  const skillovi = readdirSync(resolve('.claude/skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  it('pokriva svaki skill, imenuje samo postojece i ima negativne kontrole', () => {
    expect(skillovi.length).toBeGreaterThan(0);
    expect(upitiProblemi(upiti, skillovi)).toEqual([]);
  });

  it('gard javlja nepokriven skill, nepostojece ime, osobni skill kao jedino i premalo negativnih', () => {
    const mali: RoutingUpit[] = [
      { id: 'a', ocekivano: 'brief', upit: 'x' },
      { id: 'b', ocekivano: 'nema-ga', upit: 'y' },
      { id: 'c', ocekivano: 'anthropic-skills:fpzg-academic-writing', upit: 'z' },
      { id: 'd', ocekivano: null, upit: 'w' },
    ];
    expect(upitiProblemi(mali, ['brief', 'ci-crveno'])).toEqual([
      'nepostojeci skill nema-ga: b',
      'osobni skill kao jedino ocekivanje: c',
      'skill bez pozitivnog upita: ci-crveno',
      'premalo negativnih kontrola: 1 < 3',
    ]);
  });

  it('svaki skill u .claude/skills ima SKILL.md (inace ga mjerenje ne vidi)', () => {
    for (const s of skillovi) expect(readFileSync(join(resolve('.claude/skills'), s, 'SKILL.md'), 'utf8')).toMatch(/^---\nname:/);
  });
});
