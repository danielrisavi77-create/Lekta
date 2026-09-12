/**
 * RUCNO SLOZEN PAKET za oblike PAKIRANJA koje na ovom stroju ne proizvodi nijedan alat.
 *
 *   npm run corpus-gen:pakiranje            # samo izmjeri i ispisi
 *   npm run corpus-gen:pakiranje -- --write # zapisi fixturu i sidecar
 *
 * ZASTO RUCNO, a ne kroz Word ili LibreOffice. Tri oblika koje stvarni radovi nose dolaze iz Google
 * Docs izvoza, a taj se na ovom stroju ne moze proizvesti: nema ni racuna ni roundtripa. Izmjereno
 * 2026-09-08 nad 457 stvarnih radova u `Lekta-korpus`:
 *
 *     zip/direktoriji         130 od 457   (od cega 21 NIJE Google Docs, pa oblik nije njegov potpis)
 *     paket/comments-prazan   135 od 457
 *     gdocs/potpis            129 od 457   (`docProps/app.xml` s doslovno praznim `<Properties/>`)
 *
 * STO OVAJ PAKET JEST, A STO NIJE. Jest vjerna reprodukcija IZMJERENOG otiska: imena zapisa,
 * redoslijed, prazan `<Properties/>` i prisutan `docProps/custom.xml` prepisani su s dva stvarna
 * rada (`BiH_rat_esej.docx`, `ANKETA_v2_Kasalo_revidirana.docx`, oba 22 zapisa i 4 direktorija).
 * NIJE izvoz iz Google Docsa i ne smije se tako zvati; sidecar mu zato nosi traku `handbuilt`, koja
 * je izvan `ADMITTED_TRACKS`, uz `synthetic: true`, dakle oba pojasa zida dokaza.
 *
 * MEHANIZAM IMA VLASTITI BROJAC. Skripta na kraju IZMJERI proizvedeni paket i odbije zapisati ga ako
 * ne nosi svaki tvrdjeni oblik. Bez toga bi fixtura mogla tiho prestati nositi ono zbog cega postoji,
 * a popis oblika bez fixture bi je svejedno brojao kao pokrivenu.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocx, type DocSpec, type ParaSpec, type ZipFileSpec } from '../../tests/helpers/docx-builder';
import { readZip } from '../../src/repair/zip-codec';
import { detectShapes, presentShapes, verifyShapeClaims, type DocxShapeId } from '../../src/corpus/docx-shapes';
import { withProvenance } from '../lib/provenance.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const OUT_DIR = join(ROOT, 'tests', 'fixtures', 'docx-packaging');
const NAZIV = 'gdocs-otisak';
const NAZIV_PNG = 'png-bez-defaulta';

const enc = new TextEncoder();
const tijelo = (text: string): ParaSpec => ({ text });

/**
 * Tekst je namjerno kratak i o samom paketu: ovo nije prozna fixtura i ne pretvara se u rad.
 * Oblici koje ovaj paket dokazuje su u zipu i u dijelovima, ne u recenicama.
 */
const SPEC: DocSpec = {
  paragraphs: [
    { text: 'Testni paket za oblike pakiranja', styleId: 'Heading1' },
    tijelo(
      'Ovaj dokument nije studentski rad nego rucno slozen paket. Postoji zato da commitani skup ' +
        'nosi oblike zipa i dijelova koje stvarni radovi imaju, a nijedan alat na ovom stroju ne pise.',
    ),
    // Niz praznih odlomaka umjesto razmaka: tako pisu i LibreOffice i Google Docs. Ovdje ima jos
    // jednu ulogu, i zato ih je vise od dva: daje popravku STVARAN posao, pa tvrdnja da oblici
    // pakiranja prezive ponovno pisanje paketa ne prolazi vakuumski nad netaknutim bajtovima.
    { empty: true },
    { empty: true },
    { empty: true },
    { empty: true },
    tijelo(
      'Oblici koje nosi opisani su u sidecaru. Sadrzaj je nevazan i namjerno se ne cita kao proza; ' +
        'mjeri se paket, kako je opisano u Tablici 1 tog zapisa.',
    ),
  ],
  settings: true,
};

