/**
 * Vezanje BODOVANE VRIJEDNOSTI na verificiranu tvrdnju (`src/verification/scored-value-binding.ts`).
 *
 * Zasto postoji: lanac dokaza (izvor + snapshot + stranica + doslovan citat + potpis) zivio je u
 * `ruleEntries`, a motor je bodovao iz naslijedjenog `profile.rules`. Ta dva nikad se nisu
 * usporedjivala, pa je 40 parova (profil, os) kroz 23 profila bodovalo vrijednost koju njihova
 * vlastita `verified` tvrdnja s citatom opovrgava. Najostriji: `unizd-pomorski-*`, gdje izvor
 * propisuje Merriweather 10 pt, a motor je trazio Times New Roman/Arial/Calibri 11-12 pt, pa je rad
 * koji tocno slijedi svoju uputu gubio bodove.
 *
 * Test cuva tri stvari: da artefakt ne zastari, da broj raskoraka moze samo padati, i da provjera
 * STVARNO GRIZE (negativna kontrola), jer gard bez dokaza da grize je gori od nikakvog.
 */
import { describe, it, expect } from 'vitest';
import baked from '../data/verification/scored-value-drift.json';
import bakedAdvisory from '../data/profiles/advisory-map.json';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { buildScoredValueDrift } from '../src/verification/scored-value-drift';
import {
  findScoredValueFindings,
  sameRuleValue,
} from '../src/verification/scored-value-binding';
import type { ThesisProfile, SourceEntry, RuleEntry } from '../src/profiles/profile-schema';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];
const ALL = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];

/**
 * RATCHET. Ove brojke smiju samo PADATI. Kad padnu, spusti ih ovdje u istom commitu; kad porastu,
 * nesto je novo bodovano mimo vlastitog dokaza i to je nalaz, ne razlog da se broj podigne.
 * Zatecено stanje 2026-08-22 (prvo mjerenje ikad).
 */
