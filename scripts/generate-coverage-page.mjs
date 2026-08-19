#!/usr/bin/env node
// scripts/generate-coverage-page.mjs
//
// Build-time generator JAVNE stranice pokrivenosti (VERIFICATION_PIPELINE.md sekcija 9,
// "Javna coverage matrica", planirano ali nikad izgradjeno). Cita SAMO vec-preracunate
// podatke (data/coverage/scored-coverage.json, drift-testiran u tests/coverage-report.test.ts,
// vidi src/verification/coverage-report.ts) i profile/katalog JSON-ove - nema vlastite logike
// bodovanja, pa stranica ne moze reci nesto sto engine vec ne kaze.
//
// Nacelo (isto kao data/profiles/profile-status.json i cijeli "posten 100%" pristup projekta):
// transparentnost pretvara zastarjelo/nepokriveno iz tihog laganja u posten prikaz. Cetiri
// razine, isti prag kao computeCoverageCell (scored/machineCheckable):
//   1. potpuno    - ratio === 1 (sve strojno provjerljivo je bodovano)
//   2. djelomicno - 0 < ratio < 1
//   3. preporuke  - ratio === 0 ali postoji advisory (barem 1 ruleEntry, nista bodovano)
//   4. nepokriveno - profil NEMA nijedan ruleEntry (nije jos usao u Option A tok)
//
// Pokrece se POSLIJE `vite build` (vite prazni dist/), isti obrazac kao generate-legal-pages.mjs.
// Samo JSON ulazi (bez TS/esbuild bundlinga): nema logike vrijedne dijeljenja s klijentom, sve
// je cisti join tri vec postojeca JSON izvora.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from './site-origin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('[generate-coverage-page] dist/ ne postoji; pokreni poslije `vite build`.');
  process.exit(1);
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf-8'));
}

const coverage = readJson('data/coverage/scored-coverage.json');
// Javna TVRDNJA se ne racuna ovdje: prepisuje se iz completion ledgera (P0-4 u
// docs/PLAN_POTPUNA_POKRIVENOST.md). Tier ispod mjeri samo koliko je PRAVILA bodovano; on ne zna
// je li popravak ikad izveden, pa je "potpuno pokriveno" bez ledgera znacilo vise nego sto je
// itko dokazao. tests/coverage-page-claims.test.ts pada ako generator pocne sam sricati tvrdnje.
const ledger = readJson('docs/generated/completion-ledger.json');
const claimByProfileId = new Map();
for (const row of ledger.rows) {
  if (row.profileId == null) continue;
  const prev = claimByProfileId.get(row.profileId);
  // Profil s vise vrsta rada: pokazuje se NAJSLABIJA tvrdnja, jer jaca ne vrijedi za sve.
  if (!prev || row.claim > prev.claim) claimByProfileId.set(row.profileId, row);
}
const verifiedIndex = readJson('data/profiles/verified-profiles-index.json');
const legalDepartments = readJson('data/profiles/legal-departments.json');
const catalog = readJson('data/catalog/zagreb-catalog.json');
const workTypeLabels = readJson('data/work-type-labels.json');

// Legal departments (katedre) nemaju vlastiti unitId u podacima - sve tri su katedre
// unutar Pravnog fakulteta (potvrdjeno njihovim "programs" poljem), pa se ovdje
// eksplicitno pridruzuju "pravo" jedinici. Nema drugog mjesta gdje se ovo tvrdi.
const LEGAL_UNIT_ID = 'pravo';
const allProfiles = [
  ...verifiedIndex,
  ...legalDepartments.map((d) => ({ ...d, unitId: d.unitId || LEGAL_UNIT_ID })),
];

const cellByProfileId = new Map(coverage.cells.map((c) => [c.profileId, c]));

// unitId -> {institutionName, unitName}, gradi se hodanjem po ugnijezdenoj katalog strukturi.
const unitInfo = new Map();
for (const institution of catalog) {
  for (const unit of institution.units ?? []) {
    unitInfo.set(unit.id, { institutionName: institution.name, unitName: unit.name });
  }
}

const TIER = {
  full: { key: 'full', label: 'Sva pravila bodovana', className: 'tier-full' },
  partial: { key: 'partial', label: 'Djelomično pokriveno', className: 'tier-partial' },
  advisory: { key: 'advisory', label: 'Samo preporuke', className: 'tier-advisory' },
  none: { key: 'none', label: 'Nepokriveno', className: 'tier-none' },
};

