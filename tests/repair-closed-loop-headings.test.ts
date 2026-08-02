/**
 * Closed-loop provjera profilno-ovisnih fixera koji IMAJU stvarnu institucijsku varijaciju
 * danas: heading-format-fixer, heading-case-fixer, heading-style-fixer, footnote-typography-fixer
 * (vidi plan prosirenja u docs/FACULTY_MATRIX.md susjednom radu - Batch 1).
 *
 * Za razliku od tests/repair-closed-loop.test.ts (5 osnovnih fixera preko buildRepairableItems),
 * ovi fixeri imaju SVOJU samostalnu *RepairableItem funkciju u src/ui/repair-items.ts koja cita
 * profile.headingRules / profile.footnoteFont / stvarnu analiziranu strukturu naslova. Zajednicki
 * closed-loop koraci (analiza -> popravak -> reanaliza -> dokaz) su u tests/helpers/closed-loop-runner.ts.
 */
import { describe, it } from 'vitest';
import { resolveProfile } from '../src/analysis/golden-entry';
import { headingFormatRepairableItem, headingCaseRepairableItem, headingStructureRepairableItem, footnoteTypographyRepairableItem } from '../src/ui/repair-items';
import { CHECK_TITLES } from '../src/analysis/check-fixer-map';
import { packageDoc, paragraph, documentXml } from './helpers/repair-templates';
import { runClosedLoopCase } from './helpers/closed-loop-runner';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

interface HeadingLevelSpec {
  bold?: boolean;
  italic?: boolean;
  uppercase?: boolean;
}

