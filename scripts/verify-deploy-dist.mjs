#!/usr/bin/env node
// scripts/verify-deploy-dist.mjs
//
// Fail-fast provjera DEPLOY artefakta (dist/) PRIJE objave; wirano kao zadnji korak
// netlify.toml command lanca. Deploy ne moze proci ako: dev alati (setup modal, QA
// konzola) procure u HTML ili JS bundle, pravne stranice fale, ili je interna
// verifikacijska konzola zavrsila u distu. Bolje pasti na buildu nego objaviti rupu.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const fail = (msg) => { console.error(`[verify-deploy-dist] FAIL: ${msg}`); process.exit(1); };

if (!fs.existsSync(DIST)) fail('dist/ ne postoji');

// 1. index.html bez dev alata
const index = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
for (const banned of ['setupModal', 'qaModal', 'qaBtn', 'Produkcijska konfiguracija', 'QA konzola']) {
  if (index.includes(banned)) fail(`dist/index.html sadrzi "${banned}" (dev-only strip nije odradio)`);
}

// 2. JS bundle bez setup/QA koda (tree-shake pod __DEV_TOOLS__=false)
const assets = fs.existsSync(path.join(DIST, 'assets'))
  ? fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
  : [];
if (!assets.length) fail('dist/assets nema JS datoteka');
for (const f of assets) {
  const js = fs.readFileSync(path.join(DIST, 'assets', f), 'utf8');
  for (const banned of ['setupModal', 'qaModal', 'Produkcijska konfiguracija', 'downloadManifest', 'setupReportToken']) {
    if (js.includes(banned)) fail(`dist/assets/${f} sadrzi "${banned}" (JS nije tree-shakean)`);
  }
}

// 3. pravne stranice postoje i sadrze ocekivane markere
const legalChecks = [
  ['privatnost.html', 'AZOP'],
  ['garancija.html', '5 radnih dana'],
  ['obrada-dokumenata.html', 'Lokalna analiza'],
  ['kolacici.html', 'localStorage'],
  ['uvjeti-koristenja.html', 'Predmet usluge'],
  ['pravila-povrata.html', 'Merchant of Record'],
  ['odricanje-od-odgovornosti.html', 'heuristička'],
];
for (const [file, marker] of legalChecks) {
  const p = path.join(DIST, file);
  if (!fs.existsSync(p)) fail(`dist/${file} ne postoji (generate-legal-pages nije prosao?)`);
  if (!fs.readFileSync(p, 'utf8').includes(marker)) fail(`dist/${file} ne sadrzi "${marker}"`);
}

// 4. interna verifikacijska konzola ne smije u javni build (postojeca DEPLOY invarijanta)
if (fs.existsSync(path.join(DIST, 'verification.html'))) fail('dist/verification.html postoji u DEPLOY buildu');

console.log('[verify-deploy-dist] OK: bez dev alata u HTML/JS, pravne stranice prisutne, konzola iskljucena.');
