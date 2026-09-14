# Academic IR Core v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Academic IR Core v0.1 as a local-first, versioned, deterministic TypeScript research-object foundation without changing existing Lekta scoring/parser semantics or the existing Lekta × Katedra shared transport contract.

**Architecture:** Add a new `src/academic-ir/` module that owns schema/types, validation, deterministic serialization/digests, baseline document-node reconciliation, snapshot helpers, and an initial Lekta document projection adapter. Academic IR remains separate from `src/integration/academic-suite-contracts.ts`; existing Lekta analysis continues unchanged and feeds Academic IR only through an explicit adapter.

**Tech Stack:** TypeScript 7 strict mode, Vitest 2, Vite 8, browser/Node Web Crypto (`crypto.subtle`), existing Lekta modules only. No new runtime or dev dependencies.

## Global Constraints

- Approved design source: `docs/superpowers/specs/2026-08-09-academic-ir-core-v0-1-design.md` at commit `fe05e2ef6e2a66e8b2d7d06539c65e7eeff7385c`.
- Implement in an isolated worktree/feature branch based on the approved design head; do not implement directly on `master`.
- Existing `ACADEMIC_SUITE_CONTRACT_VERSION` remains `0.1`; Academic IR has its own independent `ACADEMIC_IR_SCHEMA_VERSION = '0.1'`.
- Do not modify `src/docx/parser.ts`, scoring semantics, citation engine, or existing audits for Academic IR convenience. Any later parser change requires a golden-file test first per `CLAUDE.md`.
- Do not send raw `.docx`, document body text, source passages, mentor comment text, AI transcripts, or full Academic IR content to shared Supabase.
- Do not change the shape or privacy semantics of `toSharedLektaResult()` in `src/integration/lekta-result-adapter.ts`.
- Lekta remains the only authority that can establish formal `VERIFIED_FIXED`; Academic IR must not synthesize that status.
- Academic IR must never write or rewrite academic argumentation; it stores/projects structures and process metadata only.
- Canonical persisted Academic IR must be JSON-serializable, acyclic, and deterministic for digest purposes.
- Durable entity IDs are globally unique inside one Academic IR object so unscoped provenance `targetIds` remain unambiguous.
- Durable identity must never depend on paragraph/page/array position.
- Ambiguous reconciliation must remain unresolved rather than attaching old identity to an arbitrary candidate.
- No MyST, Stencila, C2PA, RO-Crate, Jupyter, Jamovi execution, public Web Twin, or cloud-sync implementation in this plan.
- No new package dependencies. Use built-in `crypto.randomUUID`, `crypto.subtle`, `TextEncoder`, `structuredClone`, and existing TypeScript/Vitest tooling.
- Before every commit, run the relevant targeted tests and then `npm run check` (`tsc --noEmit && vitest run && vite build`). Never commit red.

---

## File Map

Create:

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

Tests:

```text
tests/academic-ir-schema.test.ts
tests/academic-ir-validation.test.ts
tests/academic-ir-serialization.test.ts
tests/academic-ir-reconciliation.test.ts
tests/academic-ir-lekta-adapter.test.ts
tests/academic-ir-snapshots.test.ts
tests/academic-ir-boundaries.test.ts
```

Protected production files that this plan does not modify:

```text
src/docx/parser.ts
src/analysis/analyze-docx.ts
src/integration/academic-suite-contracts.ts
src/integration/lekta-result-adapter.ts
package.json
```

---

### Task 1: Define the Academic IR v0.1 schema and public API

**Files:**
- Create all files under `src/academic-ir/schema/`
- Create `src/academic-ir/create-academic-ir.ts`
- Create `src/academic-ir/index.ts`
- Test `tests/academic-ir-schema.test.ts`

**Interfaces:**
- Produces `ACADEMIC_IR_SCHEMA_VERSION`, `AcademicIR`, all node/edge/event types, and `createAcademicIR(input)`.
- Later tasks import public types/functions from `src/academic-ir/index.ts`.

