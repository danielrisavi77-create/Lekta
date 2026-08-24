// scripts/deno/evaluate-smoke.ts
//
// IZVRSNI dokaz da Academic Core sav radi u Denu (faza D zavrsni korak): do sada je
// "Deno-ready" bio tvrdnja po konstrukciji (bez DOM-a, bez zip-a, bez Node API-ja),
// dokazana vitest ekvivalencijom u Nodeu, ali NIKAD izvrsena u Deno okruzenju.
// Ovdje se ciste evaluacije (formatting + structure) vrte u samom Denu nad
// sintetickim mjerenjima s TOCNO poznatim ocekivanjima; svako odstupanje = exit 1.
//
// Pokretanje: `deno run scripts/deno/evaluate-smoke.ts` (bez dozvola: nista se ne
// cita ni ne salje). Wirano u `npm run check:edge` (scripts/check-edge.mjs), pa CI
// dokazuje izvrsavanje u Denu na svakom pushu.

import { evaluateFormatting } from '../../src/scoring/evaluate/formatting.ts';
import {
  evaluateEmptyParagraphs,
  evaluateHeadingDepth,
  evaluateHeadingHierarchy,
  evaluatePageNumbers,
  evaluateScopePages,
  evaluateTocPresent,
} from '../../src/scoring/evaluate/structure.ts';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`SMOKE FAIL: ${msg}`);
  }
}
function checkIs(c: { title?: string; status?: string; earned?: number; max?: number } | undefined, title: string, status: string, earned: number, max: number): void {
  ok(!!c, `check "${title}" nije emitiran`);
  if (!c) return;
  ok(c.status === status && c.earned === earned && c.max === max,
    `"${title}": dobiveno ${c.status} ${c.earned}/${c.max}, ocekivano ${status} ${earned}/${max}`);
}

const dominants = (font: string, size: number, spacing: number, align: string) => ({
  font: { value: font, share: 0.94 },
  size: { value: size, share: 0.94 },
  spacing: { value: spacing, share: 0.9 },
  align: { value: align, share: 0.88 },
});

const section = {
  margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
  page: { w: 21, h: 29.7 },
  pageNumbering: null,
  paragraphIndex: 3,
  titlePageDifferent: false,
  pageFields: { default: false, first: false, even: false },
  pageAlignments: { default: null, first: null, even: null },
  hasAnyPageField: false,
};

const fm = {
  body: dominants('Times New Roman', 12, 1.5, 'both'),
  footnotes: { count: 0, endnoteCount: 0, dominants: dominants('', 0, 0, ''), markers: [] },
  sections: [section],
  paragraphSpacing: { knownCount: 0, badCount: 0, badSamples: [] },
  footnoteParagraphSpacing: { knownCount: 0, badCount: 0, badSamples: [] },
};

// 1) USKLADJEN dokument protiv profila: svaka bodovana dimenzija puna.
const okProfile = {
  font: ['Times New Roman'], size: [12], spacing: 1.5,
  margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
  justify: true, requireA4: true, checkParagraphSpacingZero: true,
};
const okOut = evaluateFormatting(fm, okProfile, 0.12);
checkIs(okOut.checks.find((c) => c.title === 'Dominantni font'), 'Dominantni font', 'pass', 8, 8);
checkIs(okOut.checks.find((c) => c.title === 'Veličina osnovnog teksta'), 'Veličina osnovnog teksta', 'pass', 6, 6);
checkIs(okOut.checks.find((c) => c.title === 'Prored osnovnog teksta'), 'Prored osnovnog teksta', 'pass', 6, 6);
checkIs(okOut.checks.find((c) => c.title === 'Margine dokumenta'), 'Margine dokumenta', 'pass', 6, 6);
checkIs(okOut.checks.find((c) => c.title === 'Poravnanje osnovnog teksta'), 'Poravnanje osnovnog teksta', 'pass', 4, 4);
checkIs(okOut.checks.find((c) => c.title === 'Format stranice A4'), 'Format stranice A4', 'pass', 3, 3);
checkIs(okOut.checks.find((c) => c.title === 'Razmak prije i poslije odlomka'), 'Razmak prije i poslije odlomka', 'pass', 3, 3);
ok(okOut.issues.length === 0, `uskladjen profil ne smije imati direktnih issues, ima ${okOut.issues.length}`);

