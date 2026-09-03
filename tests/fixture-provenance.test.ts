/**
 * Gard nad PODRIJETLOM commitanih fixtura: sutnja se ne smije citati kao tvrdnja.
 *
 * `sidecarAdmitted` (tests/real-corpus/corpus-track.ts) odbija dokument samo uz izricito
 * `synthetic: true`. Sidecar BEZ ijedne oznake time prolazi kao STVARAN rad, iako o njegovu
 * podrijetlu nitko nista nije tvrdio. Razlika nije formalna: dokument koji prodje kao stvaran nosi
 * tvrdnju `A` ("dokazano na stvarnom radu") prema korisniku.
 *
 * IZMJERENO 2026-09-03, i to dvaput na istom obrascu:
 *   - `pravo-integrirani-fusnote` (443 znaka) nosio je `A`; sidecar je u PROZI pisao "generirano,
 *     nije studentski rad", a proza stroju ne znaci nista. Od 19 sidecara samo 3 su bila oznacena.
 *   - `grf-diplomski-neuskladjen` (387 znakova, sest odlomaka od kojih pet identicnih) nosio je `A`
 *     sa sidecarom koji je imao SAMO `profileId`.
 *
 * ZASTO RATCHET, A NE TVRDA ZABRANA: preostalih sedam neoznacenih su veliki dokumenti (46k-99k
 * znakova) i NE ZNA SE jesu li generirani ili pseudonimizirani stvarni radovi (postoji
 * `src/corpus/pseudonymize.ts`). Upisati im `synthetic: false` znacilo bi TVRDITI podrijetlo koje
 * nitko nije provjerio, dakle ponoviti gresku koju ovaj gard lovi. Zato se sutnja BROJI i imenuje,
 * a broj smije samo padati.
 *
 * PRAG SADRZAJA je razmatran i ODBACEN, izmjereno: velicina ne prati sinteticnost.
 * `lo-fpzg-zavrsni-uskladjen` ima 41 781 znak i JEST sinteticki, a `pmf-matematika-uskladjen`
 * 46 923 i nije; razlika je 12%. Prag bi tri sinteticka dokumenta (22k, 36k, 42k) proglasio
 * stvarnima, dakle uveo bas onu gresku koju treba sprijeciti, samo tise.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'docx');

type Sidecar = { profileId?: unknown; synthetic?: unknown; track?: unknown; note?: unknown };

/**
 * Parsiranje NE SMIJE biti na razini modula bez hvatanja: neispravan sidecar bi tada srusio
 * SAKUPLJANJE datoteke, pa vitest javi "no tests" i gard tiho ne odradi nista. Izmjereno pri pisanju
 * ovog testa, na sidecaru s BOM-om. Kvar se zato pretvara u PODATAK i nosi vlastitu tvrdnju.
 */
const sidecars = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => {
    try {
      return { name, data: JSON.parse(readFileSync(join(DIR, name), 'utf8')) as Sidecar, parseError: null as string | null };
    } catch (error) {
      return { name, data: {} as Sidecar, parseError: String(error) };
    }
  });

/** Izricita oznaka podrijetla. `note` NE vrijedi: proza je za ljude, ne za stroj. */
const hasExplicitProvenance = (s: Sidecar): boolean => s.synthetic !== undefined || s.track !== undefined;

describe('podrijetlo commitanih fixtura', () => {
  it('mjerenje je netrivijalno (inace bi prazan direktorij "prosao")', () => {
    expect(sidecars.length).toBeGreaterThanOrEqual(15);
    expect(sidecars.every((s) => typeof s.data.profileId === 'string')).toBe(true);
  });

  it('svaki sidecar je ISPRAVAN JSON (inace gard tiho ne odradi nista)', () => {
    const pokvareni = sidecars.filter((s) => s.parseError).map((s) => `${s.name}: ${s.parseError}`);
    expect(pokvareni).toEqual([]);
  });

  it('predikat razlikuje oznaceno od neoznacenog (inace ratchet ispod ne mjeri nista)', () => {
    expect(hasExplicitProvenance({ profileId: 'x', synthetic: true })).toBe(true);
    expect(hasExplicitProvenance({ profileId: 'x', synthetic: false })).toBe(true);
    expect(hasExplicitProvenance({ profileId: 'x', track: 'generated' })).toBe(true);
    // Sam `note`, ma sto u njemu pisalo, NIJE oznaka. To je kvar koji se dogodio osam puta.
    expect(hasExplicitProvenance({ profileId: 'x', note: 'generirano, nije studentski rad' })).toBe(false);
    expect(hasExplicitProvenance({ profileId: 'x' })).toBe(false);
  });

  /**
   * RATCHET, smije samo padati. Svaki NOV fixture mora doci s izricitom oznakom podrijetla; ovih
   * sedam su zatecena sutnja koju netko tko zna njihovo podrijetlo treba razrijesiti.
   */
  it('broj fixtura bez izricite oznake podrijetla ne smije rasti', () => {
    const ZATECENO = 7;
    const bez = sidecars.filter((s) => !hasExplicitProvenance(s.data)).map((s) => s.name);
    expect(bez.length, `bez izricite oznake podrijetla:\n${bez.join('\n')}`).toBeLessThanOrEqual(ZATECENO);
  });

  /** Oznacen kao sinteticki znaci da ga korpus NE smije uzeti kao dokaz stvarnog rada. */
  it('sinteticki fixturi su izricito oznaceni, ne samo opisani u prozi', () => {
    const prozaBezZastavice = sidecars.filter(
      (s) => s.data.synthetic === undefined && /generira|nije studentski rad|izmisljen/i.test(String(s.data.note ?? '')),
    );
    expect(prozaBezZastavice.map((s) => s.name)).toEqual([]);
  });
});
