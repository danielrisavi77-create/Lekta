// @vitest-environment node
/**
 * Routing korak 2: `scripts/agents/select-route.mjs` i njegova upotreba u `.claude/workflows/lekta-lean.js`.
 *
 * Workflow skripte nemaju pristup datotekama ni importima, pa lean skripta nosi DOSLOVNU kopiju bloka
 * `DIJELJENO:select-route`. Ovaj test (1) tvrdi da su dvije kopije bajt-identicne, (2) ispituje ponasanje
 * modula nad stvarnim `config/agent-routing.json`, (3) izvodi lean-lokalne blokove (agent-guard, opseg)
 * izolirano, bez pokretanja workflowa, i (4) provjerava sintaksu lean skripte omotane kao u runtimeu
 * (`node --check` pada vec na masteru zbog `return` na vrhu tijela, sto runtime dopusta).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ROUTE_DEFAULTS,
  routeAgentModel,
  routeCheapestVerified,
  routeIsProtected,
  selectRoute,
} from '../scripts/agents/select-route.mjs';

type Route = {
  provider: string;
  model: string | null;
  effort: string;
  fallback: { provider: string; model: string | null; effort: string } | null;
  size: string;
  protected: boolean;
  source: string;
};
type Role = { provider: string; model?: string | null; effort?: string; reviewFallback?: { provider: string; model: string; effort: string } };
type Config = {
  models: Record<string, { status?: string }>;
  costWeight: Record<string, number>;
  routing: Record<string, Record<string, { mode: string; roles: Record<string, Role> }>>;
  protectedPaths: string[];
  effortPolicy: Record<string, string>;
};

const read = (p: string) => readFileSync(resolve(p), 'utf8').replace(/\r/g, '');
const config = (): Config => JSON.parse(read('config/agent-routing.json')) as Config;
const route = (input: Record<string, unknown>) => selectRoute(input) as Route;

const MODULE_SRC = read('scripts/agents/select-route.mjs');
const LEAN_SRC = read('.claude/workflows/lekta-lean.js');

function region(src: string, name: string): string {
  const start = src.indexOf(`// >>> ${name}\n`);
  const end = src.indexOf(`// <<< ${name}\n`);
  if (start < 0 || end < start) throw new Error(`blok ${name} nije pronadjen`);
  return src.slice(start, end + `// <<< ${name}\n`.length);
}

/** Izvodi blokove koda (bez I/O-a) i vraca imenovane funkcije. */
function evalBlocks<T>(code: string, names: string[]): T {
  return new Function(`${code}\nreturn { ${names.join(', ')} };`)() as T;
}

const SIZES = ['S', 'M', 'L'] as const;
const MODE_FOR_SIZE = { S: 'light', M: 'standard', L: 'full' } as const;
const PROTECTED_FILE = 'src/repair/engine.ts';
const PLAIN_FILE = 'docs/agents/ROUTING.md';

describe('dijeljeni blok: modul i lean skripta su identicni', () => {
  it('DIJELJENO:select-route je bajt-identican u oba fajla', () => {
    expect(region(LEAN_SRC, 'DIJELJENO:select-route')).toBe(region(MODULE_SRC, 'DIJELJENO:select-route'));
  });

  it('blok izveden iz lean skripte daje isti izbor kao modul za cijelu matricu', () => {
    const lean = evalBlocks<{ selectRoute: typeof selectRoute }>(region(LEAN_SRC, 'DIJELJENO:select-route'), ['selectRoute']);
    const cfg = config();
    for (const size of SIZES) {
      for (const file of [PLAIN_FILE, PROTECTED_FILE]) {
        for (const phase of ['brief', 'critic', 'implement', 'review', 'gate']) {
          const input = { config: cfg, size, files: [file], phase };
          expect(lean.selectRoute(input)).toEqual(selectRoute(input));
        }
      }
    }
  });
});

