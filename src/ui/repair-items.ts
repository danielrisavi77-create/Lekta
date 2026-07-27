// src/ui/repair-items.ts
//
// Cista izvedba RepairableItem[] iz rezultata analize + profila (Opcija A: nudi popravak
// SAMO za PREKRSENE dimenzije). Kljucno nacelo: ciljane cm/pt vrijednosti (params) dolaze
// ISKLJUCIVO iz PROFILA (currentProfile().p), nikad hardkodirano. Bez DOM-a i bez globalnog
// stanja -> testabilno; app.ts ga samo poziva i mountira rezultat (uz paywall gating).

import type { RepairableItem } from './repair-panel';
import type { RuleEntry } from '../profiles/profile-schema';
import type { Issue } from '../scoring/checks';
import type { SectionNumberingTarget } from '../repair/xml-patch';
import { CHECK_TITLES, PAPER_SIZE_TITLE_PREFIX } from '../analysis/check-fixer-map';

/** Minimalni oblik provjere iz analyzeDocx rezultata (result.checks[]). */
export interface AnalyzedCheck {
  title: string;
  status: string;
  max: number;
}

// checkId -> naslov checka (za korelaciju "je li prekrseno"). Dijeljeni izvor istine je
// src/analysis/check-fixer-map.ts (isti ga koristi triage model); ovdje su lokalni aliasi
// da ostatak datoteke ostane nepromijenjen.
const CHECK_TITLE: Record<string, string> = CHECK_TITLES;
// paper-size ima dinamican naslov ('Format stranice A4' / 'Format stranice (A4/A3)') -> prefiks.
const PAPER_SIZE_PREFIX = PAPER_SIZE_TITLE_PREFIX;

/** A-serija (cm), isti izvor kao PS mapa u analyzeDocx; sluzi konverziji imena iz profila. */
const A_SERIES: Record<string, [number, number]> = {
  A4: [21, 29.7],
  A3: [29.7, 42],
  A2: [42, 59.4],
  A1: [59.4, 84.1],
  A0: [84.1, 118.8],
};

/**
 * Ciljane params IZ PROFILA po checkId-u. Vrijednosti dolaze iz profila (currentProfile().p),
 * ne hardkodirano. Vraca null ako profil nema ciljanu vrijednost (tada se popravak ne nudi).
 */
export function paramsForCheck(checkId: string, profile: any): Record<string, unknown> | null {
  switch (checkId) {
    case 'margins':
      return profile?.margins ? { ...profile.margins } : null;
    case 'font':
      return profile?.font?.[0] ? { fontName: profile.font[0] } : null;
    case 'font-size':
      return profile?.size?.[0] != null ? { fontSizePt: profile.size[0] } : null;
    case 'line-spacing':
      return profile?.spacing != null ? { multiplier: profile.spacing } : null;
    case 'justify':
      // Ponudi poravnanje SAMO kad profil ima izrican zahtjev: true -> obostrano,
      // false -> lijevo. undefined znaci "profil ne propisuje poravnanje" pa se u
      // "uskladi sve" toku ne smije ponuditi (inace bi lijevo poravnao ispravan rad).
      return profile?.justify === true ? { val: 'both' } : profile?.justify === false ? { val: 'left' } : null;
    case 'paper-size': {
      const name = profile?.paperSizes?.[0] || (profile?.requireA4 ? 'A4' : null);
      const dim = name ? A_SERIES[name] : null;
      return dim ? { w: dim[0], h: dim[1] } : null;
    }
    default:
      return null;
  }
}

/** Status checka po naslovu (ili undefined ako ga nema). Za razliku od isViolated NE trazi
 *  max>0: numeriranje-checkovi su nebodovani (max=0, "Word ne sprema dovoljno podataka") na
 *  jednosekcijskom radu, ali im status ostaje 'warn' kad numeriranje od Uvoda nije potvrdjeno. */
function checkStatusByTitle(checks: AnalyzedCheck[], title: string): string | undefined {
  return checks.find((c) => c.title === title)?.status;
}

/** Je li dimenzija (checkId) PREKRSENA: postoji bodovani check (max>0) koji nije 'pass'. */
function isViolated(checkId: string, checks: AnalyzedCheck[]): boolean {
  const chk =
    checkId === 'paper-size'
      ? checks.find((c) => c.title.startsWith(PAPER_SIZE_PREFIX))
      : checks.find((c) => c.title === CHECK_TITLE[checkId]);
  return !!chk && chk.max > 0 && chk.status !== 'pass';
}

