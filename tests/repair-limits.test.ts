import { describe, it, expect } from 'vitest';

import { ConcurrencyGate, storageQuotaExceeded } from '../src/report/repair-limits';

describe('ConcurrencyGate', () => {
  it('propusta zahtjeve do maksimuma pa odbija sljedeci', () => {
    const gate = new ConcurrencyGate(2);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.current).toBe(2);
    expect(gate.tryAcquire()).toBe(false); // treci u istom trenu je odbijen
    expect(gate.current).toBe(2); // odbijeni pokusaj ne mijenja brojac
  });

  it('release() oslobadja slot za sljedeci zahtjev', () => {
    const gate = new ConcurrencyGate(1);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.current).toBe(0);
    expect(gate.tryAcquire()).toBe(true);
  });

  it('release() bez odgovarajuceg tryAcquire() ne ide u minus', () => {
    const gate = new ConcurrencyGate(3);
    gate.release();
    gate.release();
    expect(gate.current).toBe(0);
  });

  it('max<=0 iskljucuje limit (uvijek propusta)', () => {
    const gate = new ConcurrencyGate(0);
    for (let i = 0; i < 50; i++) expect(gate.tryAcquire()).toBe(true);
    const negGate = new ConcurrencyGate(-1);
    expect(negGate.tryAcquire()).toBe(true);
  });
});

describe('storageQuotaExceeded', () => {
  it('false dok je broj poslova ispod dnevnog stropa', () => {
    expect(storageQuotaExceeded(10, 100)).toBe(false);
  });

  it('true kad je broj poslova dosegnuo ili premasio strop', () => {
    expect(storageQuotaExceeded(100, 100)).toBe(true);
    expect(storageQuotaExceeded(150, 100)).toBe(true);
  });

  it('dailyCap<=0 iskljucuje ogranicenje (uvijek false)', () => {
    expect(storageQuotaExceeded(999999, 0)).toBe(false);
    expect(storageQuotaExceeded(999999, -5)).toBe(false);
  });
});
