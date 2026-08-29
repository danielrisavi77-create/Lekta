/**
 * Anti-drift gard za vezu PROVJERA -> POPRAVAK.
 *
 * Do 2026-08-16 je ta veza bila pisana hrvatskim NASLOVIMA provjera. Dvije posljedice, obje
 * tihe (bez ijedne tsc greske):
 *   1. preimenovanje naslova odspoji fixer,
 *   2. pravilo napisano nad naslovom koji analiza NIKAD ne emitira je mrtvo, a izgleda zivo.
 *
 * Obje su se stvarno dogodile: pravila za 'Numeriranje stranica' i 'Sekcije' (to su `where`
 * oznake lokacije na issueu, ne naslovi provjera) i regex /razina naslova/i nisu pogadjala
 * nista. Ovi testovi cuvaju da se to ne ponovi.
 */
import { describe, expect, it } from 'vitest';
import {
  CHECK_IDS_BY_DIMENSION,
  CHECK_TITLES,
  AUTO_CHECK_FIXER,
  EMPTY_PARAGRAPHS_CHECK_TITLE,
  classifyFixability,
  classifyFixabilityById,
  dimensionForCheckId,
  wiredCheckIds,
} from '../src/analysis/check-fixer-map';
import { CHECK_ID_BY_TITLE, stableCheckId, isPaperSizeCheckId } from '../src/scoring/check-id-registry';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REGISTERED_IDS = new Set(Object.values(CHECK_ID_BY_TITLE));

describe('check-fixer-map: svaki ozicen checkId stvarno postoji', () => {
  it('nijedno pravilo ne gadja nepostojecu provjeru (mrtav wiring)', () => {
    const unknown = wiredCheckIds().filter((id) => !REGISTERED_IDS.has(id));
    expect(unknown, `ID-jevi bez ijedne registrirane provjere: ${unknown.join(', ')}`).toEqual([]);
  });

  it('svaka dimenzija s auto fixerom ima barem jedan checkId (osim paper-size, koji je dinamican)', () => {
    for (const dimension of Object.keys(AUTO_CHECK_FIXER)) {
      if (dimension === 'paper-size') continue;
      expect(CHECK_IDS_BY_DIMENSION[dimension], dimension).toBeTruthy();
      expect(CHECK_IDS_BY_DIMENSION[dimension].length, dimension).toBeGreaterThan(0);
    }
  });

  it('naslovi u CHECK_TITLES su i dalje stvarni naslovi (prezentacija ne smije driftati)', () => {
    for (const [dimension, title] of Object.entries(CHECK_TITLES)) {
      const id = stableCheckId(title);
      expect(id, `${dimension}: '${title}' nije registriran naslov`).toBeTruthy();
      expect(dimensionForCheckId(id), `${dimension}: naslov vodi na krivu dimenziju`).toBe(dimension);
    }
  });
});

describe('check-fixer-map: klasifikacija ide po ID-u, ne po naslovu', () => {
  it('ID i naslov daju isti rezultat za registrirane provjere', () => {
    for (const [title, id] of Object.entries(CHECK_ID_BY_TITLE)) {
      expect(classifyFixabilityById(id), title).toEqual(classifyFixability(title));
    }
  });

  it('preimenovanje naslova ne mijenja klasifikaciju kad ID ostaje isti', () => {
    // Ovo je cijela poanta porta: nalaz nosi `check.id`, pa je naslov slobodan za preformulaciju.
    expect(classifyFixabilityById('format.font.dominant')).toEqual({ fixability: 'auto', fixId: 'font-fixer' });
    expect(classifyFixabilityById('page.margins')).toEqual({ fixability: 'auto', fixId: 'margins-fixer' });
    expect(classifyFixabilityById(stableCheckId('Dominantni font'))).toEqual({ fixability: 'auto', fixId: 'font-fixer' });
  });

  it('neregistriran ili prazan identitet pada na manual, kao i prije', () => {
    expect(classifyFixabilityById(null).fixability).toBe('manual');
    expect(classifyFixabilityById('nema.takvog.id').fixability).toBe('manual');
    expect(classifyFixability('Naslov koji ne postoji').fixability).toBe('manual');
  });

  it('prazni odlomci ostaju auto (empty-paragraph-fixer)', () => {
    expect(classifyFixability(EMPTY_PARAGRAPHS_CHECK_TITLE)).toEqual({ fixability: 'auto', fixId: 'empty-paragraph-fixer' });
  });
});

describe('format stranice: dinamican naslov dobiva stabilan identitet', () => {
  it('svaka kombinacija formata daje page.size.* ID i vodi na paper-size dimenziju', () => {
    // 'Format stranice (A4/A3)' je prije davao id:null i tiho ispadao iz svakog ID wiringa.
    for (const title of ['Format stranice A4', 'Format stranice (A4)', 'Format stranice (A3/A0)', 'Format stranice (A4/A3)', 'Format stranice (A2/A1/A0)']) {
      const id = stableCheckId(title);
      expect(id, title).toBeTruthy();
      expect(isPaperSizeCheckId(id), title).toBe(true);
      expect(dimensionForCheckId(id), title).toBe('paper-size');
      expect(classifyFixability(title), title).toEqual({ fixability: 'auto', fixId: 'paper-size-fixer' });
    }
  });

  it('zatecena tri registrirana ID-a se NE mijenjaju (korpus se na njih oslanja)', () => {
    expect(stableCheckId('Format stranice A4')).toBe('page.size.a4');
    expect(stableCheckId('Format stranice (A4)')).toBe('page.size.a4-list');
    expect(stableCheckId('Format stranice (A3/A0)')).toBe('page.size.project');
  });
});