/**
 * Za svako pravilo koje je autoFixable + status:'verified' + ima fixerId i checkId,
 * izgradi RepairableItem s params IZ PROFILA i oznakom je li dimenzija prekrsena.
 * Default (Opcija A, besplatni teaser): vraca SAMO prekrsene dimenzije. S
 * includeNonViolated (Feature B, placeno): vraca i neprekrsene (violated:false),
 * za "uskladi cijeli dokument" tok. Prazno dok nijedno pravilo nije autoFixable.
 */
export function buildRepairableItems(
  checks: AnalyzedCheck[],
  profile: any,
  ruleEntries: RuleEntry[],
  opts?: { includeNonViolated?: boolean },
): RepairableItem[] {
  const out: RepairableItem[] = [];
  for (const e of ruleEntries) {
    if (e.autoFixable !== true || e.status !== 'verified' || !e.fixerId || !e.checkId) continue;
    const violated = isViolated(e.checkId, checks);
    if (!violated && !opts?.includeNonViolated) continue; // A: samo prekrseno
    const params = paramsForCheck(e.checkId, profile);
    if (!params) continue; // profil nema ciljanu vrijednost -> ne nudi popravak
    out.push({
      ruleId: e.ruleId,
      fixerId: e.fixerId as RepairableItem['fixerId'],
      label: e.label || CHECK_TITLE[e.checkId] || e.ruleId,
      params,
      violated,
    });
  }
  return out;
}

// Naslov checka "Prazni odlomci" iz analyzeDocx (src/analysis/analyze-docx.ts), byte-za-byte
// (dijakritika). Koristi se SAMO za korelaciju "je li prekrseno", ne kao izvor pravila.
const EMPTY_PARAGRAPHS_ISSUE_TITLE = 'Dokument sadrži mnogo praznih odlomaka';

/**
 * Univerzalna higijena dokumenta (prazni odlomci): NIJE vezana ni za jedan institucijski
 * ruleEntry pa namjerno zaobilazi cijeli ruleEntry gate (autoFixable/status/fixerId) iz
 * buildRepairableItems. Prekrsenost se racuna izravno iz issues[] (category:'elements' +
 * tocan naslov checka), ne iz profila.
 */
export function universalRepairableItems(issues: Issue[]): RepairableItem[] {
  const violated = issues.some((i) => i.category === 'elements' && i.title === EMPTY_PARAGRAPHS_ISSUE_TITLE);
  return [
    {
      ruleId: 'empty-paragraphs-universal',
      fixerId: 'empty-paragraph-fixer',
      label: 'Prazni odlomci',
      params: {},
      violated,
    },
  ];
}

/**
 * Univerzalni popravak razmaka prije/poslije odlomka: NIJE vezan za ruleEntry (isti
 * obrazac kao universalRepairableItems za prazne odlomke), ali OVISI o profilu jer
 * checkParagraphSpacingZero (analyzeDocx) nije univerzalan check, vec ga profil ukljucuje.
 * Kad profil ne provjerava razmak, popravak se ne nudi (nema checka za korelaciju).
 */
export function paragraphSpacingRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  if (profile?.checkParagraphSpacingZero !== true) return [];
  return [
    {
      ruleId: 'paragraph-spacing-universal',
      fixerId: 'paragraph-spacing-fixer',
      label: 'Razmak prije i poslije odlomka',
      params: {},
      violated: isViolated('paragraph-spacing', checks),
    },
  ];
}

/**
 * Ciljevi numeriranja iz granice Uvoda, ISTI kriterij kao audit checkPageNumberStartAtIntro
 * (analyze-docx.ts): prednje sekcije zavrsavaju PRIJE Uvoda (paragraphIndex < introIndex).
 * Prednje -> rimski (start=1 na prvoj), glavne od Uvoda -> arapski (start=1 na prvoj glavnoj).
 * detectable:false (prazni targets) kad nema splita: <2 sekcije, nepoznat Uvod, ili su sve
 * odnosno nijedna sekcija prednje. Cista funkcija (testabilno, bez DOM-a).
 */
