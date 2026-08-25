import { MemoryDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import {
  sessionFragment,
  type LocalDocumentSessionV1,
} from '../../session/local-document-session';
import { mountRouteShell } from '../shared/route-shell';
import { renderWorkspaceShell } from '../workspace/workspace-shell';
import '../workspace/workspace.css';

type WorkspaceRuntimeModule = Pick<
  typeof import('../workspace/workspace-runtime'),
  'mountWorkspaceRuntime'
>;

export interface MemoryWorkspaceOptions {
  doc?: Document;
  isCurrent(): boolean;
  fetchWorkspace?: () => Promise<Pick<Response, 'ok' | 'text'>>;
  loadRuntime?: () => Promise<WorkspaceRuntimeModule>;
  createStore?: () => MemoryDocumentSessionStore;
}

interface WorkspaceShell {
  title: string;
  bodyNodes: Node[];
  bodyAttributes: Array<{ name: string; value: string }>;
  headNodes: Node[];
}

interface DocumentSnapshot {
  title: string;
  bodyNodes: Node[];
  bodyAttributes: Array<{ name: string; value: string }>;
  htmlAttributes: Array<{ name: string; value: string }>;
  activeElement: HTMLElement | null;
}

function attributesOf(element: Element): Array<{ name: string; value: string }> {
  return [...element.attributes].map(({ name, value }) => ({ name, value }));
}

function replaceAttributes(
  element: Element,
  attributes: Array<{ name: string; value: string }>,
): void {
  for (const attribute of [...element.attributes]) {
    element.removeAttribute(attribute.name);
  }
  for (const { name, value } of attributes) {
    element.setAttribute(name, value);
  }
}

function parseWorkspaceHtml(doc: Document, html: string): Document {
  const Parser = doc.defaultView?.DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(html, 'text/html');

  // Golden test setup namjerno podmeće XML-only @xmldom DOMParser. Za HTML shell tada koristi
  // nativni, inertni HTMLDocument parser ciljnog prozora; innerHTML ne izvršava fetched skripte.
  if (typeof parsed.querySelector === 'function' && parsed.head && parsed.body) return parsed;
  const fallback = doc.implementation.createHTMLDocument('');
  fallback.documentElement.innerHTML = html;
  return fallback;
}

function prepareWorkspaceShell(sourceDocument: Document, targetDocument: Document): WorkspaceShell {
  sourceDocument.querySelectorAll<HTMLScriptElement>('script').forEach((script) => script.remove());

  const bodyNodes = [...sourceDocument.body.childNodes]
    .map((node) => targetDocument.importNode(node, true));
  const bodyAttributes = attributesOf(sourceDocument.body);
  const headNodes = [...sourceDocument.head.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((node) => {
      const clone = targetDocument.importNode(node, true);
      if (clone instanceof HTMLElement) clone.dataset.memoryWorkspaceStyle = 'true';
      return clone;
    });

  return {
    title: sourceDocument.title.trim() || 'Korektorski stol | Lekta',
    bodyNodes,
    bodyAttributes,
    headNodes,
  };
}

function captureDocument(doc: Document): DocumentSnapshot {
  return {
    title: doc.title,
    bodyNodes: [...doc.body.childNodes],
    bodyAttributes: attributesOf(doc.body),
    htmlAttributes: attributesOf(doc.documentElement),
    activeElement: doc.activeElement instanceof HTMLElement ? doc.activeElement : null,
  };
}

function installWorkspaceShell(doc: Document, shell: WorkspaceShell): void {
  doc.head.append(...shell.headNodes);
  replaceAttributes(doc.body, shell.bodyAttributes);
  doc.body.replaceChildren(...shell.bodyNodes);
  doc.title = shell.title;
}

function restoreDocument(
  doc: Document,
  snapshot: DocumentSnapshot,
  insertedHeadNodes: Node[],
): void {
  for (const node of insertedHeadNodes) node.parentNode?.removeChild(node);
  replaceAttributes(doc.documentElement, snapshot.htmlAttributes);
  replaceAttributes(doc.body, snapshot.bodyAttributes);
  doc.body.replaceChildren(...snapshot.bodyNodes);
  doc.title = snapshot.title;
  snapshot.activeElement?.focus();
}

function addMemoryOnlyWarning(doc: Document): void {
  const warning = doc.createElement('aside');
  warning.className = 'workspace-tab-warning';
  warning.dataset.memoryWorkspaceWarning = 'true';
  warning.setAttribute('role', 'status');
  warning.textContent = 'Dokument je otvoren samo u ovom tabu. Osvježavanje ili zatvaranje stranice izgubit će ovu sesiju.';
  const main = doc.querySelector('main');
  if (main) main.prepend(warning);
  else doc.body.prepend(warning);
}

export async function mountMemoryWorkspace(
  session: LocalDocumentSessionV1,
  options: MemoryWorkspaceOptions,
): Promise<void> {
  const doc = options.doc ?? document;
  const fetchWorkspace = options.fetchWorkspace
    ?? (() => fetch('/rad/', { credentials: 'same-origin' }));
  const loadRuntime = options.loadRuntime
    ?? (() => import('../workspace/workspace-runtime'));
  const createStore = options.createStore ?? (() => new MemoryDocumentSessionStore());

  const [response, runtime] = await Promise.all([
    fetchWorkspace(),
    loadRuntime(),
  ]);
  if (!response.ok) throw new Error('Workspace shell nije dostupan.');

  const html = await response.text();
  const parsed = parseWorkspaceHtml(doc, html);
  if (!parsed.querySelector('#analyzer')) throw new Error('Workspace shell nije valjan.');

  const shell = prepareWorkspaceShell(parsed, doc);
  const memoryStore = createStore();
  await memoryStore.put(session);
  if (!options.isCurrent()) return;

  const snapshot = captureDocument(doc);
  let changedDocument = false;
  try {
    changedDocument = true;
    installWorkspaceShell(doc, shell);
    renderWorkspaceShell(doc);
    addMemoryOnlyWarning(doc);

    await runtime.mountWorkspaceRuntime(doc, {
      fragment: sessionFragment(session.id),
      store: memoryStore,
    });
    if (!options.isCurrent()) {
      restoreDocument(doc, snapshot, shell.headNodes);
      changedDocument = false;
      return;
    }

    mountRouteShell(doc, { current: 'workspace' });
  } catch (error) {
    if (changedDocument) restoreDocument(doc, snapshot, shell.headNodes);
    throw error;
  }
}
