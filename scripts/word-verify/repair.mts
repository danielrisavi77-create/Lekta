// scripts/word-verify/repair.mts
//
// Provuce .docx kroz PRAVI repair motor (src/repair/apply-fixers) s tipicnim skupom pravila
// jednog profila, i javi sto je primijenjeno, sto preskoceno i jesu li nedirnuti dijelovi
// izasli bit-identicni.
//
// Namjerno koristi ISTE pozive kao repair-docx Edge funkcija, da se ne provjerava neka
// paralelna, ljepsa verzija motora. Logika je u `repair-core.mts` da je vitest moze pozvati
// izravno; ovdje je samo citanje, zapis i ispis JSON-a.
//
// JSON izlaz nosi `integrityFailure` (null ili {part, problem}). Kad nije null, vrata integriteta
// su ODBILA popravak i zapisani `<izlaz.docx>` je bit-identican ULAZU: Word bi otvorio original i
// razina bi lazno prosla. Zato ga check.ps1, check-worst-case.ps1 i check-corpus.ps1 broje kao PAD
// (`src/repair/CLAUDE.md`: test isporuke mora izricito tvrditi `integrityFailure === null`).
//
//   npx vite-node scripts/word-verify/repair.mts -- <ulaz.docx> <izlaz.docx>
import { readFileSync, writeFileSync } from 'node:fs';
import { installXmlDomParser } from '../../src/docx/xml-dom-install.ts';
import { runOracleRepair } from './repair-core.mts';

installXmlDomParser(true);

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('uporaba: vite-node scripts/word-verify/repair.mts -- <ulaz.docx> <izlaz.docx>');
  process.exit(2);
}

const bytes = new Uint8Array(readFileSync(inPath));
const { docxBytes, report } = await runOracleRepair(bytes, inPath);
writeFileSync(outPath, docxBytes);
console.log(JSON.stringify(report, null, 2));
