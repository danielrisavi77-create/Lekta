/**
 * Provjere nad `config/agent-routing.json` oblikom, ODVOJENE od test datoteke, tako da ih
 * `tests/agent-routing-config.test.ts` (baseline) i `tests/gate-mutations.test.ts` (mutacija)
 * dijele umjesto da svaka ponovno pise istu logiku. CLAUDE.md: "svaki novi gard ima cisti
 * baseline i mutaciju u tests/gate-mutations.test.ts".
 */

export interface RoutingRole {
  provider: string;
  model?: string | null;
  effort?: string;
  reviewFallback?: { provider: string; model: string; effort: string };
}

export interface RoutingCell {
  mode: string;
  roles: Record<string, RoutingRole>;
}

export interface RoutingConfig {
  models: Record<string, { status?: string }>;
  costWeight: Record<string, number>;
  routing: Record<string, Record<string, RoutingCell>>;
}

export const ROUTING_SIZES = ['S', 'M', 'L'] as const;
export const ROUTING_PROTECTED_KEYS = ['false', 'true'] as const;

/** Sve (size, protectedFlag, roleName, role) celije routinga, redom, bez preskakanja. */
export function allRoutingRoleEntries(
  config: RoutingConfig,
): { size: string; protectedFlag: string; roleName: string; role: RoutingRole }[] {
  const out: { size: string; protectedFlag: string; roleName: string; role: RoutingRole }[] = [];
  for (const size of ROUTING_SIZES) {
    for (const protectedFlag of ROUTING_PROTECTED_KEYS) {
      const cell = config.routing[size]?.[protectedFlag];
      if (!cell) continue;
      for (const [roleName, role] of Object.entries(cell.roles)) {
        out.push({ size, protectedFlag, roleName, role });
      }
    }
  }
  return out;
}

/**
 * Vraca imenovane pogotke: uloga (osim gate, koja nema model) koja koristi model sa
 * status "unverified", ili čiji reviewFallback to radi.
 */
export function findUnverifiedModelUsages(config: RoutingConfig): string[] {
  const unverified = new Set(
    Object.entries(config.models)
      .filter(([, spec]) => spec.status === 'unverified')
      .map(([id]) => id),
  );
  const problems: string[] = [];
  for (const { size, protectedFlag, roleName, role } of allRoutingRoleEntries(config)) {
    if (roleName === 'gate') continue;
    if (role.model && unverified.has(role.model)) {
      problems.push(`${size}/${protectedFlag}/${roleName} koristi neverificiran model ${role.model}`);
    }
    if (role.reviewFallback?.model && unverified.has(role.reviewFallback.model)) {
      problems.push(`${size}/${protectedFlag}/${roleName}.reviewFallback koristi neverificiran model ${role.reviewFallback.model}`);
    }
  }
  return problems;
}

/**
 * Vraca imenovane pogotke: kombinacija gdje je review.provider === implement.provider a nema
 * valjan reviewFallback (postojeci, s modelom razlicitim od implementatorovog).
 */
export function findSameProviderWithoutFallback(config: RoutingConfig): string[] {
  const problems: string[] = [];
  for (const size of ROUTING_SIZES) {
    for (const protectedFlag of ROUTING_PROTECTED_KEYS) {
      const cell = config.routing[size]?.[protectedFlag];
      if (!cell) continue;
      const { implement, review } = cell.roles;
      if (!implement || !review) continue;
      const sameProvider = review.provider === implement.provider;
      const validFallback = Boolean(
        review.reviewFallback && review.reviewFallback.model && review.reviewFallback.model !== implement.model,
      );
      if (sameProvider && !validFallback) {
        problems.push(`${size}/${protectedFlag}: review i implement isti provider (${review.provider}) bez valjanog reviewFallbacka`);
      }
    }
  }
  return problems;
}
