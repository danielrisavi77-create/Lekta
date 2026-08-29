# FPZG Corpus Lab v1 — design

**Status:** approved design direction, specification for review  
**Date:** 2026-08-29  
**Scope:** validation infrastructure only; no production behavior changes in this spec  
**Pilot faculty:** Fakultet političkih znanosti Sveučilišta u Zagrebu (FPZG)

## 1. Purpose

FPZG Corpus Lab is the validation system that must answer a stronger question than “does the repair engine run?”:

> For the exact Lekta commit, exact FPZG rule profile and exact validation corpus snapshot, can we prove that detection and repair behave deterministically, do not damage the document, resolve the intended technical finding, do not create new regressions, and remain valid when opened by an independent OOXML implementation and real Microsoft Word?

The lab starts with FPZG and is deliberately designed as a faculty-pack system so the same infrastructure can later cover EFZG, Pravo, FFZG, FER and other faculties without forking the engine or the harness.

The lab is not a training system and must not infer faculty rules from common patterns in submitted theses. Official faculty rules remain the authority. Corpus documents measure robustness, coverage and correctness against those rules.

## 2. Current baseline

### 2.1 Existing Lekta real-corpus harness

Lekta already has the correct core direction in `tests/real-corpus/harness.ts` and `docs/REAL_CORPUS_TESTING.md`:

- analyze a real DOCX;
- build repair requests through the same repair-item assembly as the UI;
- apply repair;
- analyze again;
- verify readable output;
- verify package well-formedness;
- detect PASS -> FAIL regressions;
- verify visible-text preservation except explicitly allowed technical transformations;
- run a second repair pass and require no-op;
- require independent Tier 1 and Tier 2 validation for stronger release evidence.

The existing documentation also records a local corpus of 50 real works, mostly FPZG. It demonstrated that increasing corpus size alone is not enough: shared production/harness logic matters more, and multi-fixer idempotence had been a measured issue. The historical local snapshot documented 38 of 50 documents changing again on the second pass; if those private fixtures are still available, they become named Phase 0 regression cases rather than being discarded. FPZG Corpus Lab therefore extends this harness instead of creating a second validator.

### 2.2 Supabase corpus inventory

The active Lekta Supabase project currently has a large metadata corpus in `public.corpus_works`. For FPZG Dabar theses the relevant current inventory is:

| Kind | Count | Years |
| --- | ---: | --- |
| bachelor | 394 | 2024–2026 |
| master | 1,048 | 2015–2026 |
| **total** | **1,442** | **2015–2026** |

The first rule-era pilot is 2024–2026. It contains:

| Year | Bachelor | Master | Total |
| --- | ---: | ---: | ---: |
| 2024 | 144 | 187 | 331 |
| 2025 | 242 | 202 | 444 |
| 2026 | 8 | 7 | 15 |
| **total** | **394** | **396** | **790** |

All 1,442 relevant rows have a URL, but the current corpus stores metadata/URN links, not the source thesis PDFs in Supabase Storage. The three existing Storage buckets contain production/user files, not the Dabar corpus, so validation artifacts must get a separate private storage boundary.

### 2.3 Dabar constraint

Dabar policy allows harvesting OAI-PMH metadata under CC0 (with stated exceptions for sensitive identifiers), while use/re-use of digital objects follows each object’s own license. Full-text indexing is allowed, but serving or re-serving the full text or parts of it is not automatically allowed.

For the standard Dabar object type “undergraduate and master’s theses”, the supported deposited file format is PDF. Therefore Dabar must not be treated as a source of original Word documents for this pilot.

**Decision:** original DOCX gold fixtures come only from separately authorized original Word files (for example voluntary donations with explicit validation permission or a formal institutional arrangement). Dabar PDFs are a separate reconstructed stress corpus and never become formatting ground truth merely because they are real theses.

## 3. Core design principles

### 3.1 Separate evidence classes

A reconstructed DOCX is not an original DOCX. A deliberately mutated DOCX is not a naturally occurring thesis. A real thesis is not automatically formally correct just because it was defended or published.

Every fixture therefore has an immutable evidence class and allowed claims:

| Fixture class | Source | Can prove detection accuracy? | Can prove repair correctness? | Can prove robustness/integrity? |
| --- | --- | --- | --- | --- |
| `gold-original` | authorized original DOCX | yes, where manually labelled | yes | yes |
| `mutation` | deterministic mutation of a known DOCX | yes for the injected fault | yes for the injected fault | yes |
| `reconstructed` | PDF -> DOCX conversion | no for original Word formatting | only against converter output, not original formatting | yes |

