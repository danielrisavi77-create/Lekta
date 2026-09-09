# Staging migration journal: reviewable repair proposal

Target: `bnyemcnsphlitjradrst`. The owner approved this repair on 2026-09-08,
explicitly superseding staging rebuild. The guarded repair and six canonical
contracts have now been applied to staging. Production was not changed.

## Approved execution evidence

- Fresh complete backup: `D:/output/lekta-staging-journal-backup-approved-2026-09-08.json`.
- Before repair: 121 rows, fingerprint `a2bb8567494e1cf132fa9d03de0617db`.
- The exact rollback form succeeded; readback proved the original fingerprint unchanged.
- The same SQL with only its final ROLLBACK changed to COMMIT succeeded: 83 unique
  versions and names, fingerprint `5d02c61aec0ed06e1b3d312f810e3243`.
- Full-repository CLI dry-run exposed unrelated historical migrations, including
  a cron directed at production. That full list was not applied.
- A staging CLI bundle contains byte-identical canonical SQL for the 83 recorded
  identities and six pending contracts 0105–0110. It does not mark omitted
  migrations applied or rewrite SQL. Source hashes and manifest are under
  `D:/output/lekta-staging-contracts-approved-20260908`.
- CLI dry-run listed exactly 0105–0110. CLI push with `--linked --skip-vault`
  applied those six contracts. The journal now has 89 rows, latest version 0110;
  repeating that bundle's dry-run returns no pending migrations.
- RPC privilege readback confirms service-only deletion finalization, refund
  reconciliation and billing evidence/settlement. Context reserve/commit and
  explicit plan approval permit authenticated users with canonical ownership
  checks; none permits anon execution.

The bundle being up to date is not full-repository migration parity. Other
pending migrations remain unapplied and must be evaluated if required by the
authenticated journey. Physical Storage deletion, provider-result recovery,
paid staging tests and activation remain separate work.

The existing [migration identity decision](MIGRATION_IDENTITY.md), section 3
step 5, prescribes rebuilding staging because the 38 duplicate identities could
not then be reliably untangled. The owner's explicit decision supersedes that
staging-specific choice. It does not authorize production
changes, migration deployment, service activation or changes to privacy policy.

## Evidence

The current journal contains 121 rows mapping to 83 repository identities.
The complete row backup, including statements, rollback, creator and idempotency
metadata, is at `D:/output/lekta-staging-journal-backup-2026-09-08.json`.
Its PostgreSQL JSONB fingerprint is `a2bb8567494e1cf132fa9d03de0617db`.

Comparison against the repository at `dad6424` classified all 121 bodies:

- 105 match SQL tokens, preserving quoted values and function bodies.
- 14 add only `DROP POLICY IF EXISTS` before the same policy creation.
- One changes formatting inside the `0070` function body.
- Historical `0069` lacks terminal-run payload reuse, which the applied `0070`
  adds. The current staging function body was separately read and matches `0078`;
  authenticated callers have no execute privilege, consistent with `0084`.

The tokenizer is a comparison aid, not a PostgreSQL parser. Differences were
inspected explicitly; removing arbitrary whitespace from literals was not used
as proof. The full comparison and classification artifacts remain under
`D:/output/lekta-staging-*-2026-09-08.json` and are not application data.

## Concrete operation

[Review SQL](../../scripts/staging-journal-repair-2026-09-08.sql) ends in
`ROLLBACK`. It locks the journal and checks the complete original fingerprint,
removes 38 explicitly mapped duplicate aliases and renames the 83 retained rows
to their current four-digit version and canonical name. Two-phase renaming
handles old `0035`–`0038` becoming `0062`–`0065`. Every retained field other than
version/name must remain identical. Historical SQL bodies are preserved.

No historical migration is rerun. The changed `0069` history is retained rather
than rewritten to pretend its current repository contents were applied earlier.

The local test used a disposable UTF-8 PostgreSQL database populated from the
complete backup. It verified:

```text
JOURNAL_REPAIR_ROLLBACK_PASS
JOURNAL_REPAIR_CHANGED_SNAPSHOT_REJECTED
JOURNAL_REPAIR_LOCAL_APPLY_PASS: 83 rows, metadata invariants, numeric collisions, public sentinel
JOURNAL_REPAIR_REPLAY_REJECTED
JOURNAL_REPAIR_FULL_BACKUP_RESTORE_PASS
```

The test harness is `D:/output/katedra-release-tools/test-journal-repair.mjs`.
It executes the exact review SQL, changing only the final rollback to commit for
the local apply scenario. It restores the backup and removes its own disposable
database. No provider request, payment or production connection is involved.

## Owner decision and follow-up

The owner approved this exact repair, superseding the rebuild recommendation.
The execution evidence above records the fresh fingerprint, rollback verification,
committed repair and scoped application of 0105–0110. The original review SQL
continues to end in `ROLLBACK` and rejects a changed or already repaired journal.

Subsequent deployments must still review the scoped CLI dry-run with
`--skip-vault`. This operation does not prove Storage behavior, paid journeys,
institutional policy or release readiness. The new consent/upload contract is
documented in [AGENT_PAYLOAD_CUSTODY.md](AGENT_PAYLOAD_CUSTODY.md).
