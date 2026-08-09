# Academic IR Core v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Academic IR Core v0.1 as a local-first, versioned, deterministic TypeScript research-object foundation without changing existing Lekta scoring/parser semantics or the existing Lekta × Katedra shared transport contract.

**Architecture:** Add a new `src/academic-ir/` module that owns schema/types, validation, deterministic serialization/digests, baseline document-node reconciliation, snapshot helpers, and an initial Lekta document projection adapter. Academic IR remains separate from `src/integration/academic-suite-contracts.ts`; existing Lekta analysis continues unchanged and feeds Academic IR only through an explicit adapter.

**Tech Stack:** TypeScript 7 strict mode, Vitest 2, Vite 8, browser/Node Web Crypto (`crypto.subtle`), existing Lekta modules only. No new runtime or dev dependencies.

## Global Constraints

- Approved design source: `docs/superpowers/specs/2026-08-09-academic-ir-core-v0-1-design.md` at commit `fe05e2ef6e2a66e8b2d7d06539c65e7eeff7385c`.
- Implement in an isolated worktree/feature branch based on the approved design head; do not implement directly on `master`.
- Existing `ACADEMIC_SUITE_CONTRACT_VERSION` remains `0.1`; Academic IR has its own independent `ACADEMIC_IR_SCHEMA_VERSION = '0.1'`.
- Do not modify `src/docx/parser.ts`, scoring semantics, citation engine, or existing audits for Academic IR convenience. If later execution discovers a parser change is genuinely required, stop that task and first add a golden-file test per `CLAUDE.md`.
- Do not send raw `.docx`, document body text, source passages, mentor comment text, AI transcripts, or Academic IR content to the shared Supabase backend.
- Do not change the shape or privacy semantics of `toSharedLektaResult()` in `src/integration/lekta-result-adapter.ts`.
- Lekta remains the only authority that can establish formal `VERIFIED_FIXED`; Academic IR must not synthesize that status.
- Academic IR must never write or rewrite academic argumentation; it stores/project structures and process metadata only.
- Canonical persisted Academic IR must be JSON-serializable, acyclic, and deterministic for digest purposes.
- Durable identity must never depend on paragraph/page/array position.
- Ambiguous reconciliation must remain unresolved rather than attaching old identity to an arbitrary candidate.
- No MyST, Stencila, C2PA, RO-Crate, Jupyter, Jamovi execution, public Web Twin, or cloud-sync implementation in this plan.
- No new package dependencies. Use built-in `crypto.randomUUID`, `crypto.subtle`, `TextEncoder`, and existing TypeScript/Vitest tooling.
- Before every commit, run the relevant targeted tests and then the repository build gate: `npm run check` (`tsc --noEmit && vitest run && vite build`). Never commit red.

---

## File Map Locked by This Plan

Create the following source layout:

```text
src/academic-ir/
├── schema/
│   ├── version.ts
│   ├── common.ts
│   ├── document.ts
│   ├── research.ts
│   ├── process.ts
│   ├── provenance.ts
│   ├── snapshot.ts
│   └── root.ts
├── validation/
│   ├── types.ts
│   ├── schema-validation.ts
│   ├── graph-validation.ts
│   └── validate-academic-ir.ts
├── serialization/
│   ├── canonicalize.ts
│   ├── serialize.ts
│   └── digest.ts
├── reconciliation/
│   ├── types.ts
│   ├── fingerprint.ts
│   └── reconcile-document-nodes.ts
├── adapters/
│   └── lekta-document-adapter.ts
├── migrations/
│   └── index.ts
├── create-academic-ir.ts
├── snapshots.ts
└── index.ts
```

Create these test files:

```text
tests/academic-ir-schema.test.ts
tests/academic-ir-validation.test.ts
tests/academic-ir-serialization.test.ts
tests/academic-ir-reconciliation.test.ts
tests/academic-ir-lekta-adapter.test.ts
tests/academic-ir-snapshots.test.ts
tests/academic-ir-boundaries.test.ts
```

Do not modify `src/analysis/analyze-docx.ts`, `src/docx/parser.ts`, `src/integration/academic-suite-contracts.ts`, or `src/integration/lekta-result-adapter.ts` in this implementation unless a later reviewer explicitly approves a separate follow-up change.

---

### Task 1: Define the Academic IR v0.1 schema and public API

**Files:**
- Create: `src/academic-ir/schema/version.ts`
- Create: `src/academic-ir/schema/common.ts`
- Create: `src/academic-ir/schema/document.ts`
- Create: `src/academic-ir/schema/research.ts`
- Create: `src/academic-ir/schema/process.ts`
- Create: `src/academic-ir/schema/provenance.ts`
- Create: `src/academic-ir/schema/snapshot.ts`
- Create: `src/academic-ir/schema/root.ts`
- Create: `src/academic-ir/create-academic-ir.ts`
- Create: `src/academic-ir/index.ts`
- Test: `tests/academic-ir-schema.test.ts`

**Interfaces:**
- Produces: `ACADEMIC_IR_SCHEMA_VERSION`, `PersistenceClass`, `AcademicIR`, all graph/node/edge types, and `createAcademicIR(input)`.
- Consumes: only platform `crypto.randomUUID()` for future IDs; the root factory itself needs no generated entity IDs.
- Later tasks import all Academic IR types from `src/academic-ir/index.ts`, not deep paths unless implementing inside the module.

- [ ] **Step 1: Write the failing schema/version tests**

Create `tests/academic-ir-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_IR_SCHEMA_VERSION,
  createAcademicIR,
  type AcademicIR,
  type ClaimNode,
  type EvidenceEdge,
} from '../src/academic-ir';

describe('Academic IR schema v0.1', () => {
  it('locks the Academic IR version independently from the Academic Suite contract', () => {
    expect(ACADEMIC_IR_SCHEMA_VERSION).toBe('0.1');
  });

  it('creates a minimal local-first Academic IR root', () => {
    const ir = createAcademicIR({
      projectId: 'project-123',
      generatedAt: '2026-08-09T18:00:00.000Z',
      documentRootId: 'doc-root',
    });

    expect(ir).toEqual({
      schemaVersion: '0.1',
      projectId: 'project-123',
      generatedAt: '2026-08-09T18:00:00.000Z',
      document: {
        rootId: 'doc-root',
        nodes: [
          {
            id: 'doc-root',
            type: 'document',
            childIds: [],
            persistence: 'local-project',
          },
        ],
      },
      research: { nodes: [], edges: [] },
      process: { events: [] },
      provenance: { events: [] },
      snapshots: [],
    } satisfies AcademicIR);
  });

  it('exposes claim and evidence types without making source membership equal evidence', () => {
    const claim: ClaimNode = {
      id: 'claim-1',
      type: 'claim',
      statement: 'Primjer tvrdnje',
      kind: 'empirical',
      documentNodeIds: ['p-1'],
      status: 'draft',
      persistence: 'local-project',
      createdAt: '2026-08-09T18:00:00.000Z',
      updatedAt: '2026-08-09T18:00:00.000Z',
    };
    const evidence: EvidenceEdge = {
      id: 'edge-1',
      type: 'evidence',
      claimId: claim.id,
      target: { type: 'source', id: 'source-1' },
      relation: 'supports',
      persistence: 'local-project',
    };

    expect(evidence.claimId).toBe(claim.id);
    expect(evidence.target).toEqual({ type: 'source', id: 'source-1' });
  });
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
npx vitest run tests/academic-ir-schema.test.ts
```

