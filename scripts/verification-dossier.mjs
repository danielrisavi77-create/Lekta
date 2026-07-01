/**
 * Verifikacijski dosje za jednu celiju (profil): priprema za ljudski verifikacijski pass.
 *
 * Za svako draft pravilo ispisuje vrijednost, autoritet, izvor, sourcePage i doslovni
 * citat, te ga svrstava u "spremno za verifikaciju" (sluzbeni autoritet + snapshotiran
 * izvor + sourcePage + citat) ili "advisory/nepotpuno". Covjek otvori PDF snapshot u
 * konzoli uz svako pravilo, provjeri vrijednost protiv citata na lokatoru, pa Potvrdi.
 * Ovo NE proglasava nista verified; samo skraćuje kopanje po PDF-u.
 *
 * Pokretanje: node scripts/verification-dossier.mjs <profileId>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const profileId = process.argv[2];
if (!profileId) {
  console.error('Upotreba: node scripts/verification-dossier.mjs <profileId>');
  process.exit(1);
}

const drafts = readJson('data/profiles/pravo/drafts/law-drafts.json');
const sources = readJson('data/sources/source-registry.json');
const srcById = new Map(sources.map((s) => [s.id, s]));
const OFFICIAL = new Set(['binding', 'program-page', 'general']);

const entries = drafts.profiles[profileId];
if (!entries) {
  console.error(`Profil "${profileId}" nije u stagingu (data/profiles/pravo/drafts/law-drafts.json).`);
  process.exit(1);
}

function snapshotted(sourceId) {
  const s = srcById.get(sourceId);
  return !!s && s.snapshotPath != null && s.snapshotHash != null;
}
function readyToVerify(e) {
  return OFFICIAL.has(e.authority) && e.sourceId && e.sourcePage && e.quote && snapshotted(e.sourceId);
}

const ready = entries.filter(readyToVerify);
const rest = entries.filter((e) => !readyToVerify(e));

const out = [];
out.push(`# Verifikacijski dosje: ${profileId}`);
out.push('');
out.push('Covjek potvrdjuje, AI ne proglasava verified. Otvori PDF snapshot u konzoli (verification.html, gumb "Prikazi izvor") uz svako pravilo i provjeri vrijednost protiv citata na lokatoru.');
out.push('');
out.push(`Ukupno pravila: ${entries.length}. Spremno za verifikaciju: ${ready.length}. Advisory/nepotpuno: ${rest.length}.`);
out.push('');

out.push(`## Spremno za verifikaciju (${ready.length})`);
out.push('');
out.push('Provjeri vrijednost protiv citata, pa u konzoli unesi verifiedBy i Potvrdi.');
out.push('');
for (const e of ready) {
  out.push(`### ${e.checkId} - ${e.label ?? e.ruleId}`);
  out.push(`- Vrijednost: \`${JSON.stringify(e.value)}\``);
  out.push(`- Autoritet: ${e.authority}`);
  out.push(`- Izvor: ${e.sourceId} (${e.sourcePage})`);
  out.push(`- Citat: "${e.quote}"`);
  out.push('');
}

out.push(`## Advisory ili nepotpuno (${rest.length})`);
out.push('');
out.push('Bez sljedivog snapshotiranog izvora ili oznaceno kao preporuka; ne boduje se. Mogu se Advisory u konzoli ili cekati citanje vlastitog izvora.');
out.push('');
for (const e of rest) {
  const reasons = [];
  if (!OFFICIAL.has(e.authority)) reasons.push('nije sluzbeni autoritet');
  if (!e.sourceId) reasons.push('nema sourceId');
  else if (!snapshotted(e.sourceId)) reasons.push('izvor nije snapshotiran');
  if (!e.sourcePage) reasons.push('nema sourcePage');
  if (!e.quote) reasons.push('nema citat');
  if (e.status === 'advisory') reasons.push('oznaceno advisory');
  out.push(`- \`${e.checkId}\` - ${e.label ?? e.ruleId}: ${reasons.join(', ') || 'nepotpuno'}`);
}
out.push('');

mkdirSync(p('data/profiles/pravo/dossiers'), { recursive: true });
const target = p(`data/profiles/pravo/dossiers/${profileId}.md`);
writeFileSync(target, out.join('\n') + '\n');
console.log(`Dosje zapisan: data/profiles/pravo/dossiers/${profileId}.md (spremno ${ready.length}, advisory/nepotpuno ${rest.length}).`);
