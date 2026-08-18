/**
 * Concurrency gate popravka (audit DOCX-07).
 *
 * Slot se do 2026-08-18 oslobadjao cim handler vrati odgovor, a NAJTEZI dio posla (dva Storage
 * uploada, do 2 x 20 MB) tek je tada kretao u `EdgeRuntime.waitUntil`. Gate je time stitio laksi
 * dio i puštao nove zahtjeve tocno dok instanca jos gura desetke megabajta.
 *
 * Popravak je da slot drzi POHRANA i oslobodi ga kad zavrsi. Time nastaje nova opasnost: dva
 * mjesta mogu pozvati oslobadjanje (handlerov `finally` i zavrsetak pohrane). `release()` brani
 * samo pad ispod nule, ali NE brani da drugi poziv oslobodi TUDJI slot. Zato `acquire()` vraca
 * jednokratnu funkciju: druga invokacija je no-op.
 *
 * Ovaj modul do sada nije imao nijedan test, iako je jedina brana pred paralelnim teskim
 * zahtjevima na istoj instanci.
 */
import { describe, it, expect } from 'vitest';
import { ConcurrencyGate, storageQuotaExceeded } from '../src/report/repair-limits';

describe('ConcurrencyGate', () => {
  it('pusta do granice pa odbija', () => {
    const gate = new ConcurrencyGate(2);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.current).toBe(2);
  });

  it('oslobadjanje vraca mjesto', () => {
    const gate = new ConcurrencyGate(1);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });

  it('limit 0 ili negativan znaci iskljucen limit', () => {
    for (const max of [0, -1]) {
      const gate = new ConcurrencyGate(max);
      for (let i = 0; i < 50; i++) expect(gate.tryAcquire(), String(max)).toBe(true);
    }
  });

  it('release ispod nule ne ide u minus', () => {
    const gate = new ConcurrencyGate(1);
    gate.release();
    gate.release();
    expect(gate.current).toBe(0);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
  });

  describe('acquire(): jednokratno oslobadjanje', () => {
    it('vraca funkciju dok ima mjesta, null kad nema', () => {
      const gate = new ConcurrencyGate(1);
      const first = gate.acquire();
      expect(typeof first).toBe('function');
      expect(gate.acquire()).toBeNull();
    });

    it('oslobadjanje vraca mjesto', () => {
      const gate = new ConcurrencyGate(1);
      const release = gate.acquire()!;
      release();
      expect(gate.current).toBe(0);
      expect(gate.acquire()).not.toBeNull();
    });

    /**
     * Jezgra nalaza: bez jednokratnosti, pozivatelj koji otpusti dvaput oslobodi TUDJI slot i
     * gate tiho pusti vise posla nego sto smije. Test to dokazuje usporedbom s golim `release()`.
     */
    it('drugi poziv je no-op i NE oslobadja tudji slot', () => {
      const gate = new ConcurrencyGate(2);
      const a = gate.acquire()!; // zahtjev A
      gate.acquire(); // zahtjev B, jos traje
      expect(gate.current).toBe(2);

      a();
      a();
      a();
      expect(gate.current, 'B jos drzi svoj slot').toBe(1);
      // Tocno jedno mjesto je slobodno, ne dva.
      expect(gate.acquire()).not.toBeNull();
      expect(gate.acquire()).toBeNull();
    });

    it('goli release() NEMA tu zastitu (zato acquire postoji)', () => {
      const gate = new ConcurrencyGate(2);
      gate.tryAcquire();
      gate.tryAcquire();
      gate.release();
      gate.release();
      // Oba slota su slobodna iako jedan zahtjev jos traje: upravo to acquire() sprjecava.
      expect(gate.current).toBe(0);
    });
  });
});

describe('storageQuotaExceeded', () => {
  it('prelazak praga zaustavlja pohranu, ne sam popravak', () => {
    expect(storageQuotaExceeded(499, 500)).toBe(false);
    expect(storageQuotaExceeded(500, 500)).toBe(true);
    expect(storageQuotaExceeded(501, 500)).toBe(true);
  });
});
