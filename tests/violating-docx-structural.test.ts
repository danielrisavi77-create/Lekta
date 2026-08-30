/**
 * CLOSED-LOOP ZA STRUKTURNE OSI generatora krsenja (`structural: true`).
 *
 * Zasto postoji: `buildViolatingDocx` je do 2026-08-29 krsio TOCNO sest osi profilne grane
 * (font, velicina, prored, poravnanje, margine, format papira). Posljedica je izmjerena: closed-loop
 * javlja FPZG kao 12/13 `pass`, dok 74 stvarna FPZG rada daju 2/74, a matrica pokrivenosti nosi
 * 10.553 celije (profil x fixer) sa statusom `univerzalna-higijena-bez-dokaza`. Fixer koji generator
 * nikad ne aktivira ne moze dobiti dokaz, koliko god dokumenata dodali.
 *
 * Ovaj test zatvara petlju za prve dvije strukturne osi: dokument se generira POKVAREN, analiza
 * mora vidjeti kvar, sucelje mora ponuditi fixer S NEPRAZNIM parametrima, i popravak mora stanje
 * prevrnuti. Tvrdnja "ponudjen je" NIJE dovoljna: izmjereno je da se tri asistirana fixera nude
 * 204 puta i nijednom nista ne promijene, jer im je `params` prazan po konstrukciji (vidi
 * `docs/superpowers/specs/2026-08-29-prazni-asistirani-fixeri.md`). Zato se ovdje svaki put tvrdi
 * i da su parametri neprazni i da se dokument doista promijenio.
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { buildViolatingDocx, STRUCTURAL_VIOLATION_IDS } from './helpers/violating-docx';
import { stableCheckId } from '../src/scoring/check-id-registry';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Profil s `requireToc: true`; bez toga se `toc-field` stavka po ugovoru uopce ne nudi. */
const PROFILE_ID = 'fpzg-politologija-diplomski';

async function analyze(bytes: Uint8Array, profileId: string, profile: unknown) {
  const file = new File([bytes], `${profileId}.docx`, { type: DOCX_MIME });
  return (await analyzeFixture(file, { profileId, profile } as never)) as any;
}

function itemsFor(result: unknown, profile: unknown, profileId: string) {
  return buildAllRepairableItems({
    result,
    profile,
    entries: draftRuleEntriesFor(profileId),
  }) as Array<Record<string, any>>;
}

