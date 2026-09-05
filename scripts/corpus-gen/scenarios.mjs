/**
 * Scenariji za LibreOffice traku (F2).
 *
 * Sadrzaj je IZMISLJEN. Recenice su bezlicne, akademski neutralne i ne opisuju nicije
 * istrazivanje; sluze samo tome da dokument ima realan opseg, strukturu i tipografiju.
 * Zato u njima nema osobnih podataka i fixture se smiju commitati.
 *
 * Vrijednosti oblikovanja NISU izmisljene: dolaze iz pravila profila (`data/profiles`), pa
 * "uskladjen" scenarij znaci uskladjen s onim sto taj fakultet stvarno propisuje.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));

/** Pravila profila iz teskog registra (isti izvor koji cita analiza). */
export function rulesFor(profileId) {
  const heavy = JSON.parse(readFileSync(join(ROOT, 'data', 'profiles', 'verified-profiles-heavy.json'), 'utf8'));
  const entry = heavy[profileId];
  if (!entry) throw new Error(`Nepoznat profil: ${profileId}`);
  return entry.rules || {};
}

const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESC[c]);

/**
 * Bezlicne akademske recenice. Namjerno bez imena, ustanova, godina i tvrdnji o stvarnom
 * istrazivanju: ovo je ispuna za opseg, ne tekst rada.
 */
const RECENICE = [
  'Predmet ovog poglavlja je odnos izmedju formalnih pravila i njihove primjene u praksi.',
  'Analiza polazi od pretpostavke da su kriteriji oblikovanja mjerljivi i provjerljivi.',
  'U nastavku se razmatraju metodoloska ogranicenja koja proizlaze iz odabranog pristupa.',
  'Prikupljeni pokazatelji uredjeni su prema razini opcenitosti, od opceg prema posebnom.',
  'Time se otvara pitanje koliko su dobiveni rezultati prenosivi na srodne slucajeve.',
  'Rasprava se oslanja na pojmovni okvir izlozen u prethodnom odjeljku.',
  'Vazno je razlikovati opisnu razinu izlaganja od normativne razine ocjene.',
  'Postupak je opisan tako da ga je moguce ponoviti pod istim uvjetima.',
  'Odstupanja koja se pojavljuju tumace se u odnosu na polazne kriterije.',
  'Zakljucni dio poglavlja sazima nalaze i najavljuje sljedeci korak izlaganja.',
  'Struktura izlaganja slijedi uobicajen redoslijed uvodnog, sredisnjeg i zavrsnog dijela.',
  'Pojmovi se uvode postupno kako bi izlaganje ostalo razumljivo i bez dodatnih objasnjenja.',
];

/**
 * IZMISLJENI bibliografski zapisi.
 *
 * Autori, naslovi i izdavaci ne postoje. Ista praksa kao kod postojecih generiranih fixtura
 * (`typografija-i-literatura`: "izmisljeni autori/naslovi/DOI-jevi"). Potrebni su da rad koji
 * tvrdi da je uskladjen doista prolazi provjere citiranja, umjesto da ih obara na prazno.
 */
const IZVORI = [
  { prezime: 'Anić', inicijal: 'A.', godina: 2019, naslov: 'Uvod u analizu javnih politika', mjesto: 'Zagreb', izdavac: 'Naklada Prva' },
  { prezime: 'Barić', inicijal: 'B.', godina: 2020, naslov: 'Metodologija drustvenih istrazivanja', mjesto: 'Split', izdavac: 'Druga naklada' },
  { prezime: 'Cvitan', inicijal: 'C.', godina: 2021, naslov: 'Institucije i postupci odlucivanja', mjesto: 'Rijeka', izdavac: 'Treca naklada' },
  { prezime: 'Dukić', inicijal: 'D.', godina: 2018, naslov: 'Usporedna analiza upravnih sustava', mjesto: 'Osijek', izdavac: 'Cetvrta naklada' },
  { prezime: 'Erceg', inicijal: 'E.', godina: 2022, naslov: 'Kvalitativni pristupi u politologiji', mjesto: 'Zadar', izdavac: 'Peta naklada' },
  { prezime: 'Fabijanić', inicijal: 'F.', godina: 2017, naslov: 'Javne politike i evaluacija ucinaka', mjesto: 'Pula', izdavac: 'Sesta naklada' },
];

