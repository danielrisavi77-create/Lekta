// LEKTA: LEAN workflow bez Fablea.
//
// Isti ugovor kao `.claude/workflows/lekta-no-fable-coding.js` (Fable ne kodira, komplet izoliran worktree IZVAN
// repozitorija, commit iskljucivo --only, gate cita redak `Test Files`, izvjestaj zavrsava STATUS retkom), ali s
// manje agenata za zadatke koji ne trebaju puni lanac. Izmjereno na starom workflowu: 13-14 agenata i 1.6-2.5M
// tokena po zadatku, najskuplji dio su dva neovisna dizajna + sudac (3 agenta) i tri Opus pregleda po krugu (do 9
// agenata samo za pregled kroz 3 kruga). lekta-lean cilja 3-5x manje tokena kroz manje agenata i krace promptove
// (svaki agent dobiva samo diff/popis datoteka/kriterije, ne cijeli CLAUDE.md ni "istrazi sire" zadatak).
//
// Ulaz: args = {
//   task: string,               obavezno, sto treba napraviti
//   files?: string[],           datoteke koje zadatak vjerojatno dira (opseg, ne samo pomoc)
//   acceptance?: string[],      kriteriji prihvacanja izvan diffa
//   branch?: string,            ime grane; bez njega implementator sam bira wf/<kratko-ime>
//   mode?: 'light'|'standard'|'full',   zadano 'standard'
//   design?: boolean,           zadano false; standard only, dodaje jednog dizajnera
//   checkScope?: 'targeted'|'full',     zadano: 'full' ako ijedna staza u files pocinje sa src/, scripts/ ili
//                                       supabase/, inace 'targeted'
// }
//
// Izlaz: { mode, branch, worktreePath, commits, gate, review, report } - report zavrsava STATUS retkom:
//   'STATUS: spremno za push i PR (na rijec vlasnika)' | 'STATUS: NIJE ZA PUSH' | 'STATUS: PREKINUTO (limit)'
export const meta = {
  name: 'lekta-lean',
  description: 'Manja, jeftinija verzija workflowa bez Fablea: light/standard/full modovi po velicini zadatka',
  whenToUse:
    'Kad zadatak NE dira parser/citation/repair/security/supabase (za to je lekta-no-fable-coding): docs, ' +
    'status, config i tekst idu u mode light, kod izvan zasticenih podrucja u mode standard.',
  phases: [
    { title: 'Brief', detail: 'sazet popis datoteka, pravila i kriterija, bez punog izvidjaja repoa', model: 'sonnet' },
    { title: 'Implementacija', detail: 'jedan implementator u vlastitom worktreeu, testovi uz kod', model: 'opus' },
    { title: 'Pregled', detail: 'jedna kombinirana protivnicka leca ili laki verifikator diffa', model: 'sonnet' },
    { title: 'Gate', detail: 'orphan-scan i ciljani ili puni npm run check u izoliranom stablu', model: 'sonnet' },
  ],
}

// ---------------------------------------------------------------- ulaz i validacija
const task = args && args.task
if (!task || typeof task !== 'string') throw new Error('args.task je obavezan (opis zadatka)')

const mode = (args && args.mode) || 'standard'
if (mode !== 'light' && mode !== 'standard' && mode !== 'full') {
  throw new Error(`args.mode nepoznat: "${mode}" (dopusteno: light, standard, full)`)
}

if (mode === 'full') {
  // Namjerno NE duplicira 267 redaka lekta-no-fable-coding.js. Full je za parser/citation/repair/security/supabase:
  // treba puni izvidjaj + dva neovisna dizajna + sudac + tri protivnicke pregleda po krugu, sto je upravo taj
  // workflow. Ovdje se to samo imenuje, ne ponavlja.
  throw new Error(
    'mode "full" nije podrzan u lekta-lean. Za parser/citation/repair/security/supabase kod pokreni postojeci ' +
    'workflow lekta-no-fable-coding (puni izvidjaj, dva neovisna dizajna + sudac, tri protivnicka pregleda po ' +
    'krugu). lekta-lean postoji da bude jeftiniji za manje rizicne zadatke, ne da duplicira taj lanac.'
  )
}

