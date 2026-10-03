import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './helpers/docx-builder';
import {
  UPISNIK_SNAPSHOT_RATCHET_CEILING,
  verifyUpisnikEvidenceSnapshots,
  type SnapshotRatchet, type SnapshotSource, type UpisnikEvidenceFile,
} from '../src/programs/upisnik-evidence-snapshots';

const root = process.cwd();
const bytes = (path: string) => new Uint8Array(readFileSync(resolve(root, path)));
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const read = (path: string) => {
  try { return bytes(path); } catch { return null; }
};
const empty: SnapshotRatchet = { schemaVersion: 1, entries: [] };
const baseline = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/upisnik-snapshot-ratchet-baseline.json'), 'utf8')) as SnapshotRatchet;
const makeFile = (url: string, quote: string): UpisnikEvidenceFile => ({
  decisions: [{ programCode: '1', evidence: { sourceUrl: url, sourceLocator: 'test', quote } }],
  exclusions: [],
});
const html = 'data/sources/test/snapshot.html';
const url = 'https://example.test/source';
const text = new TextEncoder().encode('<style>skriveno</style><p>Doslovni citat iz ove registrirane snimke &amp; dodatak.</p>');
const source = (path = html, data = text): SnapshotSource => ({ url, snapshotPath: path, snapshotHash: hash(data) });
const synthetic = (quote: string, data = text, src = source(), extra: Record<string, Uint8Array> = {}, ratchet = empty) =>
  verifyUpisnikEvidenceSnapshots(makeFile(url, quote), [src], (path) => extra[path] ?? (path === src.snapshotPath ? data : null), ratchet, baseline);
const good = 'Doslovni citat iz ove registrirane snimke & dodatak.';

