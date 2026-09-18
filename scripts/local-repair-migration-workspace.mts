import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export interface LocalRepairMigrationPolicy {
  readonly approvedRemoteOnlyMigrations: Readonly<Record<string, string>>;
  readonly expectedPendingMigrationNames: readonly string[];
  readonly windowsFetchGaps: Readonly<Record<string, Readonly<{
    placeholder: string;
    localName: string;
  }>>>;
}

const DEFAULT_LOCAL_REPAIR_MIGRATION_POLICY: LocalRepairMigrationPolicy = Object.freeze({
  approvedRemoteOnlyMigrations: Object.freeze({
    '0102_corpus_contributions.sql': '6f0ba9a9741ad104f658e1f4db4781bd5203db8158a3c49389854a183e9197e9',
    '0103_health_ping.sql': '9ebafaa1a3e6d7f0382f48f2bd80a79e3680e3a957f6a0cdf86b64304adf3041',
    '20260830005406_sprint_engine_i_narudzbe.sql': 'd04c082fecb94509f7cebeb78136bcb03f7f85e9cc8cb83b670569fb5e9f0d49',
    '20260830195311_stavka_crm_leadovi.sql': '93256b2024749f8758fe0caa6f4dc8a53d2f6232b5cfa68ec3f9ff17ee6a4ff3',
    '20260830195452_stavka_leadovi_email_nullable.sql': '0bcde9fcbcbf1f18fbb64d6cd4981636f6508dfe37eb46955c9d78658d0f3af2',
    '20260830195905_stavka_revoke_trigger_fn_execute.sql': '352fffe550fbd7d83bac934f36f95383fc1f5a1b5dae857a5cac5ee216a9072a',
  }),
  expectedPendingMigrationNames: Object.freeze([
    '0104_repair_local_claims.sql',
    '0105_repair_local_lifecycle.sql',
    '0106_repair_local_claim_recovery.sql',
  ]),
  windowsFetchGaps: Object.freeze({
    '0059': Object.freeze({ placeholder: '0059_Lekta', localName: '0059_secure_reminder_cron.sql' }),
    '0060': Object.freeze({ placeholder: '0060_Lekta', localName: '0060_revoke_purge_rpc_roles.sql' }),
    '0063': Object.freeze({ placeholder: '0063_Lekta', localName: '0063_deadline_reminder_tiers.sql' }),
    '0066': Object.freeze({ placeholder: '0066_Lekta', localName: '0066_security_advisor_hardening.sql' }),
  }),
});

export interface FetchedMigrationEvidence {
  name: string;
  sha256?: string;
}

export interface LocalRepairMigrationWorkspaceInput {
  localMigrationNames: string[];
  fetchedMigrations: FetchedMigrationEvidence[];
}

export interface LocalRepairMigrationWorkspacePlan {
  approvedExternalMigrationNames: string[];
  copyMigrationNames: string[];
  pendingMigrationNames: string[];
}