/** Zapis literature u FPZG autor-godina obliku. */
function bibliografija() {
  return IZVORI.map((x) => `${x.prezime}, ${x.inicijal} (${x.godina}). ${x.naslov}. ${x.mjesto}: ${x.izdavac}.`);
}

/** Citat u tekstu, autor-godina. */
function citat(i) {
  const x = IZVORI[i % IZVORI.length];
  return `(${x.prezime}, ${x.godina})`;
}

/** Odlomak od nekoliko recenica; `seed` cini izbor deterministicnim (isti ulaz, isti izlaz). */
function odlomak(seed, withCitation = false) {
  const n = 4 + (seed % 3);
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(RECENICE[(seed * 7 + i * 5) % RECENICE.length]);
  if (withCitation) {
    const s = out[0].replace(/\.$/, '');
    out[0] = `${s} ${citat(seed)}.`;
  }
  return out.join(' ');
}

/** Priblizan broj rijeci jednog odlomka, za pogadjanje opsega. */
const RIJECI_PO_ODLOMKU = 60;

function paragraphs(count, styleName, seedBase, { cite = false } = {}) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    // Citat ide u PRVI odlomak odjeljka, kao u stvarnom radu (tvrdnja pa uporiste).
    out.push(`   <text:p text:style-name="${styleName}">${esc(odlomak(seedBase + i, cite && i === 0))}</text:p>`);
  }
  return out.join('\n');
}

/**
 * Naslovnica: izmisljeni podaci, centrirani, s prijelomom stranice na kraju.
 *
 * Bez nje `title.elements` pada i "uskladjen" rad zapravo nije uskladjen, pa ne bi mogao
 * sluziti kao kontrola protiv laznih pozitiva.
 */
function titlePage(lines) {
  const body = lines
    .map((l) => `   <text:p text:style-name="Naslovnica">${esc(l)}</text:p>`)
    .join('\n');
  return `${body}\n   <text:p text:style-name="PrijelomStranice"/>`;
}

/**
 * Flat ODF dokument.
 *
 * Prored, font, velicina i poravnanje idu u `style:default-style` (family="paragraph"), jer
 * LibreOffice odatle izvodi `docDefaults` u DOCX-u. Stranica i margine idu u `style:page-layout`.
 */
