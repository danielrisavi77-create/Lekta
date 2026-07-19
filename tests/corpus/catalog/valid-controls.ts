/**
 * VALID CONTROL korpus (faza 4, prompt T): valjani dokumenti koji koriste NETIPICNU ali
 * ISPRAVNU reprezentaciju - moraju ostati bez laznog nalaza (false positive). Jednako vazno
 * kao atomske greske: dokazuje da engine ne kaznjava valjane, ali neuobicajene oblike.
 *
 * Svaki slucaj ocekuje da ciljana provjera OSTANE 'pass' (outcome: 'pass').
 */
import type { ParaSpec, DocSpec } from '../../helpers/docx-builder';
import { baselineSpec, cloneSpec, line, heading, BASELINE_PROFILE_ID } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const PID = BASELINE_PROFILE_ID;
const isBodyPara = (p: ParaSpec): boolean => !p.styleId && !p.raw && !p.empty && typeof p.text === 'string' && p.text.length > 120;

/** Stvarni <w:tbl> (engine broji tablice iz OOXML-a, ne iz "Tablica N" teksta). */
const TABLE_RAW: ParaSpec = { text: '', raw: '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' };

function mutate(fn: (paras: ParaSpec[], spec: DocSpec) => void): DocSpec {
  const spec = cloneSpec(baselineSpec());
  fn(spec.paragraphs, spec);
  return spec;
}

/** Umetni iza prvog naslova koji odgovara re (za valjane dopune baze). */
function insAfter(spec: DocSpec, re: RegExp, ...items: ParaSpec[]): void {
  const i = spec.paragraphs.findIndex((p) => p.styleId && re.test(p.text));
  spec.paragraphs.splice(i + 1, 0, ...items);
}

