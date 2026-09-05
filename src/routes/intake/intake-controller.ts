import type { IntakeOk, IntakeVerdict } from '../../docx/intake-gate';
import {
  sessionFragment,
  type LocalDocumentSessionStore,
  type LocalDocumentSessionV1,
} from '../../session/local-document-session';

/**
 * KONTROLER ULAZA na `/`: jedan dokument, lokalna provjera, zapis u IndexedDB, pa navigacija na
 * `/rad/#session=<uuid>`. Nista drugo. Portano s grane `feature/intake-first-live` (2026-08), gdje
 * je nosio 14 testova o utrkama i redoslijedu; ugovor je zadrzan, promijenjen je samo fallback.
 *
 * TRI UGOVORA KOJI SE NE SMIJU OLABAVITI:
 *
 * 1. NAVIGACIJA TEK NAKON USPJESNOG `put`. Poveznica na sesiju koja nije zapisana vodi u prazan
 *    zaslon; korisnik bi to dozivio kao izgubljen dokument. Zato se URL ne mijenja dok IndexedDB ne
 *    potvrdi zapis, a odbijen dokument OSTAJE na `/` s konkretnim razlogom.
 *
 * 2. UTRKE PO TOKENU. Sporiji stari odabir ne smije prebrisati noviji: svaki `selectFile` uzima nov
 *    token i svaki `await` ga ponovno provjerava. Kasno spremljena sesija napustenog odabira se
 *    brise, best-effort, i nikad ne blokira noviji dokument.
 *
 * 3. FALLBACK BEZ SPA HACKA. Grana je pri kvaru pohrane fetchala `/rad/`, brisala `<script>`ove i
 *    montirala radni prostor u istoj kartici (memory-workspace, 200 redaka). Plan to izricito
 *    odbacuje: degradirani slucaj ima jednostavan istinit odgovor. Ovdje se korisniku KAZE da
 *    pohrana nije dostupna i ponudi otvaranje `/rad/`, gdje dokument moze ubaciti ponovno i raditi
 *    u kartici bez spremanja. Dokument se ne prenosi kroz navigaciju: `File` ne prezivi
 *    `location.assign`, a lazno "nastavi" bez dokumenta bilo bi gore od iskrenog dodatnog klika.
 *
 * Ime datoteke ide iskljucivo kroz `textContent` (nikad HTML) i nikad se ne logira.
 */

export interface IntakeControllerDependencies {
  maxUploadBytes: number;
  inspectFile(file: File): Promise<IntakeVerdict>;
  createSession(file: File, intake: IntakeOk): Promise<LocalDocumentSessionV1>;
  persistentStore: Pick<LocalDocumentSessionStore, 'put' | 'delete'>;
  navigate(path: string): void;
  /** Koliko se ceka izmedju "spremno" i navigacije, da prijelaz bude vidljiv; testovi daju 0. */
  transitionDelayMs?: number;
}

export interface IntakeController {
  selectFile(file: File): Promise<void>;
  destroy(): void;
}

/** Odrediste kad pohrana ne radi: radna povrsina bez sesije, dokument se ubacuje ondje. */
export const WORKSPACE_WITHOUT_SESSION = '/rad/';

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
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mountIntakeController(
  doc: Document,
  dependencies: IntakeControllerDependencies,
): IntakeController {
  const elements = intakeElements(doc);
  let selectionToken = 0;
  let storageRefused = false;

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

  const resetStorageChoice = (): void => {
    storageRefused = false;
    elements.memoryAction.hidden = true;
    elements.memoryAction.disabled = false;
  };

  const selectFile = async (file: File): Promise<void> => {
    const token = ++selectionToken;
    resetStorageChoice();
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
      storageRefused = true;
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
        // Best effort: kasno spremljena napustena sesija ne smije blokirati noviji odabir.
      }
      return;
    }

    clearError();
    setState('ready', 'Dokument je spreman. Otvaram korektorski stol.');
    elements.stage.classList.add('intake-leaving');
    await delay(dependencies.transitionDelayMs ?? 180);
    if (token !== selectionToken) {
      try {
        await dependencies.persistentStore.delete(session.id);
      } catch {
        // Best effort: napustena spremljena sesija ne smije blokirati noviji odabir.
      }
      return;
    }
    dependencies.navigate(`/rad/${sessionFragment(session.id)}`);
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

  const onMemoryAction = (): void => {
    // Samo nakon sto je pohrana STVARNO odbila zapis, i samo za trenutni odabir: kasni klik iz
    // starog stanja ne smije nikamo voditi.
    if (!storageRefused) return;
    elements.memoryAction.disabled = true;
    setState('memory-only', 'Otvaram korektorski stol bez spremanja. Ubaci dokument ondje; radi u ovoj kartici.');
    dependencies.navigate(WORKSPACE_WITHOUT_SESSION);
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
      storageRefused = false;
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
