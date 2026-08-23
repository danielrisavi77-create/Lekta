/**
 * Presuda o JEDNOM raskoraku izmedju tvrdnje i bodovane vrijednosti, s ljudskim potpisom.
 *
 *   node scripts/apply-drift-decision.mjs --rule <ruleId> --decision claim|claim-wrong --by "Ime"
 *   ... uz `--write` da stvarno upise (bez toga je suho).
 *
 * Zasto postoji: demotija je zaustavila krivo bodovanje, ali nijedan slucaj nije rijesila, a
 * rjesavanje rukom trazi izmjenu u dva registra plus pregradnju sest artefakata. Bez alata je 38
 * odluka zapravo 38 visekoraknih zahvata, pa stoje.
 *
 * GRANICA KOJU OVAJ ALAT NE PRELAZI: on ne odlucuje. `--by` je obavezan i upisuje se kao potpis;
 * bez njega skript odbija raditi. Ukljucivanje bodovanja je jedina stvar u ovom lancu koja trazi
 * covjeka (gasenje je fail-safe i radi se strojno), pa je potpis ovdje ono sto tu granicu drzi.
 *
 * Dvije odluke:
 *   --decision claim        izvor podupire TVRDNJU -> njezina vrijednost ide u `rules` oba registra
 *                           (`verified-profiles.json` i `-heavy.json`; light indeks ne nosi pravila).
 *                           Raskorak time nestaje i demotija se sama dize pri pregradnji.
 *   --decision claim-wrong  izvor podupire ZRCALO -> tvrdnja je kriva: ide u `needs-recheck`,
 *                           `scored:false`, `autoFixable:false` (pravilo pod reverifikacijom ne smije
 *                           ni bodovati ni pokretati popravak) uz obavezan `--note`.
 *
 * Alat CITA presudu iz `docs/generated/drift-adjudication.json` i odbija odluku koja joj proturjeci
 * bez `--force`. To nije birokracija: `vuka` je bio jedini slucaj u kojem je zrcalo bilo u pravu, i
 * upravo takav se najlakse zamijeni s ostalih 23 gdje je u pravu tvrdnja.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (rel) => join(root, ...rel.split('/'));

const REGISTRIES = ['data/profiles/verified-profiles.json', 'data/profiles/verified-profiles-heavy.json'];
const DRIFT = 'data/verification/scored-value-drift.json';
const ADJ = 'docs/generated/drift-adjudication.json';
const DECISIONS = 'data/verification/drift-decisions.json';

/** checkId -> kako se vrijednost tvrdnje upisuje u spljosteni `rules`. Isto znacenje kao applyEntry. */
const WRITERS = {
  font: (rules, value) => {
    rules.font = Array.isArray(value) ? value : [value];
  },
  'font-size': (rules, value) => {
    rules.size = Array.isArray(value) ? value : [value];
  },
  'line-spacing': (rules, value) => {
    rules.spacing = Array.isArray(value) ? value[0] : value;
  },
  margins: (rules, value) => {
    // `minimum` je zastavica, ne strana: normalizeCheckFlags trazi da sve cetiri strane budu brojevi.
    const { minimum, ...sides } = value ?? {};
    rules.margins = sides;
    if (minimum === true) rules.marginsMinimum = true;
    else delete rules.marginsMinimum;
  },
};

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

function readJson(rel) {
  return JSON.parse(readFileSync(p(rel), 'utf8'));
}
/**
 * Zapis natrag uz OCUVANE zavrsetke redaka: registri se razlikuju (jedan CRLF, drugi LF).
 *
 * NOVA datoteka (prvi zapis u dnevnik odluka) je slucaj koji je 2026-08-24 srusio alat NAKON sto je
 * vec upisao obje registarske izmjene: vrijednosti su bile primijenjene, a potpis nije zabiljezen.
 * Poluprimijenjeno stanje je gore od oba cista ishoda, pa se odsutnost datoteke tretira kao LF.
 */
