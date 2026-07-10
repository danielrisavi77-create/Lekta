#!/usr/bin/env node
// scripts/approve-citation-spec.mjs
//
// LJUDSKI approve citatnog speca (uzor: approve-profile.mjs). Pokrece ga COVJEK nakon
// pregleda dosjea (data/verification/citation-dossiers/<fac>.md). AI ovo NE pokrece.
//
//   node scripts/approve-citation-spec.mjs <facultyId> "<Ime Prezime>" [--flag t1,t2] [--dry]
//
// Radi: drafts/<fac>.json -> verified/<fac>.json uz status:"verified", verifiedBy/At,
// verifiedHash = snapshotHash izvora (drift sidro); --flag <sourceTypes> ostavlja pojedine
// predloske u needs-recheck (spec i dalje NE izlazi u build dok je ijedan flagiran);
// append u data/verification/ledger.json (jedan zapis po sourceType, human-verified);
// DUAL-WRITE: dokaz ide i kao citation-style ruleEntry potvrda u ledger (profil vec nosi
// token; ovime je token potkrijepljen citatom + stranicom iz sluzbenog izvora).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'data/tools/citation-specs/drafts');
const VERIFIED_DIR = path.join(ROOT, 'data/tools/citation-specs/verified');
const LEDGER_PATH = path.join(ROOT, 'data/verification/ledger.json');
const REGISTRY_PATH = path.join(ROOT, 'data/sources/source-registry.json');

function today() {
  // Namjerno datum iz sata stroja: ovo pokrece covjek, zapis je trenutak njegove odluke.
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const [fac, approver, ...rest] = process.argv.slice(2);
  if (!fac || !approver) {
    console.error('Upotreba: node scripts/approve-citation-spec.mjs <facultyId> "<Ime Prezime>" [--flag t1,t2] [--dry]');
    process.exit(1);
  }
  const dry = rest.includes('--dry');
  const flagIdx = rest.indexOf('--flag');
  const flagged = flagIdx >= 0 ? String(rest[flagIdx + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [];

  const draftPath = path.join(DRAFTS_DIR, `${fac}.json`);
  if (!fs.existsSync(draftPath)) {
    console.error(`[approve] Nema drafta: ${draftPath}`);
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(draftPath, 'utf-8'));
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  const src = registry.find((s) => s.id === spec.sourceId);
  if (!src || !src.snapshotHash) {
    console.error(`[approve] Izvor ${spec.sourceId} nije snapshotiran u registryju; verified spec bez hash sidra nije dopusten.`);
    process.exit(1);
  }

  const date = today();
  spec.status = flagged.length ? 'needs-recheck' : 'verified';
  spec.verifiedAt = date;
  spec.verifiedBy = approver;
  spec.verifiedHash = src.snapshotHash;
  for (const st of spec.sourceTypes ?? []) {
    st.recheck = flagged.includes(st.type) ? true : undefined;
  }

  const ledgerEntries = [];
  for (const st of spec.sourceTypes ?? []) {
    const isFlagged = flagged.includes(st.type);
    ledgerEntries.push({
      id: `led-citation-spec--${fac}--${st.type}-${isFlagged ? 'rechecked' : 'human-verified'}-${date}`,
      ruleId: `citation-spec--${fac}--${st.type}`,
      profileId: fac,
      action: isFlagged ? 'rechecked' : 'human-verified',
      actor: approver,
      timestamp: date,
      sourceId: spec.sourceId,
      sourcePage: st.provenance?.sourcePage ?? null,
      quote: st.provenance?.quoteRaw ?? null,
      note: isFlagged
        ? `Citatni spec predlozak (${st.type}) flagiran za doradu pri ljudskom pregledu dosjea.`
        : `Ljudski pregled dosjea: renderer reproducira ${st.provenance?.kind ?? '?'} za ${st.type} (${spec.styleToken}).`,
    });
  }
  // dual-write potvrda tokena: citation-style dokaz na razini fakulteta.
  // Za style-pin dokaz je spec.evidence (pin nema sourceTypes predloske).
  const tokenProv = spec.outcome === 'style-pin' ? spec.evidence : spec.sourceTypes?.[0]?.provenance;
  ledgerEntries.push({
    id: `led-citation-style--${fac}--token-human-verified-${date}`,
    ruleId: `citation-style--${fac}--${spec.styleToken}`,
    profileId: fac,
    action: 'human-verified',
    actor: approver,
    timestamp: date,
    sourceId: spec.sourceId,
    sourcePage: tokenProv?.sourcePage ?? null,
    quote: tokenProv?.quoteRaw ?? null,
    note: spec.outcome === 'style-pin'
      ? `Style-pin: sluzbeni izvor PROPISUJE stil ${spec.styleToken} za ${fac}; format ostaje obiteljski motor, dokaz podupire rules.recommendedCitation.`
      : `Potvrda citatnog stila (${spec.styleToken}) za ${fac} iz sluzbenog izvora; podupire rules.recommendedCitation u profilima.`,
  });

  if (dry) {
    console.log(`[approve --dry] ${fac}: status -> ${spec.status}, verifiedHash ${src.snapshotHash.slice(0, 12)}..., ledger +${ledgerEntries.length}`);
    if (flagged.length) console.log(`[approve --dry] flagirano: ${flagged.join(', ')}`);
    return;
  }

  fs.mkdirSync(VERIFIED_DIR, { recursive: true });
  fs.writeFileSync(path.join(VERIFIED_DIR, `${fac}.json`), JSON.stringify(spec, null, 2) + '\n', 'utf-8');
  fs.unlinkSync(draftPath);

  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
  const known = new Set(ledger.map((e) => e.id));
  let added = 0;
  for (const e of ledgerEntries) if (!known.has(e.id)) { ledger.push(e); added++; }
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf-8');

  console.log(`[approve] ${fac}: ${spec.status} (${approver}, ${date}); verified/${fac}.json zapisan, draft uklonjen, ledger +${added}.`);
  if (spec.status === 'needs-recheck') {
    console.log(`[approve] PAZNJA: flagirani predlosci (${flagged.join(', ')}) drze spec IZVAN builda dok se ne rijese.`);
  }
  console.log('[approve] Pokreni: npm run generate-citation-tools (ili pusti Netlify build) da stranice povuku spec.');
}

main();
