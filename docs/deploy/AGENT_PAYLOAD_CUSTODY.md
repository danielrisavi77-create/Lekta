# Agent payload custody and deletion

The owner approved explicit consent for private temporary content, at most 72
hours of retention, and deletion after withdrawal or run deletion. The manuscript
remains local canonical content. This contract does not activate the service.

## Canonical contract

0105–0110 provide physical deletion acknowledgement, atomic context replacement,
revision-bound plan approval and billing/refund reconciliation. 0111 adds atomic
run consent withdrawal and restrictive live-payload reads. 0112 adds immutable
result allocation and per-object upload intents for run contexts and results.

0113 applies the same custody to material files: service allocation with explicit
`material-storage-v1` consent precedes any upload, both objects must complete
before publication, and replay preserves the original 72-hour deadline. Owner
privacy metadata and withdrawal remain available without a Pass or feature flag.
Authenticated direct uploads to this private bucket are denied.

Material withdrawal atomically revokes every recorded dependent run, including
previous attachments and detached materials. Identifier-only lineage is recorded
in the attachment transaction; withdrawal locks those runs in order, then the
manifest, and rejects a concurrent binding/history change for retry. The UI
confirmation explains that dependent runs stop and their temporary copies are
removed. Local manuscript content is preserved. Existing context selection
metadata backfills known history; missing legacy history is not invented.

Only the service can authorize upload start, record completion or confirm
recovery evidence. A second start never authorizes another HTTP upload under the
same identity. Late completion after withdrawal remains discoverable for cleanup.
Client uploads to run-scoped paths and signed URL minting are denied. Ordinary
authenticated downloads still require live manifests, ownership, consent and the
existing paid-project policy. No trigger modifies the managed Storage schema.

The service first tombstones access, then checks upload readiness, removes both
objects through Storage, and acknowledges only eligible manifest IDs. In-flight
or uncertain uploads cannot be physically finalized. The API rechecks canonical
state before reporting deletion completed. Retention cannot be extended on replay
and tombstones cannot be reopened.

Lost upload responses are reconciled through bounded download, matching byte
count/SHA-256 and confirmation of the same Storage version and immutable intent.
Recovery does not restore revoked consent or publish an agent result. The ready
deletion queue and rotating recovery queue have separate limits, so uncertain
uploads do not starve other deletions. Unresolved evidence cannot be erased;
confirmed cleanup permits its normal parent cascade.

## Evidence and limits

`scripts/agent-context-atomic-smoke.sql` runs real PostgreSQL assertions, replays
the migrations, tests consent withdrawal, direct reads and signed-link minting,
late completion/recovery, hash mismatch, service privileges, evidence deletion,
501 uncertain uploads and rotating batches. It is included in the database CI
workflow. Storage rows in this SQL test are synthetic, not physical byte proof.

An additional local two-connection harness observed lock waits for both
withdrawal/manifest-registration orders and competing upload starts. Only one
worker received upload authorization. It is retained at
`D:/output/katedra-release-tools/consent-concurrency.mjs` with output at
`D:/output/katedra-upload-concurrency.log`.

Staging readback on 2026-09-08 found zero temporary payload manifests and zero
temporary Storage objects, and confirmed `storage.allow_any_operation` exists.
That is a clean cutover prerequisite, not proof of completed authenticated
Storage journeys. 0111/0112 were applied to staging after their full gates;
0113 requires its own reviewed deployment. Production is unchanged.

Legacy protocol-0 objects have no trustworthy stored hash and remain uncertain
pending explicit reconciliation. Missing metadata, an expired lease, or a timed
out HTTP request does not prove physical absence. The system must not claim its
72-hour physical deletion requirement is verified for such cases. Raw
provider-response recovery remains a separate release requirement. None of these
SQL/unit checks replaces final staging verification.

`D:/output/katedra-release-tools/material-concurrency.mjs` additionally exercises
real lock waits for duplicate allocation, incomplete attachment, both attachment
and withdrawal orders, and terminal-run reuse. Output is retained at
`D:/output/lekta-material-concurrency.log`. It uses a disposable local database;
Storage metadata in these checks is synthetic.

Storage behavior references:
- [Upload ordering](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts)
- [Supported schema customization](https://supabase.com/docs/guides/storage/schema/design)
- [Operation-aware access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Signed URL lifetime](https://supabase.com/docs/guides/storage/serving/downloads)