/**
 * Direktorijski zapisi, redoslijedom prepisanim sa stvarnog Google Docs izvoza.
 *
 * Zapis je obican zip unos s imenom koje zavrsava kosom crtom i praznim sadrzajem; `zipStore` ga
 * pise bez ijedne izmjene, pa ovdje nema nikakve nove mehanike koju bi trebalo dokazivati.
 */
const DIREKTORIJI: ZipFileSpec[] = ['word/', 'word/_rels/', 'docProps/', '_rels/'].map((name) => ({
  name,
  data: new Uint8Array(0),
}));

/** `docProps/app.xml` s praznim `<Properties/>`: doslovno onako kako ga pise Google Docs. */
const APP_XML: ZipFileSpec = {
  name: 'docProps/app.xml',
  data: enc.encode(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>',
  ),
};

/** Prateci znak istog izvoza; nije uvjet nijednog oblika, pa se i ne tvrdi kao oblik. */
const CUSTOM_XML: ZipFileSpec = {
  name: 'docProps/custom.xml',
  data: enc.encode(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>',
  ),
};

/** Dio POSTOJI, komentara nema: potpis ne-Word alata, 135 od 457 stvarnih radova. */
const COMMENTS_PRAZAN: ZipFileSpec = {
  name: 'word/comments.xml',
  data: enc.encode(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
  ),
};

/** Oblici zbog kojih fixtura postoji; sve ostalo sto paket usput nosi nije razlog. */
const TVRDIM: DocxShapeId[] = ['zip/direktoriji', 'paket/comments-prazan', 'gdocs/potpis'];

/**
 * DRUGA FIXTURA: `.png` u paketu bez `Default` unosa za png.
 *
 * OVAJ OBLIK NIJE IZMJEREN NI NA JEDNOM STVARNOM RADU, i to mora stajati ovdje jer je razlika od
 * prve fixture nacelna. Mjerenje 2026-09-08 nad 457 radova: 205 ih ima `word/media/*.png` i SVIH 205
 * nosi `Default Extension="png"`; nijedan ga ne deklarira ni preko `Override`. Ranija provenijencija
 * ("1 od 246 stvarnih radova") se ne reproducira.
 *
 * Fixtura zato postoji ODLUKOM VLASNIKA (2026-09-09), da popis oblika bez nositelja bude prazan, a ne
 * zato sto je oblik nadjen. Razred kvara je stvaran (Word odbija paket u kojem vrsta dijela nije
 * deklarirana), ali dokument koji ga nosi u ovom korpusu nema.
 */
const PNG_SPEC: DocSpec = {
  paragraphs: [
    { text: 'Paket s nedeklariranim png dijelom', styleId: 'Heading1' },
    tijelo(
      'Ovaj paket nosi slikovni dio kojemu vrsta nije deklarirana u [Content_Types].xml. Postoji zato ' +
        'da commitani skup ima nositelja tog oblika; nijedan stvarni rad u korpusu ga ne nosi.',
    ),
    tijelo('Prikaz je opisan u Tablici 1 sidecara, a sam dokument nije rad i ne cita se kao proza.'),
  ],
  settings: true,
};

/**
 * Najmanji valjan PNG (1x1). Ne referencira ga nijedan `w:drawing`, i to je IMENOVANA granica ove
 * fixture: stvarni kvar nastaje kad je slika u dokumentu upotrijebljena, a ovdje je samo prisutna u
 * paketu. Detektor gleda zapis i `[Content_Types].xml`, pa oblik nosi, ali reprodukcija nije potpuna.
 */
const PNG_DIO: ZipFileSpec = {
  name: 'word/media/slika1.png',
  data: Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  ),
};

const TVRDIM_PNG: DocxShapeId[] = ['paket/bez-png-default'];

interface Fixtura {
  naziv: string;
  bytes: Uint8Array;
  tvrdim: DocxShapeId[];
  razlog: string;
  provenance: Record<string, string>;
  toolLimitations: string[];
}

