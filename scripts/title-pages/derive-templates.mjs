/**
 * Derivacija predlozaka naslovnice iz evidence uzoraka (korak C pipeline-a).
 *
 * Cita data/title-pages/evidence/*.json (redigirane prve stranice javnih teza) i
 * data/title-pages/templates.json, pa po (unitId, razina):
 *   - konsenzus: uloga ulazi ako je imaju >= 2 uzorka; redoslijed = medijan yRel;
 *     font/velicina/bold/uppercase/align ulaze samo uz >= 2/3 slaganja;
 *   - merge: postojeci OFFICIAL zapis je baza, konsenzus samo POPUNJAVA rupe
 *     (element-level thesis-consensus); konflikt -> sluzbeno pobjedjuje i
 *     zapisuje se u derivation.conflicts;
 *   - bez officiala -> novi zapis provenance "derived", SVI elementi required:false
 *     (obveznost smije doci samo iz sluzbenog izvora, README sloja).
 *
 * Deterministicki i idempotentan (sortirano, bez timestampova); pise templates.json
 * i azurira TITLE_PAGE_TEMPLATES count u data/manifest.json.
 *
 * Pokretanje: node scripts/title-pages/derive-templates.mjs [--units fpzg,pravo]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_DIR = join(ROOT, 'data', 'title-pages', 'evidence');
const TEMPLATES_PATH = join(ROOT, 'data', 'title-pages', 'templates.json');
const MANIFEST_PATH = join(ROOT, 'data', 'manifest.json');

const unitFilter = (() => {
  const arg = process.argv.find((a) => a.startsWith('--units'));
  if (!arg) return null;
  const value = arg.includes('=') ? arg.split('=')[1] : process.argv[process.argv.indexOf(arg) + 1];
  return value ? new Set(value.split(',')) : null;
})();

const LEVEL_MAP = { zavrsni: 'final', diplomski: 'graduate', doktorski: 'doctoral', specijalisticki: 'specialist' };
/** Uloge koje sudjeluju u rasporedu; unknown se ignorira. */
const LAYOUT_ROLES = new Set(['university', 'faculty', 'study', 'author', 'title', 'subtitle', 'worktype', 'mentor', 'comentor', 'placeyear']);
const CONSENSUS_SHARE = 2 / 3;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** Mod s determinstickim tie-breakom (leksikografski po JSON reprezentaciji). */
function mode(values) {
  const counts = new Map();
  for (const v of values) {
    const key = JSON.stringify(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { value: JSON.parse(best[0]), share: best[1] / values.length };
}

/** Konsenzusni elementi za skup uzoraka (>= 2 uzorka). */
function consensusElements(samples) {
  const byRole = new Map();
  for (const sample of samples) {
    const seen = new Set();
    for (const line of sample.lines) {
      if (!LAYOUT_ROLES.has(line.role) || seen.has(line.role)) continue;
      seen.add(line.role); // po uzorku brojimo ulogu jednom (prva linija uloge nosi geometriju)
      if (!byRole.has(line.role)) byRole.set(line.role, []);
      byRole.get(line.role).push(line);
    }
  }
  const elements = [];
  for (const [role, lines] of byRole) {
    if (lines.length < 2) continue; // premalo za konsenzus
    const el = {
      role,
      required: false,
      elementProvenance: 'thesis-consensus',
      group: 0, // privremeno; dodjela dolje po yRel zonama
      confidence: Number((lines.length / samples.length).toFixed(2)),
      _yRel: median(lines.map((l) => l.yRel)),
    };
    // Tipografija samo bez OCR fallbacka i uz >= 2/3 slaganja.
    const typed = lines.filter((l) => l.font && l.font !== '?');
    if (typed.length >= 2) {
      const font = mode(typed.map((l) => l.font));
      if (font.share >= CONSENSUS_SHARE) el.font = font.value;
      const size = mode(typed.map((l) => Math.round(l.sizePt)));
      if (size.share >= CONSENSUS_SHARE) el.sizePt = size.value;
      const bold = mode(typed.map((l) => l.bold));
      if (bold.share >= CONSENSUS_SHARE && bold.value) el.bold = true;
      const upper = mode(typed.map((l) => l.uppercase));
      if (upper.share >= CONSENSUS_SHARE && upper.value) el.uppercase = true;
      const align = mode(typed.map((l) => l.align));
      if (align.share >= CONSENSUS_SHARE && align.value !== 'center') el.align = align.value;
    }
    elements.push(el);
  }
  elements.sort((a, b) => a._yRel - b._yRel);
  // Generator bez autora nema smisla, a autor pisan verzalom zna promaci klasifikaciji
  // (stopi se s naslovom): ako konsenzus nema author, umetni ga standardno prije naslova.
  if (!elements.some((e) => e.role === 'author')) {
    const titleIdx = elements.findIndex((e) => e.role === 'title');
    if (titleIdx >= 0) {
      elements.splice(titleIdx, 0, {
        role: 'author',
        required: false,
        elementProvenance: 'thesis-consensus',
        group: 0,
        _yRel: elements[titleIdx]._yRel - 0.001,
      });
    }
  }
  // Zone: vrh / sredina / mentorski blok / dno, monotono jer je sortirano po yRel.
  for (const el of elements) {
    el.group = el._yRel < 0.3 ? 0 : el._yRel < 0.55 ? 1 : el._yRel < 0.78 ? 2 : 3;
  }
  // Normaliziraj da grupe krecu od 0 bez rupa (npr. [1,3] -> [0,1]).
  const groups = [...new Set(elements.map((e) => e.group))].sort((a, b) => a - b);
  for (const el of elements) el.group = groups.indexOf(el.group);
  for (const el of elements) delete el._yRel;
  return elements;
}

/** Popuni rupe official zapisa konsenzusom; konflikti se samo biljeze. */
function mergeIntoOfficial(official, consensus, pids) {
  const conflicts = [];
  const byRole = new Map(consensus.map((e) => [e.role, e]));
  for (const el of official.elements) {
    const c = byRole.get(el.role);
    if (!c) continue;
    for (const attr of ['font', 'sizePt', 'bold', 'uppercase', 'align']) {
      if (c[attr] === undefined) continue;
      if (el[attr] === undefined) {
        el[attr] = c[attr];
        el.elementProvenance = el.elementProvenance || 'official-rules';
      } else if (JSON.stringify(el[attr]) !== JSON.stringify(c[attr])) {
        conflicts.push(`${el.role}.${attr}: sluzbeno ${JSON.stringify(el[attr])} vs teze ${JSON.stringify(c[attr])}`);
      }
    }
  }
  // Uloge koje official ne spominje, a teze ih dosljedno imaju: dodaj po redoslijedu
  // konsenzusa, umetnuto iza najblizeg zajednickog prethodnika.
  const officialRoles = new Set(official.elements.map((e) => e.role));
  const consensusOrder = consensus.map((e) => e.role);
  for (const c of consensus) {
    if (officialRoles.has(c.role)) continue;
    const prevShared = consensusOrder
      .slice(0, consensusOrder.indexOf(c.role))
      .reverse()
      .find((r) => officialRoles.has(r));
    const insertAt = prevShared
      ? official.elements.findIndex((e) => e.role === prevShared) + 1
      : 0;
    const el = { ...c, group: official.elements[Math.max(0, insertAt - 1)]?.group ?? 0 };
    official.elements.splice(insertAt, 0, el);
    officialRoles.add(c.role);
  }
  official.provenance.evidencePids = [...new Set([...(official.provenance.evidencePids || []), ...pids])].sort();
  official.derivation = { samples: pids.length, conflicts };
  return official;
}

// --- main ---

const templates = JSON.parse(readFileSync(TEMPLATES_PATH, 'utf8'));
const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'catalog', 'zagreb-catalog.json'), 'utf8'));
const workTypeLabels = JSON.parse(readFileSync(join(ROOT, 'data', 'work-type-labels.json'), 'utf8'));
const unitNames = new Map();
for (const inst of catalog) for (const u of inst.units) unitNames.set(u.id, u.name);
const evidenceFiles = existsSync(EVIDENCE_DIR)
  ? readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith('.json')).sort()
  : [];

