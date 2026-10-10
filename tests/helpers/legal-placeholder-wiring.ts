/**
 * Gard 3a iz scripts/verify-deploy-dist.mjs izvrsen stvarno (T86): pravni tekst s oznakom
 * `[ODLUKA VLASNIKA: ...]` ili `[PROVJERITI: ...]` ne smije u objavu.
 *
 * Isti obrazac kao `seo-origin-wiring.ts`: iz izvora skripte izrezuje se BLOK garda (od komentara
 * `// 3a. pravni tekst` do `// 3b.`) i izvrsava nad sintetickim distom, s `fail` koji biljezi
 * poruke. Zakomentiran `fail` ili izbacen sken JS bundlea tada daju nula poruka i mutacija je uhvacena.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LEGAL_PAGES } from '../../scripts/lib/legal-pages.mjs';
import { findLegalPlaceholders } from '../../scripts/lib/legal-placeholders.mjs';

const POCETAK = '// 3a. pravni tekst';
const KRAJ = '// 3b.';

/** Izrezani blok garda 3a iz izvora verify-deploy-dist; baca ako granice nisu nadjene. */
export function legalPlaceholderBlock(source: string): string {
  const src = source.replace(/\r\n?/g, '\n');
  const od = src.indexOf(POCETAK);
  const doKraja = src.indexOf(KRAJ, od);
  if (od < 0 || doKraja < 0) throw new Error('blok garda 3a nije nadjen u verify-deploy-dist.mjs');
  return src.slice(od, doKraja);
}

/**
 * Izvrsava blok garda 3a nad `distDir` i vraca poruke proslijedjene u `fail`. Blok dobiva isto
 * okruzenje kao u skripti; `assets` su JS datoteke iz `distDir/assets`, kao u koraku 2 skripte.
 */
export function runLegalPlaceholderBlock(source: string, distDir: string): string[] {
  const failovi: string[] = [];
  const fail = (poruka: string) => { failovi.push(poruka); };
  const assetsDir = path.join(distDir, 'assets');
  const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js')) : [];
  new Function('fs', 'os', 'path', 'DIST', 'LEGAL_PAGES', 'assets', 'findLegalPlaceholders', 'fail', legalPlaceholderBlock(source))(
    fs, os, path, distDir, LEGAL_PAGES, assets, findLegalPlaceholders, fail,
  );
  return failovi;
}

/** Sinteticki dist sa svim pravnim stranicama i jednim JS bundleom; `oznaka` ide na trazeno mjesto. */
export function legalSyntheticDist(oznaka: { stranica?: string; bundle?: string }): string {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'lekta-t86-dist-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const [file, marker] of LEGAL_PAGES) {
    const extra = file === 'uvjeti-koristenja.html' && oznaka.stranica ? oznaka.stranica : '';
    fs.writeFileSync(path.join(dir, file), `<main>${marker} ${extra}</main>`, 'utf8');
  }
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc.js'), `const t="${oznaka.bundle ?? 'pravni tekst'}";`, 'utf8');
  return dir;
}
