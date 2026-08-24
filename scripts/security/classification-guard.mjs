// scripts/security/classification-guard.mjs
//
// Vite/Rollup gard klasifikacije (faza A): javni produkcijski build PADA ako u
// Rollup graf ude modul koji manifest (data/classification.json) oznacava kao
// bundle: forbidden ili derived. Ovo je gard nad UZROKOM (krivi import), za
// razliku od verify-dist-classification.mjs koji skenira POSLJEDICU (emitirane
// datoteke). Do ovog garda je npr. src/profiles/drafts-runtime.ts (~2,6 MB draft
// evidencea) od javnog bundlea dijelio samo jedan krivi import u app.ts.
//
// Modul koji je u grafu ali je POTPUNO tree-shakean (renderedLength 0) nije
// prekrsaj: njegov sadrzaj ne postoji u distu (slucaj law-drafts.json, ciji se
// eager import u profile-registry izbaci jer LAW_DRAFTS koriste samo testovi).
// Regresiju tog tree-shakea gard hvata cim renderedLength postane > 0.
//
// QA build (DEV_CONSOLE=1) ima drukciji graf (verifikacijska konzola je namjerno
// unutra) pa se gard tamo preskace, isto kao bundleSizeGuard i assertSafeBuild.

import { loadManifest, classifyPath, moduleIdToRepoPath } from './classification.mjs';

/**
 * @param {boolean} devTools  odluka iz resolveDevTools (QA build preskace gard)
 * @param {string} rootDir    korijen repozitorija (__dirname iz vite.config.ts)
 */
export function classificationGuard(devTools, rootDir) {
  return {
    name: 'lekta-classification-guard',
    apply: 'build',
    generateBundle(_opts, bundle) {
      if (devTools) return;
      const manifest = loadManifest(rootDir);
      /** @type {string[]} */
      const violations = [];
      let mappedModules = 0;
      for (const out of Object.values(bundle)) {
        if (out.type !== 'chunk') continue;
        for (const [id, info] of Object.entries(out.modules || {})) {
          const rel = moduleIdToRepoPath(id, rootDir);
          if (!rel) continue;
          mappedModules += 1;
          const rule = classifyPath(rel, manifest.rules);
          const rendered = info && typeof info.renderedLength === 'number' ? info.renderedLength : 1;
          if (rendered <= 0) continue;
          // Deny-by-default: repo modul bez pravila NIJE dopusten (revizija, nalaz 7:
          // npr. tests/fixtures s PRAVIM studentskim radovima bio je nevidljiv manifestu).
          if (!rule) {
            violations.push(`${rel} [NEKLASIFICIRANO] u chunku ${out.fileName} (${rendered} B); dodaj pravilo u data/classification.json`);
            continue;
          }
          if (rule.bundle === 'allowed') continue;
          violations.push(`${rel} [${rule.class}, bundle: ${rule.bundle}] u chunku ${out.fileName} (${rendered} B)`);
        }
      }
      // SENTINEL protiv sljepoce: guard koji ne mapira NIJEDAN modul u repo stazu nije
      // "cist" nego pokvaren (dokazano: krivo slovo pogona u rootDir = nula mapiranja i
      // vakuumski prolaz). Bolje pasti glasno nego lazno zeleno.
      if (mappedModules === 0) {
        throw new Error(
          '[classification-guard] SENTINEL: nijedan modul iz bundlea nije mapiran u repo stazu. ' +
          `rootDir=${rootDir}. Guard je slijep (krivo slovo pogona ili root?); ovo NIJE cist prolaz.`,
        );
      }
      if (violations.length) {
        throw new Error(
          `[classification-guard] ${violations.length} zabranjen(ih) modul(a) u javnom bundleu:\n  - ` +
          `${violations.join('\n  - ')}\n` +
          'Privatni sloj (drafts/ledger/source-registry/izvor istine) ne smije u preglednik. ' +
          'Ukloni import iz javnog grafa ili, ako je projekcija stvarno javna, svjesno azuriraj data/classification.json uz biljesku.',
        );
      }
    },
  };
}