describe('selectRoute nad stvarnim configom: svaka kombinacija S/M/L x zasticeno', () => {
  const cfg = config();
  const combos = SIZES.flatMap((size) => [false, true].map((prot) => [size, prot] as const));

  it.each(combos)('%s zasticeno=%s: brief, critic, implement i gate slijede config', (size, prot) => {
    const files = [prot ? PROTECTED_FILE : PLAIN_FILE];
    const roles = cfg.routing[size][String(prot)].roles;
    for (const phase of ['brief', 'critic', 'implement'] as const) {
      const r = route({ config: cfg, size, files, phase });
      expect(r.source).toBe('config');
      expect(r.provider).toBe(roles[phase].provider);
      expect(r.model).toBe(roles[phase].model);
      expect(r.effort).toBe(roles[phase].effort);
      expect(r.protected).toBe(prot);
      expect(r.size).toBe(size);
    }
    const gate = route({ config: cfg, size, files, phase: 'gate' });
    expect(gate.provider).toBe('none');
    expect(gate.fallback).toEqual(ROUTE_DEFAULTS[size].gate);
  });

  it.each(combos)('%s zasticeno=%s: review je drugi provider, a fallback drugi Claude model', (size, prot) => {
    const files = [prot ? PROTECTED_FILE : PLAIN_FILE];
    const impl = route({ config: cfg, size, files, phase: 'implement' });
    const review = route({ config: cfg, size, files, phase: 'review' });
    expect(review.provider).not.toBe(impl.provider);
    expect(review.fallback).not.toBeNull();
    expect(review.fallback!.provider).toBe('claude');
    expect(review.fallback!.model).not.toBe(impl.model);
  });

  it('zasticeno implement ima effort xhigh (politika iz ROUTING.md)', () => {
    for (const size of SIZES) {
      expect(route({ config: cfg, size, files: [PROTECTED_FILE], phase: 'implement' }).effort).toBe('xhigh');
    }
  });

  it('velicina se izvodi iz mode kad size nije zadan, a size ima prednost', () => {
    for (const size of SIZES) {
      expect(route({ config: cfg, mode: MODE_FOR_SIZE[size], files: [PLAIN_FILE], phase: 'brief' }).size).toBe(size);
    }
    expect(route({ config: cfg, mode: 'light', size: 'L', files: [], phase: 'brief' }).size).toBe('L');
    expect(route({ config: cfg, files: [], phase: 'brief' }).size).toBe('M');
  });
});

describe('selectRoute: pravilo drugog providera', () => {
  it('isti provider i isti model bez fallbacka baca gresku', () => {
    const cfg = config();
    cfg.routing.M.false.roles.review = { provider: 'claude', model: 'claude-opus-5', effort: 'high' };
    expect(() => route({ config: cfg, size: 'M', files: [], phase: 'review' })).toThrow(/istog providera i model/);
  });

  it('isti provider s valjanim reviewFallbackom vraca fallback', () => {
    const cfg = config();
    cfg.routing.M.false.roles.review = {
      provider: 'claude', model: 'claude-opus-5', effort: 'high',
      reviewFallback: { provider: 'claude', model: 'claude-sonnet-5', effort: 'medium' },
    };
    const r = route({ config: cfg, size: 'M', files: [], phase: 'review' });
    expect(r.model).toBe('claude-sonnet-5');
    expect(r.source).toBe('config:reviewFallback');
  });

  it('isti provider s drugim modelom je dopusten', () => {
    const cfg = config();
    cfg.routing.M.false.roles.review = { provider: 'claude', model: 'claude-sonnet-5', effort: 'medium' };
    expect(route({ config: cfg, size: 'M', files: [], phase: 'review' }).model).toBe('claude-sonnet-5');
  });

  it('reviewFallback isti kao implementator baca gresku', () => {
    const cfg = config();
    cfg.routing.M.false.roles.review.reviewFallback = { provider: 'claude', model: 'claude-opus-5', effort: 'medium' };
    expect(() => route({ config: cfg, size: 'M', files: [], phase: 'review' })).toThrow(/isti model kao implementator/);
  });
});

describe('selectRoute: neverificiran model se nikad ne vraca', () => {
  it.each(['brief', 'critic', 'implement'] as const)('%s s neverificiranim modelom baca gresku s imenom modela', (phase) => {
    const cfg = config();
    cfg.models['claude-neverificiran-test'] = { input: 1, output: 1, status: 'unverified' };
    cfg.routing.S.false.roles[phase].model = 'claude-neverificiran-test';
    expect(() => route({ config: cfg, size: 'S', files: [], phase })).toThrow(/claude-neverificiran-test/);
  });

  it('neverificiran reviewFallback baca gresku', () => {
    const cfg = config();
    cfg.models['claude-neverificiran-test'] = { input: 1, output: 1, status: 'unverified' };
    cfg.routing.S.false.roles.review.reviewFallback!.model = 'claude-neverificiran-test';
    expect(() => route({ config: cfg, size: 'S', files: [], phase: 'review' })).toThrow(/claude-neverificiran-test/);
  });

  it('model koji uopce nije u configu baca gresku', () => {
    const cfg = config();
    cfg.routing.S.false.roles.brief.model = 'claude-nepostoji-9';
    expect(() => route({ config: cfg, size: 'S', files: [], phase: 'brief' })).toThrow(/claude-nepostoji-9/);
  });
});