/** Gradi styles.xml s HeadingN stilovima namjerno BEZ trazenih svojstava (bold/italic/velicina). */
function buildBrokenHeadingStyles(maxLevel: number, size: number | undefined): string {
  const wrongSizeHalfPoints = size ? Math.max(12, Math.round((size - 4) * 2)) : null;
  const headingStyles = Array.from({ length: maxLevel }, (_, index) => {
    const level = index + 1;
    const rPr = wrongSizeHalfPoints ? `<w:rPr><w:sz w:val="${wrongSizeHalfPoints}"/></w:rPr>` : '';
    return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>${rPr}</w:style>`;
  }).join('');
  return `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${headingStyles}</w:styles>`;
}

function buildBrokenHeadingsDocx(profile: any): Promise<Uint8Array> {
  const rules = profile.headingRules;
  const maxLevel: number = Number(rules.maxLevel) || 3;
  const levels: Record<string, HeadingLevelSpec> = rules.levels || {};
  const body = Array.from({ length: maxLevel }, (_, index) => {
    const level = index + 1;
    const spec = levels[String(level)] || {};
    // Namjerno pogresan tekst: malim slovima kad profil trazi velika (uppercase check).
    const text = spec.uppercase ? `poglavlje razine ${level} bez velikih slova` : `Poglavlje razine ${level}`;
    return paragraph(text, `Heading${level}`);
  }).join('') + paragraph('Tijelo teksta koje nije naslov i ne smije biti prekrsteno u naslov.');
  const stylesXml = buildBrokenHeadingStyles(maxLevel, typeof rules.size === 'number' ? rules.size : undefined);
  return packageDoc({ documentXml: documentXml(body), stylesXml });
}

const HEADING_PROFILE_CASES = [
  'pravo-integrirani-diplomski', // size 12, L1 uppercase, L2 bold, L3 bold+italic
  'pravo-socijalni-rad-zavrsni', // maxLevel 5, L1 bold, L2-5 italic, bez uppercase
  'zsem-diplomski', // L1+L2 uppercase, L3 bez ijednog popravljivog svojstva
  'riteh-zavrsni', // samo L1 uppercase, bez size
  'gradri-zavrsni', // L1 uppercase+bold, L2 bold, L3 bold+italic
];

function hasUppercaseLevel(rules: any): boolean {
  const levels = rules?.levels || {};
  return Object.values(levels).some((spec: any) => spec?.uppercase === true);
}

describe('Repair Engine closed-loop: naslovi po profilnim headingRules', () => {
  it.each(HEADING_PROFILE_CASES)('%s: heading-format-fixer + heading-case-fixer popravljaju sve razine', async (profileId) => {
    const profile = resolveProfile(profileId) as any;
    await runClosedLoopCase({
      label: `heading-rules/${profileId}`,
      profileId,
      buildBrokenDocx: () => buildBrokenHeadingsDocx(profile),
      buildItems: (before, p) => [...headingFormatRepairableItem(before.checks ?? [], p), ...headingCaseRepairableItem(before.checks ?? [], p)],
      targetTitles: [CHECK_TITLES['heading-format']],
      // heading-case-fixer je JEDINI popravak koji dira autorov tekst (velika slova) - ocekivano
      // samo kad profil ima barem jednu uppercase razinu (npr. pravo-socijalni-rad-zavrsni nema nijednu).
      allowTextChange: hasUppercaseLevel(profile.headingRules),
    });
  }, 30000);
});

describe('Repair Engine closed-loop: heading-style-fixer (rucno oblikovani naslovi -> Word stilovi)', () => {
  const CASES = ['pravo-integrirani-diplomski', 'riteh-zavrsni']; // s/bez profile.headingRules.size (clearDirectSize grana)

  it.each(CASES)('%s: rucno numerirani naslovi bez Heading stila prepoznaju se i promoviraju', async (profileId) => {
    const profile = resolveProfile(profileId) as any;
    // L1 tekst je VEC velikim slovima, L2 VEC podebljan (kad profil to trazi): obje profila trazi
    // uppercase na L1 (pravo-integrirani dodatno bold na L2), pa bi inace samo promoviranje u Heading
    // stil (posao OVOG fixera, heading-style-fixer) usput otvorilo NOVU povredu u "Oblikovanje naslova
    // po razinama" (drugi, nepovezani check - to je heading-format-fixer-ov posao, vec dokazano
    // zajedno u tests/repair-combinations.test.ts). Ovaj test namjerno izolira SAMO strukturnu
    // promociju, pa L1/L2 tekst vec dolazi u ispravnom obliku za odabrani profil.
    const l2Bold = profile.headingRules?.levels?.['2']?.bold === true;
    const l2Heading = l2Bold
      ? '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>1.1. Metodologija istrazivanja</w:t></w:r></w:p>'
      : paragraph('1.1. Metodologija istrazivanja');
    const body = `${paragraph('1. UVOD U TEMU ISTRAZIVANJA')}${paragraph('Nekoliko recenica obicnog tijela teksta koje slijedi nakon prvog rucno oblikovanog naslova bez stila.')}${l2Heading}${paragraph('Jos obicnog tijela teksta nakon drugog rucno oblikovanog naslova.')}`;
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`;
    await runClosedLoopCase({
      label: `heading-style/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: documentXml(body), stylesXml }),
      buildItems: (before, p) => headingStructureRepairableItem(before, p),
      targetTitles: ['Uporaba Word stilova naslova', 'Hijerarhija naslova'],
    });
  }, 30000);
});

describe('Repair Engine closed-loop: footnote-typography-fixer (samo legalFootnoteProfile ima bodovan check)', () => {
  // NAPOMENA: "Oblikovanje fusnota" check (CHECK_TITLES['footnote-typography']) racuna se ISKLJUCIVO
  // kad je profile.legalFootnoteProfile true (src/analysis/analyze-docx.ts). footnoteTypographyRepairableItem
  // nudi popravak i za profile bez tog flaga (samo na temelju footnoteFont/footnoteSize), ali tada
  // nema check-a koji bi potvrdio uspjeh - isti obrazac "ponudjeno ali neprovjerljivo" kao Batch 5
  // (bibliography-repair-fixer i sl.), pa je ovaj closed-loop namjerno ogranicen na profile s tim flagom.
  const CASES = ['pravo-integrirani-diplomski', 'pravo-javna-uprava-diplomski'];

  it.each(CASES)('%s: font, velicina i poravnanje fusnota', async (profileId) => {
    const profile = resolveProfile(profileId) as any;
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Footnote Text"/><w:pPr><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
    const bodyXml = documentXml(`<w:p><w:r><w:t>Tekst uz pravni izvor </w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>`);
    const footnotesXml = `<w:footnotes ${WORD_NS}><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:t>Usp. Zakon o obveznim odnosima, NN 35/05, cl. 1.</w:t></w:r></w:p></w:footnote></w:footnotes>`;
    await runClosedLoopCase({
      label: `footnote-typography/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: bodyXml, stylesXml, footnotesXml }),
      buildItems: (before, p) => footnoteTypographyRepairableItem(before.checks ?? [], p),
      targetTitles: [CHECK_TITLES['footnote-typography']],
    });
  }, 30000);
});
