/**
 * PROZA + PRAVILA PROFILA -> Flat ODF, ulaz za PRAVI LibreOffice.
 *
 * Podjela posla koja se ne smije pomijesati:
 *   proza (tekst)      pise se izvan pipelinea i ulazi kao podatak (`src/corpus/prose-schema.ts`);
 *   OBLIK (font, prored, margine, format, sadrzaj, numeracija)  dolazi ISKLJUCIVO iz Lektinih
 *                      pravila profila (`data/profiles/**`), nikad iz alata kojim je proza napisana.
 *
 * Ta granica nije stilska. Korpus postoji da bi mjerio slaze li se dokument s pravilom FAKULTETA;
 * kad bi oblik dolazio iz istog izvora kao tekst, mjerilo bi samo samo sebe.
 *
 * Zasto Flat ODF, a ne izravno .docx: dokument spremi PRAVI `soffice`, pa paket nosi i ono sto alat
 * doda sam (imena stilova, DEFLATE, zastavice zipa, `docProps/app.xml`). Rucno sastavljen paket to
 * ne moze, a upravo je rucni "LibreOffice svjedok" 2026-08-23 tvrdio nesto sto stvarni alat ne radi.
 */
import type { ProseBody } from '../../src/corpus/prose-schema';

const XML_ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => XML_ESC[c]);

/** Najmanja valjana PNG slika (1x1, prozirna); dovoljna da paket dobije `word/media`. */
const PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export interface ProfileRules {
  font?: string[];
  size?: number[];
  spacing?: number;
  margins?: { top: number; right: number; bottom: number; left: number };
  paperSizes?: string[];
  justify?: boolean;
  requireToc?: boolean;
  requirePageNumbers?: boolean;
  requiredSections?: Array<{ key?: string; label?: string; terms?: string[] }>;
}

/**
 * Treba li dokument sadrzaj.
 *
 * NIJE dovoljno gledati `requireToc`. Izmjereno 2026-09-07 na `effectus-seminarski`: profil ima
 * `requireToc: false`, ali u `requiredSections` trazi dio "sadrzaj". Da se gledala samo prva
 * zastavica, dokument bi ispao bez sadrzaja i pao na obveznim dijelovima, a uzrok bi izgledao kao
 * kvar motora umjesto kao propust graditelja. Dvije zastavice govore o dvije stvari: prva o ZIVOM
 * POLJU, druga o postojanju DIJELA.
 */
function needsToc(rules: ProfileRules): boolean {
  if (rules.requireToc !== false) return true;
  return (rules.requiredSections ?? []).some((s) =>
    [s.key, s.label, ...(s.terms ?? [])]
      .filter(Boolean)
      .some((t) => /sadr[zž]aj|contents/i.test(String(t))),
  );
}

/** Format stranice u centimetrima; A4 je zadan jer ga trazi vecina profila. */
function pageSize(rules: ProfileRules): { w: number; h: number } {
  const name = (rules.paperSizes ?? ['A4'])[0];
  if (/letter/i.test(name)) return { w: 21.59, h: 27.94 };
  if (/a5/i.test(name)) return { w: 14.8, h: 21 };
  return { w: 21, h: 29.7 };
}

function styleBlock(rules: ProfileRules): string {
  const font = rules.font?.[0] ?? 'Times New Roman';
  const sizePt = rules.size?.[0] ?? 12;
  const lineHeight = Math.round((rules.spacing ?? 1.5) * 100);
  const align = rules.justify ? 'justify' : 'start';
  return `  <style:default-style style:family="paragraph">
   <style:paragraph-properties fo:line-height="${lineHeight}%" fo:text-align="${align}" style:justify-single-word="false" fo:orphans="2" fo:widows="2"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt}pt" fo:language="hr" fo:country="HR"/>
  </style:default-style>
  <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
  <style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text">
   <style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.212cm" fo:line-height="${lineHeight}%" fo:text-align="${align}"/>
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
  <style:style style:name="Heading_20_3" style:display-name="Heading 3" style:family="paragraph" style:parent-style-name="Heading" style:class="text" style:default-outline-level="3">
   <style:text-properties fo:font-size="${sizePt + 1}pt" fo:font-weight="bold" style:font-name="${esc(font)}"/>
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
  <style:style style:name="Natpis" style:family="paragraph" style:parent-style-name="Standard" style:class="text">
   <style:paragraph-properties fo:text-align="center" fo:margin-top="0.2cm" fo:margin-bottom="0.4cm"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt - 1}pt" fo:font-style="italic"/>
  </style:style>
  <style:style style:name="PrijelomStranice" style:family="paragraph" style:parent-style-name="Standard" style:class="text">
   <style:paragraph-properties fo:break-after="page"/>
  </style:style>
  <style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard" style:class="extra">
   <style:paragraph-properties fo:text-align="center"/>
   <style:text-properties style:font-name="${esc(font)}" fo:font-size="${sizePt}pt"/>
  </style:style>`;
}

