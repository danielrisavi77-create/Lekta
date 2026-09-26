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
import {
  allRoutingRoleEntries,
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
    const unverifiedModels = Object.entries(config.models).filter(([, spec]) => spec.status === 'unverified');
    expect(unverifiedModels.length).toBeGreaterThan(0); // dokazi da test ima sto testirati (claude-opus-5-5)

    const problems = findUnverifiedModelUsages(config as unknown as import('./helpers/agent-routing-checks').RoutingConfig);
    expect(problems, problems.join('; ')).toHaveLength(0);
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