function tierFor(cell) {
  if (!cell) return TIER.none;
  if (cell.machineCheckable === 0) return cell.advisory > 0 ? TIER.advisory : TIER.none;
  if (cell.ratio >= 1) return TIER.full;
  if (cell.ratio > 0) return TIER.partial;
  return cell.advisory > 0 ? TIER.advisory : TIER.none;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}.`;
}

const rows = allProfiles.map((p) => {
  const cell = cellByProfileId.get(p.id);
  const tier = tierFor(cell);
  const info = unitInfo.get(p.unitId) || { institutionName: 'Nepoznata ustanova', unitName: p.unitId };
  const workTypeText = (p.workTypes ?? []).map((w) => workTypeLabels[w] || w).join(' / ') || '-';
  const programText = (p.programs ?? []).join('; ') || (p.name ?? '');
  return {
    id: p.id,
    institutionName: info.institutionName,
    unitName: info.unitName,
    unitId: p.unitId,
    programText,
    workTypeText,
    tier,
    scored: cell?.scoredMachineCheckable ?? 0,
    machineCheckable: cell?.machineCheckable ?? 0,
    advisory: cell?.advisory ?? 0,
    lastVerified: cell?.lastVerified ?? null,
    claim: claimByProfileId.get(p.id)?.claim ?? null,
    claimLabel: claimByProfileId.get(p.id)?.claimLabel ?? null,
  };
});

// Grupiranje po jedinici (fakultet/odjel/odsjek), ne po krovnoj ustanovi - "Sveuciliste u
// Zagrebu" bi samo bilo jedan div s 60-ak jedinica unutra, manje skenabilno od 133 zasebne grupe.
const byUnit = new Map();
for (const r of rows) {
  const key = r.unitId;
  if (!byUnit.has(key)) byUnit.set(key, { institutionName: r.institutionName, unitName: r.unitName, rows: [] });
  byUnit.get(key).rows.push(r);
}
const unitGroups = [...byUnit.values()].sort((a, b) => {
  const la = `${a.institutionName} ${a.unitName}`;
  const lb = `${b.institutionName} ${b.unitName}`;
  return la.localeCompare(lb, 'hr');
});
for (const g of unitGroups) {
  g.rows.sort((a, b) => a.programText.localeCompare(b.programText, 'hr') || a.workTypeText.localeCompare(b.workTypeText, 'hr'));
}

const totals = { full: 0, partial: 0, advisory: 0, none: 0 };
for (const r of rows) totals[r.tier.key]++;

const PAGE_STYLE = `
  :root {
    color-scheme: dark;
    --desk:#191512; --desk-ink:#EDE7DC; --desk-muted:rgba(237,231,220,.55); --desk-line:rgba(237,231,220,.14);
    --paper:#F7F3E8; --paper-2:#F0EAD9; --paper-ink:#26221B; --paper-muted:#6E6656; --paper-line:#DCD4BF;
    --red:#E4573D; --red-deep:#C4372E;
    --green:#4C9A6A; --amber:#C48A2E; --blue:#4C7FA8; --grey:#8B8375;
    --paper-sh:0 3px 8px rgba(0,0,0,.35),0 22px 60px rgba(0,0,0,.55);
    --font-serif:Georgia,"Times New Roman",serif;
    --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --desk:#DFD8C6; --desk-ink:#26221B; --desk-muted:rgba(38,34,27,.6); --desk-line:rgba(38,34,27,.18);
    --paper:#FDFBF3; --paper-2:#F4EFDF; --red:#C4372E;
    --paper-sh:0 2px 6px rgba(56,46,32,.16),0 18px 44px rgba(56,46,32,.2);
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      color-scheme: light;
      --desk:#DFD8C6; --desk-ink:#26221B; --desk-muted:rgba(38,34,27,.6); --desk-line:rgba(38,34,27,.18);
      --paper:#FDFBF3; --paper-2:#F4EFDF; --red:#C4372E;
      --paper-sh:0 2px 6px rgba(56,46,32,.16),0 18px 44px rgba(56,46,32,.2);
    }
  }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: var(--desk-ink); line-height: 1.55; background: var(--desk); }
  header { max-width: 980px; margin: 2rem auto 0; padding: 0 1.1rem; }
  header a.home { color: var(--desk-ink); text-decoration: none; font-weight: 600; font-size: 0.82rem; font-family: var(--font-mono); letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 1px solid var(--desk-line); padding-bottom: 2px; }
  header a.home:hover { color: var(--red); border-bottom-color: var(--red); }
  main { max-width: 980px; margin: 1.1rem auto; padding: 1.7rem 1.9rem 2.2rem; position: relative; overflow: hidden; background: var(--paper); color: var(--paper-ink); border: 1px solid var(--paper-line); border-radius: 2px; box-shadow: var(--paper-sh); }
  main::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--red-deep); }
  h1 { font-family: var(--font-serif); font-weight: 600; font-size: 1.8rem; margin: 0.2rem 0 0.35rem; letter-spacing: -0.01em; line-height: 1.12; color: var(--paper-ink); }
  .lede { color: var(--paper-muted); font-size: 0.95rem; max-width: 62ch; margin: 0 0 1.1rem; }
  .legal-meta { color: var(--paper-muted); font-family: var(--font-mono); font-size: 0.78rem; letter-spacing: 0.02em; margin: 0.55rem 0 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--paper-line); }
  .summary { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 0 0 1.4rem; }
  .stat { flex: 1 1 130px; padding: 0.65rem 0.8rem; border: 1px solid var(--paper-line); border-radius: 3px; background: var(--paper-2); }
  .stat b { display: block; font-size: 1.35rem; font-family: var(--font-serif); }
  .stat span { font-size: 0.78rem; color: var(--paper-muted); }
  .stat.tier-full { border-left: 3px solid var(--green); }
  .stat.tier-partial { border-left: 3px solid var(--amber); }
  .stat.tier-advisory { border-left: 3px solid var(--blue); }
  .stat.tier-none { border-left: 3px solid var(--grey); }
  .legend { font-size: 0.85rem; color: var(--paper-muted); margin: 0 0 1.6rem; padding: 0.7rem 0.85rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-radius: 3px; }
  .legend dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 0.7rem; margin: 0.4rem 0 0; }
  .legend dt { font-weight: 700; }
  .legend dt.tier-full { color: var(--green); }
  .legend dt.tier-partial { color: var(--amber); }
  .legend dt.tier-advisory { color: var(--blue); }
  .legend dt.tier-none { color: var(--grey); }
  details.unit { border: 1px solid var(--paper-line); border-radius: 3px; margin-bottom: 0.5rem; background: var(--paper); }
  details.unit summary { cursor: pointer; padding: 0.6rem 0.85rem; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  details.unit summary::-webkit-details-marker { display: none; }
  details.unit summary:hover { color: var(--red-deep); }
  details.unit summary .unit-label { font-family: var(--font-serif); font-size: 1.02rem; }
  details.unit summary .unit-inst { font-weight: 400; color: var(--paper-muted); font-size: 0.85rem; }
  details.unit summary .unit-summary { font-family: var(--font-mono); font-size: 0.76rem; color: var(--paper-muted); white-space: nowrap; }
  details.unit[open] summary { border-bottom: 1px solid var(--paper-line); }
  table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  table th, table td { text-align: left; padding: 0.5rem 0.85rem; border-bottom: 1px solid var(--paper-line); vertical-align: top; }
  table th { font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--paper-muted); font-weight: 600; }
  table tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
  .badge.tier-full { background: color-mix(in srgb, var(--green) 18%, transparent); color: var(--green); }
  .badge.tier-partial { background: color-mix(in srgb, var(--amber) 18%, transparent); color: var(--amber); }
  .badge.tier-advisory { background: color-mix(in srgb, var(--blue) 18%, transparent); color: var(--blue); }
  .badge.tier-none { background: color-mix(in srgb, var(--grey) 22%, transparent); color: var(--grey); }
  .ratio-note { display: block; margin-top: 0.15rem; font-size: 0.74rem; color: var(--paper-muted); }
  .claim-note { display: block; margin-top: 0.25rem; font-size: 0.74rem; color: var(--paper-muted); }
  .claim-note b { display: inline-block; min-width: 1.1rem; color: var(--ink); }
  footer { max-width: 980px; margin: 0 auto; padding: 1.3rem 1.1rem 2.4rem; border-top: 1px solid var(--desk-line); font-size: 0.85rem; color: var(--desk-muted); }
  footer a { color: var(--red); text-decoration: none; }
  footer a:hover { text-decoration: underline; }
