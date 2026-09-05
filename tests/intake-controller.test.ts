// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeOk, IntakeVerdict } from '../src/docx/intake-gate';
import {
  mountIntakeController,
  WORKSPACE_WITHOUT_SESSION,
  type IntakeControllerDependencies,
} from '../src/routes/intake/intake-controller';
import { LocalDocumentSessionStoreError } from '../src/session/indexeddb-document-session-store';
import type { LocalDocumentSessionV1 } from '../src/session/local-document-session';

/**
 * KONTROLER ULAZA na `/`. Portano s grane `feature/intake-first-live` zajedno s kontrolerom; ugovor
 * o utrkama i redoslijedu je isti, promijenjen je samo fallback bez pohrane (vidi kontroler).
 *
 * Najvaznija tvrdnja je "ne navigira dok IndexedDB put nije dovrsen": poveznica na sesiju koje
 * nema izgleda kao izgubljen dokument.
 */

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const SECOND_SESSION_ID = '223e4567-e89b-42d3-a456-426614174001';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const accepted: IntakeOk = {
  kind: 'ok',
  quickStats: null,
  suspicious: false,
  suspicionReason: null,
  capability: {
    canAnalyze: true,
    canRepair: true,
    totalDeclaredBytes: 64,
    entryCount: 4,
    repairBlocker: null,
  },
};

function renderFixture(): void {
  document.body.innerHTML = `
    <main id="intakeStage" data-intake-state="idle">
      <button id="intakeDropzone" type="button">Odaberi .docx</button>
      <input id="intakeFile" type="file" accept=".docx" hidden>
      <strong id="intakeFileName"></strong>
      <p id="intakeStatus" aria-live="polite"></p>
      <p id="intakeError" role="alert" hidden></p>
      <button id="intakeMemoryAction" type="button" hidden>Otvori stol bez spremanja</button>
    </main>
  `;
}

function makeFile(name = 'diplomski-rad.docx', size = 64): File {
  return new File([new Uint8Array(size)], name, { type: DOCX_TYPE, lastModified: 1_000 });
}

function sessionFor(file: File, id = SESSION_ID): LocalDocumentSessionV1 {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id,
    createdAt: now,
    expiresAt: now + 86_400_000,
    document: { name: file.name, type: file.type, lastModified: file.lastModified, bytes: new Uint8Array([80, 75, 3, 4]).buffer },
    intake: accepted,
  };
}

function dependencies(overrides: Partial<IntakeControllerDependencies> = {}): IntakeControllerDependencies {
  return {
    maxUploadBytes: 128,
    inspectFile: vi.fn(async (): Promise<IntakeVerdict> => accepted),
    createSession: vi.fn(async (file: File) => sessionFor(file)),
    persistentStore: { put: vi.fn(async () => undefined), delete: vi.fn(async () => undefined) },
    navigate: vi.fn(),
    transitionDelayMs: 0,
    ...overrides,
  };
}

const storageFailure = (code: 'quota' | 'unavailable') => ({
  put: vi.fn(async () => { throw new LocalDocumentSessionStoreError(code, 'Pohrana nije dostupna.'); }),
  delete: vi.fn(async () => undefined),
});

beforeEach(() => { renderFixture(); });

