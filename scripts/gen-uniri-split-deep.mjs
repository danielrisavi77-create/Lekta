/**
 * Produbljivanje Rijeke (uniri) i Splita (unist) - preostale sastavnice.
 * Obje institucijske grupe VEC postoje (batch 4/5), pa NEMA institutionName i NEMA
 * novih grupa; reducer samo dodaje nove unite u postojecu grupu (i jedan novi profil
 * na postojeci medri unit).
 *
 * RIJEKA (svi citati verificirani nasim fitz-om; ugradeni tekst-sloj CIST):
 *  - medri-medicina-diplomski (POSTOJECI medri unit, novi profil): A4/rubnici 2,5/DVOSTRUKI
 *    prored/12pt/opseg 15-50 str. Font "citljive vrste" (nenaveden)->izostavljen. Vancouver
 *    "najcesci ... koji se koristi" (ne cist imperativ)->advisory.
 *  - fzsri (novi): A4/rubnici 2,5/justify/prored 1,5/12pt/font [Calibri,TNR,Arial]. Opseg
 *    "Preporuceni"->advisory. Citiranje delegirano na "Pravila citiranja"->advisory.
 *  - biotech (novi): font Verdana/12pt/prored 1,5. "normalnu marginu" (nespecificirano)->bez
 *    margina; bez A4/justify. Nature numericki citat -> NE scored (izbjegavam novu citation
 *    vrijednost izvan VALID_CITATION_IDS)->advisory.
 *  - fizri (novi): A4/12pt/prored 1,5/opseg (dipl min 30; zavr 15-30). Bez margina/fonta/justify.
 *  - ufri (novi): A4/font TNR/12pt/prored 1,5/justify. Citiranje autor-godina bez imenovanog
 *    stila->advisory. Opseg "Preporuca se"->advisory.
 *  - riteh (novi): tipografija je izrijekom PREPORUKA->advisory; scored su numericki citat [1]
 *    ('ieee') i mandatorna pravila naslova (heading-rules: numerirano, razina 1 velika slova).
 *  - IZOSTAVLJENI Rijeka: GRADRI (samo naslovi mandatorni, citat 3-opcijski izbor, ostalo
 *    preporuka)->pretanko/advisory; APURI, Matematika (nema strojno-provjerljivog format-doc).
 *
 * SPLIT:
 *  - kifst (novi): font TNR/12pt/naslovi TNR 14 BOLD/prored 1,5/margine 2,5 (lijeva 3,5)/justify
 *    od ruba do ruba/citiranje PO APA STANDARDU (imenovano). A4 nenaveden->izostavljen.
 *  - kbfst (novi): TNR 12 ili 13/biljeske TNR 10/prored 1,5. Margine s korica (dijagram,
 *    dvosmisleno)->izostavljene; bez A4/justify; citat neimenovan->advisory. (skenirano, OCR.)
 *  - IZOSTAVLJENI Split: FESB (proceduralno, bez tipografije), FF Split (delegirano/predlozak),
 *    Pravni Split (samo katedralni seminarski), UMAS (delegirano na odsjek), FZSST (pravila samo
 *    u .docx stilovima + US Letter, ne prozni imperativ), PMFST fiz/mat/inf/pol (delegirano).
 *
 * Pokretanje: node scripts/gen-uniri-split-deep.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/{medri-medicina,fzsri,biotech,fizri,ufri,riteh,kifst,kbfst}.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-03';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'medri-naputak-diplomski-2026': 'data/sources/medri/medri-medicina.pdf',
  'fzsri-upute-radovi-2022': 'data/sources/fzsri/fzsri.pdf',
  'biotech-upute-radovi': 'data/sources/biotech/biotech.pdf',
  'fizri-pravilnik-radovi-2023': 'data/sources/fizri/fizri.pdf',
  'ufri-upute-diplomski-2024': 'data/sources/ufri/ufri.pdf',
  'riteh-upute-radovi-2025': 'data/sources/riteh/riteh.pdf',
  'kifst-upute-diplomski-2022': 'data/sources/kifst/kifst.pdf',
  'kbfst-tehnicke-postavke': 'data/sources/kbfst/kbfst.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

// --- verbatim citati (fitz get_text / ocr_pdf.py) ---
const Q_MEDRI_FMT = 'Diplomski rad treba biti pripremljen u pisanom obliku na računalu, sukladno uputama na stranici standardne veličine (A4, 210x297 mm), sa slobodnim rubnicima od 2,5 cm i u dvostrukom proredu. Potrebno je rabiti pismo veličine 12 tipografskih točaka čitljive vrste s obvezatnom potporom svih hrvatskih znakova. Sve stranice moraju biti numerirane.';
const Q_MEDRI_OP = 'Diplomski rad ne može sadržavati manje od 15 niti više od 50 stranica. Broje se sve stranice počevši od Uvoda.';

const Q_FZSRI = '- završni ili diplomski rad treba biti oblikovan na papiru standardne veličine (A4, 210×297 mm), sa slobodnim rubnicima od 2,5 cm; - tekst je potrebno pisati s obostranim poravnanjem, prored 1,5; - za ispis treba rabiti pismo veličine 12 tipografskih točaka, slova Calibri, Times New Roman ili Arial, s obvezatnom potporom svih hrvatskih znakova.';

const Q_BIOTECH = 'Za ispis rada treba koristiti pismo Verdana, veličine 12 tipografskih točaka, prored od 1,5, normalnu marginu s obaveznom potporom svih hrvatskih znakova. Stranice se numeriraju od prve stranice uvoda.';

const Q_FIZRI_DIP = 'Diplomski rad mora biti otisnut računalnim pisačem na papiru formata A4 (21 x 29,7 cm) i mora imati najmanje 30 stranica. Preporuča se da diplomski rad ima najviše 100 stranica. Glavni tekst mora imati veličinu slova 12 i širinu proreda 1,5 normalnih proreda.';
const Q_FIZRI_ZAV = 'Završni rad mora biti otisnut računalnim pisačem na papiru formata A4 (21 x 29,7 cm) i mora imati najmanje 15, a najviše 30 stranica teksta. Glavni tekst mora imati veličinu slova 12 i širinu proreda 1,5 normalnih proreda.';

const Q_UFRI = 'Format rada je A4. Tekst se piše računalom u fontu «Times New Roman», stil fonta «običan», veličine 12., proreda 1,5 retka, poravnanje «obostrano». Naslovi poglavlja pišu se u veličini 14, a podnaslovi 12, «podebljano».';

const Q_RITEH_CIT = 'U tekstu se literatura navodi unutar pravokutnih zagrada [1]. Reference se navode pod rednim brojem pod kojim se pojavljuju u popisu, u uglatim zagradama (npr. [1] ili [1, 2, 3, 5]).';
const Q_RITEH_HEAD = 'Poglavlja moraju biti numerirana i svakom poglavlju treba pridijeliti odgovarajući naslov. Naslov poglavlja piše se velikim slovima veličine 14 pt. bold. Prva razina potpoglavlja piše se malim slovima veličine 12 pt. bold, a druga razina potpoglavlja veličinom slova 12 pt.';

const Q_KIFST_FMT = 'Rad treba biti poravnan od ruba do ruba. Oblikovanje teksta - koristiti prored 1,5. Font- tekst : Times New Roman 12 pt. Font – naslovi: Times New Roman 14pt BOLD. Font – podnaslovi: Times New Roman 14pt. Margine stranice postaviti na 2,5 cm, osim lijeve strane na 3,5 cm.';
const Q_KIFST_CIT = 'CITIRANJE I NAVOĐENJE IZVORA PO APA STANDARDU. U tekstu je moguće citirati autora na način da se i autor i godina stave u zagradu (Prezime, godina).';

const Q_KBFST = 'POJEDINOSTI O TEHNIČKIM POSTAVKAMA DIPLOMSKOGA RADA. Vrsta i veličina slova u tekstu: Times New Roman, 12 ili 13. Vrsta i veličina slova u bilješkama: Times New Roman, 10. Prored: 1,5. Uvlaka prvoga retka u odlomku: 1,25 cm.';

const mk = (pid, src, checkId, value, category, label, quote, page, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
const M_L35 = { top: 2.5, right: 2.5, bottom: 2.5, left: 3.5 };
const TNR = ['Times New Roman'];
const VERDANA = ['Verdana'];
const FONT_FZSRI = ['Calibri', 'Times New Roman', 'Arial'];
const RITEH_HEADING = { numberRequired: true, romanLevelOneAllowed: false, maxLevel: 3, levels: { '1': { uppercase: true } } };

const fzsriEntries = (pid, src) => [
  mk(pid, src, 'paper-size', 'A4', 'format', 'Format papira', Q_FZSRI, 'Upute, 2.13 Oblikovanje rada'),
  mk(pid, src, 'margins', M25, 'format', 'Margine', Q_FZSRI, 'Upute, 2.13 Oblikovanje rada'),
  mk(pid, src, 'justify', true, 'format', 'Obostrano poravnanje', Q_FZSRI, 'Upute, 2.13 Oblikovanje rada'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_FZSRI, 'Upute, 2.13 Oblikovanje rada'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_FZSRI, 'Upute, 2.13 Oblikovanje rada'),
  mk(pid, src, 'font', FONT_FZSRI, 'format', 'Vrsta slova (Calibri/TNR/Arial)', Q_FZSRI, 'Upute, 2.13 Oblikovanje rada'),
];
const fzsriRules = () => ({ font: FONT_FZSRI, size: [12], spacing: 1.5, justify: true, requireA4: true, margins: M25 });

const biotechEntries = (pid, src) => [
  mk(pid, src, 'font', VERDANA, 'format', 'Vrsta slova', Q_BIOTECH, 'Postupak, 3.4 Jezik i graficki elementi'),
  mk(pid, src, 'font-size', 12, 'format', 'Velicina slova', Q_BIOTECH, 'Postupak, 3.4 Jezik i graficki elementi'),
  mk(pid, src, 'line-spacing', 1.5, 'format', 'Prored', Q_BIOTECH, 'Postupak, 3.4 Jezik i graficki elementi'),
];
const biotechRules = () => ({ font: VERDANA, size: [12], spacing: 1.5 });

const DEFS = [
  // ===== RIJEKA (uniri, grupa postoji) =====
  { inst: 'uniri', unitId: 'medri', unitName: 'Medicinski fakultet u Rijeci', family: 'biomed', omitUnit: true,
    sources: [{ id: 'medri-naputak-diplomski-2026', title: 'Naputak za prijavu, oblikovanje i opremu diplomskog rada i polaganje diplomskog ispita 2025./2026. (integrirani studij Medicina, MEDRI)', url: 'https://medri.uniri.hr/wp-content/uploads/2026/01/NAPUTAK_ZA_PRIJAVU_OBLIKOVANJE_I_OPREMU_DIPLOMSKOG_RADA_I_POLAGANJE_DIPLOMSKOG_ISPITA_2025_2026.pdf', kind: 'guidelines', note: 'Tekstualni PDF; integrirani studij Medicina. Font "citljive vrste" nenaveden->izostavljen. Vancouver "najcesci ... koji se koristi"->advisory.' }],
    profiles: [
      { pid: 'medri-medicina-diplomski', workType: 'graduate', program: 'Integrirani preddiplomski i diplomski sveučilišni studij Medicina (diplomski rad, Rijeka)', label: 'Rijeka - Medicina (integrirani), diplomski rad', src: 'medri-naputak-diplomski-2026',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_MEDRI_FMT, 'Naputak, oprema rada'),
          mk(p, s, 'margins', M25, 'format', 'Margine', Q_MEDRI_FMT, 'Naputak, oprema rada'),
          mk(p, s, 'line-spacing', 2, 'format', 'Prored (dvostruki)', Q_MEDRI_FMT, 'Naputak, oprema rada'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_MEDRI_FMT, 'Naputak, oprema rada'),
          mk(p, s, 'page-count', { min: 15, max: 50 }, 'scope', 'Opseg (15-50 str.)', Q_MEDRI_OP, 'Naputak, opseg'),
        ], rules: { size: [12], spacing: 2, requireA4: true, margins: M25 } },
    ] },
  { inst: 'uniri', unitId: 'fzsri', unitName: 'Fakultet zdravstvenih studija u Rijeci', family: 'biomed',
    sources: [{ id: 'fzsri-upute-radovi-2022', title: 'Upute za izradu završnog ili diplomskog rada (FZSRI, 2022)', url: 'https://www.fzsri.uniri.hr/files/DOKUMENTI-I-OBRASCI/zavrsni_diplomski/Upute%20za%20izradu%20zavrsnog%20ili%20diplomskog%20rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Opseg "Preporuceni"->advisory. Citiranje delegirano na Pravila citiranja->advisory.' }],
    profiles: [
      { pid: 'fzsri-zavrsni', workType: 'final', program: 'Prijediplomski studiji FZSRI (zavrsni rad)', label: 'Rijeka - Zdravstveni studiji, zavrsni rad', src: 'fzsri-upute-radovi-2022', entries: fzsriEntries, rules: fzsriRules() },
      { pid: 'fzsri-diplomski', workType: 'graduate', program: 'Diplomski studiji FZSRI', label: 'Rijeka - Zdravstveni studiji, diplomski rad', src: 'fzsri-upute-radovi-2022', entries: fzsriEntries, rules: fzsriRules() },
    ] },
  { inst: 'uniri', unitId: 'biotech', unitName: 'Fakultet biotehnologije i razvoja lijekova, Rijeka', family: 'stem',
    sources: [{ id: 'biotech-upute-radovi', title: 'Postupak za prijavu, oblikovanje i obranu završnog i diplomskog rada (Biotehnologija, Rijeka)', url: 'https://biotech.uniri.hr/files/Studenti/Upute_Zavrsni_Diplomski_10_04.pdf', kind: 'guidelines', note: 'Tekstualni PDF. "normalnu marginu"->bez margina; bez A4/justify. Nature numericki citat->advisory (izvan VALID_CITATION_IDS).' }],
    profiles: [
      { pid: 'biotech-zavrsni', workType: 'final', program: 'Prijediplomski studiji Biotehnologije (zavrsni rad, Rijeka)', label: 'Rijeka - Biotehnologija, zavrsni rad', src: 'biotech-upute-radovi', entries: biotechEntries, rules: biotechRules() },
      { pid: 'biotech-diplomski', workType: 'graduate', program: 'Diplomski studiji Biotehnologije (Rijeka)', label: 'Rijeka - Biotehnologija, diplomski rad', src: 'biotech-upute-radovi', entries: biotechEntries, rules: biotechRules() },
    ] },
  { inst: 'uniri', unitId: 'fizri', unitName: 'Fakultet za fiziku u Rijeci', family: 'stem',
    sources: [{ id: 'fizri-pravilnik-radovi-2023', title: 'Pravilnik o diplomskom i završnom radu (Fakultet za fiziku, Rijeka, procisceni tekst 2023)', url: 'https://phy.uniri.hr/files/nastava/zavrsni_i_diplomski_radovi/Pravilnik_o_diplomskom_i_zavrsnom_radu_FIZRI_procisceni_tekst_2023.pdf', kind: 'regulation', note: 'Tekstualni PDF. Bez margina/fonta/justify/citata. Max 100 str (dipl) je "Preporuca se"->samo min scored.' }],
    profiles: [
      { pid: 'fizri-zavrsni', workType: 'final', program: 'Sveučilišni prijediplomski studiji fizike (završni rad, Rijeka)', label: 'Rijeka - Fizika, zavrsni rad', src: 'fizri-pravilnik-radovi-2023',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_FIZRI_ZAV, 'Pravilnik, cl. 12'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_FIZRI_ZAV, 'Pravilnik, cl. 12'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_FIZRI_ZAV, 'Pravilnik, cl. 12'),
          mk(p, s, 'page-count', { min: 15, max: 30 }, 'scope', 'Opseg (15-30 str.)', Q_FIZRI_ZAV, 'Pravilnik, cl. 12'),
        ], rules: { size: [12], spacing: 1.5, requireA4: true } },
      { pid: 'fizri-diplomski', workType: 'graduate', program: 'Sveučilišni diplomski studiji fizike (Rijeka)', label: 'Rijeka - Fizika, diplomski rad', src: 'fizri-pravilnik-radovi-2023',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_FIZRI_DIP, 'Pravilnik, cl. 8'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_FIZRI_DIP, 'Pravilnik, cl. 8'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_FIZRI_DIP, 'Pravilnik, cl. 8'),
          mk(p, s, 'page-count', { min: 30 }, 'scope', 'Opseg (najmanje 30 str.)', Q_FIZRI_DIP, 'Pravilnik, cl. 8'),
        ], rules: { size: [12], spacing: 1.5, requireA4: true } },
    ] },
  { inst: 'uniri', unitId: 'ufri', unitName: 'Učiteljski fakultet u Rijeci', family: 'social',
    sources: [{ id: 'ufri-upute-diplomski-2024', title: 'Upute za izradu diplomskog rada (Učiteljski fakultet u Rijeci, 2024)', url: 'https://www.ufri.uniri.hr/files/nastava/Upute_za_izradu_rada/240417_Upute_za_izradu_dipl_rada.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Citiranje autor-godina bez imenovanog stila->advisory. Opseg "Preporuca se"->advisory.' }],
    profiles: [
      { pid: 'ufri-diplomski', workType: 'graduate', program: 'Diplomski studiji Učiteljskog fakulteta (Rijeka)', label: 'Rijeka - Uciteljski fakultet, diplomski rad', src: 'ufri-upute-diplomski-2024',
        entries: (p, s) => [
          mk(p, s, 'paper-size', 'A4', 'format', 'Format papira', Q_UFRI, 'Upute, oblikovanje rada'),
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_UFRI, 'Upute, oblikovanje rada'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_UFRI, 'Upute, oblikovanje rada'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_UFRI, 'Upute, oblikovanje rada'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_UFRI, 'Upute, oblikovanje rada'),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, requireA4: true } },
    ] },
  { inst: 'uniri', unitId: 'riteh', unitName: 'Tehnički fakultet u Rijeci', family: 'stem',
    sources: [{ id: 'riteh-upute-radovi-2025', title: 'Upute za izradu i samoarhiviranje završnog / diplomskog rada (RITEH, 2025)', url: 'https://riteh.uniri.hr/wp-content/uploads/Upute_za_izradu-i-samoarhiviranje_zavrsnog-i-diplomskog-rada-2025.pdf', kind: 'guidelines', note: 'Tekstualni PDF. Tipografija (font/margine/prored/justify) izrijekom PREPORUKA->advisory. Scored: numericki citat [1] + mandatorna pravila naslova.' }],
    profiles: [
      { pid: 'riteh-zavrsni', workType: 'final', program: 'Prijediplomski/strucni studiji RITEH (zavrsni rad)', label: 'Rijeka - Tehnicki fakultet, zavrsni rad', src: 'riteh-upute-radovi-2025',
        entries: (p, s) => [
          mk(p, s, 'heading-rules', RITEH_HEADING, 'structure', 'Pravila naslova (numerirano, razina 1 velika slova)', Q_RITEH_HEAD, 'Upute, tehnicko oblikovanje'),
          mk(p, s, 'citation-style', 'ieee', 'citation', 'Stil citiranja (numericki, uglate zagrade)', Q_RITEH_CIT, 'Upute, literatura', { mc: false }),
        ], rules: { headingRules: RITEH_HEADING, recommendedCitation: 'ieee' } },
      { pid: 'riteh-diplomski', workType: 'graduate', program: 'Diplomski studiji RITEH', label: 'Rijeka - Tehnicki fakultet, diplomski rad', src: 'riteh-upute-radovi-2025',
        entries: (p, s) => [
          mk(p, s, 'heading-rules', RITEH_HEADING, 'structure', 'Pravila naslova (numerirano, razina 1 velika slova)', Q_RITEH_HEAD, 'Upute, tehnicko oblikovanje'),
          mk(p, s, 'citation-style', 'ieee', 'citation', 'Stil citiranja (numericki, uglate zagrade)', Q_RITEH_CIT, 'Upute, literatura', { mc: false }),
        ], rules: { headingRules: RITEH_HEADING, recommendedCitation: 'ieee' } },
    ] },
  // ===== SPLIT (unist, grupa postoji) =====
  { inst: 'unist', unitId: 'kifst', unitName: 'Kineziološki fakultet u Splitu', family: 'social',
    sources: [{ id: 'kifst-upute-diplomski-2022', title: 'Upute za izradu diplomskog rada - strucna tema (KIFST, 2022)', url: 'https://web.kifst.unist.hr/wp-content/uploads/2022/02/UPUTE-ZA-IZRADU-DIPLOMSKOG-RADA-STRUCNA-TEMA.pdf', kind: 'guidelines', note: 'Tekstualni PDF. A4 nenaveden->izostavljen. Citiranje PO APA STANDARDU (imenovano)->scored.' }],
    profiles: [
      { pid: 'kifst-diplomski', workType: 'graduate', program: 'Diplomski studiji Kineziološkog fakulteta (Split)', label: 'Split - Kinezioloski fakultet, diplomski rad', src: 'kifst-upute-diplomski-2022',
        entries: (p, s) => [
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_KIFST_FMT, 'Upute, oblikovanje teksta'),
          mk(p, s, 'font-size', 12, 'format', 'Velicina slova', Q_KIFST_FMT, 'Upute, oblikovanje teksta'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_KIFST_FMT, 'Upute, oblikovanje teksta'),
          mk(p, s, 'margins', M_L35, 'format', 'Margine', Q_KIFST_FMT, 'Upute, oblikovanje teksta'),
          mk(p, s, 'justify', true, 'format', 'Obostrano poravnanje', Q_KIFST_FMT, 'Upute, oblikovanje teksta'),
          mk(p, s, 'citation-style', 'apa', 'citation', 'Stil citiranja (APA)', Q_KIFST_CIT, 'Upute, citiranje', { mc: false }),
        ], rules: { font: TNR, size: [12], spacing: 1.5, justify: true, margins: M_L35, recommendedCitation: 'apa' } },
    ] },
  { inst: 'unist', unitId: 'kbfst', unitName: 'Katolički bogoslovni fakultet u Splitu', family: 'mixed',
    sources: [{ id: 'kbfst-tehnicke-postavke', title: 'Pojedinosti o tehničkim postavkama diplomskoga rada (KBF Split)', url: 'https://www.kbf.unist.hr/images/dok/pravilnici/Izgled_diplomskog_rada_napomene.pdf', kind: 'guidelines', note: 'Skenirani PDF citan OCR-om (tesseract hrv). Margine s korica (dijagram)->izostavljene; bez A4/justify; citat neimenovan->advisory.' }],
    profiles: [
      { pid: 'kbfst-diplomski', workType: 'graduate', program: 'Diplomski studij (Katolički bogoslovni fakultet, Split)', label: 'Split - Katolicki bogoslovni fakultet, diplomski rad', src: 'kbfst-tehnicke-postavke',
        entries: (p, s) => [
          mk(p, s, 'font', TNR, 'format', 'Vrsta slova', Q_KBFST, 'Pojedinosti, tehnicke postavke'),
          mk(p, s, 'font-size', [12, 13], 'format', 'Velicina slova (12 ili 13)', Q_KBFST, 'Pojedinosti, tehnicke postavke'),
          mk(p, s, 'line-spacing', 1.5, 'format', 'Prored', Q_KBFST, 'Pojedinosti, tehnicke postavke'),
          mk(p, s, 'footnote-font', TNR, 'format', 'Vrsta slova biljeske', Q_KBFST, 'Pojedinosti, tehnicke postavke'),
          mk(p, s, 'footnote-size', [10], 'format', 'Velicina slova biljeske', Q_KBFST, 'Pojedinosti, tehnicke postavke'),
        ], rules: { font: TNR, size: [12, 13], spacing: 1.5, footnoteFont: TNR, footnoteSize: [10] } },
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
        note: `Produbljivanje ${def.inst} (${def.unitName}): direktno citanje izvora.` });
    }
  }
  const spec = {
    faculty: def.unitId, institution: def.inst,
    ...(def.omitUnit ? {} : { unit: { id: def.unitId, name: def.unitName, family: def.family, status: 'partial' } }),
    catalogPrograms, sources, profiles, ledger,
  };
  const specName = def.omitUnit ? `${def.profiles[0].pid}` : def.unitId;
  writeFileSync(`discovery/port-specs/${specName}.json`, JSON.stringify(spec, null, 2) + '\n');
  console.log(`${def.inst}/${def.unitId}: ${profiles.length} profila, ${ledger.length} ledger, ${sources.length} izvora${def.omitUnit ? ' (postojeci unit)' : ''}.`);
}
