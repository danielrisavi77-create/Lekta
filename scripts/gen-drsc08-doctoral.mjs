/**
 * DR.SC.-08 sveucilisni doktorski redizajn: doktorski format rad Sveucilista u Zagrebu
 * uredjuje jedinstveni dokument "Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)".
 * deepen-3 je pokazao da 20+ fakulteta doktorsko oblikovanje IZRIJEKOM delegira na taj
 * predlozak. Umjesto per-fakultet harvesta (delegacija -> found:false), ovdje se ISTI
 * sveucilisni izvor (unizg-drsc08-doktorski) primjenjuje kao doktorski profil na svaki
 * fakultet koji ga delegira. 6 pravila su verbatim preuzeta iz vec verificiranog FPZG
 * doktorskog (isti izvor, isti citati, hash). Pise fanout draft + port-spec po fakultetu.
 * Pokretanje: node scripts/gen-drsc08-doctoral.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const NOW = '2026-07-02';
const SRC_ID = 'unizg-drsc08-doktorski';
const SRC_HASH = 'a38f06f9e72255ade0010197674965fae0715f1f476044ba29a53886151f069c';
const SRC_PATH = 'data/sources/unizg/unizg-drsc08-doktorski-oblikovanje.doc';
const PAGE = "odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada)";
const Q_FMT = 'Postavke stranice: Font (tip pisma): obavezna potpora svih hrvatskih znakova - Times New Roman. Velicina pisma: 12 tipografskih tocaka. Prored: 1,5 redak.';
const Q_MARGIN = 'Lijeva i desna margina: 2,5 cm. Gornja i donja margina: 2,5 cm. Naslovnica ima drugacije margine.';
const Q_A4 = 'Rad treba biti ispisan na papiru formata A4 (210x297).';
const Q_PAGENUM = 'Stranice trebaju biti numerirane. Broje se sve stranice od Uvoda do kraja rada. Numeracija se pise u donjem desnom kutu.';

// 17 fakulteta koje je deepen-3 potvrdio da doktorsko oblikovanje delegiraju na DR.SC.-08.
// gen = genitiv naziva (za "Doktorski studij <gen>").
const FACS = [
  ['arh', 'Arhitektonski fakultet', 'Arhitektonskog fakulteta'],
  ['erf', 'Edukacijsko-rehabilitacijski fakultet', 'Edukacijsko-rehabilitacijskog fakulteta'],
  ['efzg', 'Ekonomski fakultet', 'Ekonomskog fakulteta'],
  ['ffrz', 'Fakultet filozofije i religijskih znanosti', 'Fakulteta filozofije i religijskih znanosti'],
  ['fhs', 'Fakultet hrvatskih studija', 'Fakulteta hrvatskih studija'],
  ['fkit', 'Fakultet kemijskog inzenjerstva i tehnologije', 'Fakulteta kemijskog inženjerstva i tehnologije'],
  ['fsb', 'Fakultet strojarstva i brodogradnje', 'Fakulteta strojarstva i brodogradnje'],
  ['fbf', 'Farmaceutsko-biokemijski fakultet', 'Farmaceutsko-biokemijskog fakulteta'],
  ['grad', 'Gradevinski fakultet', 'Građevinskog fakulteta'],
  ['grf', 'Graficki fakultet', 'Grafičkog fakulteta'],
  ['kbf', 'Katolicki bogoslovni fakultet', 'Katolickog bogoslovnog fakulteta'],
  ['pbf', 'Prehrambeno-biotehnoloski fakultet', 'Prehrambeno-biotehnološkog fakulteta'],
  ['sfzg', 'Stomatoloski fakultet', 'Stomatološkog fakulteta'],
  ['ttf', 'Tekstilno-tehnoloski fakultet', 'Tekstilno-tehnološkog fakulteta'],
  ['ufzg', 'Uciteljski fakultet', 'Učiteljskog fakulteta'],
  ['vef', 'Veterinarski fakultet', 'Veterinarskog fakulteta'],
  ['muza', 'Muzicka akademija', 'Muzičke akademije'],
];

const SOURCE = {
  id: SRC_ID, kind: 'guidelines',
  title: 'Upute za oblikovanje doktorskog rada (Obrazac DR.SC.-08)', url: 'https://www.unizg.hr/nc/vijest/article/obrasci-za-doktorski-studij/',
  publisher: 'Sveuciliste u Zagrebu', fetchedAt: NOW, snapshotPath: SRC_PATH, snapshotHash: SRC_HASH,
  validityClass: 'stable', lastChecked: NOW,
  note: 'Sveucilisni predlozak za oblikovanje doktorskog rada; fakulteti izrijekom delegiraju oblikovanje disertacije na njega (potvrdjeno deepen-3).',
};

const mkEntry = (pid, checkId, value, category, label, quote) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: true, authority: 'general', sourceId: SRC_ID, sourcePage: PAGE, quote,
  status: 'verified', scored: true, verifiedHash: SRC_HASH, lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null,
});

const specPaths = [];
for (const [fac, name, gen] of FACS) {
  const pid = `${fac}-doktorski`;
  const program = `Doktorski studij ${gen}`;
  const entries = [
    mkEntry(pid, 'font', ['Times New Roman'], 'format', 'Font', Q_FMT),
    mkEntry(pid, 'font-size', [12], 'format', 'Velicina slova', Q_FMT),
    mkEntry(pid, 'line-spacing', 1.5, 'format', 'Prored', Q_FMT),
    mkEntry(pid, 'margins', { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, 'format', 'Margine', Q_MARGIN),
    mkEntry(pid, 'paper-size', true, 'format', 'Format papira A4', Q_A4),
    mkEntry(pid, 'page-numbers', true, 'format', 'Brojevi stranica', Q_PAGENUM),
  ];
  // fanout draft (ne dira postojeci <fac>.json)
  writeFileSync(`data/profiles/${fac}/drafts/${fac}-doktorski.json`,
    JSON.stringify({ profileId: pid, entries, generatedAt: NOW }, null, 2) + '\n');

  const profile = {
    id: pid, unitId: fac, programs: [program], workTypes: ['doctoral'], status: 'partial',
    profileLabel: `${name}, doktorski rad`, verifiedAt: NOW, documentDate: null,
    rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, requireA4: true, requirePageNumbers: true },
    facts: [], note: 'Doktorsko oblikovanje delegirano na sveucilisni DR.SC.-08 predlozak; pravila preuzeta iz njega.',
    sources: [{ title: SOURCE.title, url: SOURCE.url }],
    sourceHierarchy: [`Sveucilisni DR.SC.-08 (${SRC_ID})`],
    ruleAuthority: 'official-program-guidelines', normativeScope: ['font', 'velicina slova', 'prored', 'margine', 'format papira (A4)', 'numeracija stranica'], advisoryScope: [],
  };
  const ledger = entries.map((e) => ({
    id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pid, action: 'verified',
    actor: 'owner-bulk-approval', timestamp: NOW, sourceId: SRC_ID, sourcePage: PAGE, quote: e.quote,
    note: 'DR.SC.-08 sveucilisni doktorski redizajn (delegacija potvrdjena deepen-3).',
  }));
  const specPath = `discovery/port-specs/${pid}.json`;
  writeFileSync(specPath, JSON.stringify({ faculty: fac, unit: null, catalogPrograms: [program], sources: [SOURCE], profiles: [profile], ledger }, null, 2) + '\n');
  specPaths.push(specPath);
}
console.log(`Generirano ${FACS.length} doktorskih profila iz DR.SC.-08.`);
console.log(specPaths.join(' '));
