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

/** Minimalni oblik provjere iz analyzeDocx rezultata (result.checks[]). */
export interface AnalyzedCheck {
  title: string;
  status: string;
  max: number;
}

/** checkId -> naslov checka koji analyzeDocx proizvodi (za korelaciju "je li prekrseno"). */
const CHECK_TITLE: Record<string, string> = {
  margins: 'Margine dokumenta',
  font: 'Dominantni font',
  'font-size': 'Veličina osnovnog teksta',
  'line-spacing': 'Prored osnovnog teksta',
  justify: 'Poravnanje osnovnog teksta',
  'paragraph-spacing': 'Razmak prije i poslije odlomka',
  'page-number-start': 'Numeriranje od prve stranice Uvoda',
  'page-number-scheme': 'Shema numeriranja stranica',
  'footnote-spacing': 'Razmak prije i poslije fusnota',
  'page-number-alignment': 'Položaj broja stranice',
};
// paper-size ima dinamican naslov ('Format stranice A4' / 'Format stranice (A4/A3)') -> prefiks.
const PAPER_SIZE_PREFIX = 'Format stranice';

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
 */
export function pageNumberAlignmentRepairableItem(checks: AnalyzedCheck[], profile: any): RepairableItem[] {
  if (profile?.pageNumberAlignment !== true) return [];
  return [
    {
      ruleId: 'page-number-alignment-universal',
      fixerId: 'page-number-alignment-fixer',
      label: 'Položaj broja stranice',
      params: {},
      violated: isViolated('page-number-alignment', checks),
    },
  ];
}

// GO-LIVE zastavica (K6, BL-07c). Umetanje sekcije prije Uvoda je strukturna izmjena docx-a
// ciju realnu Word/LibreOffice valjanost golden NE moze dokazati (pokriva samo XML-transform);
// izlazni gate K6 trazi rucnu Word/LO matricu prije objave. Dok je false, popravak se ne nudi
// korisniku (motor + testovi + golden su zeleni, ali putanja je "tamna"). Vlasnik je postavlja
// na true TEK nakon rucne matrice (K5+K6 se objavljuju zajedno). Vidi docs/LEKTA_BUILD_PIPELINE.md K6.
export const SECTION_INSERT_LIVE = false;

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
export const TOC_FIELD_LIVE = false;

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