**Holdout is not a fourth fixture class.** It is an orthogonal release-control flag over any of the three evidence classes above. A `gold-original`, `mutation` or `reconstructed` fixture can be development or holdout, while its evidentiary meaning remains unchanged.

A result derived only from `reconstructed` fixtures may never be used to claim that the original FPZG thesis used an incorrect Word style, section break, field, footer, footnote object or page-number configuration.

### 3.2 Official rules, never majority voting

Corpus frequency cannot create or modify an FPZG rule. If 80% of theses use a value different from the official instruction, the corpus shows a common deviation; it does not redefine the profile.

Every scoring/fixer expectation must resolve to a versioned authority record already represented by Lekta’s profile/rule system or be explicitly classified as universal technical hygiene/advisory behavior.

### 3.3 Exact provenance

Every validation result must be reproducible from immutable identifiers:

- source document ID;
- source SHA-256;
- fixture class;
- conversion/mutation recipe and version;
- fixture semantic hash;
- faculty/profile ID and profile fingerprint;
- rule-era ID;
- Lekta Git commit SHA and tree SHA;
- validation harness schema version;
- operating system/runtime versions;
- Microsoft Word/Office build for Word oracle runs;
- font-manifest hash and locale for conversion/render runs;
- corpus snapshot ID and manifest hash.

“No one remembers which file/version was tested” is a release failure, not a documentation inconvenience.

### 3.4 Corpus data never enters public Git history

Real PDFs, reconstructed DOCX files and authorized original DOCX files remain in private validation storage or local protected materialization. Git may contain:

- synthetic fixtures;
- non-sensitive manifests;
- hashes;
- aggregate results;
- generated reports with no thesis text, quotations or personal data.

This extends the privacy rule already used by `tests/fixtures/docx-local/`.

### 3.5 Validation infrastructure is not production runtime

Acquisition, PDF conversion, Word automation and corpus orchestration are build/test tooling. They are not bundled into the public browser application and never receive browser credentials.

## 4. System architecture

The architecture is a pipeline of independently testable components:

```text
corpus_works metadata
       |
       v
FPZG inventory normalizer
       |
       v
rights + access gate ---------> metadata-only / excluded
       |
       v
source acquisition
       |
       +--------------------------+
       |                          |
       v                          v
PDF source                  authorized original DOCX
       |                          |
       v                          v
PDF classifier              gold fixture registration
       |
       v
canonical converter
       |
       v
conversion fidelity gate
       |
       v
reconstructed fixture
       |
       +-------------+------------+
                     |
                     v
            deterministic fixture registry
                     |
          +----------+----------+
          |                     |
          v                     v
   mutation engine        locked holdout split
          |                     |
          +----------+----------+
                     |
                     v
            Lekta validation runner
                     |
        +------------+------------+-------------+
        |                         |             |
        v                         v             v
 independent OOXML oracle   strict-open    Word oracle
        |                         |             |
        +------------+------------+-------------+
                     |
                     v
               visual oracle
                     |
                     v
           release coverage matrix
```

## 5. Component design

### 5.1 FPZG inventory normalizer

The inventory normalizer reads `public.corpus_works` and produces canonical source candidates without copying the thesis content.

Responsibilities:

- map all known FPZG institution aliases and department labels to canonical `faculty_id = fpzg`;
- retain the original institution label for provenance;
- normalize `kind` into Lekta work type without changing the original value;
- attach year and derive rule-era eligibility;
- reject non-Dabar records for the thesis pilot;
- deduplicate by stable source identity, not title text;
- persist the mapping decision and normalizer version.

The first pilot rule era is `fpzg-2024-2026`. Older master theses remain inventoried but do not enter an accuracy release gate until the historical official rules for their era are versioned and verified.

### 5.2 Rights and access gate

Open access alone is not sufficient authorization for persistent conversion and reuse. The validation system records both access state and license state and makes an explicit processing decision.

`rights_class` values:

- `metadata-only`: metadata may be retained; source file must not be fetched for validation;
- `index-only`: the system may perform only an explicitly permitted indexing/transient extraction path; it must not persist a reconstructed DOCX;
- `transform-allowed`: the source may enter the private PDF -> DOCX validation pipeline under the recorded license/permission;
- `gold-authorized`: an original DOCX has separate explicit authorization for private validation use;
- `excluded`: unresolved, embargoed, withdrawn or otherwise unsuitable for this pipeline.

Initial automated transform allowlist is intentionally conservative: CC0, CC BY and CC BY-SA when the object is actually accessible and the recorded terms apply to the file. Other licenses or unclear rights require a manual `rights_decision` before persistent transformation. This is an operational safety policy, not an assertion that every excluded license would legally forbid every internal technical use.

