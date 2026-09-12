import { parse } from '@babel/parser';

export interface ReleaseLauncherSource {
  relativePath: string;
  source: string;
}

export interface ReleaseLauncherAudit {
  consumers: string[];
  unsafe: string[];
}

const releaseEntrypoint = 'run-local-repair-release.mts';

interface AstNode {
  type: string;
  start?: number | null;
  loc?: { start: { line: number } } | null;
  [key: string]: unknown;
}

interface Binding {
  name: string;
  init: AstNode | null;
  start: number;
  scope: Scope;
  immutable: boolean;
  nodePathJoin: boolean;
  nodePathResolve: boolean;
  nodePathDirname: boolean;
  nodeUrlFileURLToPath: boolean;
  nodeProcess: boolean;
  nodeChildSpawnSync: boolean;
  processExecutableAlias: boolean;
  ambiguous: boolean;
}

type ScopeKind = 'program' | 'function' | 'block';

interface Scope {
  parent: Scope | null;
  bindings: Binding[];
  kind: ScopeKind;
}

interface CallSite {
  node: AstNode;
  scope: Scope;
}

interface WriteSite {
  name: string;
  scope: Scope;
  start: number;
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null &&
    typeof (value as { type?: unknown }).type === 'string';
}

function childNodes(value: unknown): AstNode[] {
  if (Array.isArray(value)) {
    return value.flatMap(childNodes);
  }
  return isAstNode(value) ? [value] : [];
}

function createdScopeKind(node: AstNode): ScopeKind | null {
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'ObjectMethod' ||
    node.type === 'ClassMethod' ||
    node.type === 'ClassPrivateMethod'
  ) {
    return 'function';
  }
  return node.type === 'BlockStatement' ||
      node.type === 'CatchClause' ||
      node.type === 'ForStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement'
    ? 'block'
    : null;
}

function variableScope(scope: Scope, declarationKind: unknown): Scope {
  if (declarationKind !== 'var') return scope;
  let current = scope;
  while (current.kind === 'block' && current.parent) current = current.parent;
  return current;
}

function bindingIdentifiers(node: AstNode): AstNode[] {
  if (node.type === 'Identifier') {
    return [node];
  }
  if (node.type === 'AssignmentPattern' && isAstNode(node.left)) {
    return bindingIdentifiers(node.left);
  }
  if (node.type === 'RestElement' && isAstNode(node.argument)) {
    return bindingIdentifiers(node.argument);
  }
  if (node.type === 'TSParameterProperty' && isAstNode(node.parameter)) {
    return bindingIdentifiers(node.parameter);
  }
  if (
    (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression' ||
      node.type === 'TSTypeAssertion' || node.type === 'TypeCastExpression' ||
      node.type === 'ParenthesizedExpression') && isAstNode(node.expression)
  ) {
    return bindingIdentifiers(node.expression);
  }
  if (node.type === 'ObjectPattern' && Array.isArray(node.properties)) {
    return node.properties.filter(isAstNode).flatMap((property) => {
      if (property.type === 'ObjectProperty' && isAstNode(property.value)) {
        return bindingIdentifiers(property.value);
      }
      return bindingIdentifiers(property);
    });
  }
  if (node.type === 'ArrayPattern' && Array.isArray(node.elements)) {
    return node.elements.filter(isAstNode).flatMap(bindingIdentifiers);
  }
  return [];
}

function destructuredProcessExecutableIds(
  id: AstNode, init: AstNode | null, scope: Scope, useIndex: number,
): Set<AstNode> {
  const ids = new Set<AstNode>();
  if (
    id.type !== 'ObjectPattern' ||
    !init || !isProcessObject(init, scope, useIndex, new Set()) ||
    !Array.isArray(id.properties)
  ) {
    return ids;
  }
  for (const property of id.properties.filter(isAstNode)) {
    if (property.type !== 'ObjectProperty' || !isAstNode(property.key) || !isAstNode(property.value)) {
      continue;
    }
    const execPathKey =
      (property.computed === false && property.key.type === 'Identifier' &&
        property.key.name === 'execPath') ||
      (property.key.type === 'StringLiteral' && property.key.value === 'execPath');
    if (execPathKey) bindingIdentifiers(property.value).forEach((item) => ids.add(item));
  }
  return ids;
}

