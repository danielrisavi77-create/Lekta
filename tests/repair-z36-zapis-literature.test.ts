/**
 * Z36 (odluka vlasnika 2026-10-03, "svo troje"): dodavanje zapisa literature uz citat bez zapisa.
 *
 * (1) Plan nudi dodavanje samo kad profil to dopusta (allowMissingEntryInsertion) uz verificirano
 *     citation-sync-rules u nacinu author-year.
 * (2) Upisani potvrdjeni tekst ide doslovno, iza zadnjeg zapisa (zateceno ponasanje).
 * (3) Bez teksta fixer umece predlozak "Prezime, [ime]. (godina). [Naslov djela]. [Mjesto: Izdavač]."
 *     s prezimenom i godinom iz citata, na abecedno mjesto po istoj kolaciji kao provjera abecede.
 *
 * Nijedan profil u data/ danas nema allowMissingEntryInsertion, pa se ovdje koristi sinteticki
 * ruleEntry (isti obrazac kao tests/repair-closed-loop-citations.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { analyzeBibliographyStructure, unfilledTemplateLabels } from '../src/analysis/bibliography-structure';
import { detectPassRegressions, dropStaleFieldRegressions, splitTemplateFillRegressions } from '../src/analysis/repair-regression';
import { verifiedOutcomeFrom } from '../src/repair/repair-outcome-verified';
import { citationBibliographySyncFixer } from '../src/repair/citation-bibliography-sync-fixer';
import { validateAssistedParams } from '../src/repair/contract/assisted-request-policy';
import { parseContractRequests } from '../src/repair/contract';
import { applyFixers } from '../src/repair/apply-fixers';
import { citationBibliographySyncRepairableItem, citationEntryInsertionAllowed } from '../src/ui/repair-items';
import { PARAM_AUTHORITY, resolveParams } from '../src/repair/param-authority';
import { packageDoc, paragraph, documentXml } from './helpers/repair-templates';
import { runClosedLoopCase, documentText } from './helpers/closed-loop-runner';
import { readZip } from '../src/repair/zip-codec';
import { brTabPotvrdeProblemi, entryText, nepopunjenPredlozakProblemi, predlozakNaPlociProblemi, paragraphTexts, planZapisaProblemi, sectionEndTexts, serverDozvolaProblemi, serverZapisaProblemi, syncCase, template, zapisLiteratureProblemi } from './helpers/zapis-literature-guard';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const STYLES = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
const PROFILE_ID = 'fer-diplomski';
const COMPLETENESS = 'Potpunost bibliografskih zapisa';

function syncProfile(value: Record<string, unknown>) {
  const profile = resolveProfile(PROFILE_ID) as any;
  return { ...profile, ruleEntries: [...(Array.isArray(profile.ruleEntries) ? profile.ruleEntries : []), { checkId: 'citation-sync-rules', status: 'verified', sourceId: 'test-synthetic', sourcePage: '1', quote: 'sintetičko pravilo za test', value }] };
}

const brokenDoc = () => packageDoc({
  documentXml: documentXml(`${paragraph('Tekst koji navodi izvor (Novak, 2022) i drugi (Horvat, 2020) te (Zorić, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${paragraph(entryText('Zorić', '2021'))}`),
  stylesXml: STYLES,
});

async function bodyParagraphs(bytes: Uint8Array): Promise<string[]> {
  const entry = (await readZip(bytes)).find((candidate) => candidate.name === 'word/document.xml')!;
  return paragraphTexts(new TextDecoder().decode(entry.data));
}

/** Iz stvarne analize: odaberi svaki nedostajuci zapis, s tekstom ili bez njega. */
function planFor(before: any, value: Record<string, unknown>, text = '') {
  return citationBibliographySyncRepairableItem(before, syncProfile(value)).map((item) => {
    const form = item.citationBibliographySyncForm;
    if (!form) return item;
    for (const missing of form.missingEntries) { missing.selected = true; missing.text = text; }
    return { ...item, params: form.buildParams(form) };
  });
}

