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
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
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
  const profile = resolveProfile(profileId) as Record<string, unknown> | undefined;
  if (!profile) return null;

  const { bytes, violated } = await buildViolatingDocx(profile);
  if (!violated.length) return { profileId, violated: [], requested: 0, resolved: [], unresolved: [], textPreserved: true, regressions: 0 };

  const before = await analyzeFixture(new File([bytes], `${profileId}.docx`, { type: DOCX_MIME }), { profileId });
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
    { profileId },
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
   * IZMJERENI NALAZ (2026-08-20): velicina osnovnog teksta ostaje NERIJESENA na svakom profilu,
   * iako je popravak ponudjen, `deep` je ukljucen (kao u sucelju) i stil nosi ciljanu vrijednost.
   *
   * Font se u istom prolazu rijesi, prored i poravnanje takodjer - dakle deep ciscenje radi, ali
   * ocito ne uklanja izravni `<w:sz>`. Provjereno nad izlaznim XML-om: `<w:sz w:val="20"/>` ostaje
   * i nakon popravka, dok `docDefaults` nosi ciljanih 24 (12 pt).
   *
   * Tvrdnja je namjerno pisana kao ZATECENO stanje, ne kao ocekivanje: kad se popravi, ovaj test
   * pada i tjera da se nalaz skine s popisa. Tako rupa ne moze utihnuti.
   */
  it('ZATECENO: velicina teksta se ne rjesava na izravno oblikovanom dokumentu', () => {
    const withSizeViolation = outcomes.filter(
      (o) => o.violated.includes('font-size') && o.requested > 0,
    );
    expect(withSizeViolation.length, 'mjerenje mora imati barem jedan takav profil').toBeGreaterThan(0);
    for (const outcome of withSizeViolation) {
      expect(
        outcome.unresolved.some((title) => /veličina osnovnog teksta/i.test(title)),
        `${outcome.profileId}: velicina je rijesena - popravi test i skini nalaz s popisa`,
      ).toBe(true);
    }
  });
});