describe('section surgery nema svoju provjeru, i to je TOCNO', () => {
  /**
   * `section-surgery-fixer` je ZIVI, naplacen popravak koji nijedna provjera ne klasificira kao
   * 'assisted'. Izgledalo je kao rupa koja laze korisniku; mjerenje 2026-08-19 pokazuje da nije:
   *
   *   - numeriranje sekcija i margine, jedino sto on dira, VEC su pokriveni (page-numbering-fixer
   *     je 'assisted', margins-fixer 'auto'),
   *   - jedina preostala provjera je "Naslovnica bez broja stranice", ali ju emitiraju samo 4
   *     profila i NIJEDAN od njih nema `section-surgery-rules`; obrnuto, svih 22 profila s tim
   *     rules nikad ne emitiraju tu provjeru. Skupovi su disjunktni.
   *
   * Zato je 'manual' tocna klasifikacija, a mapiranje bi bilo lazno obecanje. Test pinna stanje
   * da eventualna promjena bude svjesna: ako neki profil ikad dobije OBOJE, mapiranje ima smisla.
   */
  it('nijedno pravilo ne mapira na section-surgery-fixer (i ne treba)', () => {
    const wired = wiredCheckIds().map((id) => classifyFixabilityById(id).fixId);
    expect(wired).not.toContain('section-surgery-fixer');
  });
});

/**
 * ISTA KLASA KVARA, DRUGO MJESTO: `matchKeys` u `src/ui/repair-items.ts`.
 *
 * Zaglavlje ove datoteke opisuje pravilo pisano nad naslovom koji analiza nikad ne emitira. Gard
 * iznad cuva `check-fixer-map.ts`, ali `repair-items.ts` nikad nije bio pokriven, a upravo ondje
 * `matchKeys` odlucuje hoce li se popravak MOCI izbrojati kao razrijesen: `computeRepairOutcome`
 * radi `stableCheckId(title)` i naslov koji registar ne poznaje odbacuje u `unmappedMatchKeys`,
 * dakle IZVAN `targeted`. Stavka se korisniku nudi, primijeni se i promijeni dokument, a nijedna
 * provjera to ne moze potvrditi.
 *
 * Izmjereno na 102 stvarna rada (`docs/generated/repair-real-corpus.local.json`): 13 razlicitih
 * neregistriranih kljuceva, svaki na 74 do 97 dokumenata.
 *
 * Gleda se SAMO doslovne nizove. Kljucevi izvedeni iz `CHECK_TITLE[...]` dolaze iz registra pa su
 * tocni po konstrukciji.
 */
describe('repair-items: matchKeys moraju biti naslovi koje analiza stvarno emitira', () => {
  const SRC = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui/repair-items.ts'),
    'utf8',
  );
  /** Svaki doslovan `matchKeys: ['...', '...']`, s brojem retka radi citljive poruke o padu. */
  const literalArrays = [...SRC.matchAll(/matchKeys: \[\s*('[^\]]*?')\s*\]/g)].map((m) => ({
    keys: [...m[1].matchAll(/'([^']*)'/g)].map((k) => k[1]),
    line: SRC.slice(0, m.index ?? 0).split('\n').length,
  }));

  it('mjerenje je netrivijalno (inace bi prazan popis "prosao")', () => {
    expect(literalArrays.length).toBeGreaterThanOrEqual(15);
    expect(literalArrays.every((a) => a.keys.length > 0)).toBe(true);
    // Kontrola u DRUGOM smjeru: vecina kljuceva JEST registrirana, pa gard ne "hvata" tako sto
    // odbija sve. Bez ove tvrdnje bi i pokvaren `stableCheckId` (uvijek null) izgledao kao nalaz.
    const all = literalArrays.flatMap((a) => a.keys);
    expect(all.filter((k) => stableCheckId(k)).length).toBeGreaterThan(all.length / 2);
  });

  /**
   * RATCHET, smije samo padati. Tri stavke nemaju NIJEDAN mjerljiv kljuc, dakle strukturno ne mogu
   * biti razrijesene ni na jednom dokumentu: Consistency Engine, Cross-file Submission Consistency
   * i Final Document Inspector. Zadnja od njih stvarno mijenja dokument (vidljiva je u
   * `changedFixerIds` na stvarnom korpusu), pa je jaz izmedju ucinka i mjerenja najveci bas ondje.
   */
  it('nijedna NOVA stavka ne smije ostati bez ijednog mjerljivog kljuca', () => {
    const KNOWN_UNMEASURABLE = 3;
    const zeroKey = literalArrays
      .filter((a) => !a.keys.some((k) => stableCheckId(k)))
      .map((a) => `redak ${a.line}: [${a.keys.join(', ')}]`);
    expect(
      zeroKey.length,
      `stavke bez ijednog registriranog matchKeya:\n${zeroKey.join('\n')}`,
    ).toBeLessThanOrEqual(KNOWN_UNMEASURABLE);
  });

  /** Poimenicni popis neregistriranih kljuceva; svaki novi mora biti svjesna odluka. */
  it('popis neregistriranih kljuceva ne smije rasti', () => {
    const unregistered = [
      ...new Set(literalArrays.flatMap((a) => a.keys).filter((k) => !stableCheckId(k))),
    ].sort();
    expect(unregistered.length, `neregistrirani: ${unregistered.join(' | ')}`).toBeLessThanOrEqual(16);
  });
});
