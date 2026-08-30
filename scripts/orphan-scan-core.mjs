// scripts/orphan-scan-core.mjs
//
// Ciste funkcije iza `orphan-scan.mjs`. Odvojene su da bi bile TESTIRLJIVE: sam skript zove git,
// pa ga test ne moze uvesti bez izvodjenja.
//
// STO SE TRAZI: razred kvara koji je 2026-08-30 u jednom danu ugrizao cetiri puta, uvijek isto:
// COMMITAN OVISNIK uz NECOMMITANU OVISNOST. U dijeljenom radnom stablu se NE vidi, jer stablo ima
// oboje; grana je zbog toga crvena tek na cistom checkoutu, dakle u CI-ju ili kod druge osobe.
//
// Dva izmjerena primjera, oba na `141f9848`:
//   tests/repair-outcome.test.ts  uvozi `buildOutcomeLine`        -> src/ui/repair-panel.ts       (` M`)
//   tests/real-corpus/harness.ts  uvozi `dropStaleFieldRegressions` -> src/analysis/repair-regression.ts (` M`)
// Simptomi su bili `TypeError: buildOutcomeLine is not a function` i
// `__vite_ssr_import_8__.dropStaleFieldRegressions is not a function`.
//
// ZASTO NE `tsc`: `tsconfig.json` ima `include: ["src"]`, pa se `tests/**` uopce ne typechecka.
// Oba gornja uvoza su imenovana (`import { X } from ...`), sto bi tsc inace prijavio kao TS2305,
// ali ih ne vidi. Uhvatio ih je tek vitest, u runtimeu, nakon cijelog prolaza. Ovaj skener ih nadje
// prije commita, i nadje ih i kad ih nijedan test jos ne dodiruje.

/**
 * Imena koja datoteka IZVOZI, citano iz izvornog teksta.
 *
 * Namjerno se gleda samo `export` na POCETKU RETKA: to je oblik u kojem su pisani svi moduli u
 * `src/` i `scripts/`, a izbjegava se lazno pozitivan pogodak na `export` unutar niza ili komentara.
 * Pokriveni su i `export default` (kao ime `default`) te `export { a, b }` popisi, jer se i preko
 * njih simbol moze osirotjeti.
 */
export function parseExports(source) {
  const names = new Set();
  const deklaracija = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of source.matchAll(deklaracija)) names.add(m[1]);

  // `export { a, b as c }` - vrijedi IZVEZENO ime, dakle `c`, jer njega uvoznik trazi.
  const popis = /^export\s*\{([^}]*)\}/gm;
  for (const m of source.matchAll(popis)) {
    for (const dio of m[1].split(',')) {
      const t = dio.trim();
      if (!t) continue;
      const kaoAlias = /(?:^|\s)as\s+([A-Za-z_$][\w$]*)$/.exec(t);
      names.add(kaoAlias ? kaoAlias[1] : t.replace(/\s+/g, ' ').split(' ')[0]);
    }
  }

  if (/^export\s+default\b/m.test(source)) names.add('default');
  return [...names].sort();
}

/**
 * Imena koja radno stablo izvozi, a commitana verzija ISTE datoteke ne.
 *
 * Ovo je jedini smjer koji nas zanima. Obratno (commitano izvozi, radno stablo ne) je brisanje i
 * njega hvata `tsc`/vitest nad radnim stablom, dakle vec ga vidimo.
 */
export function newlyExported(workingSource, committedSource) {
  const committed = new Set(parseExports(committedSource));
  return parseExports(workingSource).filter((name) => !committed.has(name));
}

