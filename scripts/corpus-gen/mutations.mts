/**
 * KATALOG STUDENTSKE NEUREDNOSTI: zahvati nad IZVOROM prije nego ga alat spremi.
 *
 * Zasto nad izvorom, a ne nad gotovim .docx-om. Kad neurednost upisemo u Flat ODF pa pustimo pravi
 * LibreOffice da ga spremi, rezultat nosi i ono sto alat doda SAM OD SEBE (imena stilova, tab stopove,
 * zastavice zipa). Naknadno krpanje gotovog paketa daje dokument kakav nijedan alat ne proizvodi, a
 * upravo je takav "svjedok" 2026-08-23 bio lazan: rucno pisani `synthetic-libreoffice-standard-default`
 * tvrdio je da LibreOffice pise `Standard`, a stvarni pise `Normal`.
 *
 * SVAKA MUTACIJA NOSI BROJAC. Brojac na nuli znaci mrtav mehanizam, ma sto nizvodna mjera pokazivala
 * (CLAUDE.md, "mehanizam mora imati vlastiti brojac"); zato `apply` vraca koliko je mjesta stvarno
 * promijenio, a `shape` kaze koji se oblik u gotovom paketu mora pojaviti. Gard poslije usporedjuje
 * brojac s onim sto `detectShapes` nadje u IZLAZU, pa mutacija koja se "primijenila" a nije prezivjela
 * pretvorbu pada, umjesto da tiho prodje.
 */
import type { DocxShapeId } from '../../src/corpus/docx-shapes';

export interface MutationResult {
  fodt: string;
  count: number;
}

export interface Mutation {
  id: string;
  /** Oblik koji se MORA pojaviti u gotovom .docx-u; veza brojaca i mjerenja. */
  shape: DocxShapeId;
  /** Sto oponasa i na kojem je stvarnom nalazu izmjereno. */
  why: string;
  apply(fodt: string): MutationResult;
}

/** Zamijeni najvise `limit` pojava i prebroji ih. */
function replaceCounted(input: string, re: RegExp, fn: (m: RegExpMatchArray) => string, limit = Infinity): MutationResult {
  let count = 0;
  const fodt = input.replace(re, (...args) => {
    const m = args.slice(0, -2) as unknown as RegExpMatchArray;
    if (count >= limit) return m[0];
    count += 1;
    return fn(m);
  });
  return { fodt, count };
}