function addBinding(
  scope: Scope,
  id: AstNode,
  init: AstNode | null,
  start: number,
  immutable: boolean,
  nodePathJoin = false,
  nodeProcess = false,
  nodeChildSpawnSync = false,
  nodePathResolve = false,
  nodePathDirname = false,
  nodeUrlFileURLToPath = false,
): void {
  if (id.type === 'Identifier' && typeof id.name === 'string') {
    const duplicates = scope.bindings.filter((binding) => binding.name === id.name);
    for (const duplicate of duplicates) {
      duplicate.ambiguous = true;
    }
    scope.bindings.push({
      name: id.name,
      init,
      start,
      scope,
      immutable,
      nodePathJoin,
      nodePathResolve,
      nodePathDirname,
      nodeUrlFileURLToPath,
      nodeProcess,
      nodeChildSpawnSync,
      processExecutableAlias: false,
      ambiguous: duplicates.length > 0,
    });
  }
}

function walkAst(
  node: AstNode,
  parentScope: Scope,
  calls: CallSite[],
  writes: WriteSite[],
  parent: AstNode | null,
): void {
  const start = node.start ?? 0;
  if (
    (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
    isAstNode(node.id)
  ) {
    for (const id of bindingIdentifiers(node.id)) {
      addBinding(
        parentScope,
        id,
        node.type === 'FunctionDeclaration' ? node : null,
        start,
        node.type === 'FunctionDeclaration',
      );
    }
  }
  const scopeKind = createdScopeKind(node);
  const scope = scopeKind
    ? { parent: parentScope, bindings: [], kind: scopeKind }
    : parentScope;

  if (node.type === 'FunctionExpression' && isAstNode(node.id)) {
    for (const id of bindingIdentifiers(node.id)) {
      addBinding(scope, id, node, start, false);
    }
  }

  if (
    node.type === 'VariableDeclarator' &&
    isAstNode(node.id)
  ) {
    const directIdentifier = node.id.type === 'Identifier';
    const declarationKind = parent?.type === 'VariableDeclaration' ? parent.kind : null;
    const immutable = declarationKind === 'const';
    const targetScope = variableScope(scope, declarationKind);
    const executableAliases = destructuredProcessExecutableIds(
      node.id, isAstNode(node.init) ? node.init : null, scope, start);
    for (const id of bindingIdentifiers(node.id)) {
      addBinding(
        targetScope,
        id,
        directIdentifier && isAstNode(node.init) ? node.init : null,
        start,
        immutable && directIdentifier,
      );
      const added = targetScope.bindings.at(-1);
      if (added?.name === id.name && executableAliases.has(id)) {
        added.processExecutableAlias = true;
      }
    }
  }
  if (
    (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' || node.type === 'ObjectMethod' ||
      node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod') &&
    Array.isArray(node.params)
  ) {
    for (const parameter of node.params.filter(isAstNode)) {
      for (const id of bindingIdentifiers(parameter)) {
        addBinding(scope, id, null, start, false);
      }
    }
  }
  if (node.type === 'CatchClause' && isAstNode(node.param)) {
    for (const id of bindingIdentifiers(node.param)) {
      addBinding(scope, id, null, start, false);
    }
  }
  const writeTarget =
    node.type === 'AssignmentExpression'
      ? node.left
      : node.type === 'UpdateExpression'
        ? node.argument
        : (node.type === 'ForInStatement' || node.type === 'ForOfStatement') &&
            (!isAstNode(node.left) || node.left.type !== 'VariableDeclaration')
          ? node.left
          : null;
  if (isAstNode(writeTarget)) {
    for (const id of bindingIdentifiers(writeTarget)) {
      if (typeof id.name === 'string') {
        writes.push({ name: id.name, scope, start });
      }
    }
  }
  if (
    node.type === 'ImportDeclaration' &&
    isAstNode(node.source) &&
    Array.isArray(node.specifiers)
  ) {
    const valueDeclaration = node.importKind !== 'type';
    const fromNodePath = node.source.type === 'StringLiteral' && node.source.value === 'node:path';
    const fromNodeUrl = node.source.type === 'StringLiteral' && node.source.value === 'node:url';
    const fromNodeProcess = node.source.type === 'StringLiteral' && node.source.value === 'node:process';
    const fromNodeChildProcess = node.source.type === 'StringLiteral' &&
      node.source.value === 'node:child_process';
    for (const specifier of node.specifiers.filter(isAstNode)) {
      if (!isAstNode(specifier.local)) {
        continue;
      }
      const valueSpecifier = valueDeclaration && specifier.importKind !== 'type';
      const importedName = isAstNode(specifier.imported) && specifier.imported.type === 'Identifier'
        ? specifier.imported.name
        : null;
      const importedJoin = valueSpecifier && fromNodePath && specifier.type === 'ImportSpecifier' &&
        importedName === 'join';
      const importedResolve = valueSpecifier && fromNodePath &&
        specifier.type === 'ImportSpecifier' && importedName === 'resolve';
      const importedDirname = valueSpecifier && fromNodePath &&
        specifier.type === 'ImportSpecifier' && importedName === 'dirname';
      const importedFileURLToPath = valueSpecifier && fromNodeUrl &&
        specifier.type === 'ImportSpecifier' && importedName === 'fileURLToPath';
      const importedProcess = valueSpecifier && fromNodeProcess &&
        (specifier.type === 'ImportDefaultSpecifier' || specifier.type === 'ImportNamespaceSpecifier');
      const importedExecPath = valueSpecifier && fromNodeProcess &&
        specifier.type === 'ImportSpecifier' && importedName === 'execPath';
      const importedSpawnSync = valueSpecifier && fromNodeChildProcess &&
        specifier.type === 'ImportSpecifier' && importedName === 'spawnSync';
      addBinding(
        scope, specifier.local, null, start, true, importedJoin, importedProcess, importedSpawnSync,
        importedResolve, importedDirname, importedFileURLToPath);
      const added = scope.bindings.at(-1);
      if (added?.name === specifier.local.name && importedExecPath) {
        added.processExecutableAlias = true;
      }
    }
  }
  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    calls.push({ node, scope });
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') {
      continue;
    }
    for (const child of childNodes(value)) {
      walkAst(child, scope, calls, writes, node);
    }
  }
}