Expected: FAIL because `../src/academic-ir` does not exist.

- [ ] **Step 3: Implement the schema files**

`src/academic-ir/schema/version.ts`:

```ts
export const ACADEMIC_IR_SCHEMA_VERSION = '0.1' as const;
export type AcademicIRSchemaVersion = typeof ACADEMIC_IR_SCHEMA_VERSION;
```

`src/academic-ir/schema/common.ts`:

```ts
export type PersistenceClass =
  | 'ephemeral-local'
  | 'local-project'
  | 'sanitized-cloud'
  | 'public';

export interface EntityBase {
  id: string;
  persistence: PersistenceClass;
}
```

`src/academic-ir/schema/document.ts` must define exactly:

```ts
import type { EntityBase } from './common';

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

export interface DocumentSourceAnchor {
  documentFingerprint: string;
  paragraphIndex?: number;
  elementId?: string;
  footnoteId?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface AcademicDocumentNode extends EntityBase {
  type: AcademicDocumentNodeType;
  parentId?: string;
  childIds?: string[];
  source?: DocumentSourceAnchor;
  contentFingerprint?: string;
  attributes?: Record<string, unknown>;
}

export interface DocumentGraph {
  rootId: string;
  nodes: AcademicDocumentNode[];
  documentFingerprint?: string;
}
```

`src/academic-ir/schema/research.ts` must define the approved node vocabulary with explicit minimal fields rather than an untyped `Record<string, unknown>` catch-all:

```ts
import type { EntityBase } from './common';

interface ResearchNodeBase extends EntityBase {
  type:
    | 'research-question'
    | 'hypothesis'
    | 'claim'
    | 'source'
    | 'dataset'
    | 'analysis'
    | 'method'
    | 'finding'
    | 'limitation';
}

export interface ResearchQuestionNode extends ResearchNodeBase {
  type: 'research-question';
  question: string;
  documentNodeIds: string[];
}

export interface HypothesisNode extends ResearchNodeBase {
  type: 'hypothesis';
  statement: string;
  documentNodeIds: string[];
}

export interface ClaimNode extends ResearchNodeBase {
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
  status: 'draft' | 'supported' | 'contested' | 'unsupported' | 'superseded';
  createdAt: string;
  updatedAt: string;
}

export interface SourceNode extends ResearchNodeBase {
  type: 'source';
  identifiers: { doi?: string; isbn?: string; pmid?: string; url?: string };
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
}

export interface DatasetNode extends ResearchNodeBase {
  type: 'dataset';
  label: string;
  identifiers?: { doi?: string; url?: string; repositoryId?: string };
  digest?: string;
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

export interface AnalysisNode extends ResearchNodeBase {
  type: 'analysis';
  engine: 'jamovi' | 'r' | 'python' | 'spss' | 'stata' | 'excel' | 'manual' | 'other';
  analysisType: string;
  datasetIds: string[];
  specification: Record<string, unknown>;
  environment?: ExecutionEnvironment;
  outputs: AnalysisOutput[];
  inputDigest?: string;
  resultDigest?: string;
  status: 'declared' | 'executed' | 'verified' | 'failed';
  executedAt?: string;
}

export interface MethodNode extends ResearchNodeBase {
  type: 'method';
  label: string;
  description?: string;
  documentNodeIds: string[];
}

export interface FindingNode extends ResearchNodeBase {
  type: 'finding';
  statement: string;
  documentNodeIds: string[];
}

export interface LimitationNode extends ResearchNodeBase {
  type: 'limitation';
  statement: string;
  documentNodeIds: string[];
}

export type ResearchNode =
  | ResearchQuestionNode
  | HypothesisNode
  | ClaimNode
  | SourceNode
  | DatasetNode
  | AnalysisNode
  | MethodNode
  | FindingNode
  | LimitationNode;

export interface EvidenceEdge extends EntityBase {
  type: 'evidence';
  claimId: string;
  target:
    | { type: 'source'; id: string }
    | { type: 'analysis'; id: string }
    | { type: 'dataset'; id: string }
    | { type: 'document-node'; id: string };
  relation: 'supports' | 'contradicts' | 'qualifies' | 'contextualizes' | 'method-basis';
  strength?: 'weak' | 'moderate' | 'strong';
  locator?: { page?: string; section?: string };
  rationale?: string;
}

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

export type ResearchEndpointRef =
  | { scope: 'research-node'; id: string }
  | { scope: 'document-node'; id: string };

export interface ResearchGraphEdge extends EntityBase {
  type: 'relation';
  from: ResearchEndpointRef;
  to: ResearchEndpointRef;
  relation: ResearchRelation;
}

export type ResearchEdge = EvidenceEdge | ResearchGraphEdge;

export interface ResearchGraph {
  nodes: ResearchNode[];
  edges: ResearchEdge[];
}
```

`process.ts`, `provenance.ts`, `snapshot.ts`, and `root.ts` must use the exact unions approved in the design spec. Keep metadata JSON-compatible as `Record<string, unknown>` and do not add functions/classes to persisted types.

- [ ] **Step 4: Implement the minimal root factory and barrel export**

`src/academic-ir/create-academic-ir.ts`:

```ts
import { ACADEMIC_IR_SCHEMA_VERSION } from './schema/version';
import type { AcademicIR } from './schema/root';

export interface CreateAcademicIRInput {
  projectId: string;
  generatedAt?: string;
  documentRootId: string;
}

export function createAcademicIR(input: CreateAcademicIRInput): AcademicIR {
  return {
    schemaVersion: ACADEMIC_IR_SCHEMA_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    document: {
      rootId: input.documentRootId,
      nodes: [
        {
          id: input.documentRootId,
          type: 'document',
          childIds: [],
          persistence: 'local-project',
        },
      ],
    },
    research: { nodes: [], edges: [] },
    process: { events: [] },
    provenance: { events: [] },
    snapshots: [],
  };
}
```

`src/academic-ir/index.ts` exports the version constant, all schema types, and the root factory.

- [ ] **Step 5: Run targeted tests, typecheck, full gate, then commit**

Run:

```bash
npx vitest run tests/academic-ir-schema.test.ts
npx tsc --noEmit
npm run check
```

Expected: all PASS.

Commit:

```bash
git add src/academic-ir tests/academic-ir-schema.test.ts
git commit -m "feat: define Academic IR v0.1 schema"
```

---

### Task 2: Add structured root/document validation

**Files:**
- Create: `src/academic-ir/validation/types.ts`
- Create: `src/academic-ir/validation/schema-validation.ts`
- Create: `src/academic-ir/validation/graph-validation.ts`
- Create: `src/academic-ir/validation/validate-academic-ir.ts`
- Modify: `src/academic-ir/index.ts`
- Test: `tests/academic-ir-validation.test.ts`

