/**
 * Closed-loop provjera title-page-fixer-a (profilno-ovisan preko 198 institucijskih predlozaka -
 * vidi plan prosirenja, Batch 4). buildTitlePageRepairPlan (src/analysis/title-page-repair.ts)
 * radi SAMO kad je template.status==='verified' I template.provenance.status==='official' I
 * profile.checkTitlePage===true - danas je to jedino FPZG (19 profila, svi unitId='fpzg').
 * Od 4 FPZG predloska (doctoral/final/graduate/specialist), 'final' i 'doctoral' su
 * provenance:'derived' (plan uvijek null); SAMO 'graduate' i 'specialist' su 'official'. Uzorak
 * je zato ogranicen na ta dva stvarna, razlicita predloska unutar jedine institucije koja ovo
 * danas ima bodovano - ne 5-8 kako je prvotni plan pretpostavljao (ta pretpostavka o siroj
 * stvarnoj varijaciji nije se pokazala tocnom).
 */
import { describe, it } from 'vitest';
import { titlePageRepairableItem } from '../src/ui/repair-items';
import { findTitlePageTemplate, ensureTemplatesHeavy } from '../src/title-pages/template-loader';
import { packageDoc, paragraph, documentXml } from './helpers/repair-templates';
import { runClosedLoopCase } from './helpers/closed-loop-runner';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;

// Nepotpuna/pogresna naslovnica: 2 odlomka (drugi nosi w:br type="page" da firstPageParagraphs
// prepozna kraj prve stranice kao "confident"), zatim Uvod na drugoj stranici.
const brokenBody = `${paragraph('Nepotpuna naslovnica')}<w:p><w:r><w:t>Stari redak</w:t><w:br w:type="page"/></w:r></w:p>${paragraph('Uvod', 'Heading1')}${paragraph('Tijelo teksta rada nakon naslovnice.')}`;

const CASES: Array<{ profileId: string; level: string }> = [
  { profileId: 'fpzg-politologija-diplomski', level: 'graduate' },
  { profileId: 'fpzg-specijalisticki-odnosi-s-javnoscu', level: 'specialist' },
];

describe('Repair Engine closed-loop: title-page-fixer (sluzbeni FPZG predlosci)', () => {
  it.each(CASES)('$profileId ($level predlozak): naslovnica se regenerira prema sluzbenom rasporedu', async ({ profileId, level }) => {
    await ensureTemplatesHeavy();
    const template = findTitlePageTemplate('fpzg', level);
    await runClosedLoopCase({
      label: `title-page/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: documentXml(brokenBody), stylesXml }),
      buildItems: (before, p) => titlePageRepairableItem(before, p, template),
      // Fixer REGENERIRA cijelu omedjenu prvu stranicu prema sluzbenom rasporedu - ocekivana
      // promjena teksta (jedini nacin da "nepotpuna"/pogresna naslovnica postane ispravna).
      allowTextChange: true,
      targetTitles: [],
      // Dokaz uspjeha: regenerirana prva stranica sadrzi sluzbeni element predloska (naziv
      // sveucilista) koji "nepotpuna naslovnica" ulaz nikad nije imao.
      isResolved: (after) => {
        const front = (after?.preview?.paragraphs ?? []).slice(0, 4).map((p: any) => p.text).join(' ');
        return /sveučilište/i.test(front);
      },
    });
  }, 30000);
});
