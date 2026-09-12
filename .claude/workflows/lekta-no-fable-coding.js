// LEKTA: KODIRANJE BEZ FABLEA.
//
// Odluka vlasnika 2026-09-12: Fable (glavna sesija) NE kodira. Fable zadatak opise, pokrene ovaj workflow i procita
// izvjestaj. Sve sto dira datoteke, pokrece testove ili pregledava diff rade podagenti na Sonnetu i Opusu, svaki u
// vlastitom git worktreeu, po tvrdim pravilima iz CLAUDE.md (koje podagenti dobivaju automatski).
//
// Ulaz: args = { task: string, files?: string[], acceptance?: string[], branch?: string }
//   task        sto treba napraviti, jednom recenicom ili odlomkom (obavezno)
//   files       datoteke koje zadatak vjerojatno dira (pomoc izvidjaju, ne granica)
//   acceptance  kriteriji prihvacanja IZVAN diffa (plan, dokument, mjerenje); bez njih ih izvidjaj izvodi iz repoa
//   branch      ime grane za rad; bez njega implementator sam bira `wf/<kratko-ime>`
//
// Izlaz: { branch, commits, gate, review, report } gdje `gate` nosi redak `Test Files` i exit iz izoliranog stabla.
// Fable NE pusha ni ne otvara PR unutar ovog workflowa: to je zaseban korak na rijec vlasnika.
export const meta = {
  name: 'lekta-no-fable-coding',
  description: 'Zadatak kodiranja bez Fablea: izvidjaj, dizajn, implementacija u worktreeu, protivnicki pregled, gate',
  whenToUse: 'Kad Fable dobije zadatak koji trazi izmjenu koda u Lekti; Fable ga opise, ne kodira.',
  phases: [
    { title: 'Izvidjaj', detail: 'sto postoji, sto pravila brane, kriteriji prihvacanja', model: 'sonnet' },
    { title: 'Dizajn', detail: 'dva neovisna prijedloga, sudac bira', model: 'opus' },
    { title: 'Implementacija', detail: 'jedan implementator u vlastitom worktreeu, testovi uz kod', model: 'opus' },
    { title: 'Pregled', detail: 'tri protivnicka pregleda diffa; blokator vraca implementatoru', model: 'opus' },
    { title: 'Gate', detail: 'orphan-scan i npm run check u izoliranom stablu', model: 'sonnet' },
  ],
}

const task = args && args.task
if (!task || typeof task !== 'string') throw new Error('args.task je obavezan (opis zadatka)')
const hintFiles = (args && Array.isArray(args.files) ? args.files : []).join(', ')
const hintAcceptance = (args && Array.isArray(args.acceptance) ? args.acceptance : []).join('\n- ')
const branchHint = (args && typeof args.branch === 'string' && args.branch) ? args.branch : null