// 2) KRSENJA: font i prored padaju s tocno poznatim bodovima i porukama.
const badOut = evaluateFormatting(fm, { ...okProfile, font: ['Arial'], spacing: 1.15 }, 0.12);
checkIs(badOut.checks.find((c) => c.title === 'Dominantni font'), 'Dominantni font', 'fail', 1, 8);
checkIs(badOut.checks.find((c) => c.title === 'Prored osnovnog teksta'), 'Prored osnovnog teksta', 'fail', 1, 6);
const fontCheck = badOut.checks.find((c) => c.title === 'Dominantni font');
ok(String(fontCheck?.detail).includes('Times New Roman (94% analiziranog teksta)'),
  `detail dominantnog fonta kriv: ${fontCheck?.detail}`);
ok(String(fontCheck?.issue?.detail).includes('očekuje Arial'), 'issue fonta ne imenuje ocekivani font');

// 3) STRUKTURA bez teksta: page numbers, TOC gate, hijerarhija, dubina, opseg, prazni.
const sm = {
  sections: [section],
  structure: {
    headings: [
      { index: 2, level: 1, excerpt: 'Uvod', tooDeep: false },
      { index: 9, level: 3, excerpt: 'Duboki pododjeljak bez roditelja', tooDeep: false },
    ],
    tooDeepParagraphs: [{ index: 14, excerpt: '1.2.3.4 Predubok pododjeljak' }],
    pageFieldInBody: false,
    firstPageEndIndex: 5,
    introParagraphIndex: 2,
    tocFieldPresent: false,
    manualTocEntryCount: 0,
    emptyParagraphs: 30,
  },
  counts: { storedPages: 40, paragraphs: 100 },
};
const sProfile = { requirePageNumbers: true, requireToc: true, maxDecimalLevels: 3, pageMin: 30, pageMax: 50 };

checkIs(evaluatePageNumbers(sm, sProfile)[0], 'Brojevi stranica', 'fail', 0, 4);

const toc = evaluateTocPresent(sm, sProfile);
checkIs(toc.checks[0], 'Sadržaj dokumenta', 'fail', 0, 5);
ok(toc.toc === false, 'toc gate mora biti false bez TOC polja i rucnog sadrzaja');

const hier = evaluateHeadingHierarchy(sm, sProfile)[0];
checkIs(hier, 'Hijerarhija naslova', 'warn', 5, 6);
ok(String(hier?.issue?.detail).includes('odlomak 9: Duboki pododjeljak bez roditelja'),
  `hijerarhija ne imenuje excerpt: ${hier?.issue?.detail}`);

checkIs(evaluateHeadingDepth(sm, sProfile)[0], 'Dubina decimalnog numeriranja', 'warn', 1, 3);

// makeCheck invarijanta: max === 0 -> status 'informational' + prefiks u detail.
// (Prva verzija smoke-a ocekivala je 'pass' i pao je: dokaz da tvrdnje stvarno grizu.)
const scope = evaluateScopePages(sm, sProfile)[0];
checkIs(scope, 'Opseg u stranicama', 'informational', 0, 0);
ok(scope?.issue == null, '40 stranica u rasponu 30-50 ne smije nositi issue');

const empty = evaluateEmptyParagraphs(sm)[0];
checkIs(empty, 'Prazni odlomci', 'informational', 0, 0);
ok(String(empty?.detail).endsWith('30 praznih odlomaka (30%)'), `prazni detail kriv: ${empty?.detail}`);
ok(empty?.issue != null, '30% praznih mora nositi info issue');

if (failures > 0) {
  console.error(`[evaluate-smoke] PAD: ${failures} tvrdnji nije proslo.`);
  Deno.exit(1);
}
console.log('[evaluate-smoke] OK: Academic Core sav (formatting + structure) izvrsen u Denu, sve tvrdnje tocne.');