**Interfaces:**
- Produces: `validateAcademicIR(ir: AcademicIR): AcademicIRValidationResult`.
- Produces: stable validation codes consumed by later tests/UI; codes are API and must not be changed casually.
- Consumes: schema from Task 1.

- [ ] **Step 1: Write failing tests for minimal validity and broken document references**

Create `tests/academic-ir-validation.test.ts` with these first cases:

```ts
import { describe, expect, it } from 'vitest';
import { createAcademicIR, validateAcademicIR } from '../src/academic-ir';

describe('Academic IR validation', () => {
  it('accepts the minimal v0.1 root', () => {
    const ir = createAcademicIR({
      projectId: 'project-1',
      generatedAt: '2026-08-09T18:00:00.000Z',
      documentRootId: 'root-1',
    });
    expect(validateAcademicIR(ir)).toEqual({ valid: true, findings: [] });
  });

  it('rejects a missing document child with a structured code and path', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes[0].childIds = ['missing-child'];

    const result = validateAcademicIR(ir);
    expect(result.valid).toBe(false);
    expect(result.findings).toContainEqual({
      code: 'IR_DOCUMENT_CHILD_MISSING',
      severity: 'error',
      path: 'document.nodes[root-1].childIds[0]',
      message: 'Document child "missing-child" does not resolve to a document node.',
    });
  });

  it('rejects a document parent-child cycle', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes.push({
      id: 'p-1',
      type: 'paragraph',
      parentId: 'root-1',
      childIds: ['root-1'],
      persistence: 'local-project',
    });
    ir.document.nodes[0].parentId = 'p-1';
    ir.document.nodes[0].childIds = ['p-1'];

    const result = validateAcademicIR(ir);
    expect(result.findings.some((f) => f.code === 'IR_DOCUMENT_CYCLE')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

```bash
npx vitest run tests/academic-ir-validation.test.ts
```

Expected: FAIL because validation modules do not exist.

- [ ] **Step 3: Define stable validation result types**

`src/academic-ir/validation/types.ts`:

```ts
export type AcademicIRValidationSeverity = 'error' | 'warning';

export type AcademicIRValidationCode =
  | 'IR_SCHEMA_VERSION_UNSUPPORTED'
  | 'IR_PROJECT_ID_REQUIRED'
  | 'IR_GENERATED_AT_INVALID'
  | 'IR_ENTITY_ID_REQUIRED'
  | 'IR_DUPLICATE_ID'
  | 'IR_DOCUMENT_ROOT_MISSING'
  | 'IR_DOCUMENT_PARENT_MISSING'
  | 'IR_DOCUMENT_CHILD_MISSING'
  | 'IR_DOCUMENT_CYCLE'
  | 'IR_RESEARCH_ENDPOINT_MISSING'
  | 'IR_EVIDENCE_CLAIM_MISSING'
  | 'IR_EVIDENCE_TARGET_MISSING'
  | 'IR_ANALYSIS_DATASET_MISSING'
  | 'IR_DOCUMENT_LINK_MISSING'
  | 'IR_SNAPSHOT_PROJECT_MISMATCH'
  | 'IR_SUBMISSION_MUTABLE';

export interface AcademicIRValidationFinding {
  code: AcademicIRValidationCode;
  severity: AcademicIRValidationSeverity;
  path: string;
  message: string;
}

export interface AcademicIRValidationResult {
  valid: boolean;
  findings: AcademicIRValidationFinding[];
}
```

- [ ] **Step 4: Implement root/document validation**

`schema-validation.ts` validates:

```ts
schemaVersion === ACADEMIC_IR_SCHEMA_VERSION
projectId.trim().length > 0
!Number.isNaN(Date.parse(generatedAt))
all node/edge/event/snapshot IDs are non-empty strings when inspected by graph validators
```

`graph-validation.ts` must build a `Map<string, AcademicDocumentNode>` once, reject duplicate IDs, verify root existence, parent/child references, and detect cycles with DFS state (`unvisited/visiting/visited`).

Use a helper that records findings instead of throwing:

```ts
function finding(
  code: AcademicIRValidationCode,
  path: string,
  message: string,
): AcademicIRValidationFinding {
  return { code, severity: 'error', path, message };
}
```

`validate-academic-ir.ts` combines validators in deterministic order:

```ts
export function validateAcademicIR(ir: AcademicIR): AcademicIRValidationResult {
  const findings = [
    ...validateAcademicIRSchema(ir),
    ...validateDocumentGraph(ir.document),
  ];
  return { valid: findings.every((item) => item.severity !== 'error'), findings };
}
```

Do not short-circuit after the first expected content error; return all deterministic findings that can be safely computed.

- [ ] **Step 5: Export validator, run tests/full gate, commit**

```bash
npx vitest run tests/academic-ir-validation.test.ts
npm run check
```

Expected: PASS.

Commit:

```bash
git add src/academic-ir/validation src/academic-ir/index.ts tests/academic-ir-validation.test.ts
git commit -m "feat: validate Academic IR document graph"
```

---

### Task 3: Validate research graph, document links, analysis datasets, and snapshots

**Files:**
- Modify: `src/academic-ir/validation/graph-validation.ts`
- Modify: `src/academic-ir/validation/validate-academic-ir.ts`
- Modify: `tests/academic-ir-validation.test.ts`

**Interfaces:**
- Extends `validateAcademicIR` from Task 2 without changing its signature.
- Validates all `ResearchNode`, `EvidenceEdge`, `ResearchGraphEdge`, claim-to-document links, analysis dataset links, and snapshot invariants.

- [ ] **Step 1: Add failing acceptance tests C, D, K, and L**

Append to `tests/academic-ir-validation.test.ts`:

```ts
it('rejects evidence that references a missing claim', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.research.edges.push({
    id: 'e-1',
    type: 'evidence',
    claimId: 'missing-claim',
    target: { type: 'document-node', id: 'root-1' },
    relation: 'supports',
    persistence: 'local-project',
  });

  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_EVIDENCE_CLAIM_MISSING')).toBe(true);
});

it('rejects a mutable submission snapshot', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.snapshots.push({
    id: 'snap-1',
    projectId: 'project-1',
    kind: 'submission',
    academicIrDigest: 'abc',
    createdAt: '2026-08-09T18:00:00.000Z',
    immutable: false,
  });

  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_SUBMISSION_MUTABLE')).toBe(true);
});

it('rejects a generic relation with a missing endpoint', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.research.edges.push({
    id: 'rel-1',
    type: 'relation',
    from: { scope: 'document-node', id: 'root-1' },
    to: { scope: 'research-node', id: 'missing-node' },
    relation: 'discussed-in',
    persistence: 'local-project',
  });

  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_RESEARCH_ENDPOINT_MISSING')).toBe(true);
});

