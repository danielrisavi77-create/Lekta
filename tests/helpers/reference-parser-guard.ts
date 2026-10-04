/**
 * T91 gard parsera literature nad izmisljenim zapisima (nijedan iz stvarnog rada).
 * Vraca popis problema; prazan popis znaci da parser i predikat `reference.completeness` drze
 * oba popravka: "(godina)." bez autora je zaseban zapis, a oznaka bez godine nije nepotpun zapis.
 */
type Ref = { text: string; author?: string; year?: string; noDate?: string };
type Extract = (paragraphs: { text: string; headingLevel?: number }[], lang: string) => { entries: Ref[] };
type Incomplete = (r: Ref) => boolean;

const POTPUNI = [
  'Horvat, A. (2011). Lokalna samouprava u praksi. Zagreb: Primjer naklada.',
  'Babic, M. (2014). Izborni sustavi i stranke. Split: Ogledni izdavac.',
];
const BEZ_AUTORA = [
  '(2012). Prirucnik za lokalne izbore. Zagreb: Primjer naklada.',
  '(2015). Zbornik o javnim politikama. Rijeka: Primjer naklada.',
];
const BEZ_GODINE = [
  'Kovac, B. (b.g.). Povijest lokalne uprave. Zagreb: Primjer naklada.',
  'Vukic, S. (s. a.). Pregled izbornih zakona. Rijeka: Primjer naklada.',
  'Grgic, N. (n. d.). Mediji i politika. Zadar: Primjer naklada.',
  'Knez, V. (u tisku). Novi modeli participacije. Politicka misao.',
];

function refs(extract: Extract, lines: string[]): Ref[] {
  const paragraphs = [{ text: 'Uvod', headingLevel: 1 }, { text: 'Tekst rada.' }, { text: 'Literatura', headingLevel: 1 }, ...lines.map((text) => ({ text }))];
  return extract(paragraphs, 'hr').entries;
}

export function referenceParserProblems(extract: Extract, incomplete: Incomplete): string[] {
  const problems: string[] = [];
  const a = refs(extract, POTPUNI.flatMap((p, i) => [p, BEZ_AUTORA[i]]));
  if (a.length !== 4) problems.push(`(a) "(godina)." bez autora spojen s prethodnim: ${a.length} zapisa umjesto 4`);
  if (a.filter(incomplete).length !== 2) problems.push(`(a) zapisi bez autora nisu prijavljeni kao nepotpuni: ${a.filter(incomplete).length} umjesto 2`);
  const b = refs(extract, BEZ_GODINE);
  if (b.length !== BEZ_GODINE.length) problems.push(`(b) oznaka bez godine: ${b.length} zapisa umjesto ${BEZ_GODINE.length}`);
  const lazni = b.filter(incomplete).length;
  if (lazni) problems.push(`(b) ${lazni} potpunih zapisa s oznakom bez godine prijavljeno kao nepotpuno`);
  const kontrola = refs(extract, POTPUNI);
  if (kontrola.length !== POTPUNI.length || kontrola.some(incomplete)) problems.push('kontrola: obicni potpuni zapisi vise nisu cisti');
  return problems;
}
