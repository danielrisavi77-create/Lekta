// Deterministicki "split" prototipa u Vite izvore.
//
// Cita single-file prototip (markup + inline <script> s cijelim runtimeom) i
// generira:
//   - src/main.ts   = inline JS iz prototipa, s `// @ts-nocheck` na vrhu
//   - index.html    = isti markup, ali inline <script> zamijenjen module entryjem
//
// Time je tvoj pristini prototip jedini izvor istine (byte-faithful), bez rucnog
// prepisivanja ~2500 linija. Vidi docs/CLAUDE.md (backlog 3: razbijanje main.ts).
//
//   Izvor (prvi koji postoji):
//     reference/prototype.html
//     reference/Lekta_v2_2_2_Full_Institutional_Coverage_Matrix.html
//
//   Pokretanje:  node scripts/split-prototype.mjs   (ili: npm run bootstrap)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CANDIDATES = [
  'reference/prototype.html',
  'reference/Lekta_v2_2_2_Full_Institutional_Coverage_Matrix.html',
];

const sourceRel = CANDIDATES.find((rel) => existsSync(join(root, rel)));
if (!sourceRel) {
  console.error(
    '[bootstrap] Nije pronaden izvorni prototip. Stavi pristinu single-file verziju u:\n' +
      CANDIDATES.map((c) => '  - ' + c).join('\n'),
  );
  process.exit(1);
}

const sourcePath = join(root, sourceRel);
const html = readFileSync(sourcePath, 'utf8');

// Pronadi inline <script> bez atributa (veliki runtime blok). Namjerno NE matchamo
// <script type="module" ...> ni <script src="...">.
const openTag = '<script>';
const open = html.indexOf(openTag);
const close = open >= 0 ? html.indexOf('</script>', open) : -1;

if (open < 0 || close < 0) {
  console.error(
    `[bootstrap] U "${sourceRel}" nije pronaden inline <script>...</script> blok.\n` +
      'Provjeri da si stavio izvorni single-file prototip (s cijelim JS-om unutar <script>).',
  );
  process.exit(1);
}

const js = html.slice(open + openTag.length, close).replace(/^\r?\n/, '');
const mainTs = '// @ts-nocheck\n' + js.replace(/\s+$/, '') + '\n';
writeFileSync(join(root, 'src/main.ts'), mainTs, 'utf8');

const indexHtml =
  html.slice(0, open) +
  '<script type="module" src="/src/main.ts"></script>' +
  html.slice(close + '</script>'.length);
writeFileSync(join(root, 'index.html'), indexHtml, 'utf8');

const kb = (n) => Math.round(n / 1024);
console.log(
  `[bootstrap] OK iz "${sourceRel}":\n` +
    `  src/main.ts  (${kb(Buffer.byteLength(mainTs))} KB)\n` +
    `  index.html   (${kb(Buffer.byteLength(indexHtml))} KB)\n` +
    'SljedeÄe:  npm run check  pa  npm run dev',
);
