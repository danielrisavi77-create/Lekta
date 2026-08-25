import { uploadCapBytes } from '../../repair/docx-budget';
import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import {
  createLocalDocumentSession,
  type LocalDocumentSessionV1,
} from '../../session/local-document-session';
import { mountIntakeController } from './intake-controller';
import './intake.css';

const persistentStore = new IndexedDbDocumentSessionStore();

interface NavigatorWithDeviceMemory extends Navigator {
  readonly deviceMemory?: number;
}

function uploadLimitForCurrentDevice(): number {
  const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  return uploadCapBytes({ deviceMemory, coarsePointer });
}

function showUploadLimit(doc: Document, maxUploadBytes: number): void {
  const limit = Math.round(maxUploadBytes / (1024 * 1024));
  doc.querySelectorAll<HTMLElement>('[data-upload-limit]').forEach((element) => {
    element.textContent = `${limit} MB`;
  });
}

async function mountMemoryWorkspace(
  session: LocalDocumentSessionV1,
  options: { isCurrent(): boolean },
): Promise<void> {
  const memoryWorkspace = await import('./memory-workspace');
  await memoryWorkspace.mountMemoryWorkspace(session, {
    doc: document,
    isCurrent: options.isCurrent,
  });
}

const maxUploadBytes = uploadLimitForCurrentDevice();
showUploadLimit(document, maxUploadBytes);

mountIntakeController(document, {
  maxUploadBytes,
  async inspectFile(file) {
    const { inspectDocxIntake } = await import('../../docx/intake-gate');
    return inspectDocxIntake(file);
  },
  createSession: createLocalDocumentSession,
  persistentStore,
  navigate(path) {
    window.location.assign(path);
  },
  mountMemoryWorkspace,
});
