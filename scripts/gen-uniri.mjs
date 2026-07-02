/**
 * Cross-institution port: Sveuciliste u Rijeci (uniri) - PRVA nova institucijska grupa
 * izvan unizg (javno sveuciliste). Reducer sam kreira grupu iz spec.institutionName.
 *
 * 7 sastavnica sa scored profilima (RITEH i GRADRI izostavljeni: tijelo teksta im je
 * izrijekom "preporucuje se" -> advisory, bez strojno-scored tipografije; INF ukljucen
 * kao tanak partial jer je tipografija iza Merlin logina, javno samo A4 + min. stranica).
 *
 * Autoritetske nijanse:
 *  - EFRI: Pravilnik 2014 (skeniran, re-OCR nasim tesseractom za cist citat). Margine 3 cm,
 *    Harvard citiranje (jedinstven, mandatoran) -> scored (mc:false kao RGNF/VKJS).
 *  - PRAVRI: Upute 2023 (tekst); Normativ stranice 2.1. Citiranje fusnote -> advisory.
 *  - FFRI: fakultetski Pravilnik 2023 zav (cl.8) + dip (cl.11), "Oblikovanje mora biti".
 *    Opseg "u pravilu" -> advisory. Re-OCR za cist citat (izvorni glyph glitch na brojkama).
 *  - PFRI: Upute 2025 (tekst); pogl. 3 Tehnicke upute. Margine lijeva 3/ostale 2,5. Citiranje
 *    dvoopcijsko -> advisory. Opseg "minimalno bi trebao" -> scored (jasan floor).
 *  - MEDRI: Naputak 2025 (docx) VRIJEDI SAMO za integrirani studij Farmacija. Prored DVOSTRUKI
 *    (2,0). Font nije propisan ("citljive vrste") -> izostavljen. Vancouver -> advisory.
 *  - FMTU (domena fthm.uniri.hr): Upute 2025 zav+dip. Opseg u ZNAKOVIMA (ne stranice) -> advisory.
 *    Chicago dvoopcijski -> advisory.
 *  - INF: Pravilnik 2024 (skeniran, OCR). Javno samo A4 + min. stranica (dip 40 / zav 30);
 *    font/velicina/prored/margine/citiranje iza Merlin logina -> izostavljeni (tanak profil).
 *
 * Pokretanje: node scripts/gen-uniri.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/efri.json discovery/port-specs/pravri.json \
 *       discovery/port-specs/ffri.json discovery/port-specs/pfri.json discovery/port-specs/medri.json \
 *       discovery/port-specs/fmtu.json discovery/port-specs/inf.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-02';
const INST = 'uniri';
const INST_NAME = 'Sveuciliste u Rijeci';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'efri-pravilnik-zavrsni-2014': 'data/sources/efri/efri-pravilnik-zavrsni-2014.pdf',
  'efri-pravilnik-diplomski-2014': 'data/sources/efri/efri-pravilnik-diplomski-2014.pdf',
  'pravri-upute-radovi-2023': 'data/sources/pravri/pravri-upute-radovi-2023.pdf',
  'ffri-pravilnik-zavrsni-2023': 'data/sources/ffri/ffri-pravilnik-zavrsni-2023.pdf',
  'ffri-pravilnik-diplomski-2023': 'data/sources/ffri/ffri-pravilnik-diplomski-2023.pdf',
  'pfri-upute-zavrsni-2025': 'data/sources/pfri/pfri-upute-zavrsni-2025.pdf',
  'pfri-upute-diplomski-2025': 'data/sources/pfri/pfri-upute-diplomski-2025.pdf',
  'medri-naputak-diplomski-farmacija-2025': 'data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx',
  'fmtu-upute-zavrsni-2025': 'data/sources/fmtu/fmtu-upute-zavrsni-2025.pdf',
  'fmtu-upute-diplomski-2025': 'data/sources/fmtu/fmtu-upute-diplomski-2025.pdf',
  'inf-pravilnik-zavrsni-2024': 'data/sources/inf/inf-pravilnik-zavrsni-2024.pdf',
  'inf-pravilnik-diplomski-2024': 'data/sources/inf/inf-pravilnik-diplomski-2024.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

// --- doslovni citati (verbatim; OCR ociscen gdje je oznaceno) ---
const Q_EFRI_ZAV = 'Opseg rada je minimalno 25 stranica A4 formata (bez naslovnice, sadržaja, literature, priloga i privitaka), a tekst je pisan u Times New Roman CE fontu, veličine 12, s jednim i pol (1,5) redom razmaka, poravnan s obje strane, pisan od početka reda (bez uvlačenja prvog retka odlomka), s marginama od 3 cm.';
const Q_EFRI_DIP = 'Opseg rada je minimalno 40 stranica A4 formata (bez naslovnice, sadržaja, literature, priloga i privitaka), a tekst je pisan u Times New Roman CE fontu, veličine 12, s jednim i pol (1,5) redom razmaka, poravnan s obje strane, pisan od početka reda (bez uvlačenja prvog retka odlomka), s marginama od 3 cm.';
const Q_EFRI_CIT = 'Za citiranje doslovno preuzetih dijelova i parafraziranih dijelova teksta koristi se Harvardski sustav citiranja.';

const Q_PRAVRI = 'Format papira: A4 (21,0 cm × 29,7 cm) Margine (praznine od tekstualnog sloga do ruba papira): 2,5 cm sa svih strana (gore, dolje, lijevo, desno) Prored teksta: 1,5 redak Vrsta slova: Times New Roman Veličina slova: 12 (tipografskih točaka).';

const Q_FFRI_ZAV = 'Završni rad otisnut je na papiru A4 formata (210 x 297 mm). Oblikovanje teksta mora biti kako slijedi: Margine: 2,5 cm; Font: Times New Roman; Veličina: 12pt, za fusnote 10pt; Prored: 1,5; Poravnanje: obostrano.';
const Q_FFRI_DIP = 'Diplomski rad otisnut je na papiru A4 formata (210 x 297 mm). Oblikovanje teksta mora biti kako slijedi: Margine: 2,5 cm; Font: Times New Roman; Veličina: 12pt, za fusnote 10pt; Prored: 1,5; Poravnanje: obostrano.';

const Q_PFRI_ZAV = 'Opseg završnog rada minimalno bi trebao iznositi 30 stranica. Tekst rada piše se u Times New Roman fontu, veličine 12, s proredom od 1,5 (jednim i pol redom razmaka), poravnan s obje strane, te s uvlačenjem prvog retka pasusa na 1,0 cm. Lijeva margina se podešava na 3,0 cm, a ostale margine na 2,5 cm.';
const Q_PFRI_DIP = 'Opseg diplomskog rada minimalno bi trebao iznositi 50 stranica. Tekst rada piše se u Times New Roman fontu, veličine 12, s proredom od 1,5 (jednim i pol redom razmaka), poravnan s obje strane, te s uvlačenjem prvog retka pasusa na 1,0 cm. Lijeva margina se podešavana 3,0 cm, a ostale margine na 2,5 cm.';

const Q_MEDRI_FMT = 'Diplomski rad treba biti pripremljen u pisanom obliku na računalu, sukladno Uputama, na stranici standardne veličine (A4, 210x297 mm), sa slobodnim rubnicima od 2,5 cm i u dvostrukom proredu. Potrebno je rabiti pismo veličine 12 tipografskih točaka, čitljive vrste, s obvezatnom potporom svih hrvatskih znakova.';
const Q_MEDRI_OP = 'Diplomski rad ne može sadržavati manje od 15 niti više od 50 stranica. Broje se sve stranice počevši od Uvoda, a broj se ispisuje u donjem desnom kutu.';

const Q_FMTU = 'Tekst treba biti pisan u formatu papira standardne veličine (A4, 210×297 mm), sa slobodnim rubnicima od 2,5 cm; Tekst u radu treba pisati pismom veličine 12 tipografskih točaka, vrstom slova – Times New Roman; Tekst treba biti obostrano poravnat (engl. Justify), imati prored 1,5 (engl. Line spacing).';

const Q_INF_ZAV = 'Završni rad mora biti otisnut računalnim pisačem na papiru formata A4 (21 x 29,7 cm) i mora imati najmanje 30 stranica teksta bez priloga.';
const Q_INF_DIP = 'Diplomski rad mora biti otisnut računalnim pisačem na papiru formata A4 (21 x 29,7 cm) i mora imati najmanje 40 stranica teksta bez priloga.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M3 = { top: 3, right: 3, bottom: 3, left: 3 };
const M_LEFT3 = { top: 2.5, right: 2.5, bottom: 2.5, left: 3 };
const TNR = ['Times New Roman'];

const efriEntries = (pid, src, q, min) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', q, 'Članak 6. st. 1'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', q, 'Članak 6. st. 1'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', q, 'Članak 6. st. 1'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', q, 'Članak 6. st. 1'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', q, 'Članak 6. st. 1'),
  mk(pid, src, 'margins', M3, 'format', 'Margine', q, 'Članak 6. st. 1'),
  mk(pid, src, 'page-count', { min }, 'scope', `Opseg (najmanje ${min} str.)`, q, 'Članak 6. st. 1'),
  mk(pid, src, 'citation-style', 'harvard', 'citation', 'Stil citiranja (Harvard, autor-godina)', Q_EFRI_CIT, 'Članak 5.', { mc: false }),
];
const ffriEntries = (pid, src, q, page) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', q, page),
  mk(pid, src, 'margins', M25, 'format', 'Margine', q, page),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', q, page),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', q, page),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', q, page),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', q, page),
];
const pfriEntries = (pid, src, q, min) => [
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', q, 'poglavlje 3. Tehnicke upute (str. 3)'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', q, 'poglavlje 3. Tehnicke upute (str. 3)'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', q, 'poglavlje 3. Tehnicke upute (str. 3)'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', q, 'poglavlje 3. Tehnicke upute (str. 3)'),
  mk(pid, src, 'margins', M_LEFT3, 'format', 'Margine', q, 'poglavlje 3. Tehnicke upute (str. 3)'),
  mk(pid, src, 'page-count', { min }, 'scope', `Opseg (najmanje ${min} str.)`, q, 'poglavlje 3. Tehnicke upute (str. 3)'),
];
const fmtuEntries = (pid, src) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_FMTU, 'odjeljak 7.1 Format, tekst, naslovi'),
  mk(pid, src, 'margins', M25, 'format', 'Margine', Q_FMTU, 'odjeljak 7.1 Format, tekst, naslovi'),
  mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_FMTU, 'odjeljak 7.1 Format, tekst, naslovi'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_FMTU, 'odjeljak 7.1 Format, tekst, naslovi'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_FMTU, 'odjeljak 7.1 Format, tekst, naslovi'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_FMTU, 'odjeljak 7.1 Format, tekst, naslovi'),
];

const DEFS = [
  { unitId: 'efri', unitName: 'Ekonomski fakultet u Rijeci', family: 'social',
    sources: [
      { id: 'efri-pravilnik-zavrsni-2014', title: 'Pravilnik o zavrsnom radu na sveucilisnom prijediplomskom studiju (EFRI)', url: 'https://arhiva.efri.uniri.hr/upload/Pravilnik_o_zavr%C5%A1nom_radu_na_sveucili%C5%A1nom_prjediplomskom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf', kind: 'regulation', note: 'Skeniran, re-OCR nasim tesseractom (scripts/ocr_pdf.py) za cist citat.' },
      { id: 'efri-pravilnik-diplomski-2014', title: 'Pravilnik o diplomskom radu na sveucilisnom diplomskom i integriranom studiju (EFRI)', url: 'https://arhiva.efri.uniri.hr/upload/Pravilnik_o_diplomskom_radu_na_sveucili%C5%A1nom_diplomskom_i_integriranom_studiju_Ekonomskog_fakulteta_Sveucili%C5%A1ta_u_Rijeci.pdf', kind: 'regulation', note: 'Skeniran, re-OCR nasim tesseractom.' },
    ],
    profiles: [
      { pid: 'efri-zavrsni', workType: 'final', program: 'Prijediplomski sveucilisni studij EFRI (zavrsni rad)', label: 'EFRI, zavrsni rad', src: 'efri-pravilnik-zavrsni-2014', entries: (p, s) => efriEntries(p, s, Q_EFRI_ZAV, 25), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M3, recommendedCitation: 'harvard' } },
      { pid: 'efri-diplomski', workType: 'graduate', program: 'Diplomski i integrirani studij EFRI', label: 'EFRI, diplomski rad', src: 'efri-pravilnik-diplomski-2014', entries: (p, s) => efriEntries(p, s, Q_EFRI_DIP, 40), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M3, recommendedCitation: 'harvard' } },
    ] },
  { unitId: 'pravri', unitName: 'Pravni fakultet u Rijeci', family: 'social',
    sources: [{ id: 'pravri-upute-radovi-2023', title: 'Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023)', url: 'https://pravri.uniri.hr/files/Dokumenti/Pravilnici/uputeradovi.pdf', kind: 'guidelines', note: 'Tekstualni PDF; Normativ stranice citano izravno. Citiranje fusnote -> advisory.' }],
    profiles: [
      { pid: 'pravri-zavrsni', workType: 'final', program: 'Prijediplomski studij PRAVRI (zavrsni rad)', label: 'PRAVRI, zavrsni rad', src: 'pravri-upute-radovi-2023', entries: (p, s) => pravriEntries(p, s), rules: pravriRules() },
      { pid: 'pravri-diplomski', workType: 'graduate', program: 'Diplomski studij PRAVRI', label: 'PRAVRI, diplomski rad', src: 'pravri-upute-radovi-2023', entries: (p, s) => pravriEntries(p, s), rules: pravriRules() },
    ] },
  { unitId: 'ffri', unitName: 'Filozofski fakultet u Rijeci', family: 'social',
    sources: [
      { id: 'ffri-pravilnik-zavrsni-2023', title: 'Pravilnik o zavrsnom radu (FFRI, 2023)', url: 'https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_zavrsnom_radu-2023.pdf', kind: 'regulation', note: 'Tekstualni PDF; cl. 8 oblikovanje. Re-OCR za cist citat (glyph glitch na brojkama). Opseg u pravilu -> advisory.' },
      { id: 'ffri-pravilnik-diplomski-2023', title: 'Pravilnik o diplomskom radu (FFRI, 2023)', url: 'https://ffri.uniri.hr/wp-content/uploads/Pravilnik_o_diplomskom_radu-2023.pdf', kind: 'regulation', note: 'Tekstualni PDF; cl. 11 oblikovanje. Re-OCR za cist citat. Opseg u pravilu -> advisory.' },
    ],
    profiles: [
      { pid: 'ffri-zavrsni', workType: 'final', program: 'Prijediplomski studiji FFRI (zavrsni rad)', label: 'FFRI, zavrsni rad', src: 'ffri-pravilnik-zavrsni-2023', entries: (p, s) => ffriEntries(p, s, Q_FFRI_ZAV, 'Članak 8. (oblikovanje zavrsnoga rada)'), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
      { pid: 'ffri-diplomski', workType: 'graduate', program: 'Diplomski studiji FFRI', label: 'FFRI, diplomski rad', src: 'ffri-pravilnik-diplomski-2023', entries: (p, s) => ffriEntries(p, s, Q_FFRI_DIP, 'Članak 11. (oblikovanje diplomskoga rada)'), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
    ] },
  { unitId: 'pfri', unitName: 'Pomorski fakultet u Rijeci', family: 'stem',
    sources: [
      { id: 'pfri-upute-zavrsni-2025', title: 'Upute za izradu zavrsnog rada (PFRI, 26.3.2025)', url: 'https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.zavrsnog.rada.PFRI.26.3.2025.pdf', kind: 'guidelines', note: 'Tekstualni PDF; pogl. 3 Tehnicke upute. Citiranje dvoopcijsko -> advisory.' },
      { id: 'pfri-upute-diplomski-2025', title: 'Upute za izradu diplomskog rada (PFRI, 26.3.2025)', url: 'https://www.pfri.uniri.hr/web/hr/dokumenti/Upute.za.izradu.diplomskoga.rada.PFRI.26.3.2025.pdf', kind: 'guidelines', note: 'Tekstualni PDF; pogl. 3 Tehnicke upute. Citiranje dvoopcijsko -> advisory.' },
    ],
    profiles: [
      { pid: 'pfri-zavrsni', workType: 'final', program: 'Prijediplomski studiji PFRI (zavrsni rad)', label: 'PFRI, zavrsni rad', src: 'pfri-upute-zavrsni-2025', entries: (p, s) => pfriEntries(p, s, Q_PFRI_ZAV, 30), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, margins: M_LEFT3 } },
      { pid: 'pfri-diplomski', workType: 'graduate', program: 'Diplomski studiji PFRI', label: 'PFRI, diplomski rad', src: 'pfri-upute-diplomski-2025', entries: (p, s) => pfriEntries(p, s, Q_PFRI_DIP, 50), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, margins: M_LEFT3 } },
    ] },
  { unitId: 'medri', unitName: 'Medicinski fakultet u Rijeci', family: 'biomed',
    sources: [{ id: 'medri-naputak-diplomski-farmacija-2025', title: 'Naputak za prijavu, oblikovanje i izradu diplomskog rada - Farmacija (MEDRI, 2025)', url: 'https://medri.uniri.hr/wp-content/uploads/2025/07/NAPUTAK-za-prijavu-i-izradu-diplomskog-rada_24.6.25-002.docx', kind: 'guidelines', note: 'DOCX (citano iz XML-a). Vrijedi SAMO za integrirani studij Farmacija. Prored dvostruki (2,0). Font nije propisan -> izostavljen.' }],
    profiles: [
      { pid: 'medri-farmacija-diplomski', workType: 'graduate', program: 'Integrirani studij Farmacija (MEDRI, diplomski rad)', label: 'MEDRI Farmacija, diplomski rad', src: 'medri-naputak-diplomski-farmacija-2025',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_MEDRI_FMT, 'Tehnicke upute o izradi diplomskog rada'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_MEDRI_FMT, 'Tehnicke upute o izradi diplomskog rada'),
          mk(p, s, 'line-spacing', 2.0, 'format', 'Prored (dvostruki)', Q_MEDRI_FMT, 'Tehnicke upute o izradi diplomskog rada'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_MEDRI_FMT, 'Tehnicke upute o izradi diplomskog rada'),
          mk(p, s, 'page-count', { min: 15, max: 50 }, 'scope', 'Opseg (15-50 str.)', Q_MEDRI_OP, 'Tehnicke upute o izradi diplomskog rada'),
        ],
        rules: { size: [12], spacing: 2.0, requireA4: true, margins: M25 } },
    ] },
  { unitId: 'fmtu', unitName: 'Fakultet za menadzment u turizmu i ugostiteljstvu, Opatija', family: 'social',
    sources: [
      { id: 'fmtu-upute-zavrsni-2025', title: 'Upute za izradu zavrsnog rada (FMTU, 2025)', url: 'https://fthm.uniri.hr/wp-content/uploads/2025/11/3-Upute-za-zavrsni-rad-2025-2.pdf', kind: 'guidelines', note: 'Tekstualni PDF (domena fthm.uniri.hr); odjeljak 7.1. Opseg u znakovima -> advisory; Chicago dvoopcijski -> advisory.' },
      { id: 'fmtu-upute-diplomski-2025', title: 'Upute za izradu diplomskog rada (FMTU, 2025)', url: 'https://fthm.uniri.hr/wp-content/uploads/2025/11/5-Upute-za-diplomski-rad-2025-1.pdf', kind: 'guidelines', note: 'Tekstualni PDF (domena fthm.uniri.hr); odjeljak 7.1. Opseg u znakovima -> advisory; Chicago dvoopcijski -> advisory.' },
    ],
    profiles: [
      { pid: 'fmtu-zavrsni', workType: 'final', program: 'Prijediplomski studiji FMTU (zavrsni rad)', label: 'FMTU, zavrsni rad', src: 'fmtu-upute-zavrsni-2025', entries: (p, s) => fmtuEntries(p, s), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
      { pid: 'fmtu-diplomski', workType: 'graduate', program: 'Diplomski studiji FMTU', label: 'FMTU, diplomski rad', src: 'fmtu-upute-diplomski-2025', entries: (p, s) => fmtuEntries(p, s), rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 } },
    ] },
  { unitId: 'inf', unitName: 'Fakultet informatike i digitalnih tehnologija, Rijeka', family: 'stem',
    sources: [
      { id: 'inf-pravilnik-zavrsni-2024', title: 'Pravilnik o zavrsnom radu (INF, 2024)', url: 'https://www.inf.uniri.hr/images/dokumenti/pravilnici/Pravilnik_o_zavrsnom_radu_INF_2024.pdf', kind: 'regulation', note: 'Skeniran, OCR. Javno samo A4 + min. stranica; tipografija delegirana na predlozak/Upute iza Merlin logina -> izostavljena.' },
      { id: 'inf-pravilnik-diplomski-2024', title: 'Pravilnik o diplomskom radu (INF, 2024)', url: 'https://www.inf.uniri.hr/images/dokumenti/pravilnici/Pravilnik_o_diplomskom_radu_INF_2024.pdf', kind: 'regulation', note: 'Skeniran, OCR. Javno samo A4 + min. stranica; tipografija iza Merlin logina -> izostavljena.' },
    ],
    profiles: [
      { pid: 'inf-zavrsni', workType: 'final', program: 'Prijediplomski studij INF (zavrsni rad)', label: 'INF, zavrsni rad', src: 'inf-pravilnik-zavrsni-2024',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_INF_ZAV, 'Članak o izgledu i opremanju zavrsnog rada'),
          mk(p, s, 'page-count', { min: 30 }, 'scope', 'Opseg (najmanje 30 str.)', Q_INF_ZAV, 'Članak o izgledu i opremanju zavrsnog rada'),
        ], rules: { requireA4: true },
        advisoryNote: 'Font/velicina/prored/margine/citiranje su u predlosku i Uputama iza Merlin logina -> nedostupni javno, izostavljeni.' },
      { pid: 'inf-diplomski', workType: 'graduate', program: 'Diplomski studij INF', label: 'INF, diplomski rad', src: 'inf-pravilnik-diplomski-2024',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_INF_DIP, 'Članak 11. (izgled i opremanje diplomskog rada)'),
          mk(p, s, 'page-count', { min: 40 }, 'scope', 'Opseg (najmanje 40 str.)', Q_INF_DIP, 'Članak 11. (izgled i opremanje diplomskog rada)'),
        ], rules: { requireA4: true },
        advisoryNote: 'Font/velicina/prored/margine/citiranje su u predlosku i Uputama iza Merlin logina -> nedostupni javno, izostavljeni.' },
    ] },
];

function pravriEntries(pid, src) {
  const P = 'poglavlje 2.1 Normativ stranice (str. 7)';
  return [
    mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_PRAVRI, P),
    mk(pid, src, 'margins', M25, 'format', 'Margine', Q_PRAVRI, P),
    mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_PRAVRI, P),
    mk(pid, src, 'font', TNR, 'format', 'Vrsta slova', Q_PRAVRI, P),
    mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_PRAVRI, P),
  ];
}
function pravriRules() { return { font: TNR, size: [12], spacing: 1.5, requireA4: true, margins: M25 }; }

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
    const srcTitle = def.sources.find((s) => s.id === pr.src).title;
    profiles.push({
      id: pr.pid, unitId: def.unitId, programs: [pr.program], workTypes: [pr.workType], status: 'partial',
      profileLabel: pr.label, verifiedAt: NOW, documentDate: null, rules: pr.rules, facts: [],
      note: `Tehnicko uredenje rada iz sluzbenog izvora (${def.unitName}, ${INST_NAME}), citano izravno.` + (pr.advisoryNote ? ` ${pr.advisoryNote}` : ''),
      sources: [{ title: srcTitle, url: def.sources.find((s) => s.id === pr.src).url }],
      sourceHierarchy: [srcTitle],
      ruleAuthority: 'official-program-guidelines',
      normativeScope: es.filter((e) => e.status === 'verified').map((e) => e.label),
      advisoryScope: pr.advisoryNote ? ['Tipografija (iza logina)'] : [],
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
