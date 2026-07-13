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
