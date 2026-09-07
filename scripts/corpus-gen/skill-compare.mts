/**
 * USPOREDBA DVAJU ALATA nad ISTIM dokumentom: Lekta protiv Katedrinih provjera.
 *
 *   npm run skill-compare [-- --dir <docx dir>] [-- --write]
 *
 * Zasto postoji. Vise prolaza ISTIM alatom nije provjera nego slaganje; razliku prave DVA alata nad
 * istim ulazom. Svaki proizvod inace vidi samo vlastite nalaze, pa se ne moze znati je li nalaz
 * istinit, je li druga strana slijepa, ili su obje.
 *
 * Tri ishoda, i svaki ide na drugu stranu:
 *
 *   oba nalaze          provjere se slazu, dokument doista ima kvar    -> popravlja se proza
 *   samo Lekta          Katedrina provjera je slijepa ili nije trcala  -> kvar za `katedra` skill
 *   samo Katedra        Lektina provjera je slijepa, ILI je nalaz lazan -> zadatak u Lekti
 *
 * ZASLUZILO JE ODMAH: prvi rucni prolaz 2026-09-07 pokazao je da OBA alata prijavljuju "citirano a
 * nema na popisu" na tekstu koji pise ISPRAVAN hrvatski ("Prema Galtungu i Rugeu (1965)"). Slaganje
 * dvaju alata dalo je povod da se otvori proza, i vidjelo se da su oba u krivu. Da je javio samo
 * jedan, zakljucak bi bio da drugi grijesi.
 *
 * NE VRTI SE U CI-ju: trazi Python i Katedrin paket (`$KATEDRA_PKG`), kojih na runneru nema.
 * Nedostatak paketa je izlazni kod 2 ("nepokriveno"), nikad tihi prolaz.
 *
 * GRANICA: iz Katedre prema Lekti ne prelazi NIJEDNO pravilo. Ovaj alat cita njezine NALAZE nad nasim
 * dokumentom i usporedjuje ih s nasima; fakultetska pravila i dalje teku samo Lekta -> Katedra.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installXmlDomParser } from '../../src/docx/xml-dom-install';
import { analyzeFixture } from '../../src/analysis/golden-entry';
import {
  classifyOutcome,
  comparisonIsVacuous,
  divergentRows,
  type ComparisonRow,
} from '../../src/corpus/tool-comparison';
import { withProvenance } from '../lib/provenance.mjs';

installXmlDomParser();

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'docx-authored');
const OUT = join(ROOT, 'docs', 'generated', 'skill-compare.json');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Katedrin paket; bez njega usporedbe nema, i to se kaze naglas. */
const KATEDRA = process.env.KATEDRA_PKG || join(process.env.USERPROFILE || '', '.katedra-pkg');
const SKILL = join(KATEDRA, 'katedra-lite');

/**
 * Osi koje OBA alata mjere. Preslikavanje je izvedeno iz koda obiju strana, ne iz imena: Lektin
 * stabilni `checkId` prema polju u Katedrinu JSON izlazu.
 *
 * OS SE UPISUJE TEK KAD OBJE STRANE MJERE ISTU STVAR, i to je pravilo placeno laznim nalazom.
 * Prva izvedba imala je i os `fusnote`, koja je Lektin `footnote.present` (PRISUTNOST fusnota)
 * usporedjivala s Katedrinim `prazno: true` (nema fusnota, nema sto provjeriti). Na radu koji citira
 * Vancouverom, dakle bez ijedne fusnote i posve ispravno, to je dalo tri "samo Katedra" retka, i
 * zamalo je otislo u izvoz kao kvar druge strane. Sam alat ondje ispisuje da to NIJE njegov nalaz:
 *
 *     "dokument nema fusnota, nema sto provjeriti.
 *      Ako profil trazi fusnote kod izravnog citata, to je nalaz za check_rules, ne za ovaj alat."
 *
 * Kvar je time bio u OVOM preslikavanju, ne u Katedri. Zato: os mora usporedjivati nalaz s nalazom,
 * nikad nalaz s neutralnim stanjem, a Katedrina strana broji samo ono sto sam alat drzi nalazom.
 *
 * IMENOVANO NEPOKRIVENO, jer se precutan izostanak ne razlikuje od zaborava:
 *   `element.source` prema `check_rules.py` (`prikazi.izvor_ispod`) je STVARNO zajednicka os, ali
 *   `check_rules.py` na ovom stroju odbija raditi ("nedostaje paket jsonschema"), a Katedrin registar
 *   ionako rutira samo `efzg` i `fpzg`, pa bi devet od jedanaest dokumenata dalo "nije mjerila".
 *   `provjeri_prikaze.py` mjeri KVALITETU SLIKE (dpi, omjer), sto Lekta ne mjeri uopce; nad nasim
 *   1x1 px rezerviranim slikama njegovi nalazi opisuju nas graditelj, ne rad.
 */
interface Os {
  id: string;
  lektaCheck: string;
  katedraSkripta: 'verify_sources';
  /** Izvlaci broj nalaza iz Katedrina JSON-a; 0 znaci "ta strana nema nalaz". */
  katedraNalaz: (j: Record<string, unknown>) => number;
}

