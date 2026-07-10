// src/repair/run-level.ts
//
// Feature B (placeni napredni popravak, v2): ciscenje IZRAVNOG formatiranja u
// tijelu dokumenta, da popravljeni docDefaults/Normal (fixers.ts) stvarno
// pobijedi. Vecina realnih radova ima direct formatting koji pregazi stilove,
// pa v1 popravak cesto vizualno ne promijeni nista; ovo uklanja te override-e.
//
// Semantika je NAMJERNO konzervativna (uklanjamo samo ono sto sigurno smijemo):
// - Obradjuju se odlomci tijela; PRESKACU se odlomci u tekstualnim okvirima
//   (w:txbxContent) i strukturiranim kontrolama/ugradjenim naslovnicama (w:sdt),
//   oboje balansirano prema ugnjezdenju; te odlomci sa stilom (w:pStyle)
//   razlicitim od "Normal": naslovi, citati, natpisi, popisi. Runovi koji
//   referenciraju znakovni stil (w:rStyle) se takodjer preskacu (font/velicina
//   im dolazi iz stila, ne iz Normal/docDefaults).
// - Formule (m:oMath) i povijest revizija (w:pPrChange/w:rPrChange) se prije
//   obrade MASKIRAJU: Cambria Math u jednadzbama i track-changes zapisi se
//   nikad ne diraju.
// - Font: uklanjaju se SAMO w:ascii/w:hAnsi (+ theme parnjaci) s w:rFonts;
//   bold, italic, boja, w:cs i sve ostalo u w:rPr ostaje netaknuto. Simbolski
//   fontovi (Symbol, Wingdings, ...) su glyph-mapirani pa bi uklanjanje
//   promijenilo ZNACENJE teksta: preskacu se.
// - Velicina: w:sz/w:szCs se uklanja SAMO ako je blizu ciljane (3 half-points
//   = 1,5 pt); naslovnica i naslovi s velikim direct slovima, kao i namjerno
//   sitniji tekst (10 pt potpisi uz cilj 12 pt), ostaju netaknuti.
// - Prored: w:line/w:lineRule se uklanja SAMO kad je lineRule "auto" (ili
//   izostavljen); "exact"/"atLeast" su layout odluke i ne diraju se. U
//   TABLICAMA se prored i poravnanje NE diraju (jednostruki prored i lijevo
//   poravnanje u celijama su pravilo, ne prekrsaj); font/velicina se i u
//   tablicama usklađuju jer ulaze u dominantni font analize.
// - Poravnanje: w:jc se uklanja SAMO kad je "left"/"start" (Word default);
//   centrirano/desno je namjerno (naslovi slika, potpisi) i ne dira se.
// Sve izvan ciljanih atributa ostaje bajt-identicno (isti regex-patch pristup
// kao xml-patch.ts, bez DOM round-tripa).

export interface RunLevelOptions {
  /** Ukloni w:ascii/w:hAnsi(+Theme) override-e fonta u runovima. */
  stripFontName?: boolean;
  /** Ukloni w:sz/w:szCs override-e blizu ciljane velicine (half-points). */
  stripFontSizeNearHalfPoints?: number;
  /** Ukloni w:line/w:lineRule (samo lineRule auto) iz w:pPr/w:spacing. */
  stripLineSpacing?: boolean;
  /** Ukloni w:jc kad je left/start (cilj je obostrano poravnanje). */
  stripLeftJustify?: boolean;
}

export interface RunLevelResult {
  xml: string;
  applied: boolean;
  /** Broj odlomaka u kojima je nesto uklonjeno. */
  paragraphsTouched: number;
  /** Broj w:rPr blokova (runova) u kojima je nesto uklonjeno. */
  runsTouched: number;
}

/**
 * Dozvoljeno odstupanje velicine za brisanje override-a: 3 half-points = 1,5 pt.
 * Hvata tipicne "skoro pa dobre" vrijednosti (11 pt, 11,5 pt uz cilj 12 pt), a
 * NE dira namjerno sitniji tekst (10 pt potpisi uz cilj 12 pt su tocno 4 hp
 * daleko i ostaju netaknuti), ni naslovne velicine.
 */
const SIZE_TOLERANCE_HALF_POINTS = 3;

/**
 * Rasponi indeksa BALANSIRANIH blokova zadanog taga (podnosi ugnjezdenje:
 * okvir u okviru, tablica u tablici). Vraca raspone vanjskih blokova.
 */
function balancedRanges(xml: string, tagName: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const token = new RegExp(`<${tagName}\\b[^>]*?(\\/?)>|</${tagName}>`, 'g');
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = token.exec(xml)) !== null) {
    // Samozatvarajuci tag (<w:tbl/>) nije ni otvaranje ni zatvaranje: prazan
    // blok bez sadrzaja. Da ga se broji kao otvaranje, depth bi se trajno
    // zaglavio i SVI kasniji rasponi bi se izgubili (zastita bi otpala).
    if (m[1] === '/') continue;
    if (m[0][1] === '/') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start !== -1) {
        ranges.push([start, m.index + m[0].length]);
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  // Nezatvoren blok (malformiran docx): depth ostane > 0. Zastitno tretiraj
  // rep dokumenta od 'start' do kraja kao raspon (radije preskoci nego riskiraj).
  if (depth > 0 && start !== -1) ranges.push([start, xml.length]);
  return ranges;
}

