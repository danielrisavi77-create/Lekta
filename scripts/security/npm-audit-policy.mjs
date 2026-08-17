import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ALLOWED_NANOID_ADVISORIES = Object.freeze([
  'GHSA-28wg-ghj8-5hjv',
  'GHSA-2v37-7h3g-55p8',
  'GHSA-mwcw-c2x4-8c55',
]);

const ALLOWED_NANOID_ADVISORY_SEVERITIES = Object.freeze({
  'GHSA-28wg-ghj8-5hjv': 'high',
  'GHSA-2v37-7h3g-55p8': 'high',
  'GHSA-mwcw-c2x4-8c55': 'moderate',
});

const ALLOWED_NANOID_NODES = Object.freeze([
  'node_modules/emscripten-wasm-loader/node_modules/nanoid',
  'node_modules/hunspell-asm/node_modules/nanoid',
]);

const REQUIRED_PACKAGES = Object.freeze({
  'node_modules/emscripten-wasm-loader': '3.0.3',
  'node_modules/emscripten-wasm-loader/node_modules/nanoid': '2.1.11',
  'node_modules/hunspell-asm': '4.0.2',
  'node_modules/hunspell-asm/node_modules/nanoid': '2.1.11',
});

const REQUIRED_DEPENDENCY_EDGES = Object.freeze({
  '': Object.freeze({ 'hunspell-asm': '^4.0.2' }),
  'node_modules/hunspell-asm': Object.freeze({
    'emscripten-wasm-loader': '^3.0.3',
    nanoid: '^2.1.5',
  }),
  'node_modules/emscripten-wasm-loader': Object.freeze({ nanoid: '^2.0.3' }),
});

const KNOWN_NPM_SEVERITIES = Object.freeze(['info', 'low', 'moderate', 'high', 'critical']);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function advisoryId(via) {
  if (!record(via)
    || via.name !== 'nanoid'
    || via.dependency !== 'nanoid'
    || typeof via.severity !== 'string'
    || typeof via.url !== 'string') return null;
  const id = via.url.match(/\/advisories\/(GHSA-[A-Za-z0-9-]+)$/)?.[1];
  return id && ALLOWED_NANOID_ADVISORY_SEVERITIES[id] === via.severity ? id : null;
}

function sameStrings(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value) => typeof value !== 'string')) {
    return false;
  }
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return new Set(sortedActual).size === sortedActual.length
    && sortedActual.every((value, index) => value === sortedExpected[index]);
}

