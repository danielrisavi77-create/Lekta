# Academic IR Core v0.1 — Design Specification

Status: proposed design for user review  
Date: 2026-08-09  
Canonical design repository: Lekta  
Product ownership: Academic Suite Shared Core

## 1. Purpose

Academic IR is the versioned, product-neutral canonical representation of an Academic Suite research project.

It exists to represent the academic project as more than a `.docx` file while preserving a strict distinction between:

1. **project truth** — the structured research/process state known by Academic Suite; and
2. **submission truth** — the exact immutable DOCX/PDF artifacts actually submitted to an institution.

Academic IR does not replace the current Lekta × Katedra shared contract. The existing Academic Suite contract remains the authority for shared account/project identity, ruleset references, Lekta result transport, workflow status, entitlements, and analytics semantics.

Academic IR is a new layer above that foundation and models the internal academic object: document structure, research relationships, process history, provenance, and snapshots.

## 2. Architectural decision

The chosen approach is a **custom Academic IR with explicit adapters**.

Academic IR MUST NOT be identical to:

- DOCX OOXML;
- MyST AST;
- Stencila Schema;
- Pandoc AST;
- a Supabase table layout;
- a Katedra UI state object;
- a Lekta analysis result.

Instead:

```text
                    Academic Suite Project
                              │
                              ▼
                    ┌───────────────────┐
                    │    Academic IR    │
                    │ versioned schema  │
                    └─────────┬─────────┘
                              │
      ┌───────────────┬───────┼───────────────┬──────────────┐
      ▼               ▼       ▼               ▼              ▼
 Lekta adapter   Katedra    MyST adapter   Stencila      Web Twin
                 adapter                    adapter        adapter
      │               │       │               │              │
    DOCX           Process   PDF/DOCX       interop        React UI
   analysis         state    LaTeX/Typst     schema
```

External formats and products interact with Academic IR only through explicit adapters or projections.

## 3. Relationship to existing Academic Suite contract

The existing `ACADEMIC_SUITE_CONTRACT_VERSION = '0.1'` contract remains separate.

Its responsibilities remain:

- canonical user identity;
- canonical project identity;
- academic work taxonomy;
- project stage;
- Academic Rule Set references;
- Lekta result transport;
- issue reconciliation lifecycle;
- entitlement semantics;
- shared analytics semantics.

Academic IR consumes the canonical `projectId` but does not duplicate or replace the full `ProjectManifest`.

The same project therefore has two compatible representations:

```text
ProjectManifest
  └─ projectId

AcademicIR
  └─ projectId
```

Both `projectId` values MUST identify the same canonical Academic Suite project.

No Academic IR migration may silently redefine the semantics of an existing Shared Academic Suite field.

## 4. Product ownership boundaries

The following boundaries are architectural invariants.

### 4.1 Lekta authority

Lekta remains authoritative for:

- local DOCX parsing;
- document structure extraction;
- deterministic formal/compliance checks;
- institutional rules and ruleset provenance;
- formal re-check verification;
- establishing `VERIFIED_FIXED` for formal issues.

Academic IR MUST NOT allow Katedra, Web Twin, MyST, Stencila, or another adapter to declare formal institutional compliance independently of Lekta.

### 4.2 Katedra authority

Katedra remains authoritative for:

- writing/process guidance;
- research reasoning assistance;
- semantic review;
- project milestones;
- AI suggestions and user decisions;
- defense preparation;
- mentor-task workflow where enabled.

Lekta MUST NOT become the authoring authority for academic argumentation merely because Academic IR code initially resides in the Lekta repository.

### 4.3 Shared Core authority

Academic IR itself is conceptually owned by **Academic Suite Shared Core**.

Its initial canonical source resides in the Lekta repository because:

- the shared database migration authority already resides there;
- Lekta is the source of document structure;
- the current executable cross-product contract is canonical there;
- creating a third repository before cross-product use is proven would add unnecessary coordination overhead.

Repository placement MUST NOT be interpreted as product ownership.

## 5. Privacy and persistence boundary

Academic IR v0.1 is **local-first**.

The complete IR MUST NOT automatically be written to the shared Supabase backend.

In particular, existing foundation privacy rules remain intact. The shared backend does not automatically receive:

- raw `.docx` bytes;
- document body text;
- source passages;
- mentor comment text;
- AI transcripts;
- local document-derived excerpts.