- [ ] **Step 1: Write the failing schema test**

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
  it('locks the independent Academic IR version', () => {
    expect(ACADEMIC_IR_SCHEMA_VERSION).toBe('0.1');
  });

  it('creates the minimal local-first root', () => {
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
        nodes: [{ id: 'doc-root', type: 'document', childIds: [], persistence: 'local-project' }],
      },
      research: { nodes: [], edges: [] },
      process: { events: [] },
      provenance: { events: [] },
      snapshots: [],
    } satisfies AcademicIR);
  });

  it('keeps claim identity separate from evidence identity', () => {
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
    expect(evidence.claimId).toBe('claim-1');
    expect(evidence.id).toBe('edge-1');
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/academic-ir-schema.test.ts
```

Expected: module-not-found failure for `../src/academic-ir`.

- [ ] **Step 3: Implement version/common/document schema**

`schema/version.ts`:

```ts
export const ACADEMIC_IR_SCHEMA_VERSION = '0.1' as const;
export type AcademicIRSchemaVersion = typeof ACADEMIC_IR_SCHEMA_VERSION;
```

`schema/common.ts`:

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

`schema/document.ts`:

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

- [ ] **Step 4: Implement the complete research schema**

`schema/research.ts`:

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

- [ ] **Step 5: Implement process, provenance, snapshot, and root schemas explicitly**

`schema/process.ts`:

```ts
import type { PersistenceClass } from './common';

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

`schema/provenance.ts`:

```ts
import type { PersistenceClass } from './common';

export interface ProvenanceGraph {
  events: ProvenanceEvent[];
}

export interface ProvenanceEvent {
  id: string;
  actor:
    | { type: 'human'; actorId?: string }
    | { type: 'machine'; provider?: string; model?: string }
    | { type: 'system'; system: string };
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

`schema/snapshot.ts`:

```ts
export interface SnapshotRef {
  id: string;
  projectId: string;
  kind: 'working' | 'mentor-review' | 'preflight' | 'submission' | 'correction';
  academicIrDigest: string;
  documentFingerprint?: string;
  rulesetId?: string;
  lektaAnalysisId?: string;
  createdAt: string;
  immutable: boolean;
}
```

`schema/root.ts`:

```ts
import type { AcademicIRSchemaVersion } from './version';
import type { DocumentGraph } from './document';
import type { ResearchGraph } from './research';
import type { ProcessGraph } from './process';
import type { ProvenanceGraph } from './provenance';
import type { SnapshotRef } from './snapshot';

export interface AcademicIR {
  schemaVersion: AcademicIRSchemaVersion;
  projectId: string;
  generatedAt: string;
  document: DocumentGraph;
  research: ResearchGraph;
  process: ProcessGraph;
  provenance: ProvenanceGraph;
  snapshots: SnapshotRef[];
}
```

- [ ] **Step 6: Implement root factory and barrel export**

`create-academic-ir.ts`:

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
      nodes: [{ id: input.documentRootId, type: 'document', childIds: [], persistence: 'local-project' }],
    },
    research: { nodes: [], edges: [] },
    process: { events: [] },
    provenance: { events: [] },
    snapshots: [],
  };
}
```

`index.ts` exports all schema modules plus `createAcademicIR`.

- [ ] **Step 7: Run GREEN/full gate and commit**

```bash
npx vitest run tests/academic-ir-schema.test.ts
npx tsc --noEmit
npm run check
git add src/academic-ir tests/academic-ir-schema.test.ts
git commit -m "feat: define Academic IR v0.1 schema"
```

---

### Task 2: Add structured root/document/global-ID validation

**Files:**
- Create `src/academic-ir/validation/types.ts`
- Create `src/academic-ir/validation/schema-validation.ts`
- Create `src/academic-ir/validation/graph-validation.ts`
- Create `src/academic-ir/validation/validate-academic-ir.ts`
- Modify `src/academic-ir/index.ts`
- Create `tests/academic-ir-validation.test.ts`

**Interfaces:**
- Produces `validateAcademicIR(ir: AcademicIR): AcademicIRValidationResult`.
- Validation codes are public/stable API.

- [ ] **Step 1: Write failing tests for minimal validity, missing child, cycle, and global duplicate ID**

```ts
import { describe, expect, it } from 'vitest';
import { createAcademicIR, validateAcademicIR } from '../src/academic-ir';

describe('Academic IR validation', () => {
  it('accepts the minimal root', () => {
    const ir = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    expect(validateAcademicIR(ir)).toEqual({ valid: true, findings: [] });
  });

  it('rejects a missing document child', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes[0].childIds = ['missing-child'];
    expect(validateAcademicIR(ir).findings).toContainEqual({
      code: 'IR_DOCUMENT_CHILD_MISSING',
      severity: 'error',
      path: 'document.nodes[root-1].childIds[0]',
      message: 'Document child "missing-child" does not resolve to a document node.',
    });
  });

  it('rejects a document cycle', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes.push({ id: 'p-1', type: 'paragraph', parentId: 'root-1', childIds: ['root-1'], persistence: 'local-project' });
    ir.document.nodes[0].parentId = 'p-1';
    ir.document.nodes[0].childIds = ['p-1'];
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_DOCUMENT_CYCLE')).toBe(true);
  });

  it('rejects an entity ID reused across graph scopes', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.research.nodes.push({
      id: 'root-1',
      type: 'dataset',
      label: 'Dataset',
      persistence: 'local-project',
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_DUPLICATE_ID')).toBe(true);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/academic-ir-validation.test.ts
```

- [ ] **Step 3: Define validation types including JSON parse failure code**

`validation/types.ts`:

```ts
export type AcademicIRValidationSeverity = 'error' | 'warning';

export type AcademicIRValidationCode =
  | 'IR_JSON_INVALID'
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

- [ ] **Step 4: Implement schema/document/global-ID validators**

`schema-validation.ts` checks:

```text
schemaVersion === 0.1
projectId is non-empty
Date.parse(generatedAt) is valid
```

`graph-validation.ts` must build entity ID registrations across:

```text
document.nodes
research.nodes
research.edges
process.events
provenance.events
snapshots
```

Any duplicate ID across any of those registries emits `IR_DUPLICATE_ID` because provenance `targetIds` are unscoped strings.

Document graph validation must:
- index nodes once;
- require root ID to resolve;
- require every `parentId`/`childId` to resolve;
- detect cycles with DFS state;
- return findings, never mutate input.

Use:

```ts
function error(code: AcademicIRValidationCode, path: string, message: string): AcademicIRValidationFinding {
  return { code, severity: 'error', path, message };
}
```

`validate-academic-ir.ts` combines validators in deterministic order and sets `valid` from absence of error findings.

- [ ] **Step 5: Run GREEN/full gate and commit**

```bash
npx vitest run tests/academic-ir-validation.test.ts
npm run check
git add src/academic-ir/validation src/academic-ir/index.ts tests/academic-ir-validation.test.ts
git commit -m "feat: validate Academic IR document graph"
```

---

### Task 3: Validate research relationships and snapshot invariants

**Files:**
- Modify `src/academic-ir/validation/graph-validation.ts`
- Modify `src/academic-ir/validation/validate-academic-ir.ts`
- Modify `tests/academic-ir-validation.test.ts`

**Interfaces:**
- Extends the Task 2 validator without changing its signature.

- [ ] **Step 1: Add failing acceptance cases C, D, K, L**

Add tests for:

```ts
it('rejects evidence referencing a missing claim', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.research.edges.push({
    id: 'e-1', type: 'evidence', claimId: 'missing-claim',
    target: { type: 'document-node', id: 'root-1' },
    relation: 'supports', persistence: 'local-project',
  });
  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_EVIDENCE_CLAIM_MISSING')).toBe(true);
});

it('rejects a mutable submission snapshot', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.snapshots.push({
    id: 'snap-1', projectId: 'project-1', kind: 'submission', academicIrDigest: 'abc',
    createdAt: '2026-08-09T18:00:00.000Z', immutable: false,
  });
  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_SUBMISSION_MUTABLE')).toBe(true);
});