describe('generator krsenja: strukturne osi', () => {
  it('strukturne osi su OPT-IN, pa zadani poziv ostaje sest profilnih osi', async () => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { violated } = await buildViolatingDocx(profile);
    // Baseline: bez `structural: true` nijedna strukturna os ne smije se pojaviti. Bez ove
    // tvrdnje bi se ukljucivanje po zadanom provuklo i pomaknulo closed-loop na svih 407 profila.
    for (const id of STRUCTURAL_VIOLATION_IDS) expect(violated).not.toContain(id);
  });

  it('toc-field: "Sadrzaj" bez zivog polja -> fixer ga pretvara u polje', async () => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    // Preduvjet ugovora, izrican da test ne bi tiho prosao vakuumski na profilu bez sadrzaja.
    expect(profile.requireToc).toBe(true);

    const { bytes, violated } = await buildViolatingDocx(profile, { structural: true });
    expect(violated).toContain('toc-field');

    const before = await analyze(bytes, PROFILE_ID, profile);
    // Analiza mora vidjeti tocno stanje koje `tocFieldItem` trazi: odlomak "Sadrzaj" postoji na
    // indeksu >= 1, a zivo polje NE postoji.
    expect(before.details?.sadrzajParagraphIndex).toBeGreaterThanOrEqual(1);
    expect(before.details?.hasTocField).not.toBe(true);

    const item = itemsFor(before, profile, PROFILE_ID).find((i) => i.fixerId === 'toc-field-fixer');
    expect(item, 'toc-field-fixer mora biti ponudjen').toBeDefined();
    // Neprazni parametri: bez ovoga bi fixer bio "ponudjen" a ne bi imao sto raditi.
    expect(item!.params?.target?.sadrzajParagraphIndex).toBeGreaterThanOrEqual(1);

    const out = await applyFixers(bytes, [
      { fixerId: 'toc-field-fixer', ruleId: item!.ruleId, params: item!.params },
    ] as never);
    // Vrata integriteta na odbijanju vracaju ULAZNE bajtove uz prazan changelog, pa bi bez ove
    // tvrdnje pad prosao kao uredan no-op i sve daljnje tvrdnje bi prolazile vakuumski.
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length).toBeGreaterThan(0);

    const after = await analyze(out.docxBytes, PROFILE_ID, profile);
    // PREVRTANJE, ne samo "nesto se promijenilo": polje sadrzaja sada zivi.
    expect(after.details?.hasTocField).toBe(true);
  });

  /**
   * OBJE KONFIGURACIJE, i to je srz tvrdnje.
   *
   * Krhkost je bila upravo u tome da os radi u jednoj konfiguraciji a ne u drugoj. Nalaz opali tek
   * kad prazni odlomci cine >=18% dokumenta, a `empty-paragraph-fixer` NAMJERNO zadrzava po jedan
   * razmak iz svakog niza. Prijasnji oblik (dva prazna odlomka, tijelo od cetiri) davao je
   * izolirano 33% -> 20%, dakle i dalje iznad praga, a uz sve osi 17%, dakle ispod praga pa se
   * fixer ne bi ni ponudio. Test je prolazio samo dok je dokument slucajno bio prave velicine.
   *
   * Zato se mjeri i sama os i puni skup: jedna konfiguracija ne dokazuje drugu.
   */
  it.each([
    ['sama os', ['empty-paragraphs'] as const],
    ['sve strukturne osi', true as const],
  ])('empty-paragraphs (%s): nalaz opali, popravak ga zatvori', async (_label, structural) => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { bytes, violated } = await buildViolatingDocx(profile, { structural: structural as never });
    expect(violated).toContain('empty-paragraphs');

    const before = await analyze(bytes, PROFILE_ID, profile);
    const item = itemsFor(before, profile, PROFILE_ID).find((i) => i.fixerId === 'empty-paragraph-fixer');
    expect(item, 'empty-paragraph-fixer mora biti ponudjen').toBeDefined();
    // `violated: true` je ono sto ga uvrstava u zadani odabir; `params` je namjerno prazan jer
    // fixer nema sto parametrizirati (uklanja prazne odlomke), pa se tvrdi ODABIR, ne parametri.
    expect(item!.violated).toBe(true);
    expect(buildDefaultRepairRequests([item as never]).map((r) => r.fixerId)).toContain('empty-paragraph-fixer');

    const out = await applyFixers(bytes, [
      { fixerId: 'empty-paragraph-fixer', ruleId: item!.ruleId, params: item!.params },
    ] as never);
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length).toBeGreaterThan(0);

    const after = await analyze(out.docxBytes, PROFILE_ID, profile);
    const stillOffered = itemsFor(after, profile, PROFILE_ID).find((i) => i.fixerId === 'empty-paragraph-fixer');
    expect(stillOffered?.violated).not.toBe(true);
  });

  /**
   * UNIVERZALNE osi: ne trebaju nijedno pravilo profila, pa jedna takva os zatvara 407 celija
   * matrice umjesto desetak. Obje su dokazano zive na stvarnim radovima (tipografija 57 od 74
   * FPZG, DOI 14 od 74), sto ih razlikuje od `consistency` i `required-section`, koji se nude a
   * nikad nista ne promijene.
   */
  it.each([
    ['croatian-typography', 'croatian-typography-fixer'],
    ['link-doi', 'link-doi-fixer'],
  ])('%s: nalaz se generira, fixer ga primi s nepraznim parametrima i dokument se promijeni', async (axis, fixerId) => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { bytes, violated } = await buildViolatingDocx(profile, { structural: true });
    expect(violated).toContain(axis);

    const before = await analyze(bytes, PROFILE_ID, profile);
    const item = itemsFor(before, profile, PROFILE_ID).find((i) => i.fixerId === fixerId);
    expect(item, `${fixerId} mora biti ponudjen`).toBeDefined();

    /**
     * NEPRAZNE operacije su srz tvrdnje. `consistency-fixer` je ponudjen 110 puta i nijednom
     * nista nije promijenio bas zato sto mu je ovaj niz uvijek prazan; bez ove provjere bi test
     * "prolazio" nad fixerom koji nema sto raditi.
     */
    const operations = (item!.params as any)?.operations ?? [];
    expect(operations.length, 'params.operations ne smije biti prazan').toBeGreaterThan(0);

    const out = await applyFixers(bytes, [
      { fixerId, ruleId: item!.ruleId, params: item!.params },
    ] as never);
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length).toBeGreaterThan(0);
    expect(out.docxBytes).not.toEqual(bytes);
  });
});

