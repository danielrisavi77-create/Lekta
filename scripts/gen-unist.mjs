/**
 * Cross-institution port: Sveuciliste u Splitu (unist) - druga javna institucijska grupa.
 * Reducer sam kreira grupu iz spec.institutionName (kao uniri).
 *
 * 6 sastavnica sa scored profilima (izostavljeni: FESB - pravilnici proceduralni, oblikovanje
 * u skeniranom dokumentu bez tipografije / iza intraneta; FF Split - Pravilnik delegira sve na
 * predlozak a predlozak ima vrijednosti SAMO u styles.xml bez pisanog imperativa; Pravni Split -
 * nema javnog format-dokumenta).
 *
 * Autoritetske nijanse:
 *  - PMFST: Upute za bio/kem odjel (ne cijeli PMF). Jednostrani ispis + numeracija (nisu scored
 *    checkId). Zavrsni opseg 20-40 -> scored. Diplomski nema opseg rada (samo sazetak <=150).
 *  - FGAG: pravila u .docx PREDLOSKU (tijelo dokumenta), pisani imperativ pokriva justify/font/
 *    velicinu/prored. A4 i margine su SAMO u page-setup XML-u (bez pisane recenice) -> izostavljeni.
 *  - EFST: Uputa 2013, imperativ. Opseg zav 30-40 / dip 50-80. A4 nije naveden -> izostavljen.
 *    Citiranje slobodan izbor stila -> advisory.
 *  - KTFST: pravila u Prilogu 3/4 (predlozak, pisani blok "od Zadatka do Priloga"). Font TNR ILI
 *    Arial. Margine lijeva 3,5/ostale 2,5. Nema page-count. Citiranje delegirano na KUI -> advisory.
 *  - PFST: Upute 2022, imperativ za font/velicinu/prored/justify. NEMA margina ni A4 u izvoru
 *    (ostaju null, ne nagadjaj). Opseg "preporucuje se" -> advisory. Vlastiti numericki citat -> adv.
 *  - MEFST: Uputa 2021, samo diplomski (integrirani studij medicine). Margine 2,5, A4, TNR 12,
 *    prored 1,5, obostrano. Opseg "bi idealno trebao" -> advisory. Vancouver -> advisory.
 *
 * Pokretanje: node scripts/gen-unist.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/pmfst.json discovery/port-specs/fgag.json \
 *       discovery/port-specs/efst.json discovery/port-specs/ktfst.json discovery/port-specs/pfst.json \
 *       discovery/port-specs/mefst.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-02';
const INST = 'unist';
const INST_NAME = 'Sveuciliste u Splitu';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'pmfst-upute-zavrsni': 'data/sources/pmfst/pmfst-upute-zavrsni.pdf',
  'pmfst-upute-diplomski': 'data/sources/pmfst/pmfst-upute-diplomski.pdf',
  'fgag-predlozak-zavrsni-2026': 'data/sources/fgag/fgag-predlozak-zavrsni-2026.docx',
  'fgag-predlozak-diplomski-2026': 'data/sources/fgag/fgag-predlozak-diplomski-2026.docx',
  'efst-upute-studentski-radovi-2013': 'data/sources/efst/efst-upute-studentski-radovi-2013.pdf',
  'ktf-prilog3-zavrsni': 'data/sources/ktfst/ktf-prilog3-zavrsni.docx',
  'ktf-prilog4-diplomski': 'data/sources/ktfst/ktf-prilog4-diplomski.docx',
  'pfst-upute-ocjenski-2022': 'data/sources/pfst/pfst-upute-ocjenski-2022.pdf',
  'mefst-uputa-diplomski-2021': 'data/sources/mefst/mefst-uputa-diplomski-2021.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

const Q_PMFST = 'Format: A4 (210x297 mm), tekst s 1,5 proredom, veličina slova 12 pt, pisano u Times New Roman, poravnanje teksta s marginama sa svih strana od 2.5 cm.';
const Q_PMFST_OP = 'Minimalan broj stranica od uvoda do kraja literature je 20, a maksimalan broj je 40 stranica.';

const Q_FGAG = 'Običan tekst pisati s obostranim ravnanjem, font Times New Roman, veličina slova 12, prored 1.5 redaka, razmak prije pasusa 6 točaka, (stil Normal), s eventualnim isticanjem važnih podataka boldom, italicom ili italic boldom po osobnoj procjeni.';

const Q_EFST_FMT = 'Za oblikovanje teksta koristi se font Times New Roman, veličina 12, uz prored od 1,5. Tekst treba biti poravnat uz lijevi i desni rub stranice. Margine trebaju biti udaljene 2,5 cm od gornjeg, donjeg, lijevog i desnog ruba stranice.';
const Q_EFST_ZAV = 'Završni rad ima opseg između 30 i 40 stranica,';
const Q_EFST_DIP = 'Diplomski rad ima opseg između 50 i 80 stranica.';

const Q_KTF = 'Tekst od Zadatka rada do Priloga piše: na papiru formata A4, margine: gornja 2,5 cm, donja 2,5 cm, lijeva 3,5 cm i desna 2,5 cm, slova naslova: Times New Roman ili Arial veličine 14 pt (točaka), prored 1,5, slova teksta: Times New Roman ili Arial veličine 12 pt (točaka), prored 1,5, poravnanje reda: obostrano.';

const Q_PFST_FONT = 'Cijeli tekst rada treba biti napisan jednim (istim) fontom (Times New Roman ili Arial) veličine 12 točaka (pt). Prored među redcima mora biti 1,5 redak, a razmak iznad/ispod (space before/after) je 0.';
const Q_PFST_JUST = 'Tekst treba pisati s obostranim poravnanjem ("justify").';

const Q_MEFST_PAGE = 'Margine: Normal (gornja: 2,5 cm; donja: 2,5 cm; lijeva 2,5 cm; desna: 2.5 cm), Orijentacija: Portrait, Veličina: A4 (21.0 cm x 29.7 cm)';
const Q_MEFST_FONT = 'Times New Roman, veličina 12, prored 1,5, Tekst obostrano poravnat.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M_KTF = { top: 2.5, right: 2.5, bottom: 2.5, left: 3.5 };
const TNR = ['Times New Roman'];
const TNR_ARIAL = ['Times New Roman', 'Arial'];

const DEFS = [
  { unitId: 'pmfst', unitName: 'Prirodoslovno-matematicki fakultet u Splitu', family: 'stem',
    sources: [
      { id: 'pmfst-upute-zavrsni', title: 'Upute za pisanje zavrsnog rada (PMFST, odjel bio/kem)', url: 'https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-ZAVRSNOG-RADA.pdf', kind: 'guidelines', note: 'Vrijede za Odjel za biologiju/kemiju (ne cijeli PMF). Tekstualni PDF.' },
      { id: 'pmfst-upute-diplomski', title: 'Upute za pisanje diplomskog rada (PMFST, odjel bio/kem)', url: 'https://www.pmfst.unist.hr/wp-content/uploads/2014/06/UPUTE-ZA-PISANJE-DIPLOMSKOG-RADA.pdf', kind: 'guidelines', note: 'Vrijede za Odjel za biologiju/kemiju (ne cijeli PMF). Tekstualni PDF.' },
    ],
    profiles: [
      { pid: 'pmfst-zavrsni', workType: 'final', program: 'Prijediplomski studiji PMFST bio/kem (zavrsni rad)', label: 'PMF Split (bio/kem), zavrsni rad', src: 'pmfst-upute-zavrsni',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'page-count', { min: 20, max: 40 }, 'scope', 'Opseg (20-40 str.)', Q_PMFST_OP, 'Upute, opseg'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M25 } },
      { pid: 'pmfst-diplomski', workType: 'graduate', program: 'Diplomski studiji PMFST bio/kem', label: 'PMF Split (bio/kem), diplomski rad', src: 'pmfst-upute-diplomski',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_PMFST, 'Upute, Format'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_PMFST, 'Upute, Format'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M25 } },
    ] },
  { unitId: 'fgag', unitName: 'Fakultet gradevinarstva, arhitekture i geodezije u Splitu', family: 'stem',
    sources: [
      { id: 'fgag-predlozak-zavrsni-2026', title: 'Predlozak zavrsnog rada (FGAG, 2026)', url: 'https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20zavrsnog%20rada%20NOVO%202026.docx', kind: 'template', note: 'Pravila su u tijelu .docx predloska (pisani imperativ). A4/margine samo u page-setup XML-u -> izostavljeni.' },
      { id: 'fgag-predlozak-diplomski-2026', title: 'Predlozak diplomskog rada (FGAG, 2026)', url: 'https://gradst.unist.hr/Portals/9/docs/Referada/Obavijesti/Predlozak%20diplomskog%20rada%20NOVO%20SP%202026.docx', kind: 'template', note: 'Pravila su u tijelu .docx predloska (pisani imperativ). A4/margine samo u page-setup XML-u -> izostavljeni.' },
    ],
    profiles: [
      { pid: 'fgag-zavrsni', workType: 'final', program: 'Prijediplomski studiji FGAG (zavrsni rad)', label: 'FGAG, zavrsni rad', src: 'fgag-predlozak-zavrsni-2026', entries: (p, s) => fgagEntries(p, s), rules: fgagRules(),
        advisoryNote: 'A4 i margine su u postavkama stranice predloska (bez pisanog pravila) -> izostavljeni iz scored.' },
      { pid: 'fgag-diplomski', workType: 'graduate', program: 'Diplomski studiji FGAG', label: 'FGAG, diplomski rad', src: 'fgag-predlozak-diplomski-2026', entries: (p, s) => fgagEntries(p, s), rules: fgagRules(),
        advisoryNote: 'A4 i margine su u postavkama stranice predloska (bez pisanog pravila) -> izostavljeni iz scored.' },
    ] },
  { unitId: 'efst', unitName: 'Ekonomski fakultet u Splitu', family: 'social',
    sources: [{ id: 'efst-upute-studentski-radovi-2013', title: 'Uputa za izradu studentskih radova (EFST, 2013)', url: 'http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf', kind: 'guidelines', note: 'Tekstualni PDF; pogl. 4-5. A4 nije naveden -> izostavljen. Citiranje slobodan izbor stila -> advisory.' }],
    profiles: [
      { pid: 'efst-zavrsni', workType: 'final', program: 'Prijediplomski studiji EFST (zavrsni rad)', label: 'EFST, zavrsni rad', src: 'efst-upute-studentski-radovi-2013', entries: (p, s) => efstEntries(p, s, Q_EFST_ZAV, { min: 30, max: 40 }, '30-40'), rules: efstRules() },
      { pid: 'efst-diplomski', workType: 'graduate', program: 'Diplomski studiji EFST', label: 'EFST, diplomski rad', src: 'efst-upute-studentski-radovi-2013', entries: (p, s) => efstEntries(p, s, Q_EFST_DIP, { min: 50, max: 80 }, '50-80'), rules: efstRules() },
    ] },
  { unitId: 'ktfst', unitName: 'Kemijsko-tehnoloski fakultet u Splitu', family: 'stem',
    sources: [
      { id: 'ktf-prilog3-zavrsni', title: 'Prilog 3 - Izgled obveznih stranica zavrsnog rada (KTF Split)', url: 'https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_3_Izgled_obveznih_stranica_zavrsnog_rada.docx', kind: 'template', note: 'Predlozak (Prilog 3 Pravilnika); pisani format-blok "od Zadatka do Priloga". Font TNR ili Arial.' },
      { id: 'ktf-prilog4-diplomski', title: 'Prilog 4 - Izgled obveznih stranica diplomskog rada (KTF Split)', url: 'https://www.ktf.unist.hr/images/stories/repozitorij/Dekanat/Prilog_4_Izgled_obveznih_stranica_diplomskog_rada.docx', kind: 'template', note: 'Predlozak (Prilog 4 Pravilnika); pisani format-blok "od Zadatka do Priloga". Font TNR ili Arial.' },
    ],
    profiles: [
      { pid: 'ktfst-zavrsni', workType: 'final', program: 'Prijediplomski studiji KTF Split (zavrsni rad)', label: 'KTF Split, zavrsni rad', src: 'ktf-prilog3-zavrsni', entries: (p, s) => ktfEntries(p, s), rules: ktfRules() },
      { pid: 'ktfst-diplomski', workType: 'graduate', program: 'Diplomski studiji KTF Split', label: 'KTF Split, diplomski rad', src: 'ktf-prilog4-diplomski', entries: (p, s) => ktfEntries(p, s), rules: ktfRules() },
    ] },
  { unitId: 'pfst', unitName: 'Pomorski fakultet u Splitu', family: 'stem',
    sources: [{ id: 'pfst-upute-ocjenski-2022', title: 'Upute za izradu diplomskih i drugih ocjenskih radova (PFST, 2022)', url: 'https://www.pfst.unist.hr/dokumenti/zavrsetak/PFST%20-%20Upute%20za%20izradu%20diplomskih%20i%20drugih%20ocjenskih%20radova.pdf', kind: 'guidelines', note: 'Tekstualni PDF; odj. 3.1. NEMA margina ni A4 u izvoru -> izostavljeni (null). Opseg preporuka; vlastiti numericki citat -> advisory.' }],
    profiles: [
      { pid: 'pfst-zavrsni', workType: 'final', program: 'Prijediplomski/ocjenski radovi PFST (zavrsni rad)', label: 'PFST, zavrsni rad', src: 'pfst-upute-ocjenski-2022', entries: (p, s) => pfstEntries(p, s), rules: pfstRules() },
      { pid: 'pfst-diplomski', workType: 'graduate', program: 'Diplomski studiji PFST', label: 'PFST, diplomski rad', src: 'pfst-upute-ocjenski-2022', entries: (p, s) => pfstEntries(p, s), rules: pfstRules() },
    ] },
  { unitId: 'mefst', unitName: 'Medicinski fakultet u Splitu', family: 'biomed',
    sources: [{ id: 'mefst-uputa-diplomski-2021', title: 'Uputa za oblikovanje diplomskoga rada (MEFST, 2021)', url: 'https://neuron.mefst.hr/docs/katedre/diplomski_ispit/Uputa%20za%20oblikovanje%20diplomskoga%20rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF; samo diplomski (integrirani studij medicine). Opseg "bi idealno trebao" -> advisory. Vancouver -> advisory.' }],
    profiles: [
      { pid: 'mefst-diplomski', workType: 'graduate', program: 'Integrirani studij medicine (MEFST, diplomski rad)', label: 'MEFST, diplomski rad', src: 'mefst-uputa-diplomski-2021',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_MEFST_PAGE, 'odj. 1 Page layout'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_MEFST_PAGE, 'odj. 1 Page layout'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_MEFST_FONT, 'odj. 2 Font'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_MEFST_FONT, 'odj. 2 Font'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_MEFST_FONT, 'odj. 2 Font'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_MEFST_FONT, 'odj. 2 Font'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
    ] },
];

function fgagEntries(pid, src) {
  const P = 'tijelo predloska (stil Normal)';
  return [
    mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_FGAG, P),
    mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_FGAG, P),
    mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_FGAG, P),
    mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_FGAG, P),
  ];
}
function fgagRules() { return { font: TNR, size: [12], spacing: 1.5, justify: true }; }

function efstEntries(pid, src, opQuote, pageCount, opLabel) {
  const P = 'poglavlje 4. Oblikovanje teksta (str. 7-8)';
  return [
    mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_EFST_FMT, P),
    mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_EFST_FMT, P),
    mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_EFST_FMT, P),
    mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_EFST_FMT, P),
    mk(pid, src, 'margins', M25, 'format', 'Margine', Q_EFST_FMT, P),
    mk(pid, src, 'page-count', pageCount, 'scope', `Opseg (${opLabel} str.)`, opQuote, 'poglavlje 5. (opseg radova)'),
  ];
}
function efstRules() { return { font: TNR, size: [12], spacing: 1.5, justify: true, margins: M25 }; }

function ktfEntries(pid, src) {
  const P = 'Prilog (format-blok: od Zadatka rada do Priloga)';
  return [
    mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_KTF, P),
    mk(pid, src, 'margins', M_KTF, 'format', 'Margine', Q_KTF, P),
    mk(pid, src, 'font', TNR_ARIAL, 'format', 'Vrsta slova (TNR ili Arial)', Q_KTF, P),
    mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_KTF, P),
    mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_KTF, P),
    mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_KTF, P),
  ];
}
function ktfRules() { return { font: TNR_ARIAL, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_KTF }; }

function pfstEntries(pid, src) {
  return [
    mk(pid, src, 'font', TNR_ARIAL, 'format', 'Vrsta slova (TNR ili Arial)', Q_PFST_FONT, 'odj. 3.1 Postavke stranice (str. 10-11)'),
    mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_PFST_FONT, 'odj. 3.1 Postavke stranice (str. 10-11)'),
    mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_PFST_FONT, 'odj. 3.1 Postavke stranice (str. 10-11)'),
    mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_PFST_JUST, 'odj. 3.1 Postavke stranice (str. 10-11)'),
  ];
}
function pfstRules() { return { font: TNR_ARIAL, size: [12], spacing: 1.5, justify: true }; }

for (const def of DEFS) {
  mkdirSync(`data/profiles/${def.unitId}/drafts`, { recursive: true });
  const profiles = [], ledger = [], catalogPrograms = [];
  const sources = def.sources.map((s) => ({
    id: s.id, kind: s.kind, title: s.title, url: s.url, publisher: def.unitName + ', ' + INST_NAME,
    fetchedAt: NOW, snapshotPath: SRC[s.id], snapshotHash: HASH[s.id], validityClass: 'stable', lastChecked: NOW, note: s.note,
  }));
  for (const pr of def.profiles) {
    const es = pr.entries(pr.pid, pr.src);
    writeFileSync(`data/profiles/${def.unitId}/drafts/${pr.pid}.json`,
      JSON.stringify({ profileId: pr.pid, entries: es, generatedAt: NOW }, null, 2) + '\n');
    catalogPrograms.push(pr.program);
    const srcObj = def.sources.find((s) => s.id === pr.src);
    profiles.push({
      id: pr.pid, unitId: def.unitId, programs: [pr.program], workTypes: [pr.workType], status: 'partial',
      profileLabel: pr.label, verifiedAt: NOW, documentDate: null, rules: pr.rules, facts: [],
      note: `Tehnicko uredenje rada iz sluzbenog izvora (${def.unitName}, ${INST_NAME}), citano izravno.` + (pr.advisoryNote ? ` ${pr.advisoryNote}` : ''),
      sources: [{ title: srcObj.title, url: srcObj.url }],
      sourceHierarchy: [srcObj.title],
      ruleAuthority: 'official-program-guidelines',
      normativeScope: es.filter((e) => e.status === 'verified').map((e) => e.label),
      advisoryScope: pr.advisoryNote ? ['Format papira / margine (predlozak)'] : [],
    });
    for (const e of es) {
      if (e.status !== 'verified') continue;
      ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pr.pid, action: 'verified',
        actor: 'owner-bulk-approval', timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote,
        note: `Cross-institution port (${def.unitName}, ${INST_NAME}): direktno citanje izvora.` });
    }
  }
  const spec = {
    faculty: def.unitId, institution: INST, institutionName: INST_NAME,
    unit: { id: def.unitId, name: def.unitName, family: def.family, status: 'partial' },
    catalogPrograms, sources, profiles, ledger,
  };
  writeFileSync(`discovery/port-specs/${def.unitId}.json`, JSON.stringify(spec, null, 2) + '\n');
  console.log(`${def.unitId}: ${profiles.length} profila, ${ledger.length} ledger, ${sources.length} izvora.`);
}
