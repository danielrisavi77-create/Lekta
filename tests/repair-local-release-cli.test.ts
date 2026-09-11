import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  EXPECTED_REPAIR_DOCX_REMOTE_EZBR_SHA256,
  buildLocalRepairDeploymentPlan,
} from '../scripts/local-repair-release-gate';
import { assertLocalRepairReleaseSecrets } from '../scripts/run-local-repair-release';
import { parseAndVerifyRemoteRepairDocxBaseline } from '../scripts/run-local-repair-release';
import * as releaseCli from '../scripts/run-local-repair-release';

describe('automatizirani local-repair release CLI', () => {
  it('zahtijeva neovisno konfigurirane produkcijske trust, source i artifact vrijednosti', () => {
    expect(releaseCli).toHaveProperty('readLocalRepairReleaseTrustPolicy');
    const readLocalRepairReleaseTrustPolicy = (
      releaseCli as typeof releaseCli & {
        readLocalRepairReleaseTrustPolicy: (env: Record<string, string | undefined>) => unknown;
      }
    ).readLocalRepairReleaseTrustPolicy;

    expect(() => readLocalRepairReleaseTrustPolicy({})).toThrow(
      /LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT/,
    );
    expect(() => readLocalRepairReleaseTrustPolicy({
      LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: 'AA'.repeat(20),
    })).toThrow(/LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID/);
    expect(() => readLocalRepairReleaseTrustPolicy({
      LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: 'AA'.repeat(20),
      LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID: 'lekta-prod-2026-01',
    })).toThrow(/LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT/);
    expect(() => readLocalRepairReleaseTrustPolicy({
      LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: 'AA'.repeat(20),
      LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID: 'lekta-prod-2026-01',
      LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT: '1'.repeat(40),
    })).toThrow(/LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256/);

    expect(readLocalRepairReleaseTrustPolicy({
      LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: ' aa '.repeat(20),
      LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID: ' lekta-prod-2026-01 ',
      LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT: ` ${'1'.repeat(40)} `,
      LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256: ` ${'B'.repeat(64)} `,
    })).toEqual({
      expectedPublisherThumbprint: 'AA'.repeat(20),
      expectedContractKeyId: 'lekta-prod-2026-01',
      reviewedSourceCommit: '1'.repeat(40),
      reviewedArtifactSha256: 'b'.repeat(64),
    });
  });

  it('planira samo provjerene remote gapove i tocno tri nove Lekta migracije', () => {
    expect(releaseCli).toHaveProperty('planLocalRepairMigrationWorkspace');

    const planLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        planLocalRepairMigrationWorkspace: (input: {
          localMigrationNames: string[];
          fetchedMigrations: Array<{ name: string; sha256?: string }>;
        }) => unknown;
      }
    ).planLocalRepairMigrationWorkspace;

    expect(planLocalRepairMigrationWorkspace({
      localMigrationNames: [
        '0001_baseline.sql',
        '0059_secure_reminder_cron.sql',
        '0060_revoke_purge_rpc_roles.sql',
        '0063_deadline_reminder_tiers.sql',
        '0066_security_advisor_hardening.sql',
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ],
      fetchedMigrations: [
        { name: '0001_baseline.sql' },
        { name: '0059_Lekta' },
        { name: '0060_Lekta' },
        { name: '0063_Lekta' },
        { name: '0066_Lekta' },
        {
          name: '0102_corpus_contributions.sql',
          sha256: '6f0ba9a9741ad104f658e1f4db4781bd5203db8158a3c49389854a183e9197e9',
        },
        {
          name: '0103_health_ping.sql',
          sha256: '9ebafaa1a3e6d7f0382f48f2bd80a79e3680e3a957f6a0cdf86b64304adf3041',
        },
        {
          name: '20260830005406_sprint_engine_i_narudzbe.sql',
          sha256: 'd04c082fecb94509f7cebeb78136bcb03f7f85e9cc8cb83b670569fb5e9f0d49',
        },
        {
          name: '20260830195311_stavka_crm_leadovi.sql',
          sha256: '93256b2024749f8758fe0caa6f4dc8a53d2f6232b5cfa68ec3f9ff17ee6a4ff3',
        },
        {
          name: '20260830195452_stavka_leadovi_email_nullable.sql',
          sha256: '0bcde9fcbcbf1f18fbb64d6cd4981636f6508dfe37eb46955c9d78658d0f3af2',
        },
        {
          name: '20260830195905_stavka_revoke_trigger_fn_execute.sql',
          sha256: '352fffe550fbd7d83bac934f36f95383fc1f5a1b5dae857a5cac5ee216a9072a',
        },
      ],
    })).toEqual({
      approvedExternalMigrationNames: [
        '0102_corpus_contributions.sql',
        '0103_health_ping.sql',
        '20260830005406_sprint_engine_i_narudzbe.sql',
        '20260830195311_stavka_crm_leadovi.sql',
        '20260830195452_stavka_leadovi_email_nullable.sql',
        '20260830195905_stavka_revoke_trigger_fn_execute.sql',
      ],
      copyMigrationNames: [
        '0059_secure_reminder_cron.sql',
        '0060_revoke_purge_rpc_roles.sql',
        '0063_deadline_reminder_tiers.sql',
        '0066_security_advisor_hardening.sql',
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ],
      pendingMigrationNames: [
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ],
    });
  });

  it('odbija remote SQL koji koristi lokalni broj migracije s drugim sadrzajem', () => {
    const planLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        planLocalRepairMigrationWorkspace: (input: {
          localMigrationNames: string[];
          localMigrationSha256ByName: Record<string, string>;
          fetchedMigrations: Array<{ name: string; sha256?: string }>;
        }) => unknown;
      }
    ).planLocalRepairMigrationWorkspace;
    const localMigrationNames = [
      '0001_baseline.sql',
      '0059_secure_reminder_cron.sql',
      '0060_revoke_purge_rpc_roles.sql',
      '0063_deadline_reminder_tiers.sql',
      '0066_security_advisor_hardening.sql',
      '0104_repair_local_claims.sql',
      '0105_repair_local_lifecycle.sql',
      '0106_repair_local_claim_recovery.sql',
    ];

    expect(() => planLocalRepairMigrationWorkspace({
      localMigrationNames,
      localMigrationSha256ByName: Object.fromEntries(
        localMigrationNames.map((name, index) => [name, String(index).repeat(64)]),
      ),
      fetchedMigrations: [
        { name: '0001_baseline.sql', sha256: '0'.repeat(64) },
        { name: '0059_remote_spoof.sql', sha256: '9'.repeat(64) },
        { name: '0060_Lekta' },
        { name: '0063_Lekta' },
        { name: '0066_Lekta' },
        {
          name: '0102_corpus_contributions.sql',
          sha256: '6f0ba9a9741ad104f658e1f4db4781bd5203db8158a3c49389854a183e9197e9',
        },
        {
          name: '0103_health_ping.sql',
          sha256: '9ebafaa1a3e6d7f0382f48f2bd80a79e3680e3a957f6a0cdf86b64304adf3041',
        },
        {
          name: '20260830005406_sprint_engine_i_narudzbe.sql',
          sha256: 'd04c082fecb94509f7cebeb78136bcb03f7f85e9cc8cb83b670569fb5e9f0d49',
        },
        {
          name: '20260830195311_stavka_crm_leadovi.sql',
          sha256: '93256b2024749f8758fe0caa6f4dc8a53d2f6232b5cfa68ec3f9ff17ee6a4ff3',
        },
        {
          name: '20260830195452_stavka_leadovi_email_nullable.sql',
          sha256: '0bcde9fcbcbf1f18fbb64d6cd4981636f6508dfe37eb46955c9d78658d0f3af2',
        },
        {
          name: '20260830195905_stavka_revoke_trigger_fn_execute.sql',
          sha256: '352fffe550fbd7d83bac934f36f95383fc1f5a1b5dae857a5cac5ee216a9072a',
        },
      ],
    })).toThrow(/nepodudarna primijenjena migracija.*0059/i);
  });

  it('zaustavlja release kada fetch vrati dvije datoteke s istim versionom', () => {
    const planLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        planLocalRepairMigrationWorkspace: (
          input: {
            localMigrationNames: string[];
            fetchedMigrations: Array<{ name: string; sha256?: string }>;
          },
          policy: {
            approvedRemoteOnlyMigrations: Record<string, string>;
            expectedPendingMigrationNames: string[];
            windowsFetchGaps: Record<string, { placeholder: string; localName: string }>;
          },
        ) => unknown;
      }
    ).planLocalRepairMigrationWorkspace;

    expect(() => planLocalRepairMigrationWorkspace({
      localMigrationNames: [
        '0001_baseline.sql',
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ],
      fetchedMigrations: [
        { name: '0001_baseline.sql' },
        { name: '0001_0001_baseline.sql' },
      ],
    }, {
      approvedRemoteOnlyMigrations: {},
      expectedPendingMigrationNames: [
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ],
      windowsFetchGaps: {},
    })).toThrow(/duplicirani fetched migration version.*0001/i);
  });

  it('zaustavlja release kada remote sadrzi neodobrenu vanjsku migraciju', () => {
    const planLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        planLocalRepairMigrationWorkspace: (input: {
          localMigrationNames: string[];
          fetchedMigrations: Array<{ name: string; sha256?: string }>;
        }) => unknown;
      }
    ).planLocalRepairMigrationWorkspace;

    expect(() => planLocalRepairMigrationWorkspace({
      localMigrationNames: ['0001_baseline.sql'],
      fetchedMigrations: [
        { name: '0001_baseline.sql' },
        {
          name: '20260910000000_unknown_shared_project_change.sql',
          sha256: 'a'.repeat(64),
        },
      ],
    })).toThrow(/neodobrena vanjska migracija/i);
  });

  it('zaustavlja release kada odobrena vanjska migracija promijeni sadrzaj', () => {
    const planLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        planLocalRepairMigrationWorkspace: (input: {
          localMigrationNames: string[];
          fetchedMigrations: Array<{ name: string; sha256?: string }>;
        }) => unknown;
      }
    ).planLocalRepairMigrationWorkspace;

    expect(() => planLocalRepairMigrationWorkspace({
      localMigrationNames: ['0001_baseline.sql'],
      fetchedMigrations: [
        { name: '0001_baseline.sql' },
        {
          name: '20260830005406_sprint_engine_i_narudzbe.sql',
          sha256: 'f'.repeat(64),
        },
      ],
    })).toThrow(/hash vanjske migracije/i);
  });

  it('zaustavlja release kada remote fetch nema cijelu odobrenu vanjsku povijest', () => {
    const planLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        planLocalRepairMigrationWorkspace: (input: {
          localMigrationNames: string[];
          fetchedMigrations: Array<{ name: string; sha256?: string }>;
        }) => unknown;
      }
    ).planLocalRepairMigrationWorkspace;

    expect(() => planLocalRepairMigrationWorkspace({
      localMigrationNames: ['0001_baseline.sql'],
      fetchedMigrations: [
        { name: '0001_baseline.sql' },
        {
          name: '20260830005406_sprint_engine_i_narudzbe.sql',
          sha256: 'd04c082fecb94509f7cebeb78136bcb03f7f85e9cc8cb83b670569fb5e9f0d49',
        },
      ],
    })).toThrow(/nedostaje odobrena vanjska migracija/i);
  });

  it.each([
    [
      'dodatnu',
      [
        '0001_baseline.sql',
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
        '0107_unrelated_change.sql',
      ],
    ],
    [
      'nedostajucu',
      [
        '0001_baseline.sql',
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
      ],
    ],
  ])('zaustavlja release za %s pending migraciju', (_caseName, localMigrationNames) => {
    const planLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        planLocalRepairMigrationWorkspace: (input: {
          localMigrationNames: string[];
          fetchedMigrations: Array<{ name: string; sha256?: string }>;
        }) => unknown;
      }
    ).planLocalRepairMigrationWorkspace;

    expect(() => planLocalRepairMigrationWorkspace({
      localMigrationNames,
      fetchedMigrations: [
        { name: '0001_baseline.sql' },
        {
          name: '0102_corpus_contributions.sql',
          sha256: '6f0ba9a9741ad104f658e1f4db4781bd5203db8158a3c49389854a183e9197e9',
        },
        {
          name: '0103_health_ping.sql',
          sha256: '9ebafaa1a3e6d7f0382f48f2bd80a79e3680e3a957f6a0cdf86b64304adf3041',
        },
        {
          name: '20260830005406_sprint_engine_i_narudzbe.sql',
          sha256: 'd04c082fecb94509f7cebeb78136bcb03f7f85e9cc8cb83b670569fb5e9f0d49',
        },
        {
          name: '20260830195311_stavka_crm_leadovi.sql',
          sha256: '93256b2024749f8758fe0caa6f4dc8a53d2f6232b5cfa68ec3f9ff17ee6a4ff3',
        },
        {
          name: '20260830195452_stavka_leadovi_email_nullable.sql',
          sha256: '0bcde9fcbcbf1f18fbb64d6cd4981636f6508dfe37eb46955c9d78658d0f3af2',
        },
        {
          name: '20260830195905_stavka_revoke_trigger_fn_execute.sql',
          sha256: '352fffe550fbd7d83bac934f36f95383fc1f5a1b5dae857a5cac5ee216a9072a',
        },
      ],
    })).toThrow(/tocno tri nove Lekta migracije/i);
  });

  it('dopusta push samo kada Supabase dry-run vrati tocno 0104 do 0106', () => {
    expect(releaseCli).toHaveProperty('parseAndVerifyLocalRepairMigrationDryRun');
    const parseAndVerifyLocalRepairMigrationDryRun = (
      releaseCli as typeof releaseCli & {
        parseAndVerifyLocalRepairMigrationDryRun: (raw: string) => string[];
      }
    ).parseAndVerifyLocalRepairMigrationDryRun;
    const exactDryRun = [
      'DRY RUN: migrations will not be pushed to the database.',
      'Would push these migrations:',
      ' • 0104_repair_local_claims.sql',
      ' • 0105_repair_local_lifecycle.sql',
      ' • 0106_repair_local_claim_recovery.sql',
      'Finished supabase db push.',
    ].join('\n');

    expect(parseAndVerifyLocalRepairMigrationDryRun(exactDryRun)).toEqual([
      '0104_repair_local_claims.sql',
      '0105_repair_local_lifecycle.sql',
      '0106_repair_local_claim_recovery.sql',
    ]);
    expect(() => parseAndVerifyLocalRepairMigrationDryRun([
      exactDryRun,
      ' • 0107_unrelated_change.sql',
    ].join('\n'))).toThrow(/dry-run.*tocno migracije 0104, 0105 i 0106/i);
    expect(() => parseAndVerifyLocalRepairMigrationDryRun([
      'Would push these migrations:',
      ' • 0104_repair_local_claims.sql',
      ' • 0105_repair_local_lifecycle.sql',
      ' • 0106_repair_local_claim_recovery.sql',
      ' • 0106_repair_local_claim_recovery.sql',
    ].join('\n'))).toThrow(/dry-run.*tocno migracije 0104, 0105 i 0106/i);
    expect(() => parseAndVerifyLocalRepairMigrationDryRun([
      'Would push these migrations:',
      ' • 0106_repair_local_claim_recovery.sql',
      ' • 0105_repair_local_lifecycle.sql',
      ' • 0104_repair_local_claims.sql',
    ].join('\n'))).toThrow(/dry-run.*tocno migracije 0104, 0105 i 0106/i);
  });

  it('kopira samo migracije iz provjerenog workspace plana', () => {
    expect(releaseCli).toHaveProperty('applyLocalRepairMigrationWorkspacePlan');
    const applyLocalRepairMigrationWorkspacePlan = (
      releaseCli as typeof releaseCli & {
        applyLocalRepairMigrationWorkspacePlan: (input: {
          localMigrationsDirectory: string;
          fetchedMigrationsDirectory: string;
          plan: {
            approvedExternalMigrationNames: string[];
            copyMigrationNames: string[];
            pendingMigrationNames: string[];
          };
        }) => void;
      }
    ).applyLocalRepairMigrationWorkspacePlan;
    const root = mkdtempSync(join(tmpdir(), 'lekta-migration-copy-test-'));
    const local = join(root, 'local');
    const fetched = join(root, 'fetched');
    mkdirSync(local);
    mkdirSync(fetched);
    writeFileSync(join(local, '0059_gap.sql'), 'gap');
    writeFileSync(join(local, '0104_new.sql'), 'new');
    writeFileSync(join(local, '0107_unrelated.sql'), 'unrelated');
    writeFileSync(join(fetched, '0001_existing.sql'), 'existing');

    try {
      applyLocalRepairMigrationWorkspacePlan({
        localMigrationsDirectory: local,
        fetchedMigrationsDirectory: fetched,
        plan: {
          approvedExternalMigrationNames: [],
          copyMigrationNames: ['0059_gap.sql', '0104_new.sql'],
          pendingMigrationNames: ['0104_new.sql'],
        },
      });

      expect(readFileSync(join(fetched, '0059_gap.sql'), 'utf8')).toBe('gap');
      expect(readFileSync(join(fetched, '0104_new.sql'), 'utf8')).toBe('new');
      expect(readFileSync(join(fetched, '0001_existing.sql'), 'utf8')).toBe('existing');
      expect(existsSync(join(fetched, '0107_unrelated.sql'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('cita fetched povijest i racuna SHA-256 iz stvarnog SQL sadrzaja', () => {
    expect(releaseCli).toHaveProperty('readFetchedMigrationEvidence');
    const readFetchedMigrationEvidence = (
      releaseCli as typeof releaseCli & {
        readFetchedMigrationEvidence: (directory: string) => Array<{
          name: string;
          sha256?: string;
        }>;
      }
    ).readFetchedMigrationEvidence;
    const root = mkdtempSync(join(tmpdir(), 'lekta-migration-read-test-'));
    writeFileSync(join(root, '0059_Lekta'), '');
    writeFileSync(join(root, '20260830005406_external.sql'), 'abc');

    try {
      expect(readFetchedMigrationEvidence(root)).toEqual([
        { name: '0059_Lekta' },
        {
          name: '20260830005406_external.sql',
          sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uvijek uklanja privremeni migracijski workspace nakon greske', () => {
    expect(releaseCli).toHaveProperty('withTemporaryLocalRepairMigrationWorkspace');
    const withTemporaryLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        withTemporaryLocalRepairMigrationWorkspace: <T>(
          action: (workspace: string) => T,
        ) => T;
      }
    ).withTemporaryLocalRepairMigrationWorkspace;
    let workspace = '';

    expect(() => withTemporaryLocalRepairMigrationWorkspace((path) => {
      workspace = path;
      writeFileSync(join(path, 'proof.txt'), 'temporary');
      throw new Error('fetch failed');
    })).toThrow('fetch failed');

    expect(workspace).not.toBe('');
    expect(existsSync(workspace)).toBe(false);
  });

  it('izvodi izolirani fetch, provjeru, dry-run i push tocno tim redom', () => {
    expect(releaseCli).toHaveProperty('executeLocalRepairMigrationWorkspace');
    const executeLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        executeLocalRepairMigrationWorkspace: (input: {
          projectRef: string;
          localMigrationsDirectory: string;
          runSupabase: (
            args: string[],
            options: { captureOutput: boolean },
          ) => { stdout?: string };
          prepareWorkspace: (input: {
            localMigrationsDirectory: string;
            fetchedMigrationsDirectory: string;
          }) => {
            approvedExternalMigrationNames: string[];
            copyMigrationNames: string[];
            pendingMigrationNames: string[];
          };
        }) => unknown;
      }
    ).executeLocalRepairMigrationWorkspace;
    const events: string[] = [];
    let workspace = '';
    const expectedPlan = {
      approvedExternalMigrationNames: [
        '0102_corpus_contributions.sql',
        '0103_health_ping.sql',
        '20260830005406_sprint_engine_i_narudzbe.sql',
        '20260830195311_stavka_crm_leadovi.sql',
        '20260830195452_stavka_leadovi_email_nullable.sql',
        '20260830195905_stavka_revoke_trigger_fn_execute.sql',
      ],
      copyMigrationNames: [
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ],
      pendingMigrationNames: [
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ],
    };

    expect(executeLocalRepairMigrationWorkspace({
      projectRef: 'prod-ref',
      localMigrationsDirectory: 'C:\\lekta\\supabase\\migrations',
      runSupabase(args, options) {
        const workspaceIndex = args.indexOf('--workdir');
        if (workspaceIndex >= 0) workspace = args[workspaceIndex + 1];
        events.push(args.map((part) => part === workspace ? '<workspace>' : part).join(' '));
        return options.captureOutput ? {
          stdout: [
            'Would push these migrations:',
            ' • 0104_repair_local_claims.sql',
            ' • 0105_repair_local_lifecycle.sql',
            ' • 0106_repair_local_claim_recovery.sql',
          ].join('\n'),
        } : {};
      },
      prepareWorkspace(input) {
        events.push(`prepare ${input.fetchedMigrationsDirectory.replace(workspace, '<workspace>')}`);
        return expectedPlan;
      },
    })).toEqual(expectedPlan);

    expect(events).toEqual([
      'init --workdir <workspace>',
      'link --workdir <workspace> --project-ref prod-ref --yes',
      'migration fetch --workdir <workspace> --linked --yes',
      `prepare ${join('<workspace>', 'supabase', 'migrations')}`,
      'db push --workdir <workspace> --dry-run --linked --include-all --yes',
      'db push --workdir <workspace> --linked --include-all --yes',
    ]);
    expect(workspace).not.toBe('');
    expect(existsSync(workspace)).toBe(false);
  });

  it('izvodi stvarno citanje, hashiranje i kopiranje nakon fake Supabase fetcha', () => {
    const executeLocalRepairMigrationWorkspace = (
      releaseCli as typeof releaseCli & {
        executeLocalRepairMigrationWorkspace: (input: {
          projectRef: string;
          localMigrationsDirectory: string;
          migrationPolicy: {
            approvedRemoteOnlyMigrations: Record<string, string>;
            expectedPendingMigrationNames: string[];
            windowsFetchGaps: Record<string, { placeholder: string; localName: string }>;
          };
          runSupabase: (
            args: string[],
            options: { captureOutput: boolean },
          ) => { stdout?: string };
        }) => unknown;
      }
    ).executeLocalRepairMigrationWorkspace;
    const root = mkdtempSync(join(tmpdir(), 'lekta-real-migration-executor-test-'));
    const local = join(root, 'local');
    mkdirSync(local);
    writeFileSync(join(local, '0001_baseline.sql'), 'baseline');
    writeFileSync(join(local, '0104_repair_local_claims.sql'), 'claims');
    writeFileSync(join(local, '0105_repair_local_lifecycle.sql'), 'lifecycle');
    writeFileSync(join(local, '0106_repair_local_claim_recovery.sql'), 'recovery');
    let workspace = '';
    let copiedDuringDryRun: Record<string, string> = {};

    try {
      expect(executeLocalRepairMigrationWorkspace({
        projectRef: 'prod-ref',
        localMigrationsDirectory: local,
        migrationPolicy: {
          approvedRemoteOnlyMigrations: {
            '20260910000000_approved_external.sql':
              'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
          },
          expectedPendingMigrationNames: [
            '0104_repair_local_claims.sql',
            '0105_repair_local_lifecycle.sql',
            '0106_repair_local_claim_recovery.sql',
          ],
          windowsFetchGaps: {},
        },
        runSupabase(args, options) {
          const workspaceIndex = args.indexOf('--workdir');
          if (workspaceIndex >= 0) workspace = args[workspaceIndex + 1];
          const fetched = join(workspace, 'supabase', 'migrations');
          if (args[0] === 'migration' && args[1] === 'fetch') {
            mkdirSync(fetched, { recursive: true });
            writeFileSync(join(fetched, '0001_baseline.sql'), 'baseline');
            writeFileSync(join(fetched, '20260910000000_approved_external.sql'), 'abc');
          }
          if (args[0] === 'db' && args.includes('--dry-run')) {
            copiedDuringDryRun = Object.fromEntries([
              '0104_repair_local_claims.sql',
              '0105_repair_local_lifecycle.sql',
              '0106_repair_local_claim_recovery.sql',
            ].map((name) => [name, readFileSync(join(fetched, name), 'utf8')]));
          }
          return options.captureOutput ? {
            stdout: [
              'Would push these migrations:',
              ' • 0104_repair_local_claims.sql',
              ' • 0105_repair_local_lifecycle.sql',
              ' • 0106_repair_local_claim_recovery.sql',
            ].join('\n'),
          } : {};
        },
      })).toEqual({
        approvedExternalMigrationNames: ['20260910000000_approved_external.sql'],
        copyMigrationNames: [
          '0104_repair_local_claims.sql',
          '0105_repair_local_lifecycle.sql',
          '0106_repair_local_claim_recovery.sql',
        ],
        pendingMigrationNames: [
          '0104_repair_local_claims.sql',
          '0105_repair_local_lifecycle.sql',
          '0106_repair_local_claim_recovery.sql',
        ],
      });
      expect(copiedDuringDryRun).toEqual({
        '0104_repair_local_claims.sql': 'claims',
        '0105_repair_local_lifecycle.sql': 'lifecycle',
        '0106_repair_local_claim_recovery.sql': 'recovery',
      });
      expect(workspace).not.toBe('');
      expect(existsSync(workspace)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('radi link, regresijski gate, migracijski dry-run, push i funkcije deterministickim redom', () => {
    expect(buildLocalRepairDeploymentPlan()).toEqual([
      ['supabase', 'link', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF, '--yes'],
      ['npm', 'run', 'check:repair-integration'],
      ['netlify', 'build'],
      ['node', 'scripts/verify-deploy-dist.mjs'],
      ['internal', 'deploy-local-repair-migrations'],
      ['supabase', 'functions', 'deploy', 'repair-local-claim', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-local-status', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-docx', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
    ]);
  });

  it('prije execute moda zahtijeva obje tajne bez vracanja njihovih vrijednosti', () => {
    expect(() => assertLocalRepairReleaseSecrets({})).toThrow(/SUPABASE_ACCESS_TOKEN/);
    expect(() => assertLocalRepairReleaseSecrets({ SUPABASE_ACCESS_TOKEN: 'token' })).toThrow(/SUPABASE_DB_PASSWORD/);
    expect(assertLocalRepairReleaseSecrets({
      SUPABASE_ACCESS_TOKEN: 'token',
      SUPABASE_DB_PASSWORD: 'password',
    })).toEqual({ accessTokenPresent: true, databasePasswordPresent: true });
  });

  it('izlaze kao preflight i explicit execute npm naredbe bez password argumenta', () => {
    const root = join(import.meta.dirname, '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const cli = readFileSync(join(root, 'scripts', 'run-local-repair-release.mts'), 'utf8');

    expect(pkg.scripts?.['release:repair:preflight']).toBe('node scripts/run-local-repair-release.mts');
    expect(pkg.scripts?.['release:repair:deploy']).toBe('node scripts/run-local-repair-release.mts --execute');
    expect(cli).toContain('Get-AuthenticodeSignature');
    expect(cli).toContain("command[0] === 'netlify' && command[1] === 'build'");
    expect(cli).not.toContain("command[0] === 'npm' && command[1] === 'run'");
    expect(cli).toContain("command[0] === 'node' && command[1] === 'scripts/verify-deploy-dist.mjs'");
    expect(cli).toContain('verifiedDist');
    expect(cli).toContain('SUPABASE_ACCESS_TOKEN');
    expect(cli).toContain('SUPABASE_DB_PASSWORD');
    expect(cli).not.toContain("'--password'");
    expect(cli).not.toContain('"--password"');
  });

  it('parsira stvarni Supabase functions list JSON i odbija udaljeni bundle drift', () => {
    const raw = JSON.stringify([{
      slug: 'repair-docx',
      status: 'ACTIVE',
      ezbr_sha256: EXPECTED_REPAIR_DOCX_REMOTE_EZBR_SHA256,
    }]);
    expect(parseAndVerifyRemoteRepairDocxBaseline(raw)).toMatchObject({
      slug: 'repair-docx',
      ezbrSha256: EXPECTED_REPAIR_DOCX_REMOTE_EZBR_SHA256,
    });
    expect(() => parseAndVerifyRemoteRepairDocxBaseline(
      raw.replace(EXPECTED_REPAIR_DOCX_REMOTE_EZBR_SHA256, 'f'.repeat(64)),
    )).toThrow(/produkcijski repair-docx bundle/i);
});
});