/**
 * GARD PROTIV MRTVIH `matchKeys` (2026-08-30).
 *
 * `matchKeys` koreliraju nalaz sa stavkom popravka; nalaz nosi `[issue.title, check.title]`, pa
 * kljuc koji NIJE naslov provjere ne moze pogoditi nista, a `summarizeRepairOutcome` ga prijavi u
 * `unmappedMatchKeys`. Izmjereno na 54 stvarna rada: sedam takvih kljuceva (`where` oznake
 * lokacije, ne naslovi) cinilo je vecinu tog popisa, svaki s 39 do 47 pojava.
 *
 * Dva fixera su NAMJERNO na popisu iznimaka: nemaju nijedan ziv kljuc, pa se ta sutnja imenuje
 * umjesto da se brisanjem sakrije.
 */
describe('matchKeys: nijedan mrtav kljuc bez izricite iznimke', () => {
  const BEZ_IJEDNOG_ZIVOG_KLJUCA = new Set(['final-document-inspector-fixer', 'consistency-fixer']);

  it('svaka stavka ima barem jedan kljuc koji pogadja stvarnu provjeru', async () => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { bytes } = await buildViolatingDocx(profile, { structural: true });
    const result = await analyze(bytes, PROFILE_ID, profile);
    const items = itemsFor(result, profile, PROFILE_ID).filter((item) => (item.matchKeys ?? []).length);
    // Netrivijalnost: bez stavki bi tvrdnja prolazila vakuumski.
    expect(items.length).toBeGreaterThan(0);

    const bezZivog = items
      .filter((item) => !(item.matchKeys as string[]).some((key) => Boolean(stableCheckId(key))))
      .map((item) => item.fixerId as string);
    expect([...new Set(bezZivog)].filter((id) => !BEZ_IJEDNOG_ZIVOG_KLJUCA.has(id))).toEqual([]);
  });

  it('popis iznimaka se ne smije siriti u tisini', () => {
    expect([...BEZ_IJEDNOG_ZIVOG_KLJUCA].sort()).toEqual(['consistency-fixer', 'final-document-inspector-fixer']);
  });
});

/**
 * `heading-style`: rucno oblikovan naslov bez Word Heading stila.
 *
 * Ova os je mjerljiva, za razliku od `consistency` i `final-document-inspector`, koji nemaju
 * nijedan ziv `matchKey`: `heading-style-fixer` gadja provjere "Uporaba Word stilova naslova" i
 * "Hijerarhija naslova", pa se njegov ucinak moze pripisati rijesenoj provjeri.
 */
describe('generator krsenja: heading-style', () => {
  it('rucno oblikovan naslov ulazi u nalaz i fixer mu daje Heading stil', async () => {
    const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
    const { bytes, violated } = await buildViolatingDocx(profile, { structural: ['heading-style'] });
    expect(violated).toContain('heading-style');

    const before = await analyze(bytes, PROFILE_ID, profile);
    const candidates = (before.details as any)?.headingStructure?.candidates ?? [];
    const target = candidates.find((c: any) => String(c.text).startsWith('3. Rezultati'));
    expect(target, 'rucno oblikovan naslov mora biti prepoznat kao kandidat').toBeDefined();
    // Prag za predodabir je `score >= 7`; generator cilja 11, pa tvrdnja drzi i rezervu.
    expect(target.confidence).toBe('high');
    expect(target.selectedByDefault).toBe(true);

    const item = itemsFor(before, profile, PROFILE_ID).find((i) => i.fixerId === 'heading-style-fixer');
    expect(item, 'heading-style-fixer mora biti ponudjen').toBeDefined();
    const targets = (item!.params as any)?.targets ?? [];
    expect(targets.length, 'params.targets ne smije biti prazan').toBeGreaterThan(0);
    // Sidro protiv zastarjele mete mora biti poslano, inace ga INDEX_SHIFTING fixer tiho premjesti.
    expect(targets.every((t: any) => typeof t.anchorText === 'string' && t.anchorText.length)).toBe(true);

    const out = await applyFixers(bytes, [
      { fixerId: 'heading-style-fixer', ruleId: item!.ruleId, params: item!.params },
    ] as never);
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length).toBeGreaterThan(0);

    // Petlja se zatvara nad ponovnom ANALIZOM, ne nad XML-om: naslov mora postati pravi naslov.
    const after = await analyze(out.docxBytes, PROFILE_ID, profile);
    const headings = (after.documentStructure?.headings ?? []) as Array<{ text: string }>;
    expect(headings.some((h) => String(h.text).includes('Rezultati'))).toBe(true);
  });
});
