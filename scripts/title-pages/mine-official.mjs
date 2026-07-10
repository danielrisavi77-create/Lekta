/**
 * Offline rudarenje sluzbenih izvora o NASLOVNICI (korak A pipeline-a predlozaka).
 *
 * Iz zivih registara (verified-profiles, legal-departments) i staging draftova pokupi
 * sve sto govori o naslovnici: postojeca audit polja (rules.titlePage*), tekstualne
 * spomene u manualChecks/advisoryScope/note/facts/quote te required-sections unose,
 * pa cross-referencira snapshote iz source-registry po fakultetu.
 *
 * Izlaz (ne commita se, artifacts/ je gitignoriran):
 *   artifacts/title-harvest/official/worklist.json  - per-unit dossier za draftanje
 *
 * Deterministicki, bez mreze. Pokretanje: node scripts/title-pages/mine-official.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'artifacts', 'title-harvest', 'official');

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

const verified = readJson('data/profiles/verified-profiles.json');
const legal = readJson('data/profiles/legal-departments.json');
const sources = readJson('data/sources/source-registry.json');
const catalog = readJson('data/catalog/zagreb-catalog.json');

/** Dijakriticki neosjetljiv test spominje li tekst naslovnicu/korice. */
function mentionsTitlePage(text) {
  if (typeof text !== 'string') return false;
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /naslovnic|naslovna stranica|naslovnoj stranici|korice|koricama/.test(plain);
}

/** Polja profila u kojima trazimo slobodni tekst o naslovnici. */
const TEXT_FIELDS = [
  'manualChecks', 'advisoryScope', 'normativeScope', 'facts',
  'note', 'validationNote',
];

/** Audit polja u rules koja vec strukturirano opisuju naslovnicu. */
const AUDIT_FIELDS = [
  'checkTitlePage', 'titlePageRequirements', 'titlePageSequence', 'titlePageTypography',
  'titleWorkTerms', 'titleMentorRequired', 'checkTitlePageNumberSuppression',
];

const units = new Map();
function unitEntry(unitId) {
  if (!units.has(unitId)) {
    units.set(unitId, {
      unitId,
      unitName: null,
      institutionName: null,
      auditFields: {},
      textHits: [],
      ruleEntryHits: [],
      requiredSectionsWithTitlePage: [],
      sources: [],
      publicSourceLevels: {},
    });
  }
  return units.get(unitId);
}

// Nazivi iz kataloga (puni naziv ustanove + jedinice za draftanje fixedText vrijednosti).
const unitNames = new Map();
for (const inst of catalog) {
  for (const u of inst.units) unitNames.set(u.id, { unitName: u.name, institutionName: inst.name });
}

function collectTextHits(entry, ownerId, obj) {
  for (const field of TEXT_FIELDS) {
    const value = obj?.[field];
    const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    for (const item of items) {
      if (mentionsTitlePage(item)) entry.textHits.push({ ownerId, field, text: item });
    }
  }
  for (const c of obj?.coverage?.note ? [obj.coverage.note] : []) {
    if (mentionsTitlePage(c)) entry.textHits.push({ ownerId, field: 'coverage.note', text: c });
  }
  for (const c of obj?.fieldValidation?.confirmed || []) {
    if (mentionsTitlePage(c)) entry.textHits.push({ ownerId, field: 'fieldValidation.confirmed', text: c });
  }
  for (const c of obj?.fieldValidation?.observedDeviations || []) {
    if (mentionsTitlePage(c)) entry.textHits.push({ ownerId, field: 'fieldValidation.observedDeviations', text: c });
  }
}

function collectRuleEntries(entry, ownerId, ruleEntries, file) {
  for (const re of ruleEntries || []) {
    const quoteHit = mentionsTitlePage(re.quote) || mentionsTitlePage(re.label);
    const isRequiredSections =
      re.checkId === 'required-sections' &&
      Array.isArray(re.value) &&
      re.value.some((v) => mentionsTitlePage(String(v)));
    if (isRequiredSections) {
      entry.requiredSectionsWithTitlePage.push({
        ownerId, file, ruleId: re.ruleId, value: re.value,
        sourceId: re.sourceId || null, sourcePage: re.sourcePage ?? null, authority: re.authority || null,
      });
    } else if (quoteHit) {
      entry.ruleEntryHits.push({
        ownerId, file, ruleId: re.ruleId, checkId: re.checkId,
        quote: re.quote || null, label: re.label || null,
        sourceId: re.sourceId || null, sourcePage: re.sourcePage ?? null, authority: re.authority || null,
      });
    }
  }
}

