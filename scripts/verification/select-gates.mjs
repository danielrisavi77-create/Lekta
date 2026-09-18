const RISK_ORDER = new Map([['low', 0], ['medium', 1], ['high', 2], ['unknown', 3]]);

function invariant(condition, message) {
  if (!condition) throw new Error(`[verification-map] ${message}`);
}

function ids(rows, label) {
  invariant(Array.isArray(rows), `${label} mora biti niz.`);
  const seen = new Set();
  for (const row of rows) {
    invariant(row && typeof row.id === 'string' && row.id.length > 0, `${label} ima nevaljan id.`);
    invariant(!seen.has(row.id), `${label} ima dvostruki id: ${row.id}.`);
    seen.add(row.id);
  }
}

function validatePattern(pattern, routeId) {
  invariant(typeof pattern === 'string' && pattern.length > 0, `route ${routeId} ima prazan pattern.`);
  invariant(!pattern.includes('\\') && !pattern.includes('\0'), `route ${routeId} ima nevaljan pattern.`);
  invariant(!pattern.startsWith('/') && !/^[A-Za-z]:\//.test(pattern), `route ${routeId} pattern mora biti relativan.`);
  invariant(!pattern.split('/').includes('..'), `route ${routeId} pattern ne smije sadrzavati ...`);
  invariant(!/[?\[\]{}!]/.test(pattern) && !pattern.includes('***'), `route ${routeId} koristi nepodrzan glob operator.`);
  invariant(pattern.split('/').every((segment) => segment && (segment === '**' || !segment.includes('**'))), `route ${routeId}: ** mora biti cijeli segment.`);
  return pattern;
}

function validateRequirements(requirements, gateId) {
  if (requirements === undefined) return undefined;
  invariant(requirements && typeof requirements === 'object' && !Array.isArray(requirements), `gate ${gateId}: requirements mora biti objekt.`);
  const normalized = {};
  for (const key of ['env', 'anyEnv', 'platforms']) {
    if (requirements[key] === undefined) continue;
    invariant(
      Array.isArray(requirements[key]) && requirements[key].length > 0
        && requirements[key].every((value) => typeof value === 'string' && value.length > 0),
      `gate ${gateId}: requirements.${key} mora biti neprazan niz stringova.`,
    );
    normalized[key] = [...requirements[key]];
  }
  if (requirements.executable !== undefined) {
    invariant(typeof requirements.executable === 'string' && requirements.executable.length > 0, `gate ${gateId}: requirements.executable mora biti string.`);
    normalized.executable = requirements.executable;
  }
  return normalized;
}

export function validateVerificationMap(raw) {
  invariant(raw?.version === 1, 'podrzana je samo verzija 1.');
  invariant(Array.isArray(raw?.defaults?.gates), 'defaults.gates mora biti niz.');
  invariant(raw.defaults.gates.includes('check'), 'defaults mora ukljuciti check.');
  invariant(raw.defaults.gates.includes('orphan-scan'), 'defaults mora ukljuciti orphan-scan.');
  ids(raw.gates, 'gates');
  ids(raw.routes, 'routes');

  const gates = raw.gates.map((gate, configIndex) => {
    invariant(gate.kind === 'command' || gate.kind === 'manual', `gate ${gate.id} ima nepoznat kind.`);
    invariant(Number.isFinite(gate.order), `gate ${gate.id} nema brojcani order.`);
    if (gate.kind === 'command') {
      invariant(Array.isArray(gate.argv) && gate.argv.length > 0, `gate ${gate.id} nema argv.`);
      invariant(gate.argv.every((value) => typeof value === 'string' && value.length > 0), `gate ${gate.id}: argv mora sadrzavati stringove.`);
    }
    if (gate.kind === 'manual') invariant(gate.argv === undefined, `manual gate ${gate.id} ne smije imati argv.`);
    const requirements = validateRequirements(gate.requirements, gate.id);
    return { ...gate, covers: gate.covers ?? [], requirements, configIndex };
  });
  const gateById = new Map(gates.map((gate) => [gate.id, gate]));
  for (const gate of gates) {
    invariant(Array.isArray(gate.covers), `gate ${gate.id}: covers mora biti niz.`);
    for (const coveredId of gate.covers) invariant(gateById.has(coveredId), `gate ${gate.id} pokriva nepoznat gate ${coveredId}.`);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (gateId) => {
    if (visited.has(gateId)) return;
    invariant(!visiting.has(gateId), `covers sadrzi ciklus na gateu ${gateId}.`);
    visiting.add(gateId);
    for (const coveredId of gateById.get(gateId).covers) visit(coveredId);
    visiting.delete(gateId);
    visited.add(gateId);
  };
  for (const gateId of gateById.keys()) visit(gateId);

  for (const gateId of raw.defaults.gates) invariant(gateById.has(gateId), `nepoznat default gate ${gateId}.`);
  invariant(gateById.get('needs-human')?.acknowledgeable === false, 'needs-human se ne smije moci potvrditi.');

  const routes = raw.routes.map((route, configIndex) => {
    invariant(['low', 'medium', 'high'].includes(route.risk), `route ${route.id} ima nevaljan risk.`);
    invariant(Array.isArray(route.patterns) && route.patterns.length > 0, `route ${route.id} nema patterns.`);
    invariant(Array.isArray(route.gates), `route ${route.id} nema gates.`);
    for (const gateId of route.gates) invariant(gateById.has(gateId), `route ${route.id} trazi nepoznat gate ${gateId}.`);
    const patterns = route.patterns.map((pattern) => validatePattern(pattern, route.id));
    return { ...route, patterns, configIndex };
  });
  return { version: 1, defaults: { gates: [...raw.defaults.gates] }, gates, routes, gateById };
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function matchesPattern(repoPath, pattern) {
  invariant(typeof pattern === 'string' && pattern.length > 0, 'pattern mora biti neprazan niz.');
  const regex = `^${pattern.split('**').map((part) => part.split('*').map(escapeRegex).join('[^/]*')).join('.*')}$`;
  return new RegExp(regex).test(repoPath);
}

function highestRisk(left, right) {
  return RISK_ORDER.get(right) > RISK_ORDER.get(left) ? right : left;
}

export function selectGates(changes, config) {
  const selected = new Set(config.defaults.gates);
  const matchedRoutes = new Set();
  const unknownPaths = [];
  let risk = 'low';

  for (const change of changes) {
    const matched = config.routes.filter((route) => route.patterns.some((pattern) => matchesPattern(change.path, pattern)));
    if (matched.length === 0) {
      unknownPaths.push(change.path);
      continue;
    }
    for (const route of matched) {
      matchedRoutes.add(route.id);
      risk = highestRisk(risk, route.risk);
      for (const gateId of route.gates) selected.add(gateId);
    }
  }

  const noChanges = changes.length === 0;
  if (noChanges || unknownPaths.length > 0) {
    selected.add('needs-human');
    risk = 'unknown';
  }
  const gateIds = [...selected].sort((left, right) => {
    const a = config.gateById.get(left);
    const b = config.gateById.get(right);
    return a.order - b.order || a.configIndex - b.configIndex;
  });
  const selectedIds = new Set(gateIds);
  const coveredBy = new Map();
  for (const coveringId of gateIds) {
    for (const coveredId of config.gateById.get(coveringId).covers) {
      if (selectedIds.has(coveredId) && !coveredBy.has(coveredId)) coveredBy.set(coveredId, coveringId);
    }
  }

  return {
    risk,
    status: noChanges || unknownPaths.length > 0 ? 'needs_human' : 'ready',
    reasons: noChanges ? ['no-changes'] : unknownPaths.length > 0 ? ['unknown-paths'] : [],
    matchedRoutes: [...matchedRoutes],
    unknownPaths,
    gateIds,
    gates: gateIds.map((id) => ({ ...config.gateById.get(id), coveredBy: coveredBy.get(id) ?? null })),
  };
}