const PRAVILA = [
  'Radis u VLASTITOM git worktreeu (isolation), nikad u dijeljenom stablu. Prije prvog testa napravi junction na node_modules:',
  '  cmd //c mklink //J node_modules "C:\\Users\\PC\\Desktop\\Lekta\\node_modules"',
  'Commit ISKLJUCIVO `git commit --only <putanje> -F <datoteka s porukom>`; nikad `git add -A`, nikad `--amend`. Poruka na hrvatskom, bez em i en crtica.',
  'Ne diraj parser, citation ni repair kod bez golden testa koji PRVO dokazuje zateceno ponasanje; svaki novi gard ima mutaciju.',
  'Lekta nikad ne generira ni prepravlja sadrzaj rada; popravak je deterministican i bez modela.',
  'Migracije samo kroz `supabase db push`; nikad MCP apply_migration.',
  'Ne pushaj, ne otvaraj PR, ne mijenjaj CLAUDE.md ni AGENTS.md; to nije tvoj posao u ovom toku.',
  'Kad nesto ne mozes dokazati testom, kazi to izricito u izvjestaju umjesto da tvrdis.',
].join('\n')

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    rules: { type: 'array', items: { type: 'string' } },
    acceptance: { type: 'array', items: { type: 'string' } },
    tests: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'rules', 'acceptance', 'tests', 'risks'],
}

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    approach: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    testsToAdd: { type: 'array', items: { type: 'string' } },
    filesTouched: { type: 'array', items: { type: 'string' } },
    tradeoffs: { type: 'string' },
  },
  required: ['approach', 'steps', 'testsToAdd', 'filesTouched', 'tradeoffs'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    winner: { type: 'integer' },
    reason: { type: 'string' },
    graft: { type: 'array', items: { type: 'string' } },
  },
  required: ['winner', 'reason', 'graft'],
}

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    worktreePath: { type: 'string' },
    branch: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    changedFiles: { type: 'array', items: { type: 'string' } },
    commandsRun: { type: 'array', items: { type: 'string' } },
    testSummary: { type: 'string' },
    notProven: { type: 'array', items: { type: 'string' } },
  },
  required: ['worktreePath', 'branch', 'commits', 'changedFiles', 'commandsRun', 'testSummary', 'notProven'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          summary: { type: 'string' },
          failureScenario: { type: 'string' },
        },
        required: ['file', 'severity', 'summary', 'failureScenario'],
      },
    },
  },
  required: ['findings'],
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    orphanScan: { type: 'string' },
    testFilesLine: { type: 'string' },
    testsLine: { type: 'string' },
    exitCode: { type: 'integer' },
    failedFiles: { type: 'array', items: { type: 'string' } },
    buildOk: { type: 'boolean' },
  },
  required: ['orphanScan', 'testFilesLine', 'testsLine', 'exitCode', 'failedFiles', 'buildOk'],
}

// ---------------------------------------------------------------- 1. Izvidjaj (samo citanje)
phase('Izvidjaj')
log('Izvidjaj: sto postoji, sto pravila brane, koji su kriteriji prihvacanja')
const brief = await agent(
  `ZADATAK (od vlasnika, kroz Fable):\n${task}\n\n` +
  (hintFiles ? `Vjerojatno pogodjene datoteke: ${hintFiles}\n` : '') +
  (hintAcceptance ? `Kriteriji prihvacanja koje je pozivatelj dao:\n- ${hintAcceptance}\n` : '') +
  `\nSAMO CITAJ, nista ne mijenjaj. Napravi kratak brief za implementatora: sto u repozitoriju vec postoji za ovaj ` +
  `zadatak (datoteke, funkcije, testovi, gardovi), koja tvrda pravila iz CLAUDE.md ga posebno pogadjaju (imenuj ih), ` +
  `koji su kriteriji prihvacanja IZVAN diffa (plan, dokument, mjerenje; ako pozivatelj nije dao kriterije, izvedi ih iz ` +
  `docs/agents/development-plan.md ili docs/quality/*.md i reci odakle), koje testove treba pokrenuti i koji su rizici. ` +
  `Vrati strukturirano.`,
  // Bez `agentType: 'Explore'`: izmjereno 2026-09-12, Explore agent uz schemu 5 puta nije popunio obavezna polja
  // (StructuredOutput retry cap). Zadani workflow podagent sa Sonnetom postuje schemu; "samo citaj" je u promptu.
  { phase: 'Izvidjaj', model: 'sonnet', effort: 'medium', schema: BRIEF_SCHEMA },
)
if (!brief) throw new Error('izvidjaj nije vratio brief')
log(`Brief: ${brief.summary.slice(0, 160)}`)

// ---------------------------------------------------------------- 2. Dizajn (dva prijedloga, sudac)
phase('Dizajn')
const briefText = JSON.stringify(brief, null, 1)
const angles = [
  'najmanji diff koji ispunjava kriterije, bez nove apstrakcije',
  'cisti modul s vlastitim testom i mutacijom garda, pa tanko ozicenje',
]
const designs = (await parallel(angles.map((angle, i) => () => agent(
  `ZADATAK:\n${task}\n\nBRIEF IZVIDJAJA:\n${briefText}\n\nPredlozi implementaciju iz kuta: "${angle}". SAMO CITAJ. ` +
  `Vrati korake, datoteke, testove koje treba dodati i kompromise. Ne pisi kod.`,
  { phase: 'Dizajn', label: `dizajn:${i + 1}`, model: 'sonnet', effort: 'medium', schema: DESIGN_SCHEMA },
)))).filter(Boolean)
if (!designs.length) throw new Error('nijedan dizajn nije vracen')

