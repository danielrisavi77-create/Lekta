import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_CONTEXT_FILES,
  auditClaudeContext,
} from './verify-claude-context-core.mjs';

export function verifyClaudeContext(rootDir = process.cwd()) {
  const rootPath = resolve(rootDir, 'CLAUDE.md');
  const rootText = readFileSync(rootPath, 'utf8');
  return auditClaudeContext(
    rootText,
    REQUIRED_CONTEXT_FILES.filter((path) => existsSync(resolve(rootDir, path))),
  );
}

function main() {
  const result = verifyClaudeContext();
  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(`[${problem.code}] ${problem.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CLAUDE.md: ${result.lineCount}/${200} redaka, ${result.routes.length} valjanih ruta.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
