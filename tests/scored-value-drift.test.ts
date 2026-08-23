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
   */
  drift: 37,
  /** Verificirana tvrdnja postoji, a motor tu dimenziju uopce ne provjerava (tiho popustanje). */
  unapplied: 24,
  /** Motor boduje dimenziju bez ijedne tvrdnje: svih 82 su u 14 profila koji nemaju nijedan ruleEntry. */
  unbacked: 82,
  /** Tvrdnja nosi ljudski opis stila umjesto kanonskog tokena (`apa` umjesto `apa7`). */
  'citation:non-canonical-token': 26,
  /** Tvrdnja o stilu postoji, motor nema `recommendedCitation`, pa vrijedi korisnikov odabir. */
  'citation:not-applied': 6,
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