export function evaluateProductionAudit(auditReport, lockfile) {
  const reasons = [];
  if (!record(auditReport) || auditReport.auditReportVersion !== 2 || !record(auditReport.vulnerabilities)) {
    return { ok: false, reasons: ['Nevaljan npm audit JSON v2.'], allowedAdvisories: [] };
  }
  if (!record(lockfile) || !record(lockfile.packages)) {
    return { ok: false, reasons: ['Nevaljan package-lock.json.'], allowedAdvisories: [] };
  }

  for (const [path, version] of Object.entries(REQUIRED_PACKAGES)) {
    if (!record(lockfile.packages[path]) || lockfile.packages[path].version !== version) {
      reasons.push(`${path} mora ostati na verziji ${version}.`);
    }
  }

  for (const [parentPath, expectedDependencies] of Object.entries(REQUIRED_DEPENDENCY_EDGES)) {
    const parentPackage = lockfile.packages[parentPath];
    if (!record(parentPackage) || !record(parentPackage.dependencies)) {
      reasons.push(`${parentPath || 'root'} mora imati package i dependencies zapis.`);
      continue;
    }
    for (const [dependency, range] of Object.entries(expectedDependencies)) {
      if (parentPackage.dependencies[dependency] !== range) {
        reasons.push(`${parentPath || 'root'} mora ovisiti o ${dependency}@${range}.`);
      }
    }
  }

  const rootPackage = lockfile.packages[''];
  if (record(rootPackage) && record(rootPackage.dependencies)
    && Object.prototype.hasOwnProperty.call(rootPackage.dependencies, 'nanoid')) {
    reasons.push('nanoid ne smije postati izravna produkcijska ovisnost.');
  }

  const vulnerabilities = Object.entries(auditReport.vulnerabilities);
  for (const [name, value] of vulnerabilities) {
    if (!record(value)
      || value.name !== name
      || typeof value.severity !== 'string'
      || !KNOWN_NPM_SEVERITIES.includes(value.severity)
      || typeof value.isDirect !== 'boolean'
      || !Array.isArray(value.via)
      || !Array.isArray(value.nodes)) {
      reasons.push(`${name} nalaz nema očekivani oblik.`);
    }
  }

  const severe = vulnerabilities.filter(([, value]) =>
    record(value) && (value.severity === 'high' || value.severity === 'critical'));
  if (severe.length === 0) {
    return { ok: reasons.length === 0, reasons, allowedAdvisories: [] };
  }
  if (severe.length !== 1 || severe[0][0] !== 'nanoid') {
    reasons.push('Postoji high/critical paket izvan dopuštenog nanoid slučaja.');
  }

  const vulnerability = auditReport.vulnerabilities.nanoid;
  if (!record(vulnerability) || vulnerability.name !== 'nanoid' || vulnerability.severity !== 'high') {
    reasons.push('nanoid nalaz nema očekivani oblik ili severity.');
  }
  if (!record(vulnerability) || vulnerability.isDirect !== false) {
    reasons.push('nanoid mora ostati neizravna ovisnost.');
  }
  const advisories = record(vulnerability) && Array.isArray(vulnerability.via)
    ? vulnerability.via.map(advisoryId)
    : [];
  if (advisories.some((id) => id === null) || !sameStrings(advisories, ALLOWED_NANOID_ADVISORIES)) {
    reasons.push('nanoid advisory skup nije točno dopušteni skup.');
  }
  if (!record(vulnerability) || !sameStrings(vulnerability.nodes, ALLOWED_NANOID_NODES)) {
    reasons.push('nanoid node putanje nisu točno dopuštene putanje.');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    allowedAdvisories: reasons.length === 0 ? [...ALLOWED_NANOID_ADVISORIES] : [],
  };
}

export function runAuditPolicyCli({
  cwd = process.cwd(),
  platform = process.platform,
  execPath = process.execPath,
  npmCliPath = process.env.npm_execpath ?? resolve(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'),
  spawnSyncImpl = spawnSync,
  readFileSyncImpl = readFileSync,
} = {}) {
  const auditArgs = ['audit', '--omit=dev', '--json'];
  const [command, args] = platform === 'win32'
    ? [execPath, [npmCliPath, ...auditArgs]]
    : ['npm', auditArgs];
  let audit;
  try {
    audit = spawnSyncImpl(command, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, message: `npm audit se nije mogao pouzdano izvršiti: ${detail}` };
  }
  if (!record(audit)) {
    return { exitCode: 1, message: 'npm audit se nije mogao pouzdano izvršiti: nevaljan rezultat procesa.' };
  }
  if (audit.error || (audit.status !== 0 && audit.status !== 1)) {
    const detail = audit.error?.message || audit.stderr || `status ${audit.status}`;
    return { exitCode: 1, message: `npm audit se nije mogao pouzdano izvršiti: ${detail}` };
  }

  let auditReport;
  let lockfile;
  try {
    auditReport = JSON.parse(audit.stdout);
    lockfile = JSON.parse(readFileSyncImpl(resolve(cwd, 'package-lock.json'), 'utf8'));
  } catch (error) {
    return { exitCode: 1, message: `Nevaljan audit ili lockfile JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  const result = evaluateProductionAudit(auditReport, lockfile);
  if (!result.ok) return { exitCode: 1, message: result.reasons.join('\n') };
  if (result.allowedAdvisories.length === 0) return { exitCode: 0, message: 'Nema high/critical produkcijskih ranjivosti.' };
  return {
    exitCode: 0,
    message: `Dopušten je samo zaključani Hunspell nanoid slučaj: ${result.allowedAdvisories.join(', ')}`,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runAuditPolicyCli();
  const writer = result.exitCode === 0 ? console.log : console.error;
  writer(result.message);
  process.exitCode = result.exitCode;
}