Every decision stores:

- source access status;
- raw license identifier/URI;
- normalized license class;
- decision;
- decision rule/version;
- decision timestamp;
- optional reviewer identity for manual decisions.

No source file is downloaded before this gate returns an allowed processing mode.

### 5.3 Source acquisition

Source acquisition is adapter-based. It must prefer supported repository interfaces and stable identifiers rather than brittle page scraping.

Input:

```text
source_id + URN + repository metadata + rights decision
```

Output:

```text
immutable source artifact ref + SHA-256 + media type + byte length + acquisition metadata
```

Rules:

- follow repository redirects but record final source identity;
- accept only the expected media type for the current path;
- impose byte limits and timeouts;
- verify file magic, not only extension/content-type;
- calculate SHA-256 immediately;
- deduplicate by content hash;
- never overwrite a source hash in place;
- withdrawn/changed source creates a new source version rather than mutating prior evidence;
- do not expose the acquired file through a public bucket or public URL.

### 5.4 PDF classifier

Before conversion, classify each PDF as:

- `born-digital`;
- `scan-with-text-layer`;
- `scan-no-text-layer`;
- `mixed`;
- `unsupported/corrupt`.

Reconstruction v1 accepts only `born-digital`. OCR is a separate future validation track because combining OCR error, PDF-reflow error and Lekta error in one initial pipeline makes diagnosis ambiguous.

The classifier records at minimum:

- page count;
- extractable character/word counts;
- text density by page;
- image coverage indicators;
- encrypted/password-protected state;
- PDF version;
- classifier version.

### 5.5 Canonical PDF -> DOCX converter

The pilot uses a version-pinned Microsoft Word PDF reflow runner as the **canonical converter** because the target object is a Word document and Word’s own import/export behavior is directly relevant to user reality.

The environment is pinned and recorded:

- Windows build;
- Office channel/build;
- locale;
- Word proofing language configuration;
- font-manifest hash;
- converter script version;
- conversion settings.

The converter:

1. opens the source PDF under an isolated automation profile;
2. converts through Word’s PDF reflow path;
3. saves a `.docx`;
4. closes Word;
5. reopens the produced DOCX with `OpenAndRepair = false`;
6. stores binary SHA-256 and a canonical semantic OOXML hash;
7. renders the converted DOCX back to PDF for fidelity metrics;
8. records all warnings and Word automation exit state.

The binary DOCX hash is provenance, but deterministic comparison uses a **semantic package hash** that normalizes known volatile metadata such as save timestamps/producer fields. Otherwise Word-generated timestamps could make semantically identical output look nondeterministic.

A secondary converter is not part of the main release corpus in v1. A 30-document calibration sample may be passed through an independent secondary converter only to identify converter-sensitive structures; disagreement marks the fixture `converter-sensitive` and prevents it from becoming any kind of formatting oracle.

### 5.6 Conversion fidelity gate

The fidelity gate decides whether a reconstructed document is useful as a stress fixture. It does **not** upgrade it to ground truth.

Hard rejection conditions include:

- Word could not reopen output without repair;
- source PDF is corrupt/encrypted in an unsupported way;
- severe text loss or duplication;
- missing first/last content blocks;
- output is effectively empty;
- conversion creates an invalid OPC package.

Recorded quality metrics include:

- normalized text coverage and similarity after dehyphenation/ligature normalization;
- source/output word-count ratio;
- source page count versus Word-rendered output page count;
- extracted image counts/coverage signals;
- table candidate counts;
- header/footer repetition signals;
- conversion warnings.

Initial usable stress threshold for text is at least 99% normalized text coverage with word-count ratio inside 0.98–1.02. Page-count difference is diagnostic, not a hard fail, because reflow can legitimately repaginate. These thresholds are versioned as `conversion_quality_policy` and may only change through an explicit corpus-policy revision, never to make a failing release pass.

### 5.7 Gold-original registry

Gold fixtures are original `.docx` files with explicit validation authorization. Dabar PDF records cannot be silently promoted into this class.

Target for FPZG v1: at least 30 original DOCX files, balanced across:

- bachelor/master where applicable to current FPZG programs;
- politology/journalism/current program variants;
- Croatian/English;
- simple and complex documents;
- automatic TOC;
- footnotes;
- tables/figures;
- multiple sections;
- front-matter/body pagination;
- bibliography and links.

Each gold document gets a manual expectation matrix. Labels can be:

- `pass`;
- `warn`;
- `fail`;
- `unmeasurable`;
- `ambiguous/manual`.

