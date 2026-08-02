/**
 * Closed-loop provjera preostalih profilno-ovisnih fixera bez stvarnih institucijskih podataka
 * danas (section-surgery, required-section, element-caption, table-figure-rescue) - rucno
 * izgradjen sinteticki profil-overlay, isti obrazac kao tests/repair-closed-loop-citations.test.ts.
 * Vidi plan prosirenja, Batch 5 (drugi dio).
 */
import { describe, it } from 'vitest';
import { resolveProfile } from '../src/analysis/golden-entry';
import { sectionSurgeryRepairableItem, requiredSectionsRepairableItem, elementCaptionRepairableItem, tableFigureRescueRepairableItem } from '../src/ui/repair-items';
import { packageDoc, paragraph, documentXml, buildRepairTemplate } from './helpers/repair-templates';
import { runClosedLoopCase } from './helpers/closed-loop-runner';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function withRuleEntry(profileId: string, checkId: string, value: unknown, extra: Record<string, unknown> = {}) {
  const profile = resolveProfile(profileId) as any;
  return {
    ...profile,
    ...extra,
    ruleEntries: [...(Array.isArray(profile.ruleEntries) ? profile.ruleEntries : []), { checkId, status: 'verified', sourceId: 'test-synthetic', sourcePage: '1', quote: 'sintetičko pravilo za test', value }],
  };
}

describe('Repair Engine closed-loop: section-surgery-fixer (sinteticki profil)', () => {
  it('fer-diplomski + izmisljeno section-surgery-rules: margine glavne sekcije ne odgovaraju profilu', async () => {
    const profileId = 'fer-diplomski';
    await runClosedLoopCase({
      label: `section-surgery/${profileId}`,
      profileId,
      buildBrokenDocx: () => buildRepairTemplate('title-page-sections'),
      // Margine se namjerno poklapaju s profile.margins (fer-diplomski): section-surgery-fixer
      // pise EKSPLICITNE margine na glavnu sekciju, pa razlicita vrijednost od profilnog polja
      // koje "Margine dokumenta" check cita otvara NEPOVEZANU regresiju (dvije razlicite putanje
      // do margina - profilna i section-surgery - moraju se ovdje namjerno poklapati).
      buildItems: (before) => sectionSurgeryRepairableItem(before, withRuleEntry(profileId, 'section-surgery-rules', { mainMatter: { margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 } } })),
      isResolved: (after) => (after?.details?.sectionStructure?.sections?.length ?? 0) >= 2,
    });
  }, 30000);
});

describe('Repair Engine closed-loop: required-section-fixer (sinteticki profil)', () => {
  it('fpzg-politologija-zavrsni + izmisljeno required-section-rules: nedostaju obvezni dijelovi', async () => {
    const profileId = 'fpzg-politologija-zavrsni'; // stvarni profil VEC ima requiredSections (flat), samo fixer-grade rule je sinteticki
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    const body = documentXml(`${paragraph('Uvod', 'Heading1')}${paragraph('Tijelo teksta rada koje slijedi nakon uvoda.')}`);
    await runClosedLoopCase({
      label: `required-section/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml }),
      // Kandidati default selected samo uz confidence:'high'; ovaj minimalni dokument daje 'medium'
      // (stvarno, ocekivano ponasanje - manje sigurnosti bez vise konteksta), pa simuliramo da je
      // korisnik potvrdio odabir, isti obrazac kao consistency-fixer/citation-sync gore.
      buildItems: (before) => {
        const items = requiredSectionsRepairableItem(before, withRuleEntry(profileId, 'required-section-rules', { placeholderText: {}, addComment: false }));
        return items.map((item) => {
          const form = item.requiredSectionsForm;
          if (!form) return item;
          const updatedForm = { ...form, candidates: form.candidates.map((candidate) => ({ ...candidate, selected: true })) };
          return { ...item, params: form.buildParams(updatedForm) };
        });
      },
      isResolved: (after) => {
        const candidates = after?.details?.requiredSectionsStructure?.candidates ?? [];
        return candidates.some((c: any) => c.present === true);
      },
      allowTextChange: true, // umece naslove nedostajucih dijelova (ne izmislja akademski sadrzaj)
    });
  }, 30000);
});

describe('Repair Engine closed-loop: element-caption-fixer (sinteticki profil)', () => {
  it('fer-diplomski + izmisljeno element-caption-rules: tablica bez natpisa', async () => {
    const profileId = 'fer-diplomski';
    await runClosedLoopCase({
      label: `element-caption/${profileId}`,
      profileId,
      buildBrokenDocx: () => buildRepairTemplate('tables-images'),
      buildItems: (before) => {
        const profile = withRuleEntry(profileId, 'element-caption-rules', { labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' }, captionPosition: { table: 'above', figure: 'below', chart: 'below' }, numbering: 'document' });
        const items = elementCaptionRepairableItem(before, profile);
        return items.map((item) => {
          const form = item.elementCaptionForm;
          if (!form) return item;
          const updatedForm = { ...form, candidates: form.candidates.map((candidate) => ({ ...candidate, selected: true, description: candidate.description || 'Opis elementa' })) };
          return { ...item, params: form.buildParams(updatedForm) };
        });
      },
      isResolved: (after) => (after?.details?.elementStructure?.candidates?.length ?? 0) > 0,
      allowTextChange: true, // umece natpis (tekst "Tablica 1: ...") - nova oznaka, ne autorski sadrzaj
    });
  }, 30000);
});

describe('Repair Engine closed-loop: table-figure-rescue-fixer (sinteticki profil)', () => {
  it('fer-diplomski + izmisljeno table-figure-rescue-rules: siroka tablica bez ponovljenog zaglavlja', async () => {
    const profileId = 'fer-diplomski';
    await runClosedLoopCase({
      label: `table-figure-rescue/${profileId}`,
      profileId,
      buildBrokenDocx: () => buildRepairTemplate('tables-images'),
      // Namjerno BEZ rules.table (font/sizePt): applyProfileTypography bi diralo velicinu teksta u
      // tablici i otvorilo NEPOVEZANU regresiju na "Velicina osnovnog teksta" (dominantna velicina
      // dokumenta), koja s ovom (strukturnom) tablicno-figure sanacijom nema veze.
      buildItems: (before) => tableFigureRescueRepairableItem(before, withRuleEntry(profileId, 'table-figure-rescue-rules', { figure: { minDpi: 150, keepWithCaption: true } })),
      isResolved: (after) => {
        const structure = after?.details?.tableFigureRescue;
        return (structure?.tables?.length ?? 0) + (structure?.figures?.length ?? 0) > 0;
      },
    });
  }, 30000);
});
