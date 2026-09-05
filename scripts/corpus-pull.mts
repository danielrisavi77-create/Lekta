/**
 * Kanal A, vlasnikov ulaz: skida priloge korpusu (pseudonimizirane kopije radova uz zasebnu privolu) iz Supabase
 * Storagea u lokalnu mapu IZVAN repozitorija, u obliku koji postojeci dedupe i mjerenje vec razumiju
 * (docx + sidecar, `consent.scope: 'product-contribution'`).
 *
 *   npx vite-node scripts/corpus-pull.mts -- --out <mapa> [--dry-run]
 *
 * Tajne: SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY iz okoline (`.env.corpus`, koji se nikad ne commita). Cisti fetch
 * na PostgREST i Storage REST, bez klijentske biblioteke. Povuceni prilozi (`withdrawn_at`) se ne skidaju, a ako su
 * ranije skinuti, lokalna kopija se brise: povlacenje privole vrijedi i za vlasnikov disk.
 *
 * Odbija `--out` unutar repozitorija, iz istog razloga kao ingest: gitignore je jedan `git add -f` daleko od objave.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
};
const dryRun = process.argv.includes('--dry-run');

function loadEnvCorpus(): void {
  const p = join(ROOT, '.env.corpus');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

interface Contribution {
  id: string;
  consent_version: string;
  work_type: string;
  profile_ref: string | null;
  path: string;
  bytes: number | null;
  pseudonymization: Record<string, unknown>;
  created_at: string;
  expires_at: string;
  withdrawn_at: string | null;
}

async function main(): Promise<void> {
  loadEnvCorpus();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ODBIJENO: nema SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ocekivano u .env.corpus).');
    process.exit(2);
  }
  const outArg = arg('out');
  if (!outArg) {
    console.error('ODBIJENO: nema --out <mapa izvan repozitorija>.');
    process.exit(2);
  }
  const out = resolve(outArg);
  const rel = relative(ROOT, out);
  if (rel === '' || (!rel.startsWith('..') && !/^[A-Za-z]:/.test(rel))) {
    console.error(`ODBIJENO: --out je unutar repozitorija (${out}).`);
    process.exit(3);
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const res = await fetch(`${url}/rest/v1/corpus_contributions?select=*&order=created_at.asc`, { headers });
  if (!res.ok) {
    console.error(`ODBIJENO: PostgREST ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const rows = (await res.json()) as Contribution[];
  const aktivni = rows.filter((r) => !r.withdrawn_at);
  const povuceni = rows.filter((r) => r.withdrawn_at);
  console.log(`prilozi: ukupno ${rows.length} | aktivni ${aktivni.length} | povuceni ${povuceni.length}`);
  if (dryRun) {
    const po = new Map<string, number>();
    for (const r of aktivni) po.set(r.profile_ref ?? `(bez profila) ${r.work_type}`, (po.get(r.profile_ref ?? `(bez profila) ${r.work_type}`) ?? 0) + 1);
    console.log('po profilu:', JSON.stringify(Object.fromEntries(po)));
    console.log('(dry-run, nista nije zapisano)');
    return;
  }
  mkdirSync(out, { recursive: true });
  // Povlacenje vrijedi i lokalno.
  let obrisano = 0;
  for (const r of povuceni) {
    for (const ext of ['.docx', '.json']) {
      const p = join(out, `contrib-${r.id}${ext}`);
      if (existsSync(p)) { unlinkSync(p); obrisano += 1; }
    }
  }
  let skinuto = 0;
  let preskoceno = 0;
  for (const r of aktivni) {
    const docxPath = join(out, `contrib-${r.id}.docx`);
    if (existsSync(docxPath)) { preskoceno += 1; continue; }
    const obj = await fetch(`${url}/storage/v1/object/corpus/${r.path}`, { headers });
    if (!obj.ok) {
      console.error(`  preskacem ${r.id}: storage ${obj.status}`);
      continue;
    }
    writeFileSync(docxPath, new Uint8Array(await obj.arrayBuffer()));
    writeFileSync(
      join(out, `contrib-${r.id}.json`),
      JSON.stringify(
        {
          ...(r.profile_ref ? { profileId: r.profile_ref } : {}),
          sidecar: 2,
          document: { id: `contrib-${r.id}`, workType: r.work_type, origin: 'product-contribution' },
          consent: { scope: 'product-contribution', version: r.consent_version, grantedAt: r.created_at, expiresAt: r.expires_at },
          pseudonymization: r.pseudonymization,
          note: r.profile_ref ? undefined : 'profil nije poznat iz analize; dokument ceka rucnu dodjelu',
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    skinuto += 1;
  }
  console.log(`skinuto ${skinuto} | vec bilo ${preskoceno} | obrisano lokalno zbog povlacenja ${obrisano} | odrediste ${out}`);
  const lokalno = readdirSync(out).filter((n) => n.endsWith('.docx')).length;
  console.log(`lokalno sada: ${lokalno} priloga`);
}

await main();