export function sectionNumberingTargets(
  sections: Array<{ paragraphIndex?: number | null }> | undefined | null,
  introParagraphIndex: number | null | undefined,
): { detectable: boolean; targets: SectionNumberingTarget[] } {
  if (introParagraphIndex == null || !Array.isArray(sections) || sections.length < 2) {
    return { detectable: false, targets: [] };
  }
  const isFront = (s: { paragraphIndex?: number | null }) =>
    typeof s?.paragraphIndex === 'number' && s.paragraphIndex < introParagraphIndex;
  // Prva sekcija koja NIJE prednja = pocetak glavnog teksta. mainStartIndex<=0 znaci
  // "nema prednje sekcije" ili "nema glavne" -> nema splita za popraviti.
  const mainStartIndex = sections.findIndex((s) => !isFront(s));
  if (mainStartIndex <= 0) return { detectable: false, targets: [] };
  // Kljucni uvjet ISPRAVNOSTI (adversarial review): pgNumType w:start=1 restarta numeriranje
  // na POCETKU glavne sekcije, pa prijelom sekcije mora KOINCIDIRATI s Uvodom. Zadnja prednja
  // sekcija mora zavrsavati tocno na paragrafu prije Uvoda (glavna sekcija POCINJE Uvodom),
  // inace bi arapski restart pao na prednji dio (sazetak/sadrzaj), a Uvod ne bi dobio broj 1.
  // Kad prijelom nije na Uvodu, umetanje prijeloma je posao koraka b (K6), ne K4 -> no-op.
  const before = sections[mainStartIndex - 1];
  if (before.paragraphIndex !== introParagraphIndex - 1) return { detectable: false, targets: [] };
  const targets: SectionNumberingTarget[] = sections.map((_s, i): SectionNumberingTarget => {
    if (i < mainStartIndex) {
      return i === 0 ? { sectionIndex: i, fmt: 'lowerRoman', start: 1 } : { sectionIndex: i, fmt: 'lowerRoman' };
    }
    return i === mainStartIndex ? { sectionIndex: i, fmt: 'decimal', start: 1 } : { sectionIndex: i, fmt: 'decimal' };
  });
  return { detectable: true, targets };
}

/**
 * Popravak numeriranja stranica od Uvoda (BL-06 korak a): rimski na prednjim listovima,
 * arapski od Uvoda (start=1). Gejtano profilnim flagom checkPageNumberStartAtIntro (isti
 * obrazac kao paragraphSpacingRepairableItem) I detektabilnom granicom Uvoda iz
 * result.details (sections + introParagraphIndex). Kad dokument nema split sekcija, popravak
 * se ne nudi (fixer bi ionako bio bit-identican no-op). violated se ocitava iz checkova
 * numeriranja (postoje samo kad dokument ima PAGE polje), pa je u teaseru konzervativan.
 */
export function pageNumberingRepairableItem(result: any, profile: any): RepairableItem[] {
  if (profile?.checkPageNumberStartAtIntro !== true) return [];
  const { detectable, targets } = sectionNumberingTargets(
    result?.details?.sections,
    result?.details?.introParagraphIndex,
  );
  if (!detectable) return [];
  const checks: AnalyzedCheck[] = result?.checks ?? [];
  const violated = isViolated('page-number-start', checks) || isViolated('page-number-scheme', checks);
  return [
    {
      ruleId: 'page-numbering-universal',
      fixerId: 'page-numbering-fixer',
      label: 'Numeriranje stranica od Uvoda (rimski/arapski)',
      params: { targets },
      violated,
    },
  ];
}

/**
 * Univerzalni popravak razmaka prije/poslije fusnota: isti obrazac kao
 * paragraphSpacingRepairableItem, ali gated na checkFootnoteParagraphSpacingZero
 * (analyzeDocx samo tada dodaje check 'Razmak prije i poslije fusnota', vidi
 * src/analysis/analyze-docx.ts). Nije vezan za ruleEntry.
 */
export function footnoteSpacingRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  if (profile?.checkFootnoteParagraphSpacingZero !== true) return [];
  return [
    {
      ruleId: 'footnote-spacing-universal',
      fixerId: 'footnote-spacing-fixer',
      label: 'Razmak prije i poslije fusnota',
      params: {},
      violated: isViolated('footnote-spacing', checks),
    },
  ];
}

/**
 * Univerzalni popravak poravnanja broja stranice: isti obrazac kao
 * footnoteSpacingRepairableItem, gated na profile.pageNumberAlignment (analyzeDocx
 * samo tada dodaje check 'Položaj broja stranice', vidi src/analysis/analyze-docx.ts).
 * Nije vezan za ruleEntry.
 *
 * RE-04: profili u data/ nose STRING vrijednost ("right"), ne boolean `true`; gate koji je trazio
 * doslovni `=== true` je bio MRTAV za svaki stvarni profil (analiza sama gate-a na truthy, vidi
 * profile.pageNumberAlignment&&pageNums u analyze-docx.ts). Gate je sada na truthy, a STRING
 * vrijednost ide u params.align (fixer ju je dosad ignorirao i imao tvrdo upisano 'right').
 */
