// @vitest-environment node
/**
 * Gard nad `config/agent-routing.json` (korak 1 globalnog workflowa: data-driven routing, bez
 * modela u hooku). Provjerava OBLIK i PRAVILA configa, ne ponasanje neke skripte koja ga cita
 * (ta skripta je korak 2 i namjerno se ovdje ne dira).
 *
 * Citano izravno s diska, JSON.parse, nikad greppano niti kopirano u ovaj test.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { botPathViolations, pathMatches, resolveBot } from '../scripts/agents/grok-bots.mjs';
import {
  allRoutingRoleEntries,
  findBotsImplementingProtected,
  findImplementEffortDrift,
  type BotSpec,
  findSameProviderWithoutFallback,
  findUnverifiedModelUsages,
  ROUTING_PROTECTED_KEYS,
  ROUTING_SIZES,
} from './helpers/agent-routing-checks';

const CONFIG_PATH = fileURLToPath(new URL('../config/agent-routing.json', import.meta.url));

interface RoutingRole {
  provider: string;
  model?: string | null;
  effort?: string;
  reviewFallback?: { provider: string; model: string; effort: string };
  note?: string;
}

interface RoutingCell {
  mode: string;
  note?: string;
  roles: Record<string, RoutingRole>;
}

interface RoutingConfig {
  version: number;
  pricingSnapshot: { source: string; unit: string };
  quotaNotDollars: boolean;
  models: Record<string, {
    input: number;
    output: number;
    status?: string;
    roles?: string[];
    neverImplements?: boolean;
    note?: string;
    defaultEffort?: string;
  }>;
  costWeight: Record<string, number>;
  providers: Record<string, { billing: string; models?: string[]; model?: string; status?: string }>;
  effortPolicy: Record<string, string>;
  routing: Record<string, Record<string, RoutingCell>>;
  protectedPaths: string[];
}

function readConfig(): RoutingConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as RoutingConfig;
}

const SIZES = ROUTING_SIZES;
const PROTECTED_KEYS = ROUTING_PROTECTED_KEYS;
const VALID_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']); // 'max' NIJE dodijeljiv, samo politika

/** Tanak omotac oko dijeljenog helpera, tipiziran na lokalni RoutingConfig ovog testa. */
function allRoutingRoles(config: RoutingConfig) {
  return allRoutingRoleEntries(config as unknown as import('./helpers/agent-routing-checks').RoutingConfig);
}

describe('config/agent-routing.json: valjan JSON i osnovni oblik', () => {
  it('parsira se kao JSON i ima ocekivane top-level kljuceve', () => {
    const config = readConfig();
    expect(config.version).toBe(1);
    expect(config.pricingSnapshot?.source).toBeTruthy();
    expect(config.pricingSnapshot?.unit).toBeTruthy();
    expect(config.quotaNotDollars).toBe(true);
    expect(typeof config.models).toBe('object');
    expect(typeof config.routing).toBe('object');
  });
});

describe('config/agent-routing.json: svaka kombinacija size x protected postoji', () => {
  it.each(SIZES.flatMap((size) => PROTECTED_KEYS.map((flag) => [size, flag] as const)))(
    'routing.%s.%s postoji i ima mode + roles',
    (size, protectedFlag) => {
      const config = readConfig();
      const cell = config.routing[size]?.[protectedFlag];
      expect(cell, `routing.${size}.${protectedFlag} nedostaje`).toBeTruthy();
      expect(typeof cell.mode).toBe('string');
      expect(cell.roles.brief).toBeTruthy();
      expect(cell.roles.implement).toBeTruthy();
      expect(cell.roles.review).toBeTruthy();
      expect(cell.roles.gate).toBeTruthy();
    },
  );
});

describe('config/agent-routing.json: zasticeno uvijek ide na full', () => {
  it.each(SIZES)('routing.%s.true (zasticeno) ima mode "full"', (size) => {
    const config = readConfig();
    expect(config.routing[size]?.true?.mode).toBe('full');
  });
});