function tocBlock(): string {
  return `   <text:table-of-content text:protected="true" text:name="Sadrzaj">
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
   </text:table-of-content>`;
}

/**
 * Redak izvora ispod prikaza.
 *
 * Provjera `element.source` trazi odlomak koji POCINJE s "Izvor:" ili "Source:", jedan po prikazu
 * (`sourceLines >= tables + images`). Prefiks se zato pise ovdje, a ne prepusta prozi: tekst iza
 * dvotocke je autorov, oblik retka je struktura.
 */
function sourceLine(text: string): string {
  const clean = String(text).replace(/^\s*(izvor|source)\s*:\s*/i, '');
  return `   <text:p text:style-name="Natpis">Izvor: ${esc(clean)}</text:p>`;
}

function tableBlock(t: { n: number; caption: string; rows: string[][]; source: string }): string {
  const cols = Math.max(1, ...t.rows.map((r) => r.length));
  const redci = t.rows
    .map(
      (r) =>
        `    <table:table-row>${r
          .map((c) => `<table:table-cell office:value-type="string"><text:p>${esc(c)}</text:p></table:table-cell>`)
          .join('')}</table:table-row>`,
    )
    .join('\n');
  // Natpis IZNAD tablice, kako propisuje vecina hrvatskih uputa.
  return `   <text:p text:style-name="Natpis">${esc(t.caption)}</text:p>
   <table:table table:name="Tablica${t.n}">
    <table:table-column table:number-columns-repeated="${cols}"/>
${redci}
   </table:table>
${sourceLine(t.source)}`;
}

function figureBlock(f: { n: number; caption: string; source: string }): string {
  return `   <text:p text:style-name="Text_20_body">
    <draw:frame draw:name="Slika${f.n}" text:anchor-type="as-char" svg:width="4cm" svg:height="3cm">
     <draw:image><office:binary-data>${PIXEL_PNG_BASE64}</office:binary-data></draw:image>
    </draw:frame>
   </text:p>
   <text:p text:style-name="Natpis">${esc(f.caption)}</text:p>
${sourceLine(f.source)}`;
}

/**
 * Popisi prikaza ("Popis tablica", "Popis slika").
 *
 * Provjera `element.lists` trazi SEKCIJU s tim imenom kad dokument ima prikaze, a profil to propisuje.
 * Ovo je struktura koju u stvarnom radu generira uredjivac, ne autor, pa ide u graditelja, ne u prozu.
 * Stavke se izvode iz natpisa koje proza vec nosi; nista se ne izmislja.
 */
function elementListsBlock(
  tables: Array<{ n: number; caption: string }>,
  figures: Array<{ n: number; caption: string }>,
): string {
  const blokovi: string[] = [];
  if (tables.length) {
    blokovi.push(
      '   <text:h text:style-name="Heading_20_1" text:outline-level="1">Popis tablica</text:h>',
      ...tables.map((t) => `   <text:p text:style-name="Text_20_body">${esc(t.caption)}</text:p>`),
    );
  }
  if (figures.length) {
    blokovi.push(
      '   <text:h text:style-name="Heading_20_1" text:outline-level="1">Popis slika</text:h>',
      ...figures.map((f) => `   <text:p text:style-name="Text_20_body">${esc(f.caption)}</text:p>`),
    );
  }
  return blokovi.join('\n');
}

/** Fusnota kao inline biljeska; pravna obitelj bez njih ne moze mjeriti citatni motor. */
function footnoteInline(n: number, text: string): string {
  return (
    `<text:note text:id="ftn${n}" text:note-class="footnote">` +
    `<text:note-citation>${n}</text:note-citation>` +
    `<text:note-body><text:p text:style-name="Text_20_body">${esc(text)}</text:p></text:note-body>` +
    `</text:note>`
  );
}

export interface BuildOptions {
  /** Redci naslovnice; dolaze iz Lektina predloska (`data/title-pages`), ne iz proze. */
  titleLines: string[];
  rules: ProfileRules;
}

