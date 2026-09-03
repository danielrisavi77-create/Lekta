// scripts/projection-freshness-core.mjs
//
// Ciste funkcije iza `npm run projection-freshness`. Odvojene su da bi bile TESTIRLJIVE: sam skript
// zove git.
//
// STO SE PITA: je li PECENA PROJEKCIJA zaostala za izvorom iz kojeg se izvodi.
//
// ZASTO POSTOJI, izmjereno 2026-08-31/09-01, SEST puta u jednom danu:
//   1. golden snimka opisivala je ponasanje koje je zivjelo samo u NEKOMITIRANOM `run-level.ts`
//   2. `repair-real-corpus.json` zaostao za shemom koja mu je dodala polje
//   3. `real-corpus-backlog` zaostao za matricom
//   4. `faculty-matrix` zaostao za `repair-real-corpus`
//   5. `docs/REPAIR_RECIPE.md` zaostao za motorom (`deep` na 50 mjesta)
//   6. `faculty-matrix` opet, za cetiri izvora odjednom
//
// Posljedica je uvijek ista i uvijek pada na SLJEDECU sesiju: zeleno koje ne znaci ono sto tvrdi,
// pa netko trosi cist worktree dokazujuci da kvar nije njegov. Danas je na to otislo pet worktreea
// kroz dvije sesije.
//
// NE UVODI NOV DNEVNIK: redoslijed vec postoji u gitu. Pita se samo je li ijedan IZVOR commitan
// POSLIJE zadnjeg commita nad PROJEKCIJOM. Isti nacin na koji radi `tier2-freshness`.
//
// STO OVA PRESUDA JEST, izmjereno 2026-09-01: SCREENING, ne nalaz. Detektor gleda REDOSLIJED
// COMMITA, ne sadrzaj, pa odgovara na "je li se moglo pokvariti", nikad na "je li pokvareno".
// Prva regeneracija po njegovoj uputi to je i dokazala: sve TRI prijavljene projekcije
// (`closed-loop` 15 commita, `real-corpus` 2, `real-corpus-backlog` 3) regenerirale su se u
// BAJT-IDENTICAN sadrzaj. Commiti nad `src/repair/` naprosto nisu dirnuli ono sto ulazi u izlaz.
//
// Zato ovo NIJE tvrdi gard. Gard koji je 3/3 lazno pozitivan je "gard koji vristi na sve", a takav
// se po projektnom pravilu ne racuna kao provjera. Pogodak znaci "potvrdi regeneracijom", i tek
// razlika u sadrzaju je nalaz. Da signal nije prazan, pokazuje sest izvornih slucajeva gore: ondje
// se sadrzaj STVARNO razlikovao (`REPAIR_RECIPE.md` je imao `deep` na 50 mjesta manje).
//
// STO OVO NIJE: nije regeneracija. Ulancano pecenje svih projekcija traje preko 40 minuta, pa ga
// nitko ne bi pokretao; detekcija traje sekunde i moze stajati u gateu. Presuda je uvijek
// "regeneriraj X", nikad "X je pokvaren".

/**
 * Projekcija -> izvori iz kojih se izvodi.
 *
 * Putanje su prefiksi kakve razumije `git log -- <path>`. Popis je izveden iz sest izmjerenih
 * driftova iznad; svaki novi ulancani artefakt ide ovamo, inace mu drift nitko ne vidi.
 */
export const PROJECTIONS = [
  {
    id: 'closed-loop',
    artifacts: ['docs/generated/closed-loop.json'],
    sources: ['src/repair', 'src/analysis', 'tests/helpers/violating-docx.ts', 'scripts/run-closed-loop.mts'],
    regenerate: 'npm run closed-loop',
  },
  {
    id: 'real-corpus',
    artifacts: ['docs/generated/repair-real-corpus.json'],
    sources: ['src/repair', 'src/analysis', 'tests/real-corpus/harness.ts'],
    regenerate: 'npm run repair-real-corpus',
  },
  {
    id: 'faculty-matrix',
    artifacts: ['docs/generated/faculty-matrix.json', 'docs/generated/coverage-cells.json'],
    sources: [
      'docs/generated/closed-loop.json',
      'docs/generated/repair-real-corpus.json',
      'tests/helpers/coverage-cells.ts',
      'scripts/generate-faculty-matrix.mts',
    ],
    regenerate: 'npm run repair-faculty-matrix',
  },
  {
    id: 'real-corpus-backlog',
    artifacts: ['docs/generated/real-corpus-backlog.json', 'docs/generated/real-corpus-backlog.md'],
    sources: ['docs/generated/faculty-matrix.json', 'scripts/generate-real-corpus-backlog.mts'],
    regenerate: 'npm run repair-real-corpus-backlog',
  },
  {
    // Dodan 2026-09-03, nakon sto je izostao i to se odmah osvetilo: popravak `faculty-matrix`
    // ucinio je ledger ustajalim, a nijedan screening to nije vidio jer projekcija nije bila
    // registrirana. Upravo slucaj na koji vodic upozorava.
    id: 'completion-ledger',
    artifacts: ['docs/generated/completion-ledger.json'],
    sources: [
      'docs/generated/faculty-matrix.json',
      'docs/generated/repair-coverage.json',
      'docs/generated/closed-loop.json',
      'data/coverage/scored-coverage.json',
      'data/programs/program-registry.json',
      'data/title-pages/templates-index.json',
      'data/tools/citation-specs/verified-index.json',
      'data/declarations/declarations.json',
      'src/verification',
      'scripts/generate-completion-ledger.mts',
    ],
    regenerate: 'npm run completion-ledger',
  },
  {
    id: 'repair-recipe',
    artifacts: ['docs/REPAIR_RECIPE.md', 'data/generated/repair-params-by-profile.json'],
    sources: ['src/repair', 'src/ui/repair-items.ts', 'data/profiles'],
    regenerate: 'npm run repair-recipe',
  },
];