No unlabeled property is treated as known truth.

### 5.8 Deterministic mutation engine

The mutation engine creates controlled negative fixtures from authorized gold or synthetic Word documents without rewriting thesis argumentation.

A single-fault mutation changes exactly one defined technical property and writes a mutation manifest containing:

- mutation ID/version;
- source fixture ID/hash;
- OOXML parts touched;
- exact operation;
- expected `check_id`;
- expected pre-repair state;
- expected fixer ID or `manual-only`;
- expected post-repair state;
- allowed collateral changes;
- visible-text change allowed: yes/no.

Examples include:

- wrong body font;
- wrong size;
- wrong line spacing;
- wrong paragraph spacing;
- wrong alignment;
- wrong margins/paper size;
- Heading style removed but visual formatting retained;
- skipped heading hierarchy;
- static/broken TOC field;
- title-page/page-number interaction;
- wrong page-number start;
- broken header/footer linkage;
- footnote typography deviation;
- caption/field issues;
- DOI normalization cases;
- citation/bibliography structural mismatches where deterministic rules exist.

For every live automatic fixer, v1 requires at least:

- 3 single-fault positive fixtures where the fixer must apply;
- 2 negative controls where it must not apply;
- 1 idempotence fixture;
- an independent oracle assertion for the target property.

Composite fixtures are added only after all participating single-fault fixtures pass. Composite combinations target known interaction surfaces such as sections + page numbers + footer, heading style + TOC + field integrity, and bibliography + DOI + typography.

### 5.9 Holdout split

The holdout is split by **source identity**, never by generated file.

All derivatives of one source (original, reconstructed variants, mutations) stay on the same side of the development/holdout boundary. This prevents leakage where the engine is tuned on one version of a thesis and “validated” on another version of the same thesis.

Rules:

- 20% of eligible source identities are assigned to holdout;
- split is stratified by work type/year/program where sample size permits;
- split seed is fixed and versioned;
- holdout manifest hash is committed, but content is private;
- ordinary developer commands do not reveal holdout results;
- holdout runs only in release validation or explicit audit mode;
- changing the split requires a new corpus snapshot version and invalidates earlier release evidence.

Mutation holdout additionally reserves some **combinations** never used during fixer development, even when their base gold document belongs to the development set.

## 6. Validation runner

### 6.1 Extend, do not replace, the existing harness

`tests/real-corpus/harness.ts` remains the behavioral core. It should be refactored around a fixture provider rather than copied.

Conceptual interface:

```ts
interface ValidationFixtureProvider {
  list(scope: ValidationScope): Promise<ValidationFixtureRef[]>;
  materialize(ref: ValidationFixtureRef): Promise<Uint8Array>;
  provenance(ref: ValidationFixtureRef): Promise<FixtureProvenance>;
}
```

Providers:

- `FilesystemFixtureProvider` — current committed/local workflow;
- `SupabaseValidationFixtureProvider` — private Corpus Lab artifacts in protected CI/local audit environments.

The harness accepts bytes + provenance and emits the same core evidence independent of where the fixture lives.

### 6.2 Run modes

Every relevant fixture can run in three modes:

1. `analysis-only` — detection matrix, no repair;
2. `isolated-fixer` — one fixer at a time, for attribution and deterministic proof;
3. `default-bundle` — exactly the repair selection a real user receives, for interaction testing.

High-risk structural fixers additionally run in designated composite scenarios.

### 6.3 Core assertions

After a repair run, the runner must assert:

- `integrityFailure === null`;
- output DOCX is readable by Lekta ZIP reader;
- every XML/rels part is well formed;
- OPC content types and relationships are valid;
- no unexplained package parts were dropped/emptied;
- visible text is preserved except explicitly allowlisted technical transformations;
- no previously passing deterministic check regresses;
- target property is resolved when the fixture has ground truth for it;
- no unknown fixer or silent skip occurred;
- second application of the same effective recipe is a no-op;
- repeated clean runs produce the same semantic package hash.

The current `secondPassNoOp` behavior becomes a hard release invariant, not an informational metric.

## 7. Independent oracles

Lekta cannot be the only judge of Lekta.

### 7.1 Independent OOXML oracle

A separate Python or .NET oracle, with no imports from Lekta’s TypeScript repair/analyzer code, measures deterministic low-level properties such as:

- section/page size and margins;
- paragraph/run styles and direct formatting;
- line/paragraph spacing;
- heading styles/hierarchy markers;
- field instructions;
- numbering settings;
- headers/footers and section linkage;
- footnote/endnote objects;
- relationship targets;
- content types.