it('rejects a relation whose declared endpoint is missing', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.research.edges.push({
    id: 'rel-1', type: 'relation',
    from: { scope: 'document-node', id: 'root-1' },
    to: { scope: 'research-node', id: 'missing-node' },
    relation: 'discussed-in', persistence: 'local-project',
  });
  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_RESEARCH_ENDPOINT_MISSING')).toBe(true);
});

it('rejects an analysis whose dataset does not resolve to DatasetNode', () => {
  const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
  ir.research.nodes.push({
    id: 'analysis-1', type: 'analysis', engine: 'jamovi', analysisType: 'pearson-correlation',
    datasetIds: ['missing-dataset'], specification: {}, outputs: [], status: 'declared',
    persistence: 'local-project',
  });
  expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_ANALYSIS_DATASET_MISSING')).toBe(true);
});
```

Also add:
- claim/method/finding/limitation/research-question/hypothesis missing `documentNodeIds` target -> `IR_DOCUMENT_LINK_MISSING`;
- evidence `source|analysis|dataset` target resolves only when the target node has the matching type;
- snapshot project mismatch -> `IR_SNAPSHOT_PROJECT_MISMATCH`.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/academic-ir-validation.test.ts
```

- [ ] **Step 3: Implement typed research endpoint resolution**

Use one research index:

```ts
const researchById = new Map(ir.research.nodes.map((node) => [node.id, node]));
const documentIds = new Set(ir.document.nodes.map((node) => node.id));
```

For `EvidenceEdge`:
- `claimId` must resolve to `type === 'claim'`;
- document target must resolve in `documentIds`;
- source/analysis/dataset target must resolve to exactly the matching research-node type.

For `ResearchGraphEdge`, resolve endpoint according to `scope`.

For every `AnalysisNode.datasetIds`, require `type === 'dataset'`.

For every research node containing `documentNodeIds`, require all document IDs to exist.

- [ ] **Step 4: Implement snapshot semantic validation**

Require:

```text
snapshot.projectId === ir.projectId
submission => immutable === true
createdAt parses as a date
```

Validation reports; it never repairs input.

- [ ] **Step 5: Run GREEN/full gate and commit**

```bash
npx vitest run tests/academic-ir-validation.test.ts
npm run check
git add src/academic-ir/validation tests/academic-ir-validation.test.ts
git commit -m "feat: validate Academic IR research graph"
```

