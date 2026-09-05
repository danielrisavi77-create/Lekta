/**
 * F1: ULAZ STVARNIH RADOVA U KORPUS.
 *
 *   npx vite-node scripts/corpus-ingest.mts -- --in <izvor> --out <odrediste> --consent <zapis>
 *
 * Cita izvor SAMO ZA CITANJE, pseudonimizira u memoriji i pise ISKLJUCIVO u odrediste. Nema
 * zastavice za rad na mjestu i nijedan zapisni poziv ne prima putanju izvedenu iz `--in`.
 *
 * VRATA (svako je izlazni kod, ne upozorenje):
 *   2  nema zapisa o dopustenju, ili je neispravan
 *   3  `--in` i `--out` se preklapaju, ili je `--out` unutar repozitorija
 *   1  barem jedan dokument je ODBIJEN (procurio pojam, neispravan paket, nema dopustenja)
 *
 * Odrediste mora biti IZVAN repozitorija: gitignore je jedan `git add -f` daleko od objave, a
 * mjereno je da je bar jedna datoteka lokalnog korpusa (`_mapping.json`) vec nosila prezimena u
 * citljivom obliku.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip, writeZip } from '../src/repair/zip-codec';
import { pseudonymizeDocx } from '../src/corpus/pseudonymize';
import { deriveDocxFeatures } from '../src/corpus/docx-features';
import { frontText } from '../src/corpus/front-text';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

/** Je li `child` unutar `parent` (ili jednak)? Koristi se za vrata 3. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`) && !resolve(child).match(/^[A-Za-z]:$/));
}

interface ConsentRecord {
  consentId: string;
  scope: 'local-testing' | 'repo-committed' | 'public-redistribution';
  grantedAt: string;
  verifiedBy: string;
  /** Sto pokriva: cijeli direktorij ili popis sha256 otisaka. */
  covers: { mode: 'directory'; path: string } | { mode: 'sha256'; hashes: string[] };
  note?: string;
}

function readConsent(path: string): ConsentRecord {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as ConsentRecord;
  const missing = (['consentId', 'scope', 'grantedAt', 'verifiedBy', 'covers'] as const).filter((k) => !raw[k]);
  if (missing.length) throw new Error(`zapis o dopustenju nema polja: ${missing.join(', ')}`);
  if (!['local-testing', 'repo-committed', 'public-redistribution'].includes(raw.scope)) {
    throw new Error(`nepoznat scope: ${raw.scope}`);
  }
  return raw;
}

// `frontText` zivi u `src/corpus/front-text.ts` otkad je 2026-08-24 dobio popravak spajanja
// runova: ova skripta na vrhu poziva `await main()`, pa se ne moze uvesti u test.

const UNIT_PATTERNS: Array<[RegExp, string]> = [
  [/Fakultet politi[čc]kih znanosti/i, 'fpzg'], [/Pravni fakultet/i, 'pravo'],
  [/Ekonomski fakultet/i, 'efzg'], [/Filozofski fakultet/i, 'ffzg'],
  [/Fakultet elektrotehnike i ra[čc]unarstva/i, 'fer'], [/Fakultet strojarstva/i, 'fsb'],
  [/Medicinski fakultet/i, 'mef'], [/Prirodoslovno[- ]matemati[čc]ki/i, 'pmf'],
  [/Agronomski fakultet/i, 'agr'], [/Grafi[čc]ki fakultet/i, 'grf'],
  [/Kineziolo[šs]ki/i, 'kif'], [/Arhitektonski fakultet/i, 'arh'],
  [/Gra[đd]evinski fakultet/i, 'grad'], [/Tekstilno[- ]tehnolo[šs]ki/i, 'ttf'],
  [/[ŠS]umarski fakultet/i, 'sumfak'], [/Veterinarski fakultet/i, 'vef'],
  [/Farmaceutsko[- ]biokemijski/i, 'fbf'], [/U[čc]iteljski fakultet/i, 'ufzg'],
  [/Katoli[čc]ki bogoslovni/i, 'kbf'], [/Rudarsko[- ]geolo[šs]ko/i, 'rgnf'],
  [/Prehrambeno[- ]biotehnolo[šs]ki/i, 'pbf'], [/Fakultet kemijskog in[žz]enjerstva/i, 'fkit'],
  [/Geodetski fakultet/i, 'geof'], [/Fakultet hrvatskih studija|Hrvatski studiji/i, 'fhs'],
  [/Fakultet organizacije i informatike/i, 'foi'],
];

