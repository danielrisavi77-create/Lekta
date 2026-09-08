# Katedra duplicate Pass refund reconciliation

The canonical `katedra_pass_refunds` ledger records the immutable checkout,
PaymentIntent, user/project, amount/currency and eventual refund ID. Only the
service role can claim or update it. A five-minute lease prevents two workers
from initiating the same reconciliation concurrently; stale leases cannot
publish evidence. Success is terminal and must include a refund ID.

Katedra checks this ledger before granting a Pass or wallet tokens. A refund
already in progress remains a refund even after the original Pass expires. With no ledger row, provider history is checked before granting access, covering refunds predating deployment.
The ledger is written before calling Stripe. A known refund is retrieved by
ID; a lost create response is recovered through PaymentIntent refund history.
The original creation parameters and idempotency key are preserved across rollout.
Success is acknowledged only after canonical persistence succeeds.

[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests) is not a
permanent ledger. If an ambiguous creation is older than the conservative
23-hour retry window and no matching refund can be recovered, the state becomes
`needs_review`; the worker does not issue a new creation request. Multiple or
partial historical refunds also require review. These cases remain visible and
can be checked again; they are not labelled successful or silently released.

The existing Lekta worker has a separate `?mode=refunds` dispatch using its
dedicated cron authorization and Katedra worker token. The Katedra endpoint
requires that token and the existing project-lock flag, lists at most 25 due
records and stops starting work after 30 seconds. Stripe requests use a
10-second timeout with SDK retries disabled; the dedicated endpoint bounds RPC
requests too. No Stripe key crosses to Lekta. No new cron or flag is activated.

The real PostgreSQL smoke applies migration 0108 twice and verifies client denial,
exclusive lease, immutable payment binding, saved refund identity, stale lease
denial and terminal success replay. Katedra regression tests cover lost responses,
history recovery, expired creation windows, persistence failure, provider identity,
worker authorization and a repeated webhook after the original Pass expires.
Provider calls are synthetic in local tests. Actual paid staging evidence remains
required after canonical migration-journal reconciliation and coordinated deploy.

Deploy migration 0108 before the Katedra consumer: absence of the canonical read
RPC deliberately causes webhook retries instead of issuing access without knowing
whether the payment is already being refunded. Reconciliation of AI usage entries
in `katedra_billing_attempts` is a separate outstanding part of the billing goal.

The lease is reclaimable after expiry, with no heartbeat renewal. Each reconciliation uses at most two 10-second provider calls and three bounded RPC calls; work fits inside the five-minute lease. Multiple history results or a further page require review immediately. The SQL smoke starts with broad Supabase-style service-role defaults and proves direct table updates/deletes are denied.
