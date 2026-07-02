/**
 * Cross-institution port: manja javna sveucilista - Zadar (unizd), Pula (unipu),
 * Dubrovnik (unidu). Tri nove institucijske grupe (reducer ih sam kreira).
 *
 * Zadar i Dubrovnik su ODJELNI (nema university-wide oblikovanja) -> jedan unit po
 * sveucilistu, vise odjelnih profila. Pula ima sveucilisni Pravilnik (Arial 12/1,5/2,5/A4)
 * koji fakulteti (FET/TFPU/FOOZ) preslikavaju + dodaju opseg po razini -> po fakultet unit.
 *
 * Autoritetske nijanse:
 *  - ZADAR: pravila su ODJELNA i razlikuju se (font TNR svugdje; margine 2,5 vs lijeva 3/3,5;
 *    citiranje APA psih / Harvard ped / fusnote pum / izbor turizam). Turizam dipl "mora 70".
 *  - PULA: font ARIAL (ne TNR!). FET/TFPU/FOOZ isti format + razlicit opseg (25/35/30 zav,
 *    60/60/50 dip). Citiranje Chicago/Harvard izbor -> advisory. FOOZ iz .doc (antiword mapiranje
 *    palo na dijakritici; citat restauriran iz istovjetnog CISTOG UNIPU boilerplatea).
 *  - DUBROVNIK: odjelno. Povijest (TNR fusnote, opseg u karticama->advisory, bez A4), Komunikologija
 *    (TNR/Arial, Harvard imperativ->scored), Ekonomija (Calibri, prored 17pt-exact NE mapira->izostavljen,
 *    "smjernice"+Harvard->citiranje advisory), Umjetnost/restauracija (margine lijeva 3, prored 1,15).
 *
 * Pokretanje: node scripts/gen-small-unis.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/{unizd,fetpu,tfpu,foozpu,unidu}.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-02';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'unizd-turizam-upute': 'data/sources/unizd/unizd-turizam-upute.pdf',
  'unizd-psihologija-upute': 'data/sources/unizd/unizd-psihologija-upute.pdf',
  'unizd-pedagogija-upute-2019': 'data/sources/unizd/unizd-pedagogija-upute-2019.pdf',
  'unizd-povijest-umj-upute-2019': 'data/sources/unizd/unizd-povijest-umj-upute-2019.pdf',
  'fet-naputak-radovi': 'data/sources/unipu/fet-naputak-radovi.pdf',
  'tfpu-naputak-radovi-2025': 'data/sources/unipu/tfpu-naputak-radovi-2025.pdf',
  'fooz-upute-radovi': 'data/sources/unipu/fooz-upute-radovi.doc',
  'unidu-povijest-upute': 'data/sources/unidu/unidu-povijest-upute.pdf',
  'unidu-komunikologija-upute-2025': 'data/sources/unidu/unidu-komunikologija-upute-2025.pdf',
  'unidu-ekonomija-prirucnik-2024': 'data/sources/unidu/unidu-ekonomija-prirucnik-2024.pdf',
  'unidu-umjetnost-naputak': 'data/sources/unidu/unidu-umjetnost-naputak.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

// --- Zadar citati ---
const Q_ZD_TKO = 'Format rada je A4 (210 x 297 mm). Rad treba pisati fontom Times New Roman, veličine 12 pt, uz prored 1,5. Rad treba pisati s obostranim poravnanjem („justify“). Margine rada uglavnom su već zadane u standardnim postavkama računalnog programa u kojem se piše, a trebaju biti 2,5 cm sa svake strane.';
const Q_ZD_TKO_OP = 'Diplomski rad mora imati najmanje 70 stranica.';
const Q_ZD_PSIH = 'Veličina stranice je A4 (210x297 mm). Rubnice (margine) trebaju biti sljedeće veličine: lijeva 30 mm, desna 25 mm, gornja i donja po 25 mm. Rad treba pisati fontom Times New Roman, veličine 12pt uz prored 1,5.';
const Q_ZD_PSIH_OP = 'Završni rad treba imati najmanje 20 i najviše 30 stranica.';
const Q_ZD_PSIH_CIT = 'Formalno uređenje teksta treba biti sukladno APA standardima (standardi za pisanje znanstvenih radova American Psychological Association).';
const Q_ZD_PED = 'Prilikom pisanja, potrebno je pridržavati se sljedećih smjernica za oblikovanje diplomskog rada: profesionalni font Times New Roman, veličina slova 12, prored 1,5 (s razmakom prije 0pt i razmakom poslije 0pt), standardne margine (2,5cm gornje, donje i desne margine te 3,5cm lijeve margine), obostrano poravnanje teksta te pisanje u odlomcima.';
const Q_ZD_PED_CIT = 'Bibliografske jedinice navode se prema harvardskom sustavu referiranja.';
const Q_ZD_PUM = 'Tekst treba formatirati na sljedeći način: pismo (font): Times New Roman, veličina 12; margine: lijevo 3,5 i desno 2,5 cm, gore i dolje 2,5 cm (to su automatski podešene vrijednosti u MS Word aplikaciji kod veličine papira A4); prored: 1,5; tekst pisati s obostranim poravnanjem („justify“).';

// --- Pula citati ---
const Q_FET_ZAV = 'Završni rad treba biti otisnut računalnim pisačem na papiru formata A4; font: Arial; veličina slova teksta 12; podrubne bilješke (fusnote) 10; prored 1,5; prored u bilješci 1,0; margine 2,5 cm.';
const Q_FET_DIP = 'Diplomski rad treba biti otisnut računalnim pisačem na papiru formata A4; font: Arial; veličina slova teksta 12; podrubne bilješke (fusnote) 10; prored 1,5; prored u bilješci 1,0; margine 2,5 cm.';
const Q_FET_ZAV_OP = 'Opseg završnog rada je minimalno 25 stranica.';
const Q_FET_DIP_OP = 'Opseg diplomskoga rada je minimalno 60 stranica.';
const Q_TFPU = 'Završni rad/diplomski rad treba biti otisnut računalnim pisačem na papiru formata A4; font: Arial; veličina slova teksta 12; podrubne bilješke (fusnote) 10; prored 1,5; prored u bilješci 1,0; margine 2,5 cm.';
const Q_TFPU_OP = 'Opseg završnog rada je minimalno 35 stranica dok je opseg diplomskog minimalno 60 stranica.';
// FOOZ .doc: dijakritika restaurirana iz istovjetnog CISTOG UNIPU boilerplatea (antiword pao na cp1252)
const Q_FOOZ_ZAV = 'Opseg završnog rada je minimalno 30 stranica. Završni rad treba biti napisan u formatu A4; vrsta slova: Arial; veličina slova teksta 12; podrubne bilješke 10; prored 1,5; prored u bilješci 1,0; margine 2,5 cm.';
const Q_FOOZ_DIP = 'Opseg diplomskoga rada je minimalno 50 stranica. Diplomski rad treba biti napisan u formatu A4; vrsta slova: Arial; veličina slova teksta 12; podrubne bilješke 10; prored 1,5; prored u bilješci 1,0; margine 2,5 cm.';

// --- Dubrovnik citati ---
const Q_DU_POV = 'Završni rad treba imati minimalno 30 kartica teksta (kartica sadrži 1.800 znakova s prazninama). Piše se koristeći font Times New Roman, veličinu znakova 12 i prored 1,5. Tekst mora biti obostrano poravnan, a margine sa sve četiri strane 2,5 cm.';
const Q_DU_KOM_FMT = 'veličina slova u tekstu (font size) treba biti 12 točaka, dok naslovi i podnaslovi trebaju biti nešto veći (14 ili 16 točaka), prored (line spacing) treba biti 1,5 u glavnom tekstu rada, jednostruki (1) u bilješkama (fusnotama), vrsta slova (font) može biti Times New Roman ili Arial, tekst treba biti formatiran u blok (justify) s uvučenim prvim retkom odlomka, margine trebaju biti po 2,5 centimetara sa svake strane.';
const Q_DU_KOM_A4 = 'Tekst diplomskog rada treba biti ispisan na standardnom bijelom papiru A4 formata (kopirni papir) i tvrdo ukoričen.';
const Q_DU_EKON = 'Pri oblikovanju teksta pratite sljedeće smjernice: veličina stranice: A4 (210 x 297 mm); margine (sve): 2,5 cm; font slova: Calibri, 12pt; tekst: obostrano poravnano.';
const Q_DU_UMJ = 'Rad pisati u formatu dokumenta A4. Margine: lijeva 3 cm, desna 2,5 cm, gornja 2,5 cm, donja 2,5 cm. Prored (Line spacing) 1,15 (osim za bilješke). Za pisanje rada koristiti font slova Times New Roman ili Arial. Glavni tekst pisati veličinom slova 12 pt, poravnanje obostrano.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M_L3 = { top: 2.5, right: 2.5, bottom: 2.5, left: 3 };
const M_L35 = { top: 2.5, right: 2.5, bottom: 2.5, left: 3.5 };
const TNR = ['Times New Roman'];
const ARIAL = ['Arial'];
const CALIBRI = ['Calibri'];
const TNR_ARIAL = ['Times New Roman', 'Arial'];

const puEntries = (pid, src, fmtQuote, opQuote, opVal, opLabel) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', fmtQuote, 'Naputak, tehnicko uredenje'),
  mk(pid, src, 'font', ARIAL, 'format', 'Vrsta slova', fmtQuote, 'Naputak, tehnicko uredenje'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', fmtQuote, 'Naputak, tehnicko uredenje'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', fmtQuote, 'Naputak, tehnicko uredenje'),
  mk(pid, src, 'margins', M25, 'format', 'Margine', fmtQuote, 'Naputak, tehnicko uredenje'),
  mk(pid, src, 'page-count', opVal, 'scope', `Opseg (${opLabel})`, opQuote, 'Naputak, opseg'),
];
const puRules = () => ({ font: ARIAL, size: [12], spacing: 1.5, requireA4: true, margins: M25 });

const DEFS = [
  // ===== ZADAR (unizd) - jedan unit, odjelni profili =====
  { inst: 'unizd', instName: 'Sveuciliste u Zadru', unitId: 'unizd', unitName: 'Sveuciliste u Zadru', family: 'mixed',
    sources: [
      { id: 'unizd-turizam-upute', title: 'Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Zadar)', url: 'https://www.unizd.hr/Portals/46/DIPLOMSKI%2C%20ZAVRSNI%20I%20SEMINARSKI%20RADOVI/Zavrsni%20radovi/Upute%20za%20izradu%20zavrsnoga%20i%20diplomskog%20rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Citiranje izbor (Harvard/fusnote) -> advisory.' },
      { id: 'unizd-psihologija-upute', title: 'Upute za izradu zavrsnog rada (Odjel za psihologiju, Zadar)', url: 'https://www.unizd.hr/Portals/12/Studenti%20PDF/Upute%20za%20izradu%20zavr%C5%A1nog%20rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF. APA fiksno.' },
      { id: 'unizd-pedagogija-upute-2019', title: 'Upute za pisanje diplomskog rada (Odjel za pedagogiju, Zadar, 2019)', url: 'https://www.unizd.hr/Portals/10/pdf/Upute%20za%20pisanje%20DIPLOMSKOG%20RADA_2019.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Harvard fiksno. Margine lijeva 3,5. A4 nije eksplicitno -> izostavljen.' },
      { id: 'unizd-povijest-umj-upute-2019', title: 'Upute za prijavu i izradu zavrsnoga rada (Odjel za povijest umjetnosti, Zadar, 2019)', url: 'https://www.unizd.hr/Portals/11/Odjel/Upute_za_prijavu_i_izradu_zavrsnoga_rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Fusnotni citat -> advisory. Margine lijeva 3,5.' },
    ],
    profiles: [
      { pid: 'unizd-turizam-zavrsni', workType: 'final', program: 'Odjel za turizam i komunikacijske znanosti (zavrsni rad, Zadar)', label: 'Zadar - Turizam i komunikacije, zavrsni rad', src: 'unizd-turizam-upute',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_ZD_TKO, 'Upute, oblikovanje'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
      { pid: 'unizd-turizam-diplomski', workType: 'graduate', program: 'Odjel za turizam i komunikacijske znanosti (diplomski rad, Zadar)', label: 'Zadar - Turizam i komunikacije, diplomski rad', src: 'unizd-turizam-upute',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_ZD_TKO, 'Upute, oblikovanje'),
          mk(p, s, 'page-count', { min: 70 }, 'scope', 'Opseg (najmanje 70 str.)', Q_ZD_TKO_OP, 'Upute, opseg'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
      { pid: 'unizd-psihologija-zavrsni', workType: 'final', program: 'Odjel za psihologiju (zavrsni rad, Zadar)', label: 'Zadar - Psihologija, zavrsni rad', src: 'unizd-psihologija-upute',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_ZD_PSIH, 'Upute, oblikovanje'),
          mk(p, s, 'margins', M_L3, 'format', 'Margine', Q_ZD_PSIH, 'Upute, oblikovanje'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_ZD_PSIH, 'Upute, oblikovanje'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_ZD_PSIH, 'Upute, oblikovanje'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_ZD_PSIH, 'Upute, oblikovanje'),
          mk(p, s, 'page-count', { min: 20, max: 30 }, 'scope', 'Opseg (20-30 str.)', Q_ZD_PSIH_OP, 'Upute, opseg'),
          mk(p, s, 'citation-style', 'apa', 'citation', 'Stil citiranja (APA)', Q_ZD_PSIH_CIT, 'Upute, citiranje', { mc: false }),
        ], rules: { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M_L3, recommendedCitation: 'apa' } },
      { pid: 'unizd-pedagogija-diplomski', workType: 'graduate', program: 'Odjel za pedagogiju (diplomski rad, Zadar)', label: 'Zadar - Pedagogija, diplomski rad', src: 'unizd-pedagogija-upute-2019',
        entries: (p, s) => [
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_ZD_PED, 'Upute, oblikovanje'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_ZD_PED, 'Upute, oblikovanje'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_ZD_PED, 'Upute, oblikovanje'),
          mk(p, s, 'margins', M_L35, 'format', 'Margine', Q_ZD_PED, 'Upute, oblikovanje'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_ZD_PED, 'Upute, oblikovanje'),
          mk(p, s, 'citation-style', 'harvard', 'citation', 'Stil citiranja (Harvard)', Q_ZD_PED_CIT, 'Upute, citiranje', { mc: false }),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, margins: M_L35, recommendedCitation: 'harvard' } },
      { pid: 'unizd-povijest-umj-zavrsni', workType: 'final', program: 'Odjel za povijest umjetnosti (zavrsni rad, Zadar)', label: 'Zadar - Povijest umjetnosti, zavrsni rad', src: 'unizd-povijest-umj-upute-2019',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_ZD_PUM, 'Upute, oblikovanje'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_ZD_PUM, 'Upute, oblikovanje'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_ZD_PUM, 'Upute, oblikovanje'),
          mk(p, s, 'margins', M_L35, 'format', 'Margine', Q_ZD_PUM, 'Upute, oblikovanje'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_ZD_PUM, 'Upute, oblikovanje'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_ZD_PUM, 'Upute, oblikovanje'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M_L35 } },
    ] },
  // ===== PULA (unipu) - po fakultet unit =====
  { inst: 'unipu', instName: 'Sveuciliste Jurja Dobrile u Puli', unitId: 'fetpu', unitName: 'Fakultet ekonomije i turizma Dr. Mijo Mirkovic, Pula', family: 'social',
    sources: [{ id: 'fet-naputak-radovi', title: 'Naputak o zavrsnom i diplomskom radu (FET, Pula)', url: 'https://fet.unipu.hr/_download/repository/Naputak_o_zavrsnom_i_diplomskom_radu.pdf', kind: 'guidelines', note: 'Tekstualni PDF; font Arial. Citiranje Chicago/Harvard izbor -> advisory.' }],
    profiles: [
      { pid: 'fetpu-zavrsni', workType: 'final', program: 'Prijediplomski studiji FET Pula (zavrsni rad)', label: 'FET Pula, zavrsni rad', src: 'fet-naputak-radovi', entries: (p, s) => puEntries(p, s, Q_FET_ZAV, Q_FET_ZAV_OP, { min: 25 }, 'najmanje 25 str.'), rules: puRules() },
      { pid: 'fetpu-diplomski', workType: 'graduate', program: 'Diplomski studiji FET Pula', label: 'FET Pula, diplomski rad', src: 'fet-naputak-radovi', entries: (p, s) => puEntries(p, s, Q_FET_DIP, Q_FET_DIP_OP, { min: 60 }, 'najmanje 60 str.'), rules: puRules() },
    ] },
  { inst: 'unipu', instName: 'Sveuciliste Jurja Dobrile u Puli', unitId: 'tfpu', unitName: 'Tehnicki fakultet u Puli', family: 'stem',
    sources: [{ id: 'tfpu-naputak-radovi-2025', title: 'Naputak o zavrsnom/diplomskom radu (Tehnicki fakultet Pula, 2025)', url: 'https://tfpu.unipu.hr/_download/repository/4_naputak_o_zavrsno_diplomskom_radu.pdf', kind: 'guidelines', note: 'Tekstualni PDF; font Arial. Citiranje izbor -> advisory.' }],
    profiles: [
      { pid: 'tfpu-zavrsni', workType: 'final', program: 'Prijediplomski/strucni studiji TFPU (zavrsni rad)', label: 'Tehnicki fakultet Pula, zavrsni rad', src: 'tfpu-naputak-radovi-2025', entries: (p, s) => puEntries(p, s, Q_TFPU, Q_TFPU_OP, { min: 35 }, 'najmanje 35 str.'), rules: puRules() },
      { pid: 'tfpu-diplomski', workType: 'graduate', program: 'Diplomski studiji TFPU', label: 'Tehnicki fakultet Pula, diplomski rad', src: 'tfpu-naputak-radovi-2025', entries: (p, s) => puEntries(p, s, Q_TFPU, Q_TFPU_OP, { min: 60 }, 'najmanje 60 str.'), rules: puRules() },
    ] },
  { inst: 'unipu', instName: 'Sveuciliste Jurja Dobrile u Puli', unitId: 'foozpu', unitName: 'Fakultet za odgojne i obrazovne znanosti, Pula', family: 'social',
    sources: [{ id: 'fooz-upute-radovi', title: 'Upute za pisanje zavrsnih i diplomskih radova (FOOZ, Pula)', url: 'https://fooz.unipu.hr/_download/repository/Upute_za_pisanje_zavrsnih_i_diplomskih_radova_FOOZ.doc', kind: 'guidelines', note: '.doc (antiword); font Arial. Citat dijakritika restaurirana iz istovjetnog UNIPU boilerplatea. Citiranje izbor -> advisory.' }],
    profiles: [
      { pid: 'foozpu-zavrsni', workType: 'final', program: 'Prijediplomski studiji FOOZ Pula (zavrsni rad)', label: 'FOOZ Pula, zavrsni rad', src: 'fooz-upute-radovi', entries: (p, s) => puEntries(p, s, Q_FOOZ_ZAV, Q_FOOZ_ZAV, { min: 30 }, 'najmanje 30 str.'), rules: puRules() },
      { pid: 'foozpu-diplomski', workType: 'graduate', program: 'Diplomski studiji FOOZ Pula', label: 'FOOZ Pula, diplomski rad', src: 'fooz-upute-radovi', entries: (p, s) => puEntries(p, s, Q_FOOZ_DIP, Q_FOOZ_DIP, { min: 50 }, 'najmanje 50 str.'), rules: puRules() },
    ] },
  // ===== DUBROVNIK (unidu) - jedan unit, odjelni profili =====
  { inst: 'unidu', instName: 'Sveuciliste u Dubrovniku', unitId: 'unidu', unitName: 'Sveuciliste u Dubrovniku', family: 'mixed',
    sources: [
      { id: 'unidu-povijest-upute', title: 'Upute za izradu zavrsnog rada - Povijest Jadrana i Mediterana (Odjel za humanisticke studije, Dubrovnik)', url: 'https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=7709', kind: 'guidelines', note: 'Tekstualni PDF; obvezujuce (Prilog Pravilnika). Opseg u karticama -> advisory. Fusnotni citat -> advisory. A4 nije eksplicitno -> izostavljen.' },
      { id: 'unidu-komunikologija-upute-2025', title: 'Upute za izradu diplomskog rada (Odjel za komunikologiju / mediji, Dubrovnik, 2025)', url: 'https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=45903', kind: 'guidelines', note: 'Tekstualni PDF; usvojeno na Fakultetskom vijecu 2025. Harvard imperativ -> scored.' },
      { id: 'unidu-ekonomija-prirucnik-2024', title: 'Prirucnik za izradu i obranu zavrsnog/diplomskog rada (Odjel za ekonomiju, Dubrovnik, 2024)', url: 'https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=26922', kind: 'guidelines', note: 'Tekstualni PDF; font Calibri. Prored 17pt-exact ne mapira -> izostavljen. "Smjernice" + Harvard -> citiranje advisory.' },
      { id: 'unidu-umjetnost-naputak', title: 'Naputak za oblikovanje i opremu diplomskog rada (Odjel za umjetnost i restauraciju, Dubrovnik)', url: 'https://www.unidu.hr/wp-content/plugins/quarascope/download.php?file=2333', kind: 'guidelines', note: 'Tekstualni PDF; obvezujuce (Pravilnik cl.9). Margine lijeva 3, prored 1,15. Fusnotni citat -> advisory.' },
    ],
    profiles: [
      { pid: 'unidu-povijest-zavrsni', workType: 'final', program: 'Povijest Jadrana i Mediterana (zavrsni rad, Dubrovnik)', label: 'Dubrovnik - Povijest, zavrsni rad', src: 'unidu-povijest-upute',
        entries: (p, s) => [
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_DU_POV, 'Opce upute, t. 2'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_DU_POV, 'Opce upute, t. 2'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_DU_POV, 'Opce upute, t. 2'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_DU_POV, 'Opce upute, t. 2'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_DU_POV, 'Opce upute, t. 2'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, margins: M25 } },
      { pid: 'unidu-komunikologija-diplomski', workType: 'graduate', program: 'Odjel za komunikologiju (diplomski rad, Dubrovnik)', label: 'Dubrovnik - Komunikologija, diplomski rad', src: 'unidu-komunikologija-upute-2025',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_DU_KOM_A4, 'Upute, §5'),
          mk(p, s, 'font', TNR_ARIAL, 'format', 'Vrsta slova (TNR ili Arial)', Q_DU_KOM_FMT, 'Upute, §5'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_DU_KOM_FMT, 'Upute, §5'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_DU_KOM_FMT, 'Upute, §5'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_DU_KOM_FMT, 'Upute, §5'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_DU_KOM_FMT, 'Upute, §5'),
          mk(p, s, 'citation-style', 'harvard', 'citation', 'Stil citiranja (Harvard)', 'Studenti trebaju koristiti harvardski stil citiranja literature.', 'Upute, §6', { mc: false }),
        ], rules: { font: TNR_ARIAL, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25, recommendedCitation: 'harvard' } },
      { pid: 'unidu-ekonomija-zavrsni', workType: 'final', program: 'Odjel za ekonomiju i poslovnu ekonomiju (zavrsni rad, Dubrovnik)', label: 'Dubrovnik - Ekonomija, zavrsni rad', src: 'unidu-ekonomija-prirucnik-2024', entries: (p, s) => ekonEntries(p, s), rules: ekonRules() },
      { pid: 'unidu-ekonomija-diplomski', workType: 'graduate', program: 'Odjel za ekonomiju i poslovnu ekonomiju (diplomski rad, Dubrovnik)', label: 'Dubrovnik - Ekonomija, diplomski rad', src: 'unidu-ekonomija-prirucnik-2024', entries: (p, s) => ekonEntries(p, s), rules: ekonRules() },
      { pid: 'unidu-umjetnost-diplomski', workType: 'graduate', program: 'Odjel za umjetnost i restauraciju (diplomski rad, Dubrovnik)', label: 'Dubrovnik - Umjetnost i restauracija, diplomski rad', src: 'unidu-umjetnost-naputak',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_DU_UMJ, 'Naputak, §II.II'),
          mk(p, s, 'margins', M_L3, 'format', 'Margine', Q_DU_UMJ, 'Naputak, §II.II'),
          mk(p, s, 'line-spacing', 1.15, 'format', 'Prored', Q_DU_UMJ, 'Naputak, §II.II'),
          mk(p, s, 'font', TNR_ARIAL, 'format', 'Vrsta slova (TNR ili Arial)', Q_DU_UMJ, 'Naputak, §II.II'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_DU_UMJ, 'Naputak, §II.II'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_DU_UMJ, 'Naputak, §II.II'),
        ], rules: { font: TNR_ARIAL, size: [12], spacing: 1.15, justify: true, requireA4: true, margins: M_L3 } },
    ] },
];

function ekonEntries(pid, src) {
  const P = 'Prirucnik, oblikovanje teksta (str. 13)';
  return [
    mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_DU_EKON, P),
    mk(pid, src, 'margins', M25, 'format', 'Margine', Q_DU_EKON, P),
    mk(pid, src, 'font', CALIBRI, 'format', 'Vrsta slova', Q_DU_EKON, P),
    mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_DU_EKON, P),
    mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_DU_EKON, P),
  ];
}
function ekonRules() { return { font: CALIBRI, size: [12], justify: true, requireA4: true, margins: M25 }; }

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
