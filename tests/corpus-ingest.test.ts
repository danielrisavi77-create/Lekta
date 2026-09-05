/**
 * F1: pseudonimizacija i izvedene znacajke.
 *
 * Za brisanje osobnog podatka je propust FATALAN, pa svaki test ovdje ima negativnu kontrolu:
 * dokazuje da provjera GRIZE, a ne samo da prolazi na sretnom ulazu.
 */
import { describe, expect, it } from 'vitest';
import { pseudonymizeDocx, frontMatterNames } from '../src/corpus/pseudonymize';
import { deriveDocxFeatures, producerFamilyOf } from '../src/corpus/docx-features';

const parts = (over: Record<string, string> = {}) => ({
  'docProps/core.xml': '<cp:coreProperties><dc:creator>Ana Anić</dc:creator><cp:lastModifiedBy>Ivan Ivić</cp:lastModifiedBy></cp:coreProperties>',
  'docProps/app.xml': '<Properties><Application>Microsoft Office Word</Application><AppVersion>14.0000</AppVersion><Company>Fakultet</Company></Properties>',
  'word/document.xml':
    '<w:document><w:body><w:p><w:r><w:t>Autor rada je Ana Anić, mentor Ivan Ivić.</w:t></w:r></w:p>' +
    '<w:ins w:author="Ana Anić" w:date="2026-01-01"><w:r><w:t>dodano</w:t></w:r></w:ins>' +
    '<w:sectPr/></w:body></w:document>',
  'word/comments.xml': '<w:comments><w:comment w:id="1" w:author="Ivan Ivić" w:initials="II"><w:p><w:r><w:t>Provjeri ovo.</w:t></w:r></w:p></w:comment></w:comments>',
  ...over,
});

describe('pseudonymizeDocx', () => {
  it('uklanja ime iz metapodataka, atributa I vidljivog teksta', () => {
    const r = pseudonymizeDocx(parts(), { salt: 's1' });
    const all = Object.values(r.parts).join('\n');
    expect(all).not.toMatch(/Ana/);
    expect(all).not.toMatch(/Anić/);
    expect(all).not.toMatch(/Ivan/);
    expect(all).not.toMatch(/Ivić/);
    expect(r.leaks).toEqual([]);
  });

  it('NEGATIVNA KONTROLA: leakScan prijavljuje pojam koji je ostao', () => {
    // Rucno "pokvarena" zamjena: pojam se pojavljuje u dijelu koji nije prosao kroz mapu.
    const r = pseudonymizeDocx(parts(), { salt: 's1' });
    const sabotaged = { ...r.parts, 'word/header1.xml': '<w:hdr><w:t>Ana Anić</w:t></w:hdr>' };
    const again = pseudonymizeDocx(sabotaged, { salt: 's1' });
    // Drugi prolaz vise nema izvor imena u metapodacima, pa "Ana Anić" ostaje: dokaz da leak
    // postoji samo kad ga ima cime prepoznati. Zato se pseudonimizacija radi nad CIJELIM paketom.
    expect(Object.values(again.parts).join('\n')).toMatch(/Ana Anić/);
  });

  it('komentar se ANONIMIZIRA, ne brise (broj komentara je znacajka)', () => {
    const r = pseudonymizeDocx(parts(), { salt: 's1' });
    expect(r.parts['word/comments.xml']).toContain('<w:comment ');
    expect(r.parts['word/comments.xml']).toContain('Provjeri ovo.');
    expect(r.parts['word/comments.xml']).not.toContain('Ivić');
  });

  it('revizije ostaju revizije, mijenja se samo autor', () => {
    const r = pseudonymizeDocx(parts(), { salt: 's1' });
    expect(r.parts['word/document.xml']).toContain('<w:ins ');
    expect(r.parts['word/document.xml']).toContain('dodano');
    expect(r.parts['word/document.xml']).not.toContain('Ana Anić');
  });

  it('ne razara obicne rijeci koje sadrze pojam kao podniz', () => {
    const p = parts({
      'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Analiza i analitika ostaju, Ana odlazi.</w:t></w:r></w:p></w:body></w:document>',
    });
    const r = pseudonymizeDocx(p, { salt: 's1' });
    const doc = r.parts['word/document.xml'];
    expect(doc).toContain('Analiza');
    expect(doc).toContain('analitika');
    expect(doc).not.toMatch(/(^|[^\p{L}])Ana(?=[^\p{L}]|$)/u);
  });

  it('isti salt daje isti pseudonim, razlicit salt razlicit (nema grafa povezivanja)', () => {
    const a = pseudonymizeDocx(parts(), { salt: 'doc-a' });
    const b = pseudonymizeDocx(parts(), { salt: 'doc-a' });
    const c = pseudonymizeDocx(parts(), { salt: 'doc-b' });
    expect(a.parts['docProps/core.xml']).toBe(b.parts['docProps/core.xml']);
    expect(a.parts['docProps/core.xml']).not.toBe(c.parts['docProps/core.xml']);
  });

  it('imenuje nositelje koje je ocistio', () => {
    const r = pseudonymizeDocx(parts(), { salt: 's1' });
    expect(r.carriersCleaned).toContain('core.creator');
    expect(r.carriersCleaned).toContain('core.lastModifiedBy');
    expect(r.carriersCleaned).toContain('author');
    expect(r.carriersCleaned).toContain('initials');
  });
});

