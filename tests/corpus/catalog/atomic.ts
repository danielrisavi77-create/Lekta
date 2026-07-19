/**
 * ATOMSKI korpus (faza 4): svaki slucaj = JEDNA mutacija PROLAZNE baze (baseline.ts), koja
 * mora srusiti tocno ciljanu provjeru. Time dokazujemo uzrocnost: bas ta greska proizvodi
 * bas taj nalaz. Baza je zasebno dokazana prolaznom (probe-baseline + corpus-atomic setup).
 *
 * Mutacije rade nad cloneSpec(baselineSpec()) pa nikad ne kaljaju bazu ni druge slucajeve.
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';
import { baselineSpec, cloneSpec, line, heading, body, PAGE_FIELD, BASELINE_PROFILE_ID } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const PID = BASELINE_PROFILE_ID;

/** Tijelo = dugacki obostrani odlomci bez stila (ponovljena recenica + citatni odlomci). */
const isBodyPara = (p: ParaSpec): boolean => !p.styleId && !p.raw && !p.empty && typeof p.text === 'string' && p.text.length > 120;
/** Bilo koji odlomak s eksplicitnim fontom (za mutaciju dominantnog fonta/velicine). */
const hasFont = (p: ParaSpec): boolean => !p.raw && !p.empty && typeof p.font === 'string';

/** Stvarni OOXML elementi (engine broji tablice iz <w:tbl>, slike iz <w:drawing>). */
const TABLE_RAW: ParaSpec = { text: '', raw: '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' };
const IMAGE_RAW: ParaSpec = { text: '', raw: '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="3000000" cy="2000000"/></wp:inline></w:drawing></w:r></w:p>' };

function mutate(fn: (paras: ParaSpec[], spec: DocSpec) => void): DocSpec {
  const spec = cloneSpec(baselineSpec());
  fn(spec.paragraphs, spec);
  return spec;
}

/** Umetni iza prvog naslova koji odgovara re. */
function insAfter(spec: DocSpec, re: RegExp, ...items: ParaSpec[]): void {
  const i = spec.paragraphs.findIndex((p) => p.styleId && re.test(p.text));
  spec.paragraphs.splice(i + 1, 0, ...items);
}

/**
 * Uravnotezen Uvod/Zakljucak (za cleanBuild scope.intro-conclusion-ratio): Uvod ~6%, Zakljucak
 * ~9% glavnog opsega, unutar FPZG smjernice (Uvod <= 10.5%, Zakljucak 4.5-10.5%). Baza je
 * neuravnotezena (Uvod 15.1%) pa build = baza warna.
 */
function balancedIntroConcl(): DocSpec {
  return {
    paragraphs: [
      line('Sveučilište u Zagrebu', { jc: 'center' }),
      line('Fakultet političkih znanosti', { jc: 'center' }),
      heading('Sažetak'),
      line('Sažetak rada u jednom odlomku s ključnim spoznajama.', { jc: 'both' }),
      line('Ključne riječi: analiza, metoda, istraživanje'),
      heading('Sadržaj'),
      PAGE_FIELD,
      heading('1. Uvod'),
      ...body(300),
      heading('2. Razrada'),
      ...body(4200),
      heading('3. Zaključak'),
      ...body(450),
      heading('Literatura'),
      line('Kovač, A. (2020). Medijska pismenost. Zagreb: Naklada.'),
    ],
    marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
  };
}

