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
import { CONSENSUS_SHARE, mode, voteAttr, groupFirstLineByRole, roleConventions } from './consensus-lib.mjs';

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

// Uniti kojima se svjesno derivira JEDAN level=null predlozak iz SVIH ne-OCR uzoraka
// (jednoformatni fakulteti/veleucilista gdje razina nije bitna, pa se ignorira
// levelMarkerMatch). Koristi se samo za konsistencijom potvrdjene unite (workflow analiza).
const mergeNullUnits = (() => {
  const arg = process.argv.find((a) => a.startsWith('--merge-null-units'));
  if (!arg) return new Set();
  const value = arg.includes('=') ? arg.split('=')[1] : process.argv[process.argv.indexOf(arg) + 1];
  return value ? new Set(value.split(',')) : new Set();
})();

// --derived-only: regeneriraj/kreiraj samo DERIVED predloske; nikad ne diraj sluzbene
// (preskoci mergeIntoOfficial). Za sigurnu ponovnu derivaciju uz ocuvane official zapise.
const derivedOnly = process.argv.includes('--derived-only');

const LEVEL_MAP = { zavrsni: 'final', diplomski: 'graduate', doktorski: 'doctoral', specijalisticki: 'specialist' };

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Konsenzusni elementi za skup uzoraka (>= 2 uzorka). Raspored te font/velicina/verzal/
 * poravnanje racunaju se na PROSLIJEDJENIM (po razini) uzorcima (legitimno se razlikuju po
 * razini). Bold je UNIJA: postavlja se ako ga podrzi razina (per-level glas, neovisno o
 * fontu) ILI konvencija cijelog fakulteta (roleConventions). Tako se ne gubi bold koji
 * fakultet u pravilu koristi (tanak podskup po razini), a ni bold koji je stvar razine
 * (npr. doktorski boldira naslov, diplomski ne) kad faculty-wide vote padne ispod praga.
 * Kljucevi se dodaju kanonskim redoslijedom: font, sizePt, bold, uppercase, align.
 */
function consensusElements(samples, conventions) {
  const byRole = groupFirstLineByRole(samples);
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
    // Font/velicina/verzal/poravnanje po razini uz prepoznat font (kao i dosad).
    const typed = lines.filter((l) => l.font && l.font !== '?');
    let fontVal, sizeVal, upperVal, alignVal;
    if (typed.length >= 2) {
      const f = mode(typed.map((l) => l.font));
      if (f.share >= CONSENSUS_SHARE) fontVal = f.value;
      const s = mode(typed.map((l) => Math.round(l.sizePt)));
      if (s.share >= CONSENSUS_SHARE) sizeVal = s.value;
      const u = mode(typed.map((l) => l.uppercase));
      if (u.share >= CONSENSUS_SHARE && u.value) upperVal = true;
      const a = mode(typed.map((l) => l.align));
      if (a.share >= CONSENSUS_SHARE && a.value !== 'center') alignVal = a.value;
    }
    // Bold = razina ILI konvencija fakulteta; ostalo po razini. Kanonski redoslijed kljuceva.
    const boldByLevel = voteAttr(lines, (l) => !!l.bold) === true;
    if (fontVal) el.font = fontVal;
    if (sizeVal !== undefined) el.sizePt = sizeVal;
    if (boldByLevel || conventions.get(role)?.bold) el.bold = true;
    if (upperVal) el.uppercase = true;
    if (alignVal) el.align = alignVal;
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

  // Konvencije (bold/uppercase) glasaju se jednom, na svim ne-OCR uzorcima jedinice
  // (stil fakulteta, ne razine); raspored, font i velicina ostaju po razini nize.
  const unitConv = roleConventions(ev.samples.filter((s) => !s.ocrFallback));

  // Eksplicitni level=null merge (jednoformatni unit, razina nebitna): svi ne-OCR uzorci.
  if (mergeNullUnits.has(ev.unitId)) {
    const samples = ev.samples.filter((s) => !s.ocrFallback);
    const hasExisting = templates.some((t) => t.unitId === ev.unitId);
    if (!hasExisting && samples.length >= 2) {
      const consensus = consensusElements(samples, unitConv);
      if (consensus.length) {
        const pids = samples.map((s) => s.pid).sort();
        templates.push({
          id: `${ev.unitId}`,
          unitId: ev.unitId,
          level: null,
          name: `${unitNames.get(ev.unitId) || ev.unitId}: naslovnica`,
          provenance: {
            status: 'derived',
            sourceNote: `Raspored izveden konsenzusom ${samples.length} javnih radova; nije sluzbeni predlozak.`,
            evidencePids: pids,
            verifiedAt: null,
          },
          status: 'draft',
          elements: consensus,
          derivation: { samples: samples.length, conflicts: [] },
        });
        derivedNew++;
      }
    }
    continue;
  }

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
    const consensus = consensusElements(samples, unitConv);
    if (!consensus.length) continue;
    const pids = samples.map((s) => s.pid).sort();

    const official = templates.find(
      (t) => t.unitId === ev.unitId && (t.level === level || t.level === null) && t.provenance.status === 'official',
    );
    if (official) {
      // --derived-only: ne diraj sluzbene predloske (ne popunjavaj njihove rupe iz teza).
      if (derivedOnly) continue;
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
      const consensus = consensusElements(allUsable, unitConv);
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