const files = (args && Array.isArray(args.files)) ? args.files.filter((f) => typeof f === 'string') : []
const hintFiles = files.join(', ')
const hintAcceptance = (args && Array.isArray(args.acceptance) ? args.acceptance : []).join('\n- ')
const branchHint = (args && typeof args.branch === 'string' && args.branch) ? args.branch : null
const designWanted = mode === 'standard' && !!(args && args.design)

const PROTECTED_PREFIXES = ['src/', 'scripts/', 'supabase/']
const touchesProtected = files.some((f) => PROTECTED_PREFIXES.some((p) => f.startsWith(p)))
const checkScope = (args && (args.checkScope === 'targeted' || args.checkScope === 'full'))
  ? args.checkScope
  : (touchesProtected ? 'full' : 'targeted')

// ---------------------------------------------------------------- zajednicka pravila (kratka verzija)
const WT_BASE = 'C:/Users/PC/AppData/Local/Temp/claude/lekta-wf'
const PRAVILA = [
  'Radis u VLASTITOM git worktreeu IZVAN repozitorija, nikad u dijeljenom stablu (cwd je dijeljeno stablo: u njemu NE mijenjaj nista).',
  `Napravi ga prvo: git fetch origin && git worktree add --detach "${WT_BASE}/<ime-grane-bez-kose-crte>" origin/master, pa u njemu git checkout -b <grana>.`,
  'Prije prvog testa u worktreeu napravi junction na node_modules: cmd //c mklink //J node_modules "C:\\Users\\PC\\Desktop\\Lekta\\node_modules"',
  'Svaku naredbu pokreci s `git -C <worktree>` ili nakon `cd` u worktree; provjeri `git rev-parse --show-toplevel` da si u njemu.',
  'Commit ISKLJUCIVO `git commit --only <putanje> -F <datoteka s porukom>`; nikad `git add -A`/`.`/`-u`, nikad `--amend`. Poruka na hrvatskom, bez em i en crtica.',
  'Diraj SAMO staze koje zadatak navodi (args.files ili ono sto brief imenuje); ako trebas jos jednu, imenuj je u izvjestaju umjesto da je diras bez razloga.',
  'Ne diraj parser, citation ni repair kod bez golden testa koji PRVO dokazuje zateceno ponasanje; svaki novi gard ima mutaciju.',
  'Lekta nikad ne generira ni prepravlja sadrzaj rada; popravak je deterministican i bez modela.',
  'Migracije samo kroz `supabase db push`; nikad MCP apply_migration.',
  'Ne pushaj, ne otvaraj PR, ne mijenjaj CLAUDE.md ni AGENTS.md; to nije tvoj posao u ovom toku.',
  'Kad nesto ne mozes dokazati testom, kazi to izricito u izvjestaju umjesto da tvrdis.',
].join('\n')

// ---------------------------------------------------------------- limit-stop: bilo koji agent moze javiti da je
// pogodio spend/usage/rate limit; workflow tada ODMAH staje umjesto da nastavi na necjelovitom odgovoru.
class LimitStop extends Error {
  constructor(label) {
    super(`limit tijekom faze: ${label}`)
    this.label = label
  }
}
class AgentFailure extends Error {
  constructor(label) {
    super(`agent nije vratio rezultat: ${label}`)
    this.label = label
  }
}
const LIMIT_RE = /\b(spend limit|usage limit|rate limit)\b/i
function mentionsLimit(value) {
  let text = ''
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = ''
  }
  return LIMIT_RE.test(text || '')
}
async function runAgent(label, prompt, opts) {
  const result = await agent(prompt, opts)
  if (mentionsLimit(result)) throw new LimitStop(label)
  if (result === null) throw new AgentFailure(label)
  return result
}

