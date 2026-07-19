// scripts/emit-repair-samples.mjs
//
// WS-4 pomagalo: nad PRAVIM .docx radovima generira izlaze tamnih strukturnih fixera
// (K5 podnozje, K6 numeriranje od Uvoda, K7 TOC polje) na disk, spremne za RUCNU
// validaciju u Wordu I LibreOfficeu. Golden dokazuje samo XML-transform; realnu Word/LO
// valjanost mora potvrditi covjek prije nego se zastavice (SECTION_INSERT_LIVE / TOC_FIELD_LIVE)
// upale i fixeri maknu iz DARK_FIXERS (supabase/functions/repair-docx/index.ts).
//
// Pokretanje (treba vite-node jer uvozi TS engine; applyFixers je cist, bez DOM-a):
//   npx vite-node scripts/emit-repair-samples.mjs                 # default: ~/Documents + fixtures
//   npx vite-node scripts/emit-repair-samples.mjs "C:/put/do/mape"   # vlastita mapa
//   npx vite-node scripts/emit-repair-samples.mjs "C:/mapa" "tmp/out"  # + izlazna mapa
//
// Fixeri sami RE-DERIVIRAJU sidro po tekstu ("Uvod" / "Sadrzaj"), pa NE treba analiza:
// prosljedjuje se samo nominalni gate (introParagraphIndex/sadrzajParagraphIndex). Dokument koji
// ne pase (visesekcijski, bez Uvoda/Sadrzaja) daje no-op (fail-safe) i prijavljuje se u REPORT.md.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { applyFixers } from '../src/repair/apply-fixers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const abs = (p) => (isAbsolute(p) ? p : join(process.cwd(), p));

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const OUT_DIR = args[1] ? abs(args[1]) : join(repoRoot, 'tmp', 'repair-samples');

// Ulazne mape: eksplicitni arg, inace korisnikova Dokumenti mapa (vise mogucih imena) + repo fixture-i.
const inputDirs = args[0]
  ? [abs(args[0])]
  : [
      join(homedir(), 'Documents'),
      join(homedir(), 'Dokumenti'),
      join(homedir(), 'OneDrive', 'Documents'),
      join(homedir(), 'OneDrive', 'Dokumenti'),
      join(repoRoot, 'tests', 'fixtures', 'docx'),
    ];

// Baterija: svaki fixer sam re-derivira sidro; nominalni gate params su dovoljni.
// K6 (section-insert) je KOMPOZIT: umece prijelom + rimski/arapski + podnozje + titlePg.
const BATTERY = [
  {
    key: 'K5-footer',
    requests: [{ ruleId: 'footer-page', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 0, align: 'center' } } }],
  },
  {
    key: 'K6-numbering-from-intro',
    requests: [{ ruleId: 'section-insert-intro', fixerId: 'section-insert-fixer', params: { target: { introParagraphIndex: 2, align: 'center' } } }],
  },
  {
    key: 'K7-toc-field',
    requests: [{ ruleId: 'toc-field', fixerId: 'toc-field-fixer', params: { target: { sadrzajParagraphIndex: 1 } } }],
  },
];

const CAP = 25; // gornja granica dokumenata po pokretanju (da masovna mapa ne eksplodira)

function listDocx(dir) {
  if (!existsSync(dir)) return [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => /\.docx$/i.test(n) && !n.startsWith('~$') && !/__(?:K5|K6|K7|original)/.test(n))
    .map((n) => join(dir, n));
}

