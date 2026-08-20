/**
 * Closed-loop kroz KATALOG PROFILA (P4-2 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Zateceno stanje: closed-loop harness je zreo (29 slucajeva, `runClosedLoopCase`), ali svi rucno
 * grade svoj dokument, pa pokrivaju TOCNO DVA profila od 410. Zato je u completion ledgeru os
 * `proof` bila `not-run` za 425 od 436 redaka, a nijedan redak nije dosezao razinu A ni B.
 *
 * Ovdje se petlja vrti kroz uzorak profila s dokumentom koji je GENERIRAN iz njihovih vlastitih
 * pravila (`buildViolatingDocx`), pa se dokazuje ono sto korisnik stvarno dobije klikom na
 * "Popravi": `buildDefaultRepairRequests` nad stvarnom analizom.
 *
 * Uzorak, ne svih 410: puna petlja je preskupa za `npm run check` (svaki profil je dvije analize
 * plus popravak). Uzorak je DETERMINISTICAN i pokriva razlicite obitelji pravila; sirenje ide
 * kroz `npm run closed-loop` (P4-3 ratchet), ne kroz ovaj test.
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { buildRepairableItems } from '../src/ui/repair-items';
import { detectPassRegressions } from '../src/analysis/repair-regression';
import { buildViolatingDocx, VIOLATABLE_CHECK_IDS } from './helpers/violating-docx';
import { documentText } from './helpers/closed-loop-runner';
import { assertPackageIntact } from './helpers/docx-package-assert';
import { draftRuleEntriesFor, VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';
import { normalizeCheckFlags } from '../src/profiles/profile-baseline';
import { applyScoredAdvisory } from '../src/profiles/advisory-demotion';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { DEEP_CAPABLE } from '../src/ui/repair-panel';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Uzorak profila iz razlicitih obitelji pravila (drustvene, pravne, tehnicke, medicinske,
 * humanisticke, umjetnicke). Namjerno fiksan popis, ne nasumican: test mora biti ponovljiv.
 */
const SAMPLE_PROFILES = [
  'fpzg-politologija-diplomski',
  'pravo-integrirani-diplomski',
  'fer-diplomski',
  'efzg-diplomski',
  'mef-diplomski',
  'ffzg-filozofija-diplomski',
  'grf-diplomski',
  'pmf-matematika-graduate',
] as const;

/**
 * Profil onako kako ga vidi ZIVI app: `effectiveRules` (Option A overlay), ne naslijedjeni
 * `rules` mirror.
 *
 * `golden-entry.resolveProfile` namjerno klonira `entry.rules` (golden harness mjeri sirovi
 * engine). Za closed-loop to je pogresna osnovica: popravak cita `ruleEntry`, pa bi analiza protiv
 * mirrora mjerila DRUGU vrijednost od one koju popravak postavlja. Izmjereno na
 * `vuka-strojarski-diplomski`: mirror kaze margine 2/2/2/2,5, zapis i `effectiveRules` kazu
 * 3/3/3/3 - petlja je bez ovog overlaya prijavljivala lazno proturjecje izmedju popravka i ocjene.
 */