const RATCHET = {
  /**
   * Tvrdnja kaze X, motor boduje Y. Demotirano dok vlasnik ne presudi svaki slucaj.
   * 2026-08-23: 40 -> 38, jer su dva `vuka-strojarski` pravila oznacena `needs-recheck` (citat im
   * ne postoji u izvoru). Ratchet se SPUSTA u istom commitu u kojem nalaz nestane; da se nije
   * spustio, gard bi nosio dvije jedinice neradjene zalihe i dva nova raskoraka bi prosla zeleno.
   *
   * 2026-08-24: NULA. Svih 37 je presudjeno i potpisano (`data/verification/drift-decisions.json`,
   * 35 `claim` + 2 `claim-wrong`). Od sada svaki raskorak koji se pojavi znaci da je nesto poceto
   * bodovati mimo vlastitog dokaza, i gard pada odmah, bez zalihe.
   */
  drift: 0,
  /** Verificirana tvrdnja postoji, a motor tu dimenziju uopce ne provjerava (tiho popustanje). */
  unapplied: 24,
  /** Motor boduje dimenziju bez ijedne tvrdnje: svih 82 su u 14 profila koji nemaju nijedan ruleEntry. */
  unbacked: 82,
  /**
   * Tvrdnja nosi ljudski opis stila umjesto kanonskog tokena (`apa` umjesto `apa7`).
   * 2026-08-29: 26 -> 23 nakon commita `32f869e2`.
   * 2026-08-30: 23 -> 2. Kanonizirano je 16 tvrdnji, svaka uz zapisan razlog: 13 x "apa" -> `apa7`
   * (izvor imenuje APA bez izdanja; TUMACENJE, jer motor nema token za APA bez izdanja, a `custom`
   * bi odbacio autor-godina provjere koje izvor trazi), 2 x "autor-godina" -> `harvard` (izvor
   * opisuje SUSTAV, ne prirucnik; `harvard` je u ovom repozitoriju token opceg autor-godina), i
   * 1 x "chicago" -> `chicago-author`, sto je CITANJE a ne tumacenje: citat glasi "prilagodjeni
   * (autor godina, broj stranice) Chicago stil".
   */
  'citation:non-canonical-token': 2,
  /**
   * Tvrdnja o stilu postoji, motor nema `recommendedCitation`, pa vrijedi korisnikov odabir.
   * 2026-08-29: 6 -> 4.
   *
   * 2026-08-30: 4 -> 10, i to je RAST KOJI ZNACI VISE VIDLJIVOSTI, ne vise kvara. Kanonizacija je
   * sest tvrdnji prevela iz ljudskog opisa u kanonski token, pa ih ova mjera od tada uopce vidi;
   * prije su ispadale kroz `non-canonical-token`.
   *
   * NIJEDNA se NE smije primijeniti i to je provjereno pojedinacno: svih deset je `advisory`, a
   * savjetodavna tvrdnja ne smije konfigurirati bodovanje. Citati to i potvrdjuju: `foi` kaze
   * "FOI dopusta APA ili IEEE stil (student bira uz mentora)", `iv` razlikuje drustvene i tehnicke
   * znanosti, `fhs` upucuje na "zasebne upute u folderima". Kod `efst-opci-akademski-rad` citat
   * uopce ne govori o citiranju nego o fontu i proredu; taj je slucaj vec pokriven mjerom
   * `styleNotInQuote` u citation-claim-coverage.
   */
  'citation:not-applied': 10,
  /**
   * Tvrdnja i motor nose RAZLICIT kanonski token. Do 2026-08-29 ova vrsta nije imala nijedan slucaj
   * pa nije ni bila u ratchetu, sto znaci da je rasla nezapazeno.
   *
   * Pojavila se s commitom `32f869e2` ("IEEE maknut s 26 profila jer ga nijedan izvor ne propisuje"):
   * motor je prebacen na `custom`, ali je na devet profila `citation-style` tvrdnja ostala `ieee`.
   * SEST od devet je `scored: true` (`riteh-*`, `vvg-*`, `vuka-sigurnost-*`), dakle bodovana
   * vrijednost proturjeci vlastitoj verificiranoj tvrdnji, tocno ono sto tvrdo pravilo u CLAUDE.md
   * zabranjuje. Zahvat na motoru je bio ispravan; nedovrsena je druga polovica, same tvrdnje.
   *
   * ZATVORENO 2026-08-30, spusteno s 9 na 0. Druga polovica je dovrsena: svih 14 `citation-style`
   * tvrdnji s vrijednoscu `ieee` prebaceno je na `custom`. Devet ih je prvi prolaz promasio jer
   * draftovi u ovom repozitoriju imaju DVA oblika, `profiles: {}` i `entries: []`, a obilazak je
   * znao samo prvi; drugi prolaz ide neovisno o obliku. Dijagnoza iznad je bila tocna i pomogla je
   * naci preostalih devet.
   */
  'citation:value-mismatch': 0,
  /**
   * Motor NOSI `recommendedCitation`, a profil nema nijednu tvrdnju o stilu. Ta vrijednost bira
   * citatni motor koji analizira studentov rad, dakle mijenja nalaze, a nijedan izvor je ne
   * propisuje.
   *
   * Zateceno stanje 2026-08-29 (prvo mjerenje): 95 profila. Raspodjela po vrijednosti:
   * harvard 38, vancouver 13, apa7 13, chicago-notes 12, custom 12, chicago-author 5,
   * pravo-fusnote 2. (Ispravak 2026-08-31: ovdje je stajalo `ieee 12`. U artefaktu NEMA nijednog
   * `ieee`; commit `32f869e2` ih je prebacio na `custom`. Zbroj 95 je bio tocan, oznaka nije.)
   *
   * Ovo je ISTA klasa koju je FER pilot otkrio na jednom profilu (IEEE bez izvora, ispravljeno
   * 2026-08-22), samo 95 puta. Nijedan postojeci gard je nije vidio: `scored-value-binding` mjeri
   * samo BODOVANE osi, a citatni stil se ne boduje, pa profil bez tvrdnje nije proizvodio redak.
   * Broj smije samo padati: ili se nadje izvor i upise tvrdnja, ili se vrijednost makne.
   */
  'citation:unbacked': 95,
} as const;

/** Potpuno valjana bodovana tvrdnja vezana na snapshotiran izvor (isti obrazac kao verification-gate.test). */
function scoredEntry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'r-font',
    checkId: 'font',
    value: ['Times New Roman'],
    authority: 'general',
    sourceId: 'pravo-upute-oblikovanje-2024',
    sourcePage: 'odjeljak 4',
    quote: 'font: Times New Roman',
    status: 'verified',
    lastVerified: '2026-06-29',
    ...over,
  };
}

