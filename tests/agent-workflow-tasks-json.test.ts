// @vitest-environment node
/**
 * Gard nad STVARNIM `docs/agents/tasks.json` (nalaz 5 iz T16).
 *
 * `tests/agent-workflow.test.ts` i `tests/agent-workflow-cli.test.ts` vrte `validateQueue` iskljucivo
 * nad rucno pisanim redovima od dva zadatka. Nijedan test ne cita stvarni red s diska, pa kvar u
 * podacima (a ne u kodu) nitko ne bi vidio. Ova datoteka cita datoteku, ne kopiju.
 *
 * Osim toga tvrdi konzistentnost statusa naspram statusa ovisnosti, koju `validateQueue` NE provjerava
 * (vidi `tests/helpers/agent-queue-consistency.ts`).
 *
 * Ako baseline jednoga dana padne: to je NALAZ o redu zadataka, ne kvar ovog testa.
 * `docs/agents/tasks.json` se u tom slucaju ne popravlja iz ovog garda nego se javlja koordinatoru.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateQueue } from '../scripts/agents/core.mjs';
import {
  describeViolations,
  findStatusDependencyViolations,
  type QueueLike,
  type QueueTaskLike,
} from './helpers/agent-queue-consistency';

const TASKS_JSON = fileURLToPath(new URL('../docs/agents/tasks.json', import.meta.url));

/** Uvijek svjez procitan s diska, nikad statican uvoz ni kopija u testu. */
function readQueue(): QueueLike & { tasks: QueueTaskLike[] } {
  return JSON.parse(readFileSync(TASKS_JSON, 'utf8')) as QueueLike & { tasks: QueueTaskLike[] };
}

function clone(queue: QueueLike): QueueLike {
  return JSON.parse(JSON.stringify(queue)) as QueueLike;
}

/**
 * `validateQueue` iz core.mjs NE odbija nepoznata polja (samo provjerava id/title/status/
 * dependsOn), pa je taj gard ovdje, uz stvarnu shemu zadatka. `owner` je NOVO neobvezno polje
 * (korak 1 routinga: koja sesija je zauzela zadatak); sve ostalo van popisa je odbijeno.
 */
const KNOWN_TASK_FIELDS = new Set(['id', 'title', 'status', 'dependsOn', 'note', 'owner', 'implementationAgent']);

function findUnknownTaskFields(queue: QueueLike): string[] {
  const offenders: string[] = [];
  for (const task of queue.tasks as Array<Record<string, unknown>>) {
    const unknown = Object.keys(task).filter((key) => !KNOWN_TASK_FIELDS.has(key));
    if (unknown.length > 0) offenders.push(`${String(task.id)}: ${unknown.join(', ')}`);
  }
  return offenders;
}