For each mutation/fixer pair the oracle must be able to say whether the injected property exists before repair and whether the expected property exists after repair.

### 7.2 Tier 1 strict-open oracle

The existing `python-docx + lxml` strict-open path remains required for every changed package in CI.

### 7.3 Microsoft Word oracle

For every changed holdout/gold result and all high-risk structural fixtures, Word automation must:

1. open with `OpenAndRepair = false`;
2. report no repair/recovery dialog or automation error;
3. inspect selected Word-level properties;
4. save;
5. close;
6. reopen with `OpenAndRepair = false`;
7. render to PDF;
8. close cleanly.

A document that only opens after Word repairs it is a release failure even if Lekta and lxml accept it.

### 7.4 Visual oracle

Word-rendered PDF before and after repair is compared using a separate renderer/diff process.

The visual oracle records:

- page count change;
- blank-page appearance/disappearance;
- large layout displacement;
- missing figures/tables;
- title-page changes;
- header/footer presence;
- TOC/page-number region changes;
- pixel/block difference outside expected repair regions.

The visual oracle is not allowed to fail simply because a formatting fixer changes the intended formatting. Each mutation/fixer declares an `allowed_visual_scope`. Changes outside that scope require review or fail depending on severity.

## 8. Data model

Validation data is isolated from the public Data API in a private `validation` schema. Production user repair tables are not reused as corpus tables.

### 8.1 `validation.sources`

One row per source version.

Important fields:

- `id uuid`;
- `corpus_doc_id bigint` nullable FK/reference to `public.corpus_works.doc_id`;
- `faculty_id text`;
- `source_id text`;
- `source_url text`;
- `source_institution_label text`;
- `work_type text`;
- `program_key text nullable`;
- `year int`;
- `rule_era text`;
- `access_status text`;
- `license_raw text`;
- `license_class text`;
- `rights_class text`;
- `rights_policy_version text`;
- `source_media_type text`;
- `source_sha256 text nullable`;
- `source_bytes bigint nullable`;
- `source_storage_path text nullable`;
- `acquired_at timestamptz nullable`;
- `withdrawn_at timestamptz nullable`;
- `metadata jsonb` for non-sensitive repository technical metadata.

### 8.2 `validation.fixtures`

One row per immutable validation fixture.

- `id uuid`;
- `source_id uuid nullable`;
- `faculty_id text`;
- `fixture_class text` (`gold-original`, `mutation`, `reconstructed`);
- `work_type text`;
- `profile_id text`;
- `rule_era text`;
- `storage_path text`;
- `binary_sha256 text`;
- `semantic_sha256 text`;
- `converter_id text nullable`;
- `converter_version text nullable`;
- `converter_environment_hash text nullable`;
- `mutation_id text nullable`;
- `quality_policy_version text nullable`;
- `quality_metrics jsonb`;
- `holdout boolean`;
- `created_at timestamptz`.

A fixture row is append-only. A new conversion, new Office build or new mutation recipe creates a new fixture.

### 8.3 `validation.mutations`

Versioned deterministic mutation definitions/manifests.

- `mutation_id text`;
- `version int`;
- `check_id text`;
- `fixer_id text nullable`;
- `parts_touched text[]`;
- `expected_before text`;
- `expected_after text`;
- `visible_text_change_allowed boolean`;
- `allowed_collateral jsonb`;
- `manifest jsonb`.

### 8.4 `validation.expectations`

Manual/derived ground truth, only for classes where that claim is allowed.

- `fixture_id uuid`;
- `check_id text`;
- `expected_status text`;
- `expected_value jsonb nullable`;
- `expected_fixer_id text nullable`;
- `authority_type text` (`official-rule`, `independent-oracle`, `manual-label`, `mutation-manifest`);
- `authority_ref text`;
- `annotation_status text`;
- `reviewed_at timestamptz`.

### 8.5 `validation.runs`

One immutable validation execution.

- `id uuid`;
- `git_commit text`;
- `git_tree text`;
- `harness_schema_version int`;
- `faculty_id text`;
- `profile_fingerprint text`;
- `corpus_snapshot text`;
- `corpus_manifest_hash text`;
- `holdout boolean`;
- `run_mode text`;
- `environment jsonb`;
- `started_at/finished_at`;
- `status text`.

### 8.6 `validation.results`

One result row per fixture/run.

Records the existing real-corpus metrics plus:

- actual check statuses before/after;
- precision/recall contribution where ground truth exists;
- target-resolution result;
- isolated/default-bundle fixer lists;
- skip reasons;
- unknown fixers;
- semantic output hash;
- deterministic rerun status;
- independent-oracle result;
- strict-open result;
- Word open/save/reopen result;
- Word repair-dialog indicator;
- visual-oracle result;
- final verdict (`pass`, `review`, `fail`, `not-applicable`).

