import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { globalLeaseEnforced, implementerHasControlPlaneAdminToken, validateGlobalLease } from '../agents/global-lease.mjs';
import { scopePathMatches, validateWorkScope } from '../agents/task-scope.mjs';

function findRepoRoot(start, exists = existsSync) {
  let current = resolve(start || process.cwd());
  while (true) {
    if (exists(join(current, 'docs', 'agents', 'tasks.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function relativeRepoPath(repoRoot, cwd, filePath) {
  const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd || repoRoot, filePath);
  const rel = relative(repoRoot, absolute).replace(/\\/g, '/');
  if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) return null;
  return rel;
}

export function judgeTaskWrite({ env = {}, payload = {}, queue, repoRoot, cwd }) {
  if (env.LEKTA_ROLE !== 'implementer') return { allow: true, reason: '' };
  const taskId = String(env.LEKTA_TASK_ID || '').trim();
  if (!taskId) return { allow: true, reason: '' };
  if (!['Edit', 'Write'].includes(String(payload.tool_name || ''))) return { allow: true, reason: '' };

  const task = (queue?.tasks ?? []).find((item) => item.id === taskId);
  if (!task) return { allow: false, reason: taskId + ' ne postoji u docs/agents/tasks.json.' };

  const scope = validateWorkScope(task.workScope, task.id);
  const write = scope?.write ?? [];
  const strict = env.LEKTA_SCOPE_ENFORCED === '1';
  if (write.length === 0) {
    if (strict) return { allow: false, reason: taskId + ' nema workScope.write, a LEKTA_SCOPE_ENFORCED=1.' };
    return { allow: true, reason: 'UPOZORENJE: ' + taskId + ' nema workScope.write; legacy mode propusta zapis.' };
  }

  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath.trim()) return { allow: true, reason: '' };
  const rel = relativeRepoPath(repoRoot, cwd || repoRoot, filePath);
  if (!rel) return { allow: false, reason: 'Zapis izvan korijena repozitorija nije dopusten za ' + taskId + '.' };

  const forbidden = scope?.forbidden ?? [];
  const forbiddenHit = forbidden.find((pattern) => scopePathMatches(rel, pattern));
  if (forbiddenHit) {
    return { allow: false, reason: rel + ' je u forbidden scopeu ' + forbiddenHit + ' za ' + taskId + '.' };
  }
  if (write.some((pattern) => scopePathMatches(rel, pattern))) return { allow: true, reason: '' };

  return {
    allow: false,
    reason: rel + ' nije u workScope.write za ' + taskId + '. Zatrazi SCOPE EXPANSION od orkestratora prije izmjene.',
  };
}


export async function judgeGlobalLeaseWrite({
  env = {},
  payload = {},
  queue,
  validate = validateGlobalLease,
}) {
  if (!globalLeaseEnforced(env)) return { allow: true, reason: '' };
  if (env.LEKTA_ROLE !== 'implementer') return { allow: true, reason: '' };
  if (implementerHasControlPlaneAdminToken(env)) {
    return { allow: false, reason: 'Enforced implementer ne smije imati LEKTA_CONTROL_PLANE_ADMIN_TOKEN.' };
  }
  if (!['Edit', 'Write'].includes(String(payload.tool_name || ''))) return { allow: true, reason: '' };

  const taskId = String(env.LEKTA_TASK_ID || '').trim();
  if (!taskId) {
    return { allow: false, reason: 'Global lease enforcement zahtijeva LEKTA_TASK_ID.' };
  }
  const task = (queue?.tasks ?? []).find((item) => item.id === taskId);
  if (!task) return { allow: false, reason: taskId + ' ne postoji za global lease validation.' };

  try {
    await validate({ env, task });
    return { allow: true, reason: '' };
  } catch (error) {
    return {
      allow: false,
      reason: 'global lease validation nije prosla: ' + (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function readStdin() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch (err) {
    process.stderr.write('task-scope-guard: nevaljan hook input, propustam (fail-open). ' + String(err) + '\n');
    process.exit(0);
  }
  const root = findRepoRoot(payload?.cwd || process.cwd());
  if (!root) {
    process.stderr.write('task-scope-guard: ne mogu naci repo root, propustam (fail-open).\n');
    process.exit(0);
  }
  let queue;
  try {
    queue = JSON.parse(readFileSync(join(root, 'docs', 'agents', 'tasks.json'), 'utf8'));
  } catch (err) {
    process.stderr.write('task-scope-guard: ne mogu procitati tasks.json, propustam (fail-open). ' + String(err) + '\n');
    process.exit(0);
  }
  let verdict;
  try {
    verdict = judgeTaskWrite({ env: process.env, payload, queue, repoRoot: root, cwd: payload?.cwd || root });
  } catch (err) {
    process.stderr.write('task-scope-guard: interna greska, propustam (fail-open). ' + String(err) + '\n');
    process.exit(0);
  }
  if (!verdict.allow) {
    process.stderr.write('task-scope-guard: ' + verdict.reason + '\n');
    process.exit(2);
  }

  const globalVerdict = await judgeGlobalLeaseWrite({
    env: process.env,
    payload,
    queue,
  });
  if (!globalVerdict.allow) {
    process.stderr.write('task-scope-guard: ' + globalVerdict.reason + '\n');
    process.exit(2);
  }

  if (verdict.reason) process.stderr.write('task-scope-guard: ' + verdict.reason + '\n');
  if (globalVerdict.reason) process.stderr.write('task-scope-guard: ' + globalVerdict.reason + '\n');
  process.exit(0);
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/hooks/task-scope-guard.mjs');
if (isMain) main();