`;

const legendHtml = `
<div class="legend">
  Pravila po radu dijelimo na <strong>bodovana</strong> (strojno provjerljiva, sljediva do službenog izvora) i <strong>preporuke</strong> (savjet uz izvor, ne utječu na ocjenu). Ova tablica pokazuje udio za svaki profil, ne kvalitetu rada.
  <dl>
    <dt class="tier-full">Sva pravila bodovana</dt><dd>sva strojno provjerljiva pravila su bodovana i verificirana uz izvor.</dd>
    <dt class="tier-partial">Djelomično pokriveno</dt><dd>dio pravila je bodovan, ostatak je savjet (advisory) ili čeka verifikaciju.</dd>
    <dt class="tier-advisory">Samo preporuke</dt><dd>izvor postoji, ali ništa nije dovoljno nedvosmisleno da se boduje - sve je savjet.</dd>
    <dt class="tier-none">Nepokriveno</dt><dd>još nema strukturiranih pravila za ovaj profil (analiza koristi opći profil).</dd>
  </dl>
  <p>Oznaka pokraj svakog profila (<b>A</b> do <b>E</b>) kaže nešto drugo: <strong>što smijemo tvrditi</strong>.
  Bodovana pravila znače da je pravilo pročitano iz službene upute i da ga alat mjeri; ne znače da je
  automatski popravak ikad izveden na dokumentu tog studija. Zato profil može imati sva pravila bodovana
  i istovremeno biti na razini <b>C</b>. Razine se izvode iz jednog izvora
  (<code>docs/generated/completion-ledger.json</code>), pa ova stranica ne može tvrditi više od njega.</p>
