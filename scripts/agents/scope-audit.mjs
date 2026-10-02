import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activeTasksMissingWriteScope, findWriteScopeConflicts, validateWorkScope } from './task-scope.mjs';

export function auditTaskScopes(queue) {
  const invalid = [];
  for (const task of queue?.tasks ?? []) {
    try {
      validateWorkScope(task.workScope, task.id);
    } catch (err) {
      invalid.push({ id: task.id, reason: String(err instanceof Error ? err.message : err) });
    }
  }
  return {
    invalid,
    conflicts: invalid.length ? [] : findWriteScopeConflicts(queue),
    missingActiveWriteScope: invalid.length ? [] : activeTasksMissingWriteScope(queue),
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/agents/scope-audit.mjs');
if (isMain) {
  const path = resolve(process.cwd(), 'docs', 'agents', 'tasks.json');
  let queue;
  try {
    queue = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    process.stderr.write('scope-audit: ne mogu procitati tasks.json: ' + String(err) + '\n');
    process.exit(2);
  }
  const report = auditTaskScopes(queue);
  if (report.invalid.length) {
    for (const item of report.invalid) process.stderr.write('INVALID ' + item.id + ': ' + item.reason + '\n');
  }
  if (report.conflicts.length) {
    for (const item of report.conflicts) {
      process.stderr.write('CONFLICT ' + item.taskA + ' ' + item.pathA + ' <-> ' + item.taskB + ' ' + item.pathB + '\n');
    }
  }
  if (report.missingActiveWriteScope.length) {
    for (const item of report.missingActiveWriteScope) {
      process.stderr.write('MIGRATION ' + item.id + ' owner=' + item.owner + ' nema workScope.write\n');
    }
  }
  if (report.invalid.length || report.conflicts.length) process.exit(2);
  if (report.missingActiveWriteScope.length) process.exit(1);
  process.stdout.write('scope-audit: OK, nema aktivnih write konflikata.\n');
}
