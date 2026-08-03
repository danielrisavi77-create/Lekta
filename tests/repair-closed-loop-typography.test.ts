/**
 * Closed-loop provjera genericnih result.details.*-drivenih fixera (logika NE ovisi o profilu):
 * croatian-typography-fixer, consistency-fixer, field-integrity-fixer, final-document-inspector-fixer.
 * Scenariji su mineni iz postojecih jedinicnih testova (src/repair/*.test.ts) - vidi plan
 * prosirenja, Batch 3. Zajednicki koraci u tests/helpers/closed-loop-runner.ts.
 */
import { describe, it } from 'vitest';
import {
  croatianTypographyRepairableItem,
  consistencyRepairableItem,
  fieldIntegrityRepairableItem,
  finalDocumentInspectorRepairableItem,
} from '../src/ui/repair-items';
import { packageDoc, paragraph, documentXml } from './helpers/repair-templates';
import { runClosedLoopCase } from './helpers/closed-loop-runner';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

describe('Repair Engine closed-loop: croatian-typography-fixer', () => {
  it('fer-diplomski: dvostruki razmak i tri tocke umjesto trotocke', async () => {
    const profileId = 'fer-diplomski';
    const body = documentXml(`<w:p><w:r><w:t>Ovo  je tekst koji nastavlja dalje...</w:t></w:r></w:p>`);
    await runClosedLoopCase({
      label: `croatian-typography/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml }),
      buildItems: (before) => croatianTypographyRepairableItem(before),
      allowTextChange: true, // ispravlja vidljivi tekst (dvostruki razmak, trotocka), namjerno
      isResolved: (after) => {
        const structure = after?.details?.typographyStructure;
        return structure?.summary?.total === 0 || structure?.summary?.safe === structure?.summary?.total;
      },
    });
  }, 30000);
});

describe('Repair Engine closed-loop: consistency-fixer (docProps naslov != prednji tekst)', () => {
  it('fer-diplomski: docProps/core.xml naslov ne odgovara prepoznatom naslovu na naslovnici', async () => {
    const profileId = 'fer-diplomski';
    const body = documentXml(`${paragraph('Analiza distribuiranih sustava u stvarnom vremenu')}${paragraph('Sazetak istrazivanja i metodologija koja slijedi u nastavku rada.')}`);
    const docPropsCoreXml = '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Stari, zastarjeli naslov rada</dc:title></cp:coreProperties>';
    await runClosedLoopCase({
      label: `consistency/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml, docPropsCoreXml }),
      buildItems: (before) => {
        const items = consistencyRepairableItem(before);
        // Default oblik je namjerno SVE neoznaceno (selected:false, zoneConsent:false) - UI trazi
        // eksplicitnu potvrdu korisnika po grupi. Ovdje simuliramo "korisnik je potvrdio sve".
        return items.map((item) => {
          const form = item.consistencyForm;
          if (!form) return item;
          const groups = form.groups.map((group) => ({
            ...group,
            selected: true,
            zoneConsent: true,
            selectedCanonical: group.selectedCanonical ?? group.variants?.[1]?.text ?? group.variants?.[0]?.text,
          }));
          const updatedForm = { ...form, groups };
          return { ...item, params: form.buildParams(updatedForm) };
        });
      },
      isResolved: (after) => {
        const structure = after?.details?.consistencyStructure;
        return (structure?.metadataMismatches?.length ?? 0) === 0;
      },
    });
  }, 30000);
});

describe('Repair Engine closed-loop: field-integrity-fixer', () => {
  it('fer-diplomski: rucno upisano PAGE polje (fldSimple) oznaceno kao "dirty"', async () => {
    const profileId = 'fer-diplomski';
    const settingsXml = `<w:settings ${WORD_NS}/>`;
    const body = `<w:document ${WORD_NS}><w:body><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
    await runClosedLoopCase({
      label: `field-integrity/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml, settingsXml }),
      buildItems: (before) => fieldIntegrityRepairableItem(before),
      // "dirty" oznaka znaci "Word ce ovo osvjeziti pri otvaranju" - to je ISPRAVNO zavrsno stanje
      // (status ide s 'ok'/spremljen-stari-rezultat na 'stale'/dirty=true, ne obrnuto).
      isResolved: (after) => after?.details?.fieldIntegrity?.fields?.[0]?.dirty === true,
    });
  }, 30000);
});

