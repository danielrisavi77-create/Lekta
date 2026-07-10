/**
 * Merge official draftova naslovnice iz workflow journala u templates.json.
 *
 * Ulaz: journal.jsonl workflow runa (result zapisi sa {templates, skippedReason})
 * Pravila:
 *   - official zapis ima prednost: za isti (unitId, level) derived se BRISE
 *     (official s level null brise sve derived tog unita; korpus teza ce ga
 *     ponovno koroborirati kroz derive-templates mergeIntoOfficial);
 *   - sanitizacija: samo dopustena polja, group monotono ne-padajuci,
 *     required=true samo uz official-* elementProvenance;
 *   - validacija: unitId mora postojati u katalogu, sourceIds u source-registry;
 *     prekrsitelji se preskacu uz log (gate test tests/title-page-loader.test.ts
 *     je zadnja linija obrane).
 *
 * Pokretanje: node scripts/title-pages/merge-official-drafts.mjs <journal.jsonl>
 * Idempotentno (merge po id-u/selektoru, sortirano); azurira manifest count.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATES_PATH = join(ROOT, 'data', 'title-pages', 'templates.json');
const MANIFEST_PATH = join(ROOT, 'data', 'manifest.json');

const journalPath = process.argv[2];
if (!journalPath) {
  console.error('Uporaba: node scripts/title-pages/merge-official-drafts.mjs <journal.jsonl>');
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'catalog', 'zagreb-catalog.json'), 'utf8'));
const unitIds = new Set(catalog.flatMap((i) => i.units.map((u) => u.id)));
const sourceIds = new Set(
  JSON.parse(readFileSync(join(ROOT, 'data', 'sources', 'source-registry.json'), 'utf8')).map((s) => s.id),
);

// Rucno iskljuceni official draftovi: adu-graduate dolazi iz pravilnika Odsjeka MONTAZE
// i ne smije se prikazivati kao sluzbeni predlozak cijele akademije dok predlosci ne
// dobiju program-dimenziju (v1 je unit+level granularnost). Izvor ostaje registriran.
const EXCLUDED_IDS = new Set(['adu-graduate']);

const ROLES = new Set(['university', 'faculty', 'study', 'author', 'title', 'subtitle', 'worktype', 'mentor', 'comentor', 'placeyear']);
const LEVELS = new Set(['seminar', 'final', 'graduate', 'specialist', 'doctoral', 'article', 'project']);

function sanitizeElement(el) {
  const out = {
    role: el.role,
    required: !!el.required,
    elementProvenance: el.elementProvenance,
    group: Number.isInteger(el.group) ? el.group : 0,
  };
  if (out.required && out.elementProvenance !== 'official-template' && out.elementProvenance !== 'official-rules') {
    out.required = false;
  }
  for (const key of ['label', 'fixedText', 'font']) if (typeof el[key] === 'string' && el[key]) out[key] = el[key];
  if (typeof el.sizePt === 'number' && el.sizePt > 0) out.sizePt = el.sizePt;
  for (const key of ['bold', 'italic', 'uppercase']) if (el[key] === true) out[key] = true;
  if (el.align === 'left' || el.align === 'right' || el.align === 'center') out.align = el.align;
  return out;
}

function sanitizeTemplate(t) {
  const problems = [];
  if (!unitIds.has(t.unitId)) problems.push(`unitId "${t.unitId}" nije u katalogu`);
  if (t.level !== null && !LEVELS.has(t.level)) problems.push(`nepoznata razina "${t.level}"`);
  const ids = (t.provenance?.sourceIds || []).filter(Boolean);
  const badSources = ids.filter((s) => !sourceIds.has(s));
  if (!ids.length) problems.push('official bez sourceIds');
  if (badSources.length) problems.push(`sourceIds izvan registra: ${badSources.join(', ')}`);
  const badRoles = (t.elements || []).filter((e) => !ROLES.has(e.role)).map((e) => e.role);
  if (badRoles.length) problems.push(`nepoznate uloge: ${badRoles.join(', ')}`);
  if (!(t.elements || []).length) problems.push('elements prazan');
  if (problems.length) return { template: null, problems };

  const provenance = {
    status: 'official',
    sourceIds: ids,
  };
  for (const key of ['sourceUrl', 'sourceNote']) if (typeof t.provenance[key] === 'string' && t.provenance[key]) provenance[key] = t.provenance[key];
  provenance.quote = typeof t.provenance.quote === 'string' ? t.provenance.quote : null;
  provenance.sourcePage = Number.isInteger(t.provenance.sourcePage) ? t.provenance.sourcePage : null;
  provenance.verifiedAt = null;

  const elements = (t.elements || []).map(sanitizeElement);
  let prev = 0;
  for (const el of elements) {
    if (el.group < prev) el.group = prev;
    prev = el.group;
  }

  const out = {
    id: String(t.id),
    unitId: t.unitId,
    level: t.level,
    name: String(t.name || t.id),
    provenance,
    status: 'draft',
    elements,
  };
  if (t.marginsCm && ['top', 'right', 'bottom', 'left'].every((k) => typeof t.marginsCm[k] === 'number')) {
    out.marginsCm = t.marginsCm;
  }
  if (typeof t.defaultFont === 'string' && t.defaultFont) out.defaultFont = t.defaultFont;
  if (typeof t.notes === 'string' && t.notes) out.notes = t.notes;
  return { template: out, problems: [] };
}

const lines = readFileSync(journalPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const incoming = [];
let skippedUnits = 0;
for (const line of lines) {
  if (line.type !== 'result' || !line.result) continue;
  const r = line.result;
  if (!Array.isArray(r.templates) || !r.templates.length) { skippedUnits++; continue; }
  incoming.push(...r.templates);
}

const templates = JSON.parse(readFileSync(TEMPLATES_PATH, 'utf8'));
let added = 0;
let replacedDerived = 0;
let rejected = 0;

for (const raw of incoming) {
  if (EXCLUDED_IDS.has(raw.id)) {
    console.warn(`PRESKOCENO ${raw.id}: na popisu rucnih iskljucenja (vidi komentar uz EXCLUDED_IDS)`);
    continue;
  }
  const { template, problems } = sanitizeTemplate(raw);
  if (!template) {
    rejected++;
    console.warn(`ODBACENO ${raw.id || raw.unitId}: ${problems.join('; ')}`);
    continue;
  }
  // Ocisti derived koje official pokriva (isti unit+level; level null pokriva sve).
  for (let i = templates.length - 1; i >= 0; i--) {
    const t = templates[i];
    if (t.unitId !== template.unitId || t.provenance.status !== 'derived') continue;
    if (template.level === null || t.level === template.level) {
      templates.splice(i, 1);
      replacedDerived++;
    }
  }
  // Idempotentnost: postojeci official istog id-a ili selektora se zamjenjuje.
  const existing = templates.findIndex(
    (t) => t.id === template.id || (t.unitId === template.unitId && t.level === template.level),
  );
  if (existing >= 0) templates[existing] = template;
  else templates.push(template);
  added++;
}

templates.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const row = manifest.find((m) => m.name === 'TITLE_PAGE_TEMPLATES');
if (row) row.entries = templates.length;
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(`merge: ${added} official zapisa (odbaceno ${rejected}, derived zamijenjeno ${replacedDerived}, unita bez predloska ${skippedUnits}); ukupno ${templates.length}`);