export const ATOMIC_CASES: ErrorCase[] = [
  {
    id: 'atomic.format.font.dominant',
    title: 'Pogrešan dominantni font (Arial umjesto TNR)',
    category: 'formatting',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => ps.forEach((p) => { if (hasFont(p)) p.font = 'Arial'; })),
    expect: { checkId: 'format.font.dominant', title: 'Dominantni font', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.format.size.body',
    title: 'Pogrešna veličina osnovnog teksta (14 pt)',
    category: 'formatting',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => ps.forEach((p) => { if (isBodyPara(p)) p.sizePt = 14; })),
    expect: { checkId: 'format.size.body', title: 'Veličina osnovnog teksta', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.format.spacing.body',
    title: 'Jednostruki prored umjesto 1,5',
    category: 'formatting',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    // Jednostruki prored mora biti EKSPLICITAN (w:line 240): nezapisan prored engine ne kaznjava.
    build: () => mutate((ps) => ps.forEach((p) => { if (isBodyPara(p)) { delete p.spacing15; p.spacingLine = 240; } })),
    expect: { checkId: 'format.spacing.body', title: 'Prored osnovnog teksta', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.format.justify.body',
    title: 'Lijevo poravnanje umjesto obostranog',
    category: 'formatting',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => ps.forEach((p) => { if (isBodyPara(p)) p.jc = 'left'; })),
    expect: { checkId: 'format.justify.body', title: 'Poravnanje osnovnog teksta', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.page.size.a4',
    title: 'Format stranice nije A4 (A5)',
    category: 'formatting',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((_ps, spec) => { spec.pageCm = { w: 14.8, h: 21.0 }; }),
    expect: { checkId: 'page.size.a4', title: 'Format stranice A4', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.sections.basic',
    title: 'Nedostaju Zaključak i Literatura',
    category: 'structure',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !(p.styleId && /Zaključak|Literatura/.test(p.text))); }),
    expect: { checkId: 'structure.sections.basic', title: 'Osnovni dijelovi rada', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.sections.profile',
    title: 'Nedostaju ključne riječi (obvezan dio profila)',
    category: 'structure',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    // Uklanjamo redak "Ključne riječi: ..." (profil ih trazi kao zaseban dio). Sazetak ne diramo
    // jer i tijelo sazetka pocinje s "Sažetak ..." pa bi termin ostao pokriven.
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !/^Ključne riječi/.test(p.text)); }),
    expect: { checkId: 'structure.sections.profile', title: 'Dijelovi verificiranog profila', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.scope.words',
    title: 'Premalo riječi (ispod profilnog minimuma)',
    category: 'structure',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps, spec) => {
      let kept = 0;
      spec.paragraphs = ps.filter((p) => { if (isBodyPara(p)) { kept++; return kept <= 2; } return true; });
    }),
    expect: { checkId: 'scope.words', title: 'Profilni opseg riječi', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.page.numbers.present',
    title: 'Nema PAGE polja (brojeva stranica)',
    category: 'structure',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !(p.raw && /PAGE/.test(p.raw))); }),
    expect: { checkId: 'page.numbers.present', title: 'Brojevi stranica', kind: 'earned', outcome: 'not-pass' },
  },
  {
    id: 'atomic.citation.author-year.missing-reference',
    title: 'Citat u tekstu bez zapisa u literaturi',
    category: 'citations',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => p.styleId && /1\. Uvod/.test(p.text));
      ps.splice(i + 1, 0, line('Prema novom istraživanju (Novak, 2018) trend se ubrzano mijenja u posljednjih nekoliko godina.', { jc: 'both' }));
    }),
    expect: { checkId: 'citation.author-year.missing-reference', title: 'Citirano → literatura', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.citation.direct-quote-locator',
    title: 'Izravni citat bez lokatora (broja stranice)',
    category: 'citations',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => {
      // Citatnica BEZ zareza ("Horvat 2019") da godina ne bude lazno procitana kao stranica
      // (poznati bug: missingLocator regex `,\s*\d` tretira ", 2019" kao broj stranice).
      const i = ps.findIndex((p) => /str\. 12/.test(p.text));
      if (i >= 0) ps[i] = line('Kako navodi jedan autor (Kovač 2020), medijska pismenost raste. Drugi izvor tvrdi "pismenost je ključna vještina za sudjelovanje" (Horvat 2019).', { jc: 'both' });
    }),
    expect: { checkId: 'citation.direct-quote-locator', title: 'Lokator uz izravne citate', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.reference.alphabetical',
    title: 'Literatura nije abecedno poredana',
    category: 'citations',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps, spec) => {
      const refStart = ps.findIndex((p) => p.styleId && /Literatura/.test(p.text));
      const head = ps.slice(0, refStart + 1);
      const refs = ps.slice(refStart + 1).reverse(); // obrni abecedu (M, M, K, H)
      spec.paragraphs = [...head, ...refs];
    }),
    expect: { checkId: 'reference.alphabetical', title: 'Abecedni poredak literature', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.element.link-form',
    title: 'Neispravan oblik poveznice u tekstu',
    category: 'elements',
    oracle: 'atomic-fail',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => p.styleId && /2\. Razrada/.test(p.text));
      ps.splice(i + 1, 0, line('Detalji su dostupni na poveznici http://primjer.hr/put<age> koja nije ispravno oblikovana.', { jc: 'both' }));
    }),
    expect: { checkId: 'element.link-form', title: 'Oblik poveznica', kind: 'status', outcome: 'not-pass' },
  },

  // --- Batch A: dodatne bodovane provjere (gap-backlog P1) ------------------------------------
  {
    id: 'atomic.citation.recognized',
    title: 'Nijedna citatnica u tekstu',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !/\(Kovač|\(Horvat/.test(p.text)); }),
    expect: { checkId: 'citation.recognized', title: 'Prepoznate citatnice', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.citation.author-year.suffix',
    title: 'Dva rada istog autora iste godine bez sufiksa a/b',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /Literatura/, line('Kovač, A. (2020). Drugi rad o medijima. Zagreb: Naklada.')); return s; },
    expect: { checkId: 'citation.author-year.suffix', title: 'Isti autor i godina (a/b/c)', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.reference.completeness',
    title: 'Bibliografski zapis bez godine i izdavača',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /Literatura/, line('Anonimni izvor bez godine i izdavača')); return s; },
    expect: { checkId: 'reference.completeness', title: 'Potpunost bibliografskih zapisa', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.reference.access-date',
    title: 'Mrežni izvor bez datuma pristupa',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => mutate((ps) => { const i = ps.findIndex((p) => /pristupljeno/.test(p.text)); if (i >= 0) ps[i] = line('Ministarstvo znanosti (2022). Izvješće o pismenosti. Dostupno na: https://www.primjer.hr/izvjesce'); }),
    expect: { checkId: 'reference.access-date', title: 'Datumi pristupa mrežnim izvorima', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.element.table.caption',
    title: 'Tablica bez naslova („Tablica N")',
    category: 'elements', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Stvarni <w:tbl> (tables=1) bez ijednog "Tablica N" naslova (tableCaps=0) -> tableCaps < tables.
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !/^Tablica \d/.test(p.text)); insAfter(spec, /2\. Razrada/, TABLE_RAW); }),
    expect: { checkId: 'element.table.caption', title: 'Naslovi tablica', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.element.figure.caption',
    title: 'Slika bez naslova („Slika N")',
    category: 'elements', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !/^Slika \d/.test(p.text)); insAfter(spec, /2\. Razrada/, IMAGE_RAW); }),
    expect: { checkId: 'element.figure.caption', title: 'Naslovi slika i grafikona', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.element.source',
    title: 'Tablica bez navedenog izvora ispod',
    category: 'elements', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Baza nema stvarnih tablica pa "Izvori ispod" ne emitira; cista varijanta dodaje tablicu I
    // zadrzava "Izvor:" retke (provjera prolazi), a build ih uklanja (sourceLines < tables+images).
    cleanBuild: () => mutate((_ps, spec) => { insAfter(spec, /2\. Razrada/, TABLE_RAW, line('Tablica 5. Dodatna s naslovom')); }),
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !/^Izvor/.test(p.text)); insAfter(spec, /2\. Razrada/, TABLE_RAW, line('Tablica 5. Dodatna s naslovom')); }),
    expect: { checkId: 'element.source', title: 'Izvori ispod slika i tablica', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.element.lists',
    title: 'Više tablica bez popisa tablica',
    category: 'elements', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !/^Popis tablica/.test(p.text)); insAfter(spec, /2\. Razrada/, TABLE_RAW, line('Tablica 6. Prva'), TABLE_RAW, line('Tablica 7. Druga')); }),
    expect: { checkId: 'element.lists', title: 'Popisi slika i tablica', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.heading.depth',
    title: 'Predubok decimalni naslov (5 razina, prag je 4)',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /2\. Razrada/, heading('2.1.1.1.1. Vrlo duboko numeriran pododjeljak')); return s; },
    expect: { checkId: 'structure.heading.depth', title: 'Dubina decimalnog numeriranja', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.toc.present',
    title: 'Nema sadržaja (TOC)',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // "Sadržaj dokumenta" ima status uvijek 'pass' (blag audit), ali gubi bodove (earned < max).
    build: () => mutate((ps, spec) => { spec.paragraphs = ps.filter((p) => !(p.styleId && /Sadržaj/.test(p.text)) && !(p.raw && /PAGE/.test(p.raw)) && !/^\d\. \w+\t\d/.test(p.text) && !/^Literatura\t\d/.test(p.text)); }),
    expect: { checkId: 'toc.present', title: 'Sadržaj dokumenta', kind: 'earned', outcome: 'not-pass' },
  },

  // --- Batch C: "warn" provjere preko cleanBuild (cista varijanta prolazi; baza vec warna) -----
  // Dijeljenu bazu NE diramo (o njoj ovisi 30 slucajeva); cleanBuild je per-case popravak.
  {
    id: 'atomic.reference.uncited',
    title: 'Izvori u literaturi bez ijedne citatnice u tekstu',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /1\. Uvod/, line('Autori navode nove trendove (Marić, 2021) te izvještaj ministarstva (Ministarstvo znanosti, 2022).', { jc: 'both' })); return s; },
    build: () => baselineSpec(), // baza citira samo 2 od 4 izvora -> 2 necitirana
    expect: { checkId: 'reference.uncited', title: 'Literatura → citirano', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.heading.word-styles',
    title: 'Ručno numerirani kratki odlomci bez Word stila naslova',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // cleanBuild uklanja vodece brojeve iz TOC-stavki (unicode-safe: `\w` bi pao na "Zaključak").
    cleanBuild: () => { const s = cloneSpec(baselineSpec()); s.paragraphs = s.paragraphs.map((p) => /^\d+\.\s/.test(p.text) && p.text.includes('\t') ? { ...p, text: p.text.replace(/^\d+\.\s*/, '') } : p); return s; },
    build: () => baselineSpec(),
    expect: { checkId: 'structure.heading.word-styles', title: 'Uporaba Word stilova naslova', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.title.elements',
    title: 'Naslovnica navodi krivu vrstu rada za profil',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Profil je zavrsni; cleanBuild stavi "Završni rad" (prepoznato), build ostaje "Diplomski rad".
    cleanBuild: () => { const s = cloneSpec(baselineSpec()); const i = s.paragraphs.findIndex((p) => /Diplomski rad/.test(p.text)); if (i >= 0) s.paragraphs[i] = { ...s.paragraphs[i], text: 'Završni rad' }; return s; },
    build: () => baselineSpec(),
    expect: { checkId: 'title.elements', title: 'Elementi naslovne stranice', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.scope.intro-conclusion-ratio',
    title: 'Uvod nesrazmjerno velik (odstupa od FPZG smjernice)',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => balancedIntroConcl(),
    build: () => baselineSpec(), // Uvod ~15.1% > 10.5% praga
    expect: { checkId: 'scope.intro-conclusion-ratio', title: 'Omjer Uvoda i Zaključka', kind: 'status', outcome: 'not-pass' },
  },
];
