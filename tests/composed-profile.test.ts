/**
 * Invarijanti SLOZENOG profila (src/profiles/compose-profile.ts), BEZ ijedne analize dokumenta.
 *
 * Sirova conformance matrica mjeri profil iz registra; student dobiva profil nakon jos cetiri
 * sloja. Ovdje se dokazuje da ti slojevi rade tocno ono sto tvrde: demotija gasi bas dimenzije
 * koje pise advisory mapa (i nijednu drugu), katedra dodaje svoje zahtjeve, a mentorov override
 * vraca dimenzije koje je normalizeCheckFlags ugasio.
 *
 * Analiticka strana istog sloja (uskladjen + neuskladjen docx nad slozenim profilom) je uzorkom u
 * tests/conformance/composed.test.ts (puna matrica) i u tests/conformance-composed-tripwire (check).
 */
import { describe, it, expect } from 'vitest';
import {
  allConformanceCases,
  buildComposedProfile,
  demotionSampleCases,
  departmentCases,
  deriveComposedPlan,
  deriveConformancePlan,
  overrideCases,
  MENTOR_OVERRIDE,
  type ConformanceDim,
} from './helpers/conformance';
import { DEMOTION } from '../src/profiles/advisory-levers';
import advisoryMap from '../data/profiles/advisory-map.json';

/** Poluga demotije (checkId) -> dimenzija conformance plana. */
const LEVER_TO_DIM: Record<string, ConformanceDim> = {
  'font': 'font',
  'font-size': 'size',
  'line-spacing': 'spacing',
  'margins': 'margins',
  'justify': 'justify',
  'paper-size': 'paper',
  'toc': 'toc',
  'page-numbers': 'pagenums',
};

/**
 * Nijedna demotirana dimenzija ne smije ostati bodovana. Popis je prazan i takav mora ostati: do
 * 2026-08-22 je ovdje stajao `arh-diplomski [paper]`, jer je poluga 'paper-size' gasila samo
 * `requireA4`, a taj profil format propisuje preko `paperSizes: ['A3','A0']`, koje engine boduje
 * vlastitom granom. Popravljeno u advisory-levers: poluga gasi obje grane.
 */
const DEMOTION_LEAKS: string[] = [];

describe('slozeni profil: demotija', () => {
  it('poluge pokrivaju svaki checkId koji se pojavljuje u advisory mapi', () => {
    const known = new Set(DEMOTION.map(([id]) => id));
    const used = new Set(Object.values(advisoryMap as Record<string, string[]>).flat());
    const unknown = [...used].filter((id) => !known.has(id));
    // Nepoznat checkId u mapi znaci demotiju koja se tiho NE primjenjuje: pravilo ostaje bodovano
    // iako verifikacija kaze da ne smije biti.
    expect(unknown).toEqual([]);
    for (const id of used) expect(LEVER_TO_DIM[id], `poluga ${id} nema dimenziju u planu`).toBeTruthy();
  });

  it('gasi TOCNO dimenzije iz advisory mape, ni jednu vise ni manje', () => {
    const map = advisoryMap as Record<string, string[]>;
    const stillScored: string[] = [];
    const lostWithoutDemotion: string[] = [];
    const appeared: string[] = [];
    for (const c of allConformanceCases()) {
      const raw = new Set(deriveConformancePlan(c.profileId, c.workType).assertions.map((a) => a.dim));
      const composed = new Set(
        deriveComposedPlan({ id: c.id, profileId: c.profileId, workType: c.workType }).assertions.map((a) => a.dim),
      );
      const demoted = new Set((map[c.profileId] || []).map((d) => LEVER_TO_DIM[d]).filter(Boolean));
      for (const dim of raw) {
        if (demoted.has(dim) && composed.has(dim)) stillScored.push(`${c.profileId} [${dim}]`);
        if (!demoted.has(dim) && !composed.has(dim)) lostWithoutDemotion.push(`${c.profileId} [${dim}]`);
      }
      for (const dim of composed) if (!raw.has(dim)) appeared.push(`${c.profileId} [${dim}]`);
    }
    expect([...new Set(stillScored)].sort()).toEqual([...DEMOTION_LEAKS].sort());
    // Dimenzija koja nestane BEZ demotije znaci da neki sloj tiho gasi bodovanje: student ne bi
    // izgubio bodove koje profil propisuje, ali ni saznao da se pravilo ne provjerava.
    expect(lostWithoutDemotion).toEqual([]);
    // Slaganje nikad ne smije DODATI bodovanu dimenziju koju profil nema (izmisljeno pravilo).
    expect(appeared).toEqual([]);
  });

  it('ne mijenja vrijednosti pravila, samo bodovanost', () => {
    for (const c of allConformanceCases().slice(0, 60)) {
      const raw = deriveConformancePlan(c.profileId, c.workType).profile;
      const composed = buildComposedProfile({ id: c.id, profileId: c.profileId, workType: c.workType });
      for (const key of ['font', 'size', 'spacing', 'margins', 'wordMin', 'wordMax'] as const) {
        expect(composed[key], `${c.profileId}: ${key} promijenjen slaganjem`).toEqual(raw[key]);
      }
      // paperSizes je jedini kljuc koji demotija smije isprazniti (to je druga bodovana grana
      // formata stranice); bez demotije mora ostati identican.
      const paperDemoted = ((advisoryMap as Record<string, string[]>)[c.profileId] || []).includes('paper-size');
      if (!paperDemoted) expect(composed.paperSizes, `${c.profileId}: paperSizes`).toEqual(raw.paperSizes);
    }
  });

  it('demotija formata gasi OBJE grane bodovanja (requireA4 i paperSizes)', () => {
    // arh-diplomski je jedini profil koji format propisuje popisom, a ima ga demotiranog.
    const raw = deriveConformancePlan('arh-diplomski', 'graduate').profile;
    const composed = buildComposedProfile({ id: 'arh', profileId: 'arh-diplomski', workType: 'graduate' });
    expect(raw.paperSizes).toEqual(['A3', 'A0']);
    expect(composed.paperSizes).toEqual([]);
    expect(composed.requireA4).toBe(false);
  });
});

