const ACTIVE_WRITE_STATUSES = new Set(['in_progress']);

function normalizeSlashes(value) {
  return String(value).replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function canonicalScopePattern(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('scope path mora biti neprazan string');
  let value = normalizeSlashes(raw.trim());
  while (value.startsWith('./')) value = value.slice(2);
  if (!value || value.startsWith('/') || /^[A-Za-z]:\//.test(value) || value.includes('\0')) {
    throw new Error('scope path mora biti relativan unutar repozitorija: ' + raw);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '..' || segment === '')) {
    throw new Error('scope path ne smije izlaziti iz repozitorija: ' + raw);
  }
  const isTree = value.endsWith('/**');
  const body = isTree ? value.slice(0, -3) : value;
  if (!body || body.includes('*') || body.includes('?') || body.includes('[') || body.includes(']')) {
    throw new Error('scope podrzava samo tocnu putanju ili zavrsni /**: ' + raw);
  }
  return isTree ? body.replace(/\/$/, '') + '/**' : body.replace(/\/$/, '');
}

export function canonicalRepoPath(raw) {
  const value = canonicalScopePattern(raw);
  if (value.endsWith('/**')) throw new Error('repo path ne smije biti obrazac: ' + raw);
  return value;
}

export function validateWorkScope(scope, taskId = 'task') {
  if (scope == null) return null;
  if (typeof scope !== 'object' || Array.isArray(scope)) throw new Error('Invalid workScope: ' + taskId);
  const result = {};
  for (const key of ['read', 'write', 'forbidden']) {
    const value = scope[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new Error('Invalid workScope.' + key + ': ' + taskId);
    }
    const normalized = value.map(canonicalScopePattern);
    if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate workScope.' + key + ': ' + taskId);
    result[key] = normalized;
  }
  return result;
}

function splitPattern(pattern) {
  const normalized = canonicalScopePattern(pattern);
  return normalized.endsWith('/**')
    ? { kind: 'tree', root: normalized.slice(0, -3) }
    : { kind: 'exact', root: normalized };
}

export function scopePathMatches(repoPath, pattern) {
  const path = canonicalRepoPath(repoPath);
  const parsed = splitPattern(pattern);
  if (parsed.kind === 'exact') return path === parsed.root;
  return path === parsed.root || path.startsWith(parsed.root + '/');
}

export function scopePatternsOverlap(a, b) {
  const left = splitPattern(a);
  const right = splitPattern(b);
  if (left.kind === 'exact' && right.kind === 'exact') return left.root === right.root;
  if (left.kind === 'tree' && right.kind === 'tree') {
    return left.root === right.root || left.root.startsWith(right.root + '/') || right.root.startsWith(left.root + '/');
  }
  const tree = left.kind === 'tree' ? left : right;
  const exact = left.kind === 'exact' ? left : right;
  return exact.root === tree.root || exact.root.startsWith(tree.root + '/');
}

export function findWriteScopeConflicts(queue) {
  const active = (queue?.tasks ?? [])
    .filter((task) => ACTIVE_WRITE_STATUSES.has(task.status))
    .map((task) => ({ task, scope: validateWorkScope(task.workScope, task.id) }))
    .filter(({ scope }) => Array.isArray(scope?.write) && scope.write.length > 0);
  const conflicts = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      for (const left of active[i].scope.write) {
        for (const right of active[j].scope.write) {
          if (scopePatternsOverlap(left, right)) {
            conflicts.push({ taskA: active[i].task.id, taskB: active[j].task.id, pathA: left, pathB: right });
          }
        }
      }
    }
  }
  return conflicts;
}

export function findTaskWriteConflicts(queue, taskId) {
  const target = (queue?.tasks ?? []).find((task) => task.id === taskId);
  if (!target) return [];
  const targetScope = validateWorkScope(target.workScope, target.id);
  if (!Array.isArray(targetScope?.write) || targetScope.write.length === 0) return [];
  const conflicts = [];
  for (const other of queue?.tasks ?? []) {
    if (other.id === taskId || !ACTIVE_WRITE_STATUSES.has(other.status)) continue;
    const otherScope = validateWorkScope(other.workScope, other.id);
    if (!Array.isArray(otherScope?.write) || otherScope.write.length === 0) continue;
    for (const left of targetScope.write) {
      for (const right of otherScope.write) {
        if (scopePatternsOverlap(left, right)) {
          conflicts.push({ taskA: taskId, taskB: other.id, pathA: left, pathB: right });
        }
      }
    }
  }
  return conflicts;
}

export function activeTasksMissingWriteScope(queue) {
  return (queue?.tasks ?? [])
    .filter((task) => ACTIVE_WRITE_STATUSES.has(task.status) && task.owner)
    .filter((task) => {
      const scope = validateWorkScope(task.workScope, task.id);
      return !Array.isArray(scope?.write) || scope.write.length === 0;
    })
    .map((task) => ({ id: task.id, owner: task.owner }));
}

export function writeScopeViolations(paths, scope, taskId = 'task') {
  const normalized = validateWorkScope(scope, taskId);
  const write = normalized?.write ?? [];
  if (write.length === 0) return [];
  const forbidden = normalized?.forbidden ?? [];
  const violations = [];
  for (const raw of paths ?? []) {
    let path;
    try {
      path = canonicalRepoPath(raw);
    } catch {
      violations.push({ path: String(raw), reason: 'invalid_path' });
      continue;
    }
    const forbiddenHit = forbidden.find((pattern) => scopePathMatches(path, pattern));
    if (forbiddenHit) {
      violations.push({ path, reason: 'forbidden', pattern: forbiddenHit });
      continue;
    }
    if (!write.some((pattern) => scopePathMatches(path, pattern))) {
      violations.push({ path, reason: 'outside_write_scope' });
    }
  }
  return violations;
}