describe('scored-value-drift: artefakt je u koraku s podacima', () => {
  it('commitani izlaz je identican svjezem izracunu (inace: npm run scored-value-drift)', () => {
    const fresh = buildScoredValueDrift(ALL, SOURCES);
    expect(fresh).toEqual(baked as unknown as ReturnType<typeof buildScoredValueDrift>);
  });

  it('mjerenje je netrivijalno (guard protiv vacuous-pass)', () => {
    expect(ALL.length).toBeGreaterThan(100);
    const withEntries = ALL.filter((p) => (p.ruleEntries ?? []).length > 0).length;
    expect(withEntries).toBeGreaterThan(300);
  });

  it('ratchet: nijedna vrsta nalaza ne smije narasti', () => {
    const counts = (baked as { counts: Record<string, number> }).counts;
    for (const [kind, cap] of Object.entries(RATCHET)) {
      expect(counts[kind] ?? 0, `${kind} je narastao iznad ratcheta`).toBeLessThanOrEqual(cap);
    }
  });
});

/**
 * OVE DVIJE TVRDNJE SU OD 2026-08-24 PRAZNE, i to je namjerno stanje, ne propust: nema vise nijednog
 * raskoraka. Ostaju jer su drift-gard nad artefaktom: cim se raskorak vrati, moraju ga uhvatiti.
 *
 * Da mehanizam i dalje GRIZE dokazuje mutacija `demotija/osnovni-izracun-ne-ovisi-o-raskoraku` u
 * tests/gate-mutations.test.ts, koja raskorak PODMECE umjesto da ga trazi u podacima. Bez nje bi
 * ovaj opis bio isprika za vakuumski prolaz.
 */
describe('scored-value-drift: demotija stvarno stize do motora', () => {
  it('svaka os s raskorakom je demotirana u pecenoj advisory mapi', () => {
    const demoted = (baked as { demotedByProfile: Record<string, string[]> }).demotedByProfile;
    const advisory = bakedAdvisory as Record<string, string[]>;
    const missing: string[] = [];
    for (const [profileId, checkIds] of Object.entries(demoted)) {
      for (const checkId of checkIds) {
        if (!advisory[profileId]?.includes(checkId)) missing.push(`${profileId}/${checkId}`);
      }
    }
    // Ako ovo padne: `npx vite-node scripts/gen-profile-runtime-maps.mts` pa commitaj mapu.
    expect(missing).toEqual([]);
  });

  it('demotija pokriva tocno one profile koje artefakt imenuje', () => {
    const demoted = (baked as { demotedByProfile: Record<string, string[]> }).demotedByProfile;
    expect(Object.keys(demoted).length).toBe((baked as { counts: Record<string, number> }).counts.profilesDemoted);
  });
});

describe('scored-value-binding: provjera grize (negativne kontrole)', () => {
  const sources = SOURCES;

  it('tvrdnja koja se SLAZE sa zrcalom ne daje nalaz', () => {
    const profile = {
      id: 'kontrola-slaze-se',
      rules: { font: ['Times New Roman'] },
      ruleEntries: [scoredEntry()],
    } as ThesisProfile;
    expect(findScoredValueFindings(profile, sources)).toEqual([]);
  });

  it('podmetnuta druga vrijednost daje `drift` s obje strane u nalazu', () => {
    const profile = {
      id: 'kontrola-drift',
      rules: { font: ['Arial'] },
      ruleEntries: [scoredEntry()],
    } as ThesisProfile;
    const found = findScoredValueFindings(profile, sources);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'drift',
      checkId: 'font',
      claimValue: ['Times New Roman'],
      scoredValue: ['Arial'],
      sourceId: 'pravo-upute-oblikovanje-2024',
    });
  });

  it('tvrdnja koju motor uopce ne primjenjuje daje `unapplied`', () => {
    const profile = {
      id: 'kontrola-unapplied',
      rules: {},
      ruleEntries: [scoredEntry()],
    } as ThesisProfile;
    const found = findScoredValueFindings(profile, sources);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('unapplied');
  });

  it('bodovanje bez ijedne tvrdnje daje `unbacked` samo kad os NIJE demotirana', () => {
    const profile = { id: 'kontrola-unbacked', rules: { font: ['Arial'] }, ruleEntries: [] } as ThesisProfile;
    expect(findScoredValueFindings(profile, sources, { demotedCheckIds: new Set() })).toHaveLength(1);
    expect(findScoredValueFindings(profile, sources, { demotedCheckIds: new Set(['font']) })).toEqual([]);
  });

  it('NEverificirana tvrdnja se ne usporedjuje (nije dokaz ni o cemu)', () => {
    const profile = {
      id: 'kontrola-draft',
      rules: { font: ['Arial'] },
      ruleEntries: [scoredEntry({ status: 'draft' })],
    } as ThesisProfile;
    // Bez demotedCheckIds nema `unbacked` grane, pa draft tvrdnja ne smije proizvesti nista.
    expect(findScoredValueFindings(profile, sources)).toEqual([]);
  });
});

