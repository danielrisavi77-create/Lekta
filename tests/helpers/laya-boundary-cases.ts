/** Regresije PR102: vlastiti sinteticki objekti, bez modela i studentskih dokumenata. */
import assert from 'node:assert/strict';
import { buildDecisionCases } from '../../scripts/laya/adapter.mts';
import { DecisionContractError } from '../../scripts/laya/contracts.ts';
import { makeSnapshot, type TestCase } from './laya-cases.ts';

type Snapshot = ReturnType<typeof makeSnapshot>;
type Target = { name: string; parent: (s: Snapshot) => object; key: PropertyKey };
const targets: Target[] = [
  ...['documentRevisionId', 'profile', 'engineRevision', 'provenance', 'result', 'records'].map(key => ({
    name: `snapshot.${key}`, parent: (s: Snapshot) => s, key,
  })),
  ...['id', 'revision'].map(key => ({ name: `profile.${key}`, parent: (s: Snapshot) => s.profile, key })),
  { name: 'result.checks', parent: s => s.result, key: 'checks' },
  ...['id', 'status'].map(key => ({ name: `checks[0].${key}`, parent: (s: Snapshot) => s.result.checks[0], key })),
  ...['checkId', 'linkage', 'paragraphIndex', 'recordIndex', 'referenceText', 'language', 'extraction', 'rule'].map(key => ({
    name: `records[0].${key}`, parent: (s: Snapshot) => s.records[0], key,
  })),
  { name: 'records[0]', parent: s => s.records, key: '0' },
  { name: 'checks[0]', parent: s => s.result.checks, key: '0' },
  { name: 'rule.excerpt', parent: s => s.records[0].rule, key: 'excerpt' },
  { name: 'provenance.localReviewAllowed', parent: s => s.provenance, key: 'localReviewAllowed' },
];
function rejectsSnapshot(run: () => unknown): void {
  assert.throws(run, (error: unknown) => error instanceof DecisionContractError);
}

