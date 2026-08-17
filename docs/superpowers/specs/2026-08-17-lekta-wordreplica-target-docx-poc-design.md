# Lekta + WordReplica Target-DOCX Local Repair POC Design

**Date:** 2026-08-17
**Status:** Approved
**Scope:** Phase 2 local proof-of-concept from the approved one-time local repair design

## Goal

Prove that Lekta can produce one canonical corrected DOCX and that WordReplica can visibly reconstruct that exact corrected target in the user's installed Microsoft Word while preserving the original document and all unrelated Word sessions.

The first regression document is:

`C:\Users\PC\Documents\Kalogjera - seminar Havel.docx`

The proof must establish the technical boundary needed by the later paid one-time flow:

1. Lekta owns deterministic repair semantics.
2. WordReplica owns visible, high-fidelity local reconstruction and Word-safe process handling.
3. The server-corrected file and the local Word result are two outputs of the same authorized repair job.

## Decisions

### Lekta produces the canonical corrected target

Lekta's existing deterministic repair engine applies the approved `FixerRequest[]` to the original DOCX and produces the canonical corrected target DOCX. WordReplica does not independently reimplement Lekta's fixer semantics.

This avoids two repair engines drifting apart and lets WordReplica remain focused on the behavior already proven by Golden automation: reconstructing a source document in real Microsoft Word with measurable fidelity.

### WordReplica reconstructs the target, not the original

For local execution, WordReplica treats the corrected target DOCX as its reconstruction source. The user's original DOCX is a separately verified immutable input whose hash must remain unchanged throughout the run.

The local result is always a new file. Overwriting the original is forbidden.

### Repair Contract v1 binds the corrected artifact

Repair Contract v1 has not yet been promoted as a public production contract. Before promotion it will be extended with the canonical target artifact identity:

- `targetSha256`
- `targetSize`
- `targetFileName`

The signature covers these fields through the existing canonical unsigned payload. A runner must reject the package before Word starts if the corrected target bytes do not match the signed identity.

No separate unsigned manifest is authoritative. A transport manifest may exist for packaging, but the signed contract remains the trust root.

## Repository ownership

### Lekta repository

Lekta owns:

- validation and ordering of approved fixer requests;
- production of canonical corrected target bytes;
- calculation of source and target artifact identities;
- construction and signing of Repair Contract v1;
- server-side corrected result;
- later entitlement, claim, payment, download, status and retention APIs.

### WordReplica repository

WordReplica owns:

- parsing and verifying the signed execution package;
- verifying source and target hashes and file sizes;
- Microsoft Word availability and compatibility preflight;
- visible reconstruction of the corrected target into a new local DOCX;
- ownership-safe Word automation that never closes unrelated documents or Word processes;
- local checkpoints, resume, fidelity verification and evidence output;
- later portable runner packaging and secure cleanup.

## POC package

The development POC uses a local package directory rather than production download infrastructure. It contains:

- the immutable original DOCX;
- the canonical corrected target DOCX;
- a signed Repair Contract v1 created with a development signing key;
- optional human-readable expected-repair evidence for diagnostics only.

The private development signing key must not be committed. Tests use deterministic test-only keys. The POC runner accepts only an explicitly configured development public key and must not silently fall back to unsigned mode.

## End-to-end POC flow

1. Hash and snapshot the original Kalogjera document.
2. Apply the approved Lekta repair requests once to produce canonical target bytes.
3. Verify the Lekta repair engine's normal integrity gates.
4. Build and sign a Repair Contract v1 containing both source and target identities.
5. Give the local POC runner the original, target and signed contract.
6. Before Word opens, the runner verifies schema, signature, expiry, engine version, request policy, filenames, sizes and hashes.
7. WordReplica runs preflight against the corrected target.
8. WordReplica opens only its owned visible Word instance and reconstructs the target into a new output file.
9. WordReplica verifies the new output against the corrected target and rechecks that the original hash is unchanged.
10. The runner emits a machine-readable completion report and retains only the development diagnostics required by the existing automation contract.

## Verification model

