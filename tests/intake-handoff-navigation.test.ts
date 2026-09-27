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
 * PRIJENOS KONTEKSTA SA SEO STRANICE FAKULTETA KROZ ULAZ.
 *
 * Zatecena tvrdnja (`tests/intake-controller.test.ts`) je da navigacija ide na tocno
 * `/rad/#session=<uuid>`. Ona ostaje netaknuta i ovdje se ponavlja kao BASELINE: bez querya na
 * ulazu odrediste mora biti bajt u bajt isto kao prije. Tek kad query postoji, on putuje dalje.
 */

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const accepted: IntakeOk = {
  kind: 'ok',
  quickStats: null,
  suspicious: false,
  suspicionReason: null,
  capability: { canAnalyze: true, canRepair: true, totalDeclaredBytes: 64, entryCount: 4, repairBlocker: null },
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

function makeFile(): File {
  return new File([new Uint8Array(64)], 'diplomski-rad.docx', { type: DOCX_TYPE, lastModified: 1_000 });
}

function sessionFor(file: File): LocalDocumentSessionV1 {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: SESSION_ID,
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

async function navigateAfterUpload(deps: IntakeControllerDependencies): Promise<string> {
  const controller = mountIntakeController(document, deps);
  await controller.selectFile(makeFile());
  const calls = (deps.navigate as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls).toHaveLength(1);
  return String(calls[0][0]);
}

beforeEach(() => { renderFixture(); });

describe('ulaz prenosi kontekst na /rad/', () => {
  it('BASELINE: bez querya odrediste je tocno /rad/#session=<uuid>', async () => {
    expect(await navigateAfterUpload(dependencies())).toBe(`/rad/#session=${SESSION_ID}`);
    expect(await navigateAfterUpload(dependencies({ handoffSearch: '' }))).toBe(`/rad/#session=${SESSION_ID}`);
  });

  it('query sa SEO stranice fakulteta putuje ispred fragmenta sesije', async () => {
    const target = await navigateAfterUpload(dependencies({
      handoffSearch: '?unit=ffzg&work=diplomski&utm_source=faculty_page&utm_medium=organic',
    }));
    expect(target).toBe(`/rad/?unit=ffzg&work=diplomski&utm_source=faculty_page&utm_medium=organic#session=${SESSION_ID}`);
    // Poredak nije kozmetika: query iza fragmenta bio bi dio fragmenta i odrediste ga ne bi
    // procitalo kroz `location.search`.
    expect(target.indexOf('?')).toBeLessThan(target.indexOf('#'));
  });

  it('kljucevi izvan bijele liste ne stizu do /rad/', async () => {
    const target = await navigateAfterUpload(dependencies({
      handoffSearch: '?unit=ffzg&redirect=https%3A%2F%2Fzlo.example&token=tajna',
    }));
    expect(target).toBe(`/rad/?unit=ffzg#session=${SESSION_ID}`);
    expect(target).not.toContain('redirect');
    expect(target).not.toContain('token');
  });

  it('isti kontekst nosi i put bez pohrane, i tada bez fragmenta sesije', async () => {
    const deps = dependencies({
      handoffSearch: '?unit=ffzg&utm_source=faculty_page',
      persistentStore: {
        put: vi.fn(async () => { throw new LocalDocumentSessionStoreError('unavailable', 'Pohrana nije dostupna.'); }),
        delete: vi.fn(async () => undefined),
      },
    });
    const controller = mountIntakeController(document, deps);
    await controller.selectFile(makeFile());
    expect(deps.navigate).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('#intakeMemoryAction')!.click();
    expect(deps.navigate).toHaveBeenCalledOnce();
    expect(deps.navigate).toHaveBeenCalledWith(`${WORKSPACE_WITHOUT_SESSION}?unit=ffzg&utm_source=faculty_page`);
    expect(deps.navigate).not.toHaveBeenCalledWith(expect.stringContaining('#session='));
  });
});
