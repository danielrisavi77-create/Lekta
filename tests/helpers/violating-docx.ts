/**
 * Generator dokumenta koji NAMJERNO krsi pravila konkretnog profila (P4-1 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Zasto: closed-loop harness (`runClosedLoopCase`) je zreo i ima 29 slucajeva, ali svi rucno grade
 * svoj dokument, pa pokrivaju TOCNO DVA profila od 410. Da bi se petlja provrtjela kroz katalog,
 * pokvareni dokument mora nastati IZ PROFILA, a ne iz ruke.
 *
 * Nacelo: vrijednosti se INVERTIRAJU iz onoga sto profil stvarno propisuje (`paramsForCheck` je
 * jedini izvor ciljane vrijednosti, isti koji koristi i sucelje). Nista se ne pogadja: os koju
 * profil ne propisuje se NE krsi, jer bi popravak tada mijenjao ispravan rad.
 *
 * Granica: pokriva sest osi profilne grane popravka (font, velicina, prored, poravnanje, margine,
 * format papira). Strukturne osi (sadrzaj, obvezni dijelovi, naslovnica) imaju vlastite
 * closed-loop slucajeve i ne ulaze ovdje - vidi P2-4 mjerenje u planu.
 */
import { buildDocx, type DocSpec, type ParaSpec } from './docx-builder';
import { paramsForCheck } from '../../src/ui/repair-items';

/** Osi koje profilna grana popravka pokriva; sve ostalo ovaj generator namjerno ne dira. */
export const VIOLATABLE_CHECK_IDS = ['font', 'font-size', 'line-spacing', 'justify', 'margins', 'paper-size'] as const;
export type ViolatableCheckId = (typeof VIOLATABLE_CHECK_IDS)[number];

export interface ViolationResult {
  bytes: Uint8Array;
  /** checkId-jevi koje dokument doista krsi; prazno znaci da profil nema nijedno takvo pravilo. */
  violated: ViolatableCheckId[];
  /** Ciljane vrijednosti profila, radi citljivih poruka u testu. */
  targets: Partial<Record<ViolatableCheckId, Record<string, unknown>>>;
}

/** Font razlicit od ciljanog; dvije opcije da izbor nikad ne bude jednak cilju. */
function otherFont(target: string): string {
  return /times/i.test(target) ? 'Arial' : 'Times New Roman';
}

/** Velicina razlicita od ciljane, a i dalje realna (Word ne voli 0). */
function otherSizePt(target: number): number {
  return target >= 12 ? target - 2 : target + 2;
}

function otherSpacing(target: number): number {
  // 240-tine tocke: 1,0 = 240. Biramo prored koji sigurno nije ciljani.
  return Math.abs(target - 1.5) < 0.01 ? 240 : 360;
}

function otherAlign(target: string): ParaSpec['jc'] {
  return target === 'both' ? 'left' : 'both';
}

/**
 * Gradi dokument koji krsi svaku os koju profil propisuje.
 *
 * Vraca i popis prekrsenih osi: bez njega test ne moze razlikovati "popravak nije uspio" od
 * "profil to pravilo nema", sto je razlika izmedju kvara i urednog stanja.
 */
export async function buildViolatingDocx(profile: unknown): Promise<ViolationResult> {
  const targets: ViolationResult['targets'] = {};
  for (const checkId of VIOLATABLE_CHECK_IDS) {
    const params = paramsForCheck(checkId, profile);
    if (params) targets[checkId] = params;
  }

  const fontTarget = targets['font']?.fontName as string | undefined;
  const sizeTarget = targets['font-size']?.fontSizePt as number | undefined;
  const spacingTarget = targets['line-spacing']?.multiplier as number | undefined;
  const alignTarget = targets['justify']?.val as string | undefined;
  const marginsTarget = targets['margins'] as { top: number; right: number; bottom: number; left: number } | undefined;
  const paperTarget = targets['paper-size'] as { w: number; h: number } | undefined;

  const violated: ViolatableCheckId[] = [];
  const para: ParaSpec = {
    text:
      'Ovaj odlomak postoji da bi analiza imala tijelo rada nad kojim mjeri oblikovanje. ' +
      'Tekst se popravkom ne smije promijeniti, pa sluzi i kao kontrola ocuvanja sadrzaja.',
  };

  if (fontTarget) {
    para.font = otherFont(fontTarget);
    violated.push('font');
  }
  if (sizeTarget != null) {
    para.sizePt = otherSizePt(sizeTarget);
    violated.push('font-size');
  }
  if (spacingTarget != null) {
    para.spacingLine = otherSpacing(spacingTarget);
    violated.push('line-spacing');
  }
  if (alignTarget) {
    para.jc = otherAlign(alignTarget);
    violated.push('justify');
  }

  /**
   * Stilovi nose CILJANE vrijednosti profila, a odlomci ih krse IZRAVNIM oblikovanjem.
   *
   * To nije proizvoljan izbor nego jedini realan: Word upravo tako pise dokumente (predlozak u
   * stilu, autorovo formatiranje izravno preko njega), i tocno na to cilja "deep" preklopnik, koji
   * je u sucelju ukljucen po zadanom. Bez backstopa u stilu deep ciscenje NE SMIJE ukloniti izravno
   * oblikovanje, jer bi promijenilo izgled u nesto neodredjeno - izmjereno: bez `Normal` stila s
   * proredom i poravnanjem, prored i poravnanje ostaju neprimijenjeni koliko god puta popravak
   * izvrtio.
   */
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const normalPPr: string[] = [];
  if (spacingTarget != null) normalPPr.push(`<w:spacing w:line="${Math.round(spacingTarget * 240)}" w:lineRule="auto"/>`);
  if (alignTarget) normalPPr.push(`<w:jc w:val="${alignTarget}"/>`);
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles ${W}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    `<w:rFonts w:ascii="${fontTarget ?? 'Times New Roman'}" w:hAnsi="${fontTarget ?? 'Times New Roman'}"/>` +
    `<w:sz w:val="${Math.round((sizeTarget ?? 12) * 2)}"/>` +
    '</w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    (normalPPr.length ? `<w:pPr>${normalPPr.join('')}</w:pPr>` : '') +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
    '</w:styles>';

  const spec: DocSpec = {
    stylesXml,
    paragraphs: [
      { text: 'Uvod', styleId: 'Heading1' },
      para,
      { ...para, text: 'Drugi odlomak tijela rada, istog pogresnog oblikovanja kao prvi.' },
    ],
  };

  if (marginsTarget) {
    // Margine pomaknute za 1 cm od ciljanih, u smjeru koji nikad ne izlazi iz razumnog raspona.
    spec.marginsCm = {
      top: marginsTarget.top + 1,
      right: marginsTarget.right + 1,
      bottom: marginsTarget.bottom + 1,
      left: marginsTarget.left + 1,
    };
    violated.push('margins');
  }
  if (paperTarget) {
    // Letter umjesto ciljanog formata (ili A5 ako je cilj bas Letter-ove dimenzije).
    const isLetter = Math.abs(paperTarget.w - 21.59) < 0.1;
    spec.pageCm = isLetter ? { w: 14.8, h: 21.0 } : { w: 21.59, h: 27.94 };
    violated.push('paper-size');
  }

  return { bytes: await buildDocx(spec), violated, targets };
}