</div>`;

const summaryHtml = `
<div class="summary">
  <div class="stat tier-full"><b>${totals.full}</b><span>sva pravila bodovana</span></div>
  <div class="stat tier-partial"><b>${totals.partial}</b><span>djelomično pokriveno</span></div>
  <div class="stat tier-advisory"><b>${totals.advisory}</b><span>samo preporuke</span></div>
  <div class="stat tier-none"><b>${totals.none}</b><span>nepokriveno</span></div>
</div>`;

function unitSummaryText(groupRows) {
  const scoredTiers = groupRows.filter((r) => r.tier.key === 'full').length;
  return `${scoredTiers}/${groupRows.length} sa svim pravilima`;
}

function rowHtml(r) {
  const dateNote = r.tier.key === 'full' || r.tier.key === 'partial'
    ? (r.lastVerified ? `<span class="ratio-note">zadnja provjera ${esc(fmtDate(r.lastVerified))}</span>` : '')
    : '';
  const ratioNote = r.machineCheckable > 0
    ? `<span class="ratio-note">${r.scored}/${r.machineCheckable} bodovano${r.advisory ? `, ${r.advisory} preporuka` : ''}</span>`
    : (r.advisory ? `<span class="ratio-note">${r.advisory} preporuka</span>` : '');
  // Tvrdnja je PREPISANA iz ledgera (row.claimLabel), nikad srocena ovdje.
  const claimNote = r.claimLabel
    ? `<span class="claim-note"><b>${esc(r.claim)}</b> ${esc(r.claimLabel)}</span>`
    : '';
  return `<tr>
    <td>${esc(r.programText)}</td>
    <td>${esc(r.workTypeText)}</td>
    <td><span class="badge ${r.tier.className}">${esc(r.tier.label)}</span>${ratioNote}${dateNote}${claimNote}</td>
  </tr>`;
}

const unitGroupsHtml = unitGroups.map((g) => {
  const instLabel = g.unitName === g.institutionName ? '' : ` <span class="unit-inst">· ${esc(g.institutionName)}</span>`;
  return `<details class="unit">
  <summary><span><span class="unit-label">${esc(g.unitName)}</span>${instLabel}</span><span class="unit-summary">${esc(unitSummaryText(g.rows))}</span></summary>
  <table>
    <thead><tr><th>Program</th><th>Vrsta rada</th><th>Status</th></tr></thead>
    <tbody>${g.rows.map(rowHtml).join('')}</tbody>
  </table>
</details>`;
}).join('\n');

const html = `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pokrivenost profila - Lekta</title>
<meta name="description" content="Koje ustanove i studiji su strojno provjereni prema službenim izvorima, koji su djelomično pokriveni i koji tek čekaju obradu - potpun i ažuran popis.">
<link rel="canonical" href="${SITE_ORIGIN}/pokrivenost.html">
<meta name="robots" content="index,follow">
<style>${PAGE_STYLE}</style>
</head>
<body>
<header><a class="home" href="/">&larr; Lekta</a></header>
<main>
<h1>Pokrivenost profila</h1>
<p class="lede">Za svaku ustanovu i vrstu rada u Lekti: koliko je pravila oblikovanja stvarno provjereno prema službenom izvoru. Ništa se ne boduje bez izvora - ono što nije bodovano ostaje savjet ili čeka obradu, nikad se ne pretpostavlja.</p>
<p class="legal-meta">Ukupno ${rows.length} profila u ${unitGroups.length} ustrojbenih jedinica. Generirano iz živih podataka pri svakom objavljivanju.</p>
${summaryHtml}
${legendHtml}
${unitGroupsHtml}
</main>
<footer>
<p>Ne vidiš svoju ustanovu ili studij kako očekuješ? Puni izvještaj uvijek jasno pokazuje što je od pravila stvarno provjereno. <a href="${SITE_ORIGIN}/alati.html">Svi besplatni alati</a> &middot; <a href="${SITE_ORIGIN}/#analyzer">Provjeri rad</a></p>
</footer>
</body>
</html>
`;

fs.writeFileSync(path.join(DIST, 'pokrivenost.html'), html, 'utf-8');
console.log(`[generate-coverage-page] gotovo: pokrivenost.html (${rows.length} profila, ${unitGroups.length} jedinica; ${totals.full} potpuno / ${totals.partial} djelomicno / ${totals.advisory} preporuke / ${totals.none} nepokriveno).`);
