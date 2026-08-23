// scripts/security/classification.mjs
//
// Dijeljena jezgra klasifikacijskog sustava (faza A plana "zastita baze pravila"):
// ucitavanje manifesta data/classification.json, glob matcher i presuda po stazi.
//
// Manifest je JEDINI izvor istine o tome sto smije u javni browser bundle:
//   - vite plugin (scripts/security/classification-guard.mjs) pada build kad
//     forbidden/derived modul ude u Rollup graf javnog builda,
//   - post-build sken (scripts/verify-dist-classification.mjs) trazi kanarince i
//     never-markere u emitiranim datotekama,
//   - tests/classification.test.ts cuva pokrivenost, mrtva pravila i kanarince.
//
// Semantika podudaranja je kao .gitignore: ZADNJE pravilo koje pogodi stazu vrijedi.
// Namjerno bez vanjskih ovisnosti (picomatch bi trazio izmjenu package-lock na
// dijeljenom stablu); podrzan podskup globa je dovoljan za ovaj manifest:
//   **  bilo koji broj segmenata (ukljucujuci nula)
//   *   bilo koji znakovi unutar jednog segmenta
// Staze su repo-relativne s kosim crtama (/), bez vodece ./

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Dopusteni razredi i bundle vrijednosti; sve ostalo je greska manifesta. */
export const VALID_CLASSES = ['PUBLIC', 'PRIVATE-IP', 'PROPRIETARY-DATA', 'SECURITY-SENSITIVE'];
export const VALID_BUNDLE = ['allowed', 'forbidden', 'derived'];

/**
 * Prevede glob uzorak u RegExp. Redoslijed zamjena je bitan: prvo '**' pa '*',
 * inace bi '*' pojeo zvjezdice iz '**'.
 * @param {string} pattern
 * @returns {RegExp}
 */
export function compilePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.startsWith('/') || pattern.includes('\\')) {
    throw new Error(`[classification] neispravan uzorak: ${JSON.stringify(pattern)} (repo-relativno, kose crte, bez vodece /)`);
  }
  let src = '';
  let i = 0;
  while (i < pattern.length) {
    const rest = pattern.slice(i);
    if (rest.startsWith('**/')) {
      // bilo koji broj direktorija, ukljucujuci nijedan
      src += '(?:[^/]+/)*';
      i += 3;
    } else if (rest.startsWith('**')) {
      // do kraja: bilo sto (i kroz segmente)
      src += '.*';
      i += 2;
    } else if (rest.startsWith('*')) {
      src += '[^/]*';
      i += 1;
    } else {
      src += pattern[i].replace(/[.+?^${}()|[\]]/g, '\\$&');
      i += 1;
    }
  }
  // Case-insensitive NAMJERNO: Windows FS je case-insensitive pa bi import preko
  // 'DATA/...' inace usao u graf, promasio sva pravila i prosao kao "nepokriveno"
  // (dokazano u adversarijalnoj reviziji 2026-08-23). Repo nema staza koje se
  // razlikuju samo po velikim slovima, pa je ovo cisto suzavanje rupe.
  return new RegExp(`^${src}$`, 'i');
}

/**
 * Zadnje pravilo koje pogodi stazu vrijedi (kao .gitignore). null = nepokriveno.
 * @param {string} relPath  repo-relativna staza s kosim crtama
 * @param {Array<{pattern: string, regex: RegExp}>} rules  kompajlirana pravila
 */
export function classifyPath(relPath, rules) {
  let hit = null;
  for (const rule of rules) {
    if (rule.regex.test(relPath)) hit = rule;
  }
  return hit;
}

/**
 * Ucitaj i validiraj manifest; vraca { version, rules (s kompajliranim regexima), canaries }.
 * Baca na strukturnu gresku, da nijedan potrosac ne radi nad pola ucitanim manifestom.
 * @param {string} rootDir  korijen repozitorija
 */
export function loadManifest(rootDir) {
  const file = resolve(rootDir, 'data', 'classification.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (raw.version !== 1) throw new Error(`[classification] nepoznata verzija manifesta: ${raw.version}`);
  if (!Array.isArray(raw.rules) || raw.rules.length === 0) throw new Error('[classification] manifest bez pravila');
  const rules = raw.rules.map((rule, idx) => {
    if (!VALID_CLASSES.includes(rule.class)) {
      throw new Error(`[classification] pravilo #${idx} (${rule.pattern}): nepoznat razred ${rule.class}`);
    }
    if (!VALID_BUNDLE.includes(rule.bundle)) {
      throw new Error(`[classification] pravilo #${idx} (${rule.pattern}): nepoznata bundle vrijednost ${rule.bundle}`);
    }
    return { ...rule, regex: compilePattern(rule.pattern) };
  });
  const canaries = Array.isArray(raw.canaries) ? raw.canaries : [];
  for (const c of canaries) {
    if (!c.value || !c.mustExistIn) throw new Error('[classification] kanarinac bez value/mustExistIn');
  }
  return { version: raw.version, rules, canaries };
}

/**
 * Normalizira Rollup module id u repo-relativnu stazu, ili null ako je izvan repoa
 * (node_modules, virtualni moduli).
 * @param {string} id  apsolutni module id (moze nositi ?query i backslashove)
 * @param {string} rootDir
 */
export function moduleIdToRepoPath(id, rootDir) {
  if (!id || id.startsWith('\0')) return null;
  const clean = id.split('?')[0].replace(/\\/g, '/');
  const root = rootDir.replace(/\\/g, '/').replace(/\/$/, '');
  // Usporedba prefiksa case-insensitive: vite na Windowsu zna vratiti module id s
  // drugim slovom pogona (C:/ vs c:/) nego __dirname, a case-sensitive startsWith
  // je tada TIHO mapirao nula modula i guard je bio slijep (dokazano u reviziji).
  if (!clean.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return null;
  const rel = clean.slice(root.length + 1);
  if (rel.toLowerCase().startsWith('node_modules/')) return null;
  return rel;
}