Academic IR introduces an explicit persistence classification vocabulary:

```ts
export type PersistenceClass =
  | 'ephemeral-local'
  | 'local-project'
  | 'sanitized-cloud'
  | 'public';
```

Meaning:

- `ephemeral-local`: exists only during one execution/session unless promoted;
- `local-project`: may persist in local project storage but is not sent to shared cloud by default;
- `sanitized-cloud`: explicitly safe structured metadata may be synchronized server-side;
- `public`: explicitly published as part of a public Web Twin/research object.

Every future transport of Academic IR data across a network boundary MUST define which fields are permitted rather than assuming all fields are safe.

## 6. Canonical top-level object

Academic IR v0.1 uses the following conceptual root:

```ts
export const ACADEMIC_IR_SCHEMA_VERSION = '0.1' as const;

export interface AcademicIR {
  schemaVersion: typeof ACADEMIC_IR_SCHEMA_VERSION;
  projectId: string;
  generatedAt: string;

  document: DocumentGraph;
  research: ResearchGraph;
  process: ProcessGraph;
  provenance: ProvenanceGraph;

  snapshots: SnapshotRef[];
}
```

The root MUST be JSON-serializable without executable functions or cyclic object references.

The in-memory implementation may build indexes/maps for performance, but the persisted canonical representation MUST be deterministic and serializable.

## 7. Identifier rules

All durable Academic IR entities use opaque stable IDs.

Consumers MUST NOT infer semantic meaning from identifier formatting.

Required classes include:

- document node ID;
- research node ID;
- edge ID;
- process event ID;
- provenance event ID;
- snapshot ID.

UUIDs are the preferred default for newly created durable entities.

Array position, paragraph number, page number, heading number, or citation number MUST NOT be used as durable identity.

Example invalid durable ID:

```text
paragraph-17
```

because insertion of an earlier paragraph changes its meaning.

A paragraph index is a location property, not identity.

## 8. DocumentGraph

`DocumentGraph` answers:

> What structurally exists in the current document representation?

It is primarily tree-shaped, while still allowing graph references from research/process nodes.

Conceptual model:

```ts
export interface DocumentGraph {
  rootId: string;
  nodes: AcademicDocumentNode[];
  documentFingerprint?: string;
}

export interface AcademicDocumentNode {
  id: string;
  type: AcademicDocumentNodeType;
  parentId?: string;
  childIds?: string[];
  source?: DocumentSourceAnchor;
  contentFingerprint?: string;
  persistence: PersistenceClass;
  attributes?: Record<string, unknown>;
}
```

### 8.1 Document node types

v0.1 MUST support at minimum:

```ts
export type AcademicDocumentNodeType =
  | 'document'
  | 'title-page'
  | 'section'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'list-item'
  | 'figure'
  | 'table'
  | 'caption'
  | 'footnote'
  | 'citation'
  | 'bibliography'
  | 'bibliography-entry'
  | 'unknown';
```

`unknown` exists so projection can preserve structurally relevant content without inventing unsupported semantics.

### 8.2 DocumentSourceAnchor

The source anchor connects a durable Academic IR node to the current document version.

```ts
export interface DocumentSourceAnchor {
  documentFingerprint: string;
  paragraphIndex?: number;
  elementId?: string;
  footnoteId?: string;
  startOffset?: number;
  endOffset?: number;
}
```

A source anchor MUST be treated as version-specific.

Changing the document may invalidate the anchor without invalidating the durable node ID.

## 9. Document reconciliation

Document reconciliation is a required v0.1 design capability even though the reconciliation engine is a separate implementation subproject.

Its purpose is to preserve durable node identity across normal document edits.

Required behavior:

```text
Version A
P47: "Rezultati pokazuju ..."
DocumentNode ID = node-abc

User inserts two paragraphs above

Version B
P49: "Rezultati pokazuju ..."

Reconciliation result
DocumentNode ID = node-abc
New anchor = paragraph 49
```

### 9.1 Reconciliation inputs

A reconciliation implementation MAY use:

- previous node ID;
- old and new content fingerprint;
- normalized text similarity;
- surrounding-node fingerprints;
- heading/section context;
- old/new relative position;
- element-specific identity where OOXML provides one;
- figure/table/caption relationships.

### 9.2 Reconciliation result vocabulary

The eventual reconciliation engine MUST distinguish:

```ts
export type ReconciliationStatus =
  | 'exact'
  | 'high-confidence'
  | 'ambiguous'
  | 'new'
  | 'removed';
```

Ambiguous matches MUST NOT silently attach provenance, mentor feedback, or claims to an arbitrary new node.

### 9.3 Primary acceptance scenario

The critical v0.1 acceptance scenario is:

1. create a document graph;
2. attach a research claim to one paragraph node;
3. insert unrelated paragraphs before it;
4. reproject/reconcile the document;
5. preserve the same durable paragraph node ID and claim relationship.

Failure of this scenario blocks later mentor/provenance features.

## 10. ResearchGraph

`ResearchGraph` answers:

> What does the academic project claim, use as evidence, analyze, and conclude?

It is graph-shaped rather than document-tree-shaped.

```ts
export interface ResearchGraph {
  nodes: ResearchNode[];
  edges: ResearchEdge[];
}
```

### 10.1 Research node types

v0.1 defines the following vocabulary:

```ts
export type ResearchNodeType =
  | 'research-question'
  | 'hypothesis'
  | 'claim'
  | 'source'
  | 'dataset'
  | 'analysis'
  | 'method'
  | 'finding'
  | 'limitation';
```

Figures and tables remain document nodes and may be linked to research nodes through edges rather than duplicated as independent canonical research nodes.

## 11. ClaimNode

A claim is a separately reviewable academic assertion.

```ts
export interface ClaimNode {
  id: string;
  type: 'claim';
  statement: string;

  kind:
    | 'descriptive'
    | 'theoretical'
    | 'empirical'
    | 'causal'
    | 'interpretive'
    | 'normative'
    | 'methodological';

  documentNodeIds: string[];

  status:
    | 'draft'
    | 'supported'
    | 'contested'
    | 'unsupported'
    | 'superseded';

  persistence: PersistenceClass;
  createdAt: string;
  updatedAt: string;
}
```

The `status` value is an Academic Suite research workflow status. It MUST NOT be rendered as a universal truth score.

A claim marked `supported` means the project currently records supporting evidence according to its declared rules, not that the system proves the claim is objectively true.

## 12. SourceNode

A source is a canonical bibliographic/research resource, not a formatted bibliography line.

```ts
export interface SourceNode {
  id: string;
  type: 'source';

  identifiers: {
    doi?: string;
    isbn?: string;
    pmid?: string;
    url?: string;
  };

  csl?: Record<string, unknown>;

  sourceType:
    | 'journal'
    | 'book'
    | 'chapter'
    | 'official-document'
    | 'dataset'
    | 'law'
    | 'web'
    | 'thesis'
    | 'other';

  verification?: {
    status: 'unverified' | 'verified' | 'warning' | 'unavailable';
    verifiedAt?: string;
    verifier?: string;
  };

  persistence: PersistenceClass;
}
```

Citation formatting is a projection/rendering concern. APA, Chicago, Harvard, faculty-specific styles, and other formats MUST be rendered from canonical source metadata rather than stored as separate source identities.

## 13. Evidence relationships

Academic IR v0.1 models evidence as an explicit relationship object.

The key design decision is:

```text
Claim → Evidence relation → Source/Analysis/Dataset/Document node
```

rather than treating source membership as equivalent to evidential support.

```ts
export interface EvidenceEdge {
  id: string;
  type: 'evidence';

  claimId: string;

  target:
    | { type: 'source'; id: string }
    | { type: 'analysis'; id: string }
    | { type: 'dataset'; id: string }
    | { type: 'document-node'; id: string };

  relation:
    | 'supports'
    | 'contradicts'
    | 'qualifies'
    | 'contextualizes'
    | 'method-basis';

  strength?: 'weak' | 'moderate' | 'strong';

  locator?: {
    page?: string;
    section?: string;
  };

  rationale?: string;
  persistence: PersistenceClass;
}
```

`strength` is optional and MUST only be used with transparent criteria. It is not an opaque AI confidence score.

`rationale` may contain sensitive document/source-derived text and therefore defaults to `local-project` unless explicitly sanitized.

## 14. AnalysisNode

Academic IR must support reproducible computational analysis without requiring all projects to use executable research.