---

### Task 4: Implement canonical serialization and SHA-256 digests

**Files:**
- Create `src/academic-ir/serialization/canonicalize.ts`
- Create `src/academic-ir/serialization/serialize.ts`
- Create `src/academic-ir/serialization/digest.ts`
- Modify `src/academic-ir/index.ts`
- Create `tests/academic-ir-serialization.test.ts`

**Interfaces:**
- `canonicalizeAcademicIR(ir): AcademicIR`
- `serializeAcademicIR(ir): string`
- `deserializeAcademicIR(json): AcademicIRDeserializeResult`
- `sha256Hex(text): Promise<string>`
- `digestAcademicIR(ir): Promise<string>`

- [ ] **Step 1: Write failing round-trip/digest/order tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  canonicalizeAcademicIR,
  createAcademicIR,
  deserializeAcademicIR,
  digestAcademicIR,
  serializeAcademicIR,
} from '../src/academic-ir';

describe('Academic IR serialization', () => {
  it('round-trips canonical semantics and stable IDs', () => {
    const ir = createAcademicIR({
      projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1',
    });
    ir.document.nodes.push({ id: 'p-1', type: 'paragraph', parentId: 'root-1', persistence: 'local-project' });
    ir.document.nodes[0].childIds = ['p-1'];

    const serialized = serializeAcademicIR(ir);
    const result = deserializeAcademicIR(serialized);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(serializeAcademicIR(result.value)).toBe(serialized);
      expect(result.value.document.nodes.some((node) => node.id === 'p-1')).toBe(true);
    }
  });

  it('produces equal digests for different registry insertion order', async () => {
    const a = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    const b = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    const p1 = { id: 'p-1', type: 'paragraph' as const, parentId: 'root-1', persistence: 'local-project' as const };
    const p2 = { id: 'p-2', type: 'paragraph' as const, parentId: 'root-1', persistence: 'local-project' as const };
    a.document.nodes.push(p1, p2);
    b.document.nodes.push(p2, p1);
    a.document.nodes[0].childIds = ['p-1', 'p-2'];
    b.document.nodes[0].childIds = ['p-1', 'p-2'];
    expect(await digestAcademicIR(a)).toBe(await digestAcademicIR(b));
  });

  it('preserves semantic document child order', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes[0].childIds = ['p-2', 'p-1'];
    const canonical = canonicalizeAcademicIR(ir);
    expect(canonical.document.nodes.find((node) => node.id === 'root-1')?.childIds).toEqual(['p-2', 'p-1']);
  });

  it('returns a structured invalid-json result', () => {
    const result = deserializeAcademicIR('{broken');
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-json',
      findings: [{
        code: 'IR_JSON_INVALID', severity: 'error', path: '$', message: 'Academic IR JSON is invalid.',
      }],
    });
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/academic-ir-serialization.test.ts
```

- [ ] **Step 3: Implement canonicalization carefully**

`canonicalize.ts`:

```ts
function sortObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortObjectKeysDeep(child)]),
  );
}

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

Do not sort `childIds`, `AnalysisOutput[]`, or any other array whose sequence can carry meaning.

- [ ] **Step 4: Implement serialization/deserialization and digest**

`serialize.ts`:

```ts
export type AcademicIRDeserializeResult =
  | { ok: true; value: AcademicIR }
  | { ok: false; reason: 'invalid-json' | 'invalid-ir'; findings: AcademicIRValidationFinding[] };

export function serializeAcademicIR(ir: AcademicIR): string {
  return JSON.stringify(canonicalizeAcademicIR(ir));
}

export function deserializeAcademicIR(json: string): AcademicIRDeserializeResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {
      ok: false,
      reason: 'invalid-json',
      findings: [{ code: 'IR_JSON_INVALID', severity: 'error', path: '$', message: 'Academic IR JSON is invalid.' }],
    };
  }
  const ir = value as AcademicIR;
  const validation = validateAcademicIR(ir);
  return validation.valid
    ? { ok: true, value: ir }
    : { ok: false, reason: 'invalid-ir', findings: validation.findings };
}
```

`digest.ts`:

```ts
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function digestAcademicIR(ir: AcademicIR): Promise<string> {
  return sha256Hex(serializeAcademicIR(ir));
}
```

Do not import Node `crypto`.

- [ ] **Step 5: Run GREEN/full gate and commit**

```bash
npx vitest run tests/academic-ir-serialization.test.ts
npm run check
git add src/academic-ir/serialization src/academic-ir/index.ts tests/academic-ir-serialization.test.ts
git commit -m "feat: serialize and digest Academic IR deterministically"
```

---

### Task 5: Implement baseline safe document reconciliation