describe('config/agent-routing.json: pravilo drugog providera', () => {
  it('nijedna kombinacija ne narusava review != implement provider (ili nema valjan reviewFallback)', () => {
    const config = readConfig();
    const problems = findSameProviderWithoutFallback(config as unknown as import('./helpers/agent-routing-checks').RoutingConfig);
    expect(problems, problems.join('; ')).toHaveLength(0);
  });
});

describe('config/agent-routing.json: effort je iz dopustenog skupa i nikad "max"', () => {
  it('svaka uloga u routingu ima effort iz {low, medium, high, xhigh}', () => {
    const config = readConfig();
    const roles = allRoutingRoles(config);
    expect(roles.length).toBeGreaterThan(0);
    for (const { size, protectedFlag, roleName, role } of roles) {
      if (roleName === 'gate') continue; // gate.provider je 'none', bez efforta/modela
      expect(role.effort, `${size}/${protectedFlag}/${roleName} effort nedostaje`).toBeTruthy();
      expect(
        VALID_EFFORTS.has(role.effort as string),
        `${size}/${protectedFlag}/${roleName} ima nevaljan effort '${role.effort}'`,
      ).toBe(true);
      expect(role.effort).not.toBe('max');
      if (role.reviewFallback) {
        expect(VALID_EFFORTS.has(role.reviewFallback.effort)).toBe(true);
        expect(role.reviewFallback.effort).not.toBe('max');
      }
    }
  });

  it('B1: implementator je claude-opus-5-5, effortPolicy implement medium i implementProtected high', () => {
    const config = readConfig();
    expect(config.effortPolicy.implement).toBe('medium');
    expect(config.effortPolicy.implementProtected).toBe('high');
    expect(config.models['claude-opus-5-5']?.status).toBe('verified');
    const problems = findImplementEffortDrift(config as unknown as import('./helpers/agent-routing-checks').RoutingConfig);
    expect(problems, problems.join('; ')).toHaveLength(0);
    for (const size of SIZES) {
      expect(config.routing[size].true.roles.implement.model).toBe('claude-opus-5-5');
    }
    expect(config.routing.M.false.roles.implement.model).toBe('claude-opus-5-5');
    expect(config.routing.L.false.roles.implement.model).toBe('claude-opus-5-5');
    for (const { roleName, role } of allRoutingRoles(config)) {
      if (roleName === 'implement') expect(role.effort).not.toBe('xhigh');
    }
  });

  it('gate uloga nikad ne zove model (provider: "none")', () => {
    const config = readConfig();
    for (const size of SIZES) {
      for (const flag of PROTECTED_KEYS) {
        expect(config.routing[size]?.[flag]?.roles.gate?.provider).toBe('none');
      }
    }
  });
});

describe('config/agent-routing.json: costWeight je tocno izracunat', () => {
  it('claude-sonnet-5 = 1 (referentna tezina)', () => {
    const config = readConfig();
    expect(config.costWeight['claude-sonnet-5']).toBe(1);
  });

  it('svaka costWeight vrijednost odgovara (input + output) / (sonnet-5 input + output)', () => {
    const config = readConfig();
    const sonnet = config.models['claude-sonnet-5'];
    expect(sonnet).toBeTruthy();
    const reference = sonnet.input + sonnet.output;
    for (const [modelId, weight] of Object.entries(config.costWeight)) {
      const model = config.models[modelId];
      expect(model, `costWeight referencira nepostojeci model ${modelId}`).toBeTruthy();
      const expected = (model.input + model.output) / reference;
      expect(weight, `costWeight[${modelId}] ocekivano ${expected}, dobiveno ${weight}`).toBeCloseTo(expected, 6);
    }
  });
});

