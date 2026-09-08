# AI Billing Reconciliation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve canonical pending AI charges with recorded usage exactly once, while preserving attempts whose provider evidence is missing.

**Architecture:** Lekta owns the ledger and atomic wallet debit. A service-role-only RPC locks the same request identity as katedra_consume, uses only stored model/token/charge fields and transitions pending to settled with the usage insert in one transaction. An existing-worker mode processes bounded eligible records without activation. This is one part of the full billing objective: capture/recovery of missing provider evidence and authenticated staging remain required.

**Evidence:** 0068 stores actual nonzero usage when balance is insufficient, but retries return pending forever. 0083 stores zero token counts plus an estimated charge when usage is unavailable. These states must not be treated identically.

- [x] Add actual PostgreSQL regression using 0068/0083: insufficient balance pending, later wallet funding, one debit/usage row across replay, zero-usage refusal, client denial and conflicting project isolation.
- [x] Add idempotent 0109 migration with reconcile and due-list RPCs. No client-supplied amount, tokens or project binding. Unknown usage remains pending; no entitlements are granted.
- [x] Add bounded billing worker helper and tests, wire a separate authenticated existing worker mode, and add SQL smoke to CI.
- [ ] Run focused tests, real SQL smoke, full npm run check, review, orphan/gitleaks. Publish to canonical PR57, without applying migrations or enabling schedules.
- [ ] Continue evidence capture/recovery in Katedra, legacy unknown-usage handling and paid staging as separate remaining tasks; do not call billing or release complete from this slice.

Validation: npm run check passes (503 files / 5772 tests, Edge checks, build). SQL smoke proves replay, balance guards, zero-usage refusal, client denial, owner mismatch and rollback after usage insertion failure. Separate local PostgreSQL transactions proved the second reconciliation waits on the first and yields one debit / one usage row. The disposable concurrency database was removed. Read-only review found no important correctness findings. No staging migration or scheduling was performed.
