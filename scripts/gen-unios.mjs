/**
 * Cross-institution port: Sveuciliste J.J. Strossmayera u Osijeku (unios) - treca javna grupa.
 * Reducer sam kreira grupu iz spec.institutionName.
 *
 * 9 sastavnica, 17 profila, 101 scored. Vise UNIOS drustvenih fakulteta dijeli isti obrazac
 * (TNR 12, prored 1,5, A4, rubnice 25mm) ali se margine i citiranje razlikuju - ne kopiraj naslijepo.
 *
 * Autoritetske nijanse:
 *  - FERIT: Upute (zav 2010 / dip); "Times Roman 12" (value ['Times New Roman']). Margine 25/20/25/25.
 *  - GRAFOS: Smjernice 2022 (.docx), "Tekst mora biti oblikovan": jednostrano A4, font TNR/Arial/
 *    Arial Narrow, margine lijeva+gornja 25 / desna+donja 20.
 *  - PTFOS: Upute 2020, samo diplomski. Font Arial 11 ILI Calibri 12 -> font-size [11,12]. Margine
 *    lijeva 3/desna 2/gore-dolje 2,5.
 *  - EFOS: Upute 2023 (.docx; Pravilnik skeniran). Diplomski opseg 30-50 imperativ (zav 20-30 adv).
 *    Harvard je DVOSMISLEN ("opredijelili smo se" ali i "preporucujemo/preporuceni") -> advisory.
 *  - PRAVOS: Upute (pdf), zav+dip. Margine 25/20/25/25. Opseg min 20. Citiranje delegirano -> advisory.
 *  - FFOS: Upute dip (.docx) + Pravilnik (pdf) za zav. Margine 25/20/25/25. Dip 30-50, zav 15-20.
 *    Citiranje delegirano -> advisory.
 *  - FAZOS: Upute 2024, zav+dip. Margine lijeva 3/ostale 2,5. Jednostrano. APA "treba koristiti"
 *    (cist imperativ) -> scored. Opseg zav min 20 / dip min 30.
 *  - MEFOS: Upute 2025 (tekst-sloj, verbatim potvrdjen). Rubnici 2,5. Vancouver "u pravilu" -> advisory.
 *  - KEMOS (Odjel za kemiju): Upute 2024, zav+dip. Rubnice 2,5. Numericki citat -> advisory.
 *
 * Pokretanje: node scripts/gen-unios.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/{ferit,grafos,ptfos,efos,pravos,ffos,fazos,mefos,kemos}.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-02';
const INST = 'unios';
const INST_NAME = 'Sveuciliste Josipa Jurja Strossmayera u Osijeku';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'ferit-upute-zavrsni-2010': 'data/sources/ferit/ferit-upute-zavrsni-2010.pdf',
  'ferit-upute-diplomski': 'data/sources/ferit/ferit-upute-diplomski.pdf',
  'grafos-smjernice-2022': 'data/sources/grafos/grafos-smjernice-2022.docx',
  'ptfos-upute-diplomski-2020': 'data/sources/ptfos/ptfos-upute-diplomski-2020.pdf',
  'efos-upute-studentski-2023': 'data/sources/efos/efos-upute-studentski-2023.docx',
  'pravos-upute-radovi': 'data/sources/pravos/pravos-upute-radovi.pdf',
  'ffos-upute-diplomski': 'data/sources/ffos/ffos-upute-diplomski.docx',
  'ffos-pravilnik-radovi': 'data/sources/ffos/ffos-pravilnik-radovi.pdf',
  'fazos-upute-zavrsni-2024': 'data/sources/fazos/fazos-upute-zavrsni-2024.pdf',
  'fazos-upute-diplomski-2024': 'data/sources/fazos/fazos-upute-diplomski-2024.pdf',
  'mefos-upute-radovi-2025': 'data/sources/mefos/mefos-upute-radovi-2025.pdf',
  'kemos-upute-radovi-2024': 'data/sources/kemos/kemos-upute-radovi-2024.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

const Q_FERIT_A4 = 'Format rada je A4 (210 x 297 mm).';
const Q_FERIT_FMT = 'Rad se piše na računalu (preporuča se MS Word) uz prored od 1,5. Pri obradi teksta potrebno je koristiti font Times Roman 12 pt (ili 10opi).';
const Q_FERIT_MARG = 'Margine teksta trebaju biti: lijeva 25 mm, desna 20 mm, gornja i donja 25 mm.';

const Q_GRAFOS = 'Tekst rada mora biti oblikovan na sljedeći način: rad se ispisuje jednostrano na papiru formata A4 (210x297 mm), naslovi i podnaslovi trebaju biti 14 ili 16 pt, podebljano (bold), poravnati uz lijevi rub, veličina slova u tekstu (font size) treba biti 12 pt, vrsta slova (font) može biti Times New Roman, Arial ili Arial Narrow, poravnanje teksta treba biti obostrano (justify), prored (line spacing) treba biti 1,5, margine teksta moraju biti: lijeva i gornja 25 mm, desna i donja 20 mm.';

const Q_PTFOS_MARG = 'Rad treba pisati na papiru formata A4, s marginama 3 cm lijevo, 2 cm desno, 2,5 cm gore i dolje) i zaglavljem i podnožjem 1,5 cm od ruba stranice.';
const Q_PTFOS_FONT = 'Za unos teksta koristi se font Arial, veličine 11 pt ili Calibri, veličine 12 pt, s obostranim poravnanjem, proreda 1,5 i razmakom između odlomaka 6 pt.';

const Q_EFOS_FMT = 'Veličina je stranice A4 (210x297 mm), a rubnice trebaju biti sljedeće veličine: lijeva 25 mm, desna 25 mm, gornja i donja po 25 mm. Rad treba pisati fontom Times New Roman veličine 12 točaka uz prored 1,5.';
const Q_EFOS_DIP = 'Obujam rada: diplomski rad treba imati između 30 i 50 stranica ne računajući sažetak, sadržaj, popis literature i priloge.';

const Q_PRAVOS_FMT = 'Veličina stranice A4 (210x297 mm). Rubnice (margine) trebaju biti sljedeće veličine: lijeva 25 mm, desna 20 mm, gornja i donja po 25 mm. Rad treba pisati fontom Times New Roman veličine 12 točaka uz prored 1,5.';
const Q_PRAVOS_OP = 'Diplomski/završni rad treba imati najmanje 20 stranica ne računajući naslovnu stranicu, sažetak, sadržaj, popis literature i priloge.';

const Q_FFOS_FMT = 'Veličina je stranice A4 (210x297 mm). Rubnice trebaju biti sljedeće veličine: lijeva 25 mm, desna 20 mm, gornja i donja po 25 mm. Rad treba pisati fontom Times New Roman veličine 12 točaka uz prored 1,5.';
const Q_FFOS_DIP = 'Diplomski rad treba imati između 30 i 50 stranica ne računajući sažetak, sadržaj, popis literature i priloge.';
const Q_FFOS_ZAV = 'Završni rad treba imati između 15 i 20 stranica ne računajući sažetak, sadržaj, popis literature i priloge.';

const Q_FAZOS = 'Rad treba pisati na papiru formata A4 (210*297 mm), s marginama 3 cm lijevo te 2,5 cm desno, gore i dolje, s obostranim poravnavanjem. Tekst se mora pisati samo s jedne strane lista, fontom Times New Roman uz razmak redova 1,5 i razmakom između odlomaka 6 pt.';
const Q_FAZOS_SIZE = 'Tekst cijelog rada treba pisati fontom veličine 12 pt.';
const Q_FAZOS_CIT = 'Za citiranje u tekstu rada treba koristiti APA stil citiranja.';
const Q_FAZOS_ZAV = 'Završni rad mora imati minimalno 20 stranica.';
const Q_FAZOS_DIP = 'Diplomski rad mora imati minimalno 30 stranica.';

const Q_MEFOS_PAGE = 'Rad se tiska se na papiru standardne veličine (A4, 210 x 297 mm) sa slobodnim rubnicima od 2,5 cm, a u proredu 1,5.';
const Q_MEFOS_FONT = 'Tekst se piše slovima veličine 12 tipografskih točaka vrste Times New Roman s obvezatnom potporom svih hrvatskih znakova. Tekst mora biti obostrano poravnat, osim referencija.';

const Q_KEMOS = 'Cjelokupni se tekst piše na A4 papiru (210x297 mm) s 1,5 proredom. Svi dijelovi teksta pišu se slovima Times New Roman, veličina slova 12 pt. Poravnanje teksta s marginama sa svih strana od 2.5 cm.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M_2520 = { top: 2.5, right: 2.0, bottom: 2.5, left: 2.5 };       // FERIT/PRAVOS/FFOS: 25/20/25/25
const M_GRAFOS = { top: 2.5, right: 2.0, bottom: 2.0, left: 2.5 };      // lijeva+gornja 25, desna+donja 20
const M_PTFOS = { top: 2.5, right: 2.0, bottom: 2.5, left: 3 };         // 3/2/2,5/2,5
const M_FAZOS = { top: 2.5, right: 2.5, bottom: 2.5, left: 3 };         // lijeva 3, ostale 2,5
const TNR = ['Times New Roman'];

const feritEntries = (pid, src) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_FERIT_A4, 't. 2.1'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_FERIT_FMT, 't. 2.4'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_FERIT_FMT, 't. 2.4'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_FERIT_FMT, 't. 2.4'),
  mk(pid, src, 'margins', M_2520, 'format', 'Margine', Q_FERIT_MARG, 't. 2.4'),
];
const grafosEntries = (pid, src) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_GRAFOS, 't. 3.1 Oblikovanje teksta'),
  mk(pid, src, 'font', ['Times New Roman', 'Arial', 'Arial Narrow'], 'format', 'Vrsta slova', Q_GRAFOS, 't. 3.1'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_GRAFOS, 't. 3.1'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_GRAFOS, 't. 3.1'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_GRAFOS, 't. 3.1'),
  mk(pid, src, 'margins', M_GRAFOS, 'format', 'Margine', Q_GRAFOS, 't. 3.1'),
];
const efosEntries = (pid, src, withOpseg) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_EFOS_FMT, 'Opce upute za oblikovanje rada'),
  mk(pid, src, 'margins', M25, 'format', 'Margine', Q_EFOS_FMT, 'Opce upute za oblikovanje rada'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_EFOS_FMT, 'Opce upute za oblikovanje rada'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_EFOS_FMT, 'Opce upute za oblikovanje rada'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_EFOS_FMT, 'Opce upute za oblikovanje rada'),
  ...(withOpseg ? [mk(pid, src, 'page-count', { min: 30, max: 50 }, 'scope', 'Opseg (30-50 str.)', Q_EFOS_DIP, 'Obujam rada')] : []),
];
const pravosFfosFmt = (pid, src, fmtQuote, page) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', fmtQuote, page),
  mk(pid, src, 'margins', M_2520, 'format', 'Margine', fmtQuote, page),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', fmtQuote, page),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', fmtQuote, page),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', fmtQuote, page),
];
const fazosEntries = (pid, src, opQuote, opVal, opLabel) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_FAZOS, 'pogl. 3 Izgled rada i obrada teksta'),
  mk(pid, src, 'margins', M_FAZOS, 'format', 'Margine', Q_FAZOS, 'pogl. 3 Izgled rada i obrada teksta'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_FAZOS, 'pogl. 3 Izgled rada i obrada teksta'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_FAZOS, 'pogl. 3 Izgled rada i obrada teksta'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_FAZOS, 'pogl. 3 Izgled rada i obrada teksta'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_FAZOS_SIZE, 'pogl. 3 Izgled rada i obrada teksta'),
  mk(pid, src, 'page-count', opVal, 'scope', `Opseg (${opLabel})`, opQuote, 'pogl. opseg rada'),
  mk(pid, src, 'citation-style', 'apa', 'citation', 'Stil citiranja (APA, autor-godina)', Q_FAZOS_CIT, 'pogl. citiranje', { mc: false }),
];
const mefosEntries = (pid, src) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_MEFOS_PAGE, 'Upute, izgled stranice'),
  mk(pid, src, 'margins', M25, 'format', 'Margine', Q_MEFOS_PAGE, 'Upute, izgled stranice'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_MEFOS_PAGE, 'Upute, izgled stranice'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_MEFOS_FONT, 'Upute, vrsta pisma'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_MEFOS_FONT, 'Upute, vrsta pisma'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_MEFOS_FONT, 'Upute, vrsta pisma'),
];
const kemosEntries = (pid, src) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_KEMOS, 'Upute, oblikovanje teksta'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_KEMOS, 'Upute, oblikovanje teksta'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_KEMOS, 'Upute, oblikovanje teksta'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_KEMOS, 'Upute, oblikovanje teksta'),
  mk(pid, src, 'margins', M25, 'format', 'Margine', Q_KEMOS, 'Upute, oblikovanje teksta'),
];

const src1 = (id, title, url, kind, note) => ({ id, title, url, kind, note });

const DEFS = [
  { unitId: 'ferit', unitName: 'Fakultet elektrotehnike, racunarstva i informacijskih tehnologija Osijek', family: 'stem',
    sources: [src1('ferit-upute-zavrsni-2010', 'Upute za izradu zavrsnog rada (FERIT)', 'https://www.ferit.unios.hr/preuzmi/1350/upute_za_izradu_zavr%C5%A1nog_rada_26-01-2010.pdf', 'guidelines', 'Tekstualni PDF; pogl. 2 Obrada teksta.'),
      src1('ferit-upute-diplomski', 'Upute za izradu diplomskog rada (FERIT)', 'https://www.ferit.unios.hr/dokumenti/dodiplomski/upute_za_izradu_diplomskog_rada.pdf', 'guidelines', 'Tekstualni PDF; pogl. 2 Obrada teksta. Ista pravila kao zavrsni.')],
    profiles: [
      { pid: 'ferit-zavrsni', workType: 'final', program: 'Prijediplomski studiji FERIT (zavrsni rad)', label: 'FERIT, zavrsni rad', src: 'ferit-upute-zavrsni-2010', entries: feritEntries, rules: feritRules() },
      { pid: 'ferit-diplomski', workType: 'graduate', program: 'Diplomski studiji FERIT', label: 'FERIT, diplomski rad', src: 'ferit-upute-diplomski', entries: feritEntries, rules: feritRules() },
    ] },
  { unitId: 'grafos', unitName: 'Gradevinski i arhitektonski fakultet Osijek', family: 'stem',
    sources: [src1('grafos-smjernice-2022', 'Smjernice za izradu i oblikovanje zavrsnih i diplomskih radova (GFOS, 2022)', 'https://www.gfos.unios.hr/download/smjernice-za-izradu-zavrsnih-i-diplomskih-radova-01-10-2022.docx', 'guidelines', '.docx; t. 3.1 "Tekst mora biti oblikovan". Vrijedi za zavrsni i diplomski.')],
    profiles: [
      { pid: 'grafos-zavrsni', workType: 'final', program: 'Prijediplomski/strucni studiji GFOS (zavrsni rad)', label: 'GFOS, zavrsni rad', src: 'grafos-smjernice-2022', entries: grafosEntries, rules: grafosRules() },
      { pid: 'grafos-diplomski', workType: 'graduate', program: 'Diplomski studiji GFOS', label: 'GFOS, diplomski rad', src: 'grafos-smjernice-2022', entries: grafosEntries, rules: grafosRules() },
    ] },
  { unitId: 'ptfos', unitName: 'Prehrambeno-tehnoloski fakultet Osijek', family: 'stem',
    sources: [src1('ptfos-upute-diplomski-2020', 'Upute za pisanje, ocjenu i obranu diplomskog rada (PTFOS, 2020)', 'https://www.ptfos.unios.hr/images/dokumenti/studenti/Odluke-pravilnici-upute/Upute/ptf_upute_za_diplomske_radove_07-2020.pdf', 'guidelines', 'Tekstualni PDF; samo diplomski. Font Arial 11 ili Calibri 12. Opseg 30-50 preporucljiv -> advisory.')],
    profiles: [
      { pid: 'ptfos-diplomski', workType: 'graduate', program: 'Diplomski studiji PTFOS', label: 'PTFOS, diplomski rad', src: 'ptfos-upute-diplomski-2020',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_PTFOS_MARG, 'pogl. Izgled rada'),
          mk(p, s, 'margins', M_PTFOS, 'format', 'Margine', Q_PTFOS_MARG, 'pogl. Izgled rada'),
          mk(p, s, 'font', ['Arial', 'Calibri'], 'format', 'Vrsta slova (Arial ili Calibri)', Q_PTFOS_FONT, 'pogl. Oblikovanje teksta'),
          mk(p, s, 'font-size', [11, 12], 'format', 'Velicina slova (Arial 11 / Calibri 12)', Q_PTFOS_FONT, 'pogl. Oblikovanje teksta'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_PTFOS_FONT, 'pogl. Oblikovanje teksta'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_PTFOS_FONT, 'pogl. Oblikovanje teksta'),
        ], rules: { font: ['Arial', 'Calibri'], size: [11, 12], spacing: 1.5, justify: true, requireA4: true, margins: M_PTFOS } },
    ] },
  { unitId: 'efos', unitName: 'Ekonomski fakultet u Osijeku', family: 'social',
    sources: [src1('efos-upute-studentski-2023', 'Upute za pisanje studentskih radova (EFOS, 2023)', 'https://www.efos.unios.hr/wp-content/uploads/2024/01/Upute_za_pisanje_studentskih_radova_travanj-2023_lekt.docx', 'guidelines', '.docx (Pravilnik 2023 je skeniran). Harvard dvosmislen ("opredijelili" ali i "preporuceni") -> advisory.')],
    profiles: [
      { pid: 'efos-zavrsni', workType: 'final', program: 'Prijediplomski/strucni studiji EFOS (zavrsni rad)', label: 'EFOS, zavrsni rad', src: 'efos-upute-studentski-2023', entries: (p, s) => efosEntries(p, s, false), rules: efosRules() },
      { pid: 'efos-diplomski', workType: 'graduate', program: 'Diplomski studiji EFOS', label: 'EFOS, diplomski rad', src: 'efos-upute-studentski-2023', entries: (p, s) => efosEntries(p, s, true), rules: efosRules() },
    ] },
  { unitId: 'pravos', unitName: 'Pravni fakultet Osijek', family: 'social',
    sources: [src1('pravos-upute-radovi', 'Upute za pisanje i predaju zavrsnog/diplomskog rada (Pravni fakultet Osijek)', 'https://www.pravos.unios.hr/pravo-arhiva/download/upute-za-izradu-zavsnih-radova.pdf', 'guidelines', 'Tekstualni PDF; dio II Tekst rada. Citiranje delegirano na stil u struci/mentor -> advisory.')],
    profiles: [
      { pid: 'pravos-zavrsni', workType: 'final', program: 'Prijediplomski studij Pravo/Socijalni rad (zavrsni rad, Osijek)', label: 'Pravni fakultet Osijek, zavrsni rad', src: 'pravos-upute-radovi', entries: (p, s) => [...pravosFfosFmt(p, s, Q_PRAVOS_FMT, 'dio II Tekst rada'), mk(p, s, 'page-count', { min: 20 }, 'scope', 'Opseg (najmanje 20 str.)', Q_PRAVOS_OP, 'dio II Tekst rada')], rules: pravosFfosRules() },
      { pid: 'pravos-diplomski', workType: 'graduate', program: 'Diplomski/integrirani studij Pravo (Osijek)', label: 'Pravni fakultet Osijek, diplomski rad', src: 'pravos-upute-radovi', entries: (p, s) => [...pravosFfosFmt(p, s, Q_PRAVOS_FMT, 'dio II Tekst rada'), mk(p, s, 'page-count', { min: 20 }, 'scope', 'Opseg (najmanje 20 str.)', Q_PRAVOS_OP, 'dio II Tekst rada')], rules: pravosFfosRules() },
    ] },
  { unitId: 'ffos', unitName: 'Filozofski fakultet Osijek', family: 'social',
    sources: [
      src1('ffos-upute-diplomski', 'Upute za izradu diplomskoga rada (FFOS)', 'https://www.ffos.unios.hr/download/upute-za-izradu-diplomskoga-rada.docx', 'guidelines', '.docx; dio II Izgled diplomskoga rada. Citiranje delegirano -> advisory.'),
      src1('ffos-pravilnik-radovi', 'Pravilnik o zavrsnim i diplomskim radovima i ispitu (FFOS)', 'https://www.ffos.unios.hr/wp-content/uploads/2022/03/Pravilnik-o-zavrsnim-i-diplomskim-radovima-i-ispitu.pdf', 'regulation', 'Tekstualni PDF; sadrzi Upute za zavrsni rad (isti format, opseg 15-20).'),
    ],
    profiles: [
      { pid: 'ffos-zavrsni', workType: 'final', program: 'Prijediplomski studiji FFOS (zavrsni rad)', label: 'FFOS, zavrsni rad', src: 'ffos-pravilnik-radovi', entries: (p, s) => [...pravosFfosFmt(p, s, Q_FFOS_FMT, 'Upute za zavrsni rad (dio II)'), mk(p, s, 'page-count', { min: 15, max: 20 }, 'scope', 'Opseg (15-20 str.)', Q_FFOS_ZAV, 'Upute za zavrsni rad')], rules: pravosFfosRules() },
      { pid: 'ffos-diplomski', workType: 'graduate', program: 'Diplomski studiji FFOS', label: 'FFOS, diplomski rad', src: 'ffos-upute-diplomski', entries: (p, s) => [...pravosFfosFmt(p, s, Q_FFOS_FMT, 'dio II Izgled diplomskoga rada'), mk(p, s, 'page-count', { min: 30, max: 50 }, 'scope', 'Opseg (30-50 str.)', Q_FFOS_DIP, 'dio II Izgled diplomskoga rada')], rules: pravosFfosRules() },
    ] },
  { unitId: 'fazos', unitName: 'Fakultet agrobiotehnickih znanosti Osijek', family: 'stem',
    sources: [
      src1('fazos-upute-zavrsni-2024', 'Upute za izradu zavrsnog rada (FAZOS, 2024)', 'https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20zavr%C5%A1nog%20rada_4.8.2024.pdf', 'guidelines', 'Tekstualni PDF; pogl. 3. APA imperativ. Margine lijeva 3/ostale 2,5.'),
      src1('fazos-upute-diplomski-2024', 'Upute za izradu diplomskog rada (FAZOS, 2024)', 'https://www.fazos.unios.hr/storage/Dokumenti/upute/Upute%20za%20izradu%20diplomskog%20rada_4.8.2024.pdf', 'guidelines', 'Tekstualni PDF; pogl. 3. APA imperativ. Margine lijeva 3/ostale 2,5.'),
    ],
    profiles: [
      { pid: 'fazos-zavrsni', workType: 'final', program: 'Prijediplomski studiji FAZOS (zavrsni rad)', label: 'FAZOS, zavrsni rad', src: 'fazos-upute-zavrsni-2024', entries: (p, s) => fazosEntries(p, s, Q_FAZOS_ZAV, { min: 20 }, 'najmanje 20 str.'), rules: fazosRules() },
      { pid: 'fazos-diplomski', workType: 'graduate', program: 'Diplomski studiji FAZOS', label: 'FAZOS, diplomski rad', src: 'fazos-upute-diplomski-2024', entries: (p, s) => fazosEntries(p, s, Q_FAZOS_DIP, { min: 30 }, 'najmanje 30 str.'), rules: fazosRules() },
    ] },
  { unitId: 'mefos', unitName: 'Medicinski fakultet Osijek', family: 'biomed',
    sources: [src1('mefos-upute-radovi-2025', 'Upute za izradu i oblikovanje zavrsnog i diplomskog rada (MEFOS, 2025)', 'https://www.mefos.unios.hr/images/studenti/zavrsetak-studija/upute-ozzid-2025-nove_.pdf', 'guidelines', 'Tekstualni PDF (verbatim potvrdjen). Vancouver "u pravilu" -> advisory.')],
    profiles: [
      { pid: 'mefos-zavrsni', workType: 'final', program: 'Prijediplomski/strucni studiji MEFOS (zavrsni rad)', label: 'MEFOS, zavrsni rad', src: 'mefos-upute-radovi-2025', entries: mefosEntries, rules: mefosRules() },
      { pid: 'mefos-diplomski', workType: 'graduate', program: 'Diplomski/integrirani studiji MEFOS', label: 'MEFOS, diplomski rad', src: 'mefos-upute-radovi-2025', entries: mefosEntries, rules: mefosRules() },
    ] },
  { unitId: 'kemos', unitName: 'Odjel za kemiju, Sveuciliste u Osijeku', family: 'stem',
    sources: [src1('kemos-upute-radovi-2024', 'Upute za pisanje zavrsnog/diplomskog rada (Odjel za kemiju Osijek, 2024)', 'https://www.kemija.unios.hr/wp-content/uploads/2025/01/PRILOG-4-UPUTE-ZA-PISANJE-ZAVRSNOG-DIPLOMSKOG-RADA.pdf', 'guidelines', 'Tekstualni PDF; faculty-wide. Numericki citat -> advisory.')],
    profiles: [
      { pid: 'kemos-zavrsni', workType: 'final', program: 'Prijediplomski studij Kemija (zavrsni rad, Osijek)', label: 'Odjel za kemiju Osijek, zavrsni rad', src: 'kemos-upute-radovi-2024', entries: kemosEntries, rules: kemosRules() },
      { pid: 'kemos-diplomski', workType: 'graduate', program: 'Diplomski studij Kemija (Osijek)', label: 'Odjel za kemiju Osijek, diplomski rad', src: 'kemos-upute-radovi-2024', entries: kemosEntries, rules: kemosRules() },
    ] },
];

function feritRules() { return { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M_2520 }; }
function grafosRules() { return { font: ['Times New Roman', 'Arial', 'Arial Narrow'], size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_GRAFOS }; }
function efosRules() { return { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M25 }; }
function pravosFfosRules() { return { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M_2520 }; }
function fazosRules() { return { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_FAZOS, recommendedCitation: 'apa' }; }
function mefosRules() { return { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 }; }
function kemosRules() { return { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M25 }; }

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
      note: `Tehnicko uredenje rada iz sluzbenog izvora (${def.unitName}, ${INST_NAME}), citano izravno.`,
      sources: [{ title: srcObj.title, url: srcObj.url }],
      sourceHierarchy: [srcObj.title],
      ruleAuthority: 'official-program-guidelines',
      normativeScope: es.filter((e) => e.status === 'verified').map((e) => e.label),
      advisoryScope: [],
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
