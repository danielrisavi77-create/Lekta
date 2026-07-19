/**
 * Bazni ISPRAVNI dokument + mutacijski helperi (faza 3-4 Lekta Error Corpus).
 *
 * Bazira se na postojecem golden builderu (tests/helpers/docx-builder) - NE gradi novi
 * monolit (CLAUDE.md: omotaj, ne bacaj). `baselineSpec()` je bogat, PROLAZNI rad za
 * referentni profil (fpzg-politologija-zavrsni): svaka atomska greska nastaje jednom
 * mutacijom klona ove baze, pa test dokazuje da je bas ta mutacija uzrok nalaza.
 *
 * Bazu prvo DOKAZUJEMO prolaznom (tests/corpus/cli/probe-baseline.ts + corpus-atomic test),
 * kao sto CLAUDE.md trazi golden dokaz zatecenog ponasanja prije mutacija.
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';

export const BASELINE_PROFILE_ID = 'fpzg-politologija-zavrsni';

const TNR = 'Times New Roman';
const SENTENCE = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. '; // 10 rijeci

/** N rijeci ispravno oblikovanog tijela (TNR 12, obostrano, prored 1,5). */
export function body(words: number, over: Partial<ParaSpec> = {}): ParaSpec[] {
  const out: ParaSpec[] = [];
  for (let c = 0; c < words; c += 60) out.push({ text: SENTENCE.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacing15: true, ...over });
  return out;
}
export const heading = (text: string, over: Partial<ParaSpec> = {}): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1', spacing15: true, ...over });
export const line = (text: string, over: Partial<ParaSpec> = {}): ParaSpec => ({ text, font: TNR, sizePt: 12, spacing15: true, ...over });

/** Word PAGE polje kao sirovi odlomak (engine detektira /\bPAGE\b/ nad sirovim document.xml). */
export const PAGE_FIELD: ParaSpec = {
  text: '',
  raw: '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
};

/** Deep-clone DocSpec (paragrafi + ugniježđeni objekti) da mutacija ne kalja bazu. */
export function cloneSpec(spec: DocSpec): DocSpec {
  return {
    paragraphs: spec.paragraphs.map((p) => ({ ...p })),
    pageCm: spec.pageCm ? { ...spec.pageCm } : undefined,
    marginsCm: spec.marginsCm ? { ...spec.marginsCm } : undefined,
    footnotes: spec.footnotes ? [...spec.footnotes] : undefined,
  };
}

/**
 * Bogat, PROLAZNI zavrsni rad (politologija). Sadrzi naslovnicu, sazetak, kljucne rijeci,
 * sadrzaj (PAGE polje), uvod/razradu/zakljucak s dovoljno rijeci, autor-godina citate s
 * lokatorom, tablicu i sliku s naslovom+izvorom, popise, te literaturu (>= min izvora).
 */
export function baselineSpec(): DocSpec {
  const paragraphs: ParaSpec[] = [
    // Naslovnica (centrirano, naslov istaknut)
    line('Sveučilište u Zagrebu', { jc: 'center' }),
    line('Fakultet političkih znanosti', { jc: 'center' }),
    line('Analiza medijske pismenosti mladih', { jc: 'center', sizePt: 16, bold: true }),
    line('Diplomski rad', { jc: 'center' }),
    line('Student: I. H.', { jc: 'center' }),
    line('Mentor: prof. dr. sc. A. K.', { jc: 'center' }),
    line('Zagreb, 2024.', { jc: 'center' }),
    // Sažetak + ključne riječi
    heading('Sažetak'),
    line('Sažetak rada u jednom odlomku sažima ključne spoznaje istraživanja o temi medijske pismenosti mladih.', { jc: 'both' }),
    line('Ključne riječi: medijska pismenost, mladi, analiza, metoda'),
    // Sadržaj (TOC s PAGE poljem i stavkama)
    heading('Sadržaj'),
    PAGE_FIELD,
    line('1. Uvod\t1'),
    line('2. Razrada\t3'),
    line('3. Zaključak\t9'),
    line('Literatura\t10'),
    // Popisi
    heading('Popis tablica'),
    line('Tablica 1. Prikaz podataka\t4'),
    heading('Popis slika'),
    line('Slika 1. Dijagram toka\t5'),
    // Uvod
    heading('1. Uvod'),
    ...body(840),
    line('Kako navodi jedan autor (Kovač, 2020), medijska pismenost raste. Drugi izvor tvrdi "pismenost je ključna vještina" (Horvat, 2019, str. 12).', { jc: 'both' }),
    // Razrada + tablica + slika
    heading('2. Razrada'),
    ...body(4200),
    line('Tablica 1. Prikaz podataka istraživanja'),
    line('Izvor: autor prema anketi, 2020.'),
    line('Slika 1. Dijagram toka procesa'),
    line('Izvor: autor.'),
    // Zaključak
    heading('3. Zaključak'),
    ...body(600),
    // Literatura (>= min izvora, abecedno)
    heading('Literatura'),
    line('Horvat, I. (2019). Digitalne kompetencije mladih. Rijeka: Izdavač.'),
    line('Kovač, A. (2020). Medijska pismenost. Zagreb: Naklada.'),
    line('Marić, P. (2021). Nove tehnologije u obrazovanju. Split: Sveučilišna naklada.'),
    line('Ministarstvo znanosti (2022). Izvješće o pismenosti. Dostupno na: https://www.primjer.hr/izvjesce (pristupljeno 1. 5. 2023.).'),
  ];
  return { paragraphs, marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } };
}