describe('Z36 gardovi nad stvarnom implementacijom', () => {
  it('fixer: predlozak, abecedno mjesto (pocetak, sredina, kraj), dijakritika, idempotencija, padez', () => {
    expect(zapisLiteratureProblemi(citationBibliographySyncFixer)).toEqual([]);
  });

  it('plan: dodavanje samo uz dozvolu profila; prazan tekst salje samo id citata', () => {
    expect(planZapisaProblemi(citationBibliographySyncRepairableItem)).toEqual([]);
  });

  it('server: add bez teksta trazi poznat citat iz istog zahtjeva', () => {
    expect(serverZapisaProblemi(validateAssistedParams)).toEqual([]);
  });

  it('plan i fixer: w:br i w:tab ispred citata ne obaraju ostale potvrde iste stavke (krug 4)', () => {
    expect(brTabPotvrdeProblemi(citationBibliographySyncRepairableItem, citationBibliographySyncFixer)).toEqual([]);
  });

  it('ploca: predlozak istog popravka nije regresija ni razlog za izvornik; stvaran pad jest (krug 4)', () => {
    expect(predlozakNaPlociProblemi(unfilledTemplateLabels, splitTemplateFillRegressions, verifiedOutcomeFrom)).toEqual([]);
  });

  it('analiza: zapis s ijednim poljem predloska u uglatim zagradama je nepopunjen', () => {
    expect(nepopunjenPredlozakProblemi(analyzeBibliographyStructure)).toEqual([]);
  });
});

