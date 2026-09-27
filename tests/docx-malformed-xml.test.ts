/**
 * T26 / audit 22. 9. nalaz #14: neispravan XML ne smije dobiti ocjenu.
 *
 * @xmldom/xmldom 0.9 (worker analize i testni setup) na TESKE greske baca ParseError, ali greske
 * razine `error` i `warning` samo ispise i vrati DJELOMICAN DOM: goli `&`, goli `<` u tekstu,
 * nepoznati entitet, atribut bez navodnika. Takav dokument se tiho bodovao, dok ga preglednikov
 * DOMParser (inline put) odbija kao ne-well-formed. Isti ulaz tako je davao dva ishoda.
 *
 * Mjereno prije ispravka: na 50 .docx fixtura (584 XML/rels dijela) xmldom nije javio nijednu
 * dijagnostiku ni jedne razine, pa strogo odbijanje ne mijenja nijedan postojeci rezultat.
 */
import { describe, expect, it } from 'vitest';
import { buildDocxFile, documentXml, type ParaSpec } from './helpers/docx-builder';
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { parseXml } from '../src/docx/parser';

const TNR = 'Times New Roman';
const PARAGRAPHS: ParaSpec[] = [
  { text: 'Uvod', font: TNR, sizePt: 12, styleId: 'Heading1' },
  { text: 'Istrazivanje i razvoj (R&D) ima udio 1 < 2 u sintetickom primjeru. '.repeat(3), font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 },
  { text: 'Literatura', font: TNR, sizePt: 12, styleId: 'Heading1' },
];
const enc = new TextEncoder();

function settings() {
  const profile = resolveProfile(VERIFIED_PROFILE_REGISTRY[0].id);
  return {
    profile,
    settings: { profileId: VERIFIED_PROFILE_REGISTRY[0].id, workType: profile.selection.workType, citationStyle: 'fpzg',
      language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {} },
  };
}

/** Isti dokument, ali s `word/document.xml` koji je prosao kroz `corrupt`. */
function fileWithDocumentXml(corrupt: (xml: string) => string): File {
  const xml = documentXml({ paragraphs: PARAGRAPHS });
  const broken = corrupt(xml);
  if (broken === xml) throw new Error('generator nije proizveo ciljani ulaz');
  return buildDocxFile({ paragraphs: PARAGRAPHS }, 'osteceni.docx', [{ name: 'word/document.xml', data: enc.encode(broken) }]);
}

async function analyze(file: File) {
  const { profile, settings: s } = settings();
  return analyzeDocx(file, profile, s, () => {});
}

describe('neispravan XML (nalaz #14)', () => {
  it('baseline: isti dokument s ispravno escapeanim tekstom se analizira i boduje', async () => {
    const xml = documentXml({ paragraphs: PARAGRAPHS });
    expect(xml).toContain('R&amp;D');
    expect(xml).toContain('1 &lt; 2');
    const result = await analyze(buildDocxFile({ paragraphs: PARAGRAPHS }));
    expect(typeof result.score).toBe('number');
  });

  const corruptions: [string, (xml: string) => string][] = [
    ['goli ampersand u tekstu', (xml) => xml.replace('R&amp;D', 'R&D')],
    ['goli manji-od u tekstu', (xml) => xml.replace('1 &lt; 2', '1 < 2')],
    ['nepoznati entitet', (xml) => xml.replace('R&amp;D', 'R&nbsp;D')],
    ['atribut bez navodnika', (xml) => xml.replace(/w:val="(\d+)"/, 'w:val=$1')],
  ];

  it.each(corruptions)('%s: analiza odbija dokument umjesto da ga boduje', async (_name, corrupt) => {
    const file = fileWithDocumentXml(corrupt);
    await expect(analyze(file)).rejects.toThrow('Glavni Word dokument nije moguće pročitati.');
  });

  it('poruka greske nosi samo oznaku dijela, ne tekst dokumenta', () => {
    let message = '';
    try { parseXml('<a>TAJNI_TEKST_KANARINAC R&D</a>', 'Glavni Word dokument'); } catch (error) { message = String((error as Error).message); }
    expect(message).toBe('Glavni Word dokument nije moguće pročitati.');
  });

  it('well-formed XML s entitetima i numerickim referencama ostaje prihvacen', () => {
    const doc = parseXml('<a x="1">R&amp;D &lt; &#x10D;&#269; &quot;&apos;&gt;</a>');
    expect(doc.documentElement?.textContent).toBe('R&D < čč "\'>');
  });

  it('teske greske i dalje padaju s istom porukom', () => {
    for (const bad of ['<a><b></a>', 'nije xml', '<a x="1" x="2"/>']) {
      expect(() => parseXml(bad, 'Oznaka')).toThrow('Oznaka nije moguće pročitati.');
    }
  });
});