function fodt({ rules, headings, bodyParagraphsPerSection, withToc, seed = 1, overrides = {}, titleLines = null }) {
  const font = overrides.font ?? (Array.isArray(rules.font) ? rules.font[0] : 'Times New Roman');
  const sizePt = overrides.sizePt ?? (Array.isArray(rules.size) ? rules.size[0] : 12);
  const lineHeightPct = Math.round((overrides.spacing ?? rules.spacing ?? 1.5) * 100);
  const align = overrides.align ?? (rules.justify ? 'justify' : 'start');
  const m = overrides.margins ?? rules.margins ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
  const pageW = overrides.pageWidthCm ?? 21;
  const pageH = overrides.pageHeightCm ?? 29.7;

  const toc = withToc
    ? `   <text:table-of-content text:protected="true" text:name="Sadrzaj">
    <text:table-of-content-source text:outline-level="3" text:use-outline-level="true">
     <text:index-title-template text:style-name="Contents_20_Heading">Sadržaj</text:index-title-template>
     <text:table-of-content-entry-template text:outline-level="1" text:style-name="Contents_20_1">
      <text:index-entry-chapter/><text:index-entry-text/><text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/>
     </text:table-of-content-entry-template>
     <text:table-of-content-entry-template text:outline-level="2" text:style-name="Contents_20_2">
      <text:index-entry-chapter/><text:index-entry-text/><text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/>
     </text:table-of-content-entry-template>
    </text:table-of-content-source>
    <text:index-body>
     <text:index-title text:name="Sadrzaj_Head"><text:p text:style-name="Contents_20_Heading">Sadržaj</text:p></text:index-title>
    </text:index-body>
   </text:table-of-content>`
    : '';

  const sections = headings
    .map((h, i) => {
      const level = h.level ?? 1;
      const heading = `   <text:h text:style-name="Heading_20_${level}" text:outline-level="${level}">${esc(h.title)}</text:h>`;
      if (h.kind === 'bibliography') {
        // Stvarni zapisi, ne ispuna: inace `reference.completeness` pada i "uskladjen" rad nije uskladjen.
        const items = bibliografija()
          .map((z) => `   <text:p text:style-name="Text_20_body">${esc(z)}</text:p>`)
          .join('\n');
        return `${heading}\n${items}`;
      }
      const count = h.paragraphs ?? bodyParagraphsPerSection;
      return `${heading}\n${paragraphs(count, 'Text_20_body', seed + i * 13, { cite: h.cite === true })}`;
    })
    .join('\n');

  const naslovnica = titleLines && titleLines.length ? titlePage(titleLines) : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
 <office:font-face-decls>
  <style:font-face style:name="${esc(font)}" svg:font-family="&apos;${esc(font)}&apos;" style:font-pitch="variable"/>
 </office:font-face-decls>
 <office:styles>
  <style:default-style style:family="paragraph">
   <style:paragraph-properties fo:line-height="${lineHeightPct}%" fo:text-align="${align}" style:justify-single-word="false" fo:orphans="2" fo:widows="2"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt}pt" fo:language="hr" fo:country="HR"/>
  </style:default-style>
  <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
  <style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text">
   <style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.212cm" fo:line-height="${lineHeightPct}%" fo:text-align="${align}"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt}pt"/>
  </style:style>
  <style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text">
   <style:paragraph-properties fo:margin-top="0.423cm" fo:margin-bottom="0.212cm" fo:keep-with-next-page="always" fo:text-align="start"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt + 2}pt" fo:font-weight="bold"/>
  </style:style>
  <style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:class="text" style:default-outline-level="1">
   <style:text-properties fo:font-size="${sizePt + 4}pt" fo:font-weight="bold" style:font-name="${esc(font)}"/>
  </style:style>
  <style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Heading" style:class="text" style:default-outline-level="2">
   <style:text-properties fo:font-size="${sizePt + 2}pt" fo:font-weight="bold" style:font-name="${esc(font)}"/>
  </style:style>
  <style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph" style:parent-style-name="Heading" style:class="index">
   <style:text-properties fo:font-size="${sizePt + 4}pt" fo:font-weight="bold"/>
  </style:style>
  <style:style style:name="Contents_20_1" style:display-name="Contents 1" style:family="paragraph" style:parent-style-name="Standard" style:class="index"/>
  <style:style style:name="Contents_20_2" style:display-name="Contents 2" style:family="paragraph" style:parent-style-name="Standard" style:class="index"/>
  <style:style style:name="Naslovnica" style:family="paragraph" style:parent-style-name="Standard" style:class="text">
   <style:paragraph-properties fo:text-align="center" fo:margin-top="0.2cm" fo:margin-bottom="0.2cm" fo:line-height="150%"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt}pt"/>
  </style:style>
  <style:style style:name="PrijelomStranice" style:family="paragraph" style:parent-style-name="Standard" style:class="text">
   <style:paragraph-properties fo:break-after="page"/>
  </style:style>
  <style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard" style:class="extra">
   <style:paragraph-properties fo:text-align="center"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt}pt"/>
  </style:style>
 </office:styles>
 <office:automatic-styles>
  <style:page-layout style:name="pm1">
   <style:page-layout-properties fo:page-width="${pageW}cm" fo:page-height="${pageH}cm" style:print-orientation="portrait" fo:margin-top="${m.top}cm" fo:margin-bottom="${m.bottom}cm" fo:margin-left="${m.left}cm" fo:margin-right="${m.right}cm" style:writing-mode="lr-tb"/>
   <style:footer-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-top="0.5cm"/></style:footer-style>
  </style:page-layout>
 </office:automatic-styles>
 <office:master-styles>
  <style:master-page style:name="Standard" style:page-layout-name="pm1">
   <style:footer>
    <text:p text:style-name="Footer"><text:page-number text:select-page="current">1</text:page-number></text:p>
   </style:footer>
  </style:master-page>
 </office:master-styles>
 <office:body>
  <office:text>