describe('Repair Engine closed-loop: final-document-inspector-fixer', () => {
  it('fer-diplomski: prihvacena revizija, komentar, skriveni tekst i privatni metapodaci', async () => {
    const profileId = 'fer-diplomski';
    const settingsXml = `<w:settings ${WORD_NS}><w:trackRevisions/></w:settings>`;
    const body = `<w:document ${WORD_NS}><w:body><w:p><w:ins w:id="3"><w:r><w:t>novo</w:t></w:r></w:ins><w:commentRangeStart w:id="7"/><w:r><w:rPr><w:vanish/></w:rPr><w:t>skriveno</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
    const commentsXml = `<w:comments ${WORD_NS}><w:comment w:id="7"><w:p><w:r><w:t>Komentar</w:t></w:r></w:p></w:comment></w:comments>`;
    const docPropsCoreXml = '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Autor</dc:creator></cp:coreProperties>';
    await runClosedLoopCase({
      label: `final-document-inspector/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: body, stylesXml, settingsXml, commentsXml, docPropsCoreXml }),
      // Zadani oblik (bez korisnicke potvrde) selektira SAMO ne-destruktivne nalaze (tracking,
      // private-metadata); revizije/komentari/skriveni tekst su destructive:true, default false,
      // trebaju odvojenu potvrdu PO STAVCI (isti obrazac kao heading-case-fixer). Ovdje simuliramo
      // da je korisnik potvrdio SVE, po uzoru na src/repair/final-document-inspector-fixer.test.ts.
      buildItems: (before) => {
        const items = finalDocumentInspectorRepairableItem(before);
        return items.map((item) => {
          const form = item.finalDocumentInspectorForm;
          if (!form) return item;
          const byCategory = (category: string) => form.findings.filter((finding) => finding.category === category);
          const params = {
            version: 1,
            revisions: byCategory('revisions').flatMap((finding) => finding.evidence.map((evidence: any) => ({ part: evidence.part, revisionId: evidence.revisionId, action: 'accept' as const, anchorFingerprint: evidence.fingerprint, confirmed: true as const }))),
            comments: byCategory('comments').flatMap((finding) => finding.evidence.map((evidence: any) => ({ commentId: evidence.commentId, anchorFingerprint: evidence.fingerprint, action: 'remove' as const, confirmed: true as const }))),
            metadata: byCategory('private-metadata').flatMap((finding) => finding.evidence.map((evidence: any) => ({ part: 'core' as const, field: evidence.field, fingerprint: evidence.fingerprint, action: 'remove' as const, confirmed: true as const }))),
            hiddenText: byCategory('hidden-text').flatMap((finding) => finding.evidence.map((evidence: any) => ({ part: evidence.part, anchorFingerprint: evidence.fingerprint, action: 'remove' as const, confirmed: true as const }))),
            settings: { disableTracking: true as const },
          };
          return { ...item, params };
        });
      },
      // Prihvacanje revizije/skrivenog teksta MIJENJA sadrzaj (w:ins prihvacen kao stalan tekst;
      // skriveni run uklonjen) - ocekivana promjena, ne slucajna regresija.
      allowTextChange: true,
      // Kad su svi komentari uklonjeni, ovaj fixer namjerno mice i sam word/comments.xml
      // (`removedPackageParts` u apply-fixers.ts) jer prazan dio nema svrhu. To je JEDINI
      // dio koji ovdje smije nestati; gate faze A sve ostalo tretira kao bug.
      allowDroppedParts: ['word/comments.xml'],
      isResolved: (after) => {
        const findings = after?.details?.finalDocumentInspector?.findings ?? [];
        return findings.every((finding: any) => finding.count === 0 || !finding.supported);
      },
    });
  }, 30000);
});
