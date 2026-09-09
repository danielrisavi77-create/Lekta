# Provider execution recovery contract

0114 is a service-only metadata contract. Katedra owns prompts, provider calls,
unverified response bytes and verification. Lekta owns execution identity,
temporary custody and canonical billing. No provider is invoked by these RPCs.

The application consumer is still required before this contract closes the
execution-recovery release requirement. No feature or scheduler is activated.

## Identity and start

`claim_agent_provider_execution(identity, owner)` binds requestId to userId,
projectId, runId, contextRevision, stepId, attempt, operation (`provider` or
`passage`), provider, model and inputSha256. Identity cannot change on replay.
Only an unstarted claim can receive another 60-second execution lease.

`start_agent_provider_execution(execution, owner, workerId, stepClaimedAt)` checks
that execution lease and the current, unexpired canonical step lease. Pass the
exact `claimed_at` string returned by `claim_agent_step`; converting it through a
JavaScript Date loses PostgreSQL microseconds. A stale worker cannot start after
reassignment, including reassignment to the same worker name.

The start transition allocates a private manifest before returning one start
token. A repeated/ambiguous start returns no token. `started` without recorded
response is unresolved, even after either lease expires. It never authorizes a
second call. Any existing legacy billing attempt also prevents a fresh start.

Run consent, active context revision and the exact active Stripe project Pass
are checked server-side. Caller-side policy, approval and provider gates still
apply. Lock order is run, execution, manifest/intents, billing advisory/row,
wallet. Step lifecycle also locks the run first.

## Response custody and charge

`record_agent_provider_response(execution, startToken, evidence)` records only
body/descriptor SHA256 and byte counts, observed token counts, original charge
and pricing-policy version. Each body is bounded to 1,500,000 bytes. Evidence is
immutable; identical submission is idempotent. Unknown usage uses null token
counts/charge and cannot later be replaced with invented usage or an estimate.

The original worker may record late usage metadata after withdrawal, but may
not upload or publish withdrawn content. A database outage before evidence is
stored remains an unknown outcome, never claimed as durable recovery.

Upload the immutable original unverified response and its descriptor through
the existing upload-intent RPCs. Their canonical paths are
`user/project/run/executions/executionId.json` and `.manifest.json`. Retention is
fixed at allocation, at most72 hours; replay cannot extend it. The new
`agent-execution:` namespace is not a verified `agent-result:` artifact, cannot
be selected as a material and is not detached during material replacement.
Authenticated Storage reads deny raw execution objects; recovery uses the
service-side client with its own identity/hash/size validation.

`commit_agent_provider_response(execution)` requires both confirmed upload
intents to match the immutable hashes/sizes and both Storage objects to exist.
A later service worker can retry this after ambiguous publication without
knowing the original start token. No replacement response is accepted.

`settle_agent_provider_execution(execution)` consumes only persisted original
usage, pricing and charge. It validates any existing billing evidence before
using canonical reconciliation. Missing usage remains pending. Repeating a
settlement cannot produce another debit or recalculate a price.

Consumed execution identity survives run/project/manifest deletion, so deleting
or expiring a response makes replay unavailable rather than reopening the
request ID. Account deletion may remove its metadata through the auth-user FK;
the deleted account cannot satisfy the run/access checks. Withdrawal and physical
cleanup use the existing canonical payload authority. Lost acknowledgements and
empty remove responses are not evidence of physical absence.

## Verification scope

`scripts/agent-execution-recovery-smoke.sql` runs the real migration/RPCs twice
inside a rolled-back PostgreSQL fixture. It covers identity conflicts, one start,
lease expiry/reassignment, legacy billing identity, immutable pricing, completed
publication, one debit, deleted response replay, late usage after withdrawal,
material replacement and service-only access. Storage rows are synthetic
metadata; this is not authenticated physical Storage recovery evidence.

Application integration must additionally test original-byte recovery before
provider invocation, changed inputs, ambiguous start/upload/commit, passage
verification, independent verification on replay and the real staging journey.