function parseSource(source: string): CallSite[] {
  const rootScope: Scope = { parent: null, bindings: [], kind: 'program' };
  const calls: CallSite[] = [];
  const writes: WriteSite[] = [];
  const file = parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx'],
  });
  walkAst(file.program as unknown as AstNode, rootScope, calls, writes, null);
  for (const write of writes) {
    const binding = findBinding(write.name, write.scope, write.start);
    if (binding) {
      binding.immutable = false;
    }
  }
  return calls;
}

function findBinding(name: string, scope: Scope, useIndex: number): Binding | null {
  let current: Scope | null = scope;
  while (current) {
    const matches = current.bindings.filter((binding) => binding.name === name);
    if (matches.length > 0) {
      return matches
        .filter((binding) => binding.start <= useIndex)
        .sort((left, right) => right.start - left.start)[0] ??
        matches.sort((left, right) => left.start - right.start)[0] ?? null;
    }
    current = current.parent;
  }
  return null;
}

function identifierBinding(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  seen: Set<Binding>,
): Binding | null {
  if (node.type !== 'Identifier' || typeof node.name !== 'string') {
    return null;
  }
  const binding = findBinding(node.name, scope, useIndex);
  if (!binding || seen.has(binding)) {
    return null;
  }
  seen.add(binding);
  return binding;
}