```ts
export interface AnalysisNode {
  id: string;
  type: 'analysis';

  engine:
    | 'jamovi'
    | 'r'
    | 'python'
    | 'spss'
    | 'stata'
    | 'excel'
    | 'manual'
    | 'other';

  analysisType: string;
  datasetIds: string[];
  specification: Record<string, unknown>;

  environment?: ExecutionEnvironment;
  outputs: AnalysisOutput[];

  inputDigest?: string;
  resultDigest?: string;

  status:
    | 'declared'
    | 'executed'
    | 'verified'
    | 'failed';

  executedAt?: string;
  persistence: PersistenceClass;
}

export interface ExecutionEnvironment {
  engineVersion?: string;
  runtimeVersion?: string;
  packageVersions?: Record<string, string>;
  environmentDigest?: string;
}

export interface AnalysisOutput {
  kind: 'scalar' | 'table' | 'figure' | 'file' | 'text';
  value?: unknown;
  documentNodeId?: string;
  digest?: string;
}
```

The first version of Academic IR does not execute analyses itself. It defines the stable representation that future Jamovi/R/Python adapters can populate.

## 15. Research relationships

`ResearchEdge` MUST support at minimum:

```ts
export type ResearchRelation =
  | 'addresses'
  | 'tests'
  | 'supports'
  | 'contradicts'
  | 'qualifies'
  | 'uses'
  | 'generates'
  | 'derived-from'
  | 'discussed-in'
  | 'limits';
```

Edges MUST carry stable IDs where they have durable workflow meaning.

A representative graph is:

```text
ResearchQuestion RQ1
       │
     tests
       ▼
Hypothesis H1
       │
  represented by
       ▼
Claim C18
   │                     │
   │ supports            │ contradicts
   ▼                     ▼
Source S7             Source S14
   │
   └──────── supports ───────► Analysis A3
                                  │
                                  ├─ uses ───────► Dataset D1
                                  └─ generates ──► Figure F4
```

## 16. ProcessGraph

`ProcessGraph` represents how the work evolved rather than what the work asserts.

```ts
export interface ProcessGraph {
  events: ProcessEvent[];
}

export interface ProcessEvent {
  id: string;
  type:
    | 'version-created'
    | 'decision-recorded'
    | 'mentor-feedback-recorded'
    | 'revision-recorded'
    | 'user-action'
    | 'verification-recorded';

  occurredAt: string;
  targetIds?: string[];
  relatedEventIds?: string[];
  persistence: PersistenceClass;
  metadata?: Record<string, unknown>;
}
```

The v0.1 design deliberately does not require verbatim mentor comment synchronization.

A mentor comment can exist locally, while a future sanitized cloud event may record only non-sensitive state such as task ID/status/timestamp.

## 17. ProvenanceGraph

`ProvenanceGraph` records who or what performed a meaningful change or verification.

```ts
export interface ProvenanceGraph {
  events: ProvenanceEvent[];
}

export interface ProvenanceEvent {
  id: string;

  actor:
    | { type: 'human'; actorId?: string }
    | { type: 'machine'; provider?: string; model?: string }
    | { type: 'system'; system: 'lekta' | 'katedra' | 'academic-suite' | string };

  action:
    | 'created'
    | 'edited'
    | 'suggested'
    | 'accepted'
    | 'rejected'
    | 'verified'
    | 'generated'
    | 'executed';

  targetIds: string[];
  occurredAt: string;

  inputDigest?: string;
  outputDigest?: string;

  persistence: PersistenceClass;
  metadata?: Record<string, unknown>;
}
```

### 17.1 AI provenance rule

Academic Suite MUST NOT treat a synthetic percentage such as `AI = 23%` as canonical provenance.

Canonical provenance consists of events.

User-facing summaries and institution-specific disclosure documents may be derived from those events.

This design is intended to remain mappable to external provenance vocabularies such as Stencila's human/machine provenance categories without making Stencila Schema the internal source of truth.

## 18. Snapshot model

Snapshots bind project state to a point in time.

```ts
export interface SnapshotRef {
  id: string;
  projectId: string;

  kind:
    | 'working'
    | 'mentor-review'
    | 'preflight'
    | 'submission'
    | 'correction';

  academicIrDigest: string;
  documentFingerprint?: string;
  rulesetId?: string;
  lektaAnalysisId?: string;

  createdAt: string;
  immutable: boolean;
}
```

### 18.1 Submission snapshot rule

A snapshot with `kind = 'submission'` MUST have:

```text
immutable = true
```

