/**
 * Laya zlatni skup nad STVARNOM analizom (sinteticki .docx), istim putem kao scripts/laya-zlatni-skup.mts.
 * Izvan tests/laya jer check:laya namjerno ne typechecka src/**.
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { sha256Hex } from '../scripts/laya/contracts-v2.ts';
import { listZaOznacavanje, pripremiKandidate, sastaviZlatniSkup } from '../scripts/laya/zlatni-skup.ts';
import { ENGINE_REV } from './helpers/laya-v2-fixtures.ts';

const heading = (text: string): ParaSpec => ({ text, styleId: 'Heading1' });
const body = (text: string): ParaSpec => ({ text, font: 'Times New Roman', sizePt: 12 });
const TEXT = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada (Horvat, 2020). '.repeat(5);
const COMPLETE = 'Horvat, A. (2020). Sintetička knjiga o medijima. Zagreb: Naklada Primjer.';

async function dokument(i: number) {
  const incomplete = `Kovač, B. Sintetički članak broj ${i} bez godine izdanja i bez nakladnika.`;
  const file = buildDocxFile({ paragraphs: [heading('Uvod'), body(TEXT), heading('Literatura'), body(COMPLETE), body(incomplete)] }, `r${i}.docx`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const profileId = VERIFIED_PROFILE_REGISTRY[0].id;
  const profil = resolveProfile(profileId);
  return {
    incomplete,
    doc: { naziv: `r${i}.docx`, sha256: sha256Hex(Buffer.from(bytes).toString('base64')), profileId,
      profileRevision: sha256Hex(JSON.stringify(profil)), language: 'hr' as const, sourceGroup: null, templateFamily: null,
      analysis: await analyzeFixture(file, { profileId, profile: profil }) },
  };
}

describe('zlatni skup iz stvarne analize', () => {
  it('nepotpuni zapisi postaju kandidati, list ih nosi, a oznake daju dva valjana splita', async () => {
    const ulazi = await Promise.all([1, 2, 3, 4].map(dokument));
    const k = pripremiKandidate(ulazi.map((u) => u.doc), { engineRevision: ENGINE_REV, origin: 'owned_synthetic', permissionRef: 'owned-d1-sinteticki' });
    expect(k.items.map((i) => i.case.modelInput.text)).toEqual(ulazi.map((u) => u.incomplete));
    expect(k.preskoceno).toEqual({});

    const csv = listZaOznacavanje(k);
    for (const u of ulazi) expect(csv).toContain(u.incomplete);
    const oznaceno = csv.replace(/;(k-[0-9a-f]{10});([^;]*);([^;\r\n]*);;/g, ';$1;$2;$3;S;');
    const { calibration, test, statistika } = sastaviZlatniSkup(k, oznaceno, { datasetId: 'd1-sinteticki', testUdio: 0.25 });
    expect(statistika).toMatchObject({ oznaceno: 4, neoznaceno: 0, grupa: 4 });
    expect([calibration.items.length, test.items.length]).toEqual([3, 1]);
  });
});