export function pageNumberAlignmentRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  if (!profile?.pageNumberAlignment) return [];
  const align = profile.pageNumberAlignment === true ? 'right' : String(profile.pageNumberAlignment);
  return [
    {
      ruleId: 'page-number-alignment-universal',
      fixerId: 'page-number-alignment-fixer',
      label: 'Položaj broja stranice',
      params: { align },
      violated: isViolated('page-number-alignment', checks),
    },
  ];
}

/**
 * Oblikovanje naslova po razinama. Vrijednosti dolaze ISKLJUCIVO iz `profile.headingRules`, dakle
 * iz sluzbene upute fakulteta; profil bez tog pravila ne dobiva stavku. Popravljaju se samo
 * velicina, podebljano, kurziv i poravnanje slijeva, jer se sve to nalazi u stilu razine.
 *
 * NAMJERNO IZOSTAVLJENO: velika slova i numeriranje naslova. Provjera velikih slova cita TEKST
 * (isUppercaseText), pa bi je `w:caps` zavarao a da tekst ostane isti; pravo rjesenje trazi
 * prepisivanje autorova teksta. Numeriranje bi ubacivalo oznake razina, sto je takodjer autorska
 * odluka. Oboje ostaje u rucnim uputama.
 */
export function headingFormatRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  const rules = profile?.headingRules;
  if (!rules || typeof rules !== 'object') return [];
  const levels = rules.levels && typeof rules.levels === 'object' ? rules.levels : {};
  const maxLevel = Number(rules.maxLevel) || 3;
  const sizeHalfPoints = Number.isFinite(Number(rules.size)) ? Math.round(Number(rules.size) * 2) : undefined;
  const alignLeft = String(rules.align || '') === 'left';

  const targets: Array<Record<string, unknown>> = [];
  for (let level = 1; level <= maxLevel; level++) {
    const spec = levels[String(level)] || {};
    const target: Record<string, unknown> = { level };
    if (sizeHalfPoints !== undefined) target.sizeHalfPoints = sizeHalfPoints;
    if (spec.bold === true) target.bold = true;
    if (spec.italic === true) target.italic = true;
    if (alignLeft) target.alignLeft = true;
    // Razina bez ijednog popravljivog svojstva (npr. samo `uppercase`) se ne salje.
    if (Object.keys(target).length > 1) targets.push(target);
  }
  if (!targets.length) return [];

  return [
    {
      ruleId: 'heading-format-universal',
      fixerId: 'heading-format-fixer',
      label: 'Oblikovanje naslova po razinama',
      params: { targets },
      violated: isViolated('heading-format', checks),
    },
  ];
}

/**
 * Velika slova naslova: JEDINA stavka koja mijenja AUTOROV TEKST.
 *
 * Zato nikad ne ulazi u "Popravi sve" (vraca se odvojeno, vidi app.ts) i nosi
 * `requiresConfirmation`. Korisniku se uz nju uvijek nudi i opcija "samo prijedlog", koja tocno
 * pokaze koji bi se naslovi promijenili i kako, bez ijedne izmjene dokumenta.
 */
export function headingCaseRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  const rules = profile?.headingRules;
  const levels = rules?.levels;
  if (!rules || !levels || typeof levels !== 'object') return [];
  const maxLevel = Number(rules.maxLevel) || 3;
  const wanted: number[] = [];
  for (let level = 1; level <= maxLevel; level++) {
    if (levels[String(level)]?.uppercase === true) wanted.push(level);
  }
  if (!wanted.length) return [];

  const opis = wanted.length === 1 ? `naslova ${wanted[0]}. razine` : `naslova razina ${wanted.join(', ')}`;
  return [
    {
      ruleId: 'heading-case-universal',
      fixerId: 'heading-case-fixer',
      label: 'Velika slova naslova',
      params: { levels: wanted },
      violated: isViolated('heading-format', checks),
      requiresConfirmation: true,
      confirmationText: `Ovo mijenja TEKST ${opis} u velika slova. Jedini je popravak koji dira sadržaj rada, pa se primjenjuje samo uz tvoju izričitu privolu.`,
    },
  ];
}