describe('config/agent-routing.json: unverified modeli ne smiju biti u nijednoj ulozi', () => {
  it('nijedan model sa status "unverified" ne pojavljuje se kao role.model u routingu', () => {
    const config = readConfig();
    const problems = findUnverifiedModelUsages(config as unknown as import('./helpers/agent-routing-checks').RoutingConfig);
    expect(problems, problems.join('; ')).toHaveLength(0);

    // Dokaz da provjera ima sto testirati i kad stvarni config nema nijedan neverificiran model
    // (claude-opus-5-5 je verificiran 28. 9.): sinteticki neverificiran model u kopiji mora biti uhvacen.
    const kopija = JSON.parse(JSON.stringify(config)) as import('./helpers/agent-routing-checks').RoutingConfig;
    kopija.models['claude-neverificiran-test'] = { status: 'unverified' };
    kopija.routing.S.false.roles.implement.model = 'claude-neverificiran-test';
    expect(findUnverifiedModelUsages(kopija).some((p) => p.includes('claude-neverificiran-test'))).toBe(true);
  });

  it('claude-fable-5-1 (neverImplements) se ne pojavljuje kao implement uloga', () => {
    const config = readConfig();
    const roles = allRoutingRoles(config);
    for (const { roleName, role } of roles) {
      if (roleName === 'implement') {
        expect(role.model).not.toBe('claude-fable-5-1');
      }
    }
  });
});

describe('config/agent-routing.json: zasticena podrucja postoje i pokrivaju CLAUDE.md popis', () => {
  it('protectedPaths sadrzi repair, citations, docx, supabase i security', () => {
    const config = readConfig();
    const joined = config.protectedPaths.join('|');
    expect(joined).toMatch(/repair/);
    expect(joined).toMatch(/citations/);
    expect(joined).toMatch(/docx/);
    expect(joined).toMatch(/supabase/);
    expect(joined).toMatch(/security/);
  });
});

describe('config/agent-routing.json: korak 2, faza critic', () => {
  it('svaka kombinacija ima critic ulogu: claude, effort low, verificiran i najjeftiniji model', () => {
    const config = readConfig();
    const verified = Object.entries(config.models)
      .filter(([id, spec]) => spec.status === 'verified' && id.startsWith('claude-'))
      .map(([id]) => id)
      .sort((a, b) => (config.costWeight[a] ?? Infinity) - (config.costWeight[b] ?? Infinity));
    expect(verified.length).toBeGreaterThan(0);
    for (const size of SIZES) {
      for (const flag of PROTECTED_KEYS) {
        const critic = config.routing[size]?.[flag]?.roles.critic;
        expect(critic, `routing.${size}.${flag}.roles.critic nedostaje`).toBeTruthy();
        expect(critic.provider).toBe('claude');
        expect(critic.effort).toBe('low');
        expect(critic.model).toBe(verified[0]);
      }
    }
  });

  it('effortPolicy ima critic: low', () => {
    expect(readConfig().effortPolicy.critic).toBe('low');
  });
});