/**
 * Imena koja modul stvarno UVOZI iz drugih modula.
 *
 * ZASTO POSTOJI: prva verzija skenera brojala je tekstualnu POJAVU imena i zbog toga je odmah
 * proizvela lazan nalaz, i to na najgorem mjestu. `tests/orphan-scan.test.ts` drzi imena
 * `looksLikeBibliographyEntry` i `looksLikeTitlePageLabel` kao NIZOVE u sintetickoj fixturi bas onog
 * testa koji tvrdi da skener mora sutjeti na tom slucaju. Commitanjem vlastitog testa skener je sam
 * sebi proizveo "ovisnika" i prijavio crveno na primjeru odabranom kao dokaz da zna sutjeti.
 * (Nasla ga je druga sesija, 2026-08-30.)
 *
 * Pokrivena su tri oblika, jer sva tri u ovom repozitoriju stvarno postoje:
 *   import { a, b as c } from '...'                    imenovani uvoz (oba jutrosnja kvara)
 *   export { a } from '...'                            ponovni izvoz
 *   const { a, b: c } = await import('...')            npr. scripts/run-closed-loop.mts
 *
 * Vraca IZVORNO ime (ono koje modul mora izvoziti), ne lokalni alias: kod `import { a as b }` modul
 * mora izvoziti `a`, pa se biljezi `a`.
 *
 * POZNATA GRANICA, imenovana namjerno: uvoz preko imenskog prostora (`import * as m` pa `m.X`) se NE
 * hvata, pa takav slucaj skener propusta. To je svjestan izbor u korist tocnosti: lazan nalaz tjera
 * ljude da popravljaju kvar kojeg nema, a propusten nalaz i dalje hvata gate na cistom worktreeu.
 * Skener je brz predfiltar prije commita, nikad zamjena za taj gate.
 */
export function importedNames(source) {
  const names = new Set();
  const izClauzule = (tekst) => {
    for (const dio of tekst.split(',')) {
      const t = dio.trim().replace(/^type\s+/, '');
      if (!t) continue;
      // `a as b` i `a: b` -> izvorno ime je `a`.
      names.add(t.split(/\s+as\s+|:/)[0].trim());
    }
  };

  for (const m of source.matchAll(/\bimport\s[^;]*?\{([\s\S]*?)\}\s*from\s*['"]/g)) izClauzule(m[1]);
  for (const m of source.matchAll(/\bexport\s*\{([\s\S]*?)\}\s*from\s*['"]/g)) izClauzule(m[1]);
  for (const m of source.matchAll(/\b(?:const|let|var)\s*\{([\s\S]*?)\}\s*=\s*(?:await\s+)?(?:import|require)\s*\(/g)) izClauzule(m[1]);

  names.delete('');
  return names;
}

/**
 * Presuda: koji od tih novih simbola RUSE granu na cistom checkoutu.
 *
 * Kriterij je namjerno uzak i to je cijela poanta. Necommitana datoteka SAMA PO SEBI nije kvar:
 * izmjereno 2026-08-30, `src/analysis/heading-structure.ts` je imao 131 nov redak i dva nova
 * exporta, a nije rusio nista, jer su izvor, njegov test i dokumentacija putovali kao necommitana
 * TROJKA. Prijaviti to kao nalaz znacilo bi tjerati nekoga da popravlja kvar kojeg nema.
 *
 * `repo.referencesAtHead(symbol)` je samo PREDFILTAR (brz `git grep` po tekstu); presudu donosi
 * `importedNames` nad commitanim sadrzajem te datoteke, pa spominjanje imena u nizu, komentaru ili
 * fixturi ne vrijedi kao ovisnost. Datoteka iz koje simbol potjece se izuzima, jer u HEAD-u stoji
 * njezina STARA verzija i sama sebe ne dokazuje.
 */
export function findOrphans(candidates, repo) {
  const nalazi = [];
  for (const { file, symbols } of candidates) {
    for (const symbol of symbols) {
      const referencedBy = repo
        .referencesAtHead(symbol)
        .filter((path) => path !== file)
        .filter((path) => importedNames(repo.sourceAtHead(path)).has(symbol));
      if (referencedBy.length) nalazi.push({ file, symbol, referencedBy });
    }
  }
  return nalazi;
}

/** Izvjestaj za terminal. Prazan popis je uredan ishod i mora se tako i procitati. */
export function formatReport(nalazi) {
  if (!nalazi.length) return 'orphan-scan: cisto, nijedna commitana datoteka ne trazi necommitan simbol.';
  const redci = nalazi.map(
    ({ file, symbol, referencedBy }) =>
      `  ${symbol}\n    izvozi ga SAMO radno stablo: ${file}\n    a trazi ga commitani kod:   ${referencedBy.join(', ')}`,
  );
  return [
    `orphan-scan: ${nalazi.length} simbol(a) rusi granu na cistom checkoutu.`,
    ...redci,
    '',
    'Commitaj izvor uz njegovog ovisnika, ili vrati ovisnika. Vidi CLAUDE.md, "Konvencije".',
  ].join('\n');
}