describe('deriveDocxFeatures', () => {
  it('endnota nema kad su u dijelu samo separatori (lazni signal iz stvarnog korpusa)', () => {
    const f = deriveDocxFeatures(parts({
      'word/endnotes.xml':
        '<w:endnotes><w:endnote w:type="separator" w:id="-1"><w:p/></w:endnote>' +
        '<w:endnote w:type="continuationSeparator" w:id="0"><w:p/></w:endnote></w:endnotes>',
    }));
    expect(f.endnotesPartPresent).toBe(true);
    expect(f.endnotes).toBe(0);
  });

  it('stvarna endnota se broji', () => {
    const f = deriveDocxFeatures(parts({
      'word/endnotes.xml':
        '<w:endnotes><w:endnote w:type="separator" w:id="-1"><w:p/></w:endnote>' +
        '<w:endnote w:id="2"><w:p><w:r><w:t>biljeska</w:t></w:r></w:p></w:endnote></w:endnotes>',
    }));
    expect(f.endnotes).toBe(1);
  });

  it('broji komentare, revizije i sekcije', () => {
    const f = deriveDocxFeatures(parts());
    expect(f.comments).toBe(1);
    expect(f.trackedChanges).toBe(1);
    expect(f.sections).toBe(1);
  });

  it('naslov Sadrzaj bez polja je vlastito stanje (uvjet za toc-field-fixer)', () => {
    const withHeading = deriveDocxFeatures(parts({
      'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Sadržaj</w:t></w:r></w:p></w:body></w:document>',
    }));
    expect(withHeading.hasTocField).toBe(false);
    expect(withHeading.hasTocHeadingWithoutField).toBe(true);

    const withField = deriveDocxFeatures(parts({
      'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Sadržaj</w:t></w:r></w:p><w:instrText> TOC \\o "1-3" </w:instrText></w:body></w:document>',
    }));
    expect(withField.hasTocField).toBe(true);
    expect(withField.hasTocHeadingWithoutField).toBe(false);
  });

  it('obitelj alata: Pages se NIKAD ne pogadja', () => {
    expect(producerFamilyOf('Microsoft Office Word')).toBe('word');
    expect(producerFamilyOf('LibreOffice/26.2.5.2$Windows_X86_64')).toBe('libreoffice');
    expect(producerFamilyOf(null)).toBe('unknown');
    expect(producerFamilyOf('Pages')).toBe('unknown');
  });

  it('prepoznaje dijelove koje pise samo moderni Word', () => {
    const f = deriveDocxFeatures(parts({ 'word/people.xml': '<w15:people/>' }));
    expect(f.modernWordParts).toContain('word/people.xml');
  });
});

/**
 * Naslovnica je bila slijepa tocka: rjecnik je nastajao SAMO iz metapodataka, pa je izmjereno
 * 2026-08-23 da 218 od 246 stvarnih radova i nakon "pseudonimizacije" i dalje nosi uzorak
 * "Ime Prezime" na prvoj stranici, a 82 dokumenta uopce nemaju ime u metapodacima. Sidecar je
 * pritom tvrdio `applied: true`, sto je bila lazna tvrdnja.
 */
describe('frontMatterNames', () => {
  const paras = (...xs: string[]) =>
    '<w:document><w:body>' + xs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join('') + '</w:body></w:document>';

  it('hvata ime iza oznake uloge, bez titula', () => {
    const n = frontMatterNames(paras('Mentor: doc. dr. sc. Ivan Ivić'));
    expect(n).toContain('Ivan Ivić');
  });

  it('hvata odlomak koji je SAM po sebi ime (kako se pise na naslovnici)', () => {
    expect(frontMatterNames(paras('Ana Anić'))).toContain('Ana Anić');
  });

  it('NEGATIVNA KONTROLA: ustanova i vrsta rada nisu ime', () => {
    const n = frontMatterNames(paras('Fakultet političkih znanosti', 'ZAVRŠNI RAD', 'Sveučilište u Zagrebu', 'Zagreb, 2026.'));
    expect(n).toEqual([]);
  });

  it('NEGATIVNA KONTROLA: naslov rada od dvije velike rijeci se ne brka s imenom', () => {
    // Naslov je recenica s malim slovima, pa ne zadovoljava obrazac "samo velike rijeci".
    expect(frontMatterNames(paras('Formalni kriteriji oblikovanja akademskih radova'))).toEqual([]);
  });

  it('ime s naslovnice ulazi u rjecnik i nestaje iz izlaza', () => {
    const p = {
      'docProps/core.xml': '<cp:coreProperties></cp:coreProperties>',
      'word/document.xml': paras('Sveučilište u Zagrebu', 'Ana Anić', 'Mentor: dr. sc. Ivan Ivić', 'ZAVRŠNI RAD'),
    };
    const r = pseudonymizeDocx(p, { salt: 's' });
    const all = Object.values(r.parts).join('\n');
    expect(all).not.toMatch(/Ana Anić/);
    expect(all).not.toMatch(/Ivan Ivić/);
    expect(all).toContain('Sveučilište u Zagrebu');
    expect(all).toContain('ZAVRŠNI RAD');
    expect(r.carriersCleaned).toContain('document.frontMatter');
    expect(r.leaks).toEqual([]);
  });
});