describe('config/agent-routing.json: Grok botovi (odluka vlasnika 27. 9.)', () => {
  const raw = () => JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as RoutingConfig & { bots: Record<string, BotSpec & { effort: string }> };
  const providers = JSON.parse(readFileSync(fileURLToPath(new URL('../config/agent-providers.json', import.meta.url)), 'utf8')) as {
    agents: Record<string, { command: string; role: string }>;
  };
  const EXPECTED: Record<string, { phases: string[]; runnerPhase: string; sandbox: string; effort: string }> = {
    'grok-review': { phases: ['review'], runnerPhase: 'review', sandbox: 'read-only', effort: 'medium' },
    'grok-scout': { phases: ['scout', 'critic'], runnerPhase: 'review', sandbox: 'read-only', effort: 'low' },
    'grok-docs': { phases: ['implement'], runnerPhase: 'implement', sandbox: 'workspace', effort: 'medium' },
    'grok-triage': { phases: ['review'], runnerPhase: 'review', sandbox: 'read-only', effort: 'low' },
  };

  it('postoje tocno cetiri bota, svaki na provideru grok s ocekivanim fazama, sandboxom i effortom', () => {
    const { bots } = raw();
    expect(Object.keys(bots).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(raw().providers.grok.status).toBe('verified');
    for (const [name, exp] of Object.entries(EXPECTED)) {
      const bot = bots[name];
      expect(bot.provider, name).toBe('grok');
      expect(bot.phases, name).toEqual(exp.phases);
      expect(bot.runnerPhase, name).toBe(exp.runnerPhase);
      expect(bot.sandbox, name).toBe(exp.sandbox);
      expect(bot.effort, name).toBe(exp.effort);
      expect(providers.agents[bot.agent!]?.command, `${name}.agent mora biti grok agent`).toBe('grok');
    }
  });

  it('bot bez implement je read-only i nema allowedPaths', () => {
    for (const [name, bot] of Object.entries(raw().bots)) {
      if (bot.runnerPhase === 'implement') continue;
      expect(bot.sandbox, name).toBe('read-only');
      expect(bot.allowedPaths, name).toBeUndefined();
    }
  });

  it('grok-docs ima allowlist samo za dokumentaciju i zabranjuje src, supabase, data i scripts', () => {
    const docs = raw().bots['grok-docs'];
    expect(docs.allowedPaths).toEqual(['docs/**', '**/*.md', 'docs/agents/tasks.json']);
    for (const zabrana of ['src/**', 'supabase/**', 'data/**', 'scripts/**']) expect(docs.forbiddenPaths).toContain(zabrana);
    expect(botPathViolations(docs, ['docs/agents/ROUTING.md', 'README.md', 'docs/agents/tasks.json'])).toEqual([]);
    expect(botPathViolations(docs, ['src/repair/CLAUDE.md', 'scripts/x.mjs', 'package.json', 'data/a.json']))
      .toEqual(['data/a.json', 'package.json', 'scripts/x.mjs', 'src/repair/CLAUDE.md']);
    expect(pathMatches('**/*.md', 'a/b/c.md')).toBe(true);
    expect(pathMatches('docs/**', 'docsx/a.md')).toBe(false);
  });

  it('nijedan bot ne implementira nad protectedPaths', () => {
    const config = raw();
    expect(findBotsImplementingProtected(config.bots, config.protectedPaths, botPathViolations)).toEqual([]);
  });

  it('runner protectedPaths bez kose crte hvata segment bilo gdje, kao selectRoute', () => {
    const config = raw();
    const docs = config.bots['grok-docs'];
    const probe = ['docs/security/NOTES.md', 'docs/agents/ROUTING.md'];
    expect(botPathViolations(docs, probe)).toEqual([]);
    expect(botPathViolations(docs, probe, config.protectedPaths)).toEqual(['docs/security/NOTES.md']);
  });

  it('review u svakoj celiji ostaje codex s claude fallbackom, a grok-review je samo alternativa', () => {
    const config = raw();
    for (const size of SIZES) {
      for (const flag of PROTECTED_KEYS) {
        const review = config.routing[size][flag].roles.review as RoutingRole & { reviewAlternatives?: string[] };
        expect(review.provider).toBe('codex');
        expect(review.reviewFallback?.provider).toBe('claude');
        expect(review.reviewAlternatives).toEqual(['grok-review']);
      }
    }
    expect((config as unknown as { protectedReviewNote: string }).protectedReviewNote).toMatch(/nikad jedini recenzent/);
  });

  it('resolveBot vezuje bot za agenta, fazu i provider', () => {
    const config = raw();
    expect(resolveBot(config, 'grok-review', { agentName: 'grok', agentCommand: 'grok', runnerPhase: 'review' }).name).toBe('grok-review');
    expect(resolveBot(config, 'grok-docs', { agentName: 'build', agentCommand: 'grok', runnerPhase: 'implement' }).name).toBe('grok-docs');
    expect(() => resolveBot(config, 'grok-docs', { agentName: 'build', agentCommand: 'grok', runnerPhase: 'review' })).toThrow(/--phase implement/);
    expect(() => resolveBot(config, 'grok-docs', { agentName: 'grok', agentCommand: 'grok', runnerPhase: 'implement' })).toThrow(/--agent build/);
    expect(() => resolveBot(config, 'grok-review', { agentName: 'sol', agentCommand: 'codex', runnerPhase: 'review' })).toThrow(/provider grok/);
    expect(() => resolveBot(config, 'nepostoji', { agentName: 'grok', agentCommand: 'grok', runnerPhase: 'review' })).toThrow(/Unknown bot/);
  });
});
