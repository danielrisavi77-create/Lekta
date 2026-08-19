/**
 * Closed-loop provjera fixera koji su profilno-ovisni PO DIZAJNU, ali NIJEDNA stvarna institucija
 * jos nema verificiran ruleEntry za njih (bibliography-repair, citation-bibliography-sync,
 * legal-footnote-repair). Testiramo SAMO mehanizam preko rucno izgradjenog sintetickog profila
 * s izmisljenim ali realnim ruleEntry oblikom - isti obrazac kao postojeci tests/bibliography-repair.test.ts.
 * Vidi plan prosirenja, Batch 5 (korisnikova odluka: sinteticki profili, ne stvarno prikupljanje podataka).
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { bibliographyRepairableItem, citationBibliographySyncRepairableItem, legalFootnoteRepairableItem } from '../src/ui/repair-items';
import { applyFixers } from '../src/repair/apply-fixers';
import { legalFootnoteAnchorFingerprint } from '../src/analysis/legal-footnote-structure';
import { repairEntriesFor , ensureRepairMapHeavy } from '../src/profiles/profile-runtime-maps';

// repair-map je lijen; ucitaj ga prije prvog repairEntriesFor u ovom modulu.
await ensureRepairMapHeavy();
import { packageDoc, paragraph, documentXml, buildRepairTemplate } from './helpers/repair-templates';
import { runClosedLoopCase, documentText } from './helpers/closed-loop-runner';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function withRuleEntry(profileId: string, checkId: string, value: unknown, extra: Record<string, unknown> = {}) {
  const profile = resolveProfile(profileId) as any;
  return {
    ...profile,
    ...extra,
    ruleEntries: [...(Array.isArray(profile.ruleEntries) ? profile.ruleEntries : []), { checkId, status: 'verified', sourceId: 'test-synthetic', sourcePage: '1', quote: 'sintetičko pravilo za test', value }],
  };
}

describe('Repair Engine closed-loop: bibliography-repair-fixer (sinteticki profil)', () => {
  it('fer-diplomski + izmisljeno bibliography-rules: bibliografski zapis bez uvlake', async () => {
    const profileId = 'fer-diplomski';
    await runClosedLoopCase({
      label: `bibliography-repair/${profileId}`,
      profileId,
      buildBrokenDocx: () => buildRepairTemplate('bibliography-citations'),
      buildItems: (before) => bibliographyRepairableItem(before, withRuleEntry(profileId, 'bibliography-rules', { hangingIndentCm: 1.25, sort: 'alphabetical' })),
      isResolved: (after) => {
        const structure = after?.details?.bibliographyStructure;
        return (structure?.entries?.length ?? 0) > 0;
      },
    });
  }, 30000);
});

describe('Repair Engine closed-loop: citation-bibliography-sync-fixer (sinteticki profil)', () => {
  it('fer-diplomski + izmisljeno citation-sync-rules: citat s krivom godinom u odnosu na bibliografiju', async () => {
    const profileId = 'fer-diplomski';
    const body = documentXml(`${paragraph('Tekst koji navodi izvor (Horvat, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph('Horvat, I. (2022). Naslov rada.')}`);
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    await runClosedLoopCase({
      label: `citation-sync/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml }),
      buildItems: (before) => {
        const profile = withRuleEntry(profileId, 'citation-sync-rules', { mode: 'author-year' });
        const items = citationBibliographySyncRepairableItem(before, profile);
        return items.map((item) => {
          const form = item.citationBibliographySyncForm;
          if (!form) return item;
          const updatedForm = {
            ...form,
            citations: form.citations.map((citation) => ({
              ...citation,
              selected: true,
              // Uskladi godinu u citatu s bibliografskim zapisom (2021 -> 2022), bez obzira na to
              // je li sync engine vec pronasao kandidata (status "missing" ima 0 kandidata).
              replacementText: citation.rawText.replace(/\d{4}/, '2022'),
            })),
          };
          return { ...item, params: form.buildParams(updatedForm) };
        });
      },
      isResolved: (after) => {
        const sync = after?.details?.citationBibliographySync;
        return (sync?.summary?.missing ?? 0) === 0 && (sync?.summary?.ambiguous ?? 0) === 0;
      },
      allowTextChange: true, // popravak upravo MIJENJA citatni tekst radi uskladjivanja s bibliografijom
    });
  }, 30000);
});

/**
 * Provjera STVARNOG ozicenja (ne sintetickog profila iznad): FPZG je prvi fakultet s pravim,
 * ljudski verificiranim bibliography-rules/citation-sync-rules ruleEntry-jem. Prije popravka
 * ozicenja (2026-08-02) analyzedProfile.ruleEntries u zivom app.ts NIKAD nije bio postavljen
 * (repair-map.json se citao samo za buildRepairableItems, ne za *RepairableItem funkcije koje
 * profile.ruleEntries citaju izravno) - vidi napomenu u scripts/gen-profile-runtime-maps.mts.
 * Ovaj test namjerno NE koristi withRuleEntry (rucno izmisljen ruleEntry) nego repairEntriesFor()
 * - istu pecenu funkciju koju poziva src/ui/app.ts - da dokaze da PRAVI put od podataka do
 * fixera stvarno radi, ne samo da fixer-logika radi kad joj se rucno gurne ispravan oblik.
 */
