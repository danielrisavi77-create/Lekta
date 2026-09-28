/**
 * T26 / PR #184: mjerenje structure.heading.word-styles (i svih ostalih provjera) nad stvarnim korpusom.
 * Samo cita. Radi u dva koraka nad ISTIM korpusom, jednom sa stablom mastera i jednom sa stablom PR-a:
 *
 *   npm run measure:false-findings -- snap --src . --dir <korpus> --out <snap.json>
 *   npm run measure:false-findings -- diff <prije.json> <poslije.json>
 *
 * Svaku snimku pokreni iz njezina stabla (--src .), da se ovisnosti razrjesavaju iz tog stabla.
 *
 * snap: za svaki <korpus>/*.docx analizira rad (profil iz sidecara <ime>.json ako ga ima, inace null)
 *       i zapisuje sve provjere. JSON sadrzi tekst kandidata (issue.detail), pa ostaje LOKALNO.
 * diff: ispisuje SAMO brojeve, id-eve dokumenata, id-eve provjera i indekse odlomaka, nikad tekst.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WS = 'structure.heading.word-styles';
const [cmd, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
const opt = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };

interface Snap { documentId: string; profileId: string | null; error?: string; checks: Record<string, { status: string; earned: number; max: number; detail: string; issueDetail: string }> }

async function snap() {
  const src = resolve(opt('--src') ?? '.'), dir = resolve(opt('--dir') ?? ''), out = opt('--out');
  if (!out || !opt('--dir')) throw new Error('snap trazi --src, --dir i --out');
  (await import(join(src, 'src/docx/xml-dom-install.ts'))).installXmlDomParser();
  const { analyzeFixture } = await import(join(src, 'src/analysis/golden-entry.ts'));
  const docs = readdirSync(dir).filter((f) => /\.docx$/i.test(f)).sort();
  if (!docs.length) throw new Error(`nema .docx u ${dir}`);
  const rows: Snap[] = [];
  for (const f of docs) {
    const documentId = f.replace(/\.docx$/i, '');
    let profileId: string | null = null;
    try { profileId = JSON.parse(readFileSync(join(dir, `${documentId}.json`), 'utf8')).profileId ?? null; } catch { /* bez sidecara */ }
    try {
      const r = await analyzeFixture(new File([readFileSync(join(dir, f))], f), profileId ? { profileId } : {});
      const checks: Snap['checks'] = {};
      for (const c of r.checks) if (c.id) checks[c.id] = { status: c.status, earned: Number(c.earned), max: Number(c.max), detail: String(c.detail ?? ''), issueDetail: String(c.issue?.detail ?? '') };
      rows.push({ documentId, profileId, checks });
    } catch (e) { rows.push({ documentId, profileId, error: String((e as Error).message).slice(0, 120), checks: {} }); }
  }
  writeFileSync(out, JSON.stringify({ src, dir, count: rows.length, rows }, null, 1));
  console.log(`snap: ${rows.length} dokumenata, ${rows.filter((r) => r.error).length} gresaka -> ${out}`);
}

function diff() {
  const [a, b] = rest.map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const B = new Map<string, Snap>(b.rows.map((r: Snap) => [r.documentId, r]));
  if (a.count !== b.count || a.rows.some((r: Snap) => !B.has(r.documentId))) throw new Error('snapovi nisu nad istim korpusom');
  const idx = (s: string) => [...s.matchAll(/odlomak (\d+):/g)].map((m) => Number(m[1]));
  const count = (s: string) => Number(s.match(/(\d+) numeriranih kratkih/)?.[1] ?? 0);
  let wsBefore = 0, wsAfter = 0, wsGone = 0, wsFewer = 0, wsOther = 0, otherChecks = 0, errors = 0;
  const examples: string[] = [], other: string[] = [];
  for (const x of a.rows as Snap[]) {
    const y = B.get(x.documentId)!;
    if (x.error || y.error) { errors++; if (x.error !== y.error) other.push(`${x.documentId}: greska ${x.error ?? '-'} -> ${y.error ?? '-'}`); continue; }
    const p = x.checks[WS], q = y.checks[WS];
    if (p && count(p.detail) > 0) wsBefore++;
    if (q && count(q.detail) > 0) wsAfter++;
    if (p && q && (p.earned !== q.earned || p.detail !== q.detail)) {
      const n0 = count(p.detail), n1 = count(q.detail);
      if (n0 > 0 && n1 === 0) wsGone++;
      else if (n1 < n0) wsFewer++;
      else wsOther++;
      if (examples.length < 10) examples.push(`${x.documentId} [${x.profileId ?? 'bez profila'}]: ${p.earned}/${p.max} -> ${q.earned}/${q.max}, kandidata ${n0} -> ${n1}, prvi odlomci ${idx(p.issueDetail).join(',') || '-'} -> ${idx(q.issueDetail).join(',') || '-'}`);
      if (n1 > n0 || idx(q.issueDetail).some((i) => !idx(p.issueDetail).includes(i) && n1 >= n0)) other.push(`${x.documentId}: ${WS} dobio novog kandidata (${n0} -> ${n1})`);
    }
    for (const id of new Set([...Object.keys(x.checks), ...Object.keys(y.checks)])) {
      if (id === WS) continue;
      const c = x.checks[id], d = y.checks[id];
      if (!c || !d || c.status !== d.status || c.earned !== d.earned || c.max !== d.max || c.detail !== d.detail) { otherChecks++; if (other.length < 30) other.push(`${x.documentId}: ${id} ${c ? `${c.status} ${c.earned}/${c.max}` : 'nema'} -> ${d ? `${d.status} ${d.earned}/${d.max}` : 'nema'}`); }
    }
  }
  console.log(`dokumenata ${a.count}, gresaka analize ${errors}`);
  console.log(`${WS}, radova s barem jednim kandidatom: ${wsBefore} -> ${wsAfter}`);
  console.log(`  nestao u potpunosti: ${wsGone}; manje kandidata ali ostao: ${wsFewer}; druga promjena: ${wsOther}`);
  console.log(`promjene u DRUGIM provjerama (mora biti 0): ${otherChecks}`);
  console.log('\nprimjeri (do 10):\n  ' + (examples.join('\n  ') || '-'));
  console.log('\nneocekivano (do 30):\n  ' + (other.join('\n  ') || '-'));
  // Djelomican pad (greska analize) ili bilo kakva neocekivana promjena obara mjerenje.
  if (errors || otherChecks || other.length) { console.log('\nMJERENJE NIJE CISTO'); process.exitCode = 1; }
}

if (cmd === 'snap') await snap();
else if (cmd === 'diff') diff();
else throw new Error('naredba: snap | diff');