### 8.7 Private Storage

Create a dedicated private bucket `validation-corpus` with no anon/authenticated read path. Only service-role validation jobs and explicitly authorized maintainers may materialize content.

Suggested structure:

```text
fpzg/sources/pdf/<source-sha>.pdf
fpzg/sources/gold/<source-sha>.docx
fpzg/fixtures/reconstructed/<fixture-id>.docx
fpzg/fixtures/mutation/<fixture-id>.docx
fpzg/runs/<run-id>/word-render/<fixture-id>.pdf
```

If rights policy allows transient processing but not persistent transformed storage, artifacts are materialized to an ephemeral runner workspace and only hashes/metrics are retained.

## 9. Corpus snapshot and split

A corpus snapshot is an immutable manifest, not “whatever is currently in the database”.

Example ID:

```text
fpzg-2024-2026-v1
```

Manifest contains only fixture/source IDs, hashes, evidence class, profile, rule era, holdout flag and non-sensitive technical metadata.

The manifest itself is hashed. Every release proof references that hash.

## 10. FPZG v1 cohort strategy

### Stage A — inventory all 790 recent records

All FPZG 2024–2026 bachelor/master metadata enters the inventory and rights classifier. No assumption is made that all 790 are eligible for transformation.

### Stage B — gold set

Acquire at least 30 explicitly authorized original DOCX documents. The project must not delay mutation testing while waiting for 30: synthetic/authorized bases may exercise the mutation engine earlier, but FPZG release cannot claim full gold coverage until the target is met.

### Stage C — mutation matrix

Generate the required per-fixer positives, negative controls, idempotence fixtures and composites for every currently live automatic fixer. Coverage derives from live fixer registries; no fixed hardcoded “31 fixer” assumption is allowed because the registry can change.

### Stage D — reconstruction calibration

Take 30 rights-eligible born-digital FPZG PDFs, convert through the pinned canonical Word runner, measure fidelity and run the full technical repair loop. Use this stage to freeze `conversion_quality_policy` and verify converter environment reproducibility.

### Stage E — 200-document reconstructed development/stress corpus

If at least 200 eligible born-digital PDFs exist, select a stratified 200-source cohort. If fewer exist, take all eligible sources.

Stratification dimensions, in order:

1. work type;
2. year;
3. program/department label;
4. language when detectable;
5. length/page bands;
6. presence of footnotes;
7. tables/figures;
8. multi-section/page-number complexity indicators.

### Stage F — locked holdout

Reserve 20% by source identity before the 200-source development set is used for tuning. Holdout results remain hidden from ordinary development runs.

### Stage G — scale to every eligible FPZG 2024–2026 source

Only after the 200-document stress set and holdout pass do we run the complete rights-eligible recent FPZG corpus.

### Stage H — historical eras

2015–2023 master theses are added only after the corresponding historical official FPZG rules are captured into explicit verified rule eras. They may be used earlier for non-rule-specific integrity stress tests, but not to score historical formal compliance against current rules.

## 11. Metrics and release matrix

### 11.1 Detection metrics

For gold and mutation fixtures where ground truth exists:

- true/false positives;
- true/false negatives;
- precision/recall per `check_id`;
- accuracy by fixture class, work type and rule era;
- `unmeasurable`/ambiguous rate.

Deterministic blocking checks are expected to be exact on labelled fixtures. Checks that cannot reach deterministic quality remain advisory and must not be promoted to a blocking compliance claim merely to improve aggregate score.

### 11.2 Repair metrics

Per fixer and fixer combination:

- offered count;
- applied count;
- target resolved count/rate;
- targeted unresolved count;
- PASS -> FAIL regressions;
- package integrity failures;
- dropped/emptied parts;
- unexpected visible-text changes;
- second-pass changes;
- semantic determinism failures;
- independent-oracle failures;
- Word failures;
- visual out-of-scope changes.

### 11.3 Risk classes

Fixers are grouped for release evidence requirements:

**Class L — local formatting**  
Font, size, line/paragraph spacing, alignment, margins, paper size and similarly bounded property changes.

**Class M — semantic-document formatting**  
Heading styles/case, captions, bibliography formatting, DOI/link normalization and other changes that interact with document semantics but do not restructure sections.

**Class H — structural**  
Section surgery, page numbering/footer behavior, TOC/fields, title-page/section interaction, table/figure rescue, required-section insertion and any fixer that adds/removes OPC parts or Word fields.

