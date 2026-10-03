/**
 * F1: ULAZ STVARNIH RADOVA U KORPUS.
 *
 *   npx vite-node scripts/corpus-ingest.mts -- --in <izvor> --out <odrediste> --consent <zapis> \
 *     --source-kind source-docx|public-pdf-converted
 *
 * Cita izvor SAMO ZA CITANJE, pseudonimizira u memoriji i pise ISKLJUCIVO u odrediste. Nema
 * zastavice za rad na mjestu i nijedan zapisni poziv ne prima putanju izvedenu iz `--in`.
 *
 * VRATA (svako je izlazni kod, ne upozorenje):
 *   2  nema zapisa o dopustenju, ili je neispravan; nema `--source-kind` ili se ne slaze s izvorom
 *   3  `--in` i `--out` se preklapaju, ili je `--out` unutar repozitorija
 *   1  barem jedan dokument je ODBIJEN (procurio pojam, neispravan paket, nema dopustenja)
 *
 * Odrediste mora biti IZVAN repozitorija: gitignore je jedan `git add -f` daleko od objave, a
 * mjereno je da je bar jedna datoteka lokalnog korpusa (`_mapping.json`) vec nosila prezimena u
 * citljivom obliku.
 *
 * VRSTA IZVORA (`--source-kind`, obavezna, odluka vlasnika 2026-09-28): `source-docx` je izvorni Word
 * dokument, `public-pdf-converted` javni rad pretvoren iz PDF-a (scripts/pdf-corpus/harvest_pdf_corpus.py).
 * Upisuje se u sidecar svakog dokumenta, a `scripts/repair-real-corpus.mts` je prenosi u svaki rezultat,
 * pa ovjera (`scripts/attest-real-corpus.mjs`) moze odbiti mjerenje u kojem se vrste mijesaju. Izvor koji
 * se sam izjasnjava (`.lekta-corpus-kind`, pise ga harvest) mora se slagati sa zastavicom, a
 * `public-pdf-converted` bez te oznake se odbija: rucno sastavljena mapa ne postaje PDF korpus.
 *
 * TRAG HARVESTA (Codex #229 nalaz 02, runda 3): `source-docx` odbija mapu s oznakom ili manifestom harvesta
 * (`.lekta-harvest-manifest.json`), a uz `--harvest-manifest <datoteka>` i svaki DOCX ciji je sha256 harvest
 * zapisao. Preostali rizik: covjek koji namjerno ukloni sve tragove i ne preda manifest moze lagati, isto kao
 * i potpisom ovjere.
 *
 * PRIVATNOST PDF VRSTE (nalaz 04): dokument `public-pdf-converted` smije nositi samo dijelove s popisa
 * (pdfPackagePrivacyProblems u scripts/lib/corpus-attestation-core.mjs, isti popis kao harvest), docProps bez
 * teksta, neprazan rjecnik pojmova i nijedan pojam u binarnom dijelu; inace se odbija.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip, writeZip } from '../src/repair/zip-codec';
import { pseudonymizeDocx } from '../src/corpus/pseudonymize';
import { deriveDocxFeatures } from '../src/corpus/docx-features';
import { frontText, leadText } from '../src/corpus/front-text';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { detectCorpusProfile, type DetectOptions, type RegistryProfileLike } from '../src/corpus/detect-profile';
import { harvestManifestShas, harvestedDocxProblem, ingestSourceKindProblem, pdfPackagePrivacyProblems } from './lib/corpus-attestation-core.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

type SourceKind = 'source-docx' | 'public-pdf-converted';
/** Oznaka kojom se staging mapa sama izjasnjava (pise je scripts/pdf-corpus/harvest_pdf_corpus.py). */
const KIND_MARKER = '.lekta-corpus-kind';
/** Manifest harvesta u staging mapi: sha256 pretvorenih DOCX-ova (bez PID-a i URL-a). */
const HARVEST_MANIFEST = '.lekta-harvest-manifest.json';

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

// Detekcija profila zivi u `src/corpus/detect-profile.ts` (izdvojeno 2026-09-05 da se moze testirati; ovdje
// se ne moze uvesti u test jer skripta na vrhu poziva `await main()`).
const detectProfile = (front: string, opts: DetectOptions) =>
  detectCorpusProfile(front, VERIFIED_PROFILE_REGISTRY as unknown as RegistryProfileLike[], opts);