function exactImmutableBinding(binding: Binding | null, useIndex: number): binding is Binding {
  return binding !== null &&
    binding.immutable &&
    !binding.ambiguous &&
    binding.start <= useIndex &&
    binding.init !== null;
}

type TrustedCallBinding =
  'nodePathJoin' | 'nodePathResolve' | 'nodePathDirname' | 'nodeUrlFileURLToPath';

function trustedCallArguments(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  trustedBinding: TrustedCallBinding,
): AstNode[] | null {
  if (node.type !== 'CallExpression' || !isAstNode(node.callee) || node.callee.type !== 'Identifier') {
    return null;
  }
  const binding = findBinding(String(node.callee.name), scope, useIndex);
  return binding?.[trustedBinding] === true && !binding.ambiguous && binding.start <= useIndex
    ? childNodes(node.arguments)
    : null;
}

function isImportMetaMember(node: AstNode, propertyName: string): boolean {
  return node.type === 'MemberExpression' && node.computed === false &&
    isAstNode(node.object) && node.object.type === 'MetaProperty' &&
    isAstNode(node.object.meta) && node.object.meta.type === 'Identifier' &&
    node.object.meta.name === 'import' &&
    isAstNode(node.object.property) && node.object.property.type === 'Identifier' &&
    node.object.property.name === 'meta' &&
    isAstNode(node.property) && node.property.type === 'Identifier' &&
    node.property.name === propertyName;
}

function isDirnameOfImportMetaUrl(node: AstNode, scope: Scope, useIndex: number): boolean {
  const dirnameArgs = trustedCallArguments(node, scope, useIndex, 'nodePathDirname');
  if (!dirnameArgs || dirnameArgs.length !== 1) {
    return false;
  }
  const fileUrlArgs = trustedCallArguments(
    dirnameArgs[0], scope, useIndex, 'nodeUrlFileURLToPath');
  return fileUrlArgs?.length === 1 && isImportMetaMember(fileUrlArgs[0], 'url');
}

function isTrustedRepositoryRoot(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  repositoryDepth: number,
  seen = new Set<Binding>(),
): boolean {
  const binding = identifierBinding(node, scope, useIndex, seen);
  if (exactImmutableBinding(binding, useIndex)) {
    return isTrustedRepositoryRoot(
      binding.init, binding.scope, binding.start, repositoryDepth, seen);
  }
  const directBase = isImportMetaMember(node, 'dirname') ||
    isDirnameOfImportMetaUrl(node, scope, useIndex);
  if (repositoryDepth === 0) {
    return directBase;
  }
  const args = trustedCallArguments(node, scope, useIndex, 'nodePathJoin') ??
    trustedCallArguments(node, scope, useIndex, 'nodePathResolve');
  return args?.length === repositoryDepth + 1 &&
    args.slice(1).every((argument) => isStringLiteral(argument, '..')) &&
    (isImportMetaMember(args[0], 'dirname') ||
      isDirnameOfImportMetaUrl(args[0], scope, useIndex));
}

function isNodePathJoinCall(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  segments: readonly string[],
  repositoryDepth: number,
): boolean {
  if (node.type !== 'CallExpression' || !isAstNode(node.callee) || node.callee.type !== 'Identifier') {
    return false;
  }
  const args = trustedCallArguments(node, scope, useIndex, 'nodePathJoin');
  return args !== null && args.length === segments.length + 1 &&
    isTrustedRepositoryRoot(args[0], scope, useIndex, repositoryDepth) &&
    segments.every((segment, index) => isStringLiteral(args[index + 1], segment));
}

function isStringLiteral(node: AstNode, value: string): boolean {
  return node.type === 'StringLiteral' && node.value === value;
}

