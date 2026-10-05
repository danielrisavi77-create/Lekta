// scripts/generated-pages-golden.mjs
//
// Golden SADRZAJA generiranih javnih stranica (mobilni audit PR 5). Vrti pet generatora u privremenu mapu uz fiksni
// datum, za svaku HTML stranicu racuna sha256 sadrzaja bez omotaca (scripts/lib/generated-page-content.mjs) i
// usporedjuje ga s tests/fixtures/generated-pages-golden.json.
//
//   npm run generated-golden                       provjera (izlaz 1 na razliku)
//   node scripts/generated-pages-golden.mjs --write   zapisi golden (samo u cistom izoliranom stablu)
//   node scripts/generated-pages-golden.mjs --dump D  uz provjeru zapisi sadrzaj svake stranice u mapu D (za diff)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GENERATORI, GOLDEN_DATUM, contentDigests, listFiles, pageContent, runGenerators } from './lib/generated-page-content.mjs';

const GOLDEN_PATH = 'tests/fixtures/generated-pages-golden.json';

function buildGolden(root = process.cwd()) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lekta-golden-'));
  try {
    runGenerators(tmp, { root });
    return { tmp, golden: { schemaVersion: 1, buildDate: GOLDEN_DATUM, generators: [...GENERATORI], pages: contentDigests(tmp) } };
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

function main() {
  const args = process.argv.slice(2);
  const { tmp, golden } = buildGolden();
  try {
    if (args.includes('--write')) {
      fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
      console.log(`[generated-pages-golden] zapisano ${GOLDEN_PATH}: ${Object.keys(golden.pages).length} stranica`);
      return;
    }
    const dumpIdx = args.indexOf('--dump');
    if (dumpIdx >= 0) {
      const d = args[dumpIdx + 1];
      for (const f of listFiles(tmp).filter((x) => x.endsWith('.html'))) {
        const out = path.join(d, `${f}.json`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, `${JSON.stringify(pageContent(fs.readFileSync(path.join(tmp, f), 'utf8')), null, 2)}\n`);
      }
    }
    const stari = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
    const razlike = [];
    for (const k of new Set([...Object.keys(stari.pages), ...Object.keys(golden.pages)])) {
      if (stari.pages[k] !== golden.pages[k]) razlike.push(`${k}: ${stari.pages[k] ? (golden.pages[k] ? 'sadrzaj promijenjen' : 'stranica nestala') : 'nova stranica'}`);
    }
    if (razlike.length) {
      console.error(`[generated-pages-golden] RAZLIKA u ${razlike.length} stranica:\n  ${razlike.slice(0, 20).join('\n  ')}`);
      process.exitCode = 1;
    } else {
      console.log(`[generated-pages-golden] OK: ${Object.keys(golden.pages).length} stranica, sadrzaj jednak goldenu`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