function liveProfile(profileId: string): Record<string, unknown> {
  const withDrafts = (VERIFIED_PROFILES_WITH_DRAFTS as Array<{ id: string }>).find((p) => p.id === profileId);
  const base = resolveProfile(profileId) as Record<string, unknown>;
  if (!withDrafts) return base;
  // Normalizacija MORA ici nakon overlaya: `applyEntry` upisuje sirovu vrijednost zapisa
  // (npr. `size: 12`), a analizator ocekuje oblik iz `rules` (`size: [12]`). Zivi app radi isto -
  // `currentProfile` normalizira nakon sto procita effectiveRules. Bez toga 144 profila puca na
  // `profile.size.some is not a function` (izmjereno).
  const merged = { ...base, ...compileEffectiveRules(withDrafts as never) } as Record<string, unknown>;
  normalizeCheckFlags(merged);
  /**
   * Scored/advisory demotion je PRODUKTNA politika: zivi engine boduje samo verificirani scored
   * skup, a ostale dimenzije prikazuje informativno (max 0). Golden je namjerno ne primjenjuje jer
   * mjeri sirovi engine, ali closed-loop mora mjeriti PROIZVOD - inace prijavi kao neuspjeh
   * popravka ono sto fakultet uopce ne propisuje nego savjetuje (izmjereno: 29 profila je na osi
   * `paper-size` ispadalo `partial`, a rijec je o `advisory` zapisu bez fixera).
   */
  applyScoredAdvisory(
    merged as never,
    withDrafts as never,
    draftRuleEntriesFor(profileId),
    SOURCE_REGISTRY as never,
  );
  return merged;
}

interface LoopOutcome {
  profileId: string;
  violated: string[];
  requested: number;
  resolved: string[];
  unresolved: string[];
  textPreserved: boolean;
  regressions: number;
}

async function runProfile(profileId: string): Promise<LoopOutcome | null> {
  const profile = liveProfile(profileId);
  if (!profile) return null;

  const { bytes, violated } = await buildViolatingDocx(profile);
  if (!violated.length) return { profileId, violated: [], requested: 0, resolved: [], unresolved: [], textPreserved: true, regressions: 0 };

  const before = await analyzeFixture(new File([bytes], `${profileId}.docx`, { type: DOCX_MIME }), { profileId, profile });
  const items = buildRepairableItems(before.checks ?? [], profile, draftRuleEntriesFor(profileId));
  /**
   * Zrcali STVARNI korisnicki tok, ne samo `buildDefaultRepairRequests`. Deep preklopnik je u
   * sucelju ukljucen po zadanom (`repair-panel.ts`), pa bez njega test mjeri put koji nitko ne
   * izvodi. Izmjereno: bez `deep` font, velicina, prored i poravnanje ostaju NEPRIMIJENJENI, jer
   * izravno oblikovanje (ono koje Word i pise) nadjacava stil koji fixer zakrpa.
   */
  const requests = buildDefaultRepairRequests(items as never).map((request) =>
    DEEP_CAPABLE.has(request.fixerId) ? { ...request, params: { ...request.params, deep: true } } : request,
  );
  if (!requests.length) return { profileId, violated, requested: 0, resolved: [], unresolved: violated, textPreserved: true, regressions: 0 };

  const beforeText = await documentText(bytes);
  const applied = await applyFixers(bytes, requests);
  expect(applied.integrityFailure, `${profileId}: paket mora ostati ispravan`).toBeUndefined();
  await assertPackageIntact(bytes, applied.docxBytes, `${profileId}: closed-loop`);

  const after = await analyzeFixture(
    new File([applied.docxBytes], `${profileId}-fixed.docx`, { type: DOCX_MIME }),
    { profileId, profile },
  );
  const afterText = await documentText(applied.docxBytes);

  const failing = (checks: Array<{ title: string; status?: string; earned?: number; max?: number }>): Set<string> =>
    new Set(checks.filter((c) => (c.max ?? 0) > 0 && (c.earned ?? 0) < (c.max ?? 0)).map((c) => c.title));
  const beforeFailing = failing(before.checks ?? []);
  const afterFailing = failing(after.checks ?? []);
  const resolved = [...beforeFailing].filter((t) => !afterFailing.has(t));
  const unresolved = [...beforeFailing].filter((t) => afterFailing.has(t));

  return {
    profileId,
    violated,
    requested: requests.length,
    resolved,
    unresolved,
    textPreserved: afterText === beforeText,
    regressions: detectPassRegressions(before.checks ?? [], after.checks ?? []).length,
  };
}