and MUST NOT be edited in place.

Any post-submission correction or living update creates a new snapshot/record rather than mutating the original submission snapshot.

### 18.2 Project truth vs submission truth

Academic IR is canonical for the evolving project state.

The exact submitted DOCX/PDF plus their cryptographic fingerprints are canonical for the submitted document state.

A future Web Twin may evolve after submission, but it MUST always distinguish the immutable submitted version from a later living version.

## 19. Digests and fingerprints

Academic IR uses digests for integrity and reconciliation, but v0.1 does not define a cryptographic trust/certificate product.

Required conceptual values include:

- document fingerprint;
- content fingerprint for selected nodes;
- Academic IR snapshot digest;
- analysis input/output digest where available.

The implementation plan MUST define deterministic serialization before using a digest as a stable Academic IR fingerprint.

C2PA signing is explicitly deferred to a later trust-layer subproject.

## 20. Validation rules

Academic IR v0.1 MUST provide deterministic schema and semantic validation.

Validation categories:

### 20.1 Schema validation

Examples:

- required fields exist;
- enum values are known;
- timestamp fields are valid ISO timestamps;
- IDs are non-empty opaque strings.

### 20.2 Graph integrity

Examples:

- `DocumentGraph.rootId` exists;
- every `parentId` resolves;
- every `childId` resolves;
- no impossible parent-child cycles occur in document tree;
- every research edge source/target resolves;
- every evidence `claimId` resolves to a claim;
- snapshot project ID equals Academic IR project ID.

### 20.3 Ownership/semantic validation

Examples:

- a formal `VERIFIED_FIXED` status cannot be invented by Academic IR;
- a submission snapshot must be immutable;
- public/sanitized transport must not automatically include fields classified local-only;
- an `AnalysisNode.status = 'verified'` requires recorded verification provenance, once that verification workflow is implemented.

Validation MUST return structured findings rather than only throwing generic exceptions.

## 21. Serialization

Academic IR canonical serialization is JSON-compatible.

Requirements:

- no executable functions;
- no cyclic references;
- deterministic key/collection ordering for snapshot digest generation;
- explicit schema version;
- unknown additive optional fields must not break readers that follow the same schema version's compatibility rules.

The persisted form SHOULD use arrays for canonical nodes/edges and rebuild in-memory lookup maps when loaded.

This avoids JSON object key ordering becoming part of accidental semantics.

## 22. Schema evolution

Academic IR has its own schema version, independent from the existing Academic Suite cross-product contract version.

v0.1 begins with:

```text
Academic IR schemaVersion = 0.1
```

Rules:

1. breaking semantic changes require a version bump;
2. backward-compatible optional fields may remain on the same version;
3. migration functions must be explicit and testable;
4. old snapshots must remain readable or deliberately migrated through a declared path;
5. adapters must declare which Academic IR versions they consume/produce;
6. no adapter may silently reinterpret an existing field.

Future migration naming convention:

```text
migrateAcademicIR_0_1_to_0_2
```

## 23. Adapter architecture

The adapter boundary is a core invariant.

### 23.1 LektaDocumentAdapter

Consumes existing Lekta outputs such as:

- parsed/document structure information;
- analysis result;
- preview anchors;
- triage locations;
- document fingerprint.

Produces or updates the `DocumentGraph` projection.

The adapter MUST NOT require replacement of the existing Lekta parser/analyzer.

### 23.2 KatedraProcessAdapter

Consumes Katedra-owned process state such as:

- project milestones;
- revision decisions;
- AI assistance events;
- user accept/reject actions;
- sanitized mentor workflow state where permitted.

Produces/updates:

- `ProcessGraph`;
- `ProvenanceGraph`.

### 23.3 MySTAdapter

Maps Academic IR to MyST AST for publishing/export features where MyST is appropriate.

Expected future uses:

- citations;
- bibliography;
- cross-references;
- math;
- PDF;
- LaTeX;
- Typst;
- generic DOCX.

MyST AST MUST NOT become the persisted Academic IR representation.

### 23.4 StencilaAdapter

A future Stencila adapter should allow mapping of:

- Academic `ClaimNode` to Stencila Claim;
- provenance events to compatible provenance representations;
- analysis/execution nodes where reasonable;
- research graph concepts to Stencila graph structures where semantics match.

Stencila interoperability is an explicit design objective but is not a v0.1 implementation requirement.