// ---------------------------------------------------------------- shemasi (kraci nego u punom workflowu)
const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    rules: { type: 'array', items: { type: 'string' } },
    acceptance: { type: 'array', items: { type: 'string' } },
  },
  required: ['files', 'rules', 'acceptance'],
}
const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    approach: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    filesTouched: { type: 'array', items: { type: 'string' } },
  },
  required: ['approach', 'steps', 'filesTouched'],
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
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    reason: { type: 'string' },
    outOfScope: { type: 'array', items: { type: 'string' } },
    forbiddenPaths: { type: 'array', items: { type: 'string' } },
  },
  required: ['pass', 'reason', 'outOfScope', 'forbiddenPaths'],
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

const agentCounts = { brief: 0, design: 0, implementation: 0, review: 0, gate: 0 }

// ================================================================== MODE: light (docs/tasks.json/config/tekst)
async function runLight() {
  phase('Implementacija')
  const implPrompt =
    `ZADATAK (docs/config/tekst, nizak rizik):\n${task}\n\n` +
    (hintFiles ? `Datoteke koje zadatak dira (drzi se OVOG popisa):\n${hintFiles}\n` : '') +
    (hintAcceptance ? `Kriteriji prihvacanja:\n- ${hintAcceptance}\n` : '') +
    (branchHint ? `Grana: ${branchHint}\n` : 'Granu imenuj wf/<kratko-ime-zadatka>.\n') +
    `PRAVILA RADA:\n${PRAVILA}\n\n` +
    `Napravi worktree, primijeni izmjenu, commitaj s --only. Pokreni SAMO ciljane provjere: ` +
    `\`npm run orphan-scan\` te \`npx vitest run <datoteke koje odgovaraju izmjeni>\` ako izmjena dira src/, ` +
    `scripts/, supabase/ ili ima odgovarajuci test; ako je diff iskljucivo unutar docs/ ili slicnog cistog teksta ` +
    `bez ijednog testa, pokreni SAMO orphan-scan. NE pokreci puni \`npm run check\`.\n\n` +
    `Vrati putanju worktreea, granu, commite (sha + naslov), promijenjene datoteke, tocne naredbe koje si pokrenuo, ` +
    `sazetak testova i sto nisi mogao dokazati.`
  const impl = await runAgent('implementator (light)', implPrompt, {
    phase: 'Implementacija', label: 'implementator', model: 'sonnet', effort: 'medium', schema: IMPL_SCHEMA,
  })
  agentCounts.implementation += 1
  log(`Implementacija (light): ${impl.commits.length} commit(a) na ${impl.branch}`)

  phase('Pregled')
  const verifyPrompt =
    `VERIFIKACIJA (light, brza): worktree ${impl.worktreePath}, grana ${impl.branch}. Pokreni SAMO ` +
    `\`git log --oneline origin/master..HEAD\` i \`git diff origin/master...HEAD\` U TOM worktreeu; SAMO CITAJ, ` +
    `nista ne mijenjaj. Ne istrazuj repo sire od diffa.\n\n` +
    `ZADATAK:\n${task}\n\n` +
    (hintFiles ? `Dopusteni opseg (files):\n${hintFiles}\n` : 'Opseg nije zadan popisom; prosudi po zadatku.\n') +
    (hintAcceptance ? `Kriteriji prihvacanja:\n- ${hintAcceptance}\n` : '') +
    `\nIZVJESTAJ IMPLEMENTATORA:\n${JSON.stringify(impl, null, 1)}\n\n` +
    `Tvrdi pass/fail: je li diff UNUTAR dopustenog opsega, ima li ijedna zabranjena staza (CLAUDE.md, AGENTS.md, ` +
    `CI konfiguracija, package.json scripts) dirnuta bez razloga u zadatku, i je li svaki kriterij prihvacanja ` +
    `ispunjen. Vrati pass/fail, razlog, popis staza izvan opsega i popis zabranjenih staza (prazno ako nema).`
  const verdict = await runAgent('verifikator (light)', verifyPrompt, {
    phase: 'Pregled', label: 'verifikator', model: 'sonnet', effort: 'low', schema: VERIFY_SCHEMA,
  })
  agentCounts.review += 1

  const report = [
    `Mode: light`,
    `Zadatak: ${task}`,
    `Grana: ${impl.branch} (${impl.worktreePath})`,
    `Commiti: ${impl.commits.join(' | ')}`,
    `Testovi (implementator): ${impl.testSummary}`,
    `Verifikacija: ${verdict.pass ? 'PROSAO' : 'PAO'} - ${verdict.reason}`,
    verdict.outOfScope.length ? `Izvan opsega: ${verdict.outOfScope.join(', ')}` : null,
    verdict.forbiddenPaths.length ? `Zabranjene staze dirnute: ${verdict.forbiddenPaths.join(', ')}` : null,
    `Nije dokazano: ${impl.notProven.length ? impl.notProven.join('; ') : 'nista'}`,
    `Agenti po fazi: implementacija ${agentCounts.implementation}, pregled ${agentCounts.review} (ukupno ${agentCounts.implementation + agentCounts.review})`,
    (!verdict.pass || verdict.forbiddenPaths.length) ? 'STATUS: NIJE ZA PUSH' : 'STATUS: spremno za push i PR (na rijec vlasnika)',
  ].filter(Boolean).join('\n')
  log(report.split('\n').pop())
  return { mode: 'light', branch: impl.branch, worktreePath: impl.worktreePath, commits: impl.commits, gate: null, review: verdict, report }
}