// 1) Verificirani profili: audit polja + tekst + ruleEntries + razine dostupnih PID-ova.
for (const p of verified) {
  const entry = unitEntry(p.unitId);
  const audit = {};
  for (const f of AUDIT_FIELDS) if (p.rules?.[f] !== undefined) audit[f] = p.rules[f];
  if (Object.keys(audit).length) entry.auditFields[p.id] = audit;
  collectTextHits(entry, p.id, p);
  collectRuleEntries(entry, p.id, p.ruleEntries, 'data/profiles/verified-profiles.json');
  for (const s of p.fieldValidation?.publicSources || []) {
    entry.publicSourceLevels[s.level] = (entry.publicSourceLevels[s.level] || 0) + 1;
  }
}

// 2) Pravne katedre (poseban registar, unit je pravo).
for (const d of legal) {
  const entry = unitEntry('pravo');
  const audit = {};
  for (const f of AUDIT_FIELDS) if (d.rules?.[f] !== undefined) audit[f] = d.rules[f];
  if (Object.keys(audit).length) entry.auditFields[`legal:${d.id}`] = audit;
  collectTextHits(entry, `legal:${d.id}`, d);
  collectRuleEntries(entry, `legal:${d.id}`, d.ruleEntries, 'data/profiles/legal-departments.json');
}

// 3) Staging draftovi: data/profiles/<fac>/drafts/*.json (razni oblici; trazimo profiles/ruleEntries).
const profilesDir = join(ROOT, 'data', 'profiles');
for (const fac of readdirSync(profilesDir, { withFileTypes: true })) {
  if (!fac.isDirectory()) continue;
  const draftsDir = join(profilesDir, fac.name, 'drafts');
  if (!existsSync(draftsDir)) continue;
  for (const f of readdirSync(draftsDir)) {
    if (!f.endsWith('.json')) continue;
    const rel = `data/profiles/${fac.name}/drafts/${f}`;
    let data;
    try { data = readJson(rel); } catch { continue; }
    // Staging oblici variraju (ruleEntries[], DraftsStagingFile entries[], law-drafts
    // profiles mapa id -> pravila[]), pa walk skuplja SVAKI cvor koji izgleda kao rule
    // entry (checkId + ruleId); vlasnik je prefiks ruleId-a prije "--".
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== 'object') continue;
      const unitId = node.unitId || fac.name;
      if (typeof node.checkId === 'string' && typeof node.ruleId === 'string') {
        const ownerId = node.ruleId.split('--')[0] || rel;
        collectRuleEntries(unitEntry(unitId), ownerId, [node], rel);
        continue; // rule entry je list, nema sto dublje
      }
      if (TEXT_FIELDS.some((f) => node[f] !== undefined)) {
        collectTextHits(unitEntry(unitId), node.id || node.profileId || rel, node);
      }
      for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
    }
  }
}

// 4) Source-registry snapshoti grupirani po fakultetskom direktoriju snapshotPath-a.
for (const s of sources) {
  const m = /^data\/sources\/([^/]+)\//.exec(s.snapshotPath || '');
  if (!m) continue;
  const unitId = m[1];
  if (!units.has(unitId) && !unitNames.has(unitId)) continue; // npr. jos neportan fakultet
  unitEntry(unitId).sources.push({
    id: s.id, kind: s.kind, title: s.title, url: s.url,
    snapshotPath: s.snapshotPath, fetchedAt: s.fetchedAt,
  });
}

// Imena + izbaci unite bez ikakvog signala i bez snapshota.
const out = {};
for (const [unitId, entry] of [...units.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const names = unitNames.get(unitId);
  entry.unitName = names?.unitName || null;
  entry.institutionName = names?.institutionName || null;
  const hasSignal =
    Object.keys(entry.auditFields).length || entry.textHits.length ||
    entry.ruleEntryHits.length || entry.requiredSectionsWithTitlePage.length;
  if (!hasSignal && !entry.sources.length) continue;
  entry.signal = {
    audit: Object.keys(entry.auditFields).length,
    text: entry.textHits.length,
    rules: entry.ruleEntryHits.length,
    requiredSections: entry.requiredSectionsWithTitlePage.length,
    snapshots: entry.sources.length,
  };
  out[unitId] = entry;
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, 'worklist.json');
writeFileSync(outPath, JSON.stringify({ generatedFrom: 'mine-official.mjs', units: out }, null, 2));

const withSignal = Object.values(out).filter((u) => u.signal.audit + u.signal.text + u.signal.rules + u.signal.requiredSections > 0);
console.log(`worklist: ${Object.keys(out).length} unita (${withSignal.length} sa signalom o naslovnici) -> ${outPath}`);
for (const u of withSignal.sort((a, b) => (b.signal.audit + b.signal.text) - (a.signal.audit + a.signal.text)).slice(0, 15)) {
  console.log(`  ${u.unitId}: audit=${u.signal.audit} text=${u.signal.text} rules=${u.signal.rules} reqSec=${u.signal.requiredSections} snapshots=${u.signal.snapshots}`);
}
