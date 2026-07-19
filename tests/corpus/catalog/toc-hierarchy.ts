/**
 * TOC + HIJERARHIJA atomski korpus (faza 4, "TOC enabler"): cetiri bodovane provjere sadrzaja i
 * hijerarhije naslova koje se emitiraju samo za profil s TOC-detalj gate-ovima
 * (`pravo-socijalni-rad-zavrsni`: tocDetailedCheck + tocFont/tocSize + tocRequirePageNumbers +
 * tocCompareHeadings + scoreStructure). VAZNO: nije potrebno pravo `fldSimple` TOC polje - engine
 * prepoznaje stavke sadrzaja preko `tocEntryParagraphs` (stil TOC1/Sadrzaj1 ILI, poslije naslova
 * "Sadrzaj", retci koji zavrsavaju tabom/razmakom + brojem). Zato je ovo cist PROFIL+SPEC enabler
 * (kao profile-enabled.ts), BEZ ijedne izmjene buildera i bez rizika za golden.
 *
 * Stavke sadrzaja radimo preko stila `TOC1` (styleId, vec podrzan): tako se stavka prepoznaje i
 * kad joj se makne broj stranice (za page-numbers), sto tekst-heuristika ne bi (izgubila bi stavku).
 * Razinu 3 naslova radimo preko `Heading3` (styleId parsira se u razinu 3), pa H1 -> H3 = preskok.
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';
import { line, heading, body, PAGE_FIELD, cloneSpec } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const PID = 'pravo-socijalni-rad-zavrsni';

/** Naslov (Heading1, razina 1) podebljan, kako profil trazi za razinu 1. */
const H = (text: string, over: Partial<ParaSpec> = {}): ParaSpec => ({ text, font: 'Times New Roman', sizePt: 12, styleId: 'Heading1', bold: true, spacing15: true, ...over });
/** Stavka sadrzaja preko stila TOC1 (prepoznata i bez broja stranice). */
const TOC = (text: string): ParaSpec => ({ text, font: 'Times New Roman', sizePt: 12, styleId: 'TOC1', spacing15: true });

/**
 * PROLAZNA baza za TOC provjere: naslov Sadrzaj + tri TOC1 stavke (TNR 12, s brojevima stranica),
 * te tri numerirana naslova razine 1 koji se poklapaju sa stavkama. Probing potvrduje da pod
 * pravo-socijalni-rad-zavrsni prolaze sve cetiri ciljane provjere (format/brojevi/pokrivenost/hijerarhija).
 */
function tocSpec(): DocSpec {
  return {
    paragraphs: [
      line('Sveučilište u Zagrebu', { jc: 'center' }),
      line('Pravni fakultet, Studijski centar socijalnog rada', { jc: 'center' }),
      line('Izjava o izvornosti rada', { jc: 'center' }),
      heading('Sažetak'),
      line('Sažetak rada u jednom odlomku sažima ključne spoznaje istraživanja o socijalnim uslugama.', { jc: 'both' }),
      line('Ključne riječi: socijalni rad, usluge, analiza, metoda'),
      heading('Abstract'),
      line('This thesis summarises the key findings on social services provision in the community.', { jc: 'both' }),
      line('Keywords: social work, services, analysis, method'),
      heading('Sadržaj'),
      PAGE_FIELD,
      TOC('1. Uvod\t1'),
      TOC('2. Razrada\t3'),
      TOC('3. Zaključak\t9'),
      H('1. Uvod'),
      ...body(360),
      H('2. Razrada'),
      ...body(600),
      H('3. Zaključak'),
      ...body(300),
      heading('Literatura'),
      line('Kovač, A. (2020). Temelji socijalnog rada. Zagreb: Naklada.'),
    ],
    marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
  };
}

/** Klon TOC baze s jednom mutacijom. */
function mutToc(fn: (paras: ParaSpec[], spec: DocSpec) => void): DocSpec {
  const s = cloneSpec(tocSpec());
  fn(s.paragraphs, s);
  return s;
}

export const TOC_ATOMIC_CASES: ErrorCase[] = [
  {
    id: 'atomic.toc.format',
    title: 'Stavka sadržaja nije u profilnom fontu (Arial umjesto TNR)',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => tocSpec(),
    build: () => mutToc((ps) => { const p = ps.find((x) => x.styleId === 'TOC1' && /^1\. Uvod/.test(x.text)); if (p) p.font = 'Arial'; }),
    expect: { checkId: 'toc.format', title: 'Font i veličina sadržaja', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.toc.page-numbers',
    title: 'Stavka sadržaja bez broja stranice',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // TOC1 stavka se prepoznaje po stilu i bez broja; makni broj -> nema stranicu (tekst-heuristika
    // bi izgubila stavku, stil je zadrzava pa provjera moze pasti bas na page-numbers).
    cleanBuild: () => tocSpec(),
    build: () => mutToc((ps) => { const p = ps.find((x) => x.styleId === 'TOC1' && /^2\. Razrada/.test(x.text)); if (p) p.text = '2. Razrada'; }),
    expect: { checkId: 'toc.page-numbers', title: 'Brojevi stranica u sadržaju', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.toc.coverage',
    title: 'Naslov u tekstu koji nije unesen u sadržaj',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Dodan glavni naslov "4. Rasprava" kojeg NEMA u stavkama sadrzaja -> sadrzaj nije azuriran.
    cleanBuild: () => tocSpec(),
    build: () => mutToc((ps) => { const i = ps.findIndex((x) => x.styleId === 'Heading1' && /3\. Zaključak/.test(x.text)); ps.splice(i, 0, H('4. Rasprava o rezultatima istraživanja'), ...body(120)); }),
    expect: { checkId: 'toc.coverage', title: 'Naslovi dokumenta ↔ sadržaj', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.heading.hierarchy',
    title: 'Preskok razine naslova (H1 pa H3 bez H2)',
    category: 'structure', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Umetnut naslov razine 3 (Heading3) odmah iza razine 1 -> preskok razine (3 > 1 + 1).
    cleanBuild: () => tocSpec(),
    build: () => mutToc((ps) => { const i = ps.findIndex((x) => x.styleId === 'Heading1' && /1\. Uvod/.test(x.text)); ps.splice(i + 1, 0, { text: '1.1.1 Duboki pododjeljak analize', font: 'Times New Roman', sizePt: 12, styleId: 'Heading3', italic: true, spacing15: true }); }),
    expect: { checkId: 'structure.heading.hierarchy', title: 'Hijerarhija naslova', kind: 'status', outcome: 'not-pass' },
  },
];