it('rejects an analysis whose datasetIds do not resolve to DatasetNode values', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.research.nodes.push({
    id: 'analysis-1',
    type: 'analysis',
    engine: 'jamovi',
    analysisType: 'pearson-correlation',
    datasetIds: ['missing-dataset'],
    specification: {},
    outputs: [],
    status: 'declared',
    persistence: 'local-project',
  });

  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_ANALYSIS_DATASET_MISSING')).toBe(true);
});
```

Also add tests for:
- claim `documentNodeIds` referencing a missing document node -> `IR_DOCUMENT_LINK_MISSING`;
- snapshot `projectId !== ir.projectId` -> `IR_SNAPSHOT_PROJECT_MISMATCH`;
- evidence source/analysis/dataset target type must resolve to a node of the matching declared type.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npx vitest run tests/academic-ir-validation.test.ts
```

Expected: new cases FAIL.

- [ ] **Step 3: Implement research indexes and endpoint resolution**

In `graph-validation.ts`, add one research-node index and helpers:

```ts
function researchNodeById(graph: ResearchGraph): Map<string, ResearchNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function endpointExists(
  ref: ResearchEndpointRef,
  documentIds: Set<string>,
  researchIds: Set<string>,
): boolean {
  return ref.scope === 'document-node'
    ? documentIds.has(ref.id)
    : researchIds.has(ref.id);
}
```

For `EvidenceEdge`:
- `claimId` must resolve to `type === 'claim'`.
- `document-node` target must resolve in the document graph.
- `source`, `analysis`, and `dataset` targets must resolve to the matching research node type, not merely any research node ID.

For `AnalysisNode.datasetIds`:
- every ID must resolve to `DatasetNode`.

For all node shapes that expose `documentNodeIds`:
- every ID must resolve to a document node.

For `ResearchGraphEdge`:
- each endpoint must resolve in the declared scope.

- [ ] **Step 4: Implement snapshot semantic validation**

Add a validator called from `validateAcademicIR(ir)` that enforces:

```ts
snapshot.projectId === ir.projectId
snapshot.kind !== 'submission' || snapshot.immutable === true
!Number.isNaN(Date.parse(snapshot.createdAt))
```

Do not mutate invalid snapshots to make them valid; validation only reports.

- [ ] **Step 5: Run targeted/full gate and commit**

```bash
npx vitest run tests/academic-ir-validation.test.ts
npm run check
```

Commit:

```bash
git add src/academic-ir/validation tests/academic-ir-validation.test.ts
git commit -m "feat: validate Academic IR research graph"
```

---

### Task 4: Implement deterministic canonical serialization and SHA-256 digests

**Files:**
- Create: `src/academic-ir/serialization/canonicalize.ts`
- Create: `src/academic-ir/serialization/serialize.ts`
- Create: `src/academic-ir/serialization/digest.ts`
- Modify: `src/academic-ir/index.ts`
- Test: `tests/academic-ir-serialization.test.ts`

**Interfaces:**
- Produces: `canonicalizeAcademicIR(ir): AcademicIR`.
- Produces: `serializeAcademicIR(ir): string`.
- Produces: `deserializeAcademicIR(json): AcademicIRDeserializeResult`.
- Produces: `digestAcademicIR(ir): Promise<string>` and internal `sha256Hex(text)`.
- Consumes: `validateAcademicIR` from Tasks 2-3.

- [ ] **Step 1: Write failing round-trip and deterministic-digest tests**

Create `tests/academic-ir-serialization.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createAcademicIR,
  deserializeAcademicIR,
  digestAcademicIR,
  serializeAcademicIR,
} from '../src/academic-ir';

describe('Academic IR canonical serialization', () => {
  it('round-trips canonical semantics and stable IDs', () => {
    const ir = createAcademicIR({
      projectId: 'project-1',
      generatedAt: '2026-08-09T18:00:00.000Z',
      documentRootId: 'root-1',
    });
    ir.document.nodes.push({
      id: 'p-1',
      type: 'paragraph',
      parentId: 'root-1',
      persistence: 'local-project',
    });
    ir.document.nodes[0].childIds = ['p-1'];

    const result = deserializeAcademicIR(serializeAcademicIR(ir));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(ir);
  });

  it('produces the same digest when registry-array insertion order differs', async () => {
    const a = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    const b = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });

    const n1 = { id: 'p-1', type: 'paragraph' as const, parentId: 'root-1', persistence: 'local-project' as const };
    const n2 = { id: 'p-2', type: 'paragraph' as const, parentId: 'root-1', persistence: 'local-project' as const };
    a.document.nodes.push(n1, n2);
    b.document.nodes.push(n2, n1);
    a.document.nodes[0].childIds = ['p-1', 'p-2'];
    b.document.nodes[0].childIds = ['p-1', 'p-2'];

    expect(await digestAcademicIR(a)).toBe(await digestAcademicIR(b));
  });

  it('preserves semantic child order in the canonical form', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes[0].childIds = ['p-2', 'p-1'];
    const serialized = serializeAcademicIR(ir);
    expect(serialized.indexOf('p-2')).toBeLessThan(serialized.indexOf('p-1'));
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run tests/academic-ir-serialization.test.ts
```

- [ ] **Step 3: Implement canonicalization without destroying semantic array order**

`canonicalize.ts` must:

1. deep-clone JSON-compatible values;
2. recursively sort object keys lexicographically;
3. sort only registry/set-like arrays whose order is not semantic:
   - `document.nodes` by `id`;
   - `research.nodes` by `id`;
   - `research.edges` by `id`;
   - `process.events` by `id`;
   - `provenance.events` by `id`;
   - `snapshots` by `id`;
4. preserve `AcademicDocumentNode.childIds` order because it represents document order;
5. preserve general `AnalysisOutput[]` order because output order may be meaningful.

Use an explicit root-aware function rather than a generic “sort every array” utility:

```ts
export function canonicalizeAcademicIR(ir: AcademicIR): AcademicIR {
  const clone = structuredClone(ir);
  clone.document.nodes.sort((a, b) => a.id.localeCompare(b.id));
  clone.research.nodes.sort((a, b) => a.id.localeCompare(b.id));
  clone.research.edges.sort((a, b) => a.id.localeCompare(b.id));
  clone.process.events.sort((a, b) => a.id.localeCompare(b.id));
  clone.provenance.events.sort((a, b) => a.id.localeCompare(b.id));
  clone.snapshots.sort((a, b) => a.id.localeCompare(b.id));
  return sortObjectKeysDeep(clone) as AcademicIR;
}
```

`sortObjectKeysDeep` must leave arrays in their current order after the explicit registry sorting above.

- [ ] **Step 4: Implement serialization, structured deserialization failure, and digest**

`serialize.ts`:

```ts
export type AcademicIRDeserializeResult =
  | { ok: true; value: AcademicIR }
  | { ok: false; reason: 'invalid-json' | 'invalid-ir'; findings: AcademicIRValidationFinding[] };

export function serializeAcademicIR(ir: AcademicIR): string {
  return JSON.stringify(canonicalizeAcademicIR(ir));
}
```

For invalid JSON, return `reason: 'invalid-json'` and a stable structured finding using an existing validation code rather than leaking raw parser exception text into product logic. If the current validation-code union needs one explicit addition, add `IR_JSON_INVALID` in the same task and cover it with a test.

`digest.ts`:

```ts
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function digestAcademicIR(ir: AcademicIR): Promise<string> {
  return sha256Hex(serializeAcademicIR(ir));
}
```

Do not import Node `crypto`; source must remain browser-compatible.

- [ ] **Step 5: Run targeted/full gate and commit**

```bash
npx vitest run tests/academic-ir-serialization.test.ts
npm run check
```

Commit:

```bash
git add src/academic-ir/serialization src/academic-ir/index.ts tests/academic-ir-serialization.test.ts
git commit -m "feat: serialize and digest Academic IR deterministically"
```

---

### Task 5: Implement baseline safe document reconciliation

**Files:**
- Create: `src/academic-ir/reconciliation/types.ts`
- Create: `src/academic-ir/reconciliation/fingerprint.ts`
- Create: `src/academic-ir/reconciliation/reconcile-document-nodes.ts`
- Modify: `src/academic-ir/index.ts`
- Test: `tests/academic-ir-reconciliation.test.ts`

**Interfaces:**
- Produces: `fingerprintDocumentText(text): Promise<string>`.
- Produces: `reconcileDocumentNodes(previous, next, options): Promise<ReconciliationResult>`.
- Baseline matcher supports exact unique content/type matches, explicit ambiguity, additions, removals, and source-anchor updates. It does not perform arbitrary fuzzy rewrite/split/merge matching.

Define these exact input/output types in `reconciliation/types.ts`:

```ts
export interface DocumentProjectionCandidate {
  type: 'heading' | 'paragraph';
  paragraphIndex: number;
  text: string;
  headingLevel?: number;
  elementId?: string;
}

export type ReconciliationStatus = 'exact' | 'high-confidence' | 'ambiguous' | 'new' | 'removed';

export interface ReconciliationRecord {
  previousNodeId?: string;
  nextNodeId?: string;
  status: ReconciliationStatus;
  paragraphIndex?: number;
}

export interface ReconciliationResult {
  graph: DocumentGraph;
  records: ReconciliationRecord[];
  removedNodeIds: string[];
}

export interface ReconciliationOptions {
  documentFingerprint: string;
  rootId?: string;
  idFactory?: () => string;
}
```

- [ ] **Step 1: Write the stable-shift and ambiguity tests**

Create `tests/academic-ir-reconciliation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  fingerprintDocumentText,
  reconcileDocumentNodes,
  type DocumentGraph,
} from '../src/academic-ir';

const idSequence = (...ids: string[]) => {
  let i = 0;
  return () => ids[i++] ?? `generated-${i}`;
};

describe('Academic IR baseline reconciliation', () => {
  it('preserves a durable paragraph ID when unrelated paragraphs are inserted above it', async () => {
    const targetFingerprint = await fingerprintDocumentText('Rezultati pokazuju rast povjerenja.');
    const previous: DocumentGraph = {
      rootId: 'root-1',
      documentFingerprint: 'doc-v1',
      nodes: [
        { id: 'root-1', type: 'document', childIds: ['p-stable'], persistence: 'local-project' },
        {
          id: 'p-stable',
          type: 'paragraph',
          parentId: 'root-1',
          source: { documentFingerprint: 'doc-v1', paragraphIndex: 47 },
          contentFingerprint: targetFingerprint,
          persistence: 'local-project',
        },
      ],
    };

    const result = await reconcileDocumentNodes(
      previous,
      [
        { type: 'paragraph', paragraphIndex: 47, text: 'Novi prvi odlomak.' },
        { type: 'paragraph', paragraphIndex: 48, text: 'Novi drugi odlomak.' },
        { type: 'paragraph', paragraphIndex: 49, text: 'Rezultati pokazuju rast povjerenja.' },
      ],
      { documentFingerprint: 'doc-v2', idFactory: idSequence('new-1', 'new-2') },
    );

    const stable = result.graph.nodes.find((node) => node.id === 'p-stable');
    expect(stable?.source?.paragraphIndex).toBe(49);
    expect(stable?.source?.documentFingerprint).toBe('doc-v2');
    expect(result.records).toContainEqual({
      previousNodeId: 'p-stable',
      nextNodeId: 'p-stable',
      status: 'exact',
      paragraphIndex: 49,
    });
  });

  it('does not attach old identity when duplicate candidates are ambiguous', async () => {
    const fp = await fingerprintDocumentText('Isti tekst.');
    const previous: DocumentGraph = {
      rootId: 'root-1',
      nodes: [
        { id: 'root-1', type: 'document', childIds: ['old-1'], persistence: 'local-project' },
        { id: 'old-1', type: 'paragraph', parentId: 'root-1', contentFingerprint: fp, persistence: 'local-project' },
      ],
    };

    const result = await reconcileDocumentNodes(
      previous,
      [
        { type: 'paragraph', paragraphIndex: 10, text: 'Isti tekst.' },
        { type: 'paragraph', paragraphIndex: 11, text: 'Isti tekst.' },
      ],
      { documentFingerprint: 'doc-v2', idFactory: idSequence('new-a', 'new-b') },
    );

    expect(result.records.some((record) => record.previousNodeId === 'old-1' && record.status === 'ambiguous')).toBe(true);
    expect(result.graph.nodes.some((node) => node.id === 'old-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

```bash
npx vitest run tests/academic-ir-reconciliation.test.ts
```

- [ ] **Step 3: Implement normalization/fingerprinting**

`fingerprint.ts`:

```ts
import { sha256Hex } from '../serialization/digest';

export function normalizeDocumentText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fingerprintDocumentText(text: string): Promise<string> {
  return sha256Hex(normalizeDocumentText(text));
}
```

Do not lowercase text in v0.1. Case changes are meaningful document edits and should not silently produce an exact match.

- [ ] **Step 4: Implement the exact/ambiguous matcher**

Algorithm in `reconcile-document-nodes.ts`:

1. compute fingerprints for all next candidates with `Promise.all`;
2. key candidates by `${candidate.type}:${contentFingerprint}`;
3. for each previous `heading`/`paragraph` node with a fingerprint:
   - zero next candidates -> record `removed`;
   - exactly one next candidate and it has not been claimed -> reuse previous ID and record `exact`;
   - more than one candidate -> record `ambiguous`, reuse none;
4. create new IDs for all unclaimed next candidates and record `new`;
5. preserve the previous root ID by default; if no previous graph is supplied by a future wrapper, the caller must supply/create a root before calling this function;
6. emit root `childIds` in the new document order;
7. every emitted child gets a version-specific `source.documentFingerprint` and `source.paragraphIndex`;
8. never carry old source anchors forward when the node was not matched.

Do not implement Levenshtein/fuzzy matching, split/merge inference, or positional guessing in Core v0.1.

- [ ] **Step 5: Add the claim-link survival assertion**

Extend the first test by creating a `ClaimNode` that references `p-stable`, applying the reconciled `DocumentGraph` back to a minimal IR, and asserting:

```ts
expect(claim.documentNodeIds).toEqual(['p-stable']);
expect(result.graph.nodes.some((node) => node.id === 'p-stable')).toBe(true);
```

This is the primary architectural acceptance test.

- [ ] **Step 6: Run targeted/full gate and commit**

```bash
npx vitest run tests/academic-ir-reconciliation.test.ts
npm run check
```

Commit:

```bash
git add src/academic-ir/reconciliation src/academic-ir/index.ts tests/academic-ir-reconciliation.test.ts
git commit -m "feat: reconcile Academic IR document nodes safely"
```

---

### Task 6: Add the initial Lekta document projection adapter without touching the analyzer

**Files:**
- Create: `src/academic-ir/adapters/lekta-document-adapter.ts`
- Modify: `src/academic-ir/index.ts`
- Test: `tests/academic-ir-lekta-adapter.test.ts`

**Interfaces:**
- Produces: `projectLektaDocument(input, previousGraph?): Promise<LektaDocumentProjectionResult>`.
- Consumes: a narrow explicit projection DTO, not the entire `analyzeDocx` result.
- Consumes: reconciliation engine from Task 5.
- Must not import UI modules or network/report modules.

Define:

```ts
export interface LektaParagraphProjection {
  paragraphIndex: number;
  text: string;
  headingLevel?: number | null;
  elementId?: string;
}