export const MUTATIONS: Mutation[] = [
  {
    id: 'tabInHeading',
    shape: 'naslov/tab-u-naslovu',
    why:
      'razmak iza broja naslova utipkan kao TABULATOR ("1.<tab>UVOD"). Izmjereno na 32 od 38 stvarnih ' +
      'radova i 0 od 19 commitanih fixtura; rusio je cijeli zahtjev za format naslova, jer se sidro ' +
      'gradilo iz teksta parsera (s `\\t`) a izvlacenje je citalo samo `<w:t>`',
    apply: (fodt) =>
      replaceCounted(fodt, /(<text:h\b[^>]*>)((?:\d+\.)+)\s+/g, (m) => `${m[1]}${m[2]}<text:tab/>`),
  },
  {
    id: 'emptyParagraphBurst',
    shape: 'opseg/prazni-preko-20',
    why:
      'prazni odlomci umjesto razmaka prije naslova; 34 od 38 stvarnih radova ima vise od 20, a nijedna ' +
      'od 12 commitanih fixtura nema nijedan',
    apply(fodt) {
      const poNaslovu = 6;
      const prazni = Array.from({ length: poNaslovu }, () => '   <text:p text:style-name="Text_20_body"/>').join('\n');
      const res = replaceCounted(fodt, /(<text:h\b[^>]*>)/g, (m) => `${prazni}\n${m[1]}`, 5);
      // Brojac je broj UMETNUTIH praznih odlomaka, ne broj dirnutih naslova: usporedjuje se s
      // `detectShapes`, koji broji prazne odlomke, pa mjere moraju biti u istoj jedinici.
      return { fodt: res.fodt, count: res.count * poNaslovu };
    },
  },
  {
    id: 'manualToc',
    shape: 'toc/rucno-tipkan',
    why:
      'sadrzaj utipkan rukom, s tabulatorom i brojem stranice, umjesto zivog polja. To je stanje u kojem ' +
      '`toc-field-fixer` uopce ima sto raditi; commitani Word fixture `manual-toc.docx` ga ima, ali nijedan ' +
      'dokument s realnim opsegom',
    apply(fodt) {
      const stavke = ['1. Uvod\t3', '2. Razrada\t7', '2.1. Pojmovni okvir\t9', '3. Zakljucak\t21', 'Literatura\t23']
        .map((s) => {
          const [naslov, str] = s.split('\t');
          return `   <text:p text:style-name="Text_20_body">${naslov}<text:tab/>${str}</text:p>`;
        })
        .join('\n');
      // Zivi indeks se UKLANJA, inace dokument ima i polje i rucni popis, sto nije stanje koje se oponasa.
      const bezIndeksa = fodt.replace(/ {3}<text:table-of-content[\s\S]*?<\/text:table-of-content>\n?/g, '');
      const sNaslovom = `   <text:h text:style-name="Heading_20_1" text:outline-level="1">Sadržaj</text:h>\n${stavke}\n`;
      const marker = '<office:text>';
      const idx = bezIndeksa.indexOf(marker);
      if (idx < 0) return { fodt: bezIndeksa, count: 0 };
      const kraj = idx + marker.length;
      // Brojac je 1, jer `toc/rucno-tipkan` je zastavica (naslov Sadrzaj bez polja), ne broj stavki.
      return { fodt: `${bezIndeksa.slice(0, kraj)}\n${sNaslovom}${bezIndeksa.slice(kraj)}`, count: 1 };
    },
  },
  {
    id: 'dotLeaderTabs',
    shape: 'tab/tocke-vodic',
    why:
      'tab stop s tockastom vodilicom, kakav Word sam upise pri spremanju. Izmjereno na 6 od 38 stvarnih ' +
      'radova i 0 od 19 commitanih; popravljeni paket s pokvarenim tab stopom Word ODBIJA otvoriti',
    apply(fodt) {
      const stil =
        '  <style:style style:name="SVodilicom" style:family="paragraph" style:parent-style-name="Standard">\n' +
        '   <style:paragraph-properties><style:tab-stops>' +
        '<style:tab-stop style:position="16cm" style:type="right" style:leader-style="dotted" style:leader-text="."/>' +
        '</style:tab-stops></style:paragraph-properties>\n  </style:style>\n';
      if (!fodt.includes('</office:styles>')) return { fodt, count: 0 };
      const sStilom = fodt.replace('</office:styles>', `${stil} </office:styles>`);
      // Zamjena je FUNKCIJA, pa se `$1` ne bi interpolirao nego upisao doslovno; grupa se zato
      // ugradjuje iz `m[1]`. Isti razred kao escape izgubljen u regexu gradjenom kroz alat.
      const res = replaceCounted(
        sStilom,
        /text:style-name="Text_20_body"(>)/g,
        (m) => `text:style-name="SVodilicom"${m[1]}`,
        3,
      );
      // BROJAC JE 1, ne broj odlomaka. Izmjereno 2026-09-06: LibreOffice vodilicu zapise JEDNOM, u
      // definiciji stila, a odlomci se na nju samo pozivaju; brojac 3 je zato javljao vise nego sto
      // izlaz moze nositi i gard ga je oborio. Odlomci svejedno moraju postojati, jer neiskoristen
      // stil alat izbaci, pa bi oblika nestalo.
      return { fodt: res.fodt, count: res.count > 0 ? 1 : 0 };
    },
  },
  {
    id: 'csOnlyFonts',
    shape: 'font/samo-cs-eastAsia',
    why:
      'runovi kojima je zadan samo slozeni (complex) font, bez zapadnog. Analiza ih je pripisivala latinici ' +
      'i obarala uskladjen rad; na jednom stvarnom radu to je bilo 57 posto teksta',
    apply(fodt) {
      // Font za slozeno pismo mora biti DEKLARIRAN, inace ga LibreOffice tiho odbaci. Izmjereno
      // 2026-09-06 na prvom prolazu: bez deklaracije je izlaz imao NULA `w:rFonts`, a stil je prezivio
      // samo kao `<w:szCs>`. Brojac je tada javio 4, a mjerenje nad izlazom 0, i gard je to uhvatio.
      const deklaracija =
        ' <office:font-face-decls>\n' +
        '  <style:font-face style:name="ArialCS" svg:font-family="Arial" style:font-family-generic="swiss" style:font-pitch="variable"/>\n' +
        ' </office:font-face-decls>\n';
      // Stil ide u AUTOMATSKE stilove, ne u imenovane. Izmjereno 2026-09-06: imenovani stil
      // LibreOffice zapise u `word/styles.xml`, pa run u `document.xml` ostaje bez `w:rFonts` i
      // oblika nema ondje gdje ga motor trazi. Automatski stil je u ODF-u izravno oblikovanje i
      // zavrsi kao `w:rPr` u samom runu, sto je i oblik koji su stvarni radovi pokazali.
      const stil =
        '  <style:style style:name="SamoCS" style:family="text">\n' +
        '   <style:text-properties style:font-name-complex="ArialCS" style:font-size-complex="12pt"/>\n  </style:style>\n';
      if (!fodt.includes('</office:automatic-styles>')) return { fodt, count: 0 };
      // Deklarira se NAS font, ne provjerava se postoji li BILO KAKAV blok. Izmjereno 2026-09-06:
      // cim je graditelj dobio vlastiti `font-face-decls` (za profilni font), uvjet "blok postoji"
      // preskocio je deklaraciju ArialCS-a i mutacija je opet umrla. Postojanje bloka nije isto sto
      // i postojanje FONTA u njemu.
      const licePisma =
        '  <style:font-face style:name="ArialCS" svg:font-family="Arial" style:font-family-generic="swiss" style:font-pitch="variable"/>\n';
      const sDeklaracijom = fodt.includes('style:name="ArialCS"')
        ? fodt
        : fodt.includes('<office:font-face-decls>')
          ? fodt.replace('</office:font-face-decls>', `${licePisma} </office:font-face-decls>`)
          : fodt.replace(' <office:styles>', `${deklaracija} <office:styles>`);
      const sStilom = sDeklaracijom.replace('</office:automatic-styles>', `${stil} </office:automatic-styles>`);
      // Prag je 10 znakova, ne 30: s pragom 30 mutacija je bila MRTVA na kratkim odlomcima i vracala
      // brojac 0, sto je gard uhvatio. Duljina odlomka nije svojstvo oblika koji se oponasa.
      return replaceCounted(
        sStilom,
        /(<text:p text:style-name="Text_20_body">)([^<]{10,80})/g,
        (m) => `${m[1]}<text:span text:style-name="SamoCS">${m[2]}</text:span>`,
        4,
      );
    },
  },
  {
    id: 'biblioAsHeading',
    shape: 'tekst/biblio-kandidat',
    why:
      'numerirani zapis literature koji izgleda kao poglavlje ("8. Lezaic A. ..."). Popravak je jednom ' +
      'takvom zapisu doista upisao Heading1 na stvarnom radu, pa je zapis usao u sadrzaj i u hijerarhiju',
    apply(fodt) {
      const zapisi = [
        '8. Lezaic A. Komunikacija u zdravstvenom timu. Sestrinski glasnik. 2019;24(2):101-108.',
        '9. Maric B. Metodoloski pristupi u drustvenim istrazivanjima. Zbornik radova. 2021;12(4):55-71.',
      ]
        .map((z) => `   <text:p text:style-name="Text_20_body">${z}</text:p>`)
        .join('\n');
      const marker = '</office:text>';
      if (!fodt.includes(marker)) return { fodt, count: 0 };
      return { fodt: fodt.replace(marker, `${zapisi}\n  ${marker}`), count: 2 };
    },
  },
  {
    id: 'commentsPart',
    shape: 'paket/komentari',
    why:
      'komentari mentora ostavljeni u dokumentu. Nijedna commitana fixtura nema `word/comments.xml`, a ' +
      '`final-document-inspector-fixer` ga uklanja, sto je 2026-09-05 dalo 15 od 95 "fail" ishoda',
    apply(fodt) {
      const biljeska =
        '<office:annotation><dc:creator>Mentor</dc:creator>' +
        '<text:p>Provjeri ovaj odlomak prije predaje.</text:p></office:annotation>';
      return replaceCounted(fodt, /(<text:p text:style-name="Text_20_body">)/g, (m) => `${m[1]}${biljeska}`, 2);
    },
  },
  {
    // IDE ZADNJI, i to je izmjereno, ne stilski. `manualToc` umece naslov "Sadrzaj" na razini 1; kad
    // je ova mutacija stajala prije njega, izlaz je imao 20 naslova razine 3 i JEDAN razine 1, pa
    // oblik (koji trazi nula roditelja) nije nastao. Brojac je javljao 20, mjerenje nad izlazom 0.
    id: 'allLevelThree',
    shape: 'naslov/samo-razina-3',
    why:
      'svi naslovi na razini 3 bez ijednog roditelja; hijerarhija tada prolazi VAKUUMSKI (6/6) sve dok ' +
      'popravak ne doda pravu razinu 1. Izmjereno na stvarnom radu corpus-0221',
    apply: (fodt) =>
      replaceCounted(fodt, /<text:h text:style-name="Heading_20_(\d)" text:outline-level="\d"/g, () =>
        '<text:h text:style-name="Heading_20_3" text:outline-level="3"',
      ),
  },
];

/** Mutacija po id-u; nepoznat id je greska, ne tiho preskakanje. */
export function mutationById(id: string): Mutation {
  const m = MUTATIONS.find((x) => x.id === id);
  if (!m) throw new Error(`Nepoznata mutacija: ${id}. Poznate: ${MUTATIONS.map((x) => x.id).join(', ')}`);
  return m;
}

/**
 * Primijeni niz mutacija i vrati brojace.
 *
 * Brojac 0 se NE presucuje: vraca se kakav jest, da ga gard moze prijaviti kao mrtav mehanizam.
 */
export function applyMutations(fodt: string, ids: readonly string[]): { fodt: string; counters: Record<string, number> } {
  let out = fodt;
  const counters: Record<string, number> = {};
  for (const id of ids) {
    const m = mutationById(id);
    const res = m.apply(out);
    out = res.fodt;
    counters[id] = res.count;
  }
  return { fodt: out, counters };
}

/** Preslikavanje mutacija na oblike; ulaz za `verifyShapeClaims`. */
export function shapeForMutation(): Record<string, DocxShapeId> {
  return Object.fromEntries(MUTATIONS.map((m) => [m.id, m.shape]));
}