There are three distinct documents and they must never be conflated:

| Role | Meaning | Required invariant |
| --- | --- | --- |
| Original | User-uploaded document before repair | Byte-identical before and after the run |
| Canonical target | Deterministic Lekta repair result | Matches signed target hash and repair evidence |
| Local output | New document reconstructed visibly in Word | Matches canonical target under required fidelity gates |

Visible-text equality is evaluated between the canonical target and local output. A repair explicitly authorized to change visible text is already represented in the target and associated contract exception; it does not permit further local divergence.

The POC completion report includes at least:

- contract/job identity;
- source, target and output SHA-256 values and sizes;
- original-unchanged result;
- signature and policy validation results;
- Word preflight result;
- required G0-G9 gate results;
- OpenAndRepair result;
- visible text and Fields.Update equality results;
- owned Word process identity evidence;
- output path;
- terminal status and failure reason.

## Failure behavior

The runner must fail before opening Word when contract, signature, expiry, source identity or target identity is invalid.

Once Word has started:

- a fidelity mismatch pauses at a safe checkpoint;
- an ownership mismatch stops without terminating Word;
- interruption leaves a resumable checkpoint bound to the same source, target, contract and output;
- retry may continue only when all bound identities still match;
- the original is never used as an output path;
- no global `WINWORD.EXE` termination is allowed;
- unrelated Word documents and instances are never closed.

The later server result remains independent of a local failure. This POC records that distinction in the report but does not yet implement the production status API.

## Performance

The target-DOCX boundary must not reintroduce character-by-character repair work. Lekta applies fixers directly to DOCX package XML. WordReplica uses its existing fast reconstruction path, including batched text and table operations, checkpoints at safe semantic boundaries, and no unnecessary whole-document restart after a resumable interruption.

Performance is measured separately for:

- Lekta target generation;
- WordReplica preflight;
- visible Word reconstruction;
- final verification.

The POC records these timings so later optimization is evidence-driven.

## Test strategy

Implementation follows strict TDD in each repository.

### Lekta RED/GREEN coverage

- Repair Contract v1 rejects missing or malformed target identity fields.
- Canonical JSON and signature tests prove target identity is signed.
- Context validation rejects target size/hash mismatch.
- Adapter tests prove contract fields come from the exact output of `applyFixers`.
- A fixture test builds the Kalogjera POC package without changing the source.
- Existing repair, contract, strict-open and `npm run check` gates remain green.

### WordReplica RED/GREEN coverage

- Package loader rejects bad signature, expiry, version, filename, source identity and target identity before Word control is created.
- Run binding includes source hash, target hash and contract digest.
- Output path can never resolve to the original or target path.
- Resume rejects any changed bound artifact.
- Test doubles prove unrelated Word instances are never closed.
- The normal full Python regression suite remains green.

### Real Word acceptance run

The POC is accepted only when a visible real-Microsoft-Word run on Kalogjera proves:

1. original SHA-256 unchanged;
2. signed target identity valid;
3. local output created as a new DOCX;
4. no unrelated Word document or process was closed;
5. OpenAndRepair is false;
6. target and local output satisfy the required G0-G9 policy;
7. visible text remains equal before and after Fields.Update relative to the target;
8. an interrupted run can resume without restarting completed semantic work;
9. a second consecutive run on the same commit produces a full pass.

## Non-goals for Phase 2

This implementation package does not include:

- Stripe or production payment handling;
- production entitlement and claim APIs;
- production artifact download or retention;
- automatic runner removal;
- code signing and public distribution;
- macOS, mobile or tablet execution;
- a general-purpose user-facing WordReplica application.

Those remain later phases of the already approved one-time local repair design.

## Promotion rule

Passing the Kalogjera POC proves the local execution boundary, not production readiness. No change is promoted directly to `main`. Lekta changes remain on their feature branch and WordReplica changes remain on `automation-dev` until their repository-specific gates pass. Production promotion additionally requires the broader beta matrix, signed runner, entitlement lifecycle, kill switch and legal/privacy review defined in the parent design.