${naslovnica}
${toc}
${sections}
  </office:text>
 </office:body>
</office:document>
`;
}

/** Naslovi koji zadovoljavaju `requiredSections` FPZG profila plus tijelo rada. */
function fpzgHeadings(bodyChapters) {
  const out = [
    { title: 'Sažetak', level: 1, paragraphs: 2 },
    { title: 'Ključne riječi', level: 1, paragraphs: 1 },
    { title: 'Uvod', level: 1, cite: true },
  ];
  for (let i = 1; i <= bodyChapters; i += 1) {
    out.push({ title: `${i}. Analitički okvir, dio ${i}`, level: 1, cite: true });
    out.push({ title: `${i}.1. Pojmovno razgraničenje`, level: 2, cite: true });
  }
  out.push({ title: 'Zaključak', level: 1 });
  out.push({ title: 'Literatura', level: 1, kind: 'bibliography' });
  return out;
}

/**
 * Naslovnica zavrsnog rada. Svi podaci su IZMISLJENI (ustanova, autor i mentor ne postoje);
 * sluze samo tome da `title.elements` ima sto prepoznati.
 */
const NASLOVNICA_FPZG = [
  'Sveučilište u Zagrebu',
  'Fakultet političkih znanosti',
  'Prijediplomski studij Politologija',
  '',
  'Ana Anić',
  '',
  'Formalni kriteriji oblikovanja akademskih radova',
  '',
  'ZAVRŠNI RAD',
  '',
  'Mentor: doc. dr. sc. Ivan Ivić',
  '',
  'Zagreb, 2026.',
];

/** Koliko odlomaka po odjeljku treba da rad udje u trazeni raspon rijeci. */
function paragraphsForWordTarget(headings, targetWords) {
  const flexible = headings.filter((h) => h.paragraphs == null).length || 1;
  const fixedWords = headings.filter((h) => h.paragraphs != null).reduce((t, h) => t + h.paragraphs * RIJECI_PO_ODLOMKU, 0);
  return Math.max(2, Math.ceil((targetWords - fixedWords) / (flexible * RIJECI_PO_ODLOMKU)));
}

const FPZG = 'fpzg-politologija-zavrsni';

export const SCENARIOS = [
  {
    id: 'lo-fpzg-zavrsni-uskladjen',
    profileId: FPZG,
    role: 'uskladjen',
    describe: 'uskladjen s profilom (TNR 12, prored 1,5, obostrano, A4, 2,5 cm), sa sadrzajem',
    build() {
      const rules = rulesFor(FPZG);
      const headings = fpzgHeadings(6);
      return fodt({
        rules,
        headings,
        bodyParagraphsPerSection: paragraphsForWordTarget(headings, (rules.wordMin ?? 5000) + 900),
        withToc: true,
        seed: 3,
        titleLines: NASLOVNICA_FPZG,
      });
    },
  },
  {
    id: 'lo-fpzg-zavrsni-neuskladjen',
    profileId: FPZG,
    role: 'neuskladjen',
    describe: 'prekrsen font/velicina/prored/poravnanje/margine/format stranice, bez sadrzaja',
    build() {
      const rules = rulesFor(FPZG);
      const headings = fpzgHeadings(4);
      return fodt({
        rules,
        headings,
        bodyParagraphsPerSection: paragraphsForWordTarget(headings, 3000),
        withToc: false,
        seed: 11,
        overrides: {
          font: 'Arial',
          sizePt: 11,
          spacing: 1,
          align: 'start',
          margins: { top: 2, right: 2, bottom: 2, left: 2 },
          pageWidthCm: 21.59,
          pageHeightCm: 27.94,
        },
      });
    },
  },
];