describe('Z36 fixer: rubni slucajevi', () => {
  it('neabecedni popis se ne preslaguje; predlozak ide ispred prvog veceg zapisa', () => {
    const { parts, params, before } = syncCase('Tekst (Novak, 2022).', 'Novak, 2022', [['Zubak', '2019'], ['Horvat', '2020'], ['Sušić', '2018']]);
    const after = paragraphTexts(citationBibliographySyncFixer(parts, params).parts.documentXml);
    // Prvi zapis s vecim kljucem od "novak" je "Zubak" na vrhu popisu; ostatak ostaje kakav je bio.
    expect(after).toEqual([before[0], 'Literatura', template('Novak', '2022'), ...before.slice(2)]);
  });

  it('klijent ne moze podmetnuti prezime: zamjena citata s drugim autorom odbija cijeli recept', () => {
    const { parts, params } = syncCase('Tekst (Novak, 2022).', 'Novak, 2022', [['Horvat', '2020']]);
    const forged = { ...params, citations: [{ ...params.citations[0], replacementText: 'Kovač, 2022' }] };
    const result = citationBibliographySyncFixer(parts, forged);
    expect(result.reason).toBe('invalid-params');
    expect(paragraphTexts(result.parts.documentXml).some((text) => text.includes('Kovač'))).toBe(false);
  });

  it('dva predloska u istom popisu: svaki na svom mjestu, istom mjestu abecedno, drugi prolaz no-op', () => {
    const text = 'Tekst (Babić, 2021) i (Bakić, 2020) te (Novak, 2022).';
    const base = syncCase(text, 'Babić, 2021', [['Horvat', '2020'], ['Zubak', '2019']]);
    const cite = (raw: string, id: string) => ({ ...base.params.citations[0], id, start: text.indexOf(raw), end: text.indexOf(raw) + raw.length, replacementText: raw });
    const params = {
      ...base.params,
      citations: [cite('Babić, 2021', 'c1'), cite('Bakić, 2020', 'c2'), cite('Novak, 2022', 'c3')],
      entries: ['c3', 'c2', 'c1'].map((id) => ({ ...base.params.entries[0], id: `sync-entry-${id}`, citationId: id })),
      mappings: [],
    };
    const first = citationBibliographySyncFixer(base.parts, params);
    expect(paragraphTexts(first.parts.documentXml)).toEqual([text, 'Literatura', template('Babić', '2021'), template('Bakić', '2020'), entryText('Horvat', '2020'), template('Novak', '2022'), entryText('Zubak', '2019')]);
    const second = citationBibliographySyncFixer(first.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
    expect(second.parts.documentXml).toBe(first.parts.documentXml);
  });

  it('isti autor i godina iz dva citata daje jedan zapis', () => {
    const text = 'Tekst (Novak, 2022) i opet (Novak, 2022).';
    const base = syncCase(text, 'Novak, 2022', [['Horvat', '2020']]);
    const second = text.lastIndexOf('Novak, 2022');
    const params = {
      ...base.params,
      citations: [base.params.citations[0], { ...base.params.citations[0], id: 'c2', start: second, end: second + 'Novak, 2022'.length }],
      entries: [base.params.entries[0], { ...base.params.entries[0], id: 'sync-entry-c2', citationId: 'c2' }],
    };
    const texts = paragraphTexts(citationBibliographySyncFixer(base.parts, params).parts.documentXml);
    expect(texts.filter((value) => value === template('Novak', '2022'))).toHaveLength(1);
  });

  it('korisnikov zapis: doslovno iza zadnjeg zapisa, drugi prolaz no-op', () => {
    const { parts, params, before } = syncCase('Tekst (Novak, 2022).', 'Novak, 2022', [['Horvat', '2020'], ['Zubak', '2019']]);
    const literal = { ...params, entries: [{ ...params.entries[0], citationId: undefined, replacementText: 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.' }] };
    const first = citationBibliographySyncFixer(parts, literal);
    expect(paragraphTexts(first.parts.documentXml)).toEqual([...before, 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.']);
    const second = citationBibliographySyncFixer(first.parts, literal);
    expect(second.reason).toBe('already-ok');
    expect(second.parts.documentXml).toBe(first.parts.documentXml);
  });

  it('krug 4: popis kao BIBLIOGRAPHY polje preko tri zapisa: nista se ne umece u polje; bez polja se umece', () => {
    const texts = [entryText('Cvitan', '2015'), entryText('Horvat', '2020'), entryText('Zubak', '2019')];
    const field = (text: string, index: number) => `<w:p>${index === 0 ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> BIBLIOGRAPHY </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : ''}<w:r><w:t>${text}</w:t></w:r>${index === 2 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : ''}</w:p>`;
    const inField = syncCase('Tekst (Novak, 2022).', 'Novak, 2022', [], { rawEntries: texts, entryXml: field });
    const plain = syncCase('Tekst (Novak, 2022).', 'Novak, 2022', [], { rawEntries: texts });
    // Generator: isti zapisi, a jedina razlika je polje oko njih.
    expect(inField.before).toEqual(plain.before);
    expect(inField.parts.documentXml).toContain('BIBLIOGRAPHY');
    for (const pass of [1, 2]) {
      const blocked = citationBibliographySyncFixer(inField.parts, inField.params);
      expect(blocked.applied, `prolaz ${pass}`).toBe(false);
      expect(blocked.parts.documentXml, `prolaz ${pass}`).toBe(inField.parts.documentXml);
      expect(blocked.skippedActions?.join(' '), `prolaz ${pass}`).toContain('unutar Wordova polja');
    }
    const inserted = citationBibliographySyncFixer(plain.parts, plain.params);
    expect(paragraphTexts(inserted.parts.documentXml).slice(2)).toEqual([texts[0], texts[1], template('Novak', '2022'), texts[2]]);
    expect(citationBibliographySyncFixer(inserted.parts, plain.params).parts.documentXml).toBe(inserted.parts.documentXml);
  });

  it('predlozak nasljeduje oblikovanje odlomka sidra (pPr), kao i korisnikov zapis', () => {
    const { parts, params } = syncCase('Tekst (Babić, 2021).', 'Babić, 2021', [['Horvat', '2020']]);
    const xml = citationBibliographySyncFixer(parts, params).parts.documentXml;
    expect(xml).toContain(`<w:p><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr><w:r><w:t xml:space="preserve">${template('Babić', '2021')}</w:t></w:r></w:p>`);
  });
});

describe('Z36 kroz cijeli lanac: analiza, plan, ugovor, popravak, ponovna analiza', () => {
  it('bez dozvole profila plan ne nudi zapis, a ponuda ostaje prolazna za ugovor', async () => {
    const before = await analyzeFixture(new File([await brokenDoc()], 'z36-bez-dozvole.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    expect(before.details.citationBibliographySync.missingEntries.length).toBeGreaterThan(0);
    const items = planFor(before, { mode: 'author-year' });
    expect(items).toHaveLength(1);
    expect(items[0].citationBibliographySyncForm?.missingEntries).toEqual([]);
    expect((items[0].params as { entries: unknown[] }).entries).toEqual([]);
  });

  it('plan sa i bez teksta prolazi ugovor zahtjeva (oba validatora) i fixer', async () => {
    const bytes = await brokenDoc();
    const before = await analyzeFixture(new File([bytes], 'z36-ugovor.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    for (const text of ['', 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.']) {
      const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true }, text);
      expect(parseContractRequests([{ requestId: 'req-0001', fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]), text || 'predlozak').toMatchObject({ ok: true });
      const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
      expect(applied.integrityFailure ?? null).toBeNull();
      expect(applied.changelog.length).toBe(1);
      const texts = await bodyParagraphs(applied.docxBytes);
      expect(texts).toContain(text || template('Novak', '2022'));
    }
  }, 60_000);

  it('predlozak: citat dobiva zapis na abecednom mjestu, provjera abecede ostaje zelena, drugi prolaz no-op', async () => {
    await runClosedLoopCase({
      label: `z36-predlozak/${PROFILE_ID}`,
      profileId: PROFILE_ID,
      buildBrokenDocx: brokenDoc,
      buildItems: (before) => planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true }),
      isResolved: (after) => {
        const sync = after?.details?.citationBibliographySync;
        const structure = after?.details?.bibliographyStructure;
        const raw = (structure?.entries ?? []).map((entry: any) => entry.rawText);
        const completeness = (after?.checks ?? []).find((check: any) => check.title === COMPLETENESS);
        return sync?.summary?.missing === 0
          && structure?.alphabetical?.expected === true
          && JSON.stringify(raw) === JSON.stringify([entryText('Horvat', '2020'), template('Novak', '2022'), entryText('Zorić', '2021')])
          // Nepopunjen predlozak nije potpun izvor: provjera potpunosti ga imenuje (vidi test nize).
          && completeness?.status === 'warn';
      },
      allowTextChange: true, // dodaje se zapis literature, druge izmjene vidljivog teksta nema (vidi test nize)
      // Namjerno: prije popravka citat nije imao zapis, poslije ima nepopunjen predlozak koji student
      // mora popuniti; provjera potpunosti zato iz 'pass' ide u 'warn' (isResolved to tvrdi izricito).
      exemptFromRegression: [COMPLETENESS],
    });
  }, 60_000);

  it('vidljivi tekst: osim umetnutog zapisa nista se ne mijenja; nepopunjen predlozak je nalaz potpunosti', async () => {
    const bytes = await brokenDoc();
    const file = new File([bytes], 'z36-tekst.docx', { type: DOCX_MIME });
    const before = await analyzeFixture(file, { profileId: PROFILE_ID });
    const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true });
    const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
    const beforeTexts = await bodyParagraphs(bytes);
    const afterTexts = await bodyParagraphs(applied.docxBytes);
    expect(afterTexts.filter((text) => text !== template('Novak', '2022'))).toEqual(beforeTexts);
    expect((await documentText(applied.docxBytes)).replace(template('Novak', '2022'), '')).toBe(await documentText(bytes));
    const after = await analyzeFixture(new File([applied.docxBytes], 'z36-tekst-poslije.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    const inserted = after.details.bibliographyStructure.entries.find((entry: any) => entry.rawText === template('Novak', '2022'));
    // Prezime i godina su stvarni (iz citata), pa nema lazne oznake autora ili godine; polja u
    // zagradama zapis cine nepopunjenim, i to analiza kaze izricito.
    expect(inserted?.flags ?? []).not.toContain('missing-author');
    expect(inserted?.flags ?? []).not.toContain('missing-year');
    expect(inserted?.flags ?? []).toContain('unfilled-template');
    expect(after.details.bibliographyStructure.incompleteEntryIds).toContain(inserted.id);
    // Bodovana provjera potpunosti: prije popravka prolazi, poslije imenuje nepopunjen zapis.
    const completenessBefore = before.checks.find((check: any) => check.title === COMPLETENESS);
    const completenessAfter = after.checks.find((check: any) => check.title === COMPLETENESS);
    expect(completenessBefore?.status).toBe('pass');
    expect(completenessAfter?.status).toBe('warn');
    expect(JSON.stringify(after.issues)).toContain('[Naslov djela]');
    expect(analyzeBibliographyStructure(afterTexts.map((text, i) => ({ index: i + 1, text })), 'hr').alphabetical.expected).toBe(true);
  }, 60_000);

  it('krug 4: ploca nakon popravka: samo predlozak daje stavku za popunu, bez regresije i bez preporuke izvornika', async () => {
    const bytes = await brokenDoc();
    const before = await analyzeFixture(new File([bytes], 'z36-ploca.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true });
    const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
    const after = await analyzeFixture(new File([applied.docxBytes], 'z36-ploca-poslije.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    const completeness = after.checks.find((check: any) => check.title === COMPLETENESS);
    // Analiza ostaje istinita: provjera je warn i imenuje predlozak kao jedini razlog.
    expect(completeness?.status).toBe('warn');
    expect(completeness?.unfilledTemplates).toEqual(['Novak (2022)']);
    const raw = dropStaleFieldRegressions(detectPassRegressions(before.checks, after.checks), after);
    // Generator: bez izuzeca bi ovo bila regresija potpunosti.
    expect(raw.map((regression) => regression.title)).toContain(COMPLETENESS);
    const split = splitTemplateFillRegressions(raw, after.checks);
    expect(split.regressions).toEqual([]);
    expect(split.fill).toBe('Popuni polja u zagradama: Novak (2022)');
    const verified = verifiedOutcomeFrom({ before: before.checks, after: after.checks, selected: [item], skippedRuleIds: applied.skipped, integrity: 'passed' });
    expect(verified.regressedIds).not.toContain('reference.completeness');
    expect(verified.recommendRepairedCopy).toBe(true);
  }, 60_000);

  it('krug 4: stvarna regresija uz predlozak (kratak korisnikov zapis) ostaje regresija', async () => {
    const bytes = await packageDoc({
      documentXml: documentXml(`${paragraph('Tekst koji navodi izvor (Novak, 2022) i (Babić, 2018) te (Horvat, 2020) i (Zorić, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${paragraph(entryText('Zorić', '2021'))}`),
      stylesXml: STYLES,
    });
    const before = await analyzeFixture(new File([bytes], 'z36-stvarna.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    expect(before.checks.find((check: any) => check.title === COMPLETENESS)?.status).toBe('pass');
    const [item] = citationBibliographySyncRepairableItem(before, syncProfile({ mode: 'author-year', allowMissingEntryInsertion: true }));
    const form = item.citationBibliographySyncForm!;
    const authorOf = new Map<string, string>(before.details.citationBibliographySync.missingEntries.map((c: any) => [String(c.id), String(c.author)]));
    for (const row of form.missingEntries) { row.selected = true; row.text = authorOf.get(row.citationId) === 'Babić' ? 'Babić (2018).' : ''; }
    const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: form.buildParams(form) }]);
    const texts = await bodyParagraphs(applied.docxBytes);
    // Generator: isti popravak umetnuo je predlozak I kratak zapis koji je stvarno nepotpun.
    expect(texts).toContain(template('Novak', '2022'));
    expect(texts).toContain('Babić (2018).');
    const after = await analyzeFixture(new File([applied.docxBytes], 'z36-stvarna-poslije.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    expect(after.checks.find((check: any) => check.title === COMPLETENESS)?.unfilledTemplates).toBeUndefined();
    const split = splitTemplateFillRegressions(dropStaleFieldRegressions(detectPassRegressions(before.checks, after.checks), after), after.checks);
    expect(split.regressions.map((regression) => regression.title)).toContain(COMPLETENESS);
    expect(split.fill).toBeNull();
    const verified = verifiedOutcomeFrom({ before: before.checks, after: after.checks, selected: [item], skippedRuleIds: applied.skipped, integrity: 'passed' });
    expect(verified.recommendRepairedCopy).toBe(false);
  }, 60_000);

  it('tvrdi razmak u citatu (U+00A0): odlomak citata ostaje bajt-isti, umece se samo zapis', async () => {
    const cited = 'Tekst koji navodi izvor (Novak, 2022, str.\u00a05) i drugi (Horvat, 2020) te (Zorić, 2021).';
    const bytes = await packageDoc({
      documentXml: documentXml(`${paragraph(cited)}${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${paragraph(entryText('Zorić', '2021'))}`),
      stylesXml: STYLES,
    });
    const before = await analyzeFixture(new File([bytes], 'z36-nbsp.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    // Generator: analiza vidi citat s obicnim razmakom, dokument ima tvrdi.
    expect(before.details.citationBibliographySync.missingEntries.map((citation: any) => citation.rawText)).toEqual(['Novak, 2022, str. 5']);
    const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true });
    const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
    expect(applied.integrityFailure ?? null).toBeNull();
    const texts = await bodyParagraphs(applied.docxBytes);
    expect(texts[0]).toBe(cited);
    expect(texts.filter((text) => text !== template('Novak', '2022'))).toEqual(await bodyParagraphs(bytes));
  }, 60_000);

  it('zadnji zapis u dva odlomka (DOI u svom retku): plan sidri na zadnji odlomak, popravak prolazi', async () => {
    const zoric = 'Zorić, A. (2021). Naslov djela Zorić. Dostupno na:';
    const doi = 'https://doi.org/10.1000/xyz';
    const bytes = await packageDoc({
      documentXml: documentXml(`${paragraph('Tekst koji navodi izvor (Novak, 2022) i drugi (Horvat, 2020) te (Zorić, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${paragraph(zoric)}${paragraph(doi)}`),
      stylesXml: STYLES,
    });
    const before = await analyzeFixture(new File([bytes], 'z36-doi.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    // Generator: analiza spaja zadnji zapis i redak s DOI-jem u jedan zapis s dva odlomka.
    expect(before.details.bibliographyStructure.entries.at(-1).paragraphIndices).toEqual([4, 5]);
    for (const text of ['', 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.']) {
      const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true }, text);
      expect((item.params as any).entries[0].insertionAnchor.paragraphIndex, text || 'predlozak').toBe(5);
      const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
      expect(applied.integrityFailure ?? null, text || 'predlozak').toBeNull();
      expect(applied.changelog.length, text || 'predlozak').toBe(1);
      const texts = await bodyParagraphs(applied.docxBytes);
      expect(texts.slice(2), text || 'predlozak').toEqual(text
        ? [entryText('Horvat', '2020'), zoric, doi, text]
        : [entryText('Horvat', '2020'), template('Novak', '2022'), zoric, doi]);
      const after = await analyzeFixture(new File([applied.docxBytes], 'z36-doi-poslije.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
      expect(after.details.citationBibliographySync.summary.missing, text || 'predlozak').toBe(0);
    }
  }, 60_000);

  it('prijelom sekcije na zadnjem zapisu: paket ostaje cijel, popis ostaje u jednoj sekciji', async () => {
    const sectionEnd = `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr><w:r><w:t>${entryText('Zorić', '2021')}</w:t></w:r></w:p>`;
    const bytes = await packageDoc({
      documentXml: documentXml(`${paragraph('Tekst koji navodi izvor (Babić, 2018) i drugi (Horvat, 2020) te (Zorić, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${sectionEnd}${paragraph('Prilozi', 'Heading1')}`),
      stylesXml: STYLES,
    });
    const before = await analyzeFixture(new File([bytes], 'z36-sekcija.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    // Generator: citat bez zapisa postoji, a prijelom sekcije je samo na zadnjem zapisu.
    expect(before.details.citationBibliographySync.missingEntries.map((citation: any) => citation.author)).toEqual(['Babić']);
    expect(sectionEndTexts(new TextDecoder().decode((await readZip(bytes)).find((entry) => entry.name === 'word/document.xml')!.data))).toEqual([entryText('Zorić', '2021')]);
    const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true });
    const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
    expect(applied.integrityFailure ?? null).toBeNull();
    const xml = new TextDecoder().decode((await readZip(applied.docxBytes)).find((entry) => entry.name === 'word/document.xml')!.data);
    expect(sectionEndTexts(xml)).toEqual([entryText('Zorić', '2021')]);
    expect((await bodyParagraphs(applied.docxBytes)).slice(2, 5)).toEqual([template('Babić', '2018'), entryText('Horvat', '2020'), entryText('Zorić', '2021')]);
  }, 60_000);

  it('citat u odlomku s Wordovom oznakom (_GoBack): predlozak i korisnikov zapis prolaze cijeli lanac', async () => {
    const marked = 'Tekst koji navodi izvor (Novak, 2022) i drugi (Horvat, 2020) te (Zorić, 2021).';
    const bytes = await packageDoc({
      documentXml: documentXml(`<w:p><w:bookmarkStart w:id="0" w:name="_GoBack"/><w:r><w:t>${marked}</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${paragraph(entryText('Zorić', '2021'))}`),
      stylesXml: STYLES,
    });
    const before = await analyzeFixture(new File([bytes], 'z36-oznaka.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    expect(before.details.citationBibliographySync.missingEntries.map((citation: any) => citation.author)).toEqual(['Novak']);
    for (const text of ['', 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.']) {
      const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true }, text);
      const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: item.params }]);
      expect(applied.integrityFailure ?? null, text || 'predlozak').toBeNull();
      expect(applied.changelog.length, text || 'predlozak').toBe(1);
      expect(await bodyParagraphs(applied.docxBytes)).toContain(text || template('Novak', '2022'));
    }
  }, 60_000);

  it('krug 4: w:br i w:tab ispred citata: zapisi se dodaju, a ostale potvrde iste stavke ostaju', async () => {
    const withBreak = '<w:p><w:r><w:t>Tekst koji</w:t><w:br/><w:t xml:space="preserve">navodi izvor (Novak, 2022).</w:t></w:r></w:p>';
    const withTab = '<w:p><w:r><w:t>Drugi</w:t><w:tab/><w:t xml:space="preserve">odlomak (Babić, 2018).</w:t></w:r></w:p>';
    const bytes = await packageDoc({
      documentXml: documentXml(`${withBreak}${withTab}${paragraph('Treći odlomak (Horvat, 2020) i (Zorić, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${paragraph(entryText('Zorić', '2021'))}`),
      stylesXml: STYLES,
    });
    const before = await analyzeFixture(new File([bytes], 'z36-br-tab.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    const missing = before.details.citationBibliographySync.missingEntries;
    // Generator: analiza nalazi oba citata bez zapisa, iza prijeloma retka i iza tabulatora.
    expect(missing.map((citation: any) => citation.author)).toEqual(['Novak', 'Babić']);
    const [item] = citationBibliographySyncRepairableItem(before, syncProfile({ mode: 'author-year', allowMissingEntryInsertion: true }));
    const form = item.citationBibliographySyncForm!;
    for (const row of form.missingEntries) row.selected = true;
    const horvat = form.citations.find((row) => row.rawText === 'Horvat, 2020')!;
    horvat.selected = true;
    horvat.replacementText = 'Horvat, 2020, str. 5';
    const params = form.buildParams(form);
    const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params }]);
    expect(applied.integrityFailure ?? null).toBeNull();
    expect(applied.skipped).toEqual([]);
    const texts = await bodyParagraphs(applied.docxBytes);
    expect(texts).toEqual(['Tekst kojinavodi izvor (Novak, 2022).', 'Drugiodlomak (Babić, 2018).', 'Treći odlomak (Horvat, 2020, str. 5) i (Zorić, 2021).', 'Literatura', template('Babić', '2018'), entryText('Horvat', '2020'), template('Novak', '2022'), entryText('Zorić', '2021')]);
    const xml = new TextDecoder().decode((await readZip(applied.docxBytes)).find((entry) => entry.name === 'word/document.xml')!.data);
    expect(xml).toContain(withBreak);
    expect(xml).toContain(withTab);
    const again = await applyFixers(applied.docxBytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params }]);
    expect(again.changelog).toEqual([]);
  }, 60_000);

  it('narativni citat: plan nudi redak, ali bez upisanog teksta ne salje predlozak', async () => {
    const bytes = await packageDoc({
      documentXml: documentXml(`${paragraph('Prema Novaku (2022) tekst rada, uz (Horvat, 2020) i (Zorić, 2021).')}${paragraph('Literatura', 'Heading1')}${paragraph(entryText('Horvat', '2020'))}${paragraph(entryText('Zorić', '2021'))}`),
      stylesXml: STYLES,
    });
    const before = await analyzeFixture(new File([bytes], 'z36-narativ.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    const missing = before.details.citationBibliographySync.missingEntries;
    // Generator: analiza stvarno javlja narativni citat bez zapisa.
    expect(missing.map((citation: any) => citation.form)).toEqual(['narrative']);
    const [empty] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true });
    expect(empty.citationBibliographySyncForm?.missingEntries.map((row) => row.templateAvailable)).toEqual([false]);
    expect((empty.params as { entries: Array<{ action: string }> }).entries.filter((entry) => entry.action === 'add')).toEqual([]);
    const [typed] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true }, 'Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.');
    const applied = await applyFixers(bytes, [{ fixerId: typed.fixerId, ruleId: typed.ruleId, params: typed.params }]);
    expect(await bodyParagraphs(applied.docxBytes)).toContain('Novak, N. (2022). Pravi naslov. Zagreb: Izdavač.');
  }, 60_000);
});

describe('Z36 serverska dozvola (param-authority)', () => {
  it('gard: dozvolu daje samo peceni profil; tri uvjeta profila', () => {
    expect(serverDozvolaProblemi(resolveParams, citationEntryInsertionAllowed)).toEqual([]);
  });

  it('danas nijedan peceni profil nema dozvolu, pa server iz stvarnog plana uklanja svaki dodani zapis', async () => {
    const baked = Object.entries(PARAM_AUTHORITY).filter(([, rules]) => Object.values(rules).some((rule) => rule.f === 'citation-bibliography-sync-fixer'));
    expect(baked).toEqual([]);
    const bytes = await brokenDoc();
    const before = await analyzeFixture(new File([bytes], 'z36-server.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
    const [item] = planFor(before, { mode: 'author-year', allowMissingEntryInsertion: true });
    const sent = item.params as { entries: Array<{ action: string }>; mappings: unknown[] };
    expect(sent.entries.filter((entry) => entry.action === 'add')).toHaveLength(1);
    const resolved = resolveParams(PROFILE_ID, item.ruleId, item.fixerId, item.params as Record<string, unknown>);
    expect((resolved.params.entries as Array<{ action: string }>).filter((entry) => entry.action === 'add')).toEqual([]);
    expect(resolved.params.mappings).toEqual([]);
    const applied = await applyFixers(bytes, [{ fixerId: item.fixerId, ruleId: item.ruleId, params: resolved.params }]);
    expect(await bodyParagraphs(applied.docxBytes)).not.toContain(template('Novak', '2022'));
  }, 60_000);
});