async function main() {
  const inDir = arg('in');
  const outDir = arg('out');
  const consentPath = arg('consent');
  const limit = Number(arg('limit') ?? '0') || 0;
  const dryRun = has('dry-run');
  // `--terms <json>`: { "<ime izvorne datoteke>": ["Ime Prezime", ...] }. Rucno potvrdjeni pojmovi za
  // pseudonimizaciju, za slucajeve koje detektor namjerno ne pogadja (ime velikim slovima kao samostalan odlomak).
  // Datoteka zivi IZVAN repozitorija, uz zapis o dopustenju; nikad se ne ispisuje.
  const termsPath = arg('terms');
  const manualTerms: Record<string, string[]> = termsPath
    ? (JSON.parse(readFileSync(resolve(termsPath), 'utf8')) as Record<string, string[]>)
    : {};

  if (!inDir || !outDir) {
    console.error('Obavezno: --in <izvor> --out <odrediste> --consent <zapis>');
    process.exit(2);
  }
  const src = resolve(inDir);
  const dst = resolve(outDir);

  // Vrata 2: vrsta izvora je izricita i slaze se s oznakom izvora.
  const markerPath = join(src, KIND_MARKER);
  const marker = existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trim() : null;
  const kindProblem = ingestSourceKindProblem(arg('source-kind'), marker, existsSync(join(src, HARVEST_MANIFEST)));
  if (kindProblem) {
    console.error(`ODBIJENO: ${kindProblem}.`);
    process.exit(2);
  }
  const sourceKind = arg('source-kind') as SourceKind;
  // `--harvest-manifest <datoteka>`: kopija manifesta harvesta (npr. iz private mape); DOCX s tim sha256 ne
  // smije u source-docx ni kad mu je netko uklonio oznaku i manifest iz izvora.
  const manifestPath = arg('harvest-manifest');
  let manifestShas: Set<string> | null = null;
  if (has('harvest-manifest')) {
    try {
      if (!manifestPath) throw new Error('nema putanje');
      manifestShas = harvestManifestShas(JSON.parse(readFileSync(resolve(manifestPath), 'utf8'))) as Set<string>;
    } catch (error) {
      console.error(`ODBIJENO: --harvest-manifest nije citljiv manifest harvesta (${(error as Error).message}).`);
      process.exit(2);
    }
  }

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

  for (const fileName of files) {
    const bytes = new Uint8Array(readFileSync(join(src, fileName)));
    const sha = createHash('sha256').update(bytes).digest('hex');
    // ID je iz SADRZAJA izvorne datoteke, ne iz rednog broja u sortiranom popisu. Do 2026-09-05 je id nosio
    // redni broj (`corpus-0001-...`), pa je svako premjestanje ili dodavanje datoteke u izvoru promijenilo id
    // vecini radova, a stari izlaz ostao u odredistu kao duplikat (izmjereno: 362 sidecara za 200 izvora).
    // Dvije byte-identicne kopije istog rada dobiju isti id i zadnja prepise prvu, sto je i zeljeno.
    const id = `corpus-${sha.slice(0, 12)}`;

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
    const harvested = harvestedDocxProblem(sourceKind, sha, manifestShas);
    if (harvested) {
      rejected += 1;
      console.error(`  ODBIJEN ${id}: ${harvested}`);
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
    const result = pseudonymizeDocx(parts, { salt, extraTerms: manualTerms[fileName] ?? [] });

    // Vrata: procurio pojam znaci da dokument NE izlazi.
    if (result.leaks.length) {
      rejected += 1;
      console.error(`  ODBIJEN ${id}: nakon zamjene ostalo ${result.leaks.length} pojmova`);
      continue;
    }

    const rebuilt = entries.map((e) =>
      result.parts[e.name] !== undefined ? { name: e.name, data: new TextEncoder().encode(result.parts[e.name]) } : e,
    );
    // Vrata privatnosti PDF vrste: ono sto se ne moze potvrditi ne izlazi (nalaz 04).
    if (sourceKind === 'public-pdf-converted') {
      const privatnost = pdfPackagePrivacyProblems(rebuilt, Object.keys(result.mapping)) as string[];
      if (privatnost.length) {
        rejected += 1;
        console.error(`  ODBIJEN ${id}: privatnost se ne moze potvrditi (${privatnost.join('; ')})`);
        continue;
      }
    }

    const features = deriveDocxFeatures(result.parts);
    const docXml = result.parts['word/document.xml'] ?? '';
    // Naslovnica prva; iza nje prve stranice (izjava, sazetak) i ime datoteke kao rezerve (detect-profile.ts).
    const profile = detectProfile(frontText(docXml), { extended: leadText(docXml), fileName });
    if (!profile) noProfile += 1;

    if (!dryRun) {
      writeFileSync(join(dst, `${id}.docx`), await writeZip(rebuilt as never));
      writeFileSync(
        join(dst, `${id}.json`),
        JSON.stringify(
          {
            // v1 ugovor koji `discoverRealCorpus` cita; bez profila dokument namjerno NE sudjeluje.
            ...(profile ? { profileId: profile.profileId } : {}),
            sidecar: 2,
            sourceKind,
            document: { id, workType: profile?.workType ?? null, workTypeSource: profile?.source ?? null, origin: 'collected' },
            consent: { consentId: consent.consentId, scope: consent.scope, grantedAt: consent.grantedAt },
            pseudonymization: {
              applied: result.dictionarySize > 0,
              carriersCleaned: result.carriersCleaned,
              dictionarySize: result.dictionarySize,
              manualTerms: (manualTerms[fileName] ?? []).length - result.manualTermsIgnored,
              manualTermsIgnored: result.manualTermsIgnored,
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
  console.log(`vrsta:      ${sourceKind}`);
  console.log(`prihvaceno: ${accepted} | odbijeno: ${rejected} | bez prepoznatog profila: ${noProfile}`);
  const withProfile = rows.filter((r) => r.profileId);
  const distinct = new Set(withProfile.map((r) => r.profileId));
  console.log(`profila pokriveno: ${distinct.size}`);
  if (rejected > 0) process.exitCode = 1;
}

await main();