// ================================================================== MODE: standard (kod izvan zasticenih podrucja)
async function runStandard() {
  // 1. Brief - ogranicen: popis datoteka + relevantna pravila + kriteriji, BEZ punog izvidjaja repoa.
  phase('Brief')
  const briefPrompt =
    `ZADATAK:\n${task}\n\n` +
    (hintFiles ? `Vjerojatno pogodjene datoteke:\n${hintFiles}\n` : '') +
    (hintAcceptance ? `Kriteriji prihvacanja koje je pozivatelj dao:\n- ${hintAcceptance}\n` : '') +
    `\nNAPRAVI KRATAK BRIEF, najvise 40 redaka: (1) popis datoteka koje ce se dirati (potvrdi ili dopuni popis ` +
    `iznad, ne istrazuj cijeli repo), (2) SAMO tvrda pravila iz CLAUDE.md koja se odnose bas na TE staze ` +
    `(imenuj pravilo, ne prepisuj cijeli odjeljak), (3) kriteriji prihvacanja (koristi dane ili izvedi kratko ako ` +
    `nedostaju, bez sireg istrazivanja). SAMO CITAJ, nista ne mijenjaj.`
  const brief = await runAgent('brief', briefPrompt, {
    phase: 'Brief', label: 'brief', model: 'sonnet', effort: 'low', schema: BRIEF_SCHEMA,
  })
  agentCounts.brief += 1
  const briefText = JSON.stringify(brief, null, 1)
  log(`Brief: ${brief.files.length} datoteka, ${brief.rules.length} pravila`)

  // 2. (opcionalno) jedan dizajner - jedan prijedlog, najmanji diff, bez drugog prijedloga i bez suca.
  let design = null
  if (designWanted) {
    const designPrompt =
      `ZADATAK:\n${task}\n\nBRIEF:\n${briefText}\n\nPredlozi NAJMANJI diff koji ispunjava kriterije, bez nove ` +
      `apstrakcije. SAMO CITAJ i predlozi, ne pisi kod. Vrati pristup, korake i datoteke koje ce se dirati.`
    design = await runAgent('dizajner', designPrompt, {
      phase: 'Brief', label: 'dizajner', model: 'sonnet', effort: 'medium', schema: DESIGN_SCHEMA,
    })
    agentCounts.design += 1
    log(`Dizajn: ${design.approach.slice(0, 140)}`)
  }

  // 3. Implementator (Opus, worktree).
  phase('Implementacija')
  const implPrompt = (round, reviewFindings, prev) =>
    `ZADATAK:\n${task}\n\nBRIEF:\n${briefText}\n\n` +
    (design ? `PRIJEDLOG DIZAJNA (najmanji diff):\n${JSON.stringify(design, null, 1)}\n\n` : '') +
    (branchHint ? `Grana: ${branchHint}\n` : 'Granu imenuj wf/<kratko-ime-zadatka>.\n') +
    `PRAVILA RADA:\n${PRAVILA}\n\n` +
    (round === 1
      ? `Implementiraj: prvo golden ili karakterizacijski test zatecenog ponasanja gdje pravila to traze, zatim ` +
        `izmjena, zatim testovi za novo ponasanje (uz mutaciju za svaki novi gard, plus baseline tvrdnju). Pokreni ` +
        `ciljane vitest datoteke, \`npx tsc --noEmit\` i \`npm run orphan-scan\`. Commitaj s \`--only\`.`
      : `Ovo je krug popravka (najvise jedan u ovom workflowu). Nastavi u ISTOM worktreeu (${prev.worktreePath}, ` +
        `grana ${prev.branch}). Pregled je nasao ovo sto MORAS rijesiti (ako smatras nalaz krivim, dokazi testom i ` +
        `napisi zasto u notProven):\n${JSON.stringify(reviewFindings, null, 1)}\n\nPopravi, dopuni testove, pokreni ` +
        `iste provjere i commitaj s --only.`) +
    `\n\nVrati putanju worktreea, granu, commite (sha + naslov), promijenjene datoteke, tocne naredbe koje si ` +
    `pokrenuo, sazetak testova (redak Test Files ako je vitest pokretan) i sto nisi mogao dokazati.`

  let impl = await runAgent('implementator', implPrompt(1, [], null), {
    phase: 'Implementacija', label: 'implementator', model: 'opus', effort: 'high', schema: IMPL_SCHEMA,
  })
  agentCounts.implementation += 1
  log(`Implementacija: ${impl.commits.length} commit(a) na ${impl.branch}; ${impl.testSummary.slice(0, 120)}`)

  // 4. JEDAN protivnicki pregled, kombinirana leca (checklist od 8 tocaka), najvise 1 krug popravka.
  phase('Pregled')
  const CHECKLIST = [
    '1. Test vidljivog teksta: ako popravak dira XML/dokument koji korisnik vidi, usporedi SPOJENI tekst prije i poslije, ne sirovi XML.',
    '2. Svaki novi gard ima MUTACIJU (podmetnut poznat kvar, gard ga hvata) I baseline (cist ulaz prolazi).',
    '3. Ako se tvrdi idempotencija ili zastita koja djeluje "samo prvi put", dokazana je DVAMA prolazima, ne jednim.',
    '4. Usporedba tekstualnih datoteka normalizira CR/CRLF prije usporedbe velicine ili sadrzaja.',
    '5. Commit je iskljucivo `git commit --only`, nikad `git add -A/.-u` ni `--amend`.',
    '6. Nema izmjena kontrolnih/gate staza (CI konfiguracija, package.json scripts, klasifikacijski manifest) osim ako je to bas zadatak.',
    '7. Nema izmisljenih pravila: bodovano pravilo ima sourceId/citat, nikad nagadjanje.',
    '8. Mehanizam koji tvrdi da nesto broji ili hvata ima VLASTITI brojac razlicit od nule, ne oslanja se samo na nizvodnu mjeru koja se mogla popraviti iz drugog razloga.',
  ].join('\n')
  const reviewPrompt = (round) =>
    `PROTIVNICKI PREGLED DIFFA, jedna kombinirana leca (ispravnost + dokaz + pravila repozitorija). Worktree: ` +
    `${impl.worktreePath}, grana ${impl.branch}. Pokreni \`git log --oneline origin/master..HEAD\` i ` +
    `\`git diff origin/master...HEAD\` U TOM worktreeu; SAMO CITAJ i pokreci testove, nista ne mijenjaj. Ne ` +
    `istrazuj repo sire od diffa.\n\nZADATAK:\n${task}\n\nKRITERIJI PRIHVACANJA:\n- ${brief.acceptance.join('\n- ')}\n\n` +
    `IZVJESTAJ IMPLEMENTATORA:\n${JSON.stringify(impl, null, 1)}\n\nPROVJERI KROZ SVIH 8 TOCAKA:\n${CHECKLIST}\n\n` +
    `Pokusaj OBORITI da je zadatak ispunjen. Svaki nalaz s datotekom, retkom (ako primjenjivo), tezinom ` +
    `(blocker/major samo ako obara kriterij prihvacanja ili tvrdo pravilo iz checkliste) i konkretnim scenarijem ` +
    `kvara. Bez nalaza vrati prazan popis; ne izmisljaj.`

  let review = (await runAgent('pregled', reviewPrompt(1), {
    phase: 'Pregled', label: 'pregled', model: 'opus', effort: 'high', schema: REVIEW_SCHEMA,
  })).findings
  agentCounts.review += 1
  let blockers = review.filter((f) => f.severity === 'blocker' || f.severity === 'major')
  log(`Pregled: ${review.length} nalaza, ${blockers.length} blokatora`)

  if (blockers.length) {
    phase('Implementacija')
    const fixed = await runAgent('implementator (popravak)', implPrompt(2, blockers, impl), {
      phase: 'Implementacija', label: 'implementator:popravak', model: 'opus', effort: 'high', schema: IMPL_SCHEMA,
    })
    agentCounts.implementation += 1
    impl = { ...fixed, worktreePath: fixed.worktreePath || impl.worktreePath, commits: [...impl.commits, ...fixed.commits] }
    log(`Popravak: ${fixed.commits.length} dodatnih commita`)

    phase('Pregled')
    review = (await runAgent('pregled (ponovno)', reviewPrompt(2), {
      phase: 'Pregled', label: 'pregled:2', model: 'opus', effort: 'high', schema: REVIEW_SCHEMA,
    })).findings
    agentCounts.review += 1
    blockers = review.filter((f) => f.severity === 'blocker' || f.severity === 'major')
    log(`Pregled (ponovno): ${review.length} nalaza, ${blockers.length} blokatora preostalo`)
  }

  // 5. Gate.
  phase('Gate')
  const targetFiles = files.length ? files : impl.changedFiles
  const gatePrompt =
    checkScope === 'full'
      ? `U worktreeu ${impl.worktreePath} (grana ${impl.branch}) pokreni, tim redom, i vrati TOCNE retke izlaza:\n` +
        `1. \`npm run orphan-scan\`\n` +
        `2. \`(VITEST_MAX_THREADS=2 npm run check > gate.log 2>&1; echo EXIT=$? >> gate.log)\` U POZADINI ` +
        `(run_in_background), traje 25-40 min. CEKAJ kraj provjeravajuci svakih 60 s \`grep -c "^EXIT=" gate.log\` ` +
        `dok ne bude 1; NE vracaj izvjestaj prije toga. Iz gate.log procitaj retke "Test Files" i "Tests", popis ` +
        `FAIL datoteka i je li build prosao ("built in"). Ishod citaj iz retka Test Files, NIKAD iz izlaznog koda ` +
        `omotaca. Ako node_modules nedostaje, napravi junction (vidi pravila). Nista ne mijenjaj u kodu.\n\nPRAVILA:\n${PRAVILA}`
      : `U worktreeu ${impl.worktreePath} (grana ${impl.branch}) pokreni:\n` +
        `1. \`npm run orphan-scan\`\n` +
        `2. \`npx vitest run ${targetFiles.length ? targetFiles.join(' ') : '<datoteke koje diff pogadja>'} > gate.log 2>&1; echo EXIT=$? >> gate.log\`\n` +
        `Ovo je CILJANI gate (checkScope=targeted), ne puni \`npm run check\`: NE pokreci build ni oxlint, vrati ` +
        `\`buildOk: true\` s napomenom u testFilesLine da build nije pokretan. Procitaj iz gate.log retke ` +
        `"Test Files" i "Tests", popis FAIL datoteka i exit kod. Nista ne mijenjaj u kodu.\n\nPRAVILA:\n${PRAVILA}`
  const gate = await runAgent('gate', gatePrompt, {
    phase: 'Gate', label: 'gate', model: 'sonnet', effort: 'low', schema: GATE_SCHEMA,
  })
  agentCounts.gate += 1

  const blockersLeft = review.filter((f) => f.severity === 'blocker')
  const totalAgents = agentCounts.brief + agentCounts.design + agentCounts.implementation + agentCounts.review + agentCounts.gate
  const report = [
    `Mode: standard (checkScope: ${checkScope}${designWanted ? ', design: da' : ''})`,
    `Zadatak: ${task}`,
    `Grana: ${impl.branch} (${impl.worktreePath})`,
    `Commiti: ${impl.commits.join(' | ')}`,
    `Gate: ${gate.testFilesLine} / ${gate.testsLine} / exit ${gate.exitCode} / build ${gate.buildOk ? 'OK' : 'PAO'}`,
    `Pregled: ${review.length} nalaza, ${blockersLeft.length} blokatora preostalo`,
    `Nije dokazano: ${impl.notProven.length ? impl.notProven.join('; ') : 'nista'}`,
    `Agenti po fazi: brief ${agentCounts.brief}, dizajn ${agentCounts.design}, implementacija ${agentCounts.implementation}, pregled ${agentCounts.review}, gate ${agentCounts.gate} (ukupno ${totalAgents})`,
    (blockersLeft.length || gate.exitCode !== 0) ? 'STATUS: NIJE ZA PUSH' : 'STATUS: spremno za push i PR (na rijec vlasnika)',
  ].join('\n')
  log(report.split('\n').pop())
  return { mode: 'standard', branch: impl.branch, worktreePath: impl.worktreePath, commits: impl.commits, gate, review, report }
}

// ---------------------------------------------------------------- pokretanje s hvatanjem limita
try {
  const result = mode === 'light' ? await runLight() : await runStandard()
  return result
} catch (err) {
  if (err instanceof LimitStop) {
    const report = [
      `Mode: ${mode}`,
      `Zadatak: ${task}`,
      `Prekinuto u fazi/agentu: ${err.label}`,
      'Nastavak: ponovno pokreni Workflow sa scriptPath iz ovog rezultata i resumeFromRunId iz ovog pokretanja; ' +
        'nepromijenjeni pozivi agenata vracaju se iz predmemorije.',
      'STATUS: PREKINUTO (limit)',
    ].join('\n')
    log(report.split('\n').pop())
    return { mode, branch: null, worktreePath: null, commits: [], gate: null, review: null, report }
  }
  if (err instanceof AgentFailure) {
    const report = [
      `Mode: ${mode}`,
      `Zadatak: ${task}`,
      `Agent nije vratio rezultat (moguc terminalni API kvar): ${err.label}`,
      'STATUS: NIJE ZA PUSH',
    ].join('\n')
    log(report.split('\n').pop())
    return { mode, branch: null, worktreePath: null, commits: [], gate: null, review: null, report }
  }
  throw err
}