/**
 * Font i velicina teksta fusnota. Gated na profilne `footnoteFont`/`footnoteSize`, koje postavlja
 * samo pravni profil (isti izvor koji analiza koristi za provjeru "Oblikovanje fusnota").
 */
export function footnoteTypographyRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  const fonts: unknown = profile?.footnoteFont;
  const size = Number(profile?.footnoteSize);
  const fontName = Array.isArray(fonts) && typeof fonts[0] === 'string' ? String(fonts[0]) : undefined;
  const fontSizePt = Number.isFinite(size) && size > 0 ? size : undefined;
  if (fontName === undefined && fontSizePt === undefined) return [];

  const params: Record<string, unknown> = {};
  if (fontName !== undefined) params.fontName = fontName;
  if (fontSizePt !== undefined) params.fontSizePt = fontSizePt;
  if (profile?.footnoteJustify === true) params.alignJustify = true;
  return [
    {
      ruleId: 'footnote-typography-universal',
      fixerId: 'footnote-typography-fixer',
      label: 'Font i veličina fusnota',
      params,
      violated: isViolated('footnote-typography', checks),
    },
  ];
}

// GO-LIVE zastavica (K6, BL-07c). Umetanje sekcije prije Uvoda je strukturna izmjena docx-a
// ciju realnu Word/LibreOffice valjanost golden NE moze dokazati (pokriva samo XML-transform);
// izlazni gate K6 trazi rucnu Word/LO matricu prije objave. Dok je false, popravak se ne nudi
// korisniku (motor + testovi + golden su zeleni, ali putanja je "tamna"). Vlasnik je postavlja
// na true TEK nakon rucne matrice (K5+K6 se objavljuju zajedno). Vidi docs/LEKTA_BUILD_PIPELINE.md K6.
// UPALJENO 2026-07-19 nakon vlasnicke Word/LibreOffice validacije (WS-4) na demo-diplomskom:
// naslovnica bez broja, rimski na prednjim listovima, arapski od Uvoda - potvrdjeno u oba preglednika.
export const SECTION_INSERT_LIVE = true;

/**
 * Popravak "numeriranje od Uvoda" za dokument BEZ upotrebljivog prijeloma sekcije (najcesci
 * slucaj: jedna sekcija). Umece prijelom sekcije prije Uvoda pa postavlja rimski/arapski
 * numeriranje i podnozje s brojem (kompozitni section-insert-fixer). Gejtano:
 *  - profilnom zastavicom checkPageNumberStartAtIntro (isti izvor kao K4 stavka),
 *  - detektabilnom granicom Uvoda: introParagraphIndex >= 2 (mora postojati prednji dio),
 *  - ODSUSTVOM upotrebljivog splita: kad sectionNumberingTargets vec vrati detectable=true,
 *    dokument IMA sekcije s granicom na Uvodu pa to rjesava K4 stavka (pageNumberingRepairableItem),
 *    ne umetanje; ovdje se nudi samo kad K4 put NE hvata (nema splita ili nije na Uvodu),
 *  - SECTION_INSERT_LIVE zastavicom (rucna Word/LO matrica prije objave).
 * Trazi izricitu potvrdu lokacije u panelu (requiresConfirmation): umetanje prijeloma je
 * semanticka odluka o mjestu, najveci UX rizik pipelinea. violated se cita iz STATUSA
 * numeriranje-checka (nebodovan na jednosekcijskom radu, ali 'warn' kad nije potvrdjen).
 */
export function introSectionRepairableItem(result: any, profile: any): RepairableItem[] {
  // GO-LIVE gate (K6): dok rucna Word/LO matrica nije odradjena, ne nudi se korisniku.
  return SECTION_INSERT_LIVE ? introSectionItem(result, profile) : [];
}

/** Jezgra logike (neovisna o SECTION_INSERT_LIVE), izdvojena da se gating moze testirati bez
 *  diranja zastavice. app.ts UVIJEK zove flag-gated introSectionRepairableItem, ne ovu. */