describe('docs/agents/tasks.json: stvarni red zadataka', () => {
  it('prolazi strukturnu validaciju iz scripts/agents/core.mjs', () => {
    const queue = readQueue();
    expect(queue.tasks.length).toBeGreaterThan(0);
    expect(() => validateQueue(queue)).not.toThrow();
  });

  it('baseline: nijedan zadatak ne narusava status naspram statusa ovisnosti', () => {
    const violations = findStatusDependencyViolations(readQueue());
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it('provjera obuhvaca SVE zadatke, ne samo prvi (nazivnik nije prazan)', () => {
    // Bez ove tvrdnje bi baseline prosao vakuumski i na praznom ili krivo oblikovanom ulazu.
    const queue = readQueue();
    const withDependencies = queue.tasks.filter((task) => task.dependsOn.length > 0);
    expect(withDependencies.length).toBeGreaterThan(1);
    expect(queue.tasks.every((task) => typeof task.status === 'string')).toBe(true);
  });

  it('baseline: svaki zadatak koristi samo poznata polja (owner je dopusten, ostalo nije)', () => {
    const offenders = findUnknownTaskFields(readQueue());
    expect(offenders, offenders.join('; ')).toHaveLength(0);
  });
});

describe('shema zadatka: neobvezno polje owner (korak 1 routinga)', () => {
  it('smjer 1: zadatak s owner poljem prolazi i strukturnu validaciju i gard nepoznatih polja', () => {
    const queue = clone(readQueue()) as QueueLike & { tasks: QueueTaskLike[] };
    const task = queue.tasks.find((candidate) => candidate.id === 'T17');
    expect(task).toBeTruthy();
    if (!task) return;
    (task as unknown as Record<string, unknown>).owner = 'lekta-32';

    expect(() => validateQueue(queue)).not.toThrow();
    expect(findUnknownTaskFields(queue)).toHaveLength(0);
  });

  it('smjer 2: zadatak s nepoznatim poljem i dalje pada na gardu (ostaje strukturno "valjan")', () => {
    const queue = clone(readQueue()) as QueueLike & { tasks: QueueTaskLike[] };
    const task = queue.tasks.find((candidate) => candidate.id === 'T17');
    expect(task).toBeTruthy();
    if (!task) return;
    (task as unknown as Record<string, unknown>).assignee = 'lekta-32'; // nepoznato polje, ne 'owner'

    // core.mjs ne gleda nepoznata polja pa strukturna validacija i dalje prolazi...
    expect(() => validateQueue(queue)).not.toThrow();
    // ...ali gard sheme iz ovog testa mora imenovati zadatak i polje.
    const offenders = findUnknownTaskFields(queue);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/T17/);
    expect(offenders[0]).toMatch(/assignee/);
  });
});

describe('mutacija: gard mora zagristi na pokvarenom redu', () => {
  it('otkljucan zadatak uz ovisnost koja nije done prijavljuje se imenom', () => {
    const queue = clone(readQueue());
    const dependent = queue.tasks.find((task) => task.id === 'T17');
    const dependency = queue.tasks.find((task) => task.id === 'T16');
    expect(dependent, 'T17 postoji u stvarnom redu').toBeTruthy();
    expect(dependency, 'T16 postoji u stvarnom redu').toBeTruthy();
    if (!dependent || !dependency) return;

    // Preduvjet mutacije: T17 je otkljucan i ovisi bas o T16, koji je danas 'done'.
    expect(dependent.dependsOn).toContain('T16');
    expect(dependent.status).not.toBe('blocked');
    expect(dependency.status).toBe('done');

    // Mutacija ostaje STRUKTURNO valjana (id, naslov, dopusten status, dependsOn niz), pa pada
    // iskljucivo na novom gardu, a ne na strukturnoj provjeri iz core.mjs.
    dependency.status = 'blocked';
    expect(() => validateQueue(queue)).not.toThrow();

    const violations = findStatusDependencyViolations(queue);
    expect(violations.some((violation) => violation.taskId === 'T17'), describeViolations(violations)).toBe(true);
    expect(describeViolations(violations)).toMatch(/T17/);
    const t17 = violations.find((violation) => violation.taskId === 'T17');
    expect(t17?.kind).toBe('unlocked-with-unfinished-dependency');
    expect(t17?.dependencies).toContain('T16');
  });

  it('blocked bez ijedne ovisnosti koja nije done prijavljuje se imenom', () => {
    const queue = clone(readQueue());
    const task = queue.tasks.find((candidate) => candidate.id === 'T17');
    expect(task).toBeTruthy();
    if (!task) return;
    task.status = 'blocked'; // sve ovisnosti (T16) su 'done', dakle blokada bez razloga
    expect(() => validateQueue(queue)).not.toThrow();

    const violations = findStatusDependencyViolations(queue);
    const t17 = violations.find((violation) => violation.taskId === 'T17');
    expect(t17?.kind, describeViolations(violations)).toBe('blocked-without-reason');
    expect(describeViolations(violations)).toMatch(/T17/);
  });

  it('nepostojeca ovisnost daje imenovano narusavanje, ne TypeError', () => {
    const queue: QueueLike = {
      tasks: [
        { id: 'T90', title: 'Sidro', status: 'done', dependsOn: [] },
        { id: 'T91', title: 'Ovisnik', status: 'ready', dependsOn: ['T99'] },
      ] as QueueTaskLike[],
    };
    const violations = findStatusDependencyViolations(queue);
    expect(violations.map((violation) => violation.kind)).toContain('missing-dependency');
    expect(describeViolations(violations)).toMatch(/T91/);
  });

  it('negativna kontrola: mali ispravan red ne daje nijedno narusavanje', () => {
    const queue: QueueLike = {
      tasks: [
        { id: 'T90', title: 'Temelj', status: 'done', dependsOn: [] },
        { id: 'T91', title: 'U tijeku', status: 'in_progress', dependsOn: ['T90'] },
        { id: 'T92', title: 'Ceka T91', status: 'blocked', dependsOn: ['T91'] },
      ] as QueueTaskLike[],
    };
    const violations = findStatusDependencyViolations(queue);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