function writeJson(rel, data) {
  const raw = existsSync(p(rel)) ? readFileSync(p(rel), 'utf8') : '';
  const crlf = raw.includes('\r\n');
  const text = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(p(rel), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(2);
}

function main() {
  const ruleId = arg('rule');
  const decision = arg('decision');
  const by = arg('by');
  const note = arg('note');
  const write = has('write');

  if (!ruleId || !decision) fail('Upotreba: --rule <ruleId> --decision claim|claim-wrong --by "Ime" [--note "..."] [--write]');
  if (!['claim', 'claim-wrong'].includes(decision)) fail('--decision mora biti `claim` ili `claim-wrong`.');
  if (!by) fail('--by je OBAVEZAN: ukljucivanje bodovanja trazi ljudski potpis, alat ga ne moze dati sam.');
  if (decision === 'claim-wrong' && !note) fail('--note je obavezan uz `claim-wrong`: sljedeca sesija mora vidjeti ZASTO je pravilo skinuto.');

  const drift = readJson(DRIFT);
  const finding = drift.findings.find((f) => f.ruleId === ruleId && f.kind === 'drift');
  if (!finding) fail(`Pravilo "${ruleId}" nije medju raskoracima u ${DRIFT}. Provjeri ime ili pregradi artefakt.`);

  const adjudication = readJson(ADJ).rows.find((r) => r.ruleId === ruleId);
  const verdict = adjudication?.verdict ?? 'nepoznata';
  const contradicts =
    (decision === 'claim' && verdict === 'engine-supported') ||
    (decision === 'claim-wrong' && verdict === 'claim-supported');
  if (contradicts && !has('force')) {
    fail(
      `Odluka "${decision}" proturjeci presudi "${verdict}" za ${ruleId}.\n` +
        `  Presuda je izvedena iz samog izvora (pokrivanje citata ${adjudication?.claimQuoteCoverage}).\n` +
        '  Ako svejedno znas da je tocna, ponovi s --force i obrazlozi u --note.',
    );
  }

  console.log('=== Presuda o raskoraku ===');
  console.log(`  pravilo   : ${ruleId}  (${finding.checkId})`);
  console.log(`  profil    : ${finding.profileId}`);
  console.log(`  izvor     : ${finding.sourceId} / ${finding.sourcePage ?? 'bez lokatora'}`);
  console.log(`  tvrdnja   : ${JSON.stringify(finding.claimValue)}`);
  console.log(`  motor     : ${JSON.stringify(finding.scoredValue)}`);
  console.log(`  presuda   : ${verdict}${contradicts ? '  (PROTURJECI ODLUCI, forsirano)' : ''}`);
  console.log(`  odluka    : ${decision}  (potpis: ${by})`);

  const changes = [];
  if (decision === 'claim') {
    const writer = WRITERS[finding.checkId];
    if (!writer) fail(`Za os "${finding.checkId}" jos nema pravila upisa. Dodaj ga u WRITERS pa ponovi.`);
    for (const rel of REGISTRIES) {
      const data = readJson(rel);
      const rows = Array.isArray(data) ? data : Object.values(data);
      const profile = rows.find((r) => r?.id === finding.profileId);
      if (!profile) fail(`Profil "${finding.profileId}" ne postoji u ${rel}.`);
      const before = JSON.stringify(profile.rules);
      writer((profile.rules ??= {}), finding.claimValue);
      if (before !== JSON.stringify(profile.rules)) changes.push({ rel, data });
    }
    console.log(`\n  -> vrijednost tvrdnje upisuje se u ${changes.length} registra`);
  } else {
    const draftPath = findDraft(finding.profileId, ruleId);
    if (!draftPath) fail(`Ne nalazim draft s pravilom ${ruleId}.`);
    changes.push({ rel: draftPath, data: markNeedsRecheck(draftPath, ruleId, by, note) });
    console.log(`\n  -> tvrdnja ide u needs-recheck (scored:false, autoFixable:false) u ${draftPath}`);
  }

  if (!write) {
    console.log('\nSUHO. Nista nije zapisano. Ponovi s --write kad si siguran.');
    return;
  }
  for (const change of changes) writeJson(change.rel, change.data);
  recordDecision({ ruleId, decision, by, note, verdict, finding });
  console.log('\nZAPISANO. Sada pregradi lanac, inace artefakti lazu o stanju:');
  console.log('  npm run scored-value-drift && npx vite-node scripts/gen-profile-runtime-maps.mts');
  console.log('  npm run drift-adjudicate && npm run drift-dossiers');
  console.log('  npm run recompute-coverage && npm run repair-recipe && npm run repair-coverage');
  console.log('  npm run closed-loop && npm run repair-faculty-matrix && npm run completion-ledger');
}

import { readdirSync, existsSync } from 'node:fs';

function findDraft(profileId, ruleId) {
  const base = p('data/profiles');
  for (const unit of readdirSync(base, { withFileTypes: true })) {
    if (!unit.isDirectory()) continue;
    const dir = join(base, unit.name, 'drafts');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const rel = `data/profiles/${unit.name}/drafts/${file}`;
      const data = readJson(rel);
      const groups = data.profiles ? Object.entries(data.profiles) : [[data.profileId, data.entries ?? []]];
      for (const [pid, entries] of groups) {
        if (pid !== profileId) continue;
        if ((entries ?? []).some((e) => e.ruleId === ruleId)) return rel;
      }
    }
  }
  return null;
}

function markNeedsRecheck(rel, ruleId, by, note) {
  const data = readJson(rel);
  const groups = data.profiles ? Object.values(data.profiles) : [data.entries ?? []];
  for (const entries of groups) {
    for (const entry of entries ?? []) {
      if (entry.ruleId !== ruleId) continue;
      entry.status = 'needs-recheck';
      entry.scored = false;
      entry.autoFixable = false;
      entry.confirmedVia = null;
      entry.note = `OZNACENO ZA REVERIFIKACIJU (${by}): ${note}`;
    }
  }
  return data;
}

function recordDecision(record) {
  const rel = DECISIONS;
  const existing = existsSync(p(rel))
    ? readJson(rel)
    : {
        note:
          'Presude o raskoracima izmedju tvrdnje i bodovane vrijednosti. Pise ih ' +
          '`scripts/apply-drift-decision.mjs`, uvijek uz ljudski potpis. Postoji da se odluka ne izgubi ' +
          'i da sljedeca revizija ne prijavi vec presudjen slucaj kao nov.',
        decisions: [],
      };
  existing.decisions.push({
    ruleId: record.ruleId,
    profileId: record.finding.profileId,
    checkId: record.finding.checkId,
    decision: record.decision,
    machineVerdict: record.verdict,
    claimValue: record.finding.claimValue,
    engineValue: record.finding.scoredValue,
    sourceId: record.finding.sourceId,
    decidedBy: record.by,
    ...(record.note ? { note: record.note } : {}),
  });
  writeJson(rel, existing);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