### 23.5 WebTwinAdapter

Future Web Twin rendering consumes Academic IR and renders product-specific React components.

The Web Twin MUST NOT mutate Academic IR simply because a reader changes local exploratory state.

Interactive exploration state is reader/session state unless explicitly saved as a new project decision/event.

## 24. Compiler/publishing philosophy

Academic Suite should follow the architecture pattern:

```text
input/adapters
      │
      ▼
Academic IR
      │
      ▼
transform/projection pipeline
      │
      ├─ Web Twin
      ├─ JSON/API
      ├─ MyST
      │    ├─ PDF
      │    ├─ LaTeX
      │    ├─ Typst
      │    └─ generic DOCX
      └─ faculty-specific DOCX pipeline where required
```

Output formats MUST be projections, not competing sources of truth.

## 25. Static fallback invariant

Future interactive document nodes MUST define a static fallback before they can be included in a submission-oriented render.

Conceptual future rule:

```text
interactive web node
        │
        ├─ interactive renderer
        └─ canonical static fallback
```

An interactive figure without a deterministic static representation MUST fail submission-oriented publishing validation rather than silently disappear from PDF/DOCX.

This rule is specified now but implemented in the Web Twin/publishing subproject rather than Academic IR Core v0.1.

## 26. Integration with current Lekta architecture

Academic IR Core must be introduced as a projection layer and not as a rewrite of Lekta analysis.

Current Lekta remains structurally:

```text
DOCX
  ↓
OOXML parser
  ↓
analyzeDocx
  ↓
checks / issues / details / documentStructure / preview / triage
```

Academic IR adds:

```text
existing result
    ↓
LektaDocumentAdapter
    ↓
DocumentGraph
```

No v0.1 Academic IR task may require changing existing scoring semantics simply to make IR generation convenient.

## 27. Integration with current Katedra architecture

Academic IR does not replace `ProjectManifest`, `KatedraProjectState`, or the current Katedra workflow contract.

Katedra may project selected local process information into Academic IR.

The full document body does not need to enter Katedra's shared backend in order for Katedra to participate in process/provenance state.

Existing privacy constraints on mentor comments remain in force.

## 28. Proposed source layout

The first implementation SHOULD reside in the Lekta repository under:

```text
src/academic-ir/
├── schema/
│   ├── version.ts
│   ├── common.ts
│   ├── document.ts
│   ├── research.ts
│   ├── process.ts
│   ├── provenance.ts
│   └── snapshot.ts
├── validation/
│   ├── schema-validation.ts
│   ├── graph-validation.ts
│   └── validate-academic-ir.ts
├── serialization/
│   ├── canonicalize.ts
│   └── digest.ts
├── reconciliation/
│   ├── types.ts
│   └── reconcile-document-nodes.ts
├── adapters/
│   └── lekta-document-adapter.ts
├── migrations/
│   └── index.ts
└── index.ts
```

This layout is a design target. The implementation plan must verify current repository conventions before creating files and may make minor naming adjustments where required to follow existing style, while preserving the same boundaries.

## 29. Deliberate v0.1 scope

Academic IR Core v0.1 includes only the minimum required foundation:

1. versioned TypeScript schema/types;
2. stable opaque IDs;
3. `DocumentGraph`;
4. `ResearchGraph` core vocabulary;
5. `ProcessGraph` core vocabulary;
6. `ProvenanceGraph` core vocabulary;
7. snapshot references;
8. deterministic serialization rules;
9. validation;
10. initial Lekta document projection;
11. reconciliation contract and first deterministic reconciliation behavior;
12. test fixtures demonstrating round-trip serialization and stable node identity.

## 30. Explicit non-goals for v0.1

The following are NOT part of Academic IR Core v0.1 implementation:

- public Web Twin UI;
- Paper API/public endpoints;
- MyST publishing implementation;
- Stencila runtime integration;
- C2PA signing;
- RO-Crate packaging;
- automatic claim extraction as a required feature;
- large language model evidence grading;
- live Jupyter execution;
- Jamovi execution adapter;
- R/Python execution adapter;
- multiverse analysis engine;
- real-time collaboration;
- cross-paper knowledge graph;
- research forking/replication UI;
- mentor portal;
- public source-PDF redistribution;
- full Academic IR cloud synchronization;
- a third Academic Suite repository/package.

These may be later subprojects built on the v0.1 foundation.

