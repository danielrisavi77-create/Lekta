/**
 * Konzistentnost STATUSA naspram statusa OVISNOSTI u redu zadataka agenata.
 *
 * Nalaz 5 iz T16: `validateQueue` u `scripts/agents/core.mjs` provjerava OBLIK reda (id, naslov,
 * dopusten status, `dependsOn` niz) i GRAF (nedostajuca ovisnost, ciklus), ali nikada ne usporedjuje
 * status zadatka sa statusima njegovih ovisnosti. Zadatak koji je `ready` a ovisi o zadatku koji je
 * jos `blocked` prolazi kroz `validateQueue` bez ijedne greske. `prepareJob` ima dio te logike, ali
 * samo za `phase === 'implement'` i samo za JEDAN zadatak, dakle nikada za cijeli red.
 *
 * Ovaj modul je namjerno odvojen od `scripts/`: gard se dodaje bez diranja produkcijskog koda.
 *
 * Pravilo koje provjerava (doslovno iz zadatka):
 *   - zadatak sa statusom `ready`, `in_progress`, `in_review` ili `done` smije imati SAMO ovisnosti
 *     koje su `done`;
 *   - zadatak sa statusom `blocked` mora imati BAR JEDNU ovisnost koja nije `done`.
 *
 * Rubni slucaj, odlucen svjesno: `blocked` BEZ ijedne ovisnosti je narusavanje, jer nema ovisnost
 * koja nije `done`, dakle nema ni vidljiv razlog blokade. Na dan pisanja takvih zadataka u
 * `docs/agents/tasks.json` nema (izmjereno: 0), pa izbor ne mijenja baseline nego samo buducnost.
 *
 * Funkcija VRACA popis narusavanja umjesto da baci na prvom. Tako test moze tvrditi TOCAN skup
 * pogodjenih zadataka, sto je jedini nacin da se dokaze da mehanizam prolazi kroz SVE zadatke, a ne
 * da stane na prvom (CLAUDE.md: "jednoprolazni gard je slijep").
 */

/** Statusi u kojima je zadatak otkljucan, dakle sve mu ovisnosti moraju biti gotove. */
export const UNLOCKED_STATUSES = ['ready', 'in_progress', 'in_review', 'done'] as const;

export interface QueueTaskLike {
  id: string;
  status: string;
  dependsOn: string[];
  /**
   * Konzistentnost ga ne cita, ali `validateQueue` ga TRAZI, pa ga tip nosi da bi isti objekt mogao
   * proci kroz oba garda bez pretvorbe (i da bi izostanak naslova bio tipska, a ne runtime greska).
   */
  title?: string;
}

export interface QueueLike {
  tasks: QueueTaskLike[];
}

export type ViolationKind =
  /** Ovisnost uopce ne postoji u redu, pa joj se status ne moze procitati. */
  | 'missing-dependency'
  /** Otkljucan status uz ovisnost koja nije `done`. */
  | 'unlocked-with-unfinished-dependency'
  /** `blocked` iako su sve ovisnosti `done` (ukljucujuci slucaj bez ijedne ovisnosti). */
  | 'blocked-without-reason';

export interface QueueViolation {
  /** Zadatak koji narusava pravilo. Poruka ga uvijek imenuje. */
  taskId: string;
  taskStatus: string;
  kind: ViolationKind;
  /** Ovisnosti zbog kojih je narusavanje prijavljeno (prazan popis kod `blocked-without-reason`). */
  dependencies: string[];
  message: string;
}

/**
 * Prolazi kroz SVE zadatke i vraca sva narusavanja. Ne baca; nepoznat oblik ulaza (nedostajuca
 * ovisnost) prijavljuje se kao narusavanje s jasnom porukom, ne kao TypeError.
 */
export function findStatusDependencyViolations(queue: QueueLike): QueueViolation[] {
  const byId = new Map<string, QueueTaskLike>();
  for (const task of queue.tasks) byId.set(task.id, task);

  const violations: QueueViolation[] = [];
  for (const task of queue.tasks) {
    const missing = task.dependsOn.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      violations.push({
        taskId: task.id,
        taskStatus: task.status,
        kind: 'missing-dependency',
        dependencies: missing,
        message: `${task.id} (${task.status}) referencira ovisnost koja ne postoji u redu: ${missing.join(', ')}`,
      });
    }

    // Nepostojeca ovisnost se broji kao "nije done": nedokaziva ovisnost ne smije otkljucati zadatak.
    const unfinished = task.dependsOn.filter((id) => byId.get(id)?.status !== 'done');

    if ((UNLOCKED_STATUSES as readonly string[]).includes(task.status) && unfinished.length > 0) {
      violations.push({
        taskId: task.id,
        taskStatus: task.status,
        kind: 'unlocked-with-unfinished-dependency',
        dependencies: unfinished,
        message: `${task.id} je '${task.status}' iako ovisnost nije 'done': ${unfinished
          .map((id) => `${id}='${byId.get(id)?.status ?? 'nepostojeca'}'`)
          .join(', ')}`,
      });
    }

    if (task.status === 'blocked' && unfinished.length === 0) {
      violations.push({
        taskId: task.id,
        taskStatus: task.status,
        kind: 'blocked-without-reason',
        dependencies: [],
        message: task.dependsOn.length === 0
          ? `${task.id} je 'blocked' bez ijedne ovisnosti, pa nema ovisnost koja nije 'done'`
          : `${task.id} je 'blocked' iako su sve ovisnosti 'done': ${task.dependsOn.join(', ')}`,
      });
    }
  }
  return violations;
}

/** Citljiv sazetak za poruku testa: pad odmah imenuje zadatke, bez daljnjeg pretrazivanja. */
export function describeViolations(violations: QueueViolation[]): string {
  if (violations.length === 0) return 'nema narusavanja';
  return violations.map((violation) => `- ${violation.message}`).join('\n');
}
