/**
 * Laya zlatni skup D1 na radnoj stanici (docs/laya/ZLATNI_SKUP.md). Logika je u
 * scripts/laya/zlatni-skup.ts; ovdje su samo datoteke, git i analiza iz src/.
 *
 *   npm run laya:zlatni -- kandidati --dir <mapa s .docx> --origin explicitly_permitted --permission-ref <ref>
 *                          [--profile <profileId>] [--jezik hr] [--out-dir .artifacts/laya] [--prepisi]
 *   npm run laya:zlatni -- sastavi --dataset-id d1-2026-10 [--test-udio 0.3] [--out-dir .artifacts/laya]
 *
 * Uz <ime>.docx moze stajati <ime>.json: { "profileId", "jezik", "izvor", "predlozak" }.
 * Ispis na konzolu sadrzi samo brojeve i imena datoteka, nikad tekst zapisa.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { installXmlDomParser } from '../src/docx/xml-dom-install.ts';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry.ts';
import { sha256Hex } from './laya/contracts-v2.ts';
import type { LayaLanguage } from './laya/contracts-v2.ts';
import { listZaOznacavanje, pripremiKandidate, sastaviZlatniSkup } from './laya/zlatni-skup.ts';
import type { DokumentZaKandidate, Kandidati } from './laya/zlatni-skup.ts';

const [naredba, ...args] = process.argv.slice(2).filter((a) => a !== '--');
const opt = (ime: string) => { const i = args.indexOf(ime); return i >= 0 ? args[i + 1] : undefined; };
const outDir = resolve(opt('--out-dir') ?? '.artifacts/laya');
const KANDIDATI = join(outDir, 'kandidati.json');
const OZNAKE = join(outDir, 'oznake.csv');
const JEZICI = ['hr', 'en', 'mixed'];

function sidecar(putanja: string): { profileId?: string; jezik?: string; izvor?: string; predlozak?: string } {
  if (!existsSync(putanja)) return {};
  const v = JSON.parse(readFileSync(putanja, 'utf8'));
  for (const k of ['profileId', 'jezik', 'izvor', 'predlozak']) {
    if (v[k] !== undefined && typeof v[k] !== 'string') throw new Error(`${putanja}: ${k} mora biti tekst.`);
  }
  return v;
}

async function kandidati(): Promise<number> {
  const dir = opt('--dir');
  const origin = opt('--origin');
  const permissionRef = opt('--permission-ref');
  if (!dir || !permissionRef || (origin !== 'owned_synthetic' && origin !== 'explicitly_permitted')) {
    console.error('Naredba: kandidati --dir <mapa> --origin owned_synthetic|explicitly_permitted --permission-ref <ref> [--profile <id>]');
    return 2;
  }
  if (existsSync(OZNAKE) && !args.includes('--prepisi')) {
    console.error(`${OZNAKE} vec postoji i moze sadrzavati tvoje oznake. Premjesti ga ili dodaj --prepisi.`);
    return 2;
  }
  // Engine revizija mora biti tocno kod koji je analizirao; necommitana promjena u src/ ili data/ to krivotvori.
  if (execFileSync('git', ['status', '--porcelain', '--', 'src', 'data'], { encoding: 'utf8' }).trim()) {
    console.error('src/ ili data/ imaju necommitane promjene; engine revizija ne bi bila istinita.');
    return 1;
  }
  const engineRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  installXmlDomParser();
  const datoteke = readdirSync(dir).filter((f) => /\.docx$/i.test(f) && !f.startsWith('~$')).sort();
  if (!datoteke.length) { console.error(`Nema .docx datoteka u ${dir}.`); return 1; }
  const dokumenti: DokumentZaKandidate[] = [];
  const greske: string[] = [];
  for (const f of datoteke) {
    try {
      const meta = sidecar(join(dir, f.replace(/\.docx$/i, '.json')));
      const profileId = meta.profileId ?? opt('--profile');
      if (!profileId) throw new Error('nema profileId (sidecar ili --profile)');
      const jezik = meta.jezik ?? opt('--jezik') ?? 'hr';
      if (!JEZICI.includes(jezik)) throw new Error('jezik mora biti hr, en ili mixed');
      const bytes = readFileSync(join(dir, f));
      const profil = resolveProfile(profileId);
      const analysis = await analyzeFixture(new File([bytes], f), { profileId, profile: profil });
      dokumenti.push({
        naziv: f, sha256: createHash('sha256').update(bytes).digest('hex'), profileId,
        profileRevision: sha256Hex(JSON.stringify(profil)), language: jezik as LayaLanguage,
        sourceGroup: meta.izvor ?? null, templateFamily: meta.predlozak ?? null, analysis,
      });
    } catch (e) {
      greske.push(`${f}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  // Djelomican pad obara cijeli korak: zlatni skup bez dijela radova bio bi tiho pristran.
  if (greske.length) { console.error(`Analiza nije uspjela za ${greske.length} od ${datoteke.length}:\n  ${greske.join('\n  ')}`); return 1; }

  const k = pripremiKandidate(dokumenti, { engineRevision, origin, permissionRef });
  console.log(`Dokumenata ${dokumenti.length}, kandidata ${k.items.length}, preskoceno ${JSON.stringify(k.preskoceno)}.`);
  if (!k.items.length) { console.error('Nijedan rad nema nepotpun zapis literature; nema sto oznaciti.'); return 1; }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(KANDIDATI, `${JSON.stringify(k, null, 1)}\n`);
  writeFileSync(OZNAKE, listZaOznacavanje(k));
  console.log(`Oznaci stupac "oznaka" u ${OZNAKE} (S stvaran, L lazan, E lose izvucen, N ne moze se odluciti) i spremi kao CSV UTF-8.`);
  return 0;
}

function sastavi(): number {
  const datasetId = opt('--dataset-id');
  if (!datasetId) { console.error('Naredba: sastavi --dataset-id <id> [--test-udio 0.3]'); return 2; }
  const k = JSON.parse(readFileSync(KANDIDATI, 'utf8')) as Kandidati;
  const { calibration, test, statistika } = sastaviZlatniSkup(k, readFileSync(OZNAKE, 'utf8'), {
    datasetId, testUdio: Number(opt('--test-udio') ?? '0.3'),
  });
  writeFileSync(join(outDir, `${datasetId}-calibration.json`), `${JSON.stringify(calibration)}\n`);
  writeFileSync(join(outDir, `${datasetId}-test.json`), `${JSON.stringify(test)}\n`);
  console.log(JSON.stringify(statistika, null, 2));
  return 0;
}

const pokreni = naredba === 'kandidati' ? kandidati() : naredba === 'sastavi' ? Promise.resolve(sastavi())
  : Promise.resolve((console.error('Naredba: kandidati | sastavi (vidi docs/laya/ZLATNI_SKUP.md)'), 2));
pokreni.then(
  (code) => { process.exitCode = code; },
  (e: unknown) => { console.error(e instanceof Error ? e.message : 'Zlatni skup nije uspio.'); process.exitCode = 1; },
);