describe('selectRoute: prazan ili djelomican config daje zadane vrijednosti, nikad undefined', () => {
  // Zadane vrijednosti = lean skripta prije koraka 2: brief/gate sonnet low; light implementator sonnet medium;
  // standard implementator opus high. Odstupanja (pravilo drugog providera): review S haiku low, M/L sonnet high.
  const EXPECTED = {
    S: { brief: ['claude-sonnet-5', 'low'], critic: ['claude-sonnet-5', 'low'], implement: ['claude-sonnet-5', 'medium'], review: ['claude-haiku-4-5', 'low'], gate: ['claude-sonnet-5', 'low'] },
    M: { brief: ['claude-sonnet-5', 'low'], critic: ['claude-sonnet-5', 'low'], implement: ['claude-opus-5', 'high'], review: ['claude-sonnet-5', 'high'], gate: ['claude-sonnet-5', 'low'] },
    L: { brief: ['claude-sonnet-5', 'low'], critic: ['claude-sonnet-5', 'low'], implement: ['claude-opus-5', 'high'], review: ['claude-sonnet-5', 'high'], gate: ['claude-sonnet-5', 'low'] },
  } as const;

  it.each(SIZES)('%s: {} config vraca dokumentirane zadane vrijednosti za svaku fazu', (size) => {
    for (const [phase, [model, effort]] of Object.entries(EXPECTED[size])) {
      for (const cfg of [{}, undefined, null, { routing: {} }]) {
        const r = route({ config: cfg, size, files: [], phase });
        expect(r.provider).toBe('claude');
        expect(r.model).toBe(model);
        expect(r.effort).toBe(effort);
        expect(r.source).toBe('default');
      }
    }
  });

  it('zadani implement u zasticenom dobiva xhigh', () => {
    expect(route({ config: {}, size: 'M', files: [PROTECTED_FILE], protectedPaths: ['src/repair'], phase: 'implement' }).effort).toBe('xhigh');
  });

  it('config bez critic uloge bira najjeftiniji verificirani Claude model', () => {
    const cfg = config();
    for (const size of SIZES) for (const flag of ['false', 'true']) delete cfg.routing[size][flag].roles.critic;
    expect(routeCheapestVerified(cfg)).toBe('claude-haiku-4-5');
    const r = route({ config: cfg, size: 'M', files: [], phase: 'critic' });
    expect(r.model).toBe('claude-haiku-4-5');
    expect(r.effort).toBe('low');
  });

  it('nepoznata faza baca gresku', () => {
    expect(() => route({ config: {}, phase: 'design' })).toThrow(/nepoznata faza/);
  });
});

describe('routeIsProtected i routeAgentModel', () => {
  const paths = ['src/repair', 'src/citations', 'src/docx', 'supabase', 'security'];
  it('prepoznaje zasticene staze i ne hvata slicna imena', () => {
    expect(routeIsProtected(['src/repair/a.ts'], paths)).toBe(true);
    expect(routeIsProtected(['src\\docx\\x.ts'], paths)).toBe(true);
    expect(routeIsProtected(['./supabase/functions/x/index.ts'], paths)).toBe(true);
    expect(routeIsProtected(['scripts/security/guard.mjs'], paths)).toBe(true);
    expect(routeIsProtected(['src/repairs-helper.ts', 'docs/supabase.md'], paths)).toBe(false);
    expect(routeIsProtected([], paths)).toBe(false);
  });

  it('pretvara ID modela u alias za agent()', () => {
    expect(routeAgentModel('claude-opus-5')).toBe('opus');
    expect(routeAgentModel('claude-sonnet-5')).toBe('sonnet');
    expect(routeAgentModel('claude-haiku-4-5')).toBe('haiku');
    expect(routeAgentModel(null)).toBeUndefined();
  });
});