let chosen = designs[0]
if (designs.length > 1) {
  const verdict = await agent(
    `ZADATAK:\n${task}\n\nBRIEF:\n${briefText}\n\nPRIJEDLOZI:\n` +
    designs.map((d, i) => `#${i}: ${JSON.stringify(d, null, 1)}`).join('\n\n') +
    `\n\nOdaberi prijedlog koji najbolje postuje tvrda pravila (golden prije izmjene parsera/popravka, gard s mutacijom, ` +
    `deterministican popravak, najmanji rizik u dijeljenom stablu) i kriterije prihvacanja. Vrati indeks pobjednika, ` +
    `razlog i sto od gubitnika treba PRESADITI (graft).`,
    { phase: 'Dizajn', label: 'sudac', model: 'opus', effort: 'high', schema: VERDICT_SCHEMA },
  )
  if (verdict && designs[verdict.winner]) {
    chosen = designs[verdict.winner]
    chosen = { ...chosen, graft: verdict.graft, judgeReason: verdict.reason }
    log(`Dizajn #${verdict.winner}: ${verdict.reason.slice(0, 140)}`)
  }
}

// ---------------------------------------------------------------- 3. Implementacija (jedan implementator, worktree)
phase('Implementacija')
const implPrompt = (round, reviewFindings, prev) =>
  `ZADATAK:\n${task}\n\nBRIEF:\n${briefText}\n\nODABRANI DIZAJN:\n${JSON.stringify(chosen, null, 1)}\n\n` +
  (branchHint ? `Grana: ${branchHint}\n` : 'Granu imenuj wf/<kratko-ime-zadatka>.\n') +
  `PRAVILA RADA:\n${PRAVILA}\n\n` +
  (round === 1
    ? `Implementiraj po dizajnu: prvo golden ili karakterizacijski test zatecenog ponasanja gdje pravila to traze, ` +
      `zatim izmjena, zatim testovi za novo ponasanje (uz mutaciju za svaki novi gard). Pokreni ciljane vitest ` +
      `datoteke, \`npx tsc --noEmit\` i \`npm run orphan-scan\`. Commitaj po koracima s \`--only\`.`
    : `Ovo je krug ${round}. Nastavi u ISTOM worktreeu (${prev.worktreePath}, grana ${prev.branch}). Pregled je nasao ` +
      `blokatore koje MORAS rijesiti (svaki je konkretan; ako smatras da je nalaz kriv, dokazi testom i to napisi):\n` +
      `${JSON.stringify(reviewFindings, null, 1)}\n\nPopravi, dopuni testove, pokreni iste provjere i commitaj s --only.`) +
  `\n\nVrati putanju worktreea, granu, commite (sha + naslov), promijenjene datoteke, TOCNE naredbe koje si pokrenuo, ` +
  `sazetak testova (redak Test Files) i sto NISI mogao dokazati.`

let impl = await agent(implPrompt(1, [], null), {
  phase: 'Implementacija', label: 'implementator', model: 'opus', effort: 'high', schema: IMPL_SCHEMA, isolation: 'worktree',
})
if (!impl) throw new Error('implementator nije vratio izvjestaj')
log(`Implementacija: ${impl.commits.length} commit(a) na ${impl.branch}; ${impl.testSummary.slice(0, 120)}`)