const OSI: Os[] = [
  {
    id: 'citirano-bez-jedinice',
    lektaCheck: 'citation.author-year.missing-reference',
    katedraSkripta: 'verify_sources',
    katedraNalaz: (j) => ((j.pokrivenost as { bez_izvora?: unknown[] })?.bez_izvora ?? []).length,
  },
  {
    id: 'jedinica-necitirana',
    lektaCheck: 'reference.uncited',
    katedraSkripta: 'verify_sources',
    katedraNalaz: (j) => ((j.pokrivenost as { necitirani?: unknown[] })?.necitirani ?? []).length,
  },
];

function pokreniKatedru(skripta: string, docx: string, out: string, dodatno: string[] = []): Record<string, unknown> | null {
  const py = join(SKILL, 'scripts', `${skripta}.py`);
  if (!existsSync(py)) return null;
  try {
    execFileSync('python', [py, docx, ...dodatno, '--json', out], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
  } catch {
    // Izlazni kod != 0 je kod ovih skripti NORMALAN kad ima nalaza; JSON je svejedno zapisan.
  }
  try {
    return JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type Redak = ComparisonRow;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const dirIdx = argv.indexOf('--dir');
  const dir = dirIdx >= 0 ? resolve(ROOT, argv[dirIdx + 1]) : FIXTURES;

  if (!existsSync(SKILL)) {
    console.error(`Katedrin paket nije nadjen: ${SKILL}`);
    console.error('Usporedba je NEPOKRIVENA na ovom stroju; postavi KATEDRA_PKG ili kloniraj paket.');
    process.exit(2);
  }

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.docx')).sort();
  if (!files.length) {
    console.error(`Nijedan .docx u ${dir}; usporedba bi bila vakuumska.`);
    process.exit(2);
  }

  const tmp = join(ROOT, '.artifacts', 'skill-compare');
  mkdirSync(tmp, { recursive: true });
  const redci: Redak[] = [];

  for (const f of files) {
    const docx = join(dir, f);
    const sidecar = JSON.parse(readFileSync(docx.replace(/\.docx$/i, '.json'), 'utf8')) as { profileId?: string };
    const r = await analyzeFixture(new File([new Uint8Array(readFileSync(docx))], f, { type: DOCX_MIME }), {
      profileId: sidecar.profileId,
    });
    const pali = new Set(
      (r.checks ?? [])
        .filter((c: { id?: string; status?: string; max?: number }) => c.id && (c.max ?? 0) > 0 && c.status !== 'pass')
        .map((c: { id?: string }) => c.id as string),
    );

    const katedraIzlaz: Record<string, Record<string, unknown> | null> = {};
    for (const skripta of ['verify_sources'] as const) {
      const out = join(tmp, `${f}.${skripta}.json`);
      // Izlaz se BRISE prije poziva: skripta koja padne ne pise datoteku, pa bi se stari sadrzaj
      // procitao kao svjez odgovor. Izmjereno na `check_rules.py`, koji je tako "vratio" tudji
      // CrossRef odgovor od prije nekoliko poziva.
      rmSync(out, { force: true });
      const dodatno = skripta === 'verify_sources' ? ['--pokrivenost', '--offline'] : [];
      katedraIzlaz[skripta] = pokreniKatedru(skripta, docx, out, dodatno);
    }

    for (const os of OSI) {
      const j = katedraIzlaz[os.katedraSkripta];
      const lekta = pali.has(os.lektaCheck) ? 1 : 0;
      const katedra = j ? os.katedraNalaz(j) : null;
      redci.push({ dokument: f, os: os.id, lekta, katedra, ishod: classifyOutcome(lekta, katedra) });
    }
  }
  rmSync(tmp, { recursive: true, force: true });

  const zbroj: Record<string, number> = {};
  for (const r of redci) zbroj[r.ishod] = (zbroj[r.ishod] ?? 0) + 1;

  console.log(`dokumenata: ${files.length}, usporedbi: ${redci.length}\n`);
  for (const ishod of ['oba', 'samo-lekta', 'samo-katedra', 'nitko', 'katedra-nije-mjerila'] as const) {
    const grupa = redci.filter((r) => r.ishod === ishod);
    if (!grupa.length) continue;
    console.log(`${ishod} (${grupa.length}):`);
    for (const r of grupa.slice(0, 6)) console.log(`   ${r.dokument.padEnd(46)} ${r.os}`);
    if (grupa.length > 6) console.log(`   ... i jos ${grupa.length - 6}`);
  }

  // NETRIVIJALNOST: usporedba u kojoj su svi ishodi "nitko" ne mjeri nista, jer bi jednako izgledala
  // i da nijedan alat nije ni pokrenut. Prazan skup nalaza zato nije tihi prolaz.
  if (comparisonIsVacuous(redci)) {
    console.error('\nNijedna os nije dala nalaz ni na jednoj strani; usporedba ne mjeri nista.');
    console.error('Provjeri jesu li Katedrine skripte doista trcale i odgovara li im izlazna shema.');
    process.exitCode = 1;
  } else {
    console.log(`\nrazilazenja: ${divergentRows(redci).length} od ${redci.length}`);
  }

  if (!write) return;
  const artefakt = withProvenance(
    {
      schemaVersion: 1,
      note:
        'Usporedba Lektinih i Katedrinih nalaza nad ISTIM dokumentima. Cita samo NALAZE, nikad ' +
        'pravila: fakultetska pravila i dalje teku iskljucivo Lekta -> Katedra.',
      summary: { documentCount: files.length, comparisonCount: redci.length, byOutcome: zbroj },
      rows: redci,
    },
    'npm run skill-compare -- --write',
  );
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artefakt, null, 2) + '\n', 'utf8');
  console.log(`\nzapisano: ${OUT}`);
}

await main();