function insideRanges(offset: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

/**
 * Fontovi s vlastitim glyph mapiranjem: uklanjanje rFonts override-a ne mijenja
 * samo izgled nego ZNACENJE znakova (alfa u Symbolu postane latinicno 'a',
 * kvacica u Wingdingsu postane slovo). Cambria Math dodatno stiti formule
 * izvan m:oMath konteksta.
 */
const SYMBOL_FONTS = new Set([
  'symbol',
  'wingdings',
  'wingdings 2',
  'wingdings 3',
  'webdings',
  'marlett',
  'mt extra',
  'zapfdingbats',
  'zapf dingbats',
  'cambria math',
]);

/**
 * Maskiraj blokove koje deep ciscenje NIKAD ne smije dirati: formule (m:oMath),
 * povijest revizija formatiranja (w:pPrChange/w:rPrChange) i obrisani tekst
 * (w:del, cije formatiranje vraca 'Odbaci promjenu'). Placeholder je NUL-omedjen
 * (NUL je nedopusten u XML 1.0 pa se ne moze sudariti s legitimnim sadrzajem);
 * restore ipak ne vjeruje slijepo indeksu (korumpiran ulaz s NUL sekvencama).
 */
function maskProtectedBlocks(paragraph: string): { masked: string; restore: (s: string) => string } {
  const stash: string[] = [];
  const masked = paragraph.replace(
    /<m:oMath\b[\s\S]*?<\/m:oMath>|<w:(pPrChange|rPrChange|del)\b[\s\S]*?<\/w:\1>/g,
    (block) => {
      stash.push(block);
      return `\u0000${stash.length - 1}\u0000`;
    },
  );
  const restore = (s: string) =>
    s.replace(/\u0000(\d+)\u0000/g, (whole, i: string) => {
      const idx = Number(i);
      return idx < stash.length ? stash[idx] : whole; // indeks izvan naseg stash-a: ostavi kako je
    });
  return { masked, restore };
}

/** Ima li odlomak w:pStyle razlicit od "Normal" (takve preskacemo). */
function hasNonNormalStyle(paragraph: string): boolean {
  const m = paragraph.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/);
  return !!m && m[1] !== 'Normal';
}

/** Ukloni imenovane atribute s taga; vrati '' ako tag ostane bez atributa. */
function stripAttrsFromTag(tag: string, attrs: string[]): string {
  let out = tag;
  for (const attr of attrs) {
    out = out.replace(new RegExp(`\\s+${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}="[^"]*"`), '');
  }
  // Tag bez ijednog preostalog atributa vise nista ne porucije: ukloni ga.
  if (/^<w:[A-Za-z]+\s*\/>$/.test(out) || /^<w:[A-Za-z]+\s*><\/w:[A-Za-z]+>$/.test(out)) return '';
  return out;
}

function stripRunProps(rPr: string, opts: RunLevelOptions): { out: string; changed: boolean } {
  let out = rPr;
  let changed = false;

  // Run koji referencira ZNAKOVNI stil (w:rStyle) nasljeduje font/velicinu iz
  // tog stila, ne iz Normal/docDefaults; skidanje direct override-a moglo bi ga
  // regresirati na stilski font. Fail-safe: takav run se ne dira (font/velicina).
  if (/<w:rStyle\b/.test(rPr)) return { out, changed };

  if (opts.stripFontName) {
    out = out.replace(/<w:rFonts\b[^>]*\/?>/g, (tag) => {
      // Simbolski font (Symbol, Wingdings, Cambria Math...): glyph mapiranje,
      // uklanjanje bi promijenilo ZNACENJE znakova. Provjeravaju se OBA slota
      // (ascii i hAnsi): dovoljno je da JEDAN bude simbolski pa cijeli tag ostaje.
      const names = [...tag.matchAll(/w:(?:ascii|hAnsi)="([^"]*)"/g)].map((x) => x[1].toLowerCase());
      if (names.some((n) => SYMBOL_FONTS.has(n))) return tag;
      const stripped = stripAttrsFromTag(tag, ['w:ascii', 'w:hAnsi', 'w:asciiTheme', 'w:hAnsiTheme']);
      if (stripped !== tag) changed = true;
      return stripped;
    });
  }

  if (opts.stripFontSizeNearHalfPoints !== undefined) {
    const target = opts.stripFontSizeNearHalfPoints;
    // SAMO w:sz: analiza mjeri dominantnu velicinu iz w:sz, a docDefaults w:szCs
    // se nikad ne patcha (nema backstopa) pa bi njegovo brisanje regresiralo
    // velicinu complex-script znakova (arapski/hebrejski) na naslijedjeno.
    // Prazan element podnosi i prosireni oblik <w:sz w:val="22"></w:sz>.
    out = out.replace(/<w:sz\b[^>]*w:val="([^"]*)"[^>]*?(?:\/>|><\/w:sz>)/g, (tag, val) => {
      const n = Number(val);
      if (!Number.isFinite(n) || Math.abs(n - target) > SIZE_TOLERANCE_HALF_POINTS) return tag;
      changed = true;
      return '';
    });
  }

  return { out, changed };
}

