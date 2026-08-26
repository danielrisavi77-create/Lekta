import { uploadCapBytes } from '../../repair/docx-budget';
import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import {
  createLocalDocumentSession,
  sessionFragment,
  type LocalDocumentSessionV1,
} from '../../session/local-document-session';
import { mountRouteShell } from '../shared/route-shell';
import { mountIntakeController } from './intake-controller';
import './intake.css';

const persistentStore = new IndexedDbDocumentSessionStore();
const intakeShellOptions = {
  current: 'intake',
  variant: 'intake',
  privacySettingsAvailable: false,
} as const;

const intakeHost = document.getElementById('intakeStage');
mountRouteShell(document, intakeShellOptions);
void persistentStore.list()
  .then(([summary]) => {
    if (!summary || !intakeHost?.isConnected) return;
    mountRouteShell(document, {
      ...intakeShellOptions,
      continuation: {
        href: `/rad/${sessionFragment(summary.id)}`,
        label: 'Nastavi trenutačni rad',
      },
    });
  })
  .catch(() => undefined);

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
