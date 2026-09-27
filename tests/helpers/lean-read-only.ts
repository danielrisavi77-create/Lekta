import { parse } from '@babel/parser';

/**
 * Read-only faze lean workflowa (run wf_c810022a-a05: brief agent je commitao na granu jer je
 * "SAMO CITAJ" bio samo recenica u promptu). Te faze moraju ici kroz agenta `lean-citac`, cija
 * definicija dopusta samo alate za citanje.
 */
export const LEAN_READ_ONLY_LABELS = ['brief', 'kriticar', 'dizajner'] as const;
export const LEAN_READER_AGENT = 'lean-citac';
export const LEAN_READER_TOOLS = ['Glob', 'Grep', 'Read'] as const;

export interface RunAgentCall {
  label: string;
  agentType: string | null;
}

interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  [key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function literalText(node: unknown): string | null {
  if (!isNode(node)) return null;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && node.expressions.length === 0) {
    const quasis = node.quasis as Array<{ value: { cooked: string } }>;
    return quasis.map((q) => q.value.cooked).join('');
  }
  return null;
}

function propertyName(prop: AstNode): string | null {
  const key = prop.key;
  if (!isNode(key) || prop.computed) return null;
  if (key.type === 'Identifier' && typeof key.name === 'string') return key.name;
  return literalText(key);
}

/** Svi `runAgent('<label>', prompt, { ... })` pozivi iz izvora workflowa, parsirani kao JS AST. */
export function findRunAgentCalls(source: string): RunAgentCall[] {
  const text = source.replace(/\r/g, '');
  // Workflow skripta ima top-level await i return (tijelo se izvrsava kao async funkcija).
  const ast = parse(text, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
  }) as unknown as AstNode;
  const calls: RunAgentCall[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === 'CallExpression') {
      const callee = node.callee as AstNode;
      const args = node.arguments as AstNode[];
      if (callee.type === 'Identifier' && callee.name === 'runAgent') {
        const label = literalText(args[0]);
        const opts = args[2];
        let agentType: string | null = null;
        if (isNode(opts) && opts.type === 'ObjectExpression') {
          for (const prop of opts.properties as AstNode[]) {
            if (prop.type === 'ObjectProperty' && propertyName(prop) === 'agentType') {
              const value = prop.value as AstNode;
              agentType = literalText(value) ?? `<ne-literal: ${text.slice(value.start ?? 0, value.end ?? 0)}>`;
            }
          }
        }
        if (label !== null) calls.push({ label, agentType });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
      if (typeof value === 'object' && value !== null) visit(value);
    }
  };
  visit(ast);
  return calls;
}

/**
 * Prekrsaji: read-only labela bez `agentType: 'lean-citac'`, read-only labela koje uopce nema
 * (poziv bi mogao nestati ili promijeniti ime pa gard tiho ne bi vise nista pokrivao) i pisuca
 * faza koja bi greskom dobila read-only agenta (implementator bez alata za pisanje ne moze raditi).
 */
export function leanReadOnlyViolations(source: string): string[] {
  const calls = findRunAgentCalls(source);
  const problems: string[] = [];
  for (const label of LEAN_READ_ONLY_LABELS) {
    const matching = calls.filter((c) => c.label === label);
    if (matching.length === 0) problems.push(`nema runAgent poziva s labelom ${label}`);
    for (const c of matching) {
      if (c.agentType !== LEAN_READER_AGENT) problems.push(`${label} ide bez agentType '${LEAN_READER_AGENT}' (${c.agentType ?? 'nema'})`);
    }
  }
  for (const c of calls) {
    if (!(LEAN_READ_ONLY_LABELS as readonly string[]).includes(c.label) && c.agentType === LEAN_READER_AGENT) {
      problems.push(`${c.label} nije read-only faza, a dobiva ${LEAN_READER_AGENT}`);
    }
  }
  return problems;
}

/** Frontmatter agent definicije (`---` blok na vrhu) kao mapa kljuc -> vrijednost. */
export function parseAgentFrontmatter(markdown: string): Record<string, string> {
  const text = markdown.replace(/\r/g, '');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error('agent definicija nema frontmatter');
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) throw new Error(`neispravan redak frontmattera: "${line}"`);
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/** Sortiran popis alata iz frontmattera; prazan popis ili nedostatak kljuca je greska, ne "svi alati". */
export function agentTools(markdown: string): string[] {
  const fm = parseAgentFrontmatter(markdown);
  if (!fm.tools) throw new Error('agent definicija nema tools; bez njega agent nasljeduje SVE alate');
  const tools = fm.tools.split(',').map((t) => t.trim()).filter(Boolean);
  if (!tools.length) throw new Error('prazan popis tools');
  return tools.sort();
}
