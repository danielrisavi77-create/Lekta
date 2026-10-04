/**
 * T91 gard parsera literature nad izmisljenim zapisima (nijedan iz stvarnog rada).
 * Vraca popis problema; prazan popis znaci da parser i predikat `reference.completeness` drze:
 *   (a) "(godina)." bez autora je zaseban zapis i prijavljuje se kao nepotpun;
 *   (b) oznaka bez godine ("b.g.", "s. a.", "n. d.", "u tisku") nije nepotpun zapis;
 *   (r1) oznaka u naslovu iza godine ne brise godinu;
 *   (r2) "(godina)." iza autorova dijela bez godine i tocke je drugi red istog zapisa;
 *   (r4) drugi prolaz nad tekstovima zapisa daje iste zapise (tekst, metapodaci, nalazi).
 *
 * `loadReferenceParser(mutate)` izvrsava STVARNI izvor `src/citations/author-year.ts`, po zelji
 * mutiran u memoriji, pa mutacije u gate-mutations mijenjaju parser, a ne njegov rezultat.
 */
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { normalize, sectionName } from '../../src/utils/helpers';

type Ref = { text: string; author?: string; year?: string; noDate?: string; p?: number };
type Para = { text: string; headingLevel?: number };
export type ReferenceParser = {
  extractReferences: (paragraphs: Para[], lang: string) => { entries: Ref[] };
  isIncompleteReference: (r: Ref) => boolean;
};

const SOURCE = 'src/citations/author-year.ts';

