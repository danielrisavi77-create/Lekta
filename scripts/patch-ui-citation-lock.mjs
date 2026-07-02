/**
 * UI patch (app.ts): mandated-citation zastavica.
 * Kad profil postavi rules.citationLocked === true, #citationStyle se zakljuca
 * (obvezan stil, npr. pravne fusnote). Bez zastavice ostaje otključan (preporuka,
 * npr. AGR autor-godina/harvard). Auto-postavljanje vrijednosti ostaje kao prije.
 *
 * Idempotentno preko markera. Pokretanje: node scripts/patch-ui-citation-lock.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const f = new URL('../src/ui/app.ts', import.meta.url);
let s = readFileSync(f, 'utf8');

if (s.includes('/*B-cit-lock*/')) {
  console.log('vec zakrpano, preskacem.');
  process.exit(0);
}

const before = `if(ctx!==lastProfileContext&&d?.rules?.recommendedCitation)$('#citationStyle').value=d.rules.recommendedCitation;lastProfileContext=ctx;`;
const after = `if(ctx!==lastProfileContext&&d?.rules?.recommendedCitation)$('#citationStyle').value=d.rules.recommendedCitation;/*B-cit-lock*/$('#citationStyle').disabled=!!(d&&d.rules&&d.rules.citationLocked);lastProfileContext=ctx;`;

const n = s.split(before).length - 1;
if (n !== 1) throw new Error(`anchor n=${n} (treba 1)`);
s = s.replace(before, after);
writeFileSync(f, s);
console.log('patch OK (B: citationLocked)');