Class H requires Word oracle + visual review coverage before public AutoFix. A Class H fixer without sufficient evidence may still be detected and explained but stays disabled or confirmation/manual-only.

## 12. Hard release criteria for FPZG AutoFix

A release candidate for FPZG may pass only when all applicable conditions are true for the exact commit/corpus/profile snapshot:

1. **Package integrity:** 0 integrity failures.
2. **Word compatibility:** 100% of changed holdout/gold/high-risk outputs open, save and reopen in Microsoft Word with `OpenAndRepair = false` and no repair/recovery event.
3. **No silent damage:** 0 unexplained dropped/emptied package parts and 0 unexpected visible-text changes.
4. **No regression:** 0 unexplained deterministic PASS -> FAIL regressions.
5. **Idempotence:** 100% second-pass no-op for every automatic fixer and the default repair bundle.
6. **Determinism:** repeated runs in the pinned environment produce the same semantic package hash for the same input/profile/recipe.
7. **Fixer attribution:** 0 unknown fixers and 0 silent skips; every skip has an explicit reason.
8. **Mutation closure:** every live automatic fixer passes its required positive, negative-control and independent-oracle fixtures.
9. **Holdout:** locked holdout meets the same integrity/regression/idempotence gates as the development corpus.
10. **Structural fixer evidence:** every Class H fixer enabled for public AutoFix has at least three manually reviewed representative Word+visual cases in addition to mutation/composite tests.
11. **Rights provenance:** 100% of source artifacts used by the lab have an explicit rights decision; no unresolved source enters persistent transformation.
12. **Exact release proof:** result is bound to Git commit/tree, profile fingerprint, corpus manifest hash, harness version and Word environment.

A reconstructed fixture may block release on corruption, regression, nondeterminism, idempotence or Word-open failure. It may **not** block release merely because Lekta disagrees with a Word-formatting property that PDF conversion itself may have invented; that disagreement is classified as `converter-artifact/unknown-ground-truth` unless a separate oracle establishes the property.

## 13. Output reports

### 13.1 Machine report

Versioned JSON with:

- run provenance;
- corpus snapshot;
- per-fixture results;
- per-check confusion matrices;
- per-fixer repair matrix;
- risk-class status;
- holdout aggregate;
- hard release criteria and pass/fail reasons.

No thesis text or quotations are written to the report.

### 13.2 Human report

Generated Markdown/HTML dashboard shows:

- overall release verdict;
- FPZG bachelor/master coverage;
- rule-era coverage;
- fixer matrix;
- detection precision/recall where ground truth exists;
- failure clusters;
- converter-artifact counts;
- Word/visual review queue;
- links to internal fixture IDs, never public source content.

## 14. Error handling and quarantine

Every pipeline stage has explicit terminal states. Errors are not collapsed into “failed document”.

Examples:

- `rights-unresolved`;
- `source-unavailable`;
- `source-changed`;
- `pdf-encrypted`;
- `pdf-scan`;
- `conversion-failed`;
- `conversion-low-fidelity`;
- `invalid-docx`;
- `lekta-analysis-failed`;
- `integrity-failed`;
- `oracle-disagreement`;
- `word-open-failed`;
- `visual-review-required`.

Bad or ambiguous inputs move to quarantine and remain auditable. The pipeline never changes thresholds or silently discards a failing fixture during a release run.

## 15. Security and privacy boundaries

- Validation bucket is private and separate from user repair storage.
- Service-role credentials exist only in protected CI/local validator environments.
- Browser/client code receives no validation-corpus credentials.
- Real corpus artifacts are never uploaded to GitHub Actions as unrestricted public artifacts.
- Logs contain IDs, hashes, counts, timings and safe technical paths, not thesis text.
- Filenames are normalized to internal fixture IDs in reports.
- Source withdrawal/rights change can quarantine future use without rewriting historical run provenance.
- Access to gold originals is at least as restrictive as reconstructed sources.
- Corpus Lab writes nothing into production user repair history/entitlements/analytics tables.

## 16. Integration with existing release pipeline

FPZG Corpus Lab does not replace current tiers. It adds a higher-level release proof:

```text
Tier 0  package integrity + unit/golden
Tier 1  strict-open independent parser
Tier 1.5 LibreOffice/render where available
Tier 2  Microsoft Word oracle
Tier 3  FPZG Corpus Lab matrix + locked holdout + exact snapshot proof
```

The eventual `release-gate` consumes a single Corpus Lab verdict for FPZG rather than reimplementing its rules in CI YAML.

The Corpus Lab proof must be fail-closed: missing private corpus access, unavailable Word oracle, stale corpus snapshot, mismatched profile fingerprint or incomplete holdout are `unavailable/fail`, never success.

