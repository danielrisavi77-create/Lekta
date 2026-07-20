#!/usr/bin/env node
/**
 * K1b: izvoz bibliografskih metapodataka iz lekta-pipeline/korpus.db u CSV spreman za Postgres
 * `\copy` u tablicu corpus_works (migracija 0030_corpus_works.sql).
 *
 * NAMJERNO NE PISE U PRODUKCIJU. Skripta je cisto lokalna i bez mreze: proizvede CSV, a stvarno
 * punjenje baze je dokumentiran korak go-livea. Time se drzi istog nacela kao WS-1..WS-7 (sve se
 * gradi inertno, pali se tek svjesnim flipom).
 *
 * Uzima SAMO tablicu `works` (~122 MB). `fingerprints` (4,5 M redaka) i `corpus_fts` sluze
 * slicnosti punog teksta i ovoj znacajki ne trebaju.
 *
 * Koristi ugradjeni node:sqlite (Node >= 22.5), pa nema nove ovisnosti.
 *
 * Uporaba:
 *   node scripts/import-corpus.mjs [--db putanja] [--out putanja] [--limit N]
 *
 * Zatim (korak go-livea, vidi docs/GO_LIVE_REPAIR.md):
 *   \copy corpus_works (doc_id,source_id,title,title_norm,authors,year,institution,url,repo,kind)
 *     from 'corpus_works.csv' with (format csv, null '')
 */
import { DatabaseSync } from 'node:sqlite';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DB_PATH = resolve(arg('db', join(repo, 'lekta-pipeline', 'korpus.db')));
const OUT_PATH = resolve(arg('out', join(dirname(DB_PATH), 'corpus_works.csv')));
const LIMIT = Number(arg('limit', '0')) || 0;

/**
 * ISTA logika kao normalize() u src/utils/helpers.ts (NFD, bez dijakritike, lowercase, samo [a-z0-9]).
 * Mora ostati identicna jer se isti oblik racuna u pregledniku pri bodovanju kandidata; razlika bi
 * znacila da server i klijent gledaju razlicite nizove.
 */
const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** CSV polje po Postgres `format csv` pravilima: navodnici se udvostrucuju, null je prazno polje. */
function csv(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  console.log(`korpus: ${DB_PATH}`);
  const db = new DatabaseSync(DB_PATH, { readOnly: true });

  const total = db.prepare('select count(*) c from works').get().c;
  console.log(`works: ${total.toLocaleString('hr-HR')} redaka`);

  const out = createWriteStream(OUT_PATH, { encoding: 'utf8' });
  const write = async (chunk) => {
    if (!out.write(chunk)) await once(out, 'drain');
  };

  const sql =
    'select doc_id, source_id, title, authors, year, institution, url, repo, kind from works' +
    (LIMIT ? ` limit ${LIMIT}` : '');

  let written = 0;
  let skipped = 0;
  let buf = '';
  for (const r of db.prepare(sql).iterate()) {
    const titleNorm = normalize(r.title);
    // Bez naslova ili bez normaliziranog oblika red je nekoristan: nikad se ne moze podudariti s
    // referencom, a title/title_norm su NOT NULL u shemi. Preskoci ga umjesto da srusis uvoz.
    if (!titleNorm) { skipped++; continue; }
    buf += [
      csv(r.doc_id), csv(r.source_id), csv(r.title), csv(titleNorm), csv(r.authors),
      csv(r.year), csv(r.institution), csv(r.url), csv(r.repo), csv(r.kind),
    ].join(',') + '\n';
    written++;
    if (buf.length > 1 << 20) { await write(buf); buf = ''; }
    if (written % 100000 === 0) console.log(`  ...${written.toLocaleString('hr-HR')}`);
  }
  if (buf) await write(buf);
  out.end();
  await once(out, 'finish');

  // Provenijencija snimke: prenesi corpus_meta iz SQLitea ako postoji, plus izmjereni broj redaka.
  let meta = [];
  try {
    meta = db.prepare('select key, value from corpus_meta').all();
  } catch { /* starije snimke nemaju corpus_meta; nije greska */ }
  const metaPath = OUT_PATH.replace(/\.csv$/, '_meta.sql');
  const metaSql = [
    '-- Provenijencija korpusne snimke (uz 0030_corpus_works.sql).',
    ...meta.map((m) => `insert into corpus_meta (key, value) values (${lit(m.key)}, ${lit(m.value)})\n  on conflict (key) do update set value = excluded.value, updated_at = now();`),
    `insert into corpus_meta (key, value) values ('works_imported', '${written}')\n  on conflict (key) do update set value = excluded.value, updated_at = now();`,
    '',
  ].join('\n');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(metaPath, metaSql, 'utf8');

  db.close();

  const { statSync } = await import('node:fs');
  const mb = statSync(OUT_PATH).size / 1048576;
  console.log(`\ngotovo: ${written.toLocaleString('hr-HR')} redaka, preskoceno ${skipped}`);
  console.log(`CSV: ${OUT_PATH} (${mb.toFixed(1)} MB)`);
  console.log(`meta: ${metaPath}`);
  console.log('\nCSV NE COMMITAJ. Punjenje baze je korak go-livea:');
  console.log("  \\copy corpus_works (doc_id,source_id,title,title_norm,authors,year,institution,url,repo,kind)");
  console.log(`    from '${OUT_PATH}' with (format csv, null '')`);
}

/** SQL literal s jednostrukim navodnicima (udvostruceni), za sitne meta vrijednosti. */
function lit(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

main().catch((e) => { console.error(e); process.exit(1); });
