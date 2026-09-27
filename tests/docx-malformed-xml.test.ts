/**
 * T26 / audit 22. 9. nalaz #14: neispravan XML ne smije dobiti ocjenu.
 *
 * @xmldom/xmldom 0.9 (worker analize i testni setup) na TESKE greske baca ParseError, ali greske
 * razine `error` i `warning` samo ispise i vrati DJELOMICAN DOM: goli `&`, goli `<` u tekstu,
 * nepoznati entitet, atribut bez navodnika. Takav dokument se tiho bodovao, dok ga preglednikov
 * DOMParser (inline put) odbija kao ne-well-formed. Isti ulaz tako je davao dva ishoda.
 *
 * Mjereno prije ispravka: na 50 .docx fixtura u tests/fixtures/** (docx 21, docx-authored 24,
 * docx-word 5; 584 XML/rels dijela) xmldom nije javio nijednu dijagnostiku ni jedne razine. To nije
 * dokaz za sve pisace (Word, LibreOffice, Google Docs); mjerenje po razini i dijelu nad stvarnim
 * korpusom radi se odvojeno na radnoj stanici.
 *
 * Codex pregled #168, #14a: `warning` za znak U+FFFD je VALJAN XML i ne smije srusiti analizu.
 * #14b: strogo odbijanje vrijedi samo za dijelove bez kojih analiza nema smisla; politika po
 * dijelu je zakljucana testom ispod.
 */
import { describe, expect, it } from 'vitest';
import { buildDocxFile, documentXml, type DocSpec, type ParaSpec } from './helpers/docx-builder';
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { parseXml, xmlDiagnosticRejects, hasBareAmpersand } from '../src/docx/parser';

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
    // xmldom za ova dva oblika ne javlja NIKAKVU dijagnostiku (koordinator lekta-32 na #168).
    ['goli ampersand s razmakom', (xml) => xml.replace('R&amp;D', 'R & D')],
    ['goli ampersand na kraju teksta', (xml) => xml.replace('R&amp;D', 'R&')],
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

  it('& unutar CDATA i komentara je valjan i prolazi', () => {
    expect(parseXml('<a><![CDATA[x & y]]><!-- R & D --></a>').documentElement?.textContent).toBe('x & y');
  });

  it('& unutar processing instructiona je valjan i prolazi (runda 2)', () => {
    expect(() => parseXml('<a><?pi x&y?></a>')).not.toThrow();
    expect(hasBareAmpersand('<?xml version="1.0"?><a><?pi x&y?></a>')).toBe(false);
  });

  it('nezatvoren komentar, CDATA ili PI se odbija', () => {
    for (const bad of ['<a><!-- x', '<a><![CDATA[x', '<a><?pi x']) expect(hasBareAmpersand(bad)).toBe(true);
  });

  it('provjera golog & je linearna: tisuce nezatvorenih komentara i tagova brzo (runda 2)', () => {
    const t0 = performance.now();
    expect(hasBareAmpersand('<!--'.repeat(64000))).toBe(true);
    expect(hasBareAmpersand('<p>'.repeat(200000) + '&amp;')).toBe(false);
    // Regex s lijenim [\s\S]*? trebao je 1,3 s vec za 16 000 otvaraca; linearni prolaz je ispod 100 ms.
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('teske greske i dalje padaju s istom porukom', () => {
    for (const bad of ['<a><b></a>', 'nije xml', '<a x="1" x="2"/>']) {
      expect(() => parseXml(bad, 'Oznaka')).toThrow('Oznaka nije moguće pročitati.');
    }
  });
});

describe('U+FFFD je valjan XML (Codex #14a)', () => {
  it('doslovni U+FFFD u tekstu i atributu prolazi parseXml', () => {
    expect(parseXml('<a x="\uFFFD">R\uFFFDD</a>').documentElement?.textContent).toBe('R\uFFFDD');
  });

  it('dokument s U+FFFD u tekstu se analizira i boduje', async () => {
    const file = fileWithDocumentXml((xml) => xml.replace('R&amp;D', 'R\uFFFDD'));
    const result = await analyze(file);
    expect(typeof result.score).toBe('number');
  });

  it('politika dijagnostika: error i fatalError uvijek, warning osim zamjenskog znaka', () => {
    expect(xmlDiagnosticRejects('fatalError', 'Opening and ending tag mismatch')).toBe(true);
    expect(xmlDiagnosticRejects('error', 'entity not found:&nbsp;')).toBe(true);
    expect(xmlDiagnosticRejects('warning', 'attribute "1" missed quot(")!')).toBe(true);
    expect(xmlDiagnosticRejects('warning', 'attribute space is required"x"!!')).toBe(true);
    expect(xmlDiagnosticRejects('warning', 'Unicode replacement character detected, source encoding issues?')).toBe(false);
    // Samo TOCNA poruka xmldoma prolazi, ne svaki warning koji sadrzi isti podniz (runda 2).
    expect(xmlDiagnosticRejects('warning', 'attribute unicode replacement character missed quot')).toBe(true);
    expect(xmlDiagnosticRejects('warning', 'Unicode replacement character detected, source encoding issues? extra')).toBe(true);
  });

  it('dokument s U+FFFD u atributu se analizira i boduje', async () => {
    const file = fileWithDocumentXml((xml) => xml.replace(/w:val="(\d+)"/, 'w:val="$1" w:rsidR="\uFFFD"'));
    const result = await analyze(file);
    expect(typeof result.score).toBe('number');
  });
});

/**
 * Politika po dijelu paketa (Codex #14b). Dijelovi bez kojih analiza nema smisla rusi analizu;
 * sporedni dijelovi se na gresci preskacu kao da ih nema (tako je bilo i prije #14 za teske
 * greske; sada isto vrijedi i za `error` razinu). comments.xml i customXml analiza ne parsira.
 */
describe('neispravan XML po dijelu paketa (Codex #14b)', () => {
  const BROKEN = '<?xml version="1.0"?><x>R&D</x>';
  const withPart = (name: string, spec: Partial<DocSpec> = {}) => buildDocxFile({ paragraphs: PARAGRAPHS, ...spec }, 'dio.docx', [{ name, data: enc.encode(BROKEN) }]);

  it.each([
    ['word/document.xml', 'Glavni Word dokument', {}],
    ['word/styles.xml', 'Word stilovi', {}],
    ['word/footnotes.xml', 'Word fusnote', { footnotes: ['Fusnota.'] }],
    ['word/_rels/document.xml.rels', 'Word veze', {}],
  ] as const)('%s ruši analizu', async (name, label, spec) => {
    await expect(analyze(withPart(name, spec))).rejects.toThrow(`${label} nije moguće pročitati.`);
  });

  it.each([
    ['docProps/core.xml', {}],
    ['docProps/app.xml', {}],
    ['word/endnotes.xml', { endnotes: ['Endnota.'] }],
    ['word/theme/theme1.xml', {}],
    ['word/numbering.xml', {}],
  ] as const)('%s se preskace i analiza se boduje', async (name, spec) => {
    const result = await analyze(withPart(name, spec));
    expect(typeof result.score).toBe('number');
  });
});