## 31. Required acceptance tests

The implementation plan MUST include tests covering at minimum the following behaviors.

### A. Root validity

A minimal Academic IR object with a valid project ID, document root, empty optional graphs, and no snapshots passes validation.

### B. Broken reference rejection

A document node referencing a nonexistent child fails graph validation with a structured finding.

### C. Evidence integrity

An evidence edge referencing a nonexistent claim fails validation.

### D. Submission immutability

A submission snapshot with `immutable = false` fails validation.

### E. Serialization round trip

```text
AcademicIR
  → serialize
  → deserialize
  → validate
```

preserves canonical semantics and stable IDs.

### F. Deterministic digest

Equivalent canonical Academic IR state produces the same digest regardless of incidental object insertion ordering.

### G. Stable paragraph reconciliation

Given:

```text
Version A
P47 = "Rezultati pokazuju ..."
node ID = N
Claim C references N
```

and Version B inserts two unrelated paragraphs above, reconciliation preserves node ID `N`, updates the source anchor, and the claim still references `N`.

### H. Ambiguous reconciliation safety

If two possible new paragraphs are equally plausible matches, the reconciliation status is `ambiguous` and the engine does not silently reattach the old durable identity to either candidate.

### I. Privacy projection

The initial Lekta projection used for Academic IR generation does not alter the existing sanitized cross-product `LektaResult` payload or cause raw document content to be added to that shared transport.

### J. Existing contract independence

Academic IR schema versioning is independent of `ACADEMIC_SUITE_CONTRACT_VERSION`; introducing Academic IR does not require changing the existing shared contract version when no existing field semantics change.

## 32. Error handling principles

Academic IR validation/reconciliation SHOULD return typed findings/results instead of relying on generic thrown errors for expected invalid data.

Unexpected programmer/infrastructure failures may throw.

Expected content states such as:

- missing optional source identifier;
- unresolved document node;
- ambiguous reconciliation;
- unsupported document element;

must be represented explicitly.

The system MUST prefer preserving an `unknown` node or an unresolved relation over inventing a false semantic match.

## 33. Compatibility goals

Academic IR is intentionally designed to permit future mapping to:

- MyST AST;
- Stencila Schema;
- schema.org/JSON-LD where appropriate;
- CSL for bibliography metadata;
- RO-Crate for research-object packaging;
- C2PA for cryptographically bound provenance.

Compatibility means explicit adapters can preserve shared semantics.

It does NOT mean Academic IR must copy every field from those standards.

## 34. Security/trust principles

1. Provenance is not proof that a scientific claim is true.
2. Lekta verification is not a universal quality certification beyond its declared rules/coverage.
3. AI provenance is a process record, not automatic academic-integrity judgment.
4. Cryptographic digests prove byte/state consistency only under their declared canonicalization rules.
5. Public publication must be an explicit action.
6. Reader exploration must not silently mutate submitted or author-approved research state.

## 35. Future subproject sequence

After Academic IR Core v0.1, the recommended program order is:

1. **DOCX Projection & Reconciliation** — strengthen durable mapping from Lekta structure to Academic IR;
2. **Research Graph** — production Claim/Source/Evidence/Analysis workflows;
3. **Process & Provenance Graph** — version/AI/mentor decision history;
4. **MyST Publishing Adapter** — citations, PDF, LaTeX, Typst and generic DOCX interoperability;
5. **Web Twin** — React reader, citation inspector, evidence inspector and static fallbacks;
6. **Academic CI** — project-wide structural, source, reproducibility and institutional gates;
7. **Executable Research** — Jamovi/R/Python/Jupyter adapters;
8. **Submission Snapshot & Trust** — immutable manifest and later C2PA interoperability;
9. **Living Research Layer** — corrections, updates, replication, Paper API and cross-paper graph.

Each is a separate spec/implementation-plan cycle and should produce independently testable software.

## 36. Final architectural invariant

The following sentence is the canonical design summary:

> **Academic IR is the versioned, product-neutral canonical representation of an Academic Suite research project; DOCX/PDF remain immutable canonical representations of submitted documents, while Lekta, Katedra, MyST, Stencila and future web/execution systems interact with Academic IR exclusively through explicit adapters.**

Any future change that makes an external format, one product's private UI state, or a database table layout the implicit canonical research representation must explicitly supersede this design decision rather than drifting into it accidentally.