const WORK_TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/doktorsk|disertacij/i, 'doctoral'], [/specijalisti[čc]k/i, 'specialist'],
  [/diplomski rad|diplomskog rada/i, 'graduate'], [/zavr[šs]ni rad|zavr[šs]nog rada/i, 'final'],
  [/seminarski rad/i, 'seminar'],
];

/**
 * Profil iz naslovnice. Vraca `null` kad ustanova ili vrsta rada nisu prepoznati: pogadjanje bi
 * dokumentu pripisalo tudja pravila, pa bi mjerenje bilo besmisleno.
 */
function detectProfile(front: string): { profileId: string; unitId: string; workType: string } | null {
  const unitId = UNIT_PATTERNS.find(([re]) => re.test(front))?.[1];
  const workType = WORK_TYPE_PATTERNS.find(([re]) => re.test(front))?.[1];
  if (!unitId || !workType) return null;
  const match = (VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string; unitId: string; workTypes?: string[] }>)
    .find((p) => p.unitId === unitId && (p.workTypes ?? []).includes(workType));
  return match ? { profileId: match.id, unitId, workType } : null;
}

async function main() {
  const inDir = arg('in');
  const outDir = arg('out');
  const consentPath = arg('consent');
  const limit = Number(arg('limit') ?? '0') || 0;
  const dryRun = has('dry-run');

  if (!inDir || !outDir) {
    console.error('Obavezno: --in <izvor> --out <odrediste> --consent <zapis>');
    process.exit(2);
  }
  const src = resolve(inDir);
  const dst = resolve(outDir);

  // Vrata 3: preklapanje putanja i pisanje unutar repozitorija.
  if (isInside(src, dst) || isInside(dst, src)) {
    console.error(`ODBIJENO: --in i --out se preklapaju.\n  in:  ${src}\n  out: ${dst}`);
    process.exit(3);
  }
  if (isInside(ROOT, dst)) {
    console.error(
      `ODBIJENO: --out je unutar repozitorija (${dst}).\n` +
        'Stvarni studentski radovi drze se IZVAN stabla: gitignore je jedan `git add -f` daleko od objave.',
    );
    process.exit(3);
  }

  // Vrata 2: bez zapisa o dopustenju nema ulaza.
  if (!consentPath) {
    console.error('ODBIJENO: nema --consent. Stvaran rad bez zapisa o dopustenju ne ulazi u korpus.');
    process.exit(2);
  }
  let consent: ConsentRecord;
  try {
    consent = readConsent(resolve(consentPath));
  } catch (error) {
    console.error(`ODBIJENO: zapis o dopustenju nije valjan: ${(error as Error).message}`);
    process.exit(2);
  }

  const files = readdirSync(src)
    .filter((n) => /\.docx$/i.test(n) && !n.startsWith('~$'))
    .sort()
    .slice(0, limit || undefined);

  mkdirSync(dst, { recursive: true });
  const keyringDir = join(dst, '_keyring');
  mkdirSync(keyringDir, { recursive: true });

  let accepted = 0;
  let rejected = 0;
  let noProfile = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const [index, fileName] of files.entries()) {
    const bytes = new Uint8Array(readFileSync(join(src, fileName)));
    const sha = createHash('sha256').update(bytes).digest('hex');
    const id = `corpus-${String(index + 1).padStart(4, '0')}-${sha.slice(0, 6)}`;

    // Vrata 2 po dokumentu: pokriva li ga zapis o dopustenju?
    const covered =
      consent.covers.mode === 'directory'
        ? isInside(resolve(consent.covers.path), join(src, fileName))
        : consent.covers.hashes.includes(sha);
    if (!covered) {
      rejected += 1;
      console.error(`  ODBIJEN ${id}: nije pokriven zapisom o dopustenju`);
      continue;
    }

    let parts: Record<string, string>;
    let entries: Array<{ name: string; data: Uint8Array }>;
    try {
      entries = (await readZip(bytes)) as Array<{ name: string; data: Uint8Array }>;
      parts = {};
      for (const e of entries) {
        if (/\.(xml|rels)$/i.test(e.name)) parts[e.name] = new TextDecoder().decode(e.data);
      }
    } catch (error) {
      rejected += 1;
      console.error(`  ODBIJEN ${id}: paket se ne moze procitati (${(error as Error).message})`);
      continue;
    }

    // Salt je PO DOKUMENTU: ista osoba u dva rada dobiva razlicite tokene, pa pseudonimizacija
    // sama ne gradi graf povezivanja.
    const salt = createHash('sha256').update(`${consent.consentId}:${sha}`).digest('hex');
    const result = pseudonymizeDocx(parts, { salt });

    // Vrata: procurio pojam znaci da dokument NE izlazi.
    if (result.leaks.length) {
      rejected += 1;
      console.error(`  ODBIJEN ${id}: nakon zamjene ostalo ${result.leaks.length} pojmova`);
      continue;
    }

    const features = deriveDocxFeatures(result.parts);
    const profile = detectProfile(frontText(result.parts['word/document.xml'] ?? ''));
    if (!profile) noProfile += 1;

    if (!dryRun) {
      const rebuilt = entries.map((e) =>
        result.parts[e.name] !== undefined ? { name: e.name, data: new TextEncoder().encode(result.parts[e.name]) } : e,
      );
      writeFileSync(join(dst, `${id}.docx`), await writeZip(rebuilt as never));
      writeFileSync(
        join(dst, `${id}.json`),
        JSON.stringify(
          {
            // v1 ugovor koji `discoverRealCorpus` cita; bez profila dokument namjerno NE sudjeluje.
            ...(profile ? { profileId: profile.profileId } : {}),
            sidecar: 2,
            document: { id, workType: profile?.workType ?? null, origin: 'collected' },
            consent: { consentId: consent.consentId, scope: consent.scope, grantedAt: consent.grantedAt },
            pseudonymization: {
              applied: result.dictionarySize > 0,
              carriersCleaned: result.carriersCleaned,
              dictionarySize: result.dictionarySize,
              leaks: 0,
              /**
               * DOSEG, ne jamstvo. Uklonjeno je ono sto je prepoznato: imena iz metapodataka i
               * atributa, plus imena s naslovnice po dvije visokopouzdane sheme (iza oznake uloge
               * i odlomak koji je sam po sebi ime). Ime koje nije u metapodacima i ne stoji ni u
               * jednom od ta dva oblika MOZE preostati.
               *
               * `leaks: 0` znaci samo da nijedan PREPOZNATI pojam nije preostao. Na dokumentu s
               * praznim rjecnikom ta je tvrdnja vakuumska, pa se takav dokument izricito oznacava.
               */
              completeness: result.dictionarySize > 0 ? 'metadata+frontmatter-heuristic' : 'nista-nije-prepoznato',
              vacuous: result.dictionarySize === 0,
            },
            features,
            note: profile ? undefined : 'profil nije prepoznat s naslovnice; dokument ceka rucnu dodjelu',
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      // Mapa pseudonim -> izvorna vrijednost ide u keyring, NIKAD u sidecar ni u repozitorij.
      writeFileSync(join(keyringDir, `${id}.json`), JSON.stringify({ id, sourceFile: fileName, sha256: sha, mapping: result.mapping }, null, 2) + '\n', 'utf8');
    }

    accepted += 1;
    rows.push({ id, profileId: profile?.profileId ?? null, ...features });
  }

  console.log('\n=== corpus-ingest ===');
  console.log(`izvor:      ${src} (${files.length} .docx)`);
  console.log(`odrediste:  ${dryRun ? '(dry-run, nista nije zapisano)' : dst}`);
  console.log(`dopustenje: ${consent.consentId} (${consent.scope})`);
  console.log(`prihvaceno: ${accepted} | odbijeno: ${rejected} | bez prepoznatog profila: ${noProfile}`);
  const withProfile = rows.filter((r) => r.profileId);
  const distinct = new Set(withProfile.map((r) => r.profileId));
  console.log(`profila pokriveno: ${distinct.size}`);
  if (rejected > 0) process.exitCode = 1;
}

await main();
