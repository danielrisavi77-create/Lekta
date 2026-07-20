// scripts/word-verify/repair.mts
//
// Provuce .docx kroz PRAVI repair motor (src/repair/apply-fixers) s tipicnim skupom pravila
// jednog profila, i javi sto je primijenjeno, sto preskoceno i jesu li nedirnuti dijelovi
// izasli bit-identicni.
//
// Namjerno koristi ISTE pozive kao repair-docx Edge funkcija, da se ne provjerava neka
// paralelna, ljepsa verzija motora.
//
//   npx vite-node scripts/word-verify/repair.mts -- <ulaz.docx> <izlaz.docx>
import { readFileSync, writeFileSync } from 'node:fs';
import { applyFixers, type FixerRequest } from '../../src/repair/apply-fixers.ts';
import { readZip } from '../../src/repair/zip-codec.ts';

// Tipican profil: Times New Roman 12, prored 1,5, obostrano, margine 3/2,5 cm, A4.
// POZOR na jedinice: margins/paper-size primaju CENTIMETRE, font prima PT, prored MNOZITELJ.
const REQUESTS: FixerRequest[] = [
  { ruleId: 'margine', fixerId: 'margins-fixer', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 } },
  { ruleId: 'format', fixerId: 'paper-size-fixer', params: { w: 21, h: 29.7 } },
  { ruleId: 'font', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12, deep: true } },
  { ruleId: 'prored', fixerId: 'line-spacing-fixer', params: { multiplier: 1.5, deep: true } },
  { ruleId: 'poravnanje', fixerId: 'alignment-fixer', params: { val: 'both', deep: true } },
  { ruleId: 'razmaci', fixerId: 'paragraph-spacing-fixer', params: { deep: true } },
  { ruleId: 'prazni-odlomci', fixerId: 'empty-paragraph-fixer', params: {} },
  { ruleId: 'fusnote-razmak', fixerId: 'footnote-spacing-fixer', params: { deep: true } },
  // Naslovi: razina 1 podebljana 14 pt, razine 2 i 3 podebljane 12 pt, sve poravnato slijeva.
  {
    ruleId: 'naslovi', fixerId: 'heading-format-fixer', params: {
      targets: [
        { level: 1, sizeHalfPoints: 28, bold: true, alignLeft: true },
        { level: 2, sizeHalfPoints: 24, bold: true, alignLeft: true },
        { level: 3, sizeHalfPoints: 24, bold: true, alignLeft: true },
      ],
    },
  },
  // Fusnote: Times New Roman 10 pt, obostrano.
  { ruleId: 'fusnote-tipografija', fixerId: 'footnote-typography-fixer', params: { fontName: 'Times New Roman', fontSizePt: 10, alignJustify: true } },
];

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('uporaba: vite-node scripts/word-verify/repair.mts -- <ulaz.docx> <izlaz.docx>');
  process.exit(2);
}

const bytes = new Uint8Array(readFileSync(inPath));
const before = await readZip(bytes);
const result = await applyFixers(bytes, REQUESTS);
writeFileSync(outPath, result.docxBytes);
const after = await readZip(result.docxBytes);

const beforeMap = new Map(before.map((e) => [e.name, e.data]));
const afterMap = new Map(after.map((e) => [e.name, e.data]));
const same = (a?: Uint8Array, b?: Uint8Array): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const lost = [...beforeMap.keys()].filter((n) => !afterMap.has(n));
const added = [...afterMap.keys()].filter((n) => !beforeMap.has(n));
const changed = [...beforeMap.keys()].filter((n) => afterMap.has(n) && !same(beforeMap.get(n), afterMap.get(n)));

console.log(JSON.stringify({
  ulaz: inPath,
  dijelovaPrije: before.length,
  dijelovaPoslije: after.length,
  primijenjeno: result.changelog.map((c) => c.ruleId),
  preskoceno: result.skipped,
  izgubljeniDijelovi: lost,
  dodaniDijelovi: added,
  promijenjeniDijelovi: changed,
  bitIdenticnih: beforeMap.size - changed.length - lost.length,
}, null, 2));
