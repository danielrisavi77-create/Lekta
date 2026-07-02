/**
 * FPZG prijediplomski zavrsni (tekstualni): bodovanje formata/strukture preko OPCE KLAUZULE Uputa
 * i opsega iz Odluke o rokovima zavrsnih radova.
 *
 * Opce Upute (str. 6) izrijekom kazu da "donose temeljne naputke za izradu svih vrsta akademske
 * proze" te da se "studente svih razina studija upucuju da ih prouce". Format-recenica (str. 14)
 * imenuje diplomski/specijalisticki, ali po opcoj klauzuli (domenska odluka approvera) primjenjuje
 * se i na prijediplomski zavrsni rad. Opseg (5000-6000 rijeci) dolazi iz dedicirane Odluke.
 *
 * Vrijedi za tekstualne prijediplomske zavrsne (politologija, novinarstvo-tekst). AV varijanta
 * (novinarstvo-zavrsni-av) se NE bodira ovdje (audiovizualni medij, vecina provjera ugasena).
 * Vrijednosti se KOPIRAJU iz rules (faithfulness). Pokretanje: node scripts/seed-fpzg-prijediplomski.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) { console.error('Upotreba: node scripts/seed-fpzg-prijediplomski.mjs "<approver>"'); process.exit(1); }
const NOW = '2026-07-02';
const UPUTE = 'fpzg-upute-akademski-radovi';
const ODLUKA = 'fpzg-odluka-zavrsni-opseg-2025';
const PROFILES = ['fpzg-politologija-zavrsni', 'fpzg-novinarstvo-zavrsni-tekst'];

// Opca klauzula (verbatim kljucne fraze, str. 6) kojom se format/struktura primjenjuje na sve razine.
const CLAUSE = 'Upute donose temeljne naputke za izradu svih vrsta akademske proze; studente svih razina studija upucuju se da ih prouce.';
const FMT_SPEC = 'Diplomski i zavrsni specijalisticki rad trebaju biti napisani fontom/ pismom Times New Roman, velicinom slova 12 s proredom 1,5, te obostrano poravnati (Justify).';
const A4_SPEC = 'Rad treba biti otisnut na papiru formata A4 (21x29,7 cm), te ukoricen.';
const PG_SPEC = 'Stranice rada se numeriraju, ali ne i naslovnice; prethodni dijelovi rimskim, osnovni tekst arapskim brojkama.';
const STR_SPEC = 'Akademski radovi sastoje se od prethodnoga dijela, osnovnog teksta i zavrsnoga dijela; obavezni su sadrzaj, uvod, tijelo teksta, zakljucak, sazetak, kljucne rijeci i popis literature.';
const FMT_PAGE = "str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA)";
const STR_PAGE = "str. 6 (opca klauzula) i str. 9 (STRUKTURA RADA)";
const WC_QUOTE = 'Zavrsni rad ukljucuje 5 ECTS bodova, sto se odnosi na 20 do 25 kartica teksta odnosno 5000 do 6000 rijeci.';
const WC_PAGE = 'str. 1 (opseg zavrsnog rada: 5 ECTS, 20-25 kartica, 5000-6000 rijeci)';

const verified = readJson('data/profiles/verified-profiles.json');
const sources = readJson('data/sources/source-registry.json');
const uputeHash = sources.find((s) => s.id === UPUTE).snapshotHash;
const odlukaHash = sources.find((s) => s.id === ODLUKA).snapshotHash;

const draftsFile = readJson('data/profiles/fpzg/drafts/fpzg-drafts.json');
draftsFile.profiles = draftsFile.profiles || {};

const mk = (pid, checkId, value, sourceId, page, quote, hash, category, label) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: true, authority: 'general', sourceId, sourcePage: page, quote,
  status: 'verified', verifiedBy: approver, confirmedVia: 'ai-1pass-batch', lastVerified: NOW, verifiedHash: hash,
});

const ledger = [];
let rules = 0;
for (const pid of PROFILES) {
  const R = verified.find((x) => x.id === pid).rules;
  const arr = (draftsFile.profiles[pid] = draftsFile.profiles[pid] || []);
  const has = (c) => arr.some((e) => e.checkId === c);

  const specs = [
    ['font', R.font, UPUTE, FMT_PAGE, CLAUSE + ' ' + FMT_SPEC, uputeHash, 'format', 'Font'],
    ['font-size', R.size, UPUTE, FMT_PAGE, CLAUSE + ' ' + FMT_SPEC, uputeHash, 'format', 'Velicina slova'],
    ['line-spacing', R.spacing, UPUTE, FMT_PAGE, CLAUSE + ' ' + FMT_SPEC, uputeHash, 'format', 'Prored'],
    ['paper-size', R.requireA4, UPUTE, FMT_PAGE, CLAUSE + ' ' + A4_SPEC, uputeHash, 'format', 'Format papira A4'],
    ['page-numbers', R.requirePageNumbers, UPUTE, FMT_PAGE, CLAUSE + ' ' + PG_SPEC, uputeHash, 'format', 'Brojevi stranica'],
    ['toc', R.requireToc, UPUTE, STR_PAGE, CLAUSE + ' ' + STR_SPEC, uputeHash, 'structure', 'Sadrzaj'],
    ['required-sections', JSON.parse(JSON.stringify(R.requiredSections)), UPUTE, STR_PAGE, CLAUSE + ' ' + STR_SPEC, uputeHash, 'structure', 'Obvezni dijelovi rada'],
    ['word-count', { min: R.wordMin, max: R.wordMax }, ODLUKA, WC_PAGE, WC_QUOTE, odlukaHash, 'scope', 'Opseg rijeci'],
  ];
  for (const [cid, val, sid, page, quote, hash, cat, label] of specs) {
    if (val == null || has(cid)) continue;
    const e = mk(pid, cid, val, sid, page, quote, hash, cat, label);
    arr.push(e);
    rules++;
    const via = sid === ODLUKA ? 'Opseg iz Odluke o zavrsnim radovima (5000-6000 rijeci).' : 'Format/struktura preko opce klauzule Uputa (svih vrsta proze, sve razine studija); domenski odobrio approver.';
    ledger.push({ id: `led-${e.ruleId}-ai-confirmed-${NOW}`, ruleId: e.ruleId, profileId: pid, action: 'ai-confirmed', actor: 'ai-1pass', timestamp: NOW, sourceId: sid, sourcePage: page, quote, note: via });
    ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pid, action: 'verified', actor: approver, timestamp: NOW, sourceId: sid, sourcePage: page, quote, note: 'Batch odobrenje prijediplomski zavrsni (tekst).' });
  }
}

const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) { if (!seen.has(l.id)) { existing.push(l); added++; } }

writeFileSync(p('data/profiles/fpzg/drafts/fpzg-drafts.json'), JSON.stringify(draftsFile, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`Prijediplomski: ${rules} pravila (2 profila), ${added} ledger zapisa.`);