function stripParagraphProps(pPr: string, opts: RunLevelOptions): { out: string; changed: boolean } {
  let out = pPr;
  let changed = false;

  if (opts.stripLineSpacing) {
    out = out.replace(/<w:spacing\b[^>]*\/?>/g, (tag) => {
      if (!/w:line="/.test(tag)) return tag;
      const ruleMatch = tag.match(/w:lineRule="([^"]*)"/);
      // "exact"/"atLeast" su layout odluke; diramo samo auto (ili izostavljen).
      if (ruleMatch && ruleMatch[1] !== 'auto') return tag;
      const stripped = stripAttrsFromTag(tag, ['w:line', 'w:lineRule']);
      if (stripped !== tag) changed = true;
      return stripped;
    });
  }

  if (opts.stripLeftJustify) {
    // Podnosi i prosireni prazni oblik <w:jc w:val="left"></w:jc>: inace bi
    // ostao siroce zatvarajuci tag i document.xml bi postao malformiran.
    out = out.replace(/<w:jc\b[^>]*w:val="(?:left|start)"[^>]*?(?:\/>|><\/w:jc>)/g, () => {
      changed = true;
      return '';
    });
  }

  return { out, changed };
}

/**
 * Ukloni izravne formatne override-e iz tijela dokumenta prema opcijama.
 * Vraca novi document.xml i brojace za changelog; applied=false znaci da
 * nista nije pronadjeno za uklanjanje (fail-safe, dokument netaknut).
 */
export function stripDirectFormatting(documentXml: string, opts: RunLevelOptions): RunLevelResult {
  const txbx = balancedRanges(documentXml, 'w:txbxContent');
  const tables = balancedRanges(documentXml, 'w:tbl');
  // Wordove ugradjene naslovnice i strukturirane kontrole (w:sdt) drze
  // namjerno dizajniranu tipografiju u odlomcima BEZ pStyle-a; da ih se cisti
  // kao tijelo, splostila bi se najvidljivija stranica rada. Preskacu se cijeli.
  const sdt = balancedRanges(documentXml, 'w:sdt');
  let paragraphsTouched = 0;
  let runsTouched = 0;

  // Otvarajuci tag NE smije biti samozatvarajuci (<w:p/> ili <w:p attrs/>):
  // inace bi match progutao sve do </w:p> SLJEDECEG odlomka i obradio dva kao
  // jedan. Zadnji znak prije ">" zato ne smije biti "/".
  const newXml = documentXml.replace(/<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>/g, (paragraph, offset: number) => {
    if (insideRanges(offset, txbx)) return paragraph; // tekstualni okvir: preskoci
    if (insideRanges(offset, sdt)) return paragraph; // sdt (naslovnica/kontrola): preskoci
    // Odlomak koji SADRZI tekstualni okvir ili inline sdt (naslovnica-placeholder):
    // unutarnji zatvaraci sijeku non-greedy match pa bi se dio obradio kao tijelo.
    if (paragraph.includes('<w:txbxContent') || paragraph.includes('<w:sdt')) return paragraph;

    // Formule i track-changes povijest se maskiraju PRIJE svega (i prije
    // pStyle provjere: povijesni pStyle u w:pPrChange ne smije laziti o stilu).
    const { masked, restore } = maskProtectedBlocks(paragraph);
    if (hasNonNormalStyle(masked)) return paragraph; // stilizirani odlomak: preskoci

    // U tablicama se prored i poravnanje NE diraju (jednostruki prored i
    // lijevo poravnanje u celijama su norma); font/velicina prolaze.
    const inTable = insideRanges(offset, tables);
    const paraOpts: RunLevelOptions = inTable
      ? { ...opts, stripLineSpacing: false, stripLeftJustify: false }
      : opts;

    let out = masked;
    let paragraphChanged = false;

    // Svojstva odlomka (prored, poravnanje) zive u prvom w:pPr bloku.
    out = out.replace(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/, (pPr) => {
      const r = stripParagraphProps(pPr, paraOpts);
      if (r.changed) paragraphChanged = true;
      return r.out;
    });

    // Svojstva runova (font, velicina) zive u w:rPr blokovima.
    out = out.replace(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/g, (rPr) => {
      const r = stripRunProps(rPr, paraOpts);
      if (r.changed) {
        runsTouched++;
        paragraphChanged = true;
      }
      return r.out;
    });

    if (!paragraphChanged) return paragraph; // nista dirano: vrati IZVORNI bajt-identican
    paragraphsTouched++;
    return restore(out);
  });

  const applied = paragraphsTouched > 0;
  return { xml: applied ? newXml : documentXml, applied, paragraphsTouched, runsTouched };
}
