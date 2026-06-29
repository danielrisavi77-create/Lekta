// Data extraction (CLAUDE.md backlog 1): izvuci registre iz src/main.ts u data/**.
//
// PREDUVJET: src/main.ts mora biti puni runtime (pokreni `npm run bootstrap` prvo).
// Dok je main.ts bootstrap stub, ova skripta nista ne nalazi i jasno to javi.
//
// Sto radi: za svaki imenovani `const NAME = <literal>;` na vrhu main.ts,
// izrezuje literal (balansiranjem zagrada uz postivanje stringova), evaluira ga u
// izoliranom vm kontekstu (literali su cisti podaci, bez DOM-a) i zapisuje kao
// data/<putanja>.json. NE mijenja main.ts (nedestruktivno); rewiring importa je
// zaseban korak (backlog 3). Emitira i data/manifest.json.
//
//   Pokretanje:  node scripts/extract-data.mjs   (ili: npm run extract-data)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = join(root, 'src/main.ts');
const src = readFileSync(mainPath, 'utf8');

// Registri koje izvlacimo i njihove ciljne JSON datoteke (relativno na data/).
const TARGETS = [
  ['VERIFIED_PROFILE_REGISTRY', 'profiles/verified-profiles.json'],
  ['LEGAL_DEPARTMENT_REGISTRY', 'profiles/legal-departments.json'],
  ['PROFILE_STATUS', 'profiles/profile-status.json'],
  ['PROFILE_AUTHORITY', 'profiles/profile-authority.json'],
  ['BASE_PROFILES', 'profiles/base-profiles.json'],
  ['FPZG_PARTIAL', 'profiles/fpzg-partial.json'],
  ['ZAGREB_CATALOG', 'catalog/zagreb-catalog.json'],
  ['INSTITUTIONAL_COVERAGE_MATRIX', 'coverage/institutional-coverage-matrix.json'],
  ['COVERAGE_STATUS_META', 'coverage/coverage-status-meta.json'],
  ['SOCIAL_METHOD_REGISTRY', 'methodology/social-methods.json'],
  ['SOCIAL_METHOD_SOURCE', 'methodology/social-method-source.json'],
  ['FPZG_SUBMISSION_CALENDAR', 'submission/fpzg-calendar.json'],
  ['PACKAGES', 'packages.json'],
  ['CHECK_ITEMS', 'checks/check-items.json'],
  ['WORK_TYPE_LABELS', 'work-type-labels.json'],
];

const OPEN = { '[': ']', '{': '}', '(': ')' };
const CLOSE = { ']': '[', '}': '{', ')': '(' };

/** Vrati tekst literala koji pocinje na indexu `from` (mora biti zagrada). */
function sliceLiteral(text, from) {
  const stack = [];
  let inStr = null; // ' " `
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (OPEN[ch]) stack.push(ch);
    else if (CLOSE[ch]) {
      const last = stack.pop();
      if (last !== CLOSE[ch]) throw new Error(`Neuravnotezene zagrade kod ${i}`);
      if (stack.length === 0) return text.slice(from, i + 1);
    }
  }
  throw new Error('Literal nije zatvoren do kraja datoteke.');
}

function extract(name) {
  const decl = `const ${name}=`;
  const at = src.indexOf(decl);
  if (at < 0) return undefined;
  const start = at + decl.length;
  const open = src[start];
  if (!OPEN[open]) return undefined; // npr. new Set(...) ili poziv funkcije; preskoci
  const literal = sliceLiteral(src, start);
  return runInNewContext('(' + literal + ')', Object.create(null));
}

const manifest = [];
let written = 0;
for (const [name, rel] of TARGETS) {
  let value;
  try {
    value = extract(name);
  } catch (e) {
    console.error(`[extract] ${name}: ${e.message}`);
    continue;
  }
  if (value === undefined) {
    console.warn(`[extract] ${name}: nije pronaden kao literal (preskocen).`);
    continue;
  }
  const outPath = join(root, 'data', rel);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  manifest.push({ name, file: 'data/' + rel, entries: count });
  written++;
  console.log(`[extract] ${name} -> data/${rel} (${count})`);
}

if (written === 0) {
  console.error(
    '\n[extract] Nista nije izvuceno. Je li src/main.ts jos bootstrap stub?\n' +
      'Pokreni `npm run bootstrap` (vidi BOOTSTRAP.md) pa ponovi.',
  );
  process.exit(1);
}

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n[extract] OK: ${written} registara u data/**. Manifest: data/manifest.json`);
console.log('SljedeÄe: dodaj tipizirane loadere (src/{catalog,coverage,...}) i prebaci main.ts da cita iz data/ (backlog 3).');