describe('lekta-lean.js: sintaksa, bez literalnih modela, popravci (a)(b)(c)', () => {
  it('tijelo se parsira kao async funkcija (tako ga izvodi workflow runtime)', () => {
    const body = LEAN_SRC.replace(/^export const meta = /m, 'const meta = ');
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...a: string[]) => unknown;
    expect(() => new AsyncFunction('args', 'agent', 'phase', 'log', 'parallel', 'pipeline', 'budget', 'workflow', body)).not.toThrow();
  });

  it('agent() pozivi vise ne nose literalni model osim dizajnera (nije faza routinga)', () => {
    const literal = [...LEAN_SRC.matchAll(/label: '([^']+)', model: '(sonnet|opus|haiku)'/g)].map((m) => m[1]);
    expect(literal).toEqual(['dizajner']);
    expect((LEAN_SRC.match(/\.\.\.routeFor\('/g) || []).length).toBeGreaterThanOrEqual(8);
  });

  it('(a) valjan payload koji spominje "usage limit" nije LimitStop', () => {
    const g = evalBlocks<{ classifyAgentResult: (r: unknown) => string }>(region(LEAN_SRC, 'LEAN:agent-guard'), ['classifyAgentResult']);
    expect(g.classifyAgentResult({ testSummary: 'dodan test za usage limit poruku' })).toBe('ok');
    expect(g.classifyAgentResult('You have reached your usage limit.')).toBe('limit');
    expect(g.classifyAgentResult({})).toBe('ok');
    expect(g.classifyAgentResult(null)).toBe('failure');
  });

  it('(b) notProven nije obvezan u IMPL_SCHEMA i normalizira se na []', () => {
    const impl = LEAN_SRC.slice(LEAN_SRC.indexOf('const IMPL_SCHEMA'), LEAN_SRC.indexOf('const REVIEW_SCHEMA'));
    expect(impl).toMatch(/notProven: \{ type: 'array', items: \{ type: 'string' \}, default: \[\] \}/);
    expect(impl.match(/required: \[([^\]]*)\]/)![1]).not.toContain('notProven');
    const code = region(LEAN_SRC, 'DIJELJENO:select-route') + region(LEAN_SRC, 'LEAN:opseg');
    const o = evalBlocks<{ normalizeImpl: (i: unknown) => { notProven: unknown } }>(code, ['normalizeImpl']);
    expect(o.normalizeImpl({ branch: 'x' }).notProven).toEqual([]);
    expect(o.normalizeImpl({ notProven: ['Word'] }).notProven).toEqual(['Word']);
  });

  it('(c) report dobiva Neto redaka i Nove ovisnosti samo u valjanom obliku', () => {
    const code = region(LEAN_SRC, 'DIJELJENO:select-route') + region(LEAN_SRC, 'LEAN:opseg');
    const o = evalBlocks<{ opsegRetci: (s: unknown) => string[] }>(code, ['opsegRetci']);
    expect(o.opsegRetci({ netoRedaka: '+12/-3', noveOvisnosti: 'nema' })).toEqual(['Neto redaka: +12/-3', 'Nove ovisnosti: nema']);
    expect(o.opsegRetci({ netoRedaka: 'Neto redaka: +1/-0', noveOvisnosti: 'Nove ovisnosti: zod' })).toEqual(['Neto redaka: +1/-0', 'Nove ovisnosti: zod']);
    expect(o.opsegRetci({ netoRedaka: 'puno', noveOvisnosti: 'nema | <popis paketa>' })).toEqual(['Neto redaka: nije izmjereno', 'Nove ovisnosti: nije izmjereno']);
    expect(o.opsegRetci(undefined)).toEqual(['Neto redaka: nije izmjereno', 'Nove ovisnosti: nije izmjereno']);
    expect(LEAN_SRC).toContain('...opsegRetci(verdict)');
    expect(LEAN_SRC).toContain('...opsegRetci(gate)');
  });

  it('kriticar: zasticena staza bez args.protected je problem, s njim nije', () => {
    const code = region(LEAN_SRC, 'DIJELJENO:select-route') + region(LEAN_SRC, 'LEAN:opseg');
    const o = evalBlocks<{ criticProtectedProblems: (f: string[], p: string[], d: boolean) => string[] }>(code, ['criticProtectedProblems']);
    const paths = config().protectedPaths;
    expect(o.criticProtectedProblems([PLAIN_FILE], paths, false)).toEqual([]);
    expect(o.criticProtectedProblems([PROTECTED_FILE], paths, false)).toHaveLength(1);
    expect(o.criticProtectedProblems([PROTECTED_FILE], paths, true)).toEqual([]);
  });

  it('kriticar se pokrece prije implementatora u oba moda i los plan vraca rezultat bez implementacije', () => {
    for (const fn of ['async function runLight()', 'async function runStandard()']) {
      const body = LEAN_SRC.slice(LEAN_SRC.indexOf(fn));
      const criticAt = body.indexOf('await runCritic(');
      const stopAt = body.indexOf('if (!critic.ok) return criticStopResult(critic)');
      const implAt = body.indexOf("phase('Implementacija')");
      expect(criticAt).toBeGreaterThan(0);
      expect(stopAt).toBeGreaterThan(criticAt);
      expect(implAt).toBeGreaterThan(stopAt);
    }
    expect(LEAN_SRC).toContain("'STATUS: ZAUSTAVLJENO (kriticar)'");
  });
});