const CHECKLIST = [
  '### K5 podnožje (`__K5-footer.docx`)',
  '- [ ] Broj stranice vidljiv u podnožju, centriran, ispravno inkrementira.',
  '- [ ] Word I LibreOffice otvaraju BEZ upozorenja "nečitljiv sadržaj / popravi".',
  '- [ ] Ako original već ima ispravno podnožje: nema `__K5` datoteke (no-op) — to je u redu.',
  '',
  '### K6 numeriranje od Uvoda (`__K6-numbering-from-intro.docx`)',
  '- [ ] Prednji dio (naslovnica, sažetak, sadržaj) = RIMSKI brojevi (i, ii, iii…).',
  '- [ ] Glavni tekst od Uvoda = ARAPSKI, počinje od 1.',
  '- [ ] Naslovnica BEZ broja stranice.',
  '- [ ] Prijelom sekcije je TOČNO prije Uvoda; ništa nije izgubljeno ni pomaknuto.',
  '- [ ] Provjeri u OBA preglednika (LibreOffice drukčije rukuje sekcijama).',
  '- [ ] Fixer radi SAMO na jednosekcijskom radu; višesekcijski = no-op (nema `__K6` datoteke).',
  '',
  '### K7 živo TOC polje (`__K7-toc-field.docx`)',
  '- [ ] Word: klik u sadržaj → F9 (ili „Ažuriraj polje") → generira TOC iz naslova.',
  '- [ ] Ručno utipkane stavke sadržaja NISU obrisane (nedestruktivno).',
  '- [ ] Nema DVA sadržaja (nije duplicirano).',
  '- [ ] LibreOffice: OČEKIVANO placeholder dok ne pritisneš F9 — NIJE bug (poznato ograničenje).',
  '',
  '---',
  'Kad sve tri prođu na barem par pravih radova: javi, pa upalim `SECTION_INSERT_LIVE`/`TOC_FIELD_LIVE`,',
  'maknem fixere iz `DARK_FIXERS` (repair-docx) i dodam prave-dokument golden fixture.',
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const existing = inputDirs.filter(existsSync);
  const seen = new Set();
  const files = [];
  for (const d of inputDirs) {
    for (const f of listDocx(d)) {
      const key = basename(f).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(f);
    }
  }
  const capped = files.slice(0, CAP);

  console.log(`Ulazne mape (postoje): ${existing.join(', ') || '(nijedna — proslijedi put kao 1. argument)'}`);
  console.log(`Pronađeno ${files.length} .docx${files.length > CAP ? `, obrađujem prvih ${CAP}` : ''}.`);
  console.log(`Izlaz: ${OUT_DIR}\n`);
  if (!capped.length) {
    console.log('Nema .docx za obradu. Primjer: npx vite-node scripts/emit-repair-samples.mjs "C:/Users/PC/Documents"');
    return;
  }

  const report = [
    '# WS-4 repair uzorci',
    '',
    `Generirano nad ${capped.length} dokumenata. Otvori svaki \`__*.docx\` u **Wordu I LibreOfficeu** i usporedi s \`__original.docx\`.`,
    '',
    '| Dokument | K5 podnožje | K6 numeriranje od Uvoda | K7 TOC polje |',
    '|---|---|---|---|',
  ];

  let anyK6 = false;
  let anyK7 = false;
  for (const file of capped) {
    const name = basename(file).replace(/\.docx$/i, '');
    let bytes;
    try {
      bytes = new Uint8Array(readFileSync(file));
    } catch (e) {
      console.log(`SKIP ${name}: ne mogu čitati (${String(e).slice(0, 60)})`);
      continue;
    }
    try {
      copyFileSync(file, join(OUT_DIR, `${name}__original.docx`));
    } catch {
      /* neblokirajuce */
    }

    const row = [name];
    for (const b of BATTERY) {
      let cell = '—';
      try {
        const res = await applyFixers(bytes, b.requests);
        if (res.changelog.length > 0) {
          const outName = `${name}__${b.key}.docx`;
          writeFileSync(join(OUT_DIR, outName), Buffer.from(res.docxBytes));
          const cl = res.changelog.map((c) => `${c.beforeLabel} -> ${c.afterLabel}`).join('; ');
          writeFileSync(join(OUT_DIR, `${outName}.changelog.txt`), cl + '\n');
          cell = `✅ ${outName}`;
          if (b.key.startsWith('K6')) anyK6 = true;
          if (b.key.startsWith('K7')) anyK7 = true;
          console.log(`  ${name} · ${b.key}: PRIMIJENJENO (${res.changelog.length}) -> ${outName}`);
        } else {
          cell = '— (nije primjenjivo)';
          console.log(`  ${name} · ${b.key}: no-op (${res.skipped.join(', ') || 'nema sidra po tekstu'})`);
        }
      } catch (e) {
        cell = '⚠ greška';
        console.log(`  ${name} · ${b.key}: GREŠKA ${String(e).slice(0, 80)}`);
      }
      row.push(cell);
    }
    report.push(`| ${row.join(' | ')} |`);
  }

  if (!anyK6) report.push('', '> Nijedan dokument nije aktivirao K6 (svi su višesekcijski ili bez „Uvod" naslova). Za validaciju K6 nađi/napravi JEDNOSEKCIJSKI rad s naslovom Uvod.');
  if (!anyK7) report.push('', '> Nijedan dokument nije aktivirao K7 (nijedan nema naslov „Sadržaj" bez već postojećeg TOC polja).');

  report.push('', '## Što provjeriti u Wordu I LibreOfficeu', '', ...CHECKLIST);
  writeFileSync(join(OUT_DIR, 'REPORT.md'), report.join('\n') + '\n');
  console.log(`\nGotovo. Otvori:\n  ${join(OUT_DIR, 'REPORT.md')}\ni uzorke (__K5/__K6/__K7 uz __original) u Wordu + LibreOfficeu.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
