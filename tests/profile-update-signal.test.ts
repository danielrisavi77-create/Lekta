import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { profileUpdatesInFlight, profileUpdatesSettled, trackProfileUpdate } from '../src/ui/profile-update-signal';

/**
 * SIGNAL "PROFIL JE AZURIRAN" (korak C7, 2026-09-13): gard nad `src/ui/profile-update-signal.ts`.
 *
 * Razlog postojanja modula je `tests/confirmed-profile-restore.test.ts`, koji je do C7 prije
 * demontaze cekao FIKSNIH 400 ms. Tajmer mjeri vrijeme, a trazi se dogadjaj: "nijedan
 * `updateProfile` vise nije u letu". Ovdje se tvrdi da signal mjeri STVARNE repove, ne prazninu:
 * dok je obecanje u letu, `profileUpdatesSettled()` NE SMIJE biti ispunjeno (inace je isti vakuum
 * kao tajmer od 0 ms), a rep koji padne broji se kao zavrsen (cekatelj zeli znati da nista vise ne
 * dira DOM, ne da je sve uspjelo).
 *
 * Mutacija NAD IZVOROM (izvedena rucno, poruka pada u commit poruci): `profileUpdatesSettled`
 * koji uvijek vrati `Promise.resolve()` pada na tvrdnji "nije ispunjeno dok je rep u letu".
 */

/** Rjesivo obecanje, da test sam odlucuje kad rep zavrsava. */
function odgodjeno<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Je li obecanje vec ispunjeno. Zastavica se cita nakon JEDNOG makrozadatka, jer se do tada
 * isprazne svi mikrozadaci. Prva izvedba je utrkivala `p.then(...)` s `Promise.resolve(marker)`,
 * a to mjeri redoslijed mikrozadataka (`then` je uvijek tick iza), ne ispunjenost: baseline je pao
 * na ispunjenom obecanju, a mutacija je prosla. Zato makrozadatak, ne race.
 */
async function ispunjeno(p: Promise<void>): Promise<boolean> {
  let gotovo = false;
  void p.then(() => { gotovo = true; });
  await new Promise<void>((r) => setTimeout(r, 0));
  return gotovo;
}

describe('profile-update-signal: dogadjaj umjesto sata', () => {
  it('CIST BASELINE: bez repova signal je odmah ispunjen i brojac je nula', async () => {
    expect(profileUpdatesInFlight()).toBe(0);
    expect(await ispunjeno(profileUpdatesSettled())).toBe(true);
  });

  it('dok je rep u letu signal NIJE ispunjen; ispuni se tek kad rep zavrsi', async () => {
    const rep = odgodjeno<string>();
    const vraceno = trackProfileUpdate(rep.promise);
    expect(vraceno, 'izvorno obecanje se vraca netaknuto').toBe(rep.promise);
    // SENTINEL: brojac RAZLICIT OD NULE, inace bi tvrdnja "nije ispunjeno" bila o praznini.
    expect(profileUpdatesInFlight()).toBe(1);
    const cekanje = profileUpdatesSettled();
    expect(await ispunjeno(cekanje), 'signal se ispunio dok je updateProfile jos u letu').toBe(false);
    rep.resolve('gotovo');
    await cekanje;
    expect(profileUpdatesInFlight()).toBe(0);
  });

  it('dva repa: signal ceka OBA; rep koji padne broji se kao zavrsen, a greska ostaje pozivatelju', async () => {
    const a = odgodjeno<void>();
    const b = odgodjeno<void>();
    const vracenoB = trackProfileUpdate(b.promise);
    trackProfileUpdate(a.promise);
    expect(profileUpdatesInFlight()).toBe(2);
    const cekanje = profileUpdatesSettled();
    a.resolve();
    await a.promise;
    expect(await ispunjeno(cekanje), 'jedan rep je jos u letu').toBe(false);
    b.reject(new Error('rep je pao'));
    await expect(vracenoB, 'pozivatelj i dalje vidi svoju gresku').rejects.toThrow('rep je pao');
    await cekanje;
    expect(profileUpdatesInFlight()).toBe(0);
  });

  it('app.ts omata updateProfile signalom, a restore test ceka signal, ne sat od 400 ms', () => {
    const app = readFileSync(resolve(__dirname, '..', 'src', 'ui', 'app.ts'), 'utf8');
    expect(app.length).toBeGreaterThan(0);
    expect(app).toContain('function updateProfile(){return trackProfileUpdate(_updateProfile())}');
    const restore = readFileSync(resolve(__dirname, 'confirmed-profile-restore.test.ts'), 'utf8');
    expect(restore.length).toBeGreaterThan(0);
    expect(restore).toContain('profileUpdatesSettled()');
    expect(restore, 'fiksni tajmer se vratio').not.toMatch(/settle = \(ms = 400\)/);
  });
});
