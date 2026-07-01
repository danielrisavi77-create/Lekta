/**
 * Bodovanje izjave o izvornosti kao obveznog required-section (Faza: harvest program-stranica).
 *
 * Nalaz (2026-07-02): stranice studijskih programa Pravnog fakulteta IZRIJEKOM propisuju izjavu
 * o izvornosti kao sastavni dio rada ("Unutar diplomskog/zavrsnog rada u pdf-u Student potpisuje
 * Izjavu o izvornosti koja je sastavni dio..."; za integrirani i "na pocetku mora sadrzavati
 * izjavu autora o izvornosti"). Izvor NIJE Pravilnik (on delegira opremanje rada na te stranice),
 * nego pojedina program-stranica. Zato:
 *   - vrati "declaration" na pocetak requiredSections (rules + draft, identicno -> faithfulness drzi),
 *   - glavni izvor pravila ostaje snapshotirani Upute PDF (stabilan, pokriva strukturne dijelove),
 *   - izjavu potkrijepi preko additionalSources: snapshotirana program-stranica (volatile), s
 *     doslovnim citatom i vlastitim hash-om (kompozitna proviencija, posteno razdvojena),
 *   - makni izjava-advisory iz manualChecks (sada je scored, ne advisory).
 * Golden se re-baselina (declaration je sad obvezan dio). Pokretanje: node scripts/score-declaration.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) {
  console.error('Upotreba: node scripts/score-declaration.mjs "<approver>"');
  process.exit(1);
}
const NOW = '2026-07-02';
const UPUTE = 'pravo-upute-oblikovanje-2024';

const DECLARATION = {
  key: 'declaration',
  label: 'izjava o izvornosti',
  terms: ['izjava o izvornosti', 'izjava autora o izvornosti'],
};
const DECLARATION_CHECK_PREFIX = 'Izjava o izvornosti:';

// Po profilu: njegova snapshotirana program-stranica + doslovni citat te stranice.
const QUOTE_SASTAVNI =
  'Unutar diplomskog/zavrsnog rada u pdf-u Student potpisuje Izjavu o izvornosti koja je sastavni dio diplomskog/zavrsnog rada.';
const PROFILES = {
  'pravo-integrirani-diplomski': {
    sourceId: 'pravo-studij-integrirani-pravo',
    quote:
      'Diplomski rad na pocetku mora sadrzavati izjavu autora o izvornosti. Unutar diplomskog/zavrsnog rada u pdf-u Student potpisuje Izjavu o izvornosti koja je sastavni dio diplomskog/zavrsnog rada.',
  },
  'pravo-javna-uprava-prijediplomski': {
    sourceId: 'pravo-studij-javna-uprava-prijediplomski',
    quote: QUOTE_SASTAVNI,
  },
  'pravo-javna-uprava-diplomski': {
    sourceId: 'pravo-studij-javna-uprava-diplomski',
    quote: QUOTE_SASTAVNI,
  },
  'pravo-porezni-prijediplomski': {
    sourceId: 'pravo-studij-porezni-prijediplomski',
    quote: QUOTE_SASTAVNI,
  },
};
const ADD_SOURCE_PAGE = "odjeljak o postupku prijave/obrane rada, pod 'Izjava o izvornosti' (sastavni dio rada)";

const verified = readJson('data/profiles/verified-profiles.json');
const drafts = readJson('data/profiles/pravo/drafts/law-drafts.json');
const sources = readJson('data/sources/source-registry.json');
const hashOf = (id) => sources.find((s) => s.id === id)?.snapshotHash ?? null;

const ledger = [];
let touched = 0;

for (const [pid, cfg] of Object.entries(PROFILES)) {
  const addHash = hashOf(cfg.sourceId);
  if (!addHash) {
    console.error(`Program-stranica ${cfg.sourceId} nema snapshotHash; preskacem ${pid}.`);
    continue;
  }

  // 1. zivi profil: prepend declaration u rules.requiredSections; makni izjava-advisory iz manualChecks
  const prof = verified.find((x) => x.id === pid);
  if (!prof) {
    console.error(`Nema profila ${pid} u verified-profiles.`);
    continue;
  }
  const rs = prof.rules.requiredSections || [];
  if (!rs.some((s) => s.key === 'declaration')) {
    prof.rules.requiredSections = [JSON.parse(JSON.stringify(DECLARATION)), ...rs];
  }
  if (Array.isArray(prof.manualChecks)) {
    prof.manualChecks = prof.manualChecks.filter((c) => !c.startsWith(DECLARATION_CHECK_PREFIX));
    if (prof.manualChecks.length === 0) delete prof.manualChecks;
  }

  // 2. draft ruleEntry: ista vrijednost (declaration na pocetku) + additionalSources = program-stranica
  const entries = drafts.profiles[pid] || [];
  const e = entries.find((x) => x.ruleId === `${pid}--required-sections`);
  if (!e) {
    console.error(`Nema required-sections drafta za ${pid}.`);
    continue;
  }
  const val = e.value || [];
  if (!val.some((s) => s.key === 'declaration')) {
    e.value = [JSON.parse(JSON.stringify(DECLARATION)), ...val];
  }
  e.additionalSources = [
    {
      sourceId: cfg.sourceId,
      sourcePage: ADD_SOURCE_PAGE,
      quote: cfg.quote,
      covers: 'izjava o izvornosti (declaration)',
      verifiedHash: addHash,
    },
  ];
  e.note =
    'Strukturni dijelovi (sadrzaj/uvod/sredisnji/zakljucak/literatura) iz Uputa; izjava o izvornosti iz snapshotirane stranice studijskog programa (additionalSources). Kompozitno pravilo.';
  // glavni izvor ostaje Upute (stabilan); verifiedHash Uputa vec postavljen.
  e.confirmedVia = 'ai-1pass-batch';
  e.verifiedBy = approver;
  e.lastVerified = NOW;

  ledger.push({
    id: `led-${pid}--required-sections-declaration-ai-confirmed-${NOW}`,
    ruleId: `${pid}--required-sections`,
    profileId: pid,
    action: 'ai-confirmed',
    actor: 'ai-1pass',
    timestamp: NOW,
    sourceId: cfg.sourceId,
    sourcePage: ADD_SOURCE_PAGE,
    quote: cfg.quote,
    note: 'Izjava o izvornosti dodana u obvezne dijelove; izvor je snapshotirana stranica studijskog programa (ne Pravilnik). Direktno citanje sluzbenog izvora, doslovni citat potvrdjen.',
  });
  ledger.push({
    id: `led-${pid}--required-sections-declaration-verified-${NOW}`,
    ruleId: `${pid}--required-sections`,
    profileId: pid,
    action: 'verified',
    actor: approver,
    timestamp: NOW,
    sourceId: cfg.sourceId,
    sourcePage: ADD_SOURCE_PAGE,
    quote: cfg.quote,
    note: 'Batch odobrenje: izjava o izvornosti postaje scored required-section (kompozitno pravilo, additionalSources = program-stranica).',
  });
  touched++;
}

const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) {
  if (seen.has(l.id)) continue;
  existing.push(l);
  added++;
}

writeFileSync(p('data/profiles/verified-profiles.json'), JSON.stringify(verified, null, 2) + '\n');
writeFileSync(p('data/profiles/pravo/drafts/law-drafts.json'), JSON.stringify(drafts, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`Bodovano declaration za ${touched} profila, ${added} ledger zapisa. Sljedece: re-baseline golden + recompute coverage.`);