// ---------------------------------------------------------------- 4. Protivnicki pregled (tri lece), max 2 kruga popravka
phase('Pregled')
const LENSES = [
  ['ispravnost', 'Trazi stvarne kvarove: krivi rezultat, iznimku, regresiju ponasanja, test koji prolazi vakuumski (mjeri krivu stvar ili nista).'],
  ['pravila-repozitorija', 'Trazi krsenje tvrdih pravila: izmjena parsera/citation/repair bez goldena, gard bez mutacije, Lekta koja dira sadrzaj rada, artefakt regeneriran u dijeljenom stablu, commit bez --only, migracija mimo db push.'],
  ['dokaz', 'Trazi tvrdnje bez dokaza: kriterij prihvacanja koji nijedan test ne mjeri, "radi" bez izlaza naredbe, notProven koji je zapravo obavezan.'],
]
let review = []
let round = 1
while (true) {
  const found = (await parallel(LENSES.map(([lens, uputa]) => () => agent(
    `PREGLED DIFFA, leca "${lens}". Worktree: ${impl.worktreePath}, grana ${impl.branch}. Pokreni \`git log --oneline origin/master..HEAD\` ` +
    `i \`git diff origin/master...HEAD\` U TOM worktreeu i procitaj promjene; SAMO CITAJ i pokreci testove, nista ne mijenjaj.\n\n` +
    `ZADATAK:\n${task}\n\nKRITERIJI PRIHVACANJA:\n- ${brief.acceptance.join('\n- ')}\n\nIZVJESTAJ IMPLEMENTATORA:\n${JSON.stringify(impl, null, 1)}\n\n` +
    `${uputa}\nPokusaj OBORITI da je zadatak ispunjen. Svaki nalaz s datotekom, retkom, tezinom (blocker samo ako obara ` +
    `kriterij prihvacanja ili tvrdo pravilo) i konkretnim scenarijem kvara. Bez nalaza vrati prazan popis; ne izmisljaj.`,
    { phase: 'Pregled', label: `pregled:${lens}:${round}`, model: 'opus', effort: 'high', schema: REVIEW_SCHEMA },
  )))).filter(Boolean).flatMap((r) => r.findings)
  review = found
  const blockers = found.filter((f) => f.severity === 'blocker')
  log(`Pregled krug ${round}: ${found.length} nalaza, ${blockers.length} blokatora`)
  if (!blockers.length || round >= 3) break
  round += 1
  phase('Implementacija')
  const next = await agent(implPrompt(round, blockers, impl), {
    phase: 'Implementacija', label: `implementator:${round}`, model: 'opus', effort: 'high', schema: IMPL_SCHEMA,
  })
  if (!next) break
  impl = { ...next, worktreePath: next.worktreePath || impl.worktreePath, commits: [...impl.commits, ...next.commits] }
  phase('Pregled')
}

// ---------------------------------------------------------------- 5. Gate u izoliranom stablu
phase('Gate')
const gate = await agent(
  `U worktreeu ${impl.worktreePath} (grana ${impl.branch}) pokreni, tim redom, i vrati TOCNE retke izlaza:\n` +
  `1. \`npm run orphan-scan\`\n` +
  `2. \`VITEST_MAX_THREADS=2 npm run check > gate.log 2>&1; echo EXIT=$?\` pa iz gate.log procitaj retke "Test Files" i "Tests", ` +
  `popis FAIL datoteka i je li build prosao ("built in"). Ishod citaj iz retka Test Files, NIKAD iz izlaznog koda omotaca. ` +
  `Ako node_modules nedostaje, prvo napravi junction (vidi pravila). Nista ne mijenjaj u kodu.\n\nPRAVILA:\n${PRAVILA}`,
  { phase: 'Gate', label: 'gate', model: 'sonnet', effort: 'low', schema: GATE_SCHEMA },
)

const blockersLeft = review.filter((f) => f.severity === 'blocker')
const report = [
  `Zadatak: ${task}`,
  `Grana: ${impl.branch} (${impl.worktreePath})`,
  `Commiti: ${impl.commits.join(' | ')}`,
  `Gate: ${gate ? `${gate.testFilesLine} / ${gate.testsLine} / exit ${gate.exitCode} / build ${gate.buildOk ? 'OK' : 'PAO'}` : 'nije izmjeren'}`,
  `Pregled: ${review.length} nalaza, ${blockersLeft.length} blokatora preostalo`,
  `Nije dokazano: ${impl.notProven.length ? impl.notProven.join('; ') : 'nista'}`,
  blockersLeft.length || (gate && gate.exitCode !== 0) ? 'STATUS: NIJE ZA PUSH' : 'STATUS: spremno za push i PR (na rijec vlasnika)',
].join('\n')
log(report.split('\n').pop())
return { branch: impl.branch, worktreePath: impl.worktreePath, commits: impl.commits, gate, review, brief, design: chosen, report }
