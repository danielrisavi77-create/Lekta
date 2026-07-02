/**
 * Cross-institution port, batch 2: zagrebacka privatna/strucna visoka ucilista
 * (Effectus, RRiF, PVZG, ZVU). Nastavak na batch 1 (ZSEM, Libertas).
 * Pravila su iz sluzbenih Pravilnika/Uputa (institucija-wide), citana izravno.
 * Pise fanout draftove + 4 port-speca (po instituciji). Hash iz snapshot datoteke.
 *
 * Autoritetske nijanse (prenesene u profil):
 *  - Effectus: Upute (Prilog 1 Pravilnika) su izrijekom obavezne; font TNR 12 "mora se
 *    koristiti", A4/margine/justify/prored/opseg imperativni -> scored.
 *  - RRiF: Upute (sastavni dio Pravilnika o zavrsnom radu); tč. 3.4 imperativna -> scored.
 *    Fusnotni citatni format delegiran na zaseban dokument -> izostavljen.
 *  - PVZG: Pravilnik (skeniran, OCR-an); Clanak 18 sve tipografske u jednoj recenici;
 *    Clanak 10 opseg (preddiplomski min 25, specijalisticki min 40).
 *  - ZVU: Clanak 4 NORMATIVAN (A4, 12, prored 1,5, margine 2,5, opseg 25-50) -> scored.
 *    Font je izrijekom PREPORUKA s izborom tri fonta (Arial/TNR/Calibri) -> advisory,
 *    izostavljen iz scored (objasnjeno u note/advisoryScope). Citatni Vancouver samo za
 *    biomedicinu, "najcesce se koristi" -> advisory, izostavljen.
 *
 * Pokretanje: node scripts/gen-private-batch2.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/effectus.json \
 *       discovery/port-specs/rrif.json discovery/port-specs/pvzg.json discovery/port-specs/zvu.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-02';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'effectus-pravilnik-2023': 'data/sources/effectus/effectus-pravilnik-2023.pdf',
  'rrif-upute-zavrsni': 'data/sources/rrif/rrif-upute-zavrsni.pdf',
  'pvzg-pravilnik-zavrsni-2018': 'data/sources/pvzg/pvzg-pravilnik-zavrsni-2018.pdf',
  'zvu-pravilnik-zavrsni-2015': 'data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

// --- doslovni citati (verbatim iz izvora; dijakritika i interpunkcija kako stoji) ---
const Q_EFF_TECH = 'Rad se piše na formatu papira A4 (210x297 mm) s marginama 2,5 cm sa svake strane.';
const Q_EFF_FONT = 'Službeni Font EFFECTUS-a koji se mora koristiti je Times New Roman veličine slova 12pt.';
const Q_EFF_JUST = 'Tekst je potrebno poravnati s obje strane (General Alignement – Justify), razmak između redaka treba biti 1,15, a razmak iza svakog odlomka 6pt. Početak odlomka nije uvučen.';
const Q_EFF_OPZ = 'Opseg završnog rada mora iznositi 35-50 stranica (od uvoda do zaključka; u ovaj opseg ne uračunava se naslovna stranica, sadržaj i popis literature).';
const Q_EFF_OPD = 'Opseg diplomskog rada mora iznositi 50-80 stranica (od uvoda do zaključka; u ovaj opseg ne uračunava se naslovna stranica, sadržaj i popis literature).';

const Q_RRIF_OBL = 'Završni rad piše se u Microsoft Word Windows programu. Opseg rada je najmanje 30, a najviše 50 tiskanih stranica A4 formata, jednostrano. Rad treba biti napisan u skladu s jezičnim i pravopisnim pravilima. Rad treba biti pisan u odlomcima (pasusima), razmak između odlomaka treba postaviti na 12 pt, a tekst obostrano poravnati. Veličina proreda: 1.5.';
const Q_RRIF_FONT = 'Font teksta treba biti Times New Roman, veličine 12. Veličina slova za pisanje fusnota treba biti 10.';
const Q_RRIF_MARG = 'Margine su 3 cm sa lijeve i 2,5 cm sa desne strane, margine gore i dolje 2,5 cm.';

const Q_PVZG_18 = 'Završni rad piše se na papiru A 4 formata, a tekst se piše u fontu Times New Roman, veličine 12 s jednim i pol (1,5) redom razmaka, poravnan s obje strane s marginama od 30 mm gore, dolje i lijevo te 20 mm desno, bez oblikovanja zaglavlja i podnožja rada.';
const Q_PVZG_10Z = 'Opseg završnog rada na stručnim preddiplomskim studijima treba imati najmanje dvadeset i pet (25) stranica u koje se ne ubrajaju naslovnica, sadržaj i popis literature.';
const Q_PVZG_10S = 'Opseg završnog rada na specijalističkim diplomskim stručnim studijima treba imati najmanje četrdeset (40) stranica u koje se ne ubrajaju naslovnica, sadržaj i popis literature.';

const Q_ZVU_4 = 'Opseg završnoga rada ovisi o vrsti i složenosti teme koja se obrađuje, a u pravilu iznosi između 25 i 50 stranica osnovnog teksta rada na papiru A4 formata (bez naslovnice, sadržaja, popisa literature i priloga), proreda 1,5, veličine slova 12 i margina od 2,5 cm sa svih strana.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M_RRIF = { top: 2.5, right: 2.5, bottom: 2.5, left: 3 };
const M_PVZG = { top: 3, right: 2, bottom: 3, left: 3 };

const DEFS = {
  effectus: {
    institution: 'effectus', unitId: 'effectus', instName: 'EFFECTUS veleuciliste', kind: 'regulation',
    srcId: 'effectus-pravilnik-2023',
    srcTitle: 'Pravilnik o izradi i obrani zavrsnog i diplomskog rada s Uputama (Effectus, 2023)',
    srcUrl: 'https://effectus.com.hr/wp-content/uploads/2023/03/Pravilnik-o-izradi-i-obrani-zavrsnog-i-diplomskog-rada_2023.pdf',
    srcNote: 'Institucija-wide Pravilnik; Upute (Prilog 1) su izrijekom sastavni dio i obavezne. Tekstualni sloj, citano izravno.',
    profiles: [
      { pid: 'effectus-zavrsni', workType: 'final', program: 'Prijediplomski strucni studiji Effectus (zavrsni rad)', label: 'Effectus, zavrsni rad',
        entries: (pid, s) => [
          mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_EFF_TECH, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'margins', M25, 'format', 'Margine', Q_EFF_TECH, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_EFF_FONT, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_EFF_FONT, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_EFF_JUST, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'line-spacing', 1.15, 'format', 'Prored', Q_EFF_JUST, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'page-count', { min: 35, max: 50 }, 'scope', 'Opseg (35-50 str.)', Q_EFF_OPZ, 'Upute (Prilog 1), tč. 3 (str. 4-5)'),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.15, justify: true, requireA4: true, margins: M25 } },
      { pid: 'effectus-diplomski', workType: 'graduate', program: 'Diplomski strucni studiji Effectus', label: 'Effectus, diplomski rad',
        entries: (pid, s) => [
          mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_EFF_TECH, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'margins', M25, 'format', 'Margine', Q_EFF_TECH, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_EFF_FONT, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_EFF_FONT, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_EFF_JUST, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'line-spacing', 1.15, 'format', 'Prored', Q_EFF_JUST, 'Upute (Prilog 1), tč. 3 Tehnicki detalji (str. 4)'),
          mk(pid, s, 'page-count', { min: 50, max: 80 }, 'scope', 'Opseg (50-80 str.)', Q_EFF_OPD, 'Upute (Prilog 1), tč. 3 (str. 5)'),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.15, justify: true, requireA4: true, margins: M25 } },
    ],
  },
  rrif: {
    institution: 'rrif', unitId: 'rrif', instName: 'Veleuciliste RRiF', kind: 'guidelines',
    srcId: 'rrif-upute-zavrsni',
    srcTitle: 'Upute za izradu zavrsnog rada (RRiF Visoka skola)',
    srcUrl: 'https://rvs.hr/content/uploads/2014/07/UPUTE-NOVE1.pdf',
    srcNote: 'Sastavni dio Pravilnika o zavrsnom radu na RRiF Visokoj skoli; tehnicko oblikovanje citano izravno iz PDF-a. Detaljni fusnotni citatni format delegiran na zaseban dokument (Upute za citiranje literature).',
    profiles: [
      { pid: 'rrif-zavrsni', workType: 'final', program: 'Prijediplomski strucni studij RRiF (zavrsni rad)', label: 'RRiF, zavrsni rad',
        entries: (pid, s) => [
          mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_RRIF_OBL, 'tč. 3.4 Oblikovanje zavrsnog rada (str. 9)'),
          mk(pid, s, 'page-count', { min: 30, max: 50 }, 'scope', 'Opseg (30-50 str.)', Q_RRIF_OBL, 'tč. 3.4 Oblikovanje zavrsnog rada (str. 9)'),
          mk(pid, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_RRIF_OBL, 'tč. 3.4 Oblikovanje zavrsnog rada (str. 9)'),
          mk(pid, s, 'line-spacing', 1.5, 'format', 'Prored', Q_RRIF_OBL, 'tč. 3.4 Oblikovanje zavrsnog rada (str. 9)'),
          mk(pid, s, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_RRIF_FONT, 'tč. 3.4.3 Font teksta (str. 10)'),
          mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_RRIF_FONT, 'tč. 3.4.3 Font teksta (str. 10)'),
          mk(pid, s, 'margins', M_RRIF, 'format', 'Margine', Q_RRIF_MARG, 'tč. 3.4.4 Margine (str. 10)'),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_RRIF } },
    ],
  },
  pvzg: {
    institution: 'pvzg', unitId: 'pvzg', instName: 'Poslovno veleuciliste Zagreb', kind: 'regulation',
    srcId: 'pvzg-pravilnik-zavrsni-2018',
    srcTitle: 'Pravilnik o zavrsnom radu na preddiplomskim strucnim i specijalistickim diplomskim strucnim studijima (PVZG, 2018)',
    srcUrl: 'https://pvzg.hr/wp-content/uploads/2022/09/Pravilnik-o-zavrsnom-radu-PVZG-2018-compressed.pdf',
    srcNote: 'Institucija-wide Pravilnik; skeniran, OCR-an (scripts/ocr_pdf.py). Sve tipografske stavke u Clanku 18, opseg u Clanku 10.',
    profiles: [
      { pid: 'pvzg-zavrsni', workType: 'final', program: 'Prijediplomski strucni studiji PVZG (zavrsni rad)', label: 'PVZG, zavrsni rad',
        entries: (pid, s) => [
          mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'line-spacing', 1.5, 'format', 'Prored', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'margins', M_PVZG, 'format', 'Margine', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'page-count', { min: 25 }, 'scope', 'Opseg (najmanje 25 str.)', Q_PVZG_10Z, 'Članak 10. (Opseg)'),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_PVZG } },
      { pid: 'pvzg-specijalisticki', workType: 'graduate', program: 'Specijalisticki diplomski strucni studiji PVZG', label: 'PVZG, specijalisticki diplomski rad',
        entries: (pid, s) => [
          mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'line-spacing', 1.5, 'format', 'Prored', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'margins', M_PVZG, 'format', 'Margine', Q_PVZG_18, 'Članak 18. (Tehnicko uredivanje teksta)'),
          mk(pid, s, 'page-count', { min: 40 }, 'scope', 'Opseg (najmanje 40 str.)', Q_PVZG_10S, 'Članak 10. (Opseg)'),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_PVZG } },
    ],
  },
  zvu: {
    institution: 'zvu', unitId: 'zvu', instName: 'Zdravstveno veleuciliste', kind: 'regulation',
    srcId: 'zvu-pravilnik-zavrsni-2015',
    srcTitle: 'Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima (ZVU, 2015)',
    srcUrl: 'https://www.zvu.hr/wp-content/uploads/Pravilnik-o-zavrsnim-radovima1.pdf',
    srcNote: 'Institucija-wide Pravilnik; Clanak 4 normativan (opseg, A4, prored, velicina, margine). Font je izrijekom PREPORUKA s izborom Arial/TNR/Calibri -> advisory (izostavljen iz scored). Vancouver citiranje samo za biomedicinu, "najcesce se koristi" -> advisory.',
    advisoryNote: 'Font nije scored: Pravilnik ga navodi kao preporuku s izborom tri fonta (Arial, Times New Roman ili Calibri). Citatni stil Vancouver preporucen samo za biomedicinu.',
    profiles: [
      { pid: 'zvu-zavrsni', workType: 'final', program: 'Prijediplomski strucni studiji ZVU (zavrsni rad)', label: 'ZVU, zavrsni rad',
        entries: (pid, s) => [
          mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'line-spacing', 1.5, 'format', 'Prored', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'margins', M25, 'format', 'Margine', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'page-count', { min: 25, max: 50 }, 'scope', 'Opseg (25-50 str.)', Q_ZVU_4, 'Članak 4.'),
        ],
        rules: { size: [12], spacing: 1.5, requireA4: true, margins: M25 } },
      { pid: 'zvu-specijalisticki', workType: 'graduate', program: 'Specijalisticki diplomski strucni studiji ZVU', label: 'ZVU, specijalisticki diplomski rad',
        entries: (pid, s) => [
          mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'line-spacing', 1.5, 'format', 'Prored', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'margins', M25, 'format', 'Margine', Q_ZVU_4, 'Članak 4.'),
          mk(pid, s, 'page-count', { min: 25, max: 50 }, 'scope', 'Opseg (25-50 str.)', Q_ZVU_4, 'Članak 4.'),
        ],
        rules: { size: [12], spacing: 1.5, requireA4: true, margins: M25 } },
    ],
  },
};

for (const [, def] of Object.entries(DEFS)) {
  mkdirSync(`data/profiles/${def.unitId}/drafts`, { recursive: true });
  const profiles = [], ledger = [], catalogPrograms = [];
  const source = {
    id: def.srcId, kind: def.kind, title: def.srcTitle, url: def.srcUrl,
    publisher: def.instName, fetchedAt: NOW, snapshotPath: SRC[def.srcId], snapshotHash: HASH[def.srcId],
    validityClass: 'stable', lastChecked: NOW, note: def.srcNote,
  };
  for (const pr of def.profiles) {
    const es = pr.entries(pr.pid, def.srcId);
    writeFileSync(`data/profiles/${def.unitId}/drafts/${pr.pid}.json`,
      JSON.stringify({ profileId: pr.pid, entries: es, generatedAt: NOW }, null, 2) + '\n');
    catalogPrograms.push(pr.program);
    profiles.push({
      id: pr.pid, unitId: def.unitId, programs: [pr.program], workTypes: [pr.workType], status: 'partial',
      profileLabel: pr.label, verifiedAt: NOW, documentDate: null, rules: pr.rules, facts: [],
      note: `Tehnicko uredenje rada iz sluzbenog izvora (${def.instName}), citano izravno.` + (def.advisoryNote ? ` ${def.advisoryNote}` : ''),
      sources: [{ title: def.srcTitle, url: def.srcUrl }],
      sourceHierarchy: [def.srcTitle],
      ruleAuthority: 'official-program-guidelines',
      normativeScope: es.filter((e) => e.status === 'verified').map((e) => e.label),
      advisoryScope: def.advisoryNote ? ['Vrsta slova (preporuka)'] : [],
    });
    for (const e of es) {
      if (e.status !== 'verified') continue;
      ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pr.pid, action: 'verified',
        actor: 'owner-bulk-approval', timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote,
        note: `Cross-institution port (${def.instName}): direktno citanje izvora.` });
    }
  }
  const spec = { faculty: def.unitId, institution: def.institution, catalogPrograms, sources: [source], profiles, ledger };
  writeFileSync(`discovery/port-specs/${def.unitId}.json`, JSON.stringify(spec, null, 2) + '\n');
  console.log(`${def.unitId}: ${profiles.length} profila, ${ledger.length} ledger, 1 izvor.`);
}
