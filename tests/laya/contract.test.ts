import { describe, expect, it } from 'vitest';
import schema from '../../schemas/laya/finding-v2.schema.json';
import {
  DecisionContractError, VERDICTS, decisionInputDigest, modelDigest, modelView, validateDecisionCase,
} from '../../scripts/laya/contracts-v2.ts';
import { DOC, PROFILE_REV, makeCase, makeRuntime } from '../helpers/laya-v2-fixtures.ts';

function rejects(run: () => unknown, code?: string): void {
  let caught: unknown = null;
  try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DecisionContractError);
  if (code) expect((caught as DecisionContractError).code).toBe(code);
}

describe('Laya v2 DecisionCase ugovor', () => {
  it('prihvaca vlastiti slucaj i vraca odvojenu kopiju', () => {
    const c = makeCase();
    const out = validateDecisionCase(c);
    expect(out).toEqual(c);
    expect(out).not.toBe(c);
    expect(out.modelInput).not.toBe(c.modelInput);
  });

  it.each(['score', 'fixerId', 'repairRecipe', 'entitlement', 'price', 'goldLabel', 'userId', 'email', 'fileName', 'issues'])(
    'odbija zabranjeno korijensko polje %s', (key) => {
      rejects(() => validateDecisionCase({ ...makeCase(), [key]: 'ZABRANJENO' }), 'UNKNOWN_FIELD');
    });

  it('odbija v1 case i neeligibilan check', () => {
    rejects(() => validateDecisionCase({ ...makeCase(), schemaVersion: 1 }), 'INVALID_VALUE');
    rejects(() => validateDecisionCase({ ...makeCase(), identity: { ...makeCase().identity, checkId: 'page.margins' } }));
  });

  it('engine smije nositi samo eksplicitnu vezu i status nalaza', () => {
    rejects(() => validateDecisionCase({ ...makeCase(), engine: { ...makeCase().engine, linkage: 'uncertain' } }));
    rejects(() => validateDecisionCase({ ...makeCase(), engine: { ...makeCase().engine, checkStatus: 'pass' } }));
  });

  it('krivotvoreni caseId i zastarjeli inputDigest se odbijaju', () => {
    rejects(() => validateDecisionCase({ ...makeCase(), caseId: 'laya:v2|wrong' }), 'IDENTITY_MISMATCH');
    rejects(() => validateDecisionCase({ ...makeCase(), modelInput: { ...makeCase().modelInput, text: 'Drugi zapis.' } }), 'INPUT_DIGEST_MISMATCH');
    rejects(() => validateDecisionCase({ ...makeCase(), engine: { ...makeCase().engine, revision: '8'.repeat(40) } }), 'INPUT_DIGEST_MISMATCH');
  });

  it('bez lokalnog dopustenja nema casea; nedostajuca zastavica nije dopustenje', () => {
    rejects(() => validateDecisionCase({ ...makeCase(), provenance: { ...makeCase().provenance, localInferenceAllowed: false } }), 'DATA_NOT_PERMITTED');
    const { trainingAllowed: _dropped, ...provenance } = makeCase().provenance;
    rejects(() => validateDecisionCase({ ...makeCase(), provenance }), 'MISSING_FIELD');
  });

  it('getter se ne izvrsava, naslijedjena i simbolicka polja se odbijaju', () => {
    let calls = 0;
    const c = makeCase();
    Object.defineProperty(c, 'caseId', { enumerable: true, get() { calls++; return 'x'; } });
    rejects(() => validateDecisionCase(c));
    expect(calls).toBe(0);
    rejects(() => validateDecisionCase(Object.assign(Object.create({ fixerId: 'bad' }), makeCase())));
    rejects(() => validateDecisionCase({ ...makeCase(), [Symbol('hidden')]: 1 }));
  });

  it('predug zapis se odbija, ne reze', () => {
    rejects(() => validateDecisionCase({ ...makeCase(), modelInput: { ...makeCase().modelInput, text: 'x'.repeat(2001) } }));
  });

  it('greska ne ispisuje nepoznati kljuc ni tekst dokumenta', () => {
    try {
      validateDecisionCase({ ...makeCase(), PRIVATE_KEY_CANARY: 'PRIVATE_VALUE_CANARY' });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toMatch(/PRIVATE_/);
    }
  });

  it('model vidi samo modelInput: bez identiteta, provenance, enginea i ostalog', () => {
    const view = modelView(makeCase());
    expect(Object.keys(view).sort()).toEqual(['language', 'ruleEvidence', 'text']);
    const serialized = JSON.stringify(view);
    for (const hidden of [DOC, PROFILE_REV, 'synthetic-profile', 'owned-fixture-v2', '9'.repeat(40), 'warn', 'caseId', 'score']) {
      expect(serialized).not.toContain(hidden);
    }
  });

  it('inputDigest ovisi o svakom polju ulaza i ne ovisi o redoslijedu kljuceva objekta', () => {
    const c = makeCase();
    const base = decisionInputDigest(c.identity, c.engine, c.modelInput);
    const reordered = { ruleEvidence: c.modelInput.ruleEvidence, language: c.modelInput.language, text: c.modelInput.text };
    expect(decisionInputDigest(c.identity, c.engine, reordered)).toBe(base);
    expect(decisionInputDigest(c.identity, c.engine, { ...c.modelInput, language: 'en' })).not.toBe(base);
    expect(decisionInputDigest({ ...c.identity, recordIndex: 1 }, c.engine, c.modelInput)).not.toBe(base);
    expect(decisionInputDigest(c.identity, c.engine, { ...c.modelInput, ruleEvidence: null })).not.toBe(base);
  });

  it('modelDigest veze preciznost, runtime i kalibraciju, ne samo checkpoint', () => {
    const base = modelDigest(makeRuntime());
    expect(modelDigest({ ...makeRuntime(), precision: 'bf16' })).not.toBe(base);
    expect(modelDigest({ ...makeRuntime(), backend: 'laya-onnx' })).not.toBe(base);
    expect(modelDigest({ ...makeRuntime(), calibrationRevision: 'cal-2' })).not.toBe(base);
    expect(modelDigest({ ...makeRuntime(), runtimeVersion: '0.0.1' })).not.toBe(base);
  });

  it('shema i kod dijele isti skup verdikata', () => {
    expect(schema.$defs.decisionResult.properties.verdict.enum).toEqual([...VERDICTS]);
    expect(Object.keys(schema.$defs.probabilities.properties)).toEqual([...VERDICTS]);
    expect(schema.$defs.identity.properties.checkId.enum).toEqual(['reference.completeness']);
  });
});