export function introSectionItem(result: any, profile: any): RepairableItem[] {
  if (profile?.checkPageNumberStartAtIntro !== true) return [];
  const introIdx = result?.details?.introParagraphIndex;
  if (typeof introIdx !== 'number' || introIdx < 2) return [];
  // OPSEG K6 v1: nudi se SAMO za jednosekcijski rad (ista granica kao sectionInsertFixer
  // backstop). Visesekcijski dokument -> ne nudimo umetanje (rizik krivog mapiranja sekcija):
  //  - ako je granica sekcije tocno na Uvodu, K4 stavka (pageNumberingRepairableItem) to rjesava
  //    postavljanjem pgNumType nad postojecim sekcijama; umetanje bi bilo dvostruki prijelom,
  //  - ako granica NIJE na Uvodu (npr. zasebna naslovnica pa sazetak pa Uvod), umetanje markera
  //    dalo bi >=3 sekcije i hardkodirani rimski/arapski ciljevi bi krivo mapirali prednji dio;
  //    to je odgodjeno (isti razlog kao backstop u sectionInsertFixer).
  const sections = result?.details?.sections;
  if (!Array.isArray(sections) || sections.length !== 1) return [];
  const checks: AnalyzedCheck[] = result?.checks ?? [];
  const startStatus = checkStatusByTitle(checks, CHECK_TITLE['page-number-start']);
  // violated: numeriranje od Uvoda nije potvrdjeno (status != 'pass' ili check ne postoji).
  const violated = startStatus !== 'pass';
  return [
    {
      ruleId: 'section-insert-intro',
      fixerId: 'section-insert-fixer',
      label: 'Numeriranje od Uvoda: umetni prijelom sekcije (rimski/arapski, naslovnica bez broja)',
      params: { target: { introParagraphIndex: introIdx, align: 'center' } },
      violated,
      requiresConfirmation: true,
      confirmationText:
        `Umetnut ćemo prijelom sekcije neposredno prije ${introIdx}. odlomka (Uvod). ` +
        'Prednji listovi (naslovnica, sažetak, sadržaj) dobivaju rimske brojeve, glavni tekst od Uvoda arapske od 1, ' +
        'a naslovnica ostaje bez broja. Provjeri da je to točno mjesto početka Uvoda prije nego nastaviš.',
    },
  ];
}

// GO-LIVE zastavica (K7, BL-09). Umetanje TOC polja je strukturna docx izmjena ciju realnu Word
// regeneraciju (osvjezava li Word polje na otvaranju, bez "repair" upozorenja) golden NE dokazuje;
// izlazni gate K7 trazi rucnu provjeru u Wordu. Dok je false, popravak se ne nudi (motor + testovi +
// golden zeleni, putanja tamna). Vlasnik postavlja na true nakon Word provjere (moze zajedno s K5/K6
// matricom, jednom Word sesijom). Vidi docs/LEKTA_BUILD_PIPELINE.md K7.
// UPALJENO 2026-07-19 nakon vlasnicke Word validacije (WS-4): TOC je SDT sadrzaj-kontrola
// (docPartGallery "Table of Contents") pa Word nudi "Azuriraj tablicu" i regenerira sadrzaj.
export const TOC_FIELD_LIVE = true;

/**
 * Popravak: pretvori rucni "Sadrzaj" u ZIVO TOC polje (K7, BL-09). Nedestruktivno (dodaje polje, NE
 * brise rucne stavke; fixer to poručuje u afterLabel). Gejtano:
 *  - profil trazi sadrzaj (requireToc),
 *  - postoji naslov Sadrzaj (details.sadrzajParagraphIndex != null) = sidro za umetanje,
 *  - dokument JOS NEMA zivo TOC polje (details.hasTocField !== true) = ne dupliciramo,
 *  - TOC_FIELD_LIVE zastavica (rucna Word provjera prije objave).
 * app.ts UVIJEK zove flag-gated tocFieldRepairableItem, ne jezgru tocFieldItem.
 */
export function tocFieldRepairableItem(result: any, profile: any): RepairableItem[] {
  return TOC_FIELD_LIVE ? tocFieldItem(result, profile) : [];
}

/** Jezgra (neovisna o TOC_FIELD_LIVE), izdvojena da se gating testira bez diranja zastavice. */
export function tocFieldItem(result: any, profile: any): RepairableItem[] {
  if (profile?.requireToc !== true) return [];
  const sadrzajIdx = result?.details?.sadrzajParagraphIndex;
  if (typeof sadrzajIdx !== 'number' || sadrzajIdx < 1) return [];
  if (result?.details?.hasTocField === true) return []; // vec ima zivo polje -> ne nudimo (ne dupliciramo)
  return [
    {
      ruleId: 'toc-field-universal',
      fixerId: 'toc-field-fixer',
      label: 'Sadržaj: pretvori u živo TOC polje (Word ga sam ažurira)',
      params: { target: { sadrzajParagraphIndex: sadrzajIdx } },
      violated: true,
    },
  ];
}
