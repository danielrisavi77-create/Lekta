/**
 * Tvrdnja "ova provjera ne kaznjava dokument", tocna i nakon razdvajanja `pass` i `informational`.
 *
 * Do 2026-08-17 su nebodovane provjere (max === 0) nosile status `'pass'`, pa su testovi pisali
 * `expect(check(...).status).toBe('pass')` i za dimenzije koje profil UOPCE NE PROPISUJE. Ta je
 * tvrdnja bila dvoznacna: prolazila bi i da provjera stvarno mjeri i da se samo ne boduje.
 *
 * Ovaj pomocnik je STROZI od onoga sto je zamijenio, jer status vezuje uz `max`:
 *   - bodovana provjera (max > 0) mora biti `'pass'`,
 *   - nebodovana (max === 0) mora biti `'informational'`.
 * Time hvata i obrnutu gresku: informativnu provjeru koja bi ponovno pocela javljati `'pass'`.
 */
import { expect } from 'vitest';

interface StatusCheck {
  title?: string;
  status?: string;
  max?: number;
}

export function expectNotPenalised(check: StatusCheck | undefined): void {
  expect(check, 'provjera ne postoji u rezultatu').toBeTruthy();
  const label = check?.title ?? '(bez naslova)';
  if ((check?.max ?? 0) === 0) expect(check?.status, `${label}: nebodovana provjera`).toBe('informational');
  else expect(check?.status, `${label}: bodovana provjera`).toBe('pass');
}