**Files:**
- Create `src/academic-ir/reconciliation/types.ts`
- Create `src/academic-ir/reconciliation/fingerprint.ts`
- Create `src/academic-ir/reconciliation/reconcile-document-nodes.ts`
- Modify `src/academic-ir/index.ts`
- Create `tests/academic-ir-reconciliation.test.ts`

**Interfaces:**

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
  idFactory?: () => string;
}
```

`high-confidence` exists in the vocabulary but baseline Core v0.1 emits `exact|ambiguous|new|removed` only.

- [ ] **Step 1: Write failing stable-shift and ambiguity tests**

```ts
import { describe, expect, it } from 'vitest';
import { fingerprintDocumentText, reconcileDocumentNodes, type DocumentGraph } from '../src/academic-ir';

const ids = (...values: string[]) => {
  let i = 0;
  return () => values[i++] ?? `generated-${i}`;
};

it('preserves a durable paragraph ID after unrelated insertion above it', async () => {
  const fp = await fingerprintDocumentText('Rezultati pokazuju rast povjerenja.');
  const previous: DocumentGraph = {
    rootId: 'root-1', documentFingerprint: 'doc-v1',
    nodes: [
      { id: 'root-1', type: 'document', childIds: ['p-stable'], persistence: 'local-project' },
      {
        id: 'p-stable', type: 'paragraph', parentId: 'root-1',
        source: { documentFingerprint: 'doc-v1', paragraphIndex: 47 },
        contentFingerprint: fp, persistence: 'local-project',
      },
    ],
  };
  const result = await reconcileDocumentNodes(previous, [
    { type: 'paragraph', paragraphIndex: 47, text: 'Novi prvi odlomak.' },
    { type: 'paragraph', paragraphIndex: 48, text: 'Novi drugi odlomak.' },
    { type: 'paragraph', paragraphIndex: 49, text: 'Rezultati pokazuju rast povjerenja.' },
  ], { documentFingerprint: 'doc-v2', idFactory: ids('new-1', 'new-2') });

  expect(result.graph.nodes.find((node) => node.id === 'p-stable')?.source?.paragraphIndex).toBe(49);
  expect(result.records).toContainEqual({
    previousNodeId: 'p-stable', nextNodeId: 'p-stable', status: 'exact', paragraphIndex: 49,
  });
});