describe('closed-loop kroz profile: popravak stvarno rjesava ono sto profil propisuje', () => {
  const outcomes: LoopOutcome[] = [];

  it('izvedi petlju nad uzorkom profila', async () => {
    for (const profileId of SAMPLE_PROFILES) {
      const outcome = await runProfile(profileId);
      if (outcome) outcomes.push(outcome);
    }
    expect(outcomes.length, 'nijedan profil iz uzorka nije razrijesen').toBeGreaterThan(0);
  }, 600_000);

  it('generirani dokument doista krsi pravila profila', () => {
    for (const outcome of outcomes) {
      expect(
        outcome.violated.every((id) => (VIOLATABLE_CHECK_IDS as readonly string[]).includes(id)),
        `${outcome.profileId}: prekrsena os izvan poznatog skupa`,
      ).toBe(true);
    }
    // Bez ovoga bi petlja nad profilima bez pravila prosla vakuumski.
    expect(
      outcomes.filter((o) => o.violated.length > 0).length,
      'barem jedan profil iz uzorka mora imati pravila koja se mogu prekrsiti',
    ).toBeGreaterThan(0);
  });

  it('popravak ne mijenja tekst rada', () => {
    for (const outcome of outcomes) {
      expect(outcome.textPreserved, `${outcome.profileId}: tekst rada je promijenjen`).toBe(true);
    }
  });

  it('popravak ne uvodi regresiju na drugim provjerama', () => {
    for (const outcome of outcomes) {
      expect(outcome.regressions, `${outcome.profileId}: popravak je oborio provjeru koja je prolazila`).toBe(0);
    }
  });

  /**
   * Profili koji NE dobiju nijedan popravak, uz imenovan razlog. `fer-diplomski` je jedan od 17
   * profila bez ijednog bodovanog pravila (P2-3), pa `buildRepairableItems` nema sto ponuditi.
   * To je uredno stanje, ne kvar - ali mora biti IMENOVANO, inace se ne razlikuje od kvara.
   */
  const NO_REPAIR_EXPECTED: readonly string[] = ['fer-diplomski'];

  it('svaki profil s prekrsivim pravilima dobije popravak koji nesto rijesi', () => {
    for (const outcome of outcomes) {
      if (!outcome.violated.length) continue;
      if (NO_REPAIR_EXPECTED.includes(outcome.profileId)) {
        expect(outcome.requested, `${outcome.profileId}: ocekivano bez popravka, a popravak postoji`).toBe(0);
        continue;
      }
      expect(outcome.requested, `${outcome.profileId}: nijedan popravak nije predodabran`).toBeGreaterThan(0);
      expect(outcome.resolved.length, `${outcome.profileId}: nijedan nalaz nije rijesen`).toBeGreaterThan(0);
    }
  });

  /**
   * Velicina teksta: rjesava se kad je odstupanje POGRESKA, a namjerno ostaje kad je izbor.
   *
   * `stripDirectFormatting` cisti izravnu velicinu samo unutar +-3 polutocke od cilja. Izvan toga
   * je cuva namjerno, jer 10 pt uz cilj 12 pt vjerojatnije je potpis ispod slike nego greska
   * (src/repair/run-level.test.ts). Prvi generator je birao cilj minus 2 pt i time modelirao bas
   * taj cuvani slucaj, pa je ISPRAVNO ponasanje izgledalo kao kvar popravka. Test zato drzi obje
   * strane granice.
   */
  it('velicina teksta se rjesava kad je odstupanje unutar tolerancije', () => {
    const withSize = outcomes.filter((o) => o.violated.includes('font-size') && o.requested > 0);
    expect(withSize.length, 'mjerenje mora imati barem jedan takav profil').toBeGreaterThan(0);
    for (const outcome of withSize) {
      expect(
        outcome.unresolved.some((title) => /veličina osnovnog teksta/i.test(title)),
        `${outcome.profileId}: velicina je ostala nerijesena unutar tolerancije`,
      ).toBe(false);
    }
  });
});
