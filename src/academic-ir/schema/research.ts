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