## 17. Faculty-pack expansion contract

Faculty-specific configuration is data/configuration around a shared engine.

Conceptual contract:

```ts
interface FacultyValidationPack {
  facultyId: string;
  institutionAliases: string[];
  supportedWorkTypes: string[];
  ruleEras: RuleEra[];
  profileResolver: ProfileResolver;
  corpusSelector: CorpusSelector;
  stratification: StratificationPolicy;
  mutationCoverage: MutationCoveragePolicy;
  releaseThresholds: ReleaseThresholdPolicy;
}
```

No faculty pack may fork:

- ZIP/DOCX parser;
- repair engine;
- integrity gates;
- independent oracles;
- base corpus harness;
- result schema.

After FPZG passes, another faculty is added by supplying verified rules, corpus mapping, gold labels and faculty-specific coverage configuration.

## 18. Delivery phases

### Phase 0 — freeze baseline

- preserve current real-corpus behavior/results;
- record the existing local FPZG-heavy corpus as a baseline where available;
- turn any current non-idempotence into explicit blocker cases rather than deleting/relaxing them.

### Phase 1 — validation data plane

- private `validation` schema;
- private `validation-corpus` bucket;
- source/fixture/run/result tables;
- inventory normalizer;
- rights/access gate;
- immutable corpus snapshot manifest.

### Phase 2 — provider-based harness

- extract byte/provenance core from current real-corpus harness;
- filesystem provider remains green;
- add protected Supabase provider;
- reports stay content-free.

### Phase 3 — gold + mutation

- register authorized gold sources;
- build expectation matrix;
- build deterministic single-fault mutation library;
- independent OOXML assertions;
- isolated/default-bundle matrix.

### Phase 4 — reconstruction pipeline

- Dabar acquisition adapter;
- PDF classifier;
- pinned Word conversion runner;
- fidelity policy;
- 30-document calibration;
- 200-document stress cohort.

### Phase 5 — Word + visual oracle automation

- Word open/save/reopen proof;
- render-to-PDF;
- visual-scope diff;
- review queue for structural cases.

### Phase 6 — holdout/release gate

- locked source split;
- release-only holdout run;
- machine/human release reports;
- exact commit/profile/corpus proof;
- branch/deployment release gate integration.

### Phase 7 — FPZG full recent corpus

- run every rights-eligible 2024–2026 source;
- classify remaining converter/repair gaps;
- enable only fixers that meet their evidence class threshold.

### Phase 8 — historical FPZG + next faculty

- add verified historical FPZG rule eras;
- then instantiate the same faculty-pack architecture for the next faculty.

## 19. Explicit non-goals for v1

- OCR reconstruction of scanned theses;
- learning faculty rules from corpus frequency;
- semantic/content grading of thesis argumentation;
- generative rewriting of thesis text;
- public distribution of corpus PDFs or reconstructed Word files;
- using a reconstructed DOCX as proof of the original Word document’s hidden OOXML structure;
- supporting every Croatian faculty before FPZG passes its release gate;
- changing production AutoFix behavior as part of this design-only change.

## 20. Success definition

FPZG Corpus Lab v1 is successful when Lekta can produce a repeatable, exact-SHA release proof that says, for FPZG:

- what source/fixture classes were tested;
- which official rule era/profile was used;
- which checks/fixers have actual ground truth;
- which cases are converter-only stress evidence;
- whether each automatic fixer is deterministically resolved and idempotent;
- whether any repair damaged text/package structure or introduced a regression;
- whether real Word accepted the changed documents without repair;
- whether the locked holdout agrees with development evidence;
- and exactly why a fixer is enabled, advisory, confirmation-only or disabled.

Only then should FPZG become the first faculty for which Lekta can claim that its technical document-validation and AutoFix path is covered by a deterministic release matrix rather than by a collection of individually green tests.

## 21. References used for this design

Repository sources:

- `docs/REAL_CORPUS_TESTING.md`
- `tests/real-corpus/harness.ts`
- `src/repair/package-integrity.ts`
- `src/repair/zip-codec.ts`
- `scripts/release-check.mjs`

External authority/context:

- Dabar repository policies: `https://dabar.srce.hr/repository-policies`
- Dabar supported digital objects: `https://dabar.srce.hr/en/objects`
- New Dabar architecture (production from 2025-11-04): `https://dabar.srce.hr/en/news/2026-05-15-the-new-dabar`

Supabase inventory figures in this design were measured against the active Lekta project on 2026-08-29 and must be re-snapshotted when implementation begins.