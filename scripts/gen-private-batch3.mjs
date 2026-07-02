/**
 * Cross-institution port, batch 3: preostali zagrebacki stubovi (VSITE, VKJS, HKS).
 * Nastavak na batch 1 (ZSEM, Libertas) i batch 2 (Effectus, RRiF, PVZG, ZVU).
 *
 * Autoritetske nijanse (prenesene u profil):
 *  - VSITE (Veleuciliste suvremenih IT): Pravilnik cl. 7 daje opseg (zavrsni 30-40 /
 *    diplomski 50-60, "u pravilu") i strukturu (ukljucuje sadrzaj -> toc). SVU tipografiju
 *    (font/velicina/margine/prored) izrijekom delegira na Predlozak (cl. 7 st. 5) koji NIJE
 *    javno dohvatljiv -> izostavljena iz scored. Tanak, ali posten partial profil.
 *  - VKJS (Veleuciliste kriminalistike i javne sigurnosti, MUP/.gov.hr): Upute 2024
 *    propisuju izgled rada imperativno; tekstualni PDF, citano izravno. Vrijedi za zavrsni
 *    i diplomski rad. Bogata tipografija; nema page-count pravila (ne izmisljaj). Citatni
 *    stil APA jedinstven i mandatoran -> scored (mc:false, kao RGNF harvard).
 *  - HKS (Hrvatsko katolicko sveuciliste): dvoslojno. Institucija-wide Opce upute (dio I)
 *    daju mandatornu tipografiju (A4, Book Antiqua 11, margine 2,5, prored 1,5, justify).
 *    HKS regulira SAMO diplomski rad (nema izvora za zavrsni). Odjelne Posebne upute dodaju
 *    opseg u KARTICAMA (1800 znakova, ne stranice -> ne mapira na page-count) i citatni stil
 *    koji varira po odjelu (sestrinstvo Vancouver, psihologija APA, povijest Chicago) ->
 *    advisory, izvan institucijskog scored skupa. Jedan institucija-wide hks-diplomski.
 *
 * Pokretanje: node scripts/gen-private-batch3.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/vsite.json \
 *       discovery/port-specs/vkjs.json discovery/port-specs/hks.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-02';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'vsite-pravilnik-2014': 'data/sources/vsite/vsite-pravilnik-2014.pdf',
  'vkjs-upute-zavrsni-diplomski-2024': 'data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf',
  'hks-opce-upute-diplomski-2023': 'data/sources/hks/hks-opce-upute-diplomski-2023.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

// --- doslovni citati (verbatim iz izvora) ---
const Q_VSITE_7 = 'Završni rad studenta u pravilu ima 30-40 stranica, a diplomski rad 50-60 stranica. Rad je opremljen naslovnom stranicom, stranicom zadatka, sadržajem, zaključkom, popisom literature, sažetkom na hrvatskom i engleskom jeziku, te ključnim riječima na hrvatskom i engleskom jeziku.';

const Q_VKJS_PAPER = 'Rad treba biti računalno napisan u formatu docx (kompatibilan s programom Microsoft Word), u formatu A4 (21 x 29,7 cm).';
const Q_VKJS_MARG = 'Margine trebaju biti: lijeva 2,5 cm, desna 2,0 cm, gornja i donja po 2,5 cm.';
const Q_VKJS_FONT = 'Oblik i veličina slova (veličina: 12 točaka, font: Times New Roman) su jednaki u cijelom tekstu, osim u naslovima, podnaslovima i fusnotama, a prored je 1,5 redak u cijelom tekstu.';
const Q_VKJS_JUST = 'Tekst se piše s obostranim poravnanjem.';
const Q_VKJS_CIT = 'Za izradu završnih/diplomskih radova na Veleučilištu kriminalistike i javne sigurnosti koristi se APA stil.';

const Q_HKS_PAPER = 'Diplomski rad piše se: na računalu u formatu A4';
const Q_HKS_FONT = 'pismo (font): Book Antiqua, veličina slova 11';
const Q_HKS_MARG = 'margine: lijevo i desno 2,5 cm, gore i dolje 2,5 cm';
const Q_HKS_SPACING = 'prored: 1,5';
const Q_HKS_JUST = 'tekst mora biti obostrano poravnan (Paragraph, Justify)';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M_VKJS = { top: 2.5, right: 2.0, bottom: 2.5, left: 2.5 };
const P_VKJS = 't. 1.2-1.4, 1.8, 3. (Upute 2024)';

const DEFS = {
  vsite: {
    institution: 'vsite', unitId: 'vsite', instName: 'Veleuciliste suvremenih informacijskih tehnologija', kind: 'regulation',
    srcId: 'vsite-pravilnik-2014',
    srcTitle: 'Pravilnik o izradi i obrani zavrsnog i diplomskog rada (VSITE, 2014)',
    srcUrl: 'https://www.vsite.hr/sites/default/files/Vsite-Pravilnik_za_zavrsni_rad140923-reg.pdf',
    srcNote: 'Institucija-wide Pravilnik; Clanak 7 daje opseg i strukturu. Tipografija izrijekom delegirana na Predlozak (cl. 7 st. 5) koji nije javno dohvatljiv -> izostavljena. Numeracija poglavlja i numeriran popis literature su mandatorni ali advisory (bez tipografije).',
    profiles: [
      { pid: 'vsite-zavrsni', workType: 'final', program: 'Prijediplomski strucni studiji VSITE (zavrsni rad)', label: 'VSITE, zavrsni rad',
        entries: (pid, s) => [
          mk(pid, s, 'page-count', { min: 30, max: 40 }, 'scope', 'Opseg (30-40 str.)', Q_VSITE_7, 'Članak 7. st. 2'),
          mk(pid, s, 'toc', true, 'structure', 'Sadrzaj', Q_VSITE_7, 'Članak 7. st. 2'),
        ],
        rules: { requireToc: true } },
      { pid: 'vsite-diplomski', workType: 'graduate', program: 'Diplomski strucni studiji VSITE', label: 'VSITE, diplomski rad',
        entries: (pid, s) => [
          mk(pid, s, 'page-count', { min: 50, max: 60 }, 'scope', 'Opseg (50-60 str.)', Q_VSITE_7, 'Članak 7. st. 2'),
          mk(pid, s, 'toc', true, 'structure', 'Sadrzaj', Q_VSITE_7, 'Članak 7. st. 2'),
        ],
        rules: { requireToc: true } },
    ],
  },
  vkjs: {
    institution: 'vkjs', unitId: 'vkjs', instName: 'Veleuciliste kriminalistike i javne sigurnosti', kind: 'guidelines',
    srcId: 'vkjs-upute-zavrsni-diplomski-2024',
    srcTitle: 'Upute za izradu zavrsnog/diplomskog rada (VKJS, 2024)',
    srcUrl: 'https://kriminalistika.gov.hr/UserDocsImages/04_vps/2024/Upute%20za%20izradu%20zavr%C5%A1nog_diplomskog%20rada.pdf',
    srcNote: 'Institucija-wide Upute (Policijska akademija / MUP RH); izrijekom "propisuje se izgled rada". Tekstualni PDF, citano izravno. Vrijedi za zavrsni i diplomski rad. Nema page-count pravila. Citatni stil APA jedinstven i mandatoran.',
    profiles: [
      { pid: 'vkjs-zavrsni', workType: 'final', program: 'Prijediplomski strucni studij VKJS (zavrsni rad)', label: 'VKJS, zavrsni rad',
        entries: (pid, s) => vkjsEntries(pid, s), rules: vkjsRules() },
      { pid: 'vkjs-diplomski', workType: 'graduate', program: 'Specijalisticki diplomski strucni studij VKJS (diplomski rad)', label: 'VKJS, diplomski rad',
        entries: (pid, s) => vkjsEntries(pid, s), rules: vkjsRules() },
    ],
  },
  hks: {
    institution: 'hks', unitId: 'hks', instName: 'Hrvatsko katolicko sveuciliste', kind: 'guidelines',
    srcId: 'hks-opce-upute-diplomski-2023',
    srcTitle: 'Opce upute za izradu diplomskog rada (HKS, izmjene prosinac 2023)',
    srcUrl: 'https://www.unicath.hr/sites/default/files/2024-10/Opc%CC%81e-upute-za-izradu-diplomskog-rada-izmjene-prosinac-2023.pdf',
    srcNote: 'Institucija-wide Opce upute (dio I. "Diplomski rad pise se"); mandatorna tipografija. HKS regulira samo diplomski rad. Odjelne Posebne upute dodaju opseg u karticama (1800 znakova, ne stranice) i citatni stil koji varira po odjelu (sestrinstvo Vancouver, psihologija APA, povijest Chicago) -> advisory, izvan institucijskog scored skupa.',
    advisoryNote: 'Opseg (u karticama) i citatni stil odreduju se odjelnim Posebnim uputama i razlikuju se po odjelu -> nisu u institucijskom scored skupu.',
    profiles: [
      { pid: 'hks-diplomski', workType: 'graduate', program: 'Diplomski sveucilisni studiji HKS', label: 'HKS, diplomski rad',
        entries: (pid, s) => {
          const P = 'Opce upute, dio I. (Diplomski rad pise se), str. 1';
          return [
            mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_HKS_PAPER, P),
            mk(pid, s, 'font', ['Book Antiqua'], 'format', 'Vrsta slova', Q_HKS_FONT, P),
            mk(pid, s, 'font-size', 11, 'format', 'Velicina slova', Q_HKS_FONT, P),
            mk(pid, s, 'margins', M25, 'format', 'Margine', Q_HKS_MARG, P),
            mk(pid, s, 'line-spacing', 1.5, 'format', 'Prored', Q_HKS_SPACING, P),
            mk(pid, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_HKS_JUST, P),
          ];
        },
        rules: { font: ['Book Antiqua'], size: [11], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
    ],
  },
};

function vkjsEntries(pid, s) {
  return [
    mk(pid, s, 'paper-size', 'A4', 'format', 'Format papira', Q_VKJS_PAPER, 't. 1.2.'),
    mk(pid, s, 'margins', M_VKJS, 'format', 'Margine', Q_VKJS_MARG, 't. 1.3.'),
    mk(pid, s, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_VKJS_FONT, 't. 1.4.'),
    mk(pid, s, 'font-size', 12, 'format', 'Velicina slova', Q_VKJS_FONT, 't. 1.4.'),
    mk(pid, s, 'line-spacing', 1.5, 'format', 'Prored', Q_VKJS_FONT, 't. 1.4.'),
    mk(pid, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_VKJS_JUST, 't. 1.8.'),
    mk(pid, s, 'citation-style', 'apa', 'citation', 'Stil citiranja (APA, autor-godina)', Q_VKJS_CIT, 't. 3.', { mc: false }),
  ];
}
function vkjsRules() {
  return { font: ['Times New Roman'], size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_VKJS, recommendedCitation: 'apa' };
}

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
      advisoryScope: def.advisoryNote ? ['Opseg (odjelno)', 'Stil citiranja (odjelno)'] : [],
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