export const boundaryCases: TestCase[] = [
  ...targets.map(({ name, parent, key }): TestCase => ({
    name: `granica adaptera: getter ${name} ne smije biti izvrsen`, run: () => {
      const s = makeSnapshot(); const canonicalResult = s.result; const target = parent(s);
      const value = Object.getOwnPropertyDescriptor(target, key)?.value;
      let calls = 0;
      Object.defineProperty(target, key, { configurable: true, enumerable: true, get() {
        calls++; canonicalResult.score = 100; return value;
      } });
      assert.equal(typeof Object.getOwnPropertyDescriptor(target, key)?.get, 'function');
      rejectsSnapshot(() => buildDecisionCases(s));
      assert.equal(calls, 0); assert.equal(canonicalResult.score, 72);
    },
  })),
  ...['records', 'checks'].flatMap(kind => ['only', 'first', 'last'].map((position): TestCase => ({
    name: `granica adaptera: odbija sparse ${kind}/${position}`, run: () => {
      const s = makeSnapshot();
      const values = kind === 'records' ? s.records : s.result.checks;
      const value = values[0];
      if (position === 'only') { values.length = 1; Reflect.deleteProperty(values, '0'); }
      else if (position === 'first') { Object.defineProperty(values, '1', { value, configurable: true, enumerable: true, writable: true }); Reflect.deleteProperty(values, '0'); }
      else values.length = 2;
      const hole = position === 'last' ? 1 : 0;
      assert.equal(Object.hasOwn(values, hole), false); assert.ok(values.length > hole);
      rejectsSnapshot(() => buildDecisionCases(s));
    },
  }))),
  ...['records', 'checks'].map((kind): TestCase => ({
    name: `granica adaptera: odbija accessor umjesto ${kind} metode`, run: () => {
      const s = makeSnapshot(); const values = kind === 'records' ? s.records : s.result.checks;
      const key = kind === 'records' ? 'map' : 'filter'; let calls = 0;
      Object.defineProperty(values, key, { get() { calls++; return () => []; } });
      rejectsSnapshot(() => buildDecisionCases(s)); assert.equal(calls, 0);
    },
  })),
  { name: 'granica adaptera: naslijedjeni indeks ne popunjava rupu', run: () => {
    const s = makeSnapshot(); const record = s.records[0]; s.records.length = 1;
    Reflect.deleteProperty(s.records, '0'); let calls = 0;
    const prototype = Object.create(Array.prototype);
    Object.defineProperty(prototype, '0', { get() { calls++; return record; } });
    Object.setPrototypeOf(s.records, prototype);
    assert.equal(Object.hasOwn(s.records, '0'), false);
    rejectsSnapshot(() => buildDecisionCases(s)); assert.equal(calls, 0);
  } },
  { name: 'granica adaptera: naslijedjeni tekst nije vlastiti podatak', run: () => {
    const s = makeSnapshot(); const record = s.records[0]; const text = record.referenceText; let calls = 0;
    Reflect.deleteProperty(record, 'referenceText'); const prototype = {};
    Object.defineProperty(prototype, 'referenceText', { get() { calls++; return text; } });
    Object.setPrototypeOf(record, prototype);
    rejectsSnapshot(() => buildDecisionCases(s)); assert.equal(calls, 0);
  } },
  { name: 'granica adaptera: setter-only polje je odbijeno', run: () => {
    const s = makeSnapshot(); let calls = 0;
    Reflect.deleteProperty(s.records[0], 'referenceText');
    Object.defineProperty(s.records[0], 'referenceText', { enumerable: true, set(_value: unknown) { calls++; } });
    rejectsSnapshot(() => buildDecisionCases(s)); assert.equal(calls, 0);
  } },
  { name: 'granica adaptera: ne-enumerable obvezno polje je odbijeno', run: () => {
    const s = makeSnapshot(); Object.defineProperty(s.records[0], 'referenceText', { enumerable: false });
    rejectsSnapshot(() => buildDecisionCases(s));
  } },
  { name: 'granica adaptera: ne-enumerable indeks je odbijen', run: () => {
    const s = makeSnapshot(); Object.defineProperty(s.records, '0', { enumerable: false });
    rejectsSnapshot(() => buildDecisionCases(s));
  } },
  { name: 'granica adaptera: null zapis se ne preskace', run: () => {
    const s = makeSnapshot(); Object.defineProperty(s.records, '0', { value: null });
    rejectsSnapshot(() => buildDecisionCases(s));
  } },
  { name: 'granica adaptera: obicni i null-prototype podatkovni objekti daju isti izlaz', run: () => {
    const s = makeSnapshot(); const expected = buildDecisionCases(s);
    for (const value of [s, s.profile, s.result, s.result.checks[0], s.records[0]]) Object.setPrototypeOf(value, null);
    assert.deepEqual(buildDecisionCases(s), expected);
  } },
  { name: 'granica adaptera: rezultat izvan projekcije se ne cita', run: () => {
    const s = makeSnapshot(); const expected = buildDecisionCases(s); let calls = 0;
    for (const key of ['score', 'issues', 'details', 'recipe', 'originalBytes']) {
      Object.defineProperty(s.result, key, { get() { calls++; throw new Error('PRIVATE_CANARY'); } });
    }
    assert.deepEqual(buildDecisionCases(s), expected); assert.equal(calls, 0);
  } },
  { name: 'granica adaptera: dense batch od 1000 ima 1000 valjanih razlicitih slucajeva', run: () => {
    const s = makeSnapshot(); s.records = Array.from({ length: 1000 }, (_, recordIndex) => ({ ...s.records[0], recordIndex }));
    const cases = buildDecisionCases(s);
    assert.equal(cases.length, 1000); assert.equal(new Set(cases.map(c => c.caseId)).size, 1000);
    for (let i = 0; i < cases.length; i++) assert.equal(Object.hasOwn(cases, i), true);
    s.records.push({ ...s.records[0], recordIndex: 1000 }); rejectsSnapshot(() => buildDecisionCases(s));
  } },
];
