# Staging migration journal: reviewable repair proposal

Target: `bnyemcnsphlitjradrst`. No staging mutation has been performed.

The existing [migration identity decision](MIGRATION_IDENTITY.md), section 3
step 5, prescribes rebuilding staging because the 38 duplicate identities could
not then be reliably untangled. This proposal needs an explicit owner decision
to supersede that staging-specific choice. It does not authorize production
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

Approve repairing the existing staging journal using this exact proposal,
superseding the earlier rebuild recommendation. After approval, revalidate the
live fingerprint, run the rollback form, and only then apply the identical SQL
with its final `ROLLBACK` changed to `COMMIT`. A fingerprint mismatch stops work.

After journal repair, rerun the linked staging CLI migration dry-run with
`--skip-vault`. Review its pending migration list before applying canonical
migrations with `supabase db push`. This journal operation alone does not prove
Storage behavior, paid journeys, institutional policy or release readiness.
