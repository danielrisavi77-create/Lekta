import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

function copyRequirements(requirements) {
  if (!requirements) return null;
  return {
    env: requirements.env ? [...requirements.env] : undefined,
    anyEnv: requirements.anyEnv ? [...requirements.anyEnv] : undefined,
    platforms: requirements.platforms ? [...requirements.platforms] : undefined,
    executable: requirements.executable ?? undefined,
  };
}

function copyGate(gate) {
  return {
    id: gate.id,
    kind: gate.kind,
    label: gate.label,
    argv: gate.argv ? [...gate.argv] : undefined,
    requirements: copyRequirements(gate.requirements),
    coveredBy: gate.coveredBy ?? null,
  };
}

function copyResult(result) {
  return {
    id: result.id,
    status: result.status,
    coveredBy: result.coveredBy ?? null,
    reason: result.reason ?? null,
    commandStatus: Number.isInteger(result.commandStatus) ? result.commandStatus : null,
    durationMs: Number.isFinite(result.durationMs) ? result.durationMs : 0,
  };
}

export function buildReport(input) {
  const detection = input.detection;
  const selection = input.selection;
  const execution = input.execution;
  return {
    schemaVersion: 1,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    baseRef: detection.baseRef,
    baseSha: detection.baseSha,
    headSha: detection.headSha,
    dirtyWorkingTree: detection.dirtyWorkingTree,
    changes: detection.changes.map((change) => ({
      path: change.path,
      sources: [...change.sources],
    })),
    risk: selection.risk,
    status: execution.status,
    exitCode: execution.exitCode,
    matchedRoutes: [...selection.matchedRoutes],
    unknownPaths: [...selection.unknownPaths],
    acknowledgements: [...(input.acknowledgements ?? [])],
    acknowledgementErrors: [...(execution.acknowledgementErrors ?? [])],
    gates: selection.gates.map(copyGate),
    results: execution.results.map(copyResult),
  };
}

function upper(value) {
  return String(value).toUpperCase();
}

export function formatReport(report) {
  const lines = [
    `Verification Router: ${upper(report.status)} (exit ${report.exitCode})`,
    `Risk: ${upper(report.risk)}`,
    `Base: ${report.baseRef} (${report.baseSha})`,
    `Head: ${report.headSha}${report.dirtyWorkingTree ? ' + working tree' : ''}`,
  ];

  lines.push(`Changes (${report.changes.length}):`);
  for (const change of report.changes) {
    lines.push(`  - ${change.path} [${change.sources.join(', ')}]`);
  }

  if (report.unknownPaths.length > 0) {
    lines.push('UNKNOWN paths:');
    for (const path of report.unknownPaths) lines.push(`  - ${path}`);
  }

  lines.push(`Routes: ${report.matchedRoutes.length > 0 ? report.matchedRoutes.join(', ') : 'none'}`);
  lines.push('Gates:');
  for (const result of report.results) {
    const detail = result.coveredBy
      ? ` by ${result.coveredBy}`
      : result.reason
        ? ` (${result.reason})`
        : '';
    lines.push(`  - ${result.id}: ${result.status}${detail}`);
  }
  for (const error of report.acknowledgementErrors) lines.push(`Ack error: ${error}`);
  return lines.join('\n');
}

export function writeReport(report, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, outputPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Datoteka mozda nije nastala.
    }
    throw error;
  }
}
