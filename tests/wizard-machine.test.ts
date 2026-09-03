import { describe, expect, it } from 'vitest';
import {
  SVA_STANJA, SVI_DOGADAJI, transition, viewFor,
  type WizardEvent, type WizardState,
} from '../src/ui/wizard-machine';

/**
 * Gard nad strojem stanja (T16, korak B2).
 *
 * Stroj jos NIJE ozicen u `app.ts`; ovo je cist modul koji tek treba postati jedini pisac. Zato se
 * ovdje tvrdi dvoje: da se slaze s IZMJERENIM ponasanjem (`tests/wizard-characterization.test.ts`)
 * i da nedopusten prijelaz doista vraca `null`.
 *
 * Druga tvrdnja je vaznija nego sto izgleda. Bez nje bi `transition` mogao biti `switch` koji za
 * nepoznat par vrati zatecено stanje, suite bi ostao zelen, a stroj ne bi tvrdio nista. Plan tu
 * zamku imenuje kao najvazniju mutaciju ovog koraka.
 */

describe('wizard-machine: dopusteni prijelazi', () => {
  it('slaze se s izmjerenim tokom carobnjaka', () => {
    // Isti niz koji `wizard-characterization` klika nad pravim `index.html`.
    let s: WizardState = 'dokument';
    const koraci: Array<[WizardEvent, WizardState]> = [
      ['na-profil', 'profil'],
      ['na-provjeru', 'provjera'],
      ['natrag-na-profil', 'profil'],
      ['natrag-na-dokument', 'dokument'],
      ['na-profil', 'profil'],
    ];
    for (const [dogadaj, ocekivano] of koraci) {
      const novo = transition(s, dogadaj);
      expect(novo, `${s} + ${dogadaj}`).toBe(ocekivano);
      s = novo!;
    }
  });

  it('puni tok do rezultata i natrag', () => {
    expect(transition('provjera', 'pokreni-analizu')).toBe('analiza');
    expect(transition('analiza', 'analiza-gotova')).toBe('rezultat');
    expect(transition('rezultat', 'nova-analiza')).toBe('dokument');
    expect(transition('analiza', 'analiza-prekinuta')).toBe('provjera');
  });
});

describe('wizard-machine: nedopusteno je stvarno nedopusteno', () => {
  it('preskakanje koraka nije moguce', () => {
    expect(transition('dokument', 'na-provjeru'), 'iz dokumenta se ne skace na provjeru').toBeNull();
    expect(transition('dokument', 'pokreni-analizu'), 'analiza bez profila').toBeNull();
    expect(transition('profil', 'analiza-gotova'), 'rezultat bez analize').toBeNull();
    expect(transition('rezultat', 'na-profil'), 'iz rezultata se ide samo na novu analizu').toBeNull();
  });

  it('vecina parova stanje/dogadaj je nedopustena, i to je smisao tablice', () => {
    let dopusteni = 0;
    for (const s of SVA_STANJA) for (const d of SVI_DOGADAJI) if (transition(s, d) !== null) dopusteni += 1;
    const ukupno = SVA_STANJA.length * SVI_DOGADAJI.length;
    expect(ukupno).toBe(40);
    // 1 (dokument) + 2 (profil) + 3 (provjera) + 2 (analiza) + 1 (rezultat)
    expect(dopusteni, 'izmjereno: 9 dopustenih od 40 mogucih parova').toBe(9);
    // Kad bi `transition` bio `switch` koji sve propusta, ovdje bi stajalo 40.
    expect(dopusteni).toBeLessThan(ukupno);
  });

  it('nepoznat dogadaj ne rusi stroj nego vraca null', () => {
    expect(transition('dokument', 'ovo-ne-postoji' as WizardEvent)).toBeNull();
  });
});

describe('wizard-machine: viewFor je jedini izvor prikaza', () => {
  it('svako stanje daje TOCNO jedan prikaz', () => {
    for (const s of SVA_STANJA) {
      const v = viewFor(s);
      expect(['wizardView', 'progressView', 'resultView']).toContain(v.prikaz);
    }
  });

  it('korak postoji samo dok je carobnjak vidljiv', () => {
    for (const s of SVA_STANJA) {
      const v = viewFor(s);
      if (v.prikaz === 'wizardView') expect(v.korak, `${s} mora imati korak`).toMatch(/^[123]$/);
      else expect(v.korak, `${s} ne smije nuditi korak, jer carobnjak nije vidljiv`).toBeNull();
    }
  });

  it('koraci 1 do 3 su pokriveni, nijedan ne fali', () => {
    const koraci = SVA_STANJA.map((s) => viewFor(s).korak).filter((k): k is string => k !== null).sort();
    expect(koraci).toEqual(['1', '2', '3']);
  });
});