/** Izmjeri, provjeri tvrdnje i (uz `--write`) zapisi jednu fixturu. Vraca `false` na nalaz. */
async function emit(f: Fixtura, write: boolean): Promise<boolean> {
  const entries = await readZip(f.bytes);
  const counts = detectShapes(entries);
  console.log(`\n${f.naziv}: zapisa ${entries.length}, oblika ${presentShapes(counts).length}`);
  console.log(`  nosi: ${presentShapes(counts).join(', ')}`);

  // Brojac mehanizma: paket koji ne nosi tvrdjeni oblik se NE zapisuje. Fixtura koja tiho prestane
  // nositi svoj oblik gora je od nikakve, jer popis nepokrivenih i dalje racuna da je pokriven.
  const verdikt = verifyShapeClaims(f.tvrdim, counts);
  if (verdikt.missing.length || verdikt.unknown.length) {
    console.error(`  NALAZ: nedostaje ${verdikt.missing.join(', ')}${verdikt.unknown.length ? `, nepoznato ${verdikt.unknown.join(', ')}` : ''}`);
    return false;
  }
  if (!write) return true;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${f.naziv}.docx`), f.bytes);
  const sidecar = {
    profileId: null,
    synthetic: true,
    track: 'handbuilt',
    razlog: f.razlog,
    provenance: withProvenance(f.provenance, 'npm run corpus-gen:pakiranje -- --write'),
    shapes: { claimed: f.tvrdim },
    toolLimitations: f.toolLimitations,
  };
  writeFileSync(join(OUT_DIR, `${f.naziv}.json`), `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  console.log(`  zapisano: ${join(OUT_DIR, `${f.naziv}.docx`)}`);
  return true;
}

async function main(): Promise<void> {
  const write = process.argv.slice(2).includes('--write');
  const fixture: Fixtura[] = [
    {
      naziv: NAZIV,
      bytes: buildDocx(SPEC, [...DIREKTORIJI, APP_XML, CUSTOM_XML, COMMENTS_PRAZAN]),
      tvrdim: TVRDIM,
      razlog:
        'Rucno slozen paket, nije izvoz iz Google Docsa. Reproducira IZMJEREN otisak takvog izvoza ' +
        '(prazan Properties, custom.xml, direktorijski zapisi) da commitani skup uopce ima nositelja ' +
        'tih oblika. Sadrzaj nije rad i ne cita se kao proza.',
      provenance: { measuredOver: '457 stvarnih radova u Lekta-korpus, 2026-09-08; oblik nadjen na 129 do 135 njih' },
      toolLimitations: [
        'Google Docs roundtrip nije izvediv na ovom stroju (nema racuna), pa je otisak reproduciran, ne dobiven.',
      ],
    },
    {
      naziv: NAZIV_PNG,
      bytes: buildDocx(PNG_SPEC, [PNG_DIO]),
      tvrdim: TVRDIM_PNG,
      razlog:
        'IZMISLJEN OBLIK, ne izmjeren. Paket nosi `word/media/slika1.png` bez `Default Extension="png"` ' +
        'u [Content_Types].xml. Mjerenje 2026-09-08 nad 457 stvarnih radova nije naslo NIJEDAN takav ' +
        'dokument (205 ih ima png i svih 205 ga deklarira). Fixtura postoji odlukom vlasnika 2026-09-09, ' +
        'da popis oblika bez nositelja bude prazan; nije dokaz da se oblik u praksi javlja.',
      provenance: { measuredOver: '457 stvarnih radova u Lekta-korpus, 2026-09-08; oblik nadjen na 0 njih' },
      toolLimitations: [
        'png dio nije referenciran nijednim `w:drawing`, pa reprodukcija nije potpuna: stvarni kvar nastaje kad je slika upotrijebljena.',
        'oblik nema potkrepu u stvarnom korpusu; ako ga ijedan buduci ingest donese, ovu fixturu treba zamijeniti tim dokumentom.',
      ],
    },
  ];

  let ok = true;
  for (const f of fixture) ok = (await emit(f, write)) && ok;
  if (!ok) process.exitCode = 1;
  else if (!write) console.log('\n(bez --write nista nije zapisano)');
}

await main();
