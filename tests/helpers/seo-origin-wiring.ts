/**
 * Gard #5 iz scripts/verify-deploy-dist.mjs izvrsen stvarno (T49, Codex runde 3 i 4, nalaz 7b na #273).
 *
 * Logika je `seoOriginProblems` u scripts/site-origin.mjs, ali pitanje je vodi li svaki problem
 * stvarno u `fail`. Provjera nad tekstom izvora (`includes`) to ne dokazuje: redak se moze
 * zakomentirati, a tekst ostaje. Zato se iz izvora skripte izrezuje BLOK garda #5 (od komentara
 * `// 5. SEO origin` do `// 6. CSP`) i izvrsava nad sintetickim distom, s `fail` koji biljezi poruke.
 * Zakomentiran ili uklonjen `fail` daje nula zabiljezenih poruka i test pada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { seoOriginProblems } from '../../scripts/site-origin.mjs';

const POCETAK = '// 5. SEO origin';
const KRAJ = '// 6. CSP';

/** Izrezani blok garda #5 iz izvora verify-deploy-dist; baca ako granice nisu nadjene. */
export function guard5Block(source: string): string {
  const src = source.replace(/\r\n?/g, '\n');
  const od = src.indexOf(POCETAK);
  const doKraja = src.indexOf(KRAJ, od);
  if (od < 0 || doKraja < 0) throw new Error('blok garda #5 nije nadjen u verify-deploy-dist.mjs');
  return src.slice(od, doKraja);
}

/**
 * Izvrsava blok garda #5 nad direktorijem `distDir` i vraca poruke koje je proslijedio u `fail`.
 * Blok dobiva isto okruzenje kao u skripti: `fs`, `path`, `DIST`, `SITE_ORIGIN`, `seoOriginProblems`
 * i `fail`.
 */
export function runGuard5Block(source: string, distDir: string, siteOrigin: string): string[] {
  const failovi: string[] = [];
  const fail = (poruka: string) => { failovi.push(poruka); };
  const blok = guard5Block(source);
  new Function('fs', 'path', 'DIST', 'SITE_ORIGIN', 'seoOriginProblems', 'fail', blok)(
    fs, path, distDir, siteOrigin, seoOriginProblems, fail,
  );
  return failovi;
}

/** Sinteticki dist: datoteke iz mape `{ relativnaPutanja: sadrzaj }` u novoj privremenoj mapi. */
export function writeSyntheticDist(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), 'lekta-t49-dist-'));
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
  }
  return dir;
}