export function referenceParserSource(): string {
  return readFileSync(resolve(process.cwd(), SOURCE), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Uklanja TypeScript tipove. `node:module` `stripTypeScriptTypes` postoji tek od Node 22.13 / 23.2, a CI
 * matrica vrti i Node 20; tada se koristi esbuild (devDependency) koji radi isto bez promjene redaka.
 */
type Strip = ((code: string) => string) | null | undefined;
const nodeStrip: Strip = (nodeModule as { stripTypeScriptTypes?: (code: string) => string }).stripTypeScriptTypes;

/** `strip` null znaci: prisilno esbuild (dokaz Node 20 grane i na novijem Nodeu). */
export function stripTypes(src: string, strip: Strip = nodeStrip): string {
  if (typeof strip === 'function') return strip(src);
  return transformSync(src, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
}

export function loadReferenceParser(mutate: (src: string) => string = (s) => s, strip: Strip = nodeStrip): ReferenceParser {
  const src = mutate(referenceParserSource());
  const js = stripTypes(src, strip)
    .replace(/^import .*$/m, '')
    .replace(/^export \{([^}]*)\};?\s*$/m, 'return {$1};')
    .replace(/^export /gm, '');
  return new Function('normalize', 'sectionName', js)(normalize, sectionName) as ReferenceParser;
}

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
const OZNAKA_U_NASLOVU = 'Peric, T. (2013). Mediji (u tisku) i javnost. Zadar: Primjer naklada.';
const OZNAKA_GODINA_NA_KRAJU = 'Peric, T. Mediji (u tisku) i javnost. Zadar: Primjer naklada, 2013.';
// R2b: prethodni zapis bez godine (vise recenica) nije autorov red; iduci "(2011)." je zaseban zapis.
const BEZ_GODINE_PA_GODINA = ['Hrvatski zavod. Godisnje izvjesce. Zagreb: Naklada', '(2011). Prirucnik za poslodavce. Zagreb: Ogledni izdavac.'];
const VISEREDNI = [
  ['Horvat, A.', '(2011). Lokalna samouprava u praksi. Zagreb: Primjer naklada.'],
  ['HZZ.', '(2011). Godisnje izvjesce o zaposljavanju. Zagreb: Ogledni izdavac.'],
  ['Hrvatski zavod za zaposljavanje', '(2011). Godisnje izvjesce o zaposljavanju. Zagreb: Ogledni izdavac.'],
  ['Juric, I. (2016). Javne politike u lokalnoj samoupravi', 'Rijeka: Primjer naklada.'],
  ['Ministarstvo uprave Republike Hrvatske', '(b.g.). Smjernice za savjetovanje. Zagreb: Primjer naklada.'],
];

function refs(p: ReferenceParser, lines: string[]): Ref[] {
  const paragraphs: Para[] = [{ text: 'Uvod', headingLevel: 1 }, { text: 'Tekst rada.' }, { text: 'Literatura', headingLevel: 1 }, ...lines.map((text) => ({ text }))];
  return p.extractReferences(paragraphs, 'hr').entries;
}

const pogled = (p: ReferenceParser, r: Ref[]) => r.map((x) => ({ text: x.text, author: x.author ?? '', year: x.year ?? '', noDate: x.noDate ?? '', nalaz: p.isIncompleteReference(x) }));

export function referenceParserProblems(p: ReferenceParser): string[] {
  const problems: string[] = [];
  const inc = (r: Ref) => p.isIncompleteReference(r);
  const a = refs(p, POTPUNI.flatMap((x, i) => [x, BEZ_AUTORA[i]]));
  if (a.length !== 4) problems.push(`(a) "(godina)." bez autora spojen s prethodnim: ${a.length} zapisa umjesto 4`);
  if (a.filter(inc).length !== 2) problems.push(`(a) zapisi bez autora nisu prijavljeni kao nepotpuni: ${a.filter(inc).length} umjesto 2`);
  const b = refs(p, BEZ_GODINE);
  if (b.length !== BEZ_GODINE.length) problems.push(`(b) oznaka bez godine: ${b.length} zapisa umjesto ${BEZ_GODINE.length}`);
  const lazni = b.filter(inc).length;
  if (lazni) problems.push(`(b) ${lazni} potpunih zapisa s oznakom bez godine prijavljeno kao nepotpuno`);
  const r1 = refs(p, [OZNAKA_U_NASLOVU]);
  for (const linija of [OZNAKA_U_NASLOVU, OZNAKA_GODINA_NA_KRAJU]) {
    const r1 = refs(p, [linija]);
    if (r1.length !== 1 || r1[0].year !== '2013' || r1[0].noDate) problems.push(`(r1) oznaka u naslovu uz godinu: godina "${r1[0]?.year ?? ''}", oznaka "${r1[0]?.noDate ?? ''}"`);
  }
  const r2b = refs(p, BEZ_GODINE_PA_GODINA);
  if (r2b.length !== 2 || !r2b.every(inc)) problems.push(`(r2b) zapis bez godine progutao iduci "(2011).": ${r2b.length} zapisa, nepotpunih ${r2b.filter(inc).length}`);
  for (const lines of VISEREDNI) {
    const r = refs(p, lines);
    if (r.length !== 1) problems.push(`(r2) viseredni zapis "${lines[0]}" razdvojen u ${r.length} zapisa`);
    else if (!r[0].author || inc(r[0])) problems.push(`(r2) viseredni zapis "${lines[0]}" bez autora ili nepotpun (autor "${r[0].author ?? ''}")`);
  }
  for (const lines of [POTPUNI.flatMap((x, i) => [x, BEZ_AUTORA[i]]), BEZ_GODINE, [OZNAKA_U_NASLOVU], [OZNAKA_GODINA_NA_KRAJU], BEZ_GODINE_PA_GODINA, ...VISEREDNI]) {
    const prvi = refs(p, lines);
    const drugi = refs(p, prvi.map((x) => x.text));
    if (JSON.stringify(pogled(p, drugi)) !== JSON.stringify(pogled(p, prvi))) problems.push(`(r4) drugi prolaz nije no-op za "${lines[0]}"`);
  }
  const kontrola = refs(p, POTPUNI);
  if (kontrola.length !== POTPUNI.length || kontrola.some(inc)) problems.push('kontrola: obicni potpuni zapisi vise nisu cisti');
  return problems;
}