export interface LektaDocumentProjectionInput {
  projectId: string;
  documentFingerprint: string;
  paragraphs: LektaParagraphProjection[];
}

export interface LektaDocumentProjectionResult {
  graph: DocumentGraph;
  reconciliation: ReconciliationRecord[];
}
```

- [ ] **Step 1: Write failing initial-projection and re-projection tests**

Create `tests/academic-ir-lekta-adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { projectLektaDocument } from '../src/academic-ir';

const ids = (...values: string[]) => {
  let i = 0;
  return () => values[i++] ?? `id-${i}`;
};

describe('Lekta -> Academic IR document projection', () => {
  it('projects headings and paragraphs without persisting raw paragraph text', async () => {
    const result = await projectLektaDocument({
      projectId: 'project-1',
      documentFingerprint: 'doc-v1',
      paragraphs: [
        { paragraphIndex: 1, text: 'UVOD', headingLevel: 1 },
        { paragraphIndex: 2, text: 'Ovo je sadržaj odlomka.' },
      ],
    }, undefined, { idFactory: ids('root-1', 'heading-1', 'p-1') });

    expect(result.graph.rootId).toBe('root-1');
    expect(result.graph.nodes.find((node) => node.id === 'heading-1')?.type).toBe('heading');
    expect(result.graph.nodes.find((node) => node.id === 'p-1')?.type).toBe('paragraph');
    expect(JSON.stringify(result.graph)).not.toContain('Ovo je sadržaj odlomka.');
  });

  it('reuses durable IDs after paragraph indexes shift', async () => {
    const first = await projectLektaDocument({
      projectId: 'project-1',
      documentFingerprint: 'doc-v1',
      paragraphs: [{ paragraphIndex: 47, text: 'Rezultati pokazuju rast povjerenja.' }],
    }, undefined, { idFactory: ids('root-1', 'stable-1') });

    const second = await projectLektaDocument({
      projectId: 'project-1',
      documentFingerprint: 'doc-v2',
      paragraphs: [
        { paragraphIndex: 47, text: 'Novi odlomak.' },
        { paragraphIndex: 48, text: 'Drugi novi odlomak.' },
        { paragraphIndex: 49, text: 'Rezultati pokazuju rast povjerenja.' },
      ],
    }, first.graph, { idFactory: ids('new-1', 'new-2') });

    expect(second.graph.nodes.find((node) => node.id === 'stable-1')?.source?.paragraphIndex).toBe(49);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

```bash
npx vitest run tests/academic-ir-lekta-adapter.test.ts
```

- [ ] **Step 3: Implement a narrow local-only adapter**

Function signature:

```ts
export interface LektaDocumentAdapterOptions {
  idFactory?: () => string;
}

export async function projectLektaDocument(
  input: LektaDocumentProjectionInput,
  previousGraph?: DocumentGraph,
  options: LektaDocumentAdapterOptions = {},
): Promise<LektaDocumentProjectionResult>
```

Behavior:

- classify `headingLevel != null && headingLevel > 0` as `heading`; otherwise `paragraph`;
- `attributes.headingLevel` may be stored for heading nodes;
- raw `text` is used only to compute fingerprints and is not copied into `AcademicDocumentNode.attributes` in v0.1;
- anchors include `documentFingerprint`, `paragraphIndex`, and optional `elementId`;
- all emitted nodes use `persistence: 'local-project'`;
- on first projection, create root ID with supplied `idFactory ?? crypto.randomUUID` and then create child IDs in document order;
- on subsequent projection, call `reconcileDocumentNodes(previousGraph, candidates, ...)` and preserve previous root ID;
- `projectId` is accepted so later adapter metadata can be project-scoped, but it is not encoded into node IDs.

Do not import or mutate `analyzeDocx`. This adapter is deliberately narrow so a later bridge can supply data from existing parsed/document structure without making the Academic IR package depend on the analyzer monolith.

- [ ] **Step 4: Add unsupported/empty input behavior test**

Add:

```ts
it('produces a valid empty document root for an empty paragraph list', async () => {
  const result = await projectLektaDocument(
    { projectId: 'project-1', documentFingerprint: 'empty-doc', paragraphs: [] },
    undefined,
    { idFactory: ids('root-empty') },
  );
  expect(result.graph).toEqual({
    rootId: 'root-empty',
    documentFingerprint: 'empty-doc',
    nodes: [
      {
        id: 'root-empty',
        type: 'document',
        childIds: [],
        persistence: 'local-project',
      },
    ],
  });
});
```

- [ ] **Step 5: Run targeted/full gate and commit**

```bash
npx vitest run tests/academic-ir-lekta-adapter.test.ts tests/academic-ir-reconciliation.test.ts
npm run check
```

Commit:

```bash
git add src/academic-ir/adapters src/academic-ir/index.ts tests/academic-ir-lekta-adapter.test.ts
git commit -m "feat: project Lekta document structure into Academic IR"
```

---

### Task 7: Add snapshot creation and explicit schema-version migration boundary

**Files:**
- Create: `src/academic-ir/snapshots.ts`
- Create: `src/academic-ir/migrations/index.ts`
- Modify: `src/academic-ir/index.ts`
- Test: `tests/academic-ir-snapshots.test.ts`

**Interfaces:**
- Produces: `createAcademicIRSnapshot(ir, input): Promise<SnapshotRef>`.
- Produces: `readAcademicIRVersion(value): string | undefined` and `isCurrentAcademicIRVersion(value): boolean`.
- No 0.1 -> 0.2 migration exists yet; the migration module establishes the dispatch boundary without inventing a nonexistent historical migration.

- [ ] **Step 1: Write failing snapshot/version tests**

Create `tests/academic-ir-snapshots.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_IR_SCHEMA_VERSION,
  createAcademicIR,
  createAcademicIRSnapshot,
  isCurrentAcademicIRVersion,
  readAcademicIRVersion,
} from '../src/academic-ir';

describe('Academic IR snapshots and version boundary', () => {
  it('forces submission snapshots to be immutable', async () => {
    const ir = createAcademicIR({
      projectId: 'project-1',
      generatedAt: '2026-08-09T18:00:00.000Z',
      documentRootId: 'root-1',
    });
    const snapshot = await createAcademicIRSnapshot(ir, {
      id: 'snapshot-1',
      kind: 'submission',
      createdAt: '2026-08-09T18:05:00.000Z',
      documentFingerprint: 'doc-v1',
      rulesetId: 'rules-v1',
      lektaAnalysisId: 'analysis-1',
    });

    expect(snapshot.immutable).toBe(true);
    expect(snapshot.projectId).toBe('project-1');
    expect(snapshot.academicIrDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the Academic IR version boundary explicit', () => {
    expect(readAcademicIRVersion({ schemaVersion: '0.1' })).toBe('0.1');
    expect(isCurrentAcademicIRVersion({ schemaVersion: ACADEMIC_IR_SCHEMA_VERSION })).toBe(true);
    expect(isCurrentAcademicIRVersion({ schemaVersion: '0.2' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npx vitest run tests/academic-ir-snapshots.test.ts
```

- [ ] **Step 3: Implement snapshot helper**

`src/academic-ir/snapshots.ts`:

```ts
export interface CreateAcademicIRSnapshotInput {
  id: string;
  kind: SnapshotRef['kind'];
  createdAt?: string;
  documentFingerprint?: string;
  rulesetId?: string;
  lektaAnalysisId?: string;
  immutable?: boolean;
}

export async function createAcademicIRSnapshot(
  ir: AcademicIR,
  input: CreateAcademicIRSnapshotInput,
): Promise<SnapshotRef> {
  return {
    id: input.id,
    projectId: ir.projectId,
    kind: input.kind,
    academicIrDigest: await digestAcademicIR(ir),
    documentFingerprint: input.documentFingerprint,
    rulesetId: input.rulesetId,
    lektaAnalysisId: input.lektaAnalysisId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    immutable: input.kind === 'submission' ? true : (input.immutable ?? false),
  };
}
```

This helper never mutates `ir.snapshots`; callers explicitly add the returned immutable record, keeping pure creation separate from state mutation.

- [ ] **Step 4: Implement explicit version dispatch helpers**

`src/academic-ir/migrations/index.ts`:

```ts
import { ACADEMIC_IR_SCHEMA_VERSION } from '../schema/version';

export function readAcademicIRVersion(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'string' ? version : undefined;
}

export function isCurrentAcademicIRVersion(value: unknown): boolean {
  return readAcademicIRVersion(value) === ACADEMIC_IR_SCHEMA_VERSION;
}
```

Do not create a fake `migrateAcademicIR_0_1_to_0_2` until 0.2 exists.

- [ ] **Step 5: Run targeted/full gate and commit**

```bash
npx vitest run tests/academic-ir-snapshots.test.ts
npm run check
```

Commit:

```bash
git add src/academic-ir/snapshots.ts src/academic-ir/migrations src/academic-ir/index.ts tests/academic-ir-snapshots.test.ts
git commit -m "feat: add Academic IR snapshots and version boundary"
```

---

### Task 8: Lock privacy and existing Academic Suite contract independence with regression tests

**Files:**
- Create: `tests/academic-ir-boundaries.test.ts`
- No production file modification should be required unless a missing Academic IR export is discovered.

**Interfaces:**
- Verifies Academic IR does not change `ACADEMIC_SUITE_CONTRACT_VERSION`.
- Verifies `toSharedLektaResult()` still excludes `Issue.detail` and `Issue.where`.
- Verifies Academic IR projection can process local paragraph text without adding it to shared transport.

- [ ] **Step 1: Write the boundary tests before any boundary change**

Create `tests/academic-ir-boundaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACADEMIC_IR_SCHEMA_VERSION, projectLektaDocument } from '../src/academic-ir';
import { ACADEMIC_SUITE_CONTRACT_VERSION } from '../src/integration/academic-suite-contracts';
import { toSharedLektaResult } from '../src/integration/lekta-result-adapter';
import { issue, makeCheck } from '../src/scoring/checks';

describe('Academic IR product/privacy boundaries', () => {
  it('keeps Academic IR and Academic Suite contract versions independent', () => {
    expect(ACADEMIC_IR_SCHEMA_VERSION).toBe('0.1');
    expect(ACADEMIC_SUITE_CONTRACT_VERSION).toBe('0.1');
  });

  it('does not cause local document text or Issue.detail/where to enter shared LektaResult', async () => {
    const sensitiveParagraph = 'OSJETLJIV SADRŽAJ TIJELA RADA';
    const sensitiveDetail = 'OSJETLJIV DETALJ IZ DOKUMENTA';
    const sensitiveWhere = 'OSJETLJIVA LOKACIJA';

    await projectLektaDocument(
      {
        projectId: 'project-1',
        documentFingerprint: 'doc-v1',
        paragraphs: [{ paragraphIndex: 12, text: sensitiveParagraph }],
      },
      undefined,
      { idFactory: (() => { const ids = ['root-1', 'p-1']; let i = 0; return () => ids[i++]; })() },
    );

    const finding = issue('warning', 'structure', 'Nalaz', sensitiveDetail, sensitiveWhere);
    const shared = toSharedLektaResult(
      {
        score: 80,
        checks: [makeCheck('structure', 'Provjera', 'warn', 1, 2, 'detail', finding)],
        issues: [finding],
      },
      {
        analysisId: 'analysis-1',
        rulesetId: 'rules-1',
        analyzedAt: '2026-08-09T18:00:00.000Z',
        projectId: 'project-1',
        documentFingerprint: 'doc-v1',
      },
    );

    const payload = JSON.stringify(shared);
    expect(payload).not.toContain(sensitiveParagraph);
    expect(payload).not.toContain(sensitiveDetail);
    expect(payload).not.toContain(sensitiveWhere);
  });
});
```

- [ ] **Step 2: Run the boundary test**

```bash
npx vitest run tests/academic-ir-boundaries.test.ts
```

Expected: PASS without modifying `src/integration/academic-suite-contracts.ts` or `src/integration/lekta-result-adapter.ts`.

If it fails because the existing shared adapter leaks a banned field, treat that as a pre-existing privacy regression and fix it in a separate narrowly reviewed task/commit before continuing. Do not weaken the boundary test.

- [ ] **Step 3: Run the existing shared-contract and handoff regressions together**

```bash
npx vitest run \
  tests/academic-suite-contracts.test.ts \
  tests/katedra-handoff.test.ts \
  tests/academic-ir-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run full gate and commit only the regression test**

```bash
npm run check
```

Commit:

```bash
git add tests/academic-ir-boundaries.test.ts
git commit -m "test: lock Academic IR privacy boundaries"
```

---

### Task 9: Final acceptance harness, documentation status, and release-readiness verification

**Files:**
- Create: `docs/architecture/ACADEMIC_IR_CORE_V0_1.md`
- Modify: `docs/architecture/FOUNDATION_STATUS_2026-08-03.md` only by appending a clearly dated new “Academic IR Core v0.1” status section; do not rewrite historical foundation statements.
- Test: all Academic IR tests plus existing repository gate.

**Interfaces:**
- Produces no new runtime API.
- Documents the implemented module, guarantees, non-goals, and next subproject.

- [ ] **Step 1: Add a compact implementation-status document**

Create `docs/architecture/ACADEMIC_IR_CORE_V0_1.md` containing these exact sections:

```markdown
# Academic IR Core v0.1

Status: implemented foundation

## Canonical code

`src/academic-ir/`

## Guarantees

- Academic IR schema version is independent from the Academic Suite transport version.
- Full Academic IR is local-first and has no shared-Supabase write path in v0.1.
- Durable document-node identity is independent from paragraph index.
- Baseline reconciliation reuses identity only for unique exact normalized-content/type matches.
- Ambiguous matches remain ambiguous and are not silently attached.
- Submission snapshots are immutable.
- Existing Lekta formal verification authority is unchanged.
- Existing `toSharedLektaResult()` privacy boundary is unchanged.

## Implemented v0.1 surface

- schema/types
- structured validation
- deterministic serialization
- SHA-256 Academic IR digests
- baseline exact/ambiguous reconciliation
- initial Lekta paragraph/heading projection adapter
- snapshot creation helper
- explicit schema-version dispatch boundary

## Explicitly not implemented

- production fuzzy DOCX reconciliation
- MyST/Stencila adapters
- Web Twin
- public Paper API
- Jamovi/R/Python execution
- C2PA/RO-Crate
- Academic IR cloud synchronization

## Next subproject

Production DOCX Projection & Reconciliation: richer OOXML identity, moves, splits/merges, figures/tables/captions, and confidence-scored but fail-safe reconciliation.
```

- [ ] **Step 2: Append implementation status to the existing foundation snapshot**

Append, do not rewrite earlier content:

```markdown
## Addendum — Academic IR Core v0.1

Academic IR is an additive Shared Core layer above the accepted Academic Suite v0.1 transport contract. It does not replace `ProjectManifest`, `LektaResult`, or current product ownership boundaries. Canonical implementation and guarantees are documented in `docs/architecture/ACADEMIC_IR_CORE_V0_1.md`.
```

- [ ] **Step 3: Run the complete Academic IR acceptance suite**

Run:

```bash
npx vitest run \
  tests/academic-ir-schema.test.ts \
  tests/academic-ir-validation.test.ts \
  tests/academic-ir-serialization.test.ts \
  tests/academic-ir-reconciliation.test.ts \
  tests/academic-ir-lekta-adapter.test.ts \
  tests/academic-ir-snapshots.test.ts \
  tests/academic-ir-boundaries.test.ts
```

Expected: PASS.

Acceptance mapping:

- A Root validity -> `academic-ir-validation.test.ts`
- B Broken reference rejection -> `academic-ir-validation.test.ts`
- C Evidence integrity -> `academic-ir-validation.test.ts`
- D Submission immutability -> validation + snapshot tests
- E Serialization round trip -> `academic-ir-serialization.test.ts`
- F Deterministic digest -> `academic-ir-serialization.test.ts`
- G Stable paragraph reconciliation -> reconciliation + adapter tests
- H Ambiguous reconciliation safety -> `academic-ir-reconciliation.test.ts`
- I Privacy projection -> `academic-ir-boundaries.test.ts`
- J Existing contract independence -> `academic-ir-boundaries.test.ts`
- K Research endpoint integrity -> `academic-ir-validation.test.ts`
- L Analysis dataset integrity -> `academic-ir-validation.test.ts`

- [ ] **Step 4: Run non-parser smoke and full repository gates**

Because this plan deliberately does not modify the parser, golden baseline refresh is not required. Still run the existing smoke path to detect accidental import/runtime regressions:

```bash
npm run docx-smoke
npm run check
```

Expected: PASS.

Do not run `npm test -- -u`; no snapshot baseline should change.

- [ ] **Step 5: Review the diff for forbidden scope expansion**

Run:

```bash
git diff --stat HEAD~8..HEAD
git diff HEAD~8..HEAD -- src/docx/parser.ts src/analysis/analyze-docx.ts src/integration/academic-suite-contracts.ts src/integration/lekta-result-adapter.ts package.json
```

Expected for the second command: no production diffs in those protected files and no `package.json` dependency change.

If task commit count differs from eight because review fixes were split, compare against the branch point instead of literally using `HEAD~8`.

- [ ] **Step 6: Commit documentation and final status**

```bash
git add docs/architecture/ACADEMIC_IR_CORE_V0_1.md docs/architecture/FOUNDATION_STATUS_2026-08-03.md
git commit -m "docs: mark Academic IR Core v0.1 implemented"
```

- [ ] **Step 7: Run final verification after the last commit**

```bash
npm run docx-smoke
npm run check
git status --short
```

Expected:
- `docx-smoke` PASS;
- `check` PASS;
- `git status --short` empty.

Do not claim completion if any one of these is red or if the worktree has uncommitted implementation changes.

---

## Dependency Order

Implement strictly in this order:

```text
Task 1  Schema/public API
   ↓
Task 2  Root/document validation
   ↓
Task 3  Research/snapshot validation
   ↓
Task 4  Serialization + digest
   ↓
Task 5  Reconciliation
   ↓
Task 6  Lekta projection adapter
   ↓
Task 7  Snapshots + version boundary
   ↓
Task 8  Privacy/contract regression lock
   ↓
Task 9  Full acceptance + docs
```

Tasks 2-3 depend on Task 1. Task 4 depends on Tasks 1-3 because deserialization validates. Task 5 depends on Task 4 for SHA-256 text fingerprinting. Task 6 depends on Task 5. Task 7 depends on Task 4. Task 8 depends on Task 6 and existing integration code. Task 9 depends on all prior tasks.

## Commit Sequence

The intended logical commits are:

```text
1. feat: define Academic IR v0.1 schema
2. feat: validate Academic IR document graph
3. feat: validate Academic IR research graph
4. feat: serialize and digest Academic IR deterministically
5. feat: reconcile Academic IR document nodes safely
6. feat: project Lekta document structure into Academic IR
7. feat: add Academic IR snapshots and version boundary
8. test: lock Academic IR privacy boundaries
9. docs: mark Academic IR Core v0.1 implemented
```

Small review-fix commits are allowed when needed, but do not squash unrelated responsibilities into a single implementation commit during development.

## Plan Self-Review Checklist

Before execution begins, verify:

- Every approved v0.1 scope item maps to a task above.
- No task adds MyST/Stencila/Web Twin/execution/cloud-sync scope.
- No task modifies existing parser/scoring semantics.
- All public function names used by later tasks are defined by earlier tasks.
- `AcademicDocumentNode.childIds` order remains semantic and is never globally sorted.
- Registry arrays are canonicalized by stable ID before digest generation.
- Exact reconciliation reuses an ID only when there is exactly one safe candidate.
- Ambiguous reconciliation never guesses.
- `toSharedLektaResult()` remains unchanged and privacy-tested.
- `ACADEMIC_SUITE_CONTRACT_VERSION` remains unchanged.
- No new dependency is required.
- Every task ends with `npm run check` before commit.
