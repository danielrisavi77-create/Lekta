import { describe, it, expect } from 'vitest';
import { analyzeSourceCrossCheck } from '../src/analysis/source-cross-check';
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { buildDocxFile } from './helpers/docx-builder';

const SHARED_SENTENCE =
  'Prema tjednom izvješću broj tri izvedeni su radovi na temeljima objekta uz sudjelovanje dva radnika i jednog voditelja gradilišta tijekom cijelog radnog tjedna bez značajnih odstupanja od plana.';

describe('analyzeSourceCrossCheck', () => {
  it('kombinira overlap i claim cross-check u jedan rezultat sa sazetkom', () => {
    const result = analyzeSourceCrossCheck({
      thesisParagraphs: [
        { index: 1, text: SHARED_SENTENCE },
        { index: 2, text: 'Masa nosive konstrukcije iznosi 45 kg prema mjerenju izvedenom na terenu.' },
        { index: 3, text: 'Ova tvrdnja od 999 kg ne postoji ni u jednom izvoru koji je priložen uz rad.' },
      ],
      sourceDocs: [
        {
          fileName: 'izvjesce-03.docx',
          rawText: SHARED_SENTENCE + ' Masa nosive konstrukcije iznosi 45 kg prema mjerenju.',
          paragraphs: [SHARED_SENTENCE, 'Masa nosive konstrukcije iznosi 45 kg prema mjerenju.'],
        },
      ],
    });

    expect(result.sourceFiles).toEqual([{ fileName: 'izvjesce-03.docx', paragraphCount: 2 }]);
    expect(result.overlap.flaggedCount).toBe(1);
    expect(result.overlap.findings[0].paragraphIndex).toBe(1);

    const claim45 = result.claims.find((c) => c.claim.raw === '45 kg');
    expect(claim45?.foundInAnySource).toBe(true);
    const claim999 = result.claims.find((c) => c.claim.raw === '999 kg');
    expect(claim999?.foundInAnySource).toBe(false);

    expect(result.summary.paragraphsFlagged).toBe(1);
    expect(result.summary.claimsFound).toBeGreaterThanOrEqual(1);
    expect(result.summary.claimsNotFound).toBeGreaterThanOrEqual(1);
    expect(result.summary.claimsChecked).toBe(result.claims.length);
  });

  it('bez izvora vraca prazan, ali strukturno ispravan rezultat', () => {
    const result = analyzeSourceCrossCheck({ thesisParagraphs: [{ index: 1, text: 'Kratak tekst.' }], sourceDocs: [] });
    expect(result.sourceFiles).toEqual([]);
    expect(result.overlap.findings).toEqual([]);
    expect(result.claims.every((c) => !c.foundInAnySource)).toBe(true);
  });
});

describe('analyzeDocx: sourceCrossCheck se NIKAD ne racuna unutar analyzeDocx samog', () => {
  it('details nema kljuc sourceCrossCheck (racuna se SAMO post-hoc u app.ts kad postoje izvorne datoteke) - golden ostaje netaknut po konstrukciji', async () => {
    const file = buildDocxFile({ paragraphs: [{ text: 'Uvod', styleId: 'Heading1' }, { text: 'Kratak sadržaj rada za provjeru.' }] });
    const profileId = VERIFIED_PROFILE_REGISTRY[0].id;
    const profile = resolveProfile(profileId);
    const settings = {
      profileId, workType: profile.selection.workType, citationStyle: 'fpzg', language: 'hr',
      strictness: 'standard', methodology: 'auto', selectionIds: {},
    };
    const result = await analyzeDocx(file, profile, settings, () => {});
    expect('sourceCrossCheck' in (result.details || {})).toBe(false);
  });
});