let derivedNew = 0;
let corroborated = 0;

for (const file of evidenceFiles) {
  const ev = JSON.parse(readFileSync(join(EVIDENCE_DIR, file), 'utf8'));
  if (unitFilter && !unitFilter.has(ev.unitId)) continue;

  // Grupe po razini; uzorci sa sumnjivom razinom (marker eksplicitno false) se preskacu.
  const byLevel = new Map();
  for (const s of ev.samples) {
    if (s.ocrFallback || s.levelMarkerMatch === false) continue;
    const level = LEVEL_MAP[s.level] ?? null;
    if (!level) continue;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(s);
  }

  let producedForUnit = 0;
  for (const [level, samples] of [...byLevel.entries()].sort()) {
    if (samples.length < 2) continue;
    const consensus = consensusElements(samples);
    if (!consensus.length) continue;
    const pids = samples.map((s) => s.pid).sort();

    const official = templates.find(
      (t) => t.unitId === ev.unitId && (t.level === level || t.level === null) && t.provenance.status === 'official',
    );
    if (official) {
      mergeIntoOfficial(official, consensus, pids);
      corroborated++;
      continue;
    }
    const existingDerived = templates.findIndex(
      (t) => t.unitId === ev.unitId && t.level === level && t.provenance.status === 'derived',
    );
    const entry = {
      id: `${ev.unitId}-${level}`,
      unitId: ev.unitId,
      level,
      name: `${unitNames.get(ev.unitId) || ev.unitId}: ${(workTypeLabels[level] || level).toLowerCase()}`,
      provenance: {
        status: 'derived',
        sourceNote: `Raspored izveden konsenzusom ${samples.length} javnih radova; nije sluzbeni predlozak.`,
        evidencePids: pids,
        verifiedAt: null,
      },
      status: 'draft',
      elements: consensus,
      derivation: { samples: samples.length, conflicts: [] },
    };
    if (existingDerived >= 0) templates[existingDerived] = entry;
    else templates.push(entry);
    derivedNew++;
    producedForUnit++;
  }

  // Fallback za male fakultete/veleucilista s malo teza koje se dijele preko razina
  // (jedan format naslovnice za sve vrste rada): ako nijedna razina nije dala predlozak,
  // unit nema NIJEDAN postojeci predlozak, a ukupno ima >= 2 iskoristiva uzorka, deriviraj
  // level=null iz svih. Redak vrste rada se ionako slaze iz korisnikova odabira. Posteno
  // "izveden iz javnih radova" (draft); required nikad ne dolazi iz teza.
  if (producedForUnit === 0) {
    const allUsable = [...byLevel.values()].flat();
    const hasExisting = templates.some((t) => t.unitId === ev.unitId);
    if (!hasExisting && allUsable.length >= 2) {
      const consensus = consensusElements(allUsable);
      if (consensus.length) {
        const pids = allUsable.map((s) => s.pid).sort();
        templates.push({
          id: `${ev.unitId}`,
          unitId: ev.unitId,
          level: null,
          name: `${unitNames.get(ev.unitId) || ev.unitId}: naslovnica`,
          provenance: {
            status: 'derived',
            sourceNote: `Raspored izveden konsenzusom ${allUsable.length} javnih radova (sve vrste rada); nije sluzbeni predlozak.`,
            evidencePids: pids,
            verifiedAt: null,
          },
          status: 'draft',
          elements: consensus,
          derivation: { samples: allUsable.length, conflicts: [] },
        });
        derivedNew++;
      }
    }
  }
}

templates.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const row = manifest.find((m) => m.name === 'TITLE_PAGE_TEMPLATES');
if (row) row.entries = templates.length;
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

console.log(`derivacija: ${derivedNew} novih derived zapisa, ${corroborated} official zapisa koroborirano; ukupno ${templates.length} predlozaka`);
