// src/ui/repair-items.ts
//
// Cista izvedba RepairableItem[] iz rezultata analize + profila (Opcija A: nudi popravak
// SAMO za PREKRSENE dimenzije). Kljucno nacelo: ciljane cm/pt vrijednosti (params) dolaze
// ISKLJUCIVO iz PROFILA (currentProfile().p), nikad hardkodirano. Bez DOM-a i bez globalnog
// stanja -> testabilno; app.ts ga samo poziva i mountira rezultat (uz paywall gating).

import type { RepairableItem } from './repair-panel';
import type { RuleEntry } from '../profiles/profile-schema';
import type { Issue } from '../scoring/checks';

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
