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
import { analyzeBibliographyStructure } from '../src/analysis/bibliography-structure';
import { citationBibliographySyncFixer } from '../src/repair/citation-bibliography-sync-fixer';
import { validateAssistedParams } from '../src/repair/contract/assisted-request-policy';
import { parseContractRequests } from '../src/repair/contract';
import { applyFixers } from '../src/repair/apply-fixers';
import { citationBibliographySyncRepairableItem, citationEntryInsertionAllowed } from '../src/ui/repair-items';
import { PARAM_AUTHORITY, resolveParams } from '../src/repair/param-authority';
import { packageDoc, paragraph, documentXml } from './helpers/repair-templates';
import { runClosedLoopCase, documentText } from './helpers/closed-loop-runner';
import { readZip } from '../src/repair/zip-codec';
import { entryText, paragraphTexts, planZapisaProblemi, serverDozvolaProblemi, serverZapisaProblemi, syncCase, template, zapisLiteratureProblemi } from './helpers/zapis-literature-guard';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const STYLES = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
const PROFILE_ID = 'fer-diplomski';

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
        return sync?.summary?.missing === 0
          && structure?.alphabetical?.expected === true
          && JSON.stringify(raw) === JSON.stringify([entryText('Horvat', '2020'), template('Novak', '2022'), entryText('Zorić', '2021')]);
      },
      allowTextChange: true, // dodaje se zapis literature, druge izmjene vidljivog teksta nema (vidi test nize)
    });
  }, 60_000);

  it('vidljivi tekst: osim umetnutog zapisa nista se ne mijenja; zagrade predloska ne daju lazni nalaz potpunosti', async () => {
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
    expect(inserted?.flags ?? []).not.toContain('missing-author');
    expect(inserted?.flags ?? []).not.toContain('missing-year');
    // Izmjereno, ne pretpostavljeno: parser literature [Naslov djela] cita kao naslov.
    expect(inserted?.flags ?? []).not.toContain('missing-title');
    expect(analyzeBibliographyStructure(afterTexts.map((text, i) => ({ index: i + 1, text })), 'hr').alphabetical.expected).toBe(true);
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