export const VALID_CONTROL_CASES: ErrorCase[] = [
  {
    id: 'valid.format.font.docdefaults',
    title: 'Font naslijeđen iz docDefaults (bez run fonta)',
    category: 'formatting',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    // Nijedan run nema eksplicitni font -> dominantni font dolazi iz styles docDefaults (TNR).
    build: () => mutate((ps) => ps.forEach((p) => { delete p.font; })),
    expect: { checkId: 'format.font.dominant', title: 'Dominantni font', kind: 'status', outcome: 'pass' },
    notes: 'Inheritance: TNR iz docDefaults ne smije lazno pasti kao pogresan font.',
  },
  {
    id: 'valid.format.size.docdefaults',
    title: 'Veličina naslijeđena iz docDefaults (bez run sz)',
    category: 'formatting',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => ps.forEach((p) => { delete p.sizePt; })),
    expect: { checkId: 'format.size.body', title: 'Veličina osnovnog teksta', kind: 'status', outcome: 'pass' },
    notes: 'Inheritance: 12 pt iz docDefaults (sz 24) ne smije lazno pasti.',
  },
  {
    id: 'valid.citation.nbsp',
    title: 'Citatnica s neprekidnim razmakom (Kovač\\u00A02020)',
    category: 'citations',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    // Neprekidni razmak izmedju prezimena i godine ne smije prekinuti vezu citat -> literatura.
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => /Kovač/.test(p.text) && p.jc === 'both');
      if (i >= 0) ps[i] = line('Kako navodi jedan autor (Kovač, 2020), medijska pismenost mladih kontinuirano raste.', { jc: 'both' });
    }),
    expect: { checkId: 'citation.author-year.missing-reference', title: 'Citirano → literatura', kind: 'status', outcome: 'pass' },
    notes: 'Kovač je u literaturi; nbsp ne smije stvoriti lazni "citat bez zapisa".',
  },
  {
    id: 'valid.citation.legit-year-range',
    title: 'Legitimna godina u zagradi koja nije citat',
    category: 'citations',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    // "(2018.–2020.)" bez autora nije citatnica i ne smije postati "citirano bez zapisa".
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => p.styleId && /2\. Razrada/.test(p.text));
      ps.splice(i + 1, 0, line('Istraživanje je provedeno u razdoblju (2018.–2020.) na više uzoraka i u više navrata.', { jc: 'both' }));
    }),
    expect: { checkId: 'citation.author-year.missing-reference', title: 'Citirano → literatura', kind: 'status', outcome: 'pass' },
    notes: 'Gola godina u zagradi bez autora nije citat.',
  },
  {
    id: 'valid.element.link-clean',
    title: 'Ispravno oblikovana poveznica u tekstu',
    category: 'elements',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => p.styleId && /2\. Razrada/.test(p.text));
      ps.splice(i + 1, 0, line('Više informacija dostupno je na https://www.primjer.hr/stranica koja se redovito ažurira.', { jc: 'both' }));
    }),
    expect: { checkId: 'element.link-form', title: 'Oblik poveznica', kind: 'status', outcome: 'pass' },
    notes: 'Uredna https poveznica ne smije se prijaviti kao neispravan oblik.',
  },

  // --- Batch: dodatni false-positive cuvari za bodovane i informativne provjere ---------------
  {
    id: 'valid.citation.direct-quote-locator',
    title: 'Izravni citat s urednim lokatorom (str. 88)',
    category: 'citations', oracle: 'valid-control', profileId: PID, detectableNow: true,
    // Citat KOJI IMA lokator (str. 88) ne smije se prijaviti kao izostanak lokatora (Marić je u literaturi).
    build: () => mutate((ps) => { const i = ps.findIndex((p) => p.styleId && /2\. Razrada/.test(p.text)); ps.splice(i + 1, 0, line('Autor jasno navodi "pismenost je temelj sudjelovanja u društvu" (Marić, 2021, str. 88) u svojoj analizi.', { jc: 'both' })); }),
    expect: { checkId: 'citation.direct-quote-locator', title: 'Lokator uz izravne citate', kind: 'status', outcome: 'pass' },
    notes: 'Izravni citat s urednim lokatorom ne smije pasti kao lokator koji nedostaje.',
  },
  {
    id: 'valid.citation.author-year.suffix',
    title: 'Isti autor, različite godine (bez a/b sufiksa)',
    category: 'citations', oracle: 'valid-control', profileId: PID, detectableNow: true,
    // Dva rada istog autora RAZLIČITIH godina (Kovač 2020 + 2018) ne trebaju a/b/c sufiks.
    build: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /Literatura/, line('Kovač, A. (2018). Raniji rad o medijskoj pismenosti. Zagreb: Naklada.')); return s; },
    expect: { checkId: 'citation.author-year.suffix', title: 'Isti autor i godina (a/b/c)', kind: 'status', outcome: 'pass' },
    notes: 'Isti autor razlicitih godina ne smije se prijaviti kao nedostajuci sufiks.',
  },
  {
    id: 'valid.structure.heading.depth',
    title: 'Četverorazinski naslov na granici (dopušteno)',
    category: 'structure', oracle: 'valid-control', profileId: PID, detectableNow: true,
    // Dubina 4 = profilni maksimum (maxDecimalLevels), tocno na granici, ne smije pasti.
    build: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /2\. Razrada/, heading('2.1.1.1. Duboki ali dopušteni pododjeljak')); return s; },
    expect: { checkId: 'structure.heading.depth', title: 'Dubina decimalnog numeriranja', kind: 'status', outcome: 'pass' },
    notes: 'Cetiri razine su na dopustenom maksimumu, ne prekoracenje.',
  },
  {
    id: 'valid.element.table.caption',
    title: 'Tablica s urednim naslovom („Tablica 2.")',
    category: 'elements', oracle: 'valid-control', profileId: PID, detectableNow: true,
    // Stvarna tablica (w:tbl) S naslovom "Tablica N" i izvorom ne smije pasti kao tablica bez naslova.
    build: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /2\. Razrada/, TABLE_RAW, line('Tablica 2. Dodatni prikaz rezultata istraživanja'), line('Izvor: autor.')); return s; },
    expect: { checkId: 'element.table.caption', title: 'Naslovi tablica', kind: 'status', outcome: 'pass' },
    notes: 'Uredno naslovljena tablica ne smije se prijaviti kao tablica bez naslova.',
  },
  {
    id: 'valid.element.empty-paragraphs',
    title: 'Nekoliko praznih odlomaka (uredno)',
    category: 'elements', oracle: 'valid-control', profileId: PID, detectableNow: true,
    build: () => mutate((ps) => { const i = ps.findIndex((p) => p.styleId && /2\. Razrada/.test(p.text)); ps.splice(i + 1, 0, { text: '', empty: true }, { text: '', empty: true }); }),
    expect: { checkId: 'element.empty-paragraphs', title: 'Prazni odlomci', kind: 'status', outcome: 'pass' },
    notes: 'Nekoliko praznih odlomaka je uredno i ostaje informativno bez nalaza.',
  },
  {
    id: 'valid.reference.completeness',
    title: 'Potpun zapis s oznakom urednika (ur.)',
    category: 'citations', oracle: 'valid-control', profileId: PID, detectableNow: true,
    // Zbornik s "(ur.)" je potpun bibliografski zapis (autor/urednik, godina, izdavac).
    build: () => { const s = cloneSpec(baselineSpec()); insAfter(s, /Literatura/, line('Babić, M. (ur.) (2017). Zbornik radova o medijskoj pismenosti. Zagreb: Sveučilišna naklada.')); return s; },
    expect: { checkId: 'reference.completeness', title: 'Potpunost bibliografskih zapisa', kind: 'status', outcome: 'pass' },
    notes: 'Uredan zbornik s oznakom urednika je potpun zapis.',
  },
];