describe('intake controller', () => {
  it('otvara file picker klikom te tipkama Enter i Space', () => {
    const deps = dependencies();
    const controller = mountIntakeController(document, deps);
    const input = document.querySelector<HTMLInputElement>('#intakeFile')!;
    const open = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    const dropzone = document.querySelector<HTMLElement>('#intakeDropzone')!;

    dropzone.click();
    dropzone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    dropzone.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(open).toHaveBeenCalledTimes(3);
    controller.destroy();
  });

  it('drag and drop prolazi isti tok i navigira samo na kanonski session fragment', async () => {
    const deps = dependencies();
    mountIntakeController(document, deps);
    const dropped = makeFile();
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [dropped] } });

    document.querySelector<HTMLElement>('#intakeDropzone')!.dispatchEvent(event);
    await vi.waitFor(() => { expect(deps.navigate).toHaveBeenCalledWith(`/rad/#session=${SESSION_ID}`); });

    expect(deps.inspectFile).toHaveBeenCalledWith(dropped);
    expect(deps.persistentStore.put).toHaveBeenCalledOnce();
  });

  it('odbija krivu ekstenziju i preveliku datoteku prije intake inspekcije', async () => {
    const deps = dependencies();
    const controller = mountIntakeController(document, deps);

    await controller.selectFile(makeFile('rad.pdf'));
    expect(document.querySelector('#intakeError')?.textContent).toMatch(/\.docx/i);

    await controller.selectFile(makeFile('prevelik.docx', 129));
    expect(document.querySelector('#intakeError')?.textContent).toMatch(/velik|MB/i);
    expect(deps.inspectFile).not.toHaveBeenCalled();
    expect(deps.persistentStore.put).not.toHaveBeenCalled();
  });

  it('intake reject ostaje na ulazu i ne stvara niti sprema sesiju', async () => {
    const deps = dependencies({
      inspectFile: vi.fn(async () => ({ kind: 'reject', code: 'not-zip', message: 'Datoteka nije pravi .docx dokument.' })),
    });
    const controller = mountIntakeController(document, deps);

    await controller.selectFile(makeFile());

    expect(document.querySelector('#intakeError')?.textContent).toContain('nije pravi');
    expect(deps.createSession).not.toHaveBeenCalled();
    expect(deps.persistentStore.put).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('ne navigira dok IndexedDB put nije uspješno dovrsen', async () => {
    let release!: () => void;
    const pendingPut = new Promise<void>((resolve) => { release = resolve; });
    const deps = dependencies({ persistentStore: { put: vi.fn(() => pendingPut), delete: vi.fn(async () => undefined) } });
    const controller = mountIntakeController(document, deps);

    const selection = controller.selectFile(makeFile());
    await vi.waitFor(() => expect(deps.persistentStore.put).toHaveBeenCalledOnce());
    expect(deps.navigate).not.toHaveBeenCalled();

    release();
    await selection;
    expect(deps.navigate).toHaveBeenCalledWith(`/rad/#session=${SESSION_ID}`);
  });

  it('quota kvar nudi iskren, eksplicitan nastavak, a ne navigira sam', async () => {
    const deps = dependencies({ persistentStore: storageFailure('quota') });
    const controller = mountIntakeController(document, deps);

    await controller.selectFile(makeFile());

    const action = document.querySelector<HTMLButtonElement>('#intakeMemoryAction')!;
    expect(action.hidden).toBe(false);
    expect(document.querySelector('#intakeError')?.textContent).toMatch(/prostora|pohran/i);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('nastavak bez pohrane vodi na radnu povrsinu BEZ sesije, tek nakon klika, i kaze da radi u kartici', async () => {
    // Fallback bez SPA hacka: nema fetchanja /rad/ ni brisanja skripti. Korisnik dobije istinit
    // opis (dokument se ubacuje ondje, radi u ovoj kartici) i tek na klik odlazi.
    const deps = dependencies({ persistentStore: storageFailure('unavailable') });
    const controller = mountIntakeController(document, deps);
    await controller.selectFile(makeFile());

    expect(deps.navigate).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('#intakeMemoryAction')!.click();

    expect(deps.navigate).toHaveBeenCalledOnce();
    expect(deps.navigate).toHaveBeenCalledWith(WORKSPACE_WITHOUT_SESSION);
    expect(deps.navigate).not.toHaveBeenCalledWith(expect.stringContaining('#session='));
    expect(document.querySelector('#intakeStatus')?.textContent).toMatch(/kartic/i);
  });

  it('nastavak bez pohrane NE radi kad pohrana nije odbila zapis', async () => {
    // Gumb je skriven, ali i kad bi ga netko kliknuo (npr. kroz pristupacnost), bez odbijene pohrane
    // nema kamo: navigacija bez razloga bi korisnika odvela s dokumenta koji se upravo sprema.
    const deps = dependencies();
    mountIntakeController(document, deps);
    document.querySelector<HTMLButtonElement>('#intakeMemoryAction')!.click();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('ime datoteke prikazuje samo kao tekst, bez HTML-a i bez logiranja', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const deps = dependencies();
    const controller = mountIntakeController(document, deps);
    const name = '<img src=x onerror=alert(1)>.docx';

    await controller.selectFile(makeFile(name));

    expect(document.querySelector('#intakeFileName')?.textContent).toBe(name);
    expect(document.querySelector('#intakeFileName img')).toBeNull();
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    log.mockRestore();
    info.mockRestore();
  });

  it('sporiji stari odabir ne može prebrisati noviji dokument', async () => {
    let releaseFirst!: (verdict: IntakeVerdict) => void;
    const firstVerdict = new Promise<IntakeVerdict>((resolve) => { releaseFirst = resolve; });
    const inspectFile = vi.fn((file: File): Promise<IntakeVerdict> => (
      file.name === 'prvi.docx' ? firstVerdict : Promise.resolve(accepted)
    ));
    const deps = dependencies({ inspectFile });
    const controller = mountIntakeController(document, deps);

    const first = controller.selectFile(makeFile('prvi.docx'));
    await controller.selectFile(makeFile('drugi.docx'));
    releaseFirst(accepted);
    await first;

    expect(deps.createSession).toHaveBeenCalledOnce();
    expect(deps.createSession).toHaveBeenCalledWith(expect.objectContaining({ name: 'drugi.docx' }), accepted);
    expect(deps.navigate).toHaveBeenCalledTimes(1);
  });

  it('briše kasno spremljenu sesiju starog odabira bez diranja novijeg dokumenta', async () => {
    let releaseFirstPut!: () => void;
    const firstPut = new Promise<void>((resolve) => { releaseFirstPut = resolve; });
    const persistentStore = {
      put: vi.fn((storedSession: LocalDocumentSessionV1) => (storedSession.id === SESSION_ID ? firstPut : Promise.resolve())),
      delete: vi.fn(async () => undefined),
    };
    const deps = dependencies({
      createSession: vi.fn(async (file: File) => sessionFor(file, file.name === 'prvi.docx' ? SESSION_ID : SECOND_SESSION_ID)),
      persistentStore,
    });
    const controller = mountIntakeController(document, deps);

    const first = controller.selectFile(makeFile('prvi.docx'));
    await vi.waitFor(() => expect(persistentStore.put).toHaveBeenCalledOnce());
    await controller.selectFile(makeFile('drugi.docx'));
    releaseFirstPut();
    await first;

    expect(persistentStore.delete).toHaveBeenCalledWith(SESSION_ID);
    expect(persistentStore.delete).not.toHaveBeenCalledWith(SECOND_SESSION_ID);
    expect(deps.navigate).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith(`/rad/#session=${SECOND_SESSION_ID}`);
  });

  it('brise spremljenu sesiju kada novi odabir zastari prijelaz od 180 ms', async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies({ transitionDelayMs: 180 });
      const controller = mountIntakeController(document, deps);

      const selection = controller.selectFile(makeFile('prvi.docx'));
      await vi.advanceTimersByTimeAsync(0);
      expect(deps.persistentStore.put).toHaveBeenCalledOnce();
      expect(document.querySelector<HTMLElement>('#intakeStage')?.dataset.intakeState).toBe('ready');

      await controller.selectFile(makeFile('novi.pdf'));
      await vi.advanceTimersByTimeAsync(180);
      await selection;

      expect(deps.persistentStore.delete).toHaveBeenCalledWith(SESSION_ID);
      expect(deps.navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('brise spremljenu sesiju kada destroy nastupi tijekom prijelaza od 180 ms', async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies({ transitionDelayMs: 180 });
      const controller = mountIntakeController(document, deps);

      const selection = controller.selectFile(makeFile());
      await vi.advanceTimersByTimeAsync(0);
      expect(deps.persistentStore.put).toHaveBeenCalledOnce();

      controller.destroy();
      await vi.advanceTimersByTimeAsync(180);
      await selection;

      expect(deps.persistentStore.delete).toHaveBeenCalledWith(SESSION_ID);
      expect(deps.navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('best-effort cleanup ne propagira delete gresku niti navigira nakon destroy', async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies({ transitionDelayMs: 180 });
      (deps.persistentStore.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('delete failed'));
      const controller = mountIntakeController(document, deps);

      const selection = controller.selectFile(makeFile());
      await vi.advanceTimersByTimeAsync(0);
      controller.destroy();
      await vi.advanceTimersByTimeAsync(180);

      await expect(selection).resolves.toBeUndefined();
      expect(deps.persistentStore.delete).toHaveBeenCalledWith(SESSION_ID);
      expect(deps.navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('novi odabir nakon odbijene pohrane skriva nastavak bez pohrane za STARI dokument', async () => {
    // Gumb pripada odabiru za koji je pohrana odbijena. Cim korisnik ubaci drugi dokument, stari
    // fallback nestaje: klik koji bi vodio na /rad/ "zbog" starog dokumenta vise nema smisla.
    const deps = dependencies({ persistentStore: storageFailure('unavailable') });
    const controller = mountIntakeController(document, deps);

    await controller.selectFile(makeFile('prvi.docx'));
    expect(document.querySelector<HTMLButtonElement>('#intakeMemoryAction')!.hidden).toBe(false);

    const drugi = controller.selectFile(makeFile('drugi.docx'));
    expect(document.querySelector<HTMLButtonElement>('#intakeMemoryAction')!.hidden).toBe(true);
    await drugi;
    // Druga pohrana je opet odbijena, pa se gumb vraca, ali za DRUGI dokument.
    expect(document.querySelector('#intakeFileName')?.textContent).toBe('drugi.docx');
    expect(document.querySelector<HTMLButtonElement>('#intakeMemoryAction')!.hidden).toBe(false);
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});
