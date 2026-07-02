/**
 * Jednokratni UI patch (app.ts):
 *  A) zakljucaj #workType kad odabrani program jednoznacno odreduje vrstu rada.
 *  B) sakrij "Opci profil ..." iz programa kad su svi ostali programi jedinice
 *     pokriveni verificiranim profilom (fallback ostaje za nepokrivene jedinice).
 *
 * Idempotentno preko markera; asertira jedinstvenost anchora prije zamjene.
 * Pokretanje: node scripts/patch-ui-worktype-programs.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const f = new URL('../src/ui/app.ts', import.meta.url);
let s = readFileSync(f, 'utf8');

if (s.includes('/*A-lock*/')) {
  console.log('vec zakrpano, preskacem.');
  process.exit(0);
}

function must(before, after) {
  const n = s.split(before).length - 1;
  if (n !== 1) throw new Error(`anchor n=${n} (treba 1): ${before.slice(0, 70)}`);
  s = s.replace(before, after);
}

// --- B: sakrij "Opci profil ..." za potpuno pokrivene jedinice ---------------
must(
  `const u=selectedUnit(),programs=u.programs?.length?u.programs:['Opći profil ustanove'];$('#programSelect').innerHTML=programs.map(`,
  `const u=selectedUnit();let programs=u.programs?.length?u.programs:['Opći profil ustanove'];/*B-hide-opci*/const _nonOpci=programs.filter(pr=>!/^Opći/.test(pr));if(_nonOpci.length&&_nonOpci.every(pr=>VERIFIED_PROFILE_REGISTRY.some(d=>d.unitId===u.id&&d.programs.includes(pr))))programs=_nonOpci;$('#programSelect').innerHTML=programs.map(`,
);

// --- A: zakljucaj vrstu rada kad je program jednoznacno odreduje -------------
must(
  `const help=$('#workTypeSupport');if(!help)return;const supported=[...exact].map(x=>WORK_TYPE_LABELS[x]||x);if(exact.has(current)){help.className='work-support exact';help.textContent='Za ovu kombinaciju postoji poseban normativni profil.'}`,
  `/*A-lock*/const wt=$('#workType');if(exact.size===1){const only=[...exact][0];if(wt.querySelector('option[value="'+only+'"]')&&wt.value!==only)wt.value=only;wt.disabled=true}else wt.disabled=false;const help=$('#workTypeSupport');if(!help)return;const supported=[...exact].map(x=>WORK_TYPE_LABELS[x]||x);if(exact.size===1){help.className='work-support exact';help.textContent='Vrsta rada je određena odabranim studijem (zaključano).'}else if(exact.has(current)){help.className='work-support exact';help.textContent='Za ovu kombinaciju postoji poseban normativni profil.'}`,
);

writeFileSync(f, s);
console.log('patch OK (A + B)');
