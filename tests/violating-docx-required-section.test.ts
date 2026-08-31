/**
 * OS `required-section` generatora krsenja.
 *
 * Zasto zasebna datoteka, a ne uz ostale strukturne osi: `tests/violating-docx-structural.test.ts`
 * u istom radnom stablu uredjuje druga sesija, pa bi zajednicki commit pomijesao rad. Sadrzajno
 * pripada onamo i moze se spojiti kad se stablo smiri.
 *
 * Sto je posebno kod ove osi: krsi se IZOSTANKOM. Generator ne dodaje nista, nego imenuje ono cega
 * nema, pa je jedini nacin da tvrdnja bude postena provjeriti OBA uvjeta: da profil dio doista
 * propisuje i da ga dokument nema.
 *
 * Zasto os nosi `applied`, a ne `resolved`, iako joj je provjera bodovana: izmjereno 2026-08-30 na
 * fpzg-politologija-diplomski, popravak ide 2/7 -> 4/7 i tu stane. Provjera boduje pet obveznih
 * dijelova, a analiza kao kandidate za umetanje nudi samo dva (`abstract`, `keywords-en`);
 * `izjava o autorstvu`, `zakljucak` i `literatura` popravak nikad ne vidi. Da je os ozicena kao
 * bodovana, svaki bi profil trajno zavrsavao kao `partial` i razlika medju profilima bi nestala.
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { buildViolatingDocx } from './helpers/violating-docx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PROFILE_ID = 'fpzg-politologija-diplomski';
const CHECK_TITLE = 'Dijelovi verificiranog profila';

const analyze = (bytes: Uint8Array, profileId: string, profile: unknown) =>
  analyzeFixture(new File([bytes], `${profileId}.docx`, { type: DOCX_MIME }), { profileId, profile } as never);

const checkOf = (result: { checks?: Array<{ title?: string; earned?: number; max?: number }> }) =>
  (result.checks ?? []).find((check) => check.title === CHECK_TITLE);

describe('generator krsenja: required-section', () => {
  it('os se deklarira samo kad profil dio propisuje a dokument ga nema', async () => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { violated } = await buildViolatingDocx(profile, { structural: ['required-section'] });
    expect(violated).toContain('required-section');

    /**
     * NEGATIVNA KONTROLA nad SAMIM uvjetom, ne nad odabirom osi.
     *
     * Prva izvedba ovog testa usporedjivala je s `structural: ['toc-field']`, gdje se blok osi
     * uopce ne izvodi, pa je uklanjanje uvjeta `if (missing.length)` prolazilo neopazeno: test je
     * tvrdio "samo kad profil propisuje", a mjerio je "samo kad je os zatrazena". Isti razred kao
     * ostali vakuumski testovi nadjeni u ovom radu.
     *
     * Zato se ista os trazi nad profilom koji obvezne dijelove NE propisuje.
     */
    const bezPravila = {
      ...profile,
      requiredSections: [],
      effectiveRules: { ...((profile.effectiveRules as Record<string, unknown>) ?? {}), requiredSections: [] },
    };
    const { violated: bez } = await buildViolatingDocx(bezPravila, { structural: ['required-section'] });
    expect(bez).not.toContain('required-section');

    /**
     * DRUGA POLOVICA UVJETA, koja je do 2026-08-31 bila NEPOKRIVENA.
     *
     * Neovisni pregled je mutacijom dokazao da je gard prolazio i kad se `!present.has(label)`
     * ukloni: gornja kontrola koristi prazan popis pravila, pa vjezba samo granu "profil nista ne
     * propisuje". Tvrdnja u zaglavlju datoteke ("provjeriti OBA uvjeta") time nije bila istinita.
     *
     * Ovdje profil PROPISUJE dio koji dokument VEC IMA (`Uvod` generator uvijek pise), pa se
     * mjeri bas presence-polovica.
     */
    const propisujePostojece = {
      ...profile,
      requiredSections: [{ key: 'introduction', label: 'Uvod' }],
      effectiveRules: { ...((profile.effectiveRules as Record<string, unknown>) ?? {}), requiredSections: [{ key: 'introduction', label: 'Uvod' }] },
    };
    const { violated: postoji } = await buildViolatingDocx(propisujePostojece, { structural: ['required-section'] });
    expect(postoji, 'dio koji dokument vec ima ne smije se prijaviti kao prekrsen').not.toContain('required-section');
  });

  it('popravak umece nedostajuce dijelove i podize bodovanu provjeru', async () => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { bytes } = await buildViolatingDocx(profile, { structural: true });
    const before = await analyze(bytes, PROFILE_ID, profile);
    const beforeCheck = checkOf(before);
    expect(beforeCheck, 'bodovana provjera mora postojati').toBeDefined();
    expect(beforeCheck!.earned!).toBeLessThan(beforeCheck!.max!);

    const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never);
    const out = await applyFixers(bytes, buildDefaultRepairRequests(items as never) as never);
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.some((entry) => entry.fixerId === 'required-section-fixer')).toBe(true);

    const after = await analyze(out.docxBytes, PROFILE_ID, profile);
    const afterCheck = checkOf(after);
    expect(afterCheck!.earned!).toBeGreaterThan(beforeCheck!.earned!);
  });

  /**
   * STROP se tvrdi izricito. Bez ovoga bi se raskorak izmedju provjere i kandidata mogao tiho
   * zatvoriti ili prosiriti, a nitko ne bi primijetio da os vise ne pripada u `applied`.
   */
  it('provjera se NE zatvara do kraja: kandidati pokrivaju samo dio bodovanih stavki', async () => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { bytes } = await buildViolatingDocx(profile, { structural: true });
    const before = await analyze(bytes, PROFILE_ID, profile);
    const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never);
    const out = await applyFixers(bytes, buildDefaultRepairRequests(items as never) as never);
    const after = await analyze(out.docxBytes, PROFILE_ID, profile);
    const afterCheck = checkOf(after);
    expect(
      afterCheck!.earned!,
      'ako je provjera zatvorena, os pripada u AXIS_CHECK_ID (dokaz `resolved`), ne u `applied`',
    ).toBeLessThan(afterCheck!.max!);
  });
});