/**
 * Nijedan katedrin zahtjev ne smije nestati. Popis je prazan i takav mora ostati: do 2026-08-22 je
 * demotija (vezana uz ID OSNOVNOG profila, primijenjena POSLIJE overlaya katedre) gasila
 * `requireToc` koji katedra izricito trazi vlastitim sluzbenim izvorom, na 5 od 8 kombinacija.
 * Popravljeno u advisory-levers.demotionProtectedBy: dimenziju koju je propisao specificniji izvor
 * demotija preskace, i takva dimenzija ne ulazi u advisoryDimensions.
 */
const DEPARTMENT_REQUIREMENTS_LOST: string[] = [];

describe('slozeni profil: katedra', () => {
  it('overlay katedre unosi svoje zahtjeve u pravila (osim dokumentiranog duga)', () => {
    const cases = departmentCases();
    expect(cases.length).toBeGreaterThanOrEqual(8);
    const lost: string[] = [];
    for (const c of cases) {
      const withoutDept = buildComposedProfile({ id: c.id, profileId: c.profileId, workType: c.workType });
      const withDept = buildComposedProfile(c);
      // Svaka danasnja katedra propisuje sadrzaj i brojeve stranica vlastitim izvorom.
      for (const key of ['requireToc', 'requirePageNumbers'] as const) {
        if (withDept[key] !== true) lost.push(`${c.id} [${key}]`);
      }
      // Overlay ne smije obrisati pravila osnovnog profila koja sam ne spominje.
      expect(withDept.font ?? withoutDept.font).toBeTruthy();
    }
    expect(lost.sort()).toEqual([...DEPARTMENT_REQUIREMENTS_LOST].sort());
  });

  it('rulesByWorkType overlay ovisi o vrsti rada', () => {
    const perWorkType = departmentCases().filter((c) => c.departmentId === 'trgovacko-pravo');
    expect(perWorkType.length).toBe(2); // seminar + graduate
    const values = perWorkType.map((c) => buildComposedProfile(c).charMin);
    // Trgovacko pravo propisuje razlicit opseg za seminar i diplomski; da overlay po vrsti rada ne
    // radi, obje bi vrijednosti bile iste (ili bi nedostajale).
    expect(new Set(values).size).toBe(2);
    for (const v of values) expect(typeof v).toBe('number');
  });
});