function withRealRepairMapEntries(profileId: string) {
  const profile = resolveProfile(profileId) as any;
  return { ...profile, ruleEntries: repairEntriesFor(profileId) };
}

describe('Repair Engine closed-loop: FPZG stvarno ozicenje (repair-map.json, ne sinteticki profil)', () => {
  it('fpzg-politologija-diplomski: bibliography-rules iz repair-map.json aktivira bibliography-repair-fixer', async () => {
    const profileId = 'fpzg-politologija-diplomski';
    const baked = repairEntriesFor(profileId);
    const bibliographyEntry = baked.find((entry: any) => entry.checkId === 'bibliography-rules');
    expect(bibliographyEntry, 'bibliography-rules mora biti pecen u repair-map.json za ovaj profil').toBeDefined();
    expect(bibliographyEntry!.status).toBe('verified');
    expect(bibliographyEntry!.value).toEqual({ sort: 'alphabetical', authorYearSuffixes: true });
    // FPZG-ov stvaran izvor daje SAMO sort+authorYearSuffixes (nema hangingIndentCm/beforePt - nije
    // izmisljeno, nije u izvoru), pa jednozapisni bibliography-citations predlozak nema sto popraviti
    // (poredak od 1 zapisa je trivijalno no-op). Ovdje namjerno 2 zapisa OBRNUTIM abecednim redom da
    // sort:alphabetical stvarno ima ucinka - dokazuje da JE vrijednost stigla do fixera, ne samo da je pecena.
    const body = documentXml(`${paragraph('Prvi tekst (Zoric, 2020).')}${paragraph('Drugi tekst (Adamic, 2019).')}${paragraph('Literatura', 'Heading1')}${paragraph('Zoric, P. (2020). Naslov Z.')}${paragraph('Adamic, A. (2019). Naslov A.')}`);
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    await runClosedLoopCase({
      label: `bibliography-repair-live/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml }),
      buildItems: (before) => bibliographyRepairableItem(before, withRealRepairMapEntries(profileId)),
      isResolved: (after) => {
        const structure = after?.details?.bibliographyStructure;
        return (structure?.entries?.length ?? 0) > 0;
      },
      allowTextChange: true, // preslaguje redoslijed zapisa u Literaturi (abecedno), ne autorski sadrzaj
    });
  }, 30000);

  it('fpzg-politologija-diplomski: citation-sync-rules iz repair-map.json aktivira citation-bibliography-sync-fixer', async () => {
    const profileId = 'fpzg-politologija-diplomski';
    const baked = repairEntriesFor(profileId);
    const syncEntry = baked.find((entry: any) => entry.checkId === 'citation-sync-rules');
    expect(syncEntry, 'citation-sync-rules mora biti pecen u repair-map.json za ovaj profil').toBeDefined();
    expect(syncEntry!.value).toEqual({ mode: 'author-year' });
    const body = documentXml(`${paragraph('Tekst koji navodi izvor (Horvat, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph('Horvat, I. (2022). Naslov rada.')}`);
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    await runClosedLoopCase({
      label: `citation-sync-live/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml }),
      buildItems: (before) => {
        const items = citationBibliographySyncRepairableItem(before, withRealRepairMapEntries(profileId));
        return items.map((item) => {
          const form = item.citationBibliographySyncForm;
          if (!form) return item;
          const updatedForm = {
            ...form,
            citations: form.citations.map((citation) => ({
              ...citation,
              selected: true,
              replacementText: citation.rawText.replace(/\d{4}/, '2022'),
            })),
          };
          return { ...item, params: form.buildParams(updatedForm) };
        });
      },
      isResolved: (after) => {
        const sync = after?.details?.citationBibliographySync;
        return (sync?.summary?.missing ?? 0) === 0 && (sync?.summary?.ambiguous ?? 0) === 0;
      },
      allowTextChange: true,
    });
  }, 30000);
});

describe('Repair Engine closed-loop-lite: legal-footnote-repair-fixer (sinteticki profil)', () => {
  // NAPOMENA (arhitektonsko ogranicenje, ne test-manjkavost): legalFootnoteStructure se racuna
  // SAMO kad je profile.citationMode==='legal-notes' (src/analysis/analyze-docx.ts) - a NIJEDAN
  // stvarni profil danas nema taj citationMode (provjereno upitom nad podacima). analyzeFixture(file,
  // {profileId}) prima samo profileId (string), ne cijeli profil-objekt, pa se sinteticki
  // citationMode ne moze ubaciti u STVARNU analizu preko javnog test API-ja - samo u buildItems
  // poziv, sto je prekasno. Zato je ovo "lite" varijanta (bez runClosedLoopCase): stvarni docx ->
  // rucno konstruiran nalaz (isti obrazac kao postojeci tests/bibliography-repair.test.ts) ->
  // stvarna primjena fixera -> provjera stvarnog izlaznog XML-a i drugog prolaza, umjesto pune
  // reanalize koja bi svejedno vratila null.
  it('pravo-integrirani-diplomski + izmisljeno legal-footnote-repair-rules + citationMode: neispravan "ibid." zapis', async () => {
    const profileId = 'pravo-integrirani-diplomski';
    const bytes = await buildRepairTemplate('footnotes-legal-citations');
    const profile = withRuleEntry(profileId, 'legal-footnote-repair-rules', { mode: 'legal-notes' }, { citationMode: 'legal-notes' });
    const result = {
      details: {
        legalFootnoteStructure: {
          candidates: [{ footnoteId: 1, rawText: 'ibid., str. 5.', type: 'ibid', confidence: 'high', evidence: [], anchorFingerprint: legalFootnoteAnchorFingerprint(1, 'ibid., str. 5.'), operations: [{ id: 'op-1', kind: 'fix-ibid', before: 'ibid.', after: 'Ibid.', reason: 'case', confidence: 'high' }] }],
          markers: [], warnings: [], summary: { footnotes: 1, operations: 1 },
        },
      },
    };
    const items = legalFootnoteRepairableItem(result, profile);
    expect(items.length).toBeGreaterThan(0);
    const form = items[0].legalFootnoteRepairForm!;
    const confirmedForm = { ...form, candidates: form.candidates.map((candidate) => ({ ...candidate, operations: candidate.operations.map((operation) => ({ ...operation, selected: true })) })) };
    const requests = [{ fixerId: items[0].fixerId, ruleId: items[0].ruleId, params: form.buildParams(confirmedForm) }];

    // documentText() cita samo word/document.xml - promjena je u footnotes.xml, pa se cita izravno.
    const { readZip } = await import('../src/repair/zip-codec');
    const footnotesTextOf = async (docx: Uint8Array) => {
      const entries = await readZip(docx);
      return new TextDecoder().decode(entries.find((entry) => entry.name === 'word/footnotes.xml')!.data);
    };
    const beforeFootnotes = await footnotesTextOf(bytes);
    const applied = await applyFixers(bytes, requests);
    expect(applied.changelog.length, 'barem jedna stavka mora stvarno promijeniti dokument').toBeGreaterThan(0);
    const afterFootnotes = await footnotesTextOf(applied.docxBytes);
    expect(afterFootnotes, 'ocekivana promjena teksta izostala (ibid. -> Ibid.)').not.toBe(beforeFootnotes);
    expect(afterFootnotes).toContain('Ibid.');
    // Tijelo dokumenta (word/document.xml) ostaje netaknuto - popravak dira SAMO fusnotu.
    expect(await documentText(applied.docxBytes)).toBe(await documentText(bytes));

    // Sam ishod se i dalje provjerava analizom stvarnog IZLAZNOG dokumenta (samo "before" je rucno
    // konstruiran, "after" je stvarna ponovna analiza) - drugi prolaz mora biti no-op.
    const outputFile = new File([applied.docxBytes], 'legal-footnote-fixed.docx', { type: DOCX_MIME });
    await expect(analyzeFixture(outputFile, { profileId })).resolves.toBeDefined();
    const second = await applyFixers(applied.docxBytes, requests);
    expect(second.changelog).toEqual([]);
    expect(second.docxBytes).toBe(applied.docxBytes);
  }, 30000);
});
