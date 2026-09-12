/**
 * PISAC RADA U SESIJU (korak C3, 2026-09-12).
 *
 * ZASTO POSTOJI, a ne zove se `store.update` izravno.
 *
 * Rad se mijenja na dogadjaje koje korisnik proizvodi brze nego sto pohrana stigne: svaka kucica u
 * panelu popravka je jedna promjena odabira. Izravno pisanje bi za dvadeset klikova napravilo
 * dvadeset transakcija, a pohrana pritom nema red cekanja: dva paralelna `update` se natjecu i
 * onaj sporiji vraca `conflict`, pa bi korisnik dobio "nije spremljeno" za rad koji je uredno
 * napravio.
 *
 * Pisac rjesava tri stvari, i svaka ima vlastitu tvrdnju u gardu:
 *  1. JEDAN UPIS U LETU. Sljedeci krece tek kad prethodni zavrsi, pa se dva `update` iz iste
 *     kartice nikad ne natjecu medusobno.
 *  2. KOALESCENCIJA. Promjene se spajaju u jedan `pending` patch dok upis traje ili dok tece
 *     kratak prozor, pa dvadeset klikova daje JEDAN zapis.
 *  3. VLASTITA GENERACIJA. Pamti se revizija zadnjeg uspjesnog upisa i salje kao uvjet. Kad je
 *     netko drugi pomaknuo zapis, pisac PROCITA svjeze stanje, SPOJI svoj patch preko njega
 *     (`mergeSessionWork`) i pokusa JOS JEDNOM. Druga kolizija vraca `conflict`, i tada sucelje
 *     ne smije tvrditi da je spremljeno.
 *
 * VRIJEME I TAJMERI SE INJEKTIRAJU, pa je modul testabilan bez cekanja i bez utrka.
 */
import { mergeSessionWork, type SessionWork } from './session-merge';
import type {
  LocalDocumentSessionStore, LocalDocumentSessionUpdate, LocalDocumentSessionV1,
} from './local-document-session';

export type SessionWriteOutcome =
  | { kind: 'written'; revision: number; at: number }
  /** Dvije uzastopne kolizije. Sucelje tada NE SMIJE reci "spremljeno". */
  | { kind: 'conflict' }
  | { kind: 'quota' }
  | { kind: 'failed'; reason: string };

export interface SessionWriterDeps {
  store: Pick<LocalDocumentSessionStore, 'update' | 'get'>;
  now?: () => number;
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
  /** Koliko se ceka prije upisa, da se bliske promjene spoje. */
  coalesceMs?: number;
  onOutcome?: (outcome: SessionWriteOutcome) => void;
}

export interface SessionWriter {
  /** Prijavi promjenu. Ne ceka upis; ishod stize kroz `onOutcome`. */
  enqueue(patch: SessionWork): void;
  /** Zapisi odmah sto ceka. Za `beforeunload` i za testove. */
  flush(): Promise<SessionWriteOutcome | null>;
  /** Prestani pisati. Ono sto ceka se ODBACUJE, i to je namjerno: vidi komentar. */
  dispose(): void;
}

function kodGreske(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

export function createSessionWriter(id: string, deps: SessionWriterDeps): SessionWriter {
  const now = deps.now ?? (() => Date.now());
  const zakaziIm = deps.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms));
  const ocistiIm = deps.clearTimeoutImpl ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const prozor = deps.coalesceMs ?? 250;

  let pending: SessionWork | null = null;
  let tajmer: unknown = null;
  let uLetu: Promise<SessionWriteOutcome | null> | null = null;
  let revizija: number | null = null;
  let ugasen = false;

  const javi = (outcome: SessionWriteOutcome): SessionWriteOutcome => {
    deps.onOutcome?.(outcome);
    return outcome;
  };

  const uPatch = (work: SessionWork): LocalDocumentSessionUpdate => ({
    ...(work.profile !== undefined ? { profile: work.profile } : {}),
    ...(work.workspace !== undefined ? { workspace: work.workspace } : {}),
  });

  async function pokusaj(work: SessionWork, uvjetuj: boolean): Promise<LocalDocumentSessionV1> {
    return deps.store.update(id, uPatch(work), uvjetuj && revizija !== null ? revizija : undefined);
  }

  async function upisi(work: SessionWork): Promise<SessionWriteOutcome> {
    try {
      const zapisano = await pokusaj(work, true);
      revizija = zapisano.revision ?? null;
      return javi({ kind: 'written', revision: zapisano.revision ?? 0, at: now() });
    } catch (prvi) {
      if (kodGreske(prvi) === 'quota') return javi({ kind: 'quota' });
      if (kodGreske(prvi) !== 'conflict') return javi({ kind: 'failed', reason: kodGreske(prvi) });

      // SUKOB: netko je pomaknuo zapis. Ne gazi se; cita se svjeze stanje i patch se SPOJI preko
      // njega, pa se pokusa jos jednom. Bez spajanja bi drugi pokusaj bio isto gazenje, samo
      // uspjesno.
      try {
        const svjez = await deps.store.get(id);
        if (!svjez) return javi({ kind: 'failed', reason: 'not-found' });
        revizija = svjez.revision ?? 0;
        const osnova: SessionWork = {
          ...(svjez.profile !== undefined ? { profile: svjez.profile } : {}),
          ...(svjez.workspace !== undefined ? { workspace: svjez.workspace } : {}),
        };
        const zapisano = await pokusaj(mergeSessionWork(osnova, work), true);
        revizija = zapisano.revision ?? null;
        return javi({ kind: 'written', revision: zapisano.revision ?? 0, at: now() });
      } catch (drugi) {
        if (kodGreske(drugi) === 'quota') return javi({ kind: 'quota' });
        // Druga kolizija zaredom: ne pokusava se u nedogled. Sucelje mora reci istinu.
        if (kodGreske(drugi) === 'conflict') return javi({ kind: 'conflict' });
        return javi({ kind: 'failed', reason: kodGreske(drugi) });
      }
    }
  }

  async function isprazni(): Promise<SessionWriteOutcome | null> {
    if (tajmer !== null) { ocistiIm(tajmer); tajmer = null; }
    if (uLetu) await uLetu;
    if (ugasen) return null;
    const work = pending;
    pending = null;
    if (!work) return null;

    const posao = upisi(work);
    uLetu = posao.then((o) => o);
    try {
      return await posao;
    } finally {
      uLetu = null;
    }
  }

  return {
    enqueue(patch: SessionWork): void {
      if (ugasen) return;
      pending = pending ? mergeSessionWork(pending, patch) : patch;
      if (tajmer !== null) ocistiIm(tajmer);
      tajmer = zakaziIm(() => { tajmer = null; void isprazni(); }, prozor);
    },
    flush(): Promise<SessionWriteOutcome | null> {
      return isprazni();
    },
    dispose(): void {
      // Ono sto ceka se ODBACUJE, a ne zapisuje na izlasku. Zapis nakon `dispose` opisivao bi rad
      // u kartici koja vise ne postoji, a pozivatelj koji ga zeli sacuvati ima `flush()` i moze ga
      // pricekati. Tiho pisanje iza ledja je gore od izgubljene zadnje kucice.
      ugasen = true;
      if (tajmer !== null) { ocistiIm(tajmer); tajmer = null; }
      pending = null;
    },
  };
}