export function withTemporaryLocalRepairMigrationWorkspace<T>(
  action: (workspace: string) => T,
): T {
  const workspace = mkdtempSync(join(tmpdir(), 'lekta-repair-migrations-'));
  try {
    return action(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function readFetchedMigrationEvidence(
  directory: string,
): FetchedMigrationEvidence[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      if (!entry.name.toLowerCase().endsWith('.sql')) {
        return { name: entry.name };
      }
      return {
        name: entry.name,
        sha256: createHash('sha256')
          .update(readFileSync(join(directory, entry.name)))
          .digest('hex'),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function applyLocalRepairMigrationWorkspacePlan(input: {
  localMigrationsDirectory: string;
  fetchedMigrationsDirectory: string;
  plan: LocalRepairMigrationWorkspacePlan;
}): void {
  for (const name of input.plan.copyMigrationNames) {
    if (basename(name) !== name) {
      throw new Error(`Nesiguran naziv migracije za kopiranje: ${name}`);
    }
    const source = join(input.localMigrationsDirectory, name);
    if (!existsSync(source)) {
      throw new Error(`Nedostaje lokalna migracija za workspace: ${name}`);
    }
    copyFileSync(
      source,
      join(input.fetchedMigrationsDirectory, name),
    );
  }
}

export function parseAndVerifyLocalRepairMigrationDryRun(
  raw: string,
  expectedPendingMigrationNames: readonly string[] = (
    DEFAULT_LOCAL_REPAIR_MIGRATION_POLICY.expectedPendingMigrationNames
  ),
): string[] {
  const lines = raw.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /Would push these migrations:/i.test(line));
  const migrationNames = (headingIndex >= 0 ? lines.slice(headingIndex + 1) : [])
    .map((line) => /^\s*[•*-]\s+(\d+_[^\s]+\.sql)\s*$/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name));
  const hasExactDryRunSet = (
    migrationNames.length === expectedPendingMigrationNames.length
    && expectedPendingMigrationNames.every((name, index) => migrationNames[index] === name)
  );
  if (!hasExactDryRunSet) {
    throw new Error(
      'Supabase dry-run mora vratiti tocno migracije 0104, 0105 i 0106.',
    );
  }
  return migrationNames;
}

function migrationVersion(name: string): string {
  const match = /^(\d+)(?:_|$)/.exec(name);
  if (!match) throw new Error(`Nevaljan naziv migracije: ${name}`);
  return match[1];
}

export function planLocalRepairMigrationWorkspace(
  input: LocalRepairMigrationWorkspaceInput,
  policy: LocalRepairMigrationPolicy = DEFAULT_LOCAL_REPAIR_MIGRATION_POLICY,
): LocalRepairMigrationWorkspacePlan {
  const approvedRemoteOnlyMigrations = new Map(
    Object.entries(policy.approvedRemoteOnlyMigrations),
  );
  const windowsFetchGaps = new Map(Object.entries(policy.windowsFetchGaps));
  const localNameByVersion = new Map(
    input.localMigrationNames.map((name) => [migrationVersion(name), name]),
  );
  if (localNameByVersion.size !== input.localMigrationNames.length) {
    throw new Error('Lokalne migracije sadrze duplicirani version.');
  }
  const localVersions = new Set(localNameByVersion.keys());
  const fetchedVersions = new Set(input.fetchedMigrations.map(({ name }) => migrationVersion(name)));
  const fetchedByVersion = new Map<string, FetchedMigrationEvidence[]>();
  for (const migration of input.fetchedMigrations) {
    const version = migrationVersion(migration.name);
    fetchedByVersion.set(version, [...(fetchedByVersion.get(version) || []), migration]);
  }
  const fetchedSqlVersions = new Set(
    input.fetchedMigrations
      .filter(({ name }) => name.toLowerCase().endsWith('.sql'))
      .map(({ name }) => migrationVersion(name)),
  );

  const pendingMigrationNames = input.localMigrationNames.filter(
    (name) => !fetchedVersions.has(migrationVersion(name)),
  );
  const appliedGapMigrationNames = input.localMigrationNames.filter((name) => {
    const version = migrationVersion(name);
    return fetchedVersions.has(version) && !fetchedSqlVersions.has(version);
  });
  const externalMigrations = input.fetchedMigrations.filter(
    ({ name }) => !localVersions.has(migrationVersion(name)),
  );
  const unapprovedExternal = externalMigrations.find(
    ({ name }) => !approvedRemoteOnlyMigrations.has(name),
  );
  if (unapprovedExternal) {
    throw new Error(`Neodobrena vanjska migracija: ${unapprovedExternal.name}`);
  }
  const changedExternal = externalMigrations.find(({ name, sha256 }) => (
    approvedRemoteOnlyMigrations.get(name) !== sha256?.toLowerCase()
  ));
  if (changedExternal) {
    throw new Error(`Neispravan hash vanjske migracije: ${changedExternal.name}`);
  }
  const fetchedExternalNames = new Set(externalMigrations.map(({ name }) => name));
  const missingExternal = [...approvedRemoteOnlyMigrations.keys()].find(
    (name) => !fetchedExternalNames.has(name),
  );
  if (missingExternal) {
    throw new Error(`Nedostaje odobrena vanjska migracija: ${missingExternal}`);
  }
  const pendingNames = new Set(pendingMigrationNames);
  const hasExactPendingSet = (
    pendingNames.size === policy.expectedPendingMigrationNames.length
    && policy.expectedPendingMigrationNames.every((name) => pendingNames.has(name))
  );
  if (!hasExactPendingSet) {
    throw new Error(
      'Release zahtijeva tocno tri nove Lekta migracije: 0104, 0105 i 0106.',
    );
  }
  for (const [version, localName] of localNameByVersion) {
    const fetched = fetchedByVersion.get(version) || [];
    if (fetched.length === 0) continue;
    if (fetched.length !== 1) {
      throw new Error(`Duplicirani fetched migration version: ${version}`);
    }
    const remote = fetched[0];
    if (remote.name.toLowerCase().endsWith('.sql')) {
      const allowedNames = new Set([localName, `${version}_${localName}`]);
      if (!allowedNames.has(remote.name)) {
        throw new Error(`Nepodudarna primijenjena migracija ${version}: ${remote.name}`);
      }
      continue;
    }
    const gap = windowsFetchGaps.get(version);
    if (!gap || gap.placeholder !== remote.name || gap.localName !== localName) {
      throw new Error(`Nepodudarna primijenjena migracija ${version}: ${remote.name}`);
    }
  }
  const approvedExternalMigrationNames = externalMigrations.map(({ name }) => name);

  return {
    approvedExternalMigrationNames,
    copyMigrationNames: [
      ...appliedGapMigrationNames,
      ...pendingMigrationNames,
    ],
    pendingMigrationNames,
  };
}

interface PrepareWorkspaceInput {
  localMigrationsDirectory: string;
  fetchedMigrationsDirectory: string;
}

interface SupabaseMigrationCommandOptions {
  captureOutput: boolean;
}

interface SupabaseMigrationCommandResult {
  stdout?: string;
}

export interface ExecuteLocalRepairMigrationWorkspaceInput {
  projectRef: string;
  localMigrationsDirectory: string;
  migrationPolicy?: LocalRepairMigrationPolicy;
  runSupabase: (
    args: string[],
    options: SupabaseMigrationCommandOptions,
  ) => SupabaseMigrationCommandResult;
  prepareWorkspace?: (
    input: PrepareWorkspaceInput,
  ) => LocalRepairMigrationWorkspacePlan;
}

function prepareFetchedWorkspace(
  input: PrepareWorkspaceInput,
  policy: LocalRepairMigrationPolicy,
): LocalRepairMigrationWorkspacePlan {
  const localMigrationNames = readdirSync(input.localMigrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const plan = planLocalRepairMigrationWorkspace({
    localMigrationNames,
    fetchedMigrations: readFetchedMigrationEvidence(input.fetchedMigrationsDirectory),
  }, policy);
  applyLocalRepairMigrationWorkspacePlan({ ...input, plan });
  return plan;
}

export function executeLocalRepairMigrationWorkspace(
  input: ExecuteLocalRepairMigrationWorkspaceInput,
): LocalRepairMigrationWorkspacePlan {
  return withTemporaryLocalRepairMigrationWorkspace((workspace) => {
    const policy = input.migrationPolicy || DEFAULT_LOCAL_REPAIR_MIGRATION_POLICY;
    const fetchedMigrationsDirectory = join(workspace, 'supabase', 'migrations');
    input.runSupabase(['init', '--workdir', workspace], { captureOutput: false });
    input.runSupabase([
      'link', '--workdir', workspace,
      '--project-ref', input.projectRef,
      '--yes',
    ], { captureOutput: false });
    input.runSupabase([
      'migration', 'fetch', '--workdir', workspace,
      '--linked', '--yes',
    ], { captureOutput: false });
    const plan = input.prepareWorkspace ? input.prepareWorkspace({
      localMigrationsDirectory: input.localMigrationsDirectory,
      fetchedMigrationsDirectory,
    }) : prepareFetchedWorkspace({
      localMigrationsDirectory: input.localMigrationsDirectory,
      fetchedMigrationsDirectory,
    }, policy);
    const dryRun = input.runSupabase([
      'db', 'push', '--workdir', workspace,
      '--dry-run', '--linked', '--include-all', '--yes',
    ], { captureOutput: true });
    parseAndVerifyLocalRepairMigrationDryRun(
      dryRun.stdout || '',
      policy.expectedPendingMigrationNames,
    );
    input.runSupabase([
      'db', 'push', '--workdir', workspace,
      '--linked', '--include-all', '--yes',
    ], { captureOutput: false });
    return plan;
  });
}