describe('slozeni profil: mentorov override', () => {
  it('override propisuje sve cetiri dimenzije i pali njihovo bodovanje', () => {
    for (const c of overrideCases()) {
      const p = buildComposedProfile(c);
      expect(p.font).toEqual([MENTOR_OVERRIDE.font]);
      expect(p.size).toEqual([MENTOR_OVERRIDE.sizePt]);
      expect(p.spacing).toBe(MENTOR_OVERRIDE.spacing);
      expect(p.margins).toEqual({ top: 3, right: 3, bottom: 3, left: 3 });
      for (const flag of ['checkFont', 'checkSize', 'checkSpacing', 'checkMargins', 'checkJustify'] as const) {
        expect(p[flag], `${c.id}: ${flag} mora biti ukljucen`).toBe(true);
      }
    }
  });

  it('override gasi demotiju (korisnikov izricit zahtjev se ne demotira)', () => {
    const base = { id: 'x', profileId: 'fpzg-politologija-zavrsni', workType: 'final' };
    const demoted = buildComposedProfile(base).advisoryDimensions;
    const overridden = buildComposedProfile({ ...base, override: MENTOR_OVERRIDE }).advisoryDimensions;
    expect(Array.isArray(demoted)).toBe(true);
    expect(overridden).toBeUndefined();
  });

  it('override vraca dimenzije koje je normalizeCheckFlags ugasio profilu bez vrijednosti', () => {
    // vsite-zavrsni ima checkFont ukljucen, ali BEZ popisa fontova, pa mu normalizeCheckFlags gasi
    // font/size/margine. Bez eksplicitnih zastavica u overrideu korisnikov zahtjev bi se izgubio.
    const plain = buildComposedProfile({ id: 'a', profileId: 'vsite-zavrsni', workType: 'final' });
    const withOverride = buildComposedProfile({ id: 'b', profileId: 'vsite-zavrsni', workType: 'final', override: MENTOR_OVERRIDE });
    expect(plain.checkFont).toBe(false);
    expect(withOverride.checkFont).toBe(true);
    const dims = new Set(
      deriveComposedPlan({ id: 'b', profileId: 'vsite-zavrsni', workType: 'final', override: MENTOR_OVERRIDE })
        .assertions.map((a) => a.dim),
    );
    expect(dims.has('font')).toBe(true);
    expect(dims.has('margins')).toBe(true);
  });
});

describe('slozena matrica: sastav', () => {
  it('uzorkuje svaki obrazac demotije i sve katedre', () => {
    const samples = demotionSampleCases();
    const signatures = new Set(Object.values(advisoryMap as Record<string, string[]>).map((v) => [...v].sort().join('+')));
    // Po jedan slucaj za svaki obrazac + jedan za profile koji uopce nemaju ruleEntries.
    expect(samples.length).toBeGreaterThanOrEqual(signatures.size);
    expect(new Set(samples.map((s) => s.profileId)).size).toBe(samples.length);
  });
});

/**
 * PODPROVJERE NE SMIJU BODOVATI DIMENZIJU KOJU RODITELJ NE BODUJE.
 *
 * Demotija gasi roditeljsku os (`requireToc`, `requirePageNumbers`) i time glavnu provjeru svodi na
 * 0/0, ali je do 2026-08-23 ostavljala zivom njezinu djecu: polozaj broja stranice (3), naslovnica
 * bez broja (3), numeriranje od Uvoda (4) i tri podprovjere sadrzaja (3+3+3). Devetnaest bodova
 * dolazilo je iz osi za koju verifikacija tvrdi da se ne smije bodovati.
 *
 * Zatvoreno na dva mjesta i oba su ovdje pokrivena: kod (podprovjere sada vise o roditelju,
 * `structure.ts` i `auditDetailedToc`) i PODACI (ova invarijanta). Kad bi netko sutra profilu dodao
 * `pageNumberAlignment` a os ostala demotirana, kod bi to preziveo tiho, a ovaj test ne.
 *
 * Popis je prazan i takav mora ostati; mjereno pri uvodjenju: 0 od 386 profila u advisory mapi.
 */
const SUBCHECK_LEAKS: string[] = [];

const SUBCHECKS: Record<string, readonly string[]> = {
  'page-numbers': ['pageNumberAlignment', 'checkTitlePageNumberSuppression', 'checkPageNumberStartAtIntro'],
  'toc': ['tocDetailedCheck'],
};

describe('slozeni profil: podprovjere prate roditeljsku os', () => {
  it('nijedna podprovjera ne ostaje ziva iznad demotirane osi', () => {
    const map = advisoryMap as unknown as Record<string, string[]>;
    const leaks: string[] = [];
    let inspected = 0;
    for (const c of allConformanceCases()) {
      const demoted = map[c.profileId] ?? [];
      if (!demoted.length) continue;
      const composed = buildComposedProfile(c) as Record<string, unknown>;
      inspected += 1;
      for (const [axis, children] of Object.entries(SUBCHECKS)) {
        if (!demoted.includes(axis)) continue;
        for (const child of children) {
          if (composed[child]) leaks.push(`${c.profileId} [${axis} -> ${child}]`);
        }
      }
    }
    // Netrivijalnost: da mapa nije procitana ili da slucajevi ne postoje, popis bi bio prazan iz
    // krivog razloga. Isti razred greske kao vakuumski prolaz rule-compiler testa.
    expect(inspected).toBeGreaterThan(50);
    expect([...new Set(leaks)].sort()).toEqual([...SUBCHECK_LEAKS].sort());
  });
});