it('does not reuse old identity when duplicate candidates are ambiguous', async () => {
  const fp = await fingerprintDocumentText('Isti tekst.');
  const previous: DocumentGraph = {
    rootId: 'root-1',
    nodes: [
      { id: 'root-1', type: 'document', childIds: ['old-1'], persistence: 'local-project' },
      { id: 'old-1', type: 'paragraph', parentId: 'root-1', contentFingerprint: fp, persistence: 'local-project' },
    ],
  };
  const result = await reconcileDocumentNodes(previous, [
    { type: 'paragraph', paragraphIndex: 10, text: 'Isti tekst.' },
    { type: 'paragraph', paragraphIndex: 11, text: 'Isti tekst.' },
  ], { documentFingerprint: 'doc-v2', idFactory: ids('new-a', 'new-b') });

  expect(result.records.some((r) => r.previousNodeId === 'old-1' && r.status === 'ambiguous')).toBe(true);
  expect(result.graph.nodes.some((node) => node.id === 'old-1')).toBe(false);
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/academic-ir-reconciliation.test.ts
```

- [ ] **Step 3: Implement normalization/fingerprint**

```ts
import { sha256Hex } from '../serialization/digest';

export function normalizeDocumentText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export async function fingerprintDocumentText(text: string): Promise<string> {
  return sha256Hex(normalizeDocumentText(text));
}
```

Do not lowercase: case changes remain real edits, not exact matches.

- [ ] **Step 4: Implement exact/ambiguous algorithm**

Algorithm:
1. `Promise.all` fingerprint all new candidates.
2. Index candidates by `${type}:${contentFingerprint}`.
3. For each previous heading/paragraph with a fingerprint: one unclaimed candidate -> reuse old ID, `exact`; none -> `removed`; more than one -> `ambiguous`, reuse none.
4. Every unclaimed candidate gets a new opaque ID from `idFactory ?? crypto.randomUUID` and status `new`.
5. Reuse previous root ID.
6. Root `childIds` follow new document order.
7. Every emitted child gets the new `documentFingerprint` and current `paragraphIndex` anchor.
8. Do not carry stale anchors for unmatched nodes.
9. Do not use position, nearest paragraph, fuzzy text, split/merge guesses, or Levenshtein fallback.

- [ ] **Step 5: Add claim-link survival assertion**

Create a `ClaimNode` with `documentNodeIds: ['p-stable']`, replace only `ir.document` with the reconciled graph, and assert both:

```ts
expect(claim.documentNodeIds).toEqual(['p-stable']);
expect(result.graph.nodes.some((node) => node.id === 'p-stable')).toBe(true);
```

- [ ] **Step 6: Run GREEN/full gate and commit**

```bash
npx vitest run tests/academic-ir-reconciliation.test.ts
npm run check
git add src/academic-ir/reconciliation src/academic-ir/index.ts tests/academic-ir-reconciliation.test.ts
git commit -m "feat: reconcile Academic IR document nodes safely"
```

---

### Task 6: Add the initial Lekta document projection adapter

**Files:**
- Create `src/academic-ir/adapters/lekta-document-adapter.ts`
- Modify `src/academic-ir/index.ts`
- Create `tests/academic-ir-lekta-adapter.test.ts`

**Interfaces:**

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

export interface LektaDocumentAdapterOptions {
  idFactory?: () => string;
}

export interface LektaDocumentProjectionResult {
  graph: DocumentGraph;
  reconciliation: ReconciliationRecord[];
}

export async function projectLektaDocument(
  input: LektaDocumentProjectionInput,
  previousGraph?: DocumentGraph,
  options?: LektaDocumentAdapterOptions,
): Promise<LektaDocumentProjectionResult>;
```

- [ ] **Step 1: Write failing first-projection/reprojection tests**

```ts
import { describe, expect, it } from 'vitest';
import { projectLektaDocument } from '../src/academic-ir';

const ids = (...values: string[]) => {
  let i = 0;
  return () => values[i++] ?? `id-${i}`;
};

it('projects headings/paragraphs without persisting raw body text', async () => {
  const result = await projectLektaDocument({
    projectId: 'project-1', documentFingerprint: 'doc-v1',
    paragraphs: [
      { paragraphIndex: 1, text: 'UVOD', headingLevel: 1 },
      { paragraphIndex: 2, text: 'Ovo je sadržaj odlomka.' },
    ],
  }, undefined, { idFactory: ids('root-1', 'heading-1', 'p-1') });

  expect(result.graph.nodes.find((node) => node.id === 'heading-1')?.type).toBe('heading');
  expect(result.graph.nodes.find((node) => node.id === 'p-1')?.type).toBe('paragraph');
  expect(JSON.stringify(result.graph)).not.toContain('Ovo je sadržaj odlomka.');
});

it('reuses the durable ID after paragraph-index shift', async () => {
  const first = await projectLektaDocument({
    projectId: 'project-1', documentFingerprint: 'doc-v1',
    paragraphs: [{ paragraphIndex: 47, text: 'Rezultati pokazuju rast povjerenja.' }],
  }, undefined, { idFactory: ids('root-1', 'stable-1') });

  const second = await projectLektaDocument({
    projectId: 'project-1', documentFingerprint: 'doc-v2',
    paragraphs: [
      { paragraphIndex: 47, text: 'Novi odlomak.' },
      { paragraphIndex: 48, text: 'Drugi novi odlomak.' },
      { paragraphIndex: 49, text: 'Rezultati pokazuju rast povjerenja.' },
    ],
  }, first.graph, { idFactory: ids('new-1', 'new-2') });

  expect(second.graph.nodes.find((node) => node.id === 'stable-1')?.source?.paragraphIndex).toBe(49);
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/academic-ir-lekta-adapter.test.ts
```

- [ ] **Step 3: Implement first projection and reprojection**

Rules:
- `headingLevel != null && headingLevel > 0` -> `heading`; else `paragraph`.
- Store `attributes: { headingLevel }` only for heading nodes.
- Raw text is ephemeral adapter input and is used only for `contentFingerprint`; it is not copied into node attributes in v0.1.
- First projection creates a root and child IDs from `idFactory ?? crypto.randomUUID` in document order.
- Reprojection calls Task 5 reconciliation and preserves previous root ID.
- Every child gets `persistence: 'local-project'` and source anchor with document fingerprint/index/optional element ID.
- `projectId` never appears inside node IDs.
- Do not import `src/ui/*`, `src/report/*`, or mutate `analyzeDocx`.

- [ ] **Step 4: Add empty-document test**

```ts
it('creates a valid empty root for zero paragraphs', async () => {
  const result = await projectLektaDocument(
    { projectId: 'project-1', documentFingerprint: 'empty-doc', paragraphs: [] },
    undefined,
    { idFactory: ids('root-empty') },
  );
  expect(result.graph).toEqual({
    rootId: 'root-empty',
    documentFingerprint: 'empty-doc',
    nodes: [{ id: 'root-empty', type: 'document', childIds: [], persistence: 'local-project' }],
  });
});
```

- [ ] **Step 5: Run GREEN/full gate and commit**

```bash
npx vitest run tests/academic-ir-lekta-adapter.test.ts tests/academic-ir-reconciliation.test.ts
npm run check
git add src/academic-ir/adapters src/academic-ir/index.ts tests/academic-ir-lekta-adapter.test.ts
git commit -m "feat: project Lekta document structure into Academic IR"
```

---

### Task 7: Add snapshot creation and schema-version dispatch boundary

**Files:**
- Create `src/academic-ir/snapshots.ts`
- Create `src/academic-ir/migrations/index.ts`
- Modify `src/academic-ir/index.ts`
- Create `tests/academic-ir-snapshots.test.ts`

**Interfaces:**
- `createAcademicIRSnapshot(ir, input): Promise<SnapshotRef>`
- `readAcademicIRVersion(value): string | undefined`
- `isCurrentAcademicIRVersion(value): boolean`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_IR_SCHEMA_VERSION,
  createAcademicIR,
  createAcademicIRSnapshot,
  isCurrentAcademicIRVersion,
  readAcademicIRVersion,
} from '../src/academic-ir';

it('forces submission snapshots immutable and binds the current IR digest', async () => {
  const ir = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
  const snapshot = await createAcademicIRSnapshot(ir, {
    id: 'snapshot-1', kind: 'submission', createdAt: '2026-08-09T18:05:00.000Z',
    documentFingerprint: 'doc-v1', rulesetId: 'rules-v1', lektaAnalysisId: 'analysis-1',
  });
  expect(snapshot.immutable).toBe(true);
  expect(snapshot.projectId).toBe('project-1');
  expect(snapshot.academicIrDigest).toMatch(/^[0-9a-f]{64}$/);
});

it('keeps version dispatch explicit', () => {
  expect(readAcademicIRVersion({ schemaVersion: '0.1' })).toBe('0.1');
  expect(isCurrentAcademicIRVersion({ schemaVersion: ACADEMIC_IR_SCHEMA_VERSION })).toBe(true);
  expect(isCurrentAcademicIRVersion({ schemaVersion: '0.2' })).toBe(false);
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/academic-ir-snapshots.test.ts
```

- [ ] **Step 3: Implement pure snapshot helper**

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

Do not mutate `ir.snapshots` inside this helper.

- [ ] **Step 4: Implement current-version helpers only**

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

Do not create a nonexistent 0.1 -> 0.2 migration.

- [ ] **Step 5: Run GREEN/full gate and commit**

```bash
npx vitest run tests/academic-ir-snapshots.test.ts
npm run check
git add src/academic-ir/snapshots.ts src/academic-ir/migrations src/academic-ir/index.ts tests/academic-ir-snapshots.test.ts
git commit -m "feat: add Academic IR snapshots and version boundary"
```

---

### Task 8: Lock privacy and existing Academic Suite contract independence

**Files:**
- Create `tests/academic-ir-boundaries.test.ts`
- No production modification expected.

**Interfaces:**
- Regression-only task.
- Confirms local Academic IR paragraph text does not change shared transport privacy.

- [ ] **Step 1: Add boundary tests**

```ts
import { describe, expect, it } from 'vitest';
import { ACADEMIC_IR_SCHEMA_VERSION, projectLektaDocument } from '../src/academic-ir';
import { ACADEMIC_SUITE_CONTRACT_VERSION } from '../src/integration/academic-suite-contracts';
import { toSharedLektaResult } from '../src/integration/lekta-result-adapter';
import { issue, makeCheck } from '../src/scoring/checks';

describe('Academic IR boundaries', () => {
  it('keeps Academic IR and Academic Suite versions independent', () => {
    expect(ACADEMIC_IR_SCHEMA_VERSION).toBe('0.1');
    expect(ACADEMIC_SUITE_CONTRACT_VERSION).toBe('0.1');
  });

  it('does not put local paragraph text or Issue.detail/where into shared LektaResult', async () => {
    const sensitiveParagraph = 'OSJETLJIV SADRŽAJ TIJELA RADA';
    const sensitiveDetail = 'OSJETLJIV DETALJ IZ DOKUMENTA';
    const sensitiveWhere = 'OSJETLJIVA LOKACIJA';
    const values = ['root-1', 'p-1'];
    let index = 0;

    await projectLektaDocument({
      projectId: 'project-1', documentFingerprint: 'doc-v1',
      paragraphs: [{ paragraphIndex: 12, text: sensitiveParagraph }],
    }, undefined, { idFactory: () => values[index++] });

    const finding = issue('warning', 'structure', 'Nalaz', sensitiveDetail, sensitiveWhere);
    const shared = toSharedLektaResult({
      score: 80,
      checks: [makeCheck('structure', 'Provjera', 'warn', 1, 2, 'detail', finding)],
      issues: [finding],
    }, {
      analysisId: 'analysis-1', rulesetId: 'rules-1', analyzedAt: '2026-08-09T18:00:00.000Z',
      projectId: 'project-1', documentFingerprint: 'doc-v1',
    });

    const payload = JSON.stringify(shared);
    expect(payload).not.toContain(sensitiveParagraph);
    expect(payload).not.toContain(sensitiveDetail);
    expect(payload).not.toContain(sensitiveWhere);
  });
});
```

- [ ] **Step 2: Run boundary and existing contract tests**

```bash
npx vitest run tests/academic-ir-boundaries.test.ts tests/academic-suite-contracts.test.ts tests/katedra-handoff.test.ts
```

Expected: PASS with no changes to shared contract/adapter source.

- [ ] **Step 3: Run full gate and commit**

```bash
npm run check
git add tests/academic-ir-boundaries.test.ts
git commit -m "test: lock Academic IR privacy boundaries"
```

---

### Task 9: Final acceptance harness and implementation-status docs

**Files:**
- Create `docs/architecture/ACADEMIC_IR_CORE_V0_1.md`
- Append to `docs/architecture/FOUNDATION_STATUS_2026-08-03.md`

**Interfaces:**
- No new runtime API.

- [ ] **Step 1: Create implementation-status document**

`docs/architecture/ACADEMIC_IR_CORE_V0_1.md`:

```markdown
# Academic IR Core v0.1

Status: implemented foundation

## Canonical code

`src/academic-ir/`

## Guarantees

- Academic IR schema version is independent from the Academic Suite transport version.
- Full Academic IR is local-first and has no shared-Supabase write path in v0.1.
- Durable entity IDs are globally unique inside one Academic IR object.
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

- [ ] **Step 2: Append dated addendum to foundation status**

Append only:

```markdown
## Addendum — Academic IR Core v0.1

Academic IR is an additive Shared Core layer above the accepted Academic Suite v0.1 transport contract. It does not replace `ProjectManifest`, `LektaResult`, or current product ownership boundaries. Canonical implementation and guarantees are documented in `docs/architecture/ACADEMIC_IR_CORE_V0_1.md`.
```

- [ ] **Step 3: Run the complete Academic IR acceptance suite**

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

Acceptance mapping:

```text
A Root validity                    academic-ir-validation.test.ts
B Broken document reference        academic-ir-validation.test.ts
C Evidence integrity               academic-ir-validation.test.ts
D Submission immutability          validation + snapshots tests
E Serialization round trip         academic-ir-serialization.test.ts
F Deterministic digest             academic-ir-serialization.test.ts
G Stable paragraph reconciliation  reconciliation + adapter tests
H Ambiguous reconciliation safety  academic-ir-reconciliation.test.ts
I Privacy projection               academic-ir-boundaries.test.ts
J Contract independence            academic-ir-boundaries.test.ts
K Research endpoint integrity      academic-ir-validation.test.ts
L Analysis dataset integrity       academic-ir-validation.test.ts
```

- [ ] **Step 4: Run smoke/full repository gates**

```bash
npm run docx-smoke
npm run check
```

No snapshot refresh (`npm test -- -u`) is allowed because parser/scoring behavior must remain unchanged.

- [ ] **Step 5: Verify protected files and dependency scope have no diff**

```bash
BASE=$(git merge-base master HEAD)
git diff --stat "$BASE"..HEAD
git diff "$BASE"..HEAD -- \
  src/docx/parser.ts \
  src/analysis/analyze-docx.ts \
  src/integration/academic-suite-contracts.ts \
  src/integration/lekta-result-adapter.ts \
  package.json
```

Expected for the protected-file diff: empty.

- [ ] **Step 6: Commit docs and run final post-commit verification**

```bash
git add docs/architecture/ACADEMIC_IR_CORE_V0_1.md docs/architecture/FOUNDATION_STATUS_2026-08-03.md
git commit -m "docs: mark Academic IR Core v0.1 implemented"
npm run docx-smoke
npm run check
git status --short
```

Expected: both commands PASS and `git status --short` prints nothing.

---

## Dependency Order

```text
Task 1  Schema/public API
   ↓
Task 2  Root/document/global-ID validation
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
Task 9  Acceptance + docs
```

Task 4 depends on Tasks 1-3 because deserialization validates. Task 5 depends on Task 4 for SHA-256 text fingerprinting. Task 6 depends on Task 5. Task 7 depends on Task 4. Task 8 depends on Task 6 and existing integration code. Task 9 depends on all prior tasks.

## Intended Commit Sequence

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

## Self-Review Result

The plan has been reviewed against the approved spec and current Lekta constraints.

Confirmed:
- all 12 approved acceptance behaviors map to explicit tests;
- every later public symbol is defined by an earlier task;
- `IR_JSON_INVALID` is defined before serialization uses it;
- global entity-ID uniqueness removes ambiguity from unscoped provenance target IDs;
- canonical registry sorting does not reorder semantic `childIds`;
- serialization round-trip compares canonical semantics rather than original incidental registry order;
- baseline reconciliation only reuses identity for one unique exact candidate;
- ambiguous reconciliation never guesses;
- no task changes parser/scoring/shared-contract semantics;
- no task adds a dependency;
- every implementation commit is gated by `npm run check`.