/**
 * Negativne kontrole za `citation:unbacked`.
 *
 * Ova grana se racuna iz ODSUTNOSTI tvrdnje, sto je obrnuto od svih ostalih, pa se lako pokvari u
 * oba smjera: rani `return []` ju je sutke gutao (kvar koji je i motivirao dodavanje), a preohlapa
 * verzija bi prijavila svaki profil koji uopce nema citatni stil. Zato kontrole idu u OBA smjera,
 * ukljucujuci povijesni slucaj koji je klasu otkrio (IEEE bez ijednog izvora, FER 2026-08-22).
 */
describe('citation:unbacked grize u oba smjera', () => {
  const citation = (profile: ThesisProfile) =>
    buildScoredValueDrift([profile], SOURCES).citationStyle;

  it('BASELINE: profil bez stila i bez tvrdnje ne daje nista', () => {
    const profile = { id: 'kontrola-bez-stila', rules: {}, ruleEntries: [] } as ThesisProfile;
    expect(citation(profile)).toEqual([]);
  });

  it('motor nosi stil bez ijedne tvrdnje: nalaz `unbacked` s vrijednoscu koju motor stvarno pokrece', () => {
    const profile = {
      id: 'kontrola-citation-unbacked',
      rules: { recommendedCitation: 'ieee' },
      ruleEntries: [],
    } as ThesisProfile;
    const found = citation(profile);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'unbacked',
      profileId: 'kontrola-citation-unbacked',
      ruleId: null,
      claimValue: null,
      liveValue: 'ieee',
      sourceId: null,
    });
  });

  it('tvrdnja koja pokriva stil ukida `unbacked` (inace bi se isti profil prijavio dvaput)', () => {
    const profile = {
      id: 'kontrola-citation-pokriven',
      rules: { recommendedCitation: 'harvard' },
      ruleEntries: [scoredEntry({ ruleId: 'r-cit', checkId: 'citation-style', value: 'harvard' })],
    } as ThesisProfile;
    expect(citation(profile)).toEqual([]);
  });

  it('tvrdnja bez zivog stila ostaje `not-applied`, ne postaje `unbacked`', () => {
    const profile = {
      id: 'kontrola-citation-not-applied',
      rules: {},
      ruleEntries: [scoredEntry({ ruleId: 'r-cit', checkId: 'citation-style', value: 'harvard' })],
    } as ThesisProfile;
    const found = citation(profile);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('not-applied');
  });
});

describe('sameRuleValue: normalizacija koja je nuzna, ne kozmeticka', () => {
  it('skalar i jednoclana lista su isto (motor usporedjuje clanstvo u skupu)', () => {
    expect(sameRuleValue(12, [12])).toBe(true);
    expect(sameRuleValue(1.5, [1.5])).toBe(true);
  });

  it('redoslijed u popisu dopustenih fontova nije razlika', () => {
    expect(sameRuleValue(['Arial', 'Times New Roman'], ['Times New Roman', 'Arial'])).toBe(true);
  });

  it('stvarna razlika ostaje razlika', () => {
    expect(sameRuleValue([12], [11, 12])).toBe(false);
    expect(sameRuleValue(['Merriweather'], ['Times New Roman'])).toBe(false);
    expect(sameRuleValue({ top: 2.5, left: 3.5 }, { top: 2.5, left: 2.5 })).toBe(false);
  });

  it('objekt i lista nisu ista vrijednost ma kako se serijalizirali', () => {
    // Pravilo stoji: motor prima listu i `profile.size.some` bi na objektu pukao, pa usporedba ne
    // smije objekt tiho izjednaciti s popisom.
    expect(sameRuleValue({ min: 10, max: 12 }, [10, 11, 12])).toBe(false);
    // Slucaj koji je to motivirao (fbf-specijalisticki) VISE NE DOLAZI dovde: raspon se prosiruje u
    // popis jos u `rule-compiler.applyEntry`, dakle na izvoru, a ne zaobilazi ovdje na usporedbi.
    // Razlika je bitna jer bi popustanje ovdje sakrilo i stvaran raskorak nad marginama, gdje je
    // objekt (strane) legitiman oblik. Gard: mutacija `kompajler/raspon-se-prosiruje-u-popis`.
  });
});
