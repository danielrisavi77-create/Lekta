/**
 * A: preostalo javno sveuciliste UNIN (Sveuciliste Sjever) + B: javna veleucilista
 * (Rijeka, Bjelovar, Medimursko, Velika Gorica). 5 novih institucijskih grupa
 * (reducer ih sam kreira iz institutionName). Svi citati verificirani mojim fitz-om
 * (docx: word/document.xml; ostalo tekstualni PDF).
 *
 * A) UNIN - Sveuciliste Sjever: JEDAN sveucilisni docx pokriva sve odjele; tipografija
 *    je jedinstvena (font TNR 12/prored 1,5/obostrano/margine 2-2-2,25-2,25/numerirani
 *    naslovi mala tiskana 4 razine). Citiranje je po ZNANSTVENOM PODRUCJU (jednoznacno):
 *    APA(7) biomedicina, Harvard drustvene, Vancouver tehnicke -> 3 podrucja x 2 razine
 *    = 6 profila koji dijele tipografiju + boduju citiranje svog podrucja. A4 NIJE u
 *    obveznom popisu uputa (spominje se samo uzgred za Uvod)->izostavljen.
 *
 * B) Javna veleucilista (svako svoja grupa, kao ZSEM/Libertas stubovi):
 *    - veleri (Veleuciliste u Rijeci): A4/TNR12/1,5/obostrano/margine 30-30-30-20mm/
 *      footnote TNR 10/opseg (zav min30, dip min40). Citat autor-godina + opcija APA6->adv.
 *    - vub (Veleuciliste u Bjelovaru): A4/TNR12/obostrano/1,5/margine 25-25-25-30/Vancouver.
 *      Samo diplomski (format-doc je za diplomski). Opseg "dogovoriti s mentorom"->adv.
 *    - mev (Medimursko veleuciliste): A4/font-size12/obostrano/margine 3cm/1,5/footnote10/
 *      opseg min30. Font "najcesce TNR ili druga"->adv; citiranje "u dogovoru"->adv.
 *    - vvg (Veleuciliste Velika Gorica): A4/margine 3-2-2,5-2,5/numericki citat [1]=ieee.
 *      Body font/velicina su spregnuti izbor (Arial 11 ILI Times 12) u tablici stilova->
 *      neodrediv->izostavljeni; justify samo iz fragm. tablice->izostavljen. Opseg u
 *      karticama+preporuka->adv.
 *
 * ODBACENO: UNISB (SharePoint 403/skenirano), Sveuciliste obrane i sigurnosti (nema javnog
 * doc), Sibenik (tipografija delegirana na e-ucenje), Karlovac (odjelski + margine raspon
 * 2,5-3), Gospic (nema doc), Pozega (403), ZVU (vec portan batch 2).
 *
 * Pokretanje: node scripts/gen-unin-veleucilista.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/{unin,veleri,vub,mev,vvg}.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-03';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'unin-upute-radovi-2026': 'data/sources/unin/unin-upute.docx',
  'veleri-upute-formalni-izgled': 'data/sources/veleri/veleri.pdf',
  'vub-upute-diplomski-2025': 'data/sources/vub/vub.pdf',
  'mev-upute-zavrsni': 'data/sources/mev/mev.pdf',
  'vvg-upute-radovi-2013': 'data/sources/vvg/vvg.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

// --- verbatim citati ---
const Q_UNIN_FMT = 'Prilikom pisanja završnog/diplomskog rada potrebno je slijediti ove upute: Margine: gore 2 cm, dolje 2 cm, desno 2,25 cm, lijevo 2,25 cm. Font: Times New Roman, veličina 12 pt. Prored: 1,5. Poravnanje teksta: obostrano.';
const Q_UNIN_HEAD = 'Naslovi i podnaslovi: prvi nivo – mala tiskana slova, podebljano, veličina 16 pt (npr. 1. Uvod); drugi nivo – mala tiskana slova, podebljano, veličina 14 pt; treći nivo – mala tiskana slova, podebljano, veličina 12 pt; četvrti nivo – mala tiskana slova, bez podebljanja, veličina 12 pt; naslove treba poravnati uz lijevi rub teksta.';
const Q_UNIN_APA = 'American Psychological Association (tzv. APA) stil citiranja u području biomedicine. Popis literature navodi se prema APA 7 stilu.';
const Q_UNIN_HARVARD = 'Harvard stil citiranja u području društvenih znanosti. Citiranje prema Harvardskom stilu koristi se za područje društvenih znanosti.';
const Q_UNIN_VANCOUVER = 'Vancouver stil citiranja u području tehničkih znanosti. Vancouver stil je tzv. numerički stil citiranja koji se najčešće primjenjuje u području tehničkih znanosti.';

const Q_VELERI_FMT = 'Završni/diplomski rad piše se u A 4 formatu; tekst se piše u fontu Times New Roman veličine 12 točaka, razmak 1,5 redak, poravnan s obje strane, posebno uvučen prvi redak za veličinu jednog tabulatora (1,25), margine od 30 mm gore, dolje i lijevo te 20 mm desno.';
const Q_VELERI_FN = 'Font koji se koristi za bilješke je Times New Roman veličine 10 točaka.';
const Q_VELERI_OP = 'Opseg završnog/diplomskog rada na prijediplomskim studijima treba biti minimalno 30 stranica teksta bez priloga, a na diplomskim studijima minimalno 40 stranica teksta bez priloga.';

const Q_VUB_FMT = 'Rad treba pisati na papiru formata A4 (21 x 29,7 cm), a ispisivanje je jednostrano. Pri pisanju koristiti font Times New Roman (12 pt). Poravnanje treba biti obostrano, prored 1,5. Veličine margina: gornja, donja i desna su 25 mm, lijeva (za uvez) 30 mm.';
const Q_VUB_CIT = 'Literatura se navodi Vancouverskim stilom citiranja. Na literaturu se u tekstu poziva tako da se u okrugloj zagradi navede redni broj pod kojim je referenca u popisu literature.';

const Q_MEV_FMT = 'Rad se piše na standardnom A4 papiru. Rad se piše veličinom slova: font 14 – naslovna stranica; font 14 – naslovi poglavlja; font 12 – naslovi potpoglavlja; font 12 – tekst rada; font 10 – fusnote. Poravnanje teksta je obostrano. Margine trebaju iznositi 3 cm. Prored: 1,5 u glavnom dijelu teksta.';
const Q_MEV_OP = 'Završni rad mora imati najmanje 30 stranica. Preporučeni opseg stranica je 30 do 80.';

const Q_VVG_FMT = 'Rad treba ispisati na papiru formata A4, s marginama 3 cm lijevo, 2 cm desno, 2,5 cm gore i dolje) i zaglavljem i podnožjem 1,5 cm od ruba stranice.';
const Q_VVG_CIT = 'Citiranje dijela teksta iz literature u popisu, označava se na kraju citata rednim brojem literature iz popisa u uglatim zagradama.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const TNR = ['Times New Roman'];
const M_UNIN = { top: 2, right: 2.25, bottom: 2, left: 2.25 };
const M_VELERI = { top: 3, right: 2, bottom: 3, left: 3 };
const M_VUB = { top: 2.5, right: 2.5, bottom: 2.5, left: 3 };
const M_MEV = { top: 3, right: 3, bottom: 3, left: 3 };
const M_VVG = { top: 2.5, right: 2, bottom: 2.5, left: 3 };
const UNIN_HEADING = { numberRequired: true, romanLevelOneAllowed: false, maxLevel: 4, levels: { '1': { uppercase: false }, '2': { uppercase: false }, '3': { uppercase: false }, '4': { uppercase: false } } };

const uninEntries = (pid, src, citVal, citQuote) => [
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_UNIN_FMT, 'Upute, tehnicko oblikovanje'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_UNIN_FMT, 'Upute, tehnicko oblikovanje'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_UNIN_FMT, 'Upute, tehnicko oblikovanje'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_UNIN_FMT, 'Upute, tehnicko oblikovanje'),
  mk(pid, src, 'margins', M_UNIN, 'format', 'Margine', Q_UNIN_FMT, 'Upute, tehnicko oblikovanje'),
  mk(pid, src, 'heading-rules', UNIN_HEADING, 'structure', 'Pravila naslova (numerirano, mala tiskana, 4 razine)', Q_UNIN_HEAD, 'Upute, naslovi i podnaslovi'),
  mk(pid, src, 'citation-style', citVal, 'citation', `Stil citiranja (${citVal})`, citQuote, 'Upute, stilovi citiranja', { mc: false }),
];
const uninRules = (citVal) => ({ font: TNR, size: [12], spacing: 1.5, justify: true, margins: M_UNIN, headingRules: UNIN_HEADING, recommendedCitation: citVal });

const veleriEntries = (pid, src, opVal) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_VELERI_FMT, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_VELERI_FMT, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_VELERI_FMT, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_VELERI_FMT, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_VELERI_FMT, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'margins', M_VELERI, 'format', 'Margine', Q_VELERI_FMT, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'footnote-font', TNR, 'format', 'Vrsta slova biljeske', Q_VELERI_FN, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'footnote-size', [10], 'format', 'Velicina slova biljeske', Q_VELERI_FN, 'Upute, t. 3 Oblikovanje teksta'),
  mk(pid, src, 'page-count', opVal, 'scope', `Opseg (${opVal.min === 30 ? 'min 30' : 'min 40'} str.)`, Q_VELERI_OP, 'Upute, opseg'),
];
const veleriRules = () => ({ font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_VELERI, footnoteFont: TNR, footnoteSize: [10] });

const DEFS = [
  // ===== A: UNIN (Sveuciliste Sjever) - jedna grupa/unit, profili po podrucju x razini =====
  { inst: 'unin', instName: 'Sveuciliste Sjever', unitId: 'unin', unitName: 'Sveuciliste Sjever', family: 'mixed',
    sources: [{ id: 'unin-upute-radovi-2026', title: 'Upute za oblikovanje završnog i diplomskog rada (Sveučilište Sjever, sijecanj 2026)', url: 'https://www.unin.hr/wp-content/uploads/Upute-za-oblikovanje-zavr%C5%A1nog-i-diplomskog-rada_22.1.1.docx', kind: 'guidelines', note: '.docx (word/document.xml). Sveucilisni, cross-odjelni. A4 nije u obveznom popisu->izostavljen. Citiranje po podrucju: APA biomed, Harvard drustvene, Vancouver tehnika.' }],
    profiles: [
      { pid: 'unin-tehnicki-zavrsni', workType: 'final', program: 'Odjel za tehničke i gospodarske studije (završni rad, Sveučilište Sjever)', label: 'Sjever - Tehnicki i gospodarski studiji, zavrsni rad', src: 'unin-upute-radovi-2026', entries: (p, s) => uninEntries(p, s, 'vancouver', Q_UNIN_VANCOUVER), rules: uninRules('vancouver') },
      { pid: 'unin-tehnicki-diplomski', workType: 'graduate', program: 'Odjel za tehničke i gospodarske studije (diplomski rad, Sveučilište Sjever)', label: 'Sjever - Tehnicki i gospodarski studiji, diplomski rad', src: 'unin-upute-radovi-2026', entries: (p, s) => uninEntries(p, s, 'vancouver', Q_UNIN_VANCOUVER), rules: uninRules('vancouver') },
      { pid: 'unin-biomedicina-zavrsni', workType: 'final', program: 'Odjel za biomedicinske znanosti (završni rad, Sveučilište Sjever)', label: 'Sjever - Biomedicinske znanosti, zavrsni rad', src: 'unin-upute-radovi-2026', entries: (p, s) => uninEntries(p, s, 'apa', Q_UNIN_APA), rules: uninRules('apa') },
      { pid: 'unin-biomedicina-diplomski', workType: 'graduate', program: 'Odjel za biomedicinske znanosti (diplomski rad, Sveučilište Sjever)', label: 'Sjever - Biomedicinske znanosti, diplomski rad', src: 'unin-upute-radovi-2026', entries: (p, s) => uninEntries(p, s, 'apa', Q_UNIN_APA), rules: uninRules('apa') },
      { pid: 'unin-drustveni-zavrsni', workType: 'final', program: 'Odjeli društvenih znanosti - ekonomija, novinarstvo, komunikologija (završni rad, Sveučilište Sjever)', label: 'Sjever - Drustvene znanosti, zavrsni rad', src: 'unin-upute-radovi-2026', entries: (p, s) => uninEntries(p, s, 'harvard', Q_UNIN_HARVARD), rules: uninRules('harvard') },
      { pid: 'unin-drustveni-diplomski', workType: 'graduate', program: 'Odjeli društvenih znanosti - ekonomija, novinarstvo, komunikologija (diplomski rad, Sveučilište Sjever)', label: 'Sjever - Drustvene znanosti, diplomski rad', src: 'unin-upute-radovi-2026', entries: (p, s) => uninEntries(p, s, 'harvard', Q_UNIN_HARVARD), rules: uninRules('harvard') },
    ] },
  // ===== B: javna veleucilista =====
  { inst: 'veleri', instName: 'Veleuciliste u Rijeci', unitId: 'veleri', unitName: 'Veleuciliste u Rijeci', family: 'mixed',
    sources: [{ id: 'veleri-upute-formalni-izgled', title: 'Upute za formalni izgled završnog i diplomskog rada Veleučilišta u Rijeci', url: 'https://www.veleri.hr/sites/default/files/2023-01/upute-za-formalni-izgled-zavrsnog-i-diplomskog-rada-veleucilista-u-rijeci_0_0.pdf', kind: 'guidelines', note: 'Tekstualni PDF, institucijski. Citat autor-godina + opcija APA6->advisory.' }],
    profiles: [
      { pid: 'veleri-zavrsni', workType: 'final', program: 'Prijediplomski stručni studiji (završni rad, Veleučilište u Rijeci)', label: 'Veleuciliste Rijeka, zavrsni rad', src: 'veleri-upute-formalni-izgled', entries: (p, s) => veleriEntries(p, s, { min: 30 }), rules: veleriRules() },
      { pid: 'veleri-diplomski', workType: 'graduate', program: 'Specijalistički diplomski stručni studiji (Veleučilište u Rijeci)', label: 'Veleuciliste Rijeka, diplomski rad', src: 'veleri-upute-formalni-izgled', entries: (p, s) => veleriEntries(p, s, { min: 40 }), rules: veleriRules() },
    ] },
  { inst: 'vub', instName: 'Veleuciliste u Bjelovaru', unitId: 'vub', unitName: 'Veleuciliste u Bjelovaru', family: 'biomed',
    sources: [{ id: 'vub-upute-diplomski-2025', title: 'Upute za izradu i oblikovanje diplomskog rada (Veleučilište u Bjelovaru, 2025)', url: 'https://vub.hr/wp-content/uploads/2025/11/UPUTE-ZA-IZRADU-I-OBLIKOVANJE-DIPLOMSKOG-RADA-3.pdf', kind: 'guidelines', note: 'Tekstualni PDF, institucijski, diplomski. Opseg "dogovoriti s mentorom"->advisory.' }],
    profiles: [
      { pid: 'vub-diplomski', workType: 'graduate', program: 'Specijalistički diplomski stručni studiji (Veleučilište u Bjelovaru)', label: 'Veleuciliste Bjelovar, diplomski rad', src: 'vub-upute-diplomski-2025',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_VUB_FMT, 'Upute, Opce upute'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_VUB_FMT, 'Upute, Opce upute'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_VUB_FMT, 'Upute, Opce upute'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_VUB_FMT, 'Upute, Opce upute'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_VUB_FMT, 'Upute, Opce upute'),
          mk(p, s, 'margins', M_VUB, 'format', 'Margine', Q_VUB_FMT, 'Upute, Opce upute'),
          mk(p, s, 'citation-style', 'vancouver', 'citation', 'Stil citiranja (Vancouver)', Q_VUB_CIT, 'Upute, citiranje', { mc: false }),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_VUB, recommendedCitation: 'vancouver' } },
    ] },
  { inst: 'mev', instName: 'Medimursko veleuciliste u Cakovcu', unitId: 'mev', unitName: 'Medimursko veleuciliste u Cakovcu', family: 'mixed',
    sources: [{ id: 'mev-upute-zavrsni', title: 'Upute za izradu završnog rada (Međimursko veleučilište u Čakovcu, Prilog 3)', url: 'https://www.mev.hr/wp-content/uploads/2013/12/Prilog-3-Upute-za-izradu-zavr%C5%A1nog-rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF, institucijski. Font "najcesce TNR ili druga"->advisory; citiranje "u dogovoru s mentorom"->advisory.' }],
    profiles: [
      { pid: 'mev-zavrsni', workType: 'final', program: 'Prijediplomski stručni studiji (završni rad, Međimursko veleučilište)', label: 'Medimursko veleuciliste, zavrsni rad', src: 'mev-upute-zavrsni',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_MEV_FMT, 'Upute, Dodatak tehnicko oblikovanje'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_MEV_FMT, 'Upute, Dodatak tehnicko oblikovanje'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_MEV_FMT, 'Upute, Dodatak tehnicko oblikovanje'),
          mk(p, s, 'margins', M_MEV, 'format', 'Margine', Q_MEV_FMT, 'Upute, Dodatak tehnicko oblikovanje'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_MEV_FMT, 'Upute, Dodatak tehnicko oblikovanje'),
          mk(p, s, 'footnote-size', [10], 'format', 'Velicina slova fusnote', Q_MEV_FMT, 'Upute, Dodatak tehnicko oblikovanje'),
          mk(p, s, 'page-count', { min: 30 }, 'scope', 'Opseg (najmanje 30 str.)', Q_MEV_OP, 'Upute, opseg'),
        ], rules: { size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_MEV, footnoteSize: [10] } },
    ] },
  { inst: 'vvg', instName: 'Veleuciliste Velika Gorica', unitId: 'vvg', unitName: 'Veleuciliste Velika Gorica', family: 'mixed',
    sources: [{ id: 'vvg-upute-radovi-2013', title: 'Upute za izradu i obranu završnog i diplomskog rada (Veleučilište Velika Gorica, 2013)', url: 'https://vvg.hr/app/uploads/2020/02/Upute-za-izradu-i-obranu-zavrs%CC%8Cnog-i-diplomskog-rada-2013.pdf', kind: 'guidelines', note: 'Tekstualni PDF (novije verzije skenirane). Body font/velicina spregnut izbor (Arial 11 ILI Times 12)->neodrediv, izostavljen. Opseg u karticama+preporuka->adv.' }],
    profiles: [
      { pid: 'vvg-zavrsni', workType: 'final', program: 'Stručni prijediplomski studiji (završni rad, Veleučilište Velika Gorica)', label: 'Veleuciliste Velika Gorica, zavrsni rad', src: 'vvg-upute-radovi-2013', entries: (p, s) => vvgEntries(p, s), rules: vvgRules() },
      { pid: 'vvg-diplomski', workType: 'graduate', program: 'Stručni diplomski studiji (Veleučilište Velika Gorica)', label: 'Veleuciliste Velika Gorica, diplomski rad', src: 'vvg-upute-radovi-2013', entries: (p, s) => vvgEntries(p, s), rules: vvgRules() },
    ] },
];

function vvgEntries(pid, src) {
  const P = 'Upute, oblikovanje rada';
  return [
    mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_VVG_FMT, P),
    mk(pid, src, 'margins', M_VVG, 'format', 'Margine', Q_VVG_FMT, P),
    mk(pid, src, 'citation-style', 'ieee', 'citation', 'Stil citiranja (numericki, uglate zagrade)', Q_VVG_CIT, 'Upute, citiranje', { mc: false }),
  ];
}
function vvgRules() { return { requireA4: true, margins: M_VVG, recommendedCitation: 'ieee' }; }

for (const def of DEFS) {
  mkdirSync(`data/profiles/${def.unitId}/drafts`, { recursive: true });
  const profiles = [], ledger = [], catalogPrograms = [];
  const sources = def.sources.map((s) => ({
    id: s.id, kind: s.kind, title: s.title, url: s.url, publisher: def.unitName + ', ' + def.instName,
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
      note: `Tehnicko uredenje rada iz sluzbenog izvora (${def.unitName}, ${def.instName}), citano izravno.`,
      sources: [{ title: srcObj.title, url: srcObj.url }],
      sourceHierarchy: [srcObj.title],
      ruleAuthority: 'official-program-guidelines', normativeScope: es.filter((e) => e.status === 'verified').map((e) => e.label), advisoryScope: [],
    });
    for (const e of es) {
      if (e.status !== 'verified') continue;
      ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pr.pid, action: 'verified',
        actor: 'owner-bulk-approval', timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote,
        note: `Cross-institution port (${def.unitName}, ${def.instName}): direktno citanje izvora.` });
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