/**
 * Sastavi Flat ODF iz proze i pravila.
 *
 * Fusnote se raspodjeljuju po prvim odlomcima tijela, jer fusnota koja visi na kraju dokumenta nije
 * ono sto motor mjeri: on gleda gdje je oznaka u tekstu.
 */
/**
 * Dijeli li rad na VISE SEKCIJA (u Wordu vise `<w:sectPr>`).
 *
 * Zasto samo doktorski i specijalisticki: oblik `opseg/sekcije-preko-3` postoji jer ga nosi 7 od 38
 * STVARNIH radova, i to su redom dugi radovi kojima predtekst ide rimskom numeracijom, tijelo
 * arapskom, a prilozi opet svojom. Kratak zavrsni rad u stvarnosti ima jednu sekciju, pa bi
 * bezuvjetno dijeljenje proizvelo dokument koji ne slici nicemu, i usput promijenilo svih jedanaest
 * vec commitanih primjeraka.
 *
 * Duljina teksta ovo NE moze postici: izmjereno na commitanim primjercima, svih jedanaest ima tocno
 * jednu sekciju bez obzira na opseg, jer sekcija nastaje iz stila stranice, ne iz broja odlomaka.
 */
function wantsSections(body: ProseBody): boolean {
  return body.workType === 'doctoral' || body.workType === 'specialist';
}

/**
 * Stilovi naslova koji uz sebe nose PROMJENU STILA STRANICE, cime u ODF-u pocinje nova sekcija.
 *
 * IME NE SMIJE POCETI S `Naslov<broj>`: detektor oblika razinu naslova cita iz IMENA stila
 * (`/^(?:Heading|Naslov)[\s_-]?(\d)/`), pa bi `Naslov1Predtekst` zauvijek bio razina 1 i mutacija
 * `allLevelThree` ga ne bi mogla spustiti. Izmjereno 2026-09-07: brojac 32, detektirano 0. S imenom
 * bez broja detektor pada na `<w:outlineLvl>`, koji LibreOffice za ove stilove uredno zapise.
 *
 * Nasljeduju `Heading_20_1`, pa naslov ostaje naslov: da smo umjesto toga umetnuli prazan odlomak
 * sa stilom stranice, dobili bismo sekciju ali izgubili outline razinu, a usput hranili oblik
 * `opseg/prazni-preko-20` koji mjeri nesto drugo.
 */
const SEKCIJE = [
  { stil: 'SekcijaPredtekst', stranica: 'Predtekst' },
  { stil: 'SekcijaTijelo', stranica: 'Tijelo' },
  { stil: 'SekcijaPrilozi', stranica: 'Prilozi' },
] as const;

function sectionStyleBlock(): string {
  return SEKCIJE.map(
    (s) =>
      `  <style:style style:name="${s.stil}" style:family="paragraph" style:parent-style-name="Heading_20_1"` +
      ` style:master-page-name="${s.stranica}"/>`,
  ).join('\n');
}

function sectionMasterPages(footer: string): string {
  return SEKCIJE.map(
    (s) => `  <style:master-page style:name="${s.stranica}" style:page-layout-name="pm1">\n${footer}\n  </style:master-page>`,
  ).join('\n');
}