function referencesRelease(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  seen = new Set<Binding>(),
): boolean {
  if (
    node.type === 'StringLiteral' &&
    typeof node.value === 'string' &&
    node.value.includes(releaseEntrypoint)
  ) {
    return true;
  }
  if (node.type === 'TemplateElement' && typeof node.value === 'object' && node.value !== null) {
    const template = node.value as { cooked?: unknown; raw?: unknown };
    const cooked = typeof template.cooked === 'string' ? template.cooked : '';
    const raw = typeof template.raw === 'string' ? template.raw : '';
    return cooked.includes(releaseEntrypoint) || raw.includes(releaseEntrypoint);
  }
  const binding = identifierBinding(node, scope, useIndex, seen);
  if (binding) {
    return binding.init
      ? referencesRelease(binding.init, binding.scope, binding.start, seen)
      : false;
  }
  if (node.type === 'Identifier') {
    return false;
  }
  return Object.entries(node).some(([key, value]) =>
    key !== 'loc' && key !== 'start' && key !== 'end' && key !== 'extra' &&
    childNodes(value).some((child) => referencesRelease(child, scope, useIndex, new Set(seen)))
  );
}

function isProcessObject(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  seen: Set<Binding>,
): boolean {
  if (node.type === 'Identifier' && node.name === 'process') {
    return true;
  }
  const binding = identifierBinding(node, scope, useIndex, seen);
  if (binding?.nodeProcess) {
    return true;
  }
  return binding?.init
    ? isProcessObject(binding.init, binding.scope, binding.start, seen)
    : false;
}

