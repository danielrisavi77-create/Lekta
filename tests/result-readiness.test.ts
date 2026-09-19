import { describe, expect, it } from 'vitest';
import { resultReadiness, repairCeiling } from '../src/ui/result-readiness';
import type { Check } from '../src/scoring/checks';
import { stableCheckId } from '../src/scoring/check-id-registry';

function chk(title: string, status: string, earned: number, max: number): Check {
  return { category: 'formatting', title, status, earned, max, detail: '', issue: null, scored: max > 0 };
}

describe('spremnost rezultata', () => {
  it('ne mijesa tehnicku ocjenu i blokator predaje', () => {
    const readiness = resultReadiness([{ severity: 'error', category: 'structure', title: 'PAGE', detail: '', where: '' }]);
    expect(readiness.kind).toBe('blocked');
    expect(readiness.label).toBe('Nije spremno za predaju');
    expect(readiness.description).toContain('Tehnička ocjena ne potvrđuje');
  });

  it('razlikuje dorade, rucne provjere i cist automatski nalaz', () => {
    expect(resultReadiness([{ severity: 'warning', category: 'formatting', title: '', detail: '', where: '' }]).kind).toBe('needs-work');
    expect(resultReadiness([{ severity: 'info', category: 'citations', title: '', detail: '', where: '' }]).kind).toBe('manual-review');
    expect(resultReadiness([]).kind).toBe('clear');
  });
});

describe('repairCeiling: maksimalna ocjena koju automatski popravak realno moze jamciti', () => {
  it('bez otvorenih provjera: strop je 100, nema manualnog jaza', () => {
    const ceiling = repairCeiling([chk('Dominantni font', 'pass', 8, 8), chk('Margine dokumenta', 'pass', 6, 6)]);
    expect(ceiling.hasManualGap).toBe(false);
    expect(ceiling.maxScore).toBe(100);
    expect(ceiling.items).toEqual([]);
  });

  it('otvorena provjera s zivim auto-fixerom (npr. font) NE ulazi u manualni jaz', () => {
    const ceiling = repairCeiling([chk('Dominantni font', 'fail', 0, 8), chk('Margine dokumenta', 'pass', 6, 6)]);
    expect(ceiling.hasManualGap).toBe(false);
    expect(ceiling.items).toEqual([]);
  });

  it('otvorena sadrzajna (manual) provjera smanjuje strop i navodi je poimenice', () => {
    // "Potpunost bibliografskih zapisa" ostaje namjerno manual: otkriva MOGUCE nepotpune zapise
    // (nedostaje izdavac/godina/stranice), a bibliography-repair-fixer dira samo poredak, uvlaku i
    // a/b/c sufikse - nikad ne izmislja podatke koji fale. ("Citirano -> literatura" ovdje vise NIJE
    // dobar primjer: od 2026-08-02 ima zivi citation-bibliography-sync-fixer iza sebe, vidi
    // check-fixer-map.ts STRUCTURAL_CHECK_RULES.)
    const ceiling = repairCeiling([
      chk('Potpunost bibliografskih zapisa', 'fail', 3, 10),
      chk('Dominantni font', 'pass', 8, 8),
    ]);
    expect(ceiling.hasManualGap).toBe(true);
    expect(ceiling.items).toEqual([{ title: 'Potpunost bibliografskih zapisa', lostPoints: 7 }]);
    // (8 + 10 - 7) / 18 * 100 = 61.11... -> 61
    expect(ceiling.maxScore).toBe(61);
  });

  it('informativne (max=0) provjere ne ulaze u racun', () => {
    const ceiling = repairCeiling([
      chk('Prazni odlomci', 'warn', 0, 0),
      chk('Dominantni font', 'pass', 8, 8),
    ]);
    expect(ceiling.maxScore).toBe(100);
    expect(ceiling.hasManualGap).toBe(false);
  });

  // Ovi naslovi imaju zivi asistirani fixer (bibliography-rules/citation-sync-rules/
  // required-section-rules od 2026-08-02, page-numbering ranije). Strop MORA ostati 100 kad je
  // otvoreni nalaz bas jedan od njih, jer alat sada stvarno zna to popraviti; da su i dalje
  // 'manual', korisnika bismo lazno uvjeravali da mora rucno intervenirati.
  //
  // POVIJEST: popis je do 2026-08-16 sadrzavao i 'Numeriranje stranica' i 'Sekcije'. Nijedan od
  // ta dva NIJE naslov provjere (oba su `where` oznake lokacije na issueu), pa je test prolazio
  // nad naslovima koje analiza nikad ne emitira i tako "dokazivao" pokrivenost koje nema. Guard
  // ispod sprjecava ponavljanje: svaki naslov u popisu mora biti registriran u check-id-registry.
  const ASSISTED_TITLES = [
    'Citirano → literatura',
    'Literatura → citirano',
    'Isti autor i godina (a/b/c)',
    'Dijelovi verificiranog profila',
    'Numeriranje od prve stranice Uvoda',
    'Shema numeriranja stranica',
  ];

  it('svaki naslov u popisu je STVARNA provjera (registriran checkId), ne izmisljen', () => {
    for (const title of ASSISTED_TITLES) expect(stableCheckId(title), title).toBeTruthy();
  });

  it('otvorena provjera s zivim asistiranim fixerom (bibliografija/citati/numeriranje/dijelovi) NE ulazi u manualni jaz', () => {
    for (const title of ASSISTED_TITLES) {
      const ceiling = repairCeiling([chk(title, 'fail', 0, 10), chk('Dominantni font', 'pass', 8, 8)]);
      expect(ceiling.hasManualGap, title).toBe(false);
      expect(ceiling.maxScore, title).toBe(100);
    }
  });
});