describe('Upisnik citati u registriranim snimkama', () => {
  it('stvarne odluke daju nula problema i ratchet ne prelazi strop 380', async () => {
    const file = JSON.parse(readFileSync(resolve(root, 'data/programs/upisnik-profile-decisions.json'), 'utf8')) as UpisnikEvidenceFile;
    const registry = JSON.parse(readFileSync(resolve(root, 'data/sources/source-registry.json'), 'utf8')) as SnapshotSource[];
    const ratchet = JSON.parse(readFileSync(resolve(root, 'data/programs/upisnik-evidence-snapshot-ratchet.json'), 'utf8')) as SnapshotRatchet;
    expect(UPISNIK_SNAPSHOT_RATCHET_CEILING).toBeLessThanOrEqual(380);
    expect(ratchet.entries.length).toBe(380);
    expect(baseline.entries.length).toBe(380);
    const urls = new Set(registry.map((r) => r.url));
    expect([...file.decisions, ...file.exclusions, ...(file.integratedGraduateCoverage ?? [])].filter((r) => urls.has(r.evidence.sourceUrl))).toHaveLength(13);
    expect(await verifyUpisnikEvidenceSnapshots(file, registry, read, ratchet, baseline)).toEqual([]);
  });
  it('registrirani HTML prihvaca doslovan citat i dekodira entitete', async () => {
    expect(await synthetic(good)).toEqual([]);
  });
  it('izmisljen citat u registriranom HTML-u pada', async () => {
    expect(await synthetic('Ova izmisljena recenica nikad nije u snimci.')).toContain('decision 1: citat nije doslovan podniz snimke');
  });
  it('citat iz druge snimke iste sastavnice pada', async () => {
    const other = new TextEncoder().encode('Druga snimka iste sastavnice s drukcijim tekstom.');
    expect(await synthetic(good, other, source(html, other))).toContain('decision 1: citat nije doslovan podniz snimke');
  });
  it('zamijenjeni bajtovi snimke padaju na hashu', async () => {
    const other = new TextEncoder().encode('Drugi bajtovi s istim citatom: ' + good);
    expect((await synthetic(good, other)).join(' ')).toMatch(/hash snimke/);
  });
  it('skenirani PDF bez OCR pratitelja pada', async () => {
    const path = 'data/sources/efri/efri-pravilnik-specijalisticki-2024.pdf';
    const data = bytes(path);
    expect((await synthetic(good, data, source(path, data))).join(' ')).toMatch(/skenirana snimka bez OCR pratitelja/);
  });
  it('skenirani PDF s krivim hashom pratitelja pada', async () => {
    const path = 'data/sources/efri/efri-pravilnik-specijalisticki-2024.pdf';
    const data = bytes(path);
    const companion = path.replace(/\.pdf$/u, '.snapshot-ocr.txt');
    const extra = { [companion]: new TextEncoder().encode('# snapshotHash: ' + '0'.repeat(64) + '\n' + good) };
    expect((await synthetic(good, data, source(path, data), extra)).join(' ')).toMatch(/skenirana snimka bez OCR pratitelja/);
  });
  it('skenirani PDF s ispravnim OCR pratiteljem prolazi', async () => {
    const path = 'data/sources/efri/efri-pravilnik-specijalisticki-2024.pdf';
    const data = bytes(path);
    const companion = path.replace(/\.pdf$/u, '.snapshot-ocr.txt');
    const extra = { [companion]: new TextEncoder().encode('# snapshotHash: ' + hash(data) + '\n' + good) };
    expect(await synthetic(good, data, source(path, data), extra)).toEqual([]);
  });
  it('DOC citat se nalazi', async () => {
    const registry = JSON.parse(readFileSync(resolve(root, 'data/sources/source-registry.json'), 'utf8')) as SnapshotSource[];
    const doc = registry.find((r) => r.snapshotPath?.endsWith('.doc'));
    expect(doc).toBeDefined();
    const data = bytes(doc!.snapshotPath!);
    const WordExtractor = createRequire(import.meta.url)('word-extractor') as new () => { extract(b: Buffer): Promise<{ getBody(): string }> };
    const body = (await new WordExtractor().extract(Buffer.from(data))).getBody();
    const paragraph = body.split(/\n\s*\n/u).map((p) => p.replace(/\s+/gu, ' ').trim()).find((p) => p.length >= 50)!;
    const quote = paragraph.slice(0, 50);
    expect(await synthetic(quote, data, { ...doc!, url })).toEqual([]);
  });
  it('DOCX citat se nalazi', async () => {
    const registry = JSON.parse(readFileSync(resolve(root, 'data/sources/source-registry.json'), 'utf8')) as SnapshotSource[];
    const file = JSON.parse(readFileSync(resolve(root, 'data/programs/upisnik-profile-decisions.json'), 'utf8')) as UpisnikEvidenceFile;
    const rows = [...file.decisions, ...file.exclusions, ...(file.integratedGraduateCoverage ?? [])];
    const row = rows.find((r) => registry.some((s) => s.url === r.evidence.sourceUrl && s.snapshotPath?.endsWith('.docx')));
    expect(row).toBeDefined();
    const doc = registry.find((r) => r.url === row!.evidence.sourceUrl)!;
    const data = bytes(doc.snapshotPath!);
    expect(await synthetic(row!.evidence.quote, data, { ...doc, url })).toEqual([]);
  });
  it('nova odluka s neregistriranim URL-om pada', async () => {
    expect((await verifyUpisnikEvidenceSnapshots(makeFile(url, good), [], () => null, empty, baseline)).join(' ')).toMatch(/nova obvezujuca odluka/);
  });
  it('zastarjeli ratchet zapis pada', async () => {
    const ratchet: SnapshotRatchet = { schemaVersion: 1, entries: [{ programCode: '2', kind: 'decision', sourceUrl: 'https://old.test' }] };
    expect((await synthetic(good, text, source(), {}, ratchet)).join(' ')).toMatch(/zastarjeli ratchet zapis/);
  });
  it('citat od 19 znakova pada', async () => {
    expect((await synthetic('a'.repeat(19))).join(' ')).toMatch(/kraci od 20/);
  });
  it('rastavljanje na kraju retka i meki rastavljac prolaze', async () => {
    const split = new TextEncoder().encode('<p>Doslovni ci-\ntat iz ove registrirane snimke &amp; do\u00addatak.</p>');
    expect(await synthetic(good, split, source(html, split))).toEqual([]);
  });
  const invisible = 'Skriveni citat koji citatelj nikada ne vidi.';
  const htmlCases = [
    ['komentar s >', '<!-- ' + invisible + ' > -->'],
    ['script', '<script>' + invisible + '</script>'],
    ['style', '<style>' + invisible + '</style>'],
    ['noscript', '<noscript>' + invisible + '</noscript>'],
    ['template', '<template>' + invisible + '</template>'],
    ['title', '<title>' + invisible + '</title>'],
    ['nezatvoren script', '<script>' + invisible],
    ['nezatvoren style', '<style>' + invisible],
    ['atribut s >', '<p data-note="' + invisible + ' >">Vidljiv tekst.</p>'],
  ] as const;
  for (const [name, markup] of htmlCases) it('HTML ignorira ' + name, async () => {
    const data = new TextEncoder().encode('<p>Vidljiv tekst ove stranice.</p>' + markup);
    expect((await synthetic(invisible, data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('HTML blok elementi razdvajaju odlomke', async () => {
    const data = new TextEncoder().encode('<p>Prvi dio doslovnog citata</p><div>drugi dio iste recenice.</div>');
    expect((await synthetic('Prvi dio doslovnog citata drugi dio iste recenice.', data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  for (const block of ['p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td']) it('HTML ' + block + ' prekida citat', async () => {
    const markup = block === 'br' ? '<p>Prvi dio doslovnog citata<br>drugi dio iste recenice.</p>' : '<' + block + '>Prvi dio doslovnog citata</' + block + '><' + block + '>drugi dio iste recenice.</' + block + '>';
    const data = new TextEncoder().encode(markup);
    expect((await synthetic('Prvi dio doslovnog citata drugi dio iste recenice.', data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('crtica s razmakom prije novog retka ostaje razdjelnik', async () => {
    const data = new TextEncoder().encode('<p>Upute za izradu rada -\nsazetak i dodatak.</p>');
    expect((await synthetic('Upute za izradu rada sazetak i dodatak.', data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  const docx = (raw: string) => buildDocx({ paragraphs: [{ text: '', raw: '<w:p>' + raw + '</w:p>' }] });
  const docxCheck = (quote: string, data: Uint8Array) => synthetic(quote, data, source('data/sources/test/snapshot.docx', data));
  for (const [name, raw] of [
    ['delText', '<w:r><w:delText>' + invisible + '</w:delText></w:r>'],
    ['instrText', '<w:r><w:instrText>' + invisible + '</w:instrText></w:r>'],
    ['vanish', '<w:r><w:rPr><w:vanish/></w:rPr><w:t>' + invisible + '</w:t></w:r>'],
    ['w:del', '<w:del><w:r><w:t>' + invisible + '</w:t></w:r></w:del>'],
  ] as const) it('DOCX ignorira ' + name, async () => {
    expect((await docxCheck(invisible, docx(raw))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  for (const [name, markup] of [
    ['hidden', '<span hidden>' + invisible + '</span>'],
    ['aria-hidden', '<span aria-hidden="true">' + invisible + '</span>'],
    ['display none', '<span style="display:none">' + invisible + '</span>'],
    ['display NONE', '<span style=" DISPLAY : NONE ">' + invisible + '</span>'],
    ['visibility hidden', '<span style="visibility:hidden">' + invisible + '</span>'],
    ['nested template', '<template><template>' + invisible + '</template></template>'],
    ['unclosed attribute quote', '<p data-note="' + invisible + '>'],
  ] as const) it('HTML odbacuje ' + name, async () => {
    const data = new TextEncoder().encode('<p>Vidljivi tekst stranice.</p>' + markup);
    expect((await synthetic(invisible, data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('HTML inline span spaja tekst bez umetnutog razmaka', async () => {
    const data = new TextEncoder().encode('<p>Ovo je pred<span>dip</span>lomski studij prema uputama.</p>');
    expect(await synthetic('Ovo je preddiplomski studij prema uputama.', data, source(html, data))).toEqual([]);
    expect((await synthetic('Ovo je pred dip lomski studij prema uputama.', data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  for (const block of ['section', 'unknown-element']) it('HTML ' + block + ' prekida citat', async () => {
    const data = new TextEncoder().encode('<' + block + '>Prvi dio doslovnog citata</' + block + '><' + block + '>drugi dio iste recenice.</' + block + '>');
    expect((await synthetic('Prvi dio doslovnog citata drugi dio iste recenice.', data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  for (const [name, raw] of [
    ['komentar', '<w:r><w:t>Vidljivi tekst prije komentara.</w:t></w:r><!-- ' + invisible + ' -->'],
    ['moveFrom', '<w:moveFrom><w:r><w:t>' + invisible + '</w:t></w:r></w:moveFrom>'],
  ] as const) it('DOCX ignorira ' + name, async () => {
    expect((await docxCheck(invisible, docx(raw))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('DOCX odbacuje malformed closing del', async () => {
    const data = docx('<w:del><w:r><w:t>' + invisible + '</w:t></w:r></w:del >');
    expect((await docxCheck(invisible, data)).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('DOCX odbacuje neispravan XML', async () => {
    const data = docx('<w:r><w:t>' + invisible + '</w:t></w:r><w:bad>');
    expect((await docxCheck(invisible, data)).join(' ')).toMatch(/DOCX XML nije ispravan/);
  });
  it('DOCX skriveni znakovni stil i polje', async () => {
    const stylesXml = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Hidden"><w:rPr><w:vanish/></w:rPr></w:style></w:styles>';
    const hidden = buildDocx({ stylesXml, paragraphs: [{ text: '', raw: '<w:p><w:r><w:rPr><w:rStyle w:val="Hidden"/></w:rPr><w:t>' + invisible + '</w:t></w:r></w:p>' }] });
    expect((await docxCheck(invisible, hidden)).join(' ')).toMatch(/nije doslovan podniz/);
    const field = docx('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:t>' + invisible + '</w:t></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Vidljivi rezultat polja u dokumentu.</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>');
    expect((await docxCheck(invisible, field)).join(' ')).toMatch(/nije doslovan podniz/);
    expect(await docxCheck('Vidljivi rezultat polja u dokumentu.', field)).toEqual([]);
  });
  it('HTML pravi head prije body nije citat', async () => {
    const data = new TextEncoder().encode('<html><head>' + invisible + '</head><body><p>Vidljivi tekst stranice.</p></body></html>');
    expect((await synthetic(invisible, data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  for (const [name, markup] of [
    ['html hidden', '<html hidden><body><p>' + invisible + '</p></body></html>'],
    ['body aria-hidden', '<html><body aria-hidden="true"><p>' + invisible + '</p></body></html>'],
    ['html display:none', '<html style="display:none"><body><p>' + invisible + '</p></body></html>'],
    ['body visibility:hidden', '<html><body style="visibility:hidden"><p>' + invisible + '</p></body></html>'],
    ['closed details', '<details><summary>Vidljivi naslov.</summary><p>' + invisible + '</p></details>'],
    ['closed dialog', '<dialog>' + invisible + '</dialog>'],
    ['datalist', '<datalist><option>' + invisible + '</option></datalist>'],
    ['noembed', '<noembed>' + invisible + '</noembed>'],
    ['noframes', '<noframes>' + invisible + '</noframes>'],
    ['rp', '<rp>' + invisible + '</rp>'],
    ['option', '<select><option>' + invisible + '</option></select>'],
  ] as const) it('HTML ignorira ' + name, async () => {
    const data = new TextEncoder().encode(markup);
    expect((await synthetic(invisible, data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  for (const markup of [
    '<details><summary>' + invisible + '</summary><p>Nevidljivo tijelo.</p></details>',
    '<dialog open>' + invisible + '</dialog>',
  ]) it('HTML prihvaca otvoren vidljiv sadrzaj', async () => {
    const data = new TextEncoder().encode(markup);
    expect(await synthetic(invisible, data, source(html, data))).toEqual([]);
  });
  it('DOCX odbacuje goli ampersand u atributu', async () => {
    const data = docx('<w:r><w:t>' + invisible + '</w:t></w:r><w:bad a="x & y"/>');
    expect((await docxCheck(invisible, data)).join(' ')).toMatch(/DOCX XML nije ispravan/);
  });
  it('DOCX cita w:t samo izravno u dopustenom runu', async () => {
    const nested = docx('<w:r><w:wrapper><w:t>' + invisible + '</w:t></w:wrapper></w:r>');
    const props = docx('<w:pPr><w:r><w:t>' + invisible + '</w:t></w:r></w:pPr>');
    const badParent = docx('<w:unknown><w:r><w:t>' + invisible + '</w:t></w:r></w:unknown>');
    for (const data of [nested, props, badParent]) expect((await docxCheck(invisible, data)).join(' ')).toMatch(/nije doslovan podniz/);
    const goodRun = docx('<w:hyperlink><w:r><w:t>' + invisible + '</w:t></w:r></w:hyperlink>');
    expect(await docxCheck(invisible, goodRun)).toEqual([]);
  });
  it('DOCX polje prati fldChar u skrivenom i obrisanom runu', async () => {
    const hiddenBegin = docx('<w:r><w:rPr><w:vanish/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:t>' + invisible + '</w:t></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Vidljivi rezultat polja u dokumentu.</w:t></w:r>');
    expect((await docxCheck(invisible, hiddenBegin)).join(' ')).toMatch(/nije doslovan podniz/);
    expect(await docxCheck('Vidljivi rezultat polja u dokumentu.', hiddenBegin)).toEqual([]);
    const deletedSeparate = docx('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:del><w:r><w:fldChar w:fldCharType="separate"/></w:r></w:del><w:r><w:t>' + invisible + '</w:t></w:r>');
    expect(await docxCheck(invisible, deletedSeparate)).toEqual([]);
  });
  it('DOCX znakovni stil nasljeduje skrivanje i prekida ciklus', async () => {
    const stylesXml = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="character" w:styleId="Base"><w:rPr><w:vanish/></w:rPr></w:style><w:style w:type="character" w:styleId="Child"><w:basedOn w:val="Base"/></w:style><w:style w:type="character" w:styleId="Cycle"><w:basedOn w:val="Cycle"/></w:style></w:styles>';
    const hidden = buildDocx({ stylesXml, paragraphs: [{ text: '', raw: '<w:p><w:r><w:rPr><w:rStyle w:val="Child"/></w:rPr><w:t>' + invisible + '</w:t></w:r></w:p>' }] });
    expect((await docxCheck(invisible, hidden)).join(' ')).toMatch(/nije doslovan podniz/);
    const visible = buildDocx({ stylesXml, paragraphs: [{ text: '', raw: '<w:p><w:r><w:rPr><w:rStyle w:val="Cycle"/></w:rPr><w:t>' + invisible + '</w:t></w:r></w:p>' }] });
    expect(await docxCheck(invisible, visible)).toEqual([]);
  });
  it('DOCX odlomni stil i docDefaults skrivaju tekst uz eksplicitnu iznimku', async () => {
    const stylesXml = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:vanish/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="HiddenPara"><w:rPr><w:vanish/></w:rPr></w:style></w:styles>';
    const para = buildDocx({ stylesXml, paragraphs: [{ text: '', raw: '<w:p><w:pPr><w:pStyle w:val="HiddenPara"/></w:pPr><w:r><w:t>' + invisible + '</w:t></w:r></w:p>' }] });
    expect((await docxCheck(invisible, para)).join(' ')).toMatch(/nije doslovan podniz/);
    const defaultOnly = buildDocx({ stylesXml, paragraphs: [{ text: '', raw: '<w:p><w:r><w:t>' + invisible + '</w:t></w:r></w:p>' }] });
    expect((await docxCheck(invisible, defaultOnly)).join(' ')).toMatch(/nije doslovan podniz/);
    const explicit = buildDocx({ stylesXml, paragraphs: [{ text: '', raw: '<w:p><w:r><w:rPr><w:vanish w:val="0"/></w:rPr><w:t>' + invisible + '</w:t></w:r></w:p>' }] });
    expect(await docxCheck(invisible, explicit)).toEqual([]);
  });
  it('DOCX zanemaruje vanish unutar rPrChange', async () => {
    const data = docx('<w:r><w:rPr><w:rPrChange><w:rPr><w:vanish/></w:rPr></w:rPrChange></w:rPr><w:t>' + invisible + '</w:t></w:r>');
    expect(await docxCheck(invisible, data)).toEqual([]);
  });
  it('DOCX AlternateContent bira fallback ili prvi choice', async () => {
    const prefix = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">';
    const withFallback = docx(prefix + '<mc:Choice Requires="x"><w:r><w:t>' + invisible + '</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t>Vidljivi zamjenski tekst dokumenta.</w:t></w:r></mc:Fallback></mc:AlternateContent>');
    expect((await docxCheck(invisible, withFallback)).join(' ')).toMatch(/nije doslovan podniz/);
    expect(await docxCheck('Vidljivi zamjenski tekst dokumenta.', withFallback)).toEqual([]);
    const choice = docx(prefix + '<mc:Choice Requires="x"><w:r><w:t>' + invisible + '</w:t></w:r></mc:Choice><mc:Choice Requires="y"><w:r><w:t>Drugi nevidljivi izbor dokumenta.</w:t></w:r></mc:Choice></mc:AlternateContent>');
    expect(await docxCheck(invisible, choice)).toEqual([]);
    expect((await docxCheck('Drugi nevidljivi izbor dokumenta.', choice)).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('ratchet zamjena izvan zamrznute osnovice pada', async () => {
    const entry = { ...baseline.entries[0], sourceUrl: 'https://replacement.example.test' };
    const ratchet: SnapshotRatchet = { schemaVersion: 1, entries: [entry] };
    const file = makeFile(entry.sourceUrl, good);
    expect((await verifyUpisnikEvidenceSnapshots(file, [], () => null, ratchet, baseline)).join(' ')).toMatch(/ratchet zapis izvan zamrznute osnovice/);
  });
  it('DOCX dekodira XML entitete', async () => {
    const data = docx('<w:r><w:t>Citati &amp; dokazi &lt;20&gt; &quot;tocni&quot; &apos;vidljivi&apos; &#65; &#x42;.</w:t></w:r>');
    expect(await docxCheck("Citati & dokazi <20> \"tocni\" 'vidljivi' A B.", data)).toEqual([]);
  });
  it('DOCX w:tab i w:br ne lijepe rijeci', async () => {
    const data = docx('<w:r><w:t>Vidljivi dio dokumenta</w:t><w:tab/><w:t>nakon taba</w:t><w:br/><w:t>nakon prijeloma.</w:t></w:r>');
    expect(await docxCheck('Vidljivi dio dokumenta nakon taba nakon prijeloma.', data)).toEqual([]);
    expect((await docxCheck('Vidljivi dio dokumentanakon taba', data)).join(' ')).toMatch(/nije doslovan podniz/);
    expect((await docxCheck('nakon tabanakon prijeloma.', data)).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('DOCX w:cr prekida rijeci', async () => {
    const data = docx('<w:r><w:t>Vidljivi dio dokumenta</w:t><w:cr/><w:t>nakon prijeloma.</w:t></w:r>');
    expect(await docxCheck('Vidljivi dio dokumenta nakon prijeloma.', data)).toEqual([]);
  });
  it('DOCX granica odlomka prekida citat', async () => {
    const data = buildDocx({ paragraphs: [{ text: 'Prvi dio doslovnog citata' }, { text: 'drugi dio iste recenice.' }] });
    expect((await docxCheck('Prvi dio doslovnog citata drugi dio iste recenice.', data)).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('DOCX skriveni zadani odlomni i znakovni stil skrivaju tekst bez pStyle i rStyle', async () => {
    const quote = 'Skriveni citat koji citatelj ne vidi.';
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const paraStyles = '<w:styles ' + ns + '><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:rPr><w:vanish/></w:rPr></w:style></w:styles>';
    const charStyles = '<w:styles ' + ns + '><w:style w:type="character" w:default="1" w:styleId="DefaultFont"><w:rPr><w:vanish/></w:rPr></w:style></w:styles>';
    const plain = '<w:p><w:r><w:t>' + quote + '</w:t></w:r></w:p>';
    expect((await docxCheck(quote, buildDocx({ stylesXml: paraStyles, paragraphs: [{ text: '', raw: plain }] }))).join(' ')).toMatch(/nije doslovan podniz/);
    expect((await docxCheck(quote, buildDocx({ stylesXml: charStyles, paragraphs: [{ text: '', raw: plain }] }))).join(' ')).toMatch(/nije doslovan podniz/);
    const visibleStyles = '<w:styles ' + ns + '><w:style w:type="paragraph" w:default="1" w:styleId="Normal"/></w:styles>';
    expect(await docxCheck(quote, buildDocx({ stylesXml: visibleStyles, paragraphs: [{ text: '', raw: plain }] }))).toEqual([]);
  });
  it('DOCX w:noBreakHyphen je spojnica, a w:softHyphen ne lijepi rijec', async () => {
    const data = docx('<w:r><w:t>Ovo je znanstveno</w:t><w:noBreakHyphen/><w:t>istrazivacki rad o temi.</w:t></w:r>');
    expect(await docxCheck('Ovo je znanstveno-istrazivacki rad o temi.', data)).toEqual([]);
    expect((await docxCheck('Ovo je znanstvenoistrazivacki rad o temi.', data)).join(' ')).toMatch(/nije doslovan podniz/);
    const soft = docx('<w:r><w:t>Diplomski rad je samostal</w:t><w:softHyphen/><w:t>no izradjen tekst.</w:t></w:r>');
    expect(await docxCheck('Diplomski rad je samostalno izradjen tekst.', soft)).toEqual([]);
  });
  it('DOC citat preko granice odlomka pada', async () => {
    const registry = JSON.parse(readFileSync(resolve(root, 'data/sources/source-registry.json'), 'utf8')) as SnapshotSource[];
    const doc = registry.find((r) => r.snapshotPath === 'data/sources/fpzg/fpzg-drsc08-doktorski-oblikovanje.doc');
    expect(doc).toBeDefined();
    const data = bytes(doc!.snapshotPath!);
    const WordExtractor = createRequire(import.meta.url)('word-extractor') as new () => { extract(b: Buffer): Promise<{ getBody(): string }> };
    const lines = (await new WordExtractor().extract(Buffer.from(data))).getBody().split('\n').map((l) => l.replace(/\s+/gu, ' ').trim());
    const at = lines.findIndex((l, i) => l.length >= 30 && (lines[i + 1] ?? '').length >= 30);
    expect(at).toBeGreaterThanOrEqual(0);
    const across = lines[at].slice(-25) + ' ' + lines[at + 1].slice(0, 25);
    expect((await synthetic(across, data, { ...doc!, url })).join(' ')).toMatch(/nije doslovan podniz/);
    expect(await synthetic(lines[at].slice(0, 30), data, { ...doc!, url })).toEqual([]);
  });
  it('prazan redak iz izvucenog teksta prekida citat kao u PDF-u', async () => {
    const data = new TextEncoder().encode('<p>Prvi dio doslovnog citata\n\n drugi dio iste recenice.</p>');
    expect((await synthetic('Prvi dio doslovnog citata drugi dio iste recenice.', data, source(html, data))).join(' ')).toMatch(/nije doslovan podniz/);
  });
  it('ratchet zapis za upravo registrirani URL pada', async () => {
    const ratchet: SnapshotRatchet = { schemaVersion: 1, entries: [{ programCode: '1', kind: 'decision', sourceUrl: url }] };
    expect((await synthetic(good, text, source(), {}, ratchet)).join(' ')).toMatch(/zastarjeli ratchet zapis/);
  });
  it('cache razdvaja isti put s razlicitim hashom', async () => {
    const changed = new TextEncoder().encode('<p>Drugi tekst na istom putu s drugim hashom.</p>');
    const first = source(html, text);
    const second = { ...source(html, changed), url: 'https://example.test/second' };
    const file: UpisnikEvidenceFile = { decisions: [
      { programCode: '1', evidence: { sourceUrl: url, sourceLocator: 'test', quote: good } },
      { programCode: '2', evidence: { sourceUrl: second.url, sourceLocator: 'test', quote: 'Drugi tekst na istom putu s drugim hashom.' } },
    ], exclusions: [] };
    expect((await verifyUpisnikEvidenceSnapshots(file, [first, second], () => text, empty, baseline)).join(' ')).toMatch(/hash snimke ne odgovara registru/);
  });

});