function isProcessExecutableCandidate(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  seen = new Set<Binding>(),
): boolean {
  if (
    (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
    isAstNode(node.object) && isAstNode(node.property)
  ) {
    const execPathProperty = node.computed === false
      ? node.property.type === 'Identifier' && node.property.name === 'execPath'
      : node.property.type === 'StringLiteral' && node.property.value === 'execPath';
    if (execPathProperty && isProcessObject(node.object, scope, useIndex, seen)) {
      return true;
    }
  }
  const binding = identifierBinding(node, scope, useIndex, seen);
  if (binding?.processExecutableAlias) {
    return true;
  }
  if (binding?.init) {
    return isProcessExecutableCandidate(binding.init, binding.scope, binding.start, seen);
  }
  return Object.entries(node).some(([key, value]) =>
    key !== 'loc' && key !== 'start' && key !== 'end' && key !== 'extra' &&
    childNodes(value).some((child) =>
      isProcessExecutableCandidate(child, scope, useIndex, new Set(seen)))
  );
}

function isUnshadowedProcessExecutable(
  node: AstNode,
  scope: Scope,
  useIndex: number,
): boolean {
  return (
    node.type === 'MemberExpression' &&
    node.computed === false &&
    isAstNode(node.object) && node.object.type === 'Identifier' && node.object.name === 'process' &&
    isAstNode(node.property) && node.property.type === 'Identifier' && node.property.name === 'execPath'
    && (() => {
      const binding = findBinding('process', scope, useIndex);
      return binding === null ||
        (binding.nodeProcess && !binding.ambiguous && binding.start <= useIndex);
    })()
  );
}

function resolveArray(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  seen = new Set<Binding>(),
): { node: AstNode; scope: Scope; useIndex: number } | null {
  if (node.type === 'ArrayExpression') {
    return { node, scope, useIndex };
  }
  const binding = identifierBinding(node, scope, useIndex, seen);
  return exactImmutableBinding(binding, useIndex)
    ? resolveArray(binding.init, binding.scope, binding.start, seen)
    : null;
}

function isCanonicalTsx(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  repositoryDepth: number,
  seen = new Set<Binding>(),
): boolean {
  const binding = identifierBinding(node, scope, useIndex, seen);
  if (exactImmutableBinding(binding, useIndex)) {
    return isCanonicalTsx(
      binding.init, binding.scope, binding.start, repositoryDepth, seen);
  }
  return isNodePathJoinCall(
    node, scope, useIndex, ['node_modules', 'tsx', 'dist', 'cli.mjs'], repositoryDepth);
}

function isCanonicalRelease(
  node: AstNode,
  scope: Scope,
  useIndex: number,
  repositoryDepth: number,
  seen = new Set<Binding>(),
): boolean {
  const binding = identifierBinding(node, scope, useIndex, seen);
  if (exactImmutableBinding(binding, useIndex)) {
    return isCanonicalRelease(
      binding.init, binding.scope, binding.start, repositoryDepth, seen);
  }
  return isNodePathJoinCall(
    node, scope, useIndex, ['scripts', releaseEntrypoint], repositoryDepth);
}

function repositoryDepth(relativePath: string): number {
  const segments = relativePath.replaceAll('\\', '/').split('/').filter(Boolean);
  return Math.max(0, segments.length - 1);
}

function callArguments(node: AstNode): AstNode[] {
  return childNodes(node.arguments);
}

function callLine(node: AstNode, source: string): number {
  return node.loc?.start.line ?? source.slice(0, node.start ?? 0).split(/\r?\n/).length;
}

function isReleaseLaunch(call: CallSite): boolean {
  const args = callArguments(call.node);
  const useIndex = call.node.start ?? 0;
  return args.length >= 2 &&
    isProcessExecutableCandidate(args[0], call.scope, useIndex) &&
    referencesRelease(args[1], call.scope, useIndex);
}

function isTrustedLauncherCallee(
  callee: AstNode,
  scope: Scope,
  useIndex: number,
  relativePath: string,
): boolean {
  if (callee.type !== 'Identifier' || typeof callee.name !== 'string') {
    return false;
  }
  const binding = findBinding(callee.name, scope, useIndex);
  if (callee.name === 'spawnSync') {
    return binding?.nodeChildSpawnSync === true &&
      binding.immutable && !binding.ambiguous && binding.start <= useIndex;
  }
  if (callee.name !== 'runCaptured' || relativePath !== 'scripts/run-repair-runner-e2e.mts') {
    return false;
  }
  return binding !== null &&
    binding.immutable &&
    !binding.ambiguous &&
    binding.start <= useIndex &&
    binding.scope.parent === null &&
    binding.init?.type === 'FunctionDeclaration';
}

function isSafeReleaseLaunch(call: CallSite, relativePath: string): boolean {
  if (call.node.type !== 'CallExpression') {
    return false;
  }
  const callee = call.node.callee;
  if (
    !isAstNode(callee) ||
    !isTrustedLauncherCallee(callee, call.scope, call.node.start ?? 0, relativePath)
  ) {
    return false;
  }
  const args = callArguments(call.node);
  const useIndex = call.node.start ?? 0;
  if (args.length < 2 || !isUnshadowedProcessExecutable(args[0], call.scope, useIndex)) {
    return false;
  }
  const array = resolveArray(args[1], call.scope, useIndex);
  if (!array || !Array.isArray(array.node.elements)) {
    return false;
  }
  const first = array.node.elements[0];
  const second = array.node.elements[1];
  const rootDepth = repositoryDepth(relativePath);
  return isAstNode(first) && isAstNode(second) &&
    isCanonicalTsx(first, array.scope, array.useIndex, rootDepth) &&
    isCanonicalRelease(second, array.scope, array.useIndex, rootDepth);
}

export function auditReleaseLaunchers(
  sources: readonly ReleaseLauncherSource[],
): ReleaseLauncherAudit {
  const consumers = new Set<string>();
  const unsafe = new Set<string>();

  for (const item of sources) {
    if (!item.source.includes(releaseEntrypoint)) {
      continue;
    }
    let calls: CallSite[];
    try {
      calls = parseSource(item.source);
    } catch {
      consumers.add(item.relativePath);
      unsafe.add(`${item.relativePath}:parse-error`);
      continue;
    }
    const launches = calls.filter(isReleaseLaunch);
    if (launches.length === 0) {
      continue;
    }
    consumers.add(item.relativePath);
    for (const launch of launches) {
      if (!isSafeReleaseLaunch(launch, item.relativePath)) {
        unsafe.add(`${item.relativePath}:${callLine(launch.node, item.source)}`);
      }
    }
  }

  return {
    consumers: [...consumers].sort(),
    unsafe: [...unsafe].sort(),
  };
}
