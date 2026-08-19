// scripts/word-verify/repair-toc.mts
//
// Provuce .docx kroz SAMO toc-field-fixer, izolirano, da se ucinak drugih popravaka ne mijesa
// u mjerenje vidljivog teksta.
//
// Zahtjev se gradi PROIZVODNIM putem (tocFieldItem iz repair-items), ne rucno: rucno slozen
// params ne prodje sanitizaciju i zavrsi kao 'invalid-params', pa bi oracle mjerio PRESKOCEN
// popravak i lazno javio da je sve u redu.
//
//   npx vite-node scripts/word-verify/repair-toc.mts -- <ulaz.docx> <izlaz.docx>
import { readFileSync, writeFileSync } from 'node:fs';
import { applyFixers, type FixerRequest } from '../../src/repair/apply-fixers.ts';
import { installXmlDomParser } from '../../src/docx/xml-dom-install.ts';
import { analyzeFixture, resolveProfile } from '../../src/analysis/golden-entry.ts';
import { tocFieldItem } from '../../src/ui/repair-items.ts';

installXmlDomParser(true);

const args = process.argv.slice(2).filter((a) => a !== '--');
const [input, output] = args;
if (!input || !output) {
  console.error('Uporaba: npx vite-node scripts/word-verify/repair-toc.mts -- <ulaz.docx> <izlaz.docx>');
  process.exit(1);
}

const PROFILE_ID = 'fpzg-politologija-diplomski';
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const bytes = new Uint8Array(readFileSync(input));
const analysis = await analyzeFixture(new File([bytes], 'toc.docx', { type: MIME }), { profileId: PROFILE_ID });

console.log(`sadrzajParagraphIndex: ${analysis.details?.sadrzajParagraphIndex ?? '(nema)'}`);
console.log(`hasTocField:           ${analysis.details?.hasTocField ?? false}`);

const items = tocFieldItem(analysis, resolveProfile(PROFILE_ID));
if (items.length === 0) {
  console.error('toc-field-fixer se NE nudi za ovaj dokument; oracle bi mjerio nista. Provjeri fixture.');
  process.exit(1);
}

const requests: FixerRequest[] = items.map((it) => ({ fixerId: it.fixerId, ruleId: it.ruleId, params: it.params } as FixerRequest));
const applied = await applyFixers(bytes, requests);

if (applied.integrityFailure) {
  console.error(`VRATA INTEGRITETA ODBILA: ${applied.integrityFailure.part}: ${applied.integrityFailure.problem}`);
  process.exit(1);
}
if (applied.changelog.length === 0) {
  console.error(`popravak NIJE primijenjen (preskoceno: ${JSON.stringify(applied.skippedReasons)}); oracle bi mjerio original.`);
  process.exit(1);
}

writeFileSync(output, applied.docxBytes);
console.log(`primijenjeno: ${applied.changelog.map((c) => c.fixerId).join(', ')}`);
console.log(`zapisano: ${output}`);