/**
 * Autoritet pravila (RE-63). Do 2026-08-16 je `resultReadiness` primao SAMO `Issue[]`, pa je
 * upozorenje iz generickog fallbacka davalo isti verdikt "Nije spremno za predaju" kao prekrsaj
 * verificiranog pravila fakulteta. Rijec "blokator" je tvrdnja o fakultetovom pravilu i smije se
 * izgovoriti samo kad iza nje stoji potvrdjen sluzbeni izvor.
 */
describe('spremnost: autoritet pravila odvojen od tezine nalaza', () => {
  const err = [{ severity: 'error', category: 'formatting', title: 'X', detail: '', where: '' }];
  const warn = [{ severity: 'warning', category: 'formatting', title: 'X', detail: '', where: '' }];

  it('verificiran profil: ostaje "blokator" i "Nije spremno za predaju"', () => {
    const r = resultReadiness(err, { profileStatus: 'verified', ruleAuthority: 'official-source' });
    expect(r.authoritative).toBe(true);
    expect(r.label).toBe('Nije spremno za predaju');
    expect(r.description).toContain('blokator');
  });

  it('neverificiran profil: isti nalaz je "moguce odstupanje", ne blokator', () => {
    const r = resultReadiness(err, { profileStatus: 'partial', ruleAuthority: 'official-source' });
    expect(r.authoritative).toBe(false);
    expect(r.label).toBe('Provjeri prije predaje');
    expect(r.description).toContain('odstupanj');
    expect(r.description).not.toContain('blokator');
    // Brojanje se NE mijenja: mijenja se samo tvrdnja koju iznosimo o njemu.
    expect(r.blockers).toBe(1);
    expect(r.kind).toBe('blocked');
  });

  it('genericki ruleAuthority obara autoritet i na verified profilu', () => {
    expect(resultReadiness(err, { profileStatus: 'verified', ruleAuthority: 'generic' }).authoritative).toBe(false);
  });

  it('dorade se isto prilagodjavaju autoritetu', () => {
    expect(resultReadiness(warn, { profileStatus: 'verified', ruleAuthority: 'official-source' }).description).toContain('dorad');
    expect(resultReadiness(warn, { profileStatus: 'generic', ruleAuthority: 'generic' }).description).toContain('odstupanj');
  });

  it('bez podatka o autoritetu (stariji pozivatelj) zadrzava zatecenu formulaciju', () => {
    const r = resultReadiness(err);
    expect(r.authoritative).toBe(true);
    expect(r.description).toContain('blokator');
  });
});

describe('slaganje glagola s rodom i brojem', () => {
  /**
   * Do 2026-09-08 je uz promjenjivu imenicu stajao FIKSAN glagol, pa je svaki rad s dva blokatora
   * pisao "Pronađen je 2 blokatora". Kvar je bio vidljiv na svakom takvom radu, a nijedan test ga
   * nije mjerio: postojeci su gledali `toContain('blokator')`, sto prolazi i uz krivi glagol.
   */
  const opis = (n: number, verificiran = true) => resultReadiness(
    Array.from({ length: n }, (_, i) => ({ severity: 'error', title: `x${i}`, detail: '' } as any)),
    verificiran ? { profileStatus: 'verified', ruleAuthority: 'official-source' } : { profileStatus: 'generic', ruleAuthority: 'generic' },
  ).description;

  it('muski rod: 1 / 2 / 5 dobivaju TRI razlicita glagolska oblika', () => {
    expect(opis(1)).toContain('Pronađen je 1 blokator.');
    expect(opis(2)).toContain('Pronađena su 2 blokatora.');
    expect(opis(5)).toContain('Pronađeno je 5 blokatora.');
  });

  it('iznimka 11 do 14 ide u treci oblik unatoc zavrsnoj znamenki', () => {
    // "11 blokator" i "Pronađen je 11" su oba kriva; iznimka vrijedi i za imenicu i za glagol.
    expect(opis(11)).toContain('Pronađeno je 11 blokatora.');
    expect(opis(12)).toContain('Pronađeno je 12 blokatora.');
    expect(opis(21)).toContain('Pronađen je 21 blokator.');
    expect(opis(22)).toContain('Pronađena su 22 blokatora.');
  });

  it('srednji rod na negenerickom profilu ima svoje oblike', () => {
    expect(opis(1, false)).toContain('Pronađeno je 1 moguće odstupanje');
    expect(opis(2, false)).toContain('Pronađena su 2 moguća odstupanja');
    expect(opis(5, false)).toContain('Pronađeno je 5 mogućih odstupanja');
  });

  it('zenski rod: dorade', () => {
    const d = (n: number) => resultReadiness(
      Array.from({ length: n }, (_, i) => ({ severity: 'warning', title: `w${i}`, detail: '' } as any)),
      { profileStatus: 'verified', ruleAuthority: 'official-source' },
    ).description;
    expect(d(1)).toContain('Pronađena je 1 dorada.');
    expect(d(2)).toContain('Pronađene su 2 dorade.');
    expect(d(5)).toContain('Pronađeno je 5 dorada.');
  });

  it('rucne provjere: glagol se slaze i u toj recenici', () => {
    const r = (n: number) => resultReadiness(
      Array.from({ length: n }, (_, i) => ({ severity: 'info', title: `i${i}`, detail: '' } as any)),
      { profileStatus: 'verified', ruleAuthority: 'official-source' },
    ).description;
    expect(r(1)).toContain('ostala je 1 ručna provjera');
    expect(r(2)).toContain('ostale su 2 ručne provjere');
    expect(r(5)).toContain('ostalo je 5 ručnih provjera');
  });
});
