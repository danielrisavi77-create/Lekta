# Academic Suite integration baseline — 2026-09-07

This document freezes the integration assumptions used before Academic Suite contract v0.2 work begins. It deliberately separates **repository/code truth** from **production/deploy truth**. A green code check does not imply that production serves the same build, and a deploy-only failure does not by itself mean the source commit is broken.

## Repositories

| Repository | Branch | Baseline SHA | Version |
|---|---|---|---|
| `danielrisavi77-create/Lekta` | `master` | `6dc63ccccaa62cc2c3f0273acca76d1220a85ec1` | `2.2.2` |
| `danielrisavi77-create/katedra` | `master` | `c2365b4d2d04e6462121c34812bf8e516e839e95` | `0.1.0` |
| `danielrisavi77-create/katedra-pkg` | `main` | `72adc57b4bcf1bcc6125c392c5f364aa682c41bd` | `1.9.34` |
| `danielrisavi77-create/WordReplica-Automation` | `main` | `a070dadc58c335447461bf4ec5bd8909fdf53458` | `0.1.0` |

These SHAs are the baseline for PR1. Later PRs must not silently assume them if a repository head advances: the changed head and its compatibility implications must be recorded before implementation continues.

## Contract truth

- Lekta `src/integration/academic-suite-contracts.ts` is the canonical cross-product Academic Suite contract and is still explicitly contract version `0.1`.
- Katedra `lib/academic-suite/contracts.ts` is still the explicit v0.1 mirror of the Lekta contract.
- `katedra-pkg` does **not** use that TypeScript contract as its engine boundary. `rad-audit` already exposes its own contract-driven bridge through `rad-audit/scripts/engine_contract.json` and `rad-audit/scripts/katedra_adapter.py`; v0.2 must extend around that boundary rather than replace it.
- WordReplica has no Academic Suite transport contract yet. Its current integration inputs are its own canonical document model, `RunResult`/warnings and L0–L4 QA semantics.
- No v0.2 work in PR1 changes production payloads, SQL schema, engine behavior or product authority boundaries.

## Authority assumptions frozen for v0.2 design

- **Lekta:** canonical cross-product contract owner; normative Academic Core / faculty-document compliance authority; canonical shared database migration authority.
- **Katedra:** student workflow, manuscript, Evidence Graph, AI/agent workflow, advisory writing/research/defense experience.
- **katedra-pkg:** specialized local academic engines (`rad-audit`, `rad-docx`, PSPP replication and current orchestration/skill layers).
- **WordReplica:** local DOCX model/reconstruction/fidelity runtime and Word compatibility evidence.

These are integration boundaries, not a proposal to merge engines.

## Lekta code-state evidence before the PR1 documentation commit

The current `master` SHA is the merge commit for PR #54. The PR head (`715523e56c9b302ec75e93cbfbc6b6461336ddb5`) completed the following pull-request workflows successfully before merge:

- `check` — success
- `browser-matrix` — success
- `conformance` — success
- `Foundation check` — success
- `db-smoke` — success
- `docx-smoke` — success
- `docx-strict-open` — success
- `repair-net` — success
- `repair-slow` — success
- `rule-claims` — success
- `security-audit` — success
- `Academic Suite DB` — skipped for that PR context, not failed

A fresh branch was then created directly from current `master` for this baseline work: `chore/academic-suite-v02-baseline-2026-09-07`. Branch creation triggered the normal push workflows on the exact `6dc63ccccaa62cc2c3f0273acca76d1220a85ec1` source tree. At the first observation, 19 runs had already completed, **0 failure runs** existed for that SHA/branch, and 5 runs were still in progress. This document will be updated once the documentation commit has its own PR checks.

### Code-state interpretation

**Current classification: GREEN BASELINE, PR1 RE-CHECK PENDING.**

Reason: the source that entered `master` passed the required PR code gates, and no failure had appeared on the fresh baseline branch before the documentation commit. PR1 still needs its own checks after this file is committed.

## Production/deploy-state evidence

The latest scheduled `post-deploy-smoke` observed before this PR1 commit was:

- workflow: `post-deploy-smoke`
- run: `#56`
- run id: `34123047801`
- started: `2026-09-07T12:39:24Z`
- conclusion: **success**
- tested repository head recorded by the run: `4d7c6f6e6039114c4321aa77806068e999298b5b`

That smoke happened **before** current `master` advanced to `6dc63ccccaa62cc2c3f0273acca76d1220a85ec1` at `2026-09-07T14:10:41Z`.

### Deploy-state interpretation

**Latest observed production smoke: GREEN.**  
**Deployment freshness for the current master SHA: NOT YET PROVEN BY A LATER SCHEDULED SMOKE.**

This distinction is intentional. PR2 must not claim that production is serving the current baseline solely because the most recent scheduled smoke succeeded against an earlier repository head.

## PR1 acceptance rule

PR1 is documentation-only. It is ready to merge only when:

1. the diff contains no Academic Suite v0.2 implementation code;
2. the PR's required code checks are green;
3. any deploy/scheduled-smoke result is reported separately from code health;
4. the repository SHAs above still represent the intended integration baseline, or this document is updated before merge.

## What PR1 explicitly does not do

- no JSON Schema contract pack;
- no `0.2` production contract constant;
- no Katedra consumer change;
- no `katedra-pkg` adapter change;
- no WordReplica adapter change;
- no Supabase migration;
- no monorepo move;
- no production cutover.

The next implementation PR may begin only after this baseline PR is reviewed and accepted.
