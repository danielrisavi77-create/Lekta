/**
 * Runda C: jos 4 javna veleucilista (svako svoja grupa). Svi citati verificirani mojim
 * fitz get_text.
 *  - vevu (Veleuciliste "Lavoslav Ruzicka" u Vukovaru): A4/margine 25mm/TNR/12pt/1,5/
 *    obostrano. Citat autor-godina NEIMENOVAN->advisory (kao UFRI).
 *  - vuv (Veleuciliste u Virovitici) zav/dip: A4/margine 2,5-2,5-2-3/1,5/TNR/12pt/obostrano/
 *    footnote 10/opseg (zav 20-35, dip 35-60). Citat autor-godina:str + APA fallback->advisory.
 *  - veleknin (Veleuciliste "Marko Marulic" u Kninu): A4/margine 2,5/TNR/12pt/1,5/obostrano/
 *    opseg min20/reference-count 15. Citat autor-godina neimenovan->advisory.
 *  - vhzk (Veleuciliste Hrvatsko zagorje Krapina): 12pt/1,5/margine 2,5/obostrano/reference-count
 *    15/citiranje HARVARD (imenovano)->scored. Font 3-opcijski preporuka->adv; opseg u karticama->adv.
 *
 * ODBACENO: Karlovac (samo odjelski, ne institucijski), UNISB (SharePoint 403), Pozega
 * (HTML-only, bot-blokada).
 *
 * Pokretanje: node scripts/gen-veleucilista-2.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/{vevu,vuv,veleknin,vhzk}.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-03';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'vevu-upute-zavrsni': 'data/sources/vevu/vevu.pdf',
  'vuv-upute-radovi-2025': 'data/sources/vuv/vuv.pdf',
  'veleknin-upute-zavrsni-2020': 'data/sources/veleknin/veleknin.pdf',
  'vhzk-pravilnik-zavrsni-2022': 'data/sources/vhzk/vhzk.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

const Q_VEVU = 'Format rada je A4. Sve margine teksta trebaju biti 25 mm. Pri obradi teksta koristiti font Times New Roman. Naslove poglavlja pisati velikim slovima veličina fonta 14 pt Bold, naslove potpoglavlja malim slovima 12 pt Bold, a običan tekst 12 pt. Prored teksta u cijelom radu treba biti 1,5. Poravnanje teksta obostrano (justified), prvi red uvučen.';

const Q_VUV = 'vrsta papira: standardni A4 papir; margine: - 2,5 cm s gornje i donje strane - 2 cm s desne i 3 cm s lijeve strane; prored: - 1,5 u glavnom dijelu teksta; vrsta slova: Times New Roman; veličina slova: - font 12 u tekstu, - font 10 u fusnotama; poravnanje reda (margine): obostrano.';
const Q_VUV_OP = 'opseg rada (ne računajući naslovnu stranicu, sadržaj i priloge): prijediplomski studij - između 20-35 stranica, diplomski studij - između 35-60 stranica.';

const Q_KNIN_FMT = 'Opseg rada iznosi najmanje 20 stranica osnovnog teksta rada bez uvodnih stranica završnog rada, popisa literature i priloga. Format rada je A4. Margine rada trebaju iznositi 2,5 cm. Rad se piše fontom Times New Roman, veličine 12 pt, uz prored 1,5 i obostrano poravnanje (Justify) bez uvlačenja prvog retka odlomka.';
const Q_KNIN_REF = 'Student tijekom istraživanja i pisanja treba koristiti najmanje 15 literaturnih izvora.';

const Q_VHZK_FMT = 'rad se piše veličinom slova 12 pt, prored 1,5 (preporučeni oblici fonta su Arial, Time News Roman ili Calibri); sve margine rada trebaju iznositi 2,5 cm; naslovi poglavlja pišu se velikim slovima veličine 14 pt, podebljano (Bold), a naslovi potpoglavlja malim slovima veličine 12 pt podebljano (Bold); potrebno je koristiti obostrano poravnanje teksta.';
const Q_VHZK_REF = 'Prilikom izrade završnog rada potrebno je koristiti najmanje 15 izvora literature značajnih za dogovorenu temu rada.';
const Q_VHZK_CIT = 'Radove u završnom radu treba citirati i referencirati Harvardskim stilom (Panjkota, 2010). Osnovna je karakteristika: u tekstu se navodi u okruglim zagradama prezime (prvog) autora i godina izdavanja citiranog/referenciranog rada.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const TNR = ['Times New Roman'];
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M_VUV = { top: 2.5, right: 2, bottom: 2.5, left: 3 };

const vuvEntries = (pid, src, opVal, opLabel) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_VUV, 'Upute, 2.1 Osnovni parametri'),
  mk(pid, src, 'margins', M_VUV, 'format', 'Margine', Q_VUV, 'Upute, 2.1 Osnovni parametri'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_VUV, 'Upute, 2.1 Osnovni parametri'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_VUV, 'Upute, 2.1 Osnovni parametri'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_VUV, 'Upute, 2.1 Osnovni parametri'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_VUV, 'Upute, 2.1 Osnovni parametri'),
  mk(pid, src, 'footnote-size', [10], 'format', 'Velicina slova fusnote', Q_VUV, 'Upute, 2.1 Osnovni parametri'),
  mk(pid, src, 'page-count', opVal, 'scope', `Opseg (${opLabel})`, Q_VUV_OP, 'Upute, 2.1 opseg'),
];
const vuvRules = () => ({ font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_VUV, footnoteSize: [10] });

const DEFS = [
  { inst: 'vevu', instName: 'Veleuciliste Lavoslav Ruzicka u Vukovaru', unitId: 'vevu', unitName: 'Veleuciliste Lavoslav Ruzicka u Vukovaru', family: 'mixed',
    sources: [{ id: 'vevu-upute-zavrsni', title: 'Prilog 4 - Upute za izradu završnog rada (Veleučilište Lavoslav Ružička u Vukovaru)', url: 'http://www.vevu.hr/uploads/50Prilog-4-Upute-za-izradu-zavrsnog-rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Citat autor-godina neimenovan->advisory.' }],
    profiles: [
      { pid: 'vevu-zavrsni', workType: 'final', program: 'Stručni prijediplomski studiji (završni rad, Veleučilište u Vukovaru)', label: 'Veleuciliste Vukovar, zavrsni rad', src: 'vevu-upute-zavrsni',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_VEVU, 'Upute, Obrada teksta'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_VEVU, 'Upute, Obrada teksta'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_VEVU, 'Upute, Obrada teksta'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_VEVU, 'Upute, Obrada teksta'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_VEVU, 'Upute, Obrada teksta'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_VEVU, 'Upute, Obrada teksta'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
    ] },
  { inst: 'vuv', instName: 'Veleuciliste u Virovitici', unitId: 'vuv', unitName: 'Veleuciliste u Virovitici', family: 'mixed',
    sources: [{ id: 'vuv-upute-radovi-2025', title: 'Upute za pripremu i pisanje završnog i diplomskog rada (Veleučilište u Virovitici, 2025)', url: 'https://vuv.hr/wp-content/uploads/2025/04/UPUTE-ZA-PRIPREMU-I-PISANJE-ZAVR%C5%A0NOG-RADA-2025-final-korekcija.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Citat autor-godina:str + APA fallback->advisory.' }],
    profiles: [
      { pid: 'vuv-zavrsni', workType: 'final', program: 'Prijediplomski stručni studiji (završni rad, Veleučilište u Virovitici)', label: 'Veleuciliste Virovitica, zavrsni rad', src: 'vuv-upute-radovi-2025', entries: (p, s) => vuvEntries(p, s, { min: 20, max: 35 }, '20-35 str.'), rules: vuvRules() },
      { pid: 'vuv-diplomski', workType: 'graduate', program: 'Diplomski stručni studiji (Veleučilište u Virovitici)', label: 'Veleuciliste Virovitica, diplomski rad', src: 'vuv-upute-radovi-2025', entries: (p, s) => vuvEntries(p, s, { min: 35, max: 60 }, '35-60 str.'), rules: vuvRules() },
    ] },
  { inst: 'veleknin', instName: 'Veleuciliste Marko Marulic u Kninu', unitId: 'veleknin', unitName: 'Veleuciliste Marko Marulic u Kninu', family: 'mixed',
    sources: [{ id: 'veleknin-upute-zavrsni-2020', title: 'Upute za izradu i obranu završnog rada (Veleučilište Marko Marulić u Kninu, 2020)', url: 'https://www.veleknin.hr/wp-content/uploads/2023/12/uputezaizraduiobranuzavrnograda.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Citat autor-godina neimenovan->advisory. reference-count min 15.' }],
    profiles: [
      { pid: 'veleknin-zavrsni', workType: 'final', program: 'Stručni prijediplomski studiji (završni rad, Veleučilište u Kninu)', label: 'Veleuciliste Knin, zavrsni rad', src: 'veleknin-upute-zavrsni-2020',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_KNIN_FMT, 'Upute, 3. Tehnicki izgled'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_KNIN_FMT, 'Upute, 3. Tehnicki izgled'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_KNIN_FMT, 'Upute, 3. Tehnicki izgled'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_KNIN_FMT, 'Upute, 3. Tehnicki izgled'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_KNIN_FMT, 'Upute, 3. Tehnicki izgled'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_KNIN_FMT, 'Upute, 3. Tehnicki izgled'),
          mk(p, s, 'page-count', { min: 20 }, 'scope', 'Opseg (najmanje 20 str.)', Q_KNIN_FMT, 'Upute, 3. Tehnicki izgled'),
          mk(p, s, 'reference-count', 15, 'references', 'Najmanji broj izvora literature (15)', Q_KNIN_REF, 'Upute, 6.2 Popis literature'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25, minReferences: 15 } },
    ] },
  { inst: 'vhzk', instName: 'Veleuciliste Hrvatsko zagorje Krapina', unitId: 'vhzk', unitName: 'Veleuciliste Hrvatsko zagorje Krapina', family: 'mixed',
    sources: [{ id: 'vhzk-pravilnik-zavrsni-2022', title: 'Privremeni pravilnik o završnom radu s Prilogom 7 (Veleučilište Hrvatsko zagorje Krapina, 2022)', url: 'https://www.vhzk.hr/Uploads/Documents/Privremeni%20pravilnik%20o%20zavr%C5%A1nom%20radu%202022%20web.pdf', kind: 'regulation', note: 'Tekstualni PDF. Font 3-opcijski preporuka->adv; opseg u karticama->adv. Harvard imenovan->scored.' }],
    profiles: [
      { pid: 'vhzk-zavrsni', workType: 'final', program: 'Stručni prijediplomski studiji (završni rad, Veleučilište Hrvatsko zagorje Krapina)', label: 'Veleuciliste Krapina, zavrsni rad', src: 'vhzk-pravilnik-zavrsni-2022',
        entries: (p, s) => [
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_VHZK_FMT, 'Prilog 7, tehnicko oblikovanje'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_VHZK_FMT, 'Prilog 7, tehnicko oblikovanje'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_VHZK_FMT, 'Prilog 7, tehnicko oblikovanje'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_VHZK_FMT, 'Prilog 7, tehnicko oblikovanje'),
          mk(p, s, 'reference-count', 15, 'references', 'Najmanji broj izvora literature (15)', Q_VHZK_REF, 'Prilog 7 / 3. Citiranje'),
          mk(p, s, 'citation-style', 'harvard', 'citation', 'Stil citiranja (Harvard)', Q_VHZK_CIT, 'Upute, 3.2 Citiranje', { mc: false }),
        ], rules: { size: [12], spacing: 1.5, justify: true, margins: M25, minReferences: 15, recommendedCitation: 'harvard' } },
    ] },
];

for (const def of DEFS) {
  mkdirSync(`data/profiles/${def.unitId}/drafts`, { recursive: true });
  const profiles = [], ledger = [], catalogPrograms = [];
  const sources = def.sources.map((s) => ({
    id: s.id, kind: s.kind, title: s.title, url: s.url, publisher: def.unitName,
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
      note: `Tehnicko uredenje rada iz sluzbenog izvora (${def.unitName}), citano izravno.`,
      sources: [{ title: srcObj.title, url: srcObj.url }],
      sourceHierarchy: [srcObj.title],
      ruleAuthority: 'official-program-guidelines', normativeScope: es.filter((e) => e.status === 'verified').map((e) => e.label), advisoryScope: [],
    });
    for (const e of es) {
      if (e.status !== 'verified') continue;
      ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pr.pid, action: 'verified',
        actor: 'owner-bulk-approval', timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote,
        note: `Cross-institution port (${def.unitName}): direktno citanje izvora.` });
    }
  }
  const spec = {
    faculty: def.unitId, institution: def.inst, institutionName: def.instName,
    unit: { id: def.unitId, name: def.unitName, family: def.family, status: 'partial' },
    catalogPrograms, sources, profiles, ledger,
  };
  writeFileSync(`discovery/port-specs/${def.unitId}.json`, JSON.stringify(spec, null, 2) + '\n');
  console.log(`${def.inst}/${def.unitId}: ${profiles.length} profila, ${ledger.length} ledger, ${sources.length} izvora.`);
}