export function buildFodt(body: ProseBody, opts: BuildOptions): string {
  const { rules } = opts;
  const page = pageSize(rules);
  const m = rules.margins ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
  const sekcije = wantsSections(body);
  // Naslov koji zapocinje sekciju; bez sekcija ostaje obican `Heading_20_1`, pa se zatecen izlaz
  // ne mijenja ni za jedan bajt.
  const h1 = (i: 0 | 1 | 2): string => (sekcije ? SEKCIJE[i].stil : 'Heading_20_1');
  // Podnozje je izdvojeno jer ga dijele SVE stranice: da ga svaka nosila svoje, sekcije bi mogle
  // dobiti razlicitu numeraciju, sto bi bila izmisljena razlika a ne oblik koji mjerimo.
  const podnozje =
    rules.requirePageNumbers === false
      ? '   <style:footer><text:p text:style-name="Footer"/></style:footer>'
      : [
          '   <style:footer>',
          '    <text:p text:style-name="Footer"><text:page-number text:select-page="current">1</text:page-number></text:p>',
          '   </style:footer>',
        ].join('\n');

  // Prazan niz kad sekcija nema, pa je izlaz za zatecene radove BAJT-IDENTICAN starome. Vodeci
  // prijelom retka nosi sama vrijednost, jer bi ga predlozak inace ostavio kao prazan redak.
  const sekcijskiStilovi = sekcije ? `\n${sectionStyleBlock()}` : '';
  const sekcijskeStranice = sekcije ? `\n${sectionMasterPages(podnozje)}` : '';

  const naslovnica = opts.titleLines.length
    ? `${opts.titleLines
        .map((l) => `   <text:p text:style-name="Naslovnica">${esc(l)}</text:p>`)
        .join('\n')}\n   <text:p text:style-name="PrijelomStranice"/>`
    : '';

  const sazetak = [
    `   <text:h text:style-name="${h1(0)}" text:outline-level="1">Sažetak</text:h>`,
    `   <text:p text:style-name="Text_20_body">${esc(body.abstract.hr)}</text:p>`,
    `   <text:p text:style-name="Text_20_body">Ključne riječi: ${esc(body.keywords.hr.join(', '))}</text:p>`,
    '   <text:h text:style-name="Heading_20_1" text:outline-level="1">Abstract</text:h>',
    `   <text:p text:style-name="Text_20_body">${esc(body.abstract.en)}</text:p>`,
    `   <text:p text:style-name="Text_20_body">Keywords: ${esc(body.keywords.en.join(', '))}</text:p>`,
  ].join('\n');

  // Fusnote idu u prve odlomke; brojac je izvan petlje da numeracija tece kroz cijeli rad.
  let fusnotaIdx = 0;
  const poglavlja = body.chapters
    .map((ch, idx) => {
      const razina = Math.min(3, Math.max(1, ch.level));
      // Prvi naslov prve razine otvara sekciju TIJELA; ostali su obicni naslovi.
      const stilNaslova = idx === 0 && razina === 1 ? h1(1) : `Heading_20_${razina}`;
      const naslov = `   <text:h text:style-name="${stilNaslova}" text:outline-level="${razina}">${esc(ch.title)}</text:h>`;
      const odlomci = ch.paragraphs
        .map((p) => {
          const fus = fusnotaIdx < body.footnotes.length ? footnoteInline(fusnotaIdx + 1, body.footnotes[fusnotaIdx]) : '';
          if (fus) fusnotaIdx += 1;
          return `   <text:p text:style-name="Text_20_body">${esc(p)}${fus}</text:p>`;
        })
        .join('\n');
      return `${naslov}\n${odlomci}`;
    })
    .join('\n');

  const prikazi = [...body.tables.map(tableBlock), ...body.figures.map(figureBlock)].join('\n');
  const popisi = elementListsBlock(body.tables, body.figures);

  const literatura = [
    `   <text:h text:style-name="${h1(2)}" text:outline-level="1">Literatura</text:h>`,
    ...body.bibliography.map(
      (r, i) =>
        `   <text:p text:style-name="Text_20_body">${i + 1}. ${esc(r.text)}${r.doi ? ` https://doi.org/${esc(r.doi)}` : ''}</text:p>`,
    ),
  ].join('\n');

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
  <style:font-face style:name="${esc(rules.font?.[0] ?? 'Times New Roman')}" svg:font-family="&apos;${esc(rules.font?.[0] ?? 'Times New Roman')}&apos;" style:font-pitch="variable"/>
 </office:font-face-decls>
 <office:styles>
${styleBlock(rules)}${sekcijskiStilovi}
 </office:styles>
 <office:automatic-styles>
  <style:page-layout style:name="pm1">
   <style:page-layout-properties fo:page-width="${page.w}cm" fo:page-height="${page.h}cm" style:print-orientation="portrait" fo:margin-top="${m.top}cm" fo:margin-bottom="${m.bottom}cm" fo:margin-left="${m.left}cm" fo:margin-right="${m.right}cm" style:writing-mode="lr-tb"/>
   <style:footer-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-top="0.5cm"/></style:footer-style>
  </style:page-layout>
 </office:automatic-styles>
 <office:master-styles>
  <style:master-page style:name="Standard" style:page-layout-name="pm1">
${podnozje}
  </style:master-page>${sekcijskeStranice}
 </office:master-styles>
 <office:body>
  <office:text>
${naslovnica}
${needsToc(rules) ? tocBlock() : ''}
${sazetak}
${poglavlja}
${prikazi}
${popisi}
${literatura}
  </office:text>
 </office:body>
</office:document>
`;
}
