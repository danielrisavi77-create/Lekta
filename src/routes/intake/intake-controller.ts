import type { IntakeOk, IntakeVerdict } from '../../docx/intake-gate';
import {
  sessionFragment,
  type LocalDocumentSessionStore,
  type LocalDocumentSessionV1,
} from '../../session/local-document-session';

export interface IntakeControllerDependencies {
  maxUploadBytes: number;
  inspectFile(file: File): Promise<IntakeVerdict>;
  createSession(file: File, intake: IntakeOk): Promise<LocalDocumentSessionV1>;
  persistentStore: Pick<LocalDocumentSessionStore, 'put' | 'delete'>;
  navigate(path: string): void;
  mountMemoryWorkspace(
    session: LocalDocumentSessionV1,
    options: { isCurrent(): boolean },
  ): Promise<void>;
  transitionDelayMs?: number;
}

export interface IntakeController {
  selectFile(file: File): Promise<void>;
  destroy(): void;
}

interface IntakeElements {
  stage: HTMLElement;
  dropzone: HTMLElement;
  input: HTMLInputElement;
  fileName: HTMLElement;
  status: HTMLElement;
  error: HTMLElement;
  memoryAction: HTMLButtonElement;
}

function requiredElement<T extends HTMLElement>(doc: Document, id: string): T {
  const element = doc.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Nedostaje intake element #${id}.`);
  return element as T;
}

function intakeElements(doc: Document): IntakeElements {
  return {
    stage: requiredElement(doc, 'intakeStage'),
    dropzone: requiredElement(doc, 'intakeDropzone'),
    input: requiredElement<HTMLInputElement>(doc, 'intakeFile'),
    fileName: requiredElement(doc, 'intakeFileName'),
    status: requiredElement(doc, 'intakeStatus'),
    error: requiredElement(doc, 'intakeError'),
    memoryAction: requiredElement<HTMLButtonElement>(doc, 'intakeMemoryAction'),
  };
}

function storageErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${Math.round(megabytes)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function delay(milliseconds: number): Promise<void> {
  return milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

export function mountIntakeController(
  doc: Document,
  dependencies: IntakeControllerDependencies,
): IntakeController {
  const elements = intakeElements(doc);
  let selectionToken = 0;
  let pendingMemorySession: LocalDocumentSessionV1 | null = null;
  let memoryWorkspaceLoading = false;

  const setState = (state: string, statusText: string): void => {
    elements.stage.dataset.intakeState = state;
    elements.dropzone.setAttribute('aria-busy', state === 'checking' || state === 'saving' ? 'true' : 'false');
    elements.status.textContent = statusText;
  };

  const clearError = (): void => {
    elements.error.textContent = '';
    elements.error.hidden = true;
  };

  const showError = (message: string): void => {
    elements.stage.dataset.intakeState = 'error';
    elements.dropzone.setAttribute('aria-busy', 'false');
    elements.status.textContent = '';
    elements.error.textContent = message;
    elements.error.hidden = false;
  };

  const resetMemoryChoice = (): void => {
    pendingMemorySession = null;
    memoryWorkspaceLoading = false;
    elements.memoryAction.hidden = true;
    elements.memoryAction.disabled = false;
  };

  const selectFile = async (file: File): Promise<void> => {
    const token = ++selectionToken;
    resetMemoryChoice();
    clearError();
    elements.stage.classList.remove('intake-leaving');
    elements.fileName.textContent = file.name;

    if (!/\.docx$/i.test(file.name)) {
      showError('Odaberi Word dokument s nastavkom .docx.');
      return;
    }
    if (file.size > dependencies.maxUploadBytes) {
      showError(`Datoteka je prevelika. Najveća dopuštena veličina je ${formatBytes(dependencies.maxUploadBytes)}.`);
      return;
    }

    setState('checking', 'Provjeravam je li dokument siguran i spreman za lokalnu analizu.');
    let verdict: IntakeVerdict;
    try {
      verdict = await dependencies.inspectFile(file);
    } catch {
      if (token === selectionToken) {
        showError('Dokument trenutačno nije moguće provjeriti. Pokušaj ga ponovno odabrati.');
      }
      return;
    }
    if (token !== selectionToken) return;
    if (verdict.kind === 'reject') {
      showError(verdict.message);
      return;
    }

    let session: LocalDocumentSessionV1;
    try {
      session = await dependencies.createSession(file, verdict);
    } catch {
      if (token === selectionToken) {
        showError('Dokument nije moguće pripremiti za lokalni radni prostor.');
      }
      return;
    }
    if (token !== selectionToken) return;

    setState('saving', 'Spremam privatnu lokalnu sesiju u ovaj preglednik.');
    try {
      await dependencies.persistentStore.put(session);
    } catch (error) {
      if (token !== selectionToken) return;
      pendingMemorySession = session;
      const quota = storageErrorCode(error) === 'quota';
      showError(quota
        ? 'Preglednik nema dovoljno prostora za sigurnu lokalnu pohranu ovog dokumenta.'
        : 'Privatna lokalna pohrana preglednika nije dostupna.');
      elements.memoryAction.hidden = false;
      return;
    }
    if (token !== selectionToken) {
      try {
        await dependencies.persistentStore.delete(session.id);
      } catch {
        // Best effort: kasno spremljena napuštena sesija ne smije blokirati noviji odabir.
      }
      return;
    }

    clearError();
    setState('ready', 'Dokument je spreman. Otvaram korektorski stol.');
    elements.stage.classList.add('intake-leaving');
    await delay(dependencies.transitionDelayMs ?? 180);
    if (token === selectionToken) {
      dependencies.navigate(`/rad/${sessionFragment(session.id)}`);
    }
  };

  const openPicker = (): void => {
    elements.input.click();
  };

  const onDropzoneKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPicker();
  };

  const onInputChange = (): void => {
    const file = elements.input.files?.item(0);
    if (file) void selectFile(file);
    elements.input.value = '';
  };

  const onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    elements.dropzone.classList.add('is-dragging');
  };

  const onDragLeave = (event: DragEvent): void => {
    event.preventDefault();
    elements.dropzone.classList.remove('is-dragging');
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    elements.dropzone.classList.remove('is-dragging');
    const file = event.dataTransfer?.files[0];
    if (file) void selectFile(file);
  };

  const onMemoryAction = async (): Promise<void> => {
    if (!pendingMemorySession || memoryWorkspaceLoading) return;
    const session = pendingMemorySession;
    const token = selectionToken;
    memoryWorkspaceLoading = true;
    elements.memoryAction.disabled = true;
    elements.memoryAction.hidden = true;
    clearError();
    setState(
      'memory-only',
      'Nastavljaš samo u ovom tabu. Osvježavanje stranice izgubit će dokument.',
    );

    try {
      await dependencies.mountMemoryWorkspace(session, {
        isCurrent: () => token === selectionToken,
      });
      if (token !== selectionToken) return;
      pendingMemorySession = null;
    } catch {
      if (token !== selectionToken) return;
      memoryWorkspaceLoading = false;
      showError('Radni prostor nije moguće otvoriti. Dokument je i dalje samo na tvom uređaju.');
      elements.memoryAction.hidden = false;
      elements.memoryAction.disabled = false;
    }
  };

  elements.dropzone.addEventListener('click', openPicker);
  elements.dropzone.addEventListener('keydown', onDropzoneKeydown);
  elements.dropzone.addEventListener('dragover', onDragOver);
  elements.dropzone.addEventListener('dragleave', onDragLeave);
  elements.dropzone.addEventListener('drop', onDrop);
  elements.input.addEventListener('change', onInputChange);
  elements.memoryAction.addEventListener('click', onMemoryAction);

  return {
    selectFile,
    destroy(): void {
      selectionToken += 1;
      elements.dropzone.removeEventListener('click', openPicker);
      elements.dropzone.removeEventListener('keydown', onDropzoneKeydown);
      elements.dropzone.removeEventListener('dragover', onDragOver);
      elements.dropzone.removeEventListener('dragleave', onDragLeave);
      elements.dropzone.removeEventListener('drop', onDrop);
      elements.input.removeEventListener('change', onInputChange);
      elements.memoryAction.removeEventListener('click', onMemoryAction);
    },
  };
}
