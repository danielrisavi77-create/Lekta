/**
 * Upis MODALITETA i OPSEGA za slucajeve koje strojni predlagac odbija odluciti sam.
 *
 *   node scripts/apply-claim-scope.mjs --from data/verification/scope-decisions.json --by "Ime"
 *   ... uz `--write` da stvarno upise (bez toga je suho).
 *
 * Zasto postoji: `apply_claim_modality.py` upisuje samo jednoznacne jedinice, pa 383 jedinice
 * (652 pravila) stoje u `data/verification/modality-worklist.md` i cekaju CITANJE. Vecina ih ne
 * ceka odluku nego prijepis: skupine "recenica imenuje X, a os po naravi mjeri Y" nastaju kad
 * specifikacija u istoj recenici nabroji i tijelo i fusnotu, pa predlagac uzme krivu rijec kao
 * opseg. Bez alata je svaki takav slucaj rucna izmjena JSON-a.
 *
 * GRANICA KOJU OVAJ ALAT NE PRELAZI, i ona je ista koju je iznudio FER pilot:
 *
 *  1. UBLAZEN MODALITET SE NE UPISUJE. `recommendation`, `permission` i `condition` traze covjeka,
 *     bez obzira tko pokrece alat. FER pilot je oborio 4 od 5 tvrdnji i nijedna nije pala na krivom
 *     prijepisu nego na TUMACENJU (preporuka citana kao obveza), a pripisivanje ublazavanja pravoj
 *     osi je citanje, ne uzorak (`ferit`: "Rad se pise na racunalu (preporuca se MS Word) uz prored
 *     od 1,5" - ublazavanje veze PROGRAM, ne prored).
 *  2. `modalitySource` se NE upisuje kao `human` osim uz `--human`, koji trazi i potpis. Zadano je
 *     `agent-read`: izvedeno citanjem citata, nije strojni uzorak, ali ni ljudski potpis. Lagati o
 *     tome tko je odlucio je gore od praznog polja, jer prazno polje bar trazi da se pogleda.
 *  3. Postojeci `modalitySource: "human"` se NIKAD ne pregazi.
 *
 * Upis je LINIJSKI, ne kroz ponovnu serijalizaciju JSON-a: draft datoteke drze objekte u nizu u
 * jednom retku, pa bi `JSON.stringify` napravio desetke redaka kozmeticke razlike po datoteci i
 * zatrpao stvarnu izmjenu. Isti razlog i isti postupak kao `scripts/apply_claim_modality.py`.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (rel) => join(root, ...rel.split('/'));

const MODALITIES = new Set(['obligation', 'directive', 'prohibition', 'recommendation', 'permission', 'condition']);
const SOFT = new Set(['recommendation', 'permission', 'condition']);
const SCOPES = new Set([
  'whole', 'body', 'heading', 'caption', 'table', 'footnote', 'bibliography', 'code', 'title-page',
]);
const DECISIONS_LOG = 'data/verification/claim-scope-decisions.json';
const RULE_ID_LINE = /^(\s*)"ruleId"\s*:\s*"([^"]+)"\s*,\s*$/;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(2);
}

/** Odluke: [{ruleId, modality, scope, note?}]. Ili jedna preko --rule/--modality/--scope. */
function loadDecisions() {
  const from = arg('from');
  if (from) {
    const raw = JSON.parse(readFileSync(p(from), 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.decisions;
    if (!Array.isArray(list)) fail(`${from} mora biti niz odluka ili objekt s kljucem "decisions".`);
    return list;
  }
  const ruleId = arg('rule');
  if (!ruleId) fail('Upotreba: --from <datoteka.json> ILI --rule <ruleId> --modality <m> --scope <s>, uz --by "Ime".');
  return [{ ruleId, modality: arg('modality'), scope: arg('scope'), note: arg('note') }];
}

function validate(decisions, source) {
  const seen = new Set();
  for (const d of decisions) {
    if (!d?.ruleId) fail(`Odluka bez ruleId: ${JSON.stringify(d)}`);
    if (seen.has(d.ruleId)) fail(`Isti ruleId dvaput u ulazu: ${d.ruleId}`);
    seen.add(d.ruleId);
    if (!MODALITIES.has(d.modality)) fail(`${d.ruleId}: modality "${d.modality}" nije iz vokabulara.`);
    if (!SCOPES.has(d.scope)) fail(`${d.ruleId}: scope "${d.scope}" nije iz vokabulara.`);
    if (SOFT.has(d.modality) && source !== 'human') {
      fail(
        `${d.ruleId}: modalitet "${d.modality}" je UBLAZEN i trazi covjeka.\n` +
          '  Pripisivanje ublazavanja pravoj osi je citanje, ne uzorak: FER pilot je na tome oborio\n' +
          '  4 od 5 tvrdnji. Pokreni s --human i potpisom ako si TI to procitao/la u izvoru.',
      );
    }
  }
}

/** Svi draft zapisi po ruleId, sa stazom datoteke, da se odluka moze provjeriti prije upisa. */
function indexDrafts() {
  const index = new Map();
  const base = p('data/profiles');
  for (const unit of readdirSync(base, { withFileTypes: true })) {
    if (!unit.isDirectory()) continue;
    const dir = join(base, unit.name, 'drafts');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const rel = `data/profiles/${unit.name}/drafts/${file}`;
      const data = JSON.parse(readFileSync(p(rel), 'utf8'));
      const groups = data.profiles ? Object.values(data.profiles) : [data.entries ?? []];
      for (const entries of groups) {
        for (const entry of entries ?? []) {
          if (entry?.ruleId) index.set(entry.ruleId, { rel, entry });
        }
      }
    }
  }
  return index;
}

function main() {
  const human = has('human');
  const by = arg('by');
  const write = has('write');
  const source = human ? 'human' : 'agent-read';
  if (human && !by) fail('--human trazi --by "Ime": potpis je ono sto tu razinu razlikuje od strojne.');

  const decisions = loadDecisions();
  validate(decisions, source);
  const index = indexDrafts();

  const byFile = new Map();
  const stats = { upisano: 0, 'vec upisano': 0, 'preskoceno (ljudski potvrdjeno)': 0, 'nepoznat ruleId': 0 };
  for (const d of decisions) {
    const hit = index.get(d.ruleId);
    if (!hit) {
      console.error(`  NEPOZNAT ruleId: ${d.ruleId}`);
      stats['nepoznat ruleId'] += 1;
      continue;
    }
    if (hit.entry.modalitySource === 'human' && !human) {
      stats['preskoceno (ljudski potvrdjeno)'] += 1;
      continue;
    }
    if (hit.entry.modality === d.modality && hit.entry.scope === d.scope) {
      stats['vec upisano'] += 1;
      continue;
    }
    const list = byFile.get(hit.rel) ?? new Map();
    list.set(d.ruleId, d);
    byFile.set(hit.rel, list);
  }

  for (const [rel, plan] of byFile) {
    const raw = readFileSync(p(rel), 'utf8');
    const newline = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    for (const line of lines) {
      out.push(line);
      const match = RULE_ID_LINE.exec(line);
      if (!match) continue;
      const [, indent, ruleId] = match;
      const decision = plan.get(ruleId);
      if (!decision) continue;
      out.push(`${indent}"modality": "${decision.modality}",`);
      out.push(`${indent}"scope": "${decision.scope}",`);
      out.push(`${indent}"modalitySource": "${source}",`);
      stats.upisano += 1;
    }
    if (!write) continue;
    const text = out.join('\n');
    writeFileSync(p(rel), newline === '\r\n' ? text.replace(/\n/g, '\r\n') : text, 'utf8');
    // Provjera odmah, ne kasnije: linijski upis mora ostati valjan JSON.
    JSON.parse(readFileSync(p(rel), 'utf8'));
  }

  console.log('=== Upis modaliteta i opsega (citano, ne izvedeno uzorkom) ===');
  console.log(`  izvor upisa: ${source}${by ? ` (potpis: ${by})` : ''}`);
  for (const [key, value] of Object.entries(stats)) if (value) console.log(`  ${key}: ${value}`);
  console.log(`  datoteka pogodjeno: ${byFile.size}`);
  if (!write) {
    console.log('\nSUHO. Nista nije zapisano. Ponovi s --write kad si zadovoljan brojkama.');
    return;
  }
  recordDecisions(decisions, source, by);
  console.log('\nZAPISANO. Pregradi popis koji ceka covjeka:');
  console.log('  npm run claim-modality');
}

function recordDecisions(decisions, source, by) {
  const existing = existsSync(p(DECISIONS_LOG))
    ? JSON.parse(readFileSync(p(DECISIONS_LOG), 'utf8'))
    : {
        note:
          'Presude o modalitetu i opsegu koje strojni predlagac nije htio donijeti sam. Pise ih ' +
          '`scripts/apply-claim-scope.mjs`. Postoji da se odluka ne izgubi i da se vidi CIME je ' +
          'donesena: `agent-read` (citanjem citata) ili `human` (ljudski potpis).',
        decisions: [],
      };
  for (const d of decisions) {
    existing.decisions.push({
      ruleId: d.ruleId,
      modality: d.modality,
      scope: d.scope,
      decidedVia: source,
      ...(by ? { decidedBy: by } : {}),
      ...(d.note ? { note: d.note } : {}),
    });
  }
  const raw = existsSync(p(DECISIONS_LOG)) ? readFileSync(p(DECISIONS_LOG), 'utf8') : '\n';
  const crlf = raw.includes('\r\n');
  const text = `${JSON.stringify(existing, null, 2)}\n`;
  writeFileSync(p(DECISIONS_LOG), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

export { validate, indexDrafts, MODALITIES, SCOPES, SOFT };