/**
 * Presuda za jednu projekciju.
 *
 * @param id            oznaka projekcije
 * @param artifactSha   sha zadnjeg commita nad BILO KOJIM artefaktom te projekcije, ili `null`
 * @param sourceCommits commiti nad izvorima OD `artifactSha` do HEAD-a (`{sha, subject}`)
 * @param regenerate    naredba koja projekciju osvjezava
 */
export function projectionFreshness(id, artifactSha, sourceCommits, regenerate) {
  if (!artifactSha) {
    return { id, status: 'nepoznato', reason: 'artefakt nije nikad commitan', regenerate, commits: [] };
  }
  if (!sourceCommits.length) {
    return { id, status: 'svjeze', reason: 'nijedan izvor nije dirnut od zadnjeg pecenja', regenerate, commits: [] };
  }
  return {
    id,
    status: 'ustajalo',
    reason: `${sourceCommits.length} commit(a) nad izvorima od zadnjeg pecenja`,
    regenerate,
    commits: sourceCommits,
  };
}

/** Ljudski citljiv redak po projekciji. */
export function formatProjection(verdict) {
  // Rijec PROVJERI, ne USTAJALO: presuda je screening po redoslijedu commita, a izmjereno je da
  // pogodak u 4 od 4 slucaja nije znacio razliku u sadrzaju.
  //
  // Cetvrti je izmjeren 2026-09-03: `real-corpus-backlog` je bio prijavljen zbog cetiri commita
  // nad `faculty-matrix.json`, a regeneracija u cistom worktreeu dala je BAJT-IDENTICAN sadrzaj
  // (`git diff --numstat` prazan). Vrijedi zabiljeziti smjer omjera: sto je vise pogodaka bez
  // razlike, to je jaci argument da ovo OSTANE screening, a ne da se pretvori u automatsku
  // regeneraciju. Ulancano pecenje traje preko 40 minuta i po ovom uzorku bi ih vecinom potrosilo
  // na proizvodnju istih bajtova.
  //
  // Najjaci argument protiv automatskog pecenja nije cijena nego ISHOD: poslusna regeneracija zna
  // proizvesti zeleno koje znaci MANJE provjere. Izmjereno 2026-08-24 na `scored-quote-audit.json`
  // (vidi CLAUDE.md): CI je javio da je artefakt ustajao, a artefakt je bio ISPRAVAN i citac je
  // zakazao. Regeneracija bi ozelenila CI, izbacila 193 bodovana pravila iz revizije i obrisala
  // CETIRI stvarna nalaza. Automatika bi taj potez izvela bez da ga itko vidi.
  //
  // OGRADA, jer je omjer jedna tocka na krivulji: 4 od 4 dokazuje da screening PRETJERUJE, ne da
  // je suvisan. Dok ne padne pogodak koji JEST razlika u sadrzaju, ne zna se ni koliko bi
  // automatika ustedjela ni koliko bi propustila. Prvi takav pogodak vrijedi zabiljeziti OVDJE,
  // jer tek on daje drugu tocku i cini odluku o ulancanju mjerljivom umjesto nacelnom.
  const oznaka = verdict.status === 'ustajalo' ? 'PROVJERI' : verdict.status === 'svjeze' ? 'svjeze  ' : 'nepoznato';
  const rep = verdict.status === 'ustajalo' ? `  -> ${verdict.regenerate}` : '';
  return `  ${oznaka}  ${verdict.id.padEnd(20)} ${verdict.reason}${rep}`;
}

/** Izlazni kod: 1 cim je ijedna projekcija ustajala. */
export function exitCodeFor(verdicts) {
  return verdicts.some((v) => v.status === 'ustajalo') ? 1 : 0;
}
