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
//   routingConfig?: object,     SADRZAJ config/agent-routing.json (JSON.parse); workflow skripte nemaju pristup
//                               datotekama, pa ga pozivatelj procita i preda. Bez njega: zadane vrijednosti uz
//                               upozorenje u reportu (vidi docs/agents/ROUTING.md, "Korak 2").
//   size?: 'S'|'M'|'L',         zadano iz mode (light=S, standard=M, full=L)
//   protected?: boolean,        pozivatelj izricito potvrduje da zadatak dira zasticenu stazu
// }
//
// Izlaz: { mode, branch, worktreePath, commits, gate, review, report } - report zavrsava STATUS retkom:
//   'STATUS: spremno za push i PR (na rijec vlasnika)' | 'STATUS: NIJE ZA PUSH' | 'STATUS: PREKINUTO (limit)' |
//   'STATUS: ZAUSTAVLJENO (kriticar)'
export const meta = {
  name: 'lekta-lean',
  description: 'Manja, jeftinija verzija workflowa bez Fablea: light/standard/full modovi po velicini zadatka',
  whenToUse: 'Kad zadatak NE dira parser/citation/repair/security/supabase (za to je lekta-no-fable-coding): docs, status, config i tekst idu u mode light, kod izvan zasticenih podrucja u mode standard.',
  phases: [
    { title: 'Brief', detail: 'sazet popis datoteka, pravila i kriterija, bez punog izvidjaja repoa' },
    { title: 'Kriticar', detail: 'najjeftiniji verificirani model, read-only; los plan zaustavlja run prije implementatora' },
    { title: 'Implementacija', detail: 'jedan implementator u vlastitom worktreeu, testovi uz kod' },
    { title: 'Pregled', detail: 'jedna kombinirana protivnicka leca ili laki verifikator diffa' },
    { title: 'Gate', detail: 'orphan-scan i ciljani ili puni npm run check u izoliranom stablu' },
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
const declaredProtected = !!(args && args.protected === true)

// ---------------------------------------------------------------- routing (korak 2): model i effort iz configa
// >>> DIJELJENO:select-route
const ROUTE_PHASES = ['brief', 'critic', 'implement', 'review', 'gate']
const ROUTE_SIZES = ['S', 'M', 'L']
const ROUTE_SIZE_BY_MODE = { light: 'S', standard: 'M', full: 'L' }
const ROUTE_EFFORTS = ['low', 'medium', 'high', 'xhigh']
const ROUTE_EFFORT_POLICY = {
  brief: 'low', critic: 'low', implement: 'high', implementProtected: 'xhigh', review: 'medium', gate: 'low',
}
// Zadane vrijednosti = lean skripta prije koraka 2 ('sonnet' -> claude-sonnet-5, 'opus' -> claude-opus-5).
// Dva namjerna odstupanja, oba zbog pravila drugog providera (review nikad isti model kao implement):
// review u S je claude-haiku-4-5 (prije sonnet uz sonnet implementatora), review u M/L je
// claude-sonnet-5 high (prije opus uz opus implementatora). critic prije nije postojao: sonnet low.
const ROUTE_DEFAULTS = {
  S: {
    brief: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
    critic: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
    implement: { provider: 'claude', model: 'claude-sonnet-5', effort: 'medium' },
    review: { provider: 'claude', model: 'claude-haiku-4-5', effort: 'low' },
    gate: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
  },
  M: {
    brief: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
    critic: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
    implement: { provider: 'claude', model: 'claude-opus-5', effort: 'high' },
    review: { provider: 'claude', model: 'claude-sonnet-5', effort: 'high' },
    gate: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
  },
  L: {
    brief: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
    critic: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
    implement: { provider: 'claude', model: 'claude-opus-5', effort: 'high' },
    review: { provider: 'claude', model: 'claude-sonnet-5', effort: 'high' },
    gate: { provider: 'claude', model: 'claude-sonnet-5', effort: 'low' },
  },
}

function routeIsProtected(files, protectedPaths) {
  const list = Array.isArray(files) ? files : []
  const paths = Array.isArray(protectedPaths) ? protectedPaths : []
  return list.some((raw) => {
    if (typeof raw !== 'string') return false
    const f = raw.replace(/\\/g, '/').replace(/^\.\//, '')
    return paths.some((p) => {
      if (typeof p !== 'string' || !p) return false
      const clean = p.replace(/\\/g, '/').replace(/\/+$/, '')
      if (f === clean || f.startsWith(clean + '/')) return true
      // Putanja bez kose crte (npr. "security") vrijedi kao segment bilo gdje u stazi.
      return !clean.includes('/') && f.split('/').includes(clean)
    })
  })
}

function routeAssertVerified(model, models, where) {
  if (model === null || model === undefined) return
  const spec = models[model]
  if (!spec || spec.status !== 'verified') {
    throw new Error(
      `selectRoute: model "${model}" (${where}) nije "verified" u config/agent-routing.json; ` +
      'neverificiran model ne smije dobiti ulogu',
    )
  }
}

function routeEffort(value, fallbackEffort) {
  return ROUTE_EFFORTS.includes(value) ? value : fallbackEffort
}

function routeCheapestVerified(config) {
  const models = config.models || {}
  const weights = config.costWeight || {}
  const ids = Object.keys(models).filter((id) => models[id] && models[id].status === 'verified' && id.startsWith('claude-'))
  ids.sort((a, b) => {
    const wa = typeof weights[a] === 'number' ? weights[a] : Infinity
    const wb = typeof weights[b] === 'number' ? weights[b] : Infinity
    return wa - wb || (a < b ? -1 : a > b ? 1 : 0)
  })
  return ids.length ? ids[0] : null
}

function selectRoute(input) {
  const o = input || {}
  const phase = o.phase
  if (!ROUTE_PHASES.includes(phase)) {
    throw new Error(`selectRoute: nepoznata faza "${phase}" (dopusteno: ${ROUTE_PHASES.join(', ')})`)
  }
  const config = o.config && typeof o.config === 'object' && !Array.isArray(o.config) ? o.config : {}
  const size = ROUTE_SIZES.includes(o.size) ? o.size : (ROUTE_SIZE_BY_MODE[o.mode] || 'M')
  const protectedPaths = Array.isArray(o.protectedPaths)
    ? o.protectedPaths
    : (Array.isArray(config.protectedPaths) ? config.protectedPaths : [])
  const isProtected = routeIsProtected(o.files, protectedPaths)
  const models = config.models && typeof config.models === 'object' ? config.models : {}
  const policy = Object.assign({}, ROUTE_EFFORT_POLICY, config.effortPolicy || {})
  const policyEffort = routeEffort(
    phase === 'implement' && isProtected ? policy.implementProtected : policy[phase],
    ROUTE_EFFORT_POLICY[phase === 'implement' && isProtected ? 'implementProtected' : phase],
  )
  const cell = config.routing && config.routing[size] ? config.routing[size][String(isProtected)] : null
  const roles = cell && cell.roles && typeof cell.roles === 'object' ? cell.roles : {}
  const base = { size, protected: isProtected }
  const defaultRoute = (ph) => {
    const d = ROUTE_DEFAULTS[size][ph]
    const effort = ph === 'implement' && isProtected ? 'xhigh' : d.effort
    return { provider: d.provider, model: d.model, effort }
  }

  let role = roles[phase]
  let source = 'config'
  if (!role && phase === 'critic') {
    const cheapest = routeCheapestVerified(config)
    if (cheapest) role = { provider: 'claude', model: cheapest, effort: policy.critic }
  }
  if (!role || typeof role !== 'object' || typeof role.provider !== 'string') {
    role = null
    source = 'default'
  }

  let route
  if (role) {
    routeAssertVerified(role.model, models, `${size}/${isProtected}/${phase}`)
    route = { provider: role.provider, model: role.model === undefined ? null : role.model, effort: routeEffort(role.effort, policyEffort) }
  } else {
    route = defaultRoute(phase)
  }

  if (phase === 'review') {
    const impl = selectRoute(Object.assign({}, o, { phase: 'implement' }))
    let fb = null
    if (role && role.reviewFallback && typeof role.reviewFallback === 'object') {
      routeAssertVerified(role.reviewFallback.model, models, `${size}/${isProtected}/review.reviewFallback`)
      fb = {
        provider: role.reviewFallback.provider,
        model: role.reviewFallback.model,
        effort: routeEffort(role.reviewFallback.effort, policyEffort),
      }
      if (fb.provider === impl.provider && fb.model === impl.model) {
        throw new Error(`selectRoute: reviewFallback ${size}/${isProtected} je isti model kao implementator (${impl.model})`)
      }
    }
    if (route.provider === impl.provider) {
      // Isti provider: pregled smije samo drugi model. Ako ga primarna uloga nema, uzima se fallback.
      if (route.model && route.model !== impl.model) return Object.assign(base, route, { fallback: fb, source })
      if (fb) return Object.assign(base, fb, { fallback: null, source: source + ':reviewFallback' })
      throw new Error(
        `selectRoute: review ${size}/${isProtected} ima istog providera i model kao implementator ` +
        `(${impl.provider}/${impl.model}) i nema valjan reviewFallback`,
      )
    }
    return Object.assign(base, route, { fallback: fb, source })
  }

  // Faza koju ne vodi Claude (npr. gate s provider "none") dobiva zadani Claude fallback, jer lean
  // skripta pokrece samo Claude agente.
  const fallback = route.provider === 'claude' ? null : defaultRoute(phase)
  return Object.assign(base, route, { fallback, source })
}

// Workflow `agent()` prima alias modela; tocna verzija ostaje zapisana u reportu.
function routeAgentModel(modelId) {
  if (typeof modelId !== 'string') return undefined
  if (/opus/.test(modelId)) return 'opus'
  if (/sonnet/.test(modelId)) return 'sonnet'
  if (/haiku/.test(modelId)) return 'haiku'
  return undefined
}
// <<< DIJELJENO:select-route

const routingWarnings = []
const routingUsed = []
let ROUTING_CONFIG = {}
try {
  const raw = args && args.routingConfig
  if (raw === undefined || raw === null) {
    routingWarnings.push('routingConfig nije predan (args.routingConfig); koristene su zadane vrijednosti iz select-route')
  } else {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.routing !== 'object') {
      throw new Error('nema objekt "routing"')
    }
    ROUTING_CONFIG = parsed
  }
} catch (err) {
  ROUTING_CONFIG = {}
  routingWarnings.push(`routingConfig neispravan (${err && err.message}); koristene su zadane vrijednosti iz select-route`)
}
const routeSize = (args && ROUTE_SIZES.includes(args.size)) ? args.size : undefined

// Vraca { model, effort } za agent(). Neverificiran model iz configa baca gresku i run staje: to je namjerno.
function routeFor(phase, routeFiles) {
  const r = selectRoute({ config: ROUTING_CONFIG, mode, size: routeSize, files: routeFiles || files, phase })
  const run = r.provider === 'claude' && r.model ? r : (r.fallback && r.fallback.provider === 'claude' ? r.fallback : null)
  if (!run) throw new Error(`routing: faza ${phase} nema pokretljiv Claude model (provider ${r.provider}, bez fallbacka)`)
  const note = run === r ? '' : ` (umjesto ${r.provider}${r.model ? '/' + r.model : ''})`
  const line = `${phase}: ${run.model} / ${run.effort}${note} [${r.source}, ${r.size}${r.protected ? ', zasticeno' : ''}]`
  if (!routingUsed.includes(line)) routingUsed.push(line)
  const opts = { effort: run.effort }
  const alias = routeAgentModel(run.model)
  if (alias) opts.model = alias
  return opts
}
function routingReportLines() {
  return [
    `Routing: ${routingUsed.length ? routingUsed.join(' | ') : 'nijedna faza nije pokrenuta'}`,
    ...routingWarnings.map((w) => `UPOZORENJE routing: ${w}`),
  ]
}

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
// >>> LEAN:agent-guard
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
// Valjan strukturirani odgovor (objekt s barem jednim poljem) nikad nije limit, cak i kad njegov tekst spominje
// "usage limit" (npr. zadatak o limitima). Prije ovog provjera je rusila run lazni LimitStop-om.
function hasPayload(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
}
function classifyAgentResult(result) {
  if (result === null || result === undefined) return 'failure'
  if (hasPayload(result)) return 'ok'
  if (mentionsLimit(result)) return 'limit'
  return 'ok'
}
// <<< LEAN:agent-guard
async function runAgent(label, prompt, opts) {
  const result = await agent(prompt, opts)
  const kind = classifyAgentResult(result)
  if (kind === 'limit') throw new LimitStop(label)
  if (kind === 'failure') throw new AgentFailure(label)
  return result
}

// ---------------------------------------------------------------- shemasi (kraci nego u punom workflowu)
const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
    rules: { type: 'array', items: { type: 'string' } },
    acceptance: { type: 'array', items: { type: 'string' } },
    notProven: { type: 'array', items: { type: 'string' } },
  },
  required: ['files', 'rules', 'acceptance'],
}
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    problemi: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'problemi'],
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
    // Nije obvezno (default []): run je padao nakon 5 retryja kad je implementator zavrsio posao a izostavio polje.
    notProven: { type: 'array', items: { type: 'string' }, default: [] },
  },
  required: ['worktreePath', 'branch', 'commits', 'changedFiles', 'commandsRun', 'testSummary'],
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
    netoRedaka: { type: 'string' },
    noveOvisnosti: { type: 'string' },
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
    netoRedaka: { type: 'string' },
    noveOvisnosti: { type: 'string' },
  },
  required: ['orphanScan', 'testFilesLine', 'testsLine', 'exitCode', 'failedFiles', 'buildOk'],
}

const agentCounts = { brief: 0, critic: 0, design: 0, implementation: 0, review: 0, gate: 0 }

// >>> LEAN:opseg
// Retke izracunava agent u worktreeu (skripta nema shell); ovdje se samo provjerava oblik, da u report ne ude
// izmisljena ili pokvarena vrijednost.
function normalizeImpl(impl) {
  return Object.assign({}, impl, { notProven: Array.isArray(impl && impl.notProven) ? impl.notProven : [] })
}
function opsegRetci(source) {
  const neto = source && typeof source.netoRedaka === 'string' ? source.netoRedaka.trim() : ''
  const nove = source && typeof source.noveOvisnosti === 'string' ? source.noveOvisnosti.trim() : ''
  const netoOk = /^(Neto redaka:\s*)?\+\d+\/-\d+$/.test(neto)
  const noveOk = /^(Nove ovisnosti:\s*)?\S.*$/.test(nove) && !/[<>|]/.test(nove)
  return [
    netoOk ? `Neto redaka: ${neto.replace(/^Neto redaka:\s*/, '')}` : 'Neto redaka: nije izmjereno',
    noveOk ? `Nove ovisnosti: ${nove.replace(/^Nove ovisnosti:\s*/, '')}` : 'Nove ovisnosti: nije izmjereno',
  ]
}
// Deterministicki dio kriticara: dodir zasticene staze bez izricitog args.protected.
function criticProtectedProblems(briefFiles, protectedPaths, declared) {
  if (declared) return []
  const hits = (Array.isArray(briefFiles) ? briefFiles : []).filter((f) => routeIsProtected([f], protectedPaths))
  return hits.length
    ? [`plan dira zasticene staze bez args.protected: ${hits.join(', ')} (za to je lekta-no-fable-coding ili izricit protected: true)`]
    : []
}
// <<< LEAN:opseg
const OPSEG_UPUTA =
  'Izracunaj opseg diffa U TOM worktreeu: `node scripts/agents/pr-lines.mjs --izracunaj origin/master HEAD` i vrati ' +
  'doslovno retke u polja netoRedaka ("+x/-y") i noveOvisnosti ("nema" ili popis paketa). Ako skripta ne postoji, ' +
  'izracunaj iz `git diff --shortstat origin/master...HEAD` i usporedbe kljuceva dependencies/devDependencies u ' +
  'package.json baze i heada. Ako ne mozes izmjeriti, izostavi polja; ne pogadjaj.'
const PROTECTED_PATHS_FOR_CRITIC = Array.isArray(ROUTING_CONFIG.protectedPaths)
  ? ROUTING_CONFIG.protectedPaths
  : ['src/repair', 'src/citations', 'src/docx', 'supabase', 'security']
function criticKriteriji(paths) {
  return 'Provjeri SAMO tri stvari i nista vise: (1) je li svaki kriterij prihvacanja konkretan i provjerljiv ' +
    '(naredba, datoteka ili mjerljiv ishod), a ne nejasan ("radi bolje", "sredi"); (2) dira li plan zasticenu ' +
    `stazu (${paths.join(', ')}) bez izricite oznake; (3) navodi li plan sto NECE biti dokazano (npr. Word, ` +
    'produkcija, puni gate) kad to nije ocito iz zadatka. ok=false SAMO kad je problem stvaran i zaustavio bi ' +
    'dobar rad; sitnice nisu razlog. SAMO CITAJ, ne mijenjaj nista, ne istrazuj repo.'
}

async function runCritic(planText, planFiles) {
  phase('Kriticar')
  const deterministic = criticProtectedProblems(planFiles, PROTECTED_PATHS_FOR_CRITIC, declaredProtected)
  const prompt =
    `KRITICAR PLANA (read-only, prije implementacije).\n\nZADATAK:\n${task}\n\nPLAN:\n${planText}\n\n` +
    criticKriteriji(PROTECTED_PATHS_FOR_CRITIC) +
    `\n\nVrati ok i popis problema (prazan kad je ok=true).`
  const verdict = await runAgent('kriticar', prompt, {
    phase: 'Kriticar', label: 'kriticar', ...routeFor('critic', planFiles), schema: CRITIC_SCHEMA, agentType: 'lean-citac',
  })
  agentCounts.critic += 1
  const problemi = [...deterministic, ...(Array.isArray(verdict.problemi) ? verdict.problemi : [])]
  const ok = verdict.ok !== false && deterministic.length === 0
  log(`Kriticar: ${ok ? 'plan prihvacen' : `${problemi.length} problema, run staje prije implementatora`}`)
  return { ok, problemi }
}

function criticStopResult(critic) {
  const report = [
    `Mode: ${mode}`,
    `Zadatak: ${task}`,
    'Kriticar je zaustavio run PRIJE implementatora:',
    ...critic.problemi.map((p) => `- ${p}`),
    ...routingReportLines(),
    'STATUS: ZAUSTAVLJENO (kriticar)',
  ].join('\n')
  log(report.split('\n').pop())
  return { mode, branch: null, worktreePath: null, commits: [], gate: null, review: null, critic, report }
}

// ================================================================== MODE: light (docs/tasks.json/config/tekst)
async function runLight() {
  const lightPlan =
    `Datoteke: ${hintFiles || '(nisu zadane)'}\n` +
    `Kriteriji prihvacanja:\n- ${hintAcceptance || '(nisu zadani)'}`
  const critic = await runCritic(lightPlan, files)
  if (!critic.ok) return criticStopResult(critic)

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
  const impl = normalizeImpl(await runAgent('implementator (light)', implPrompt, {
    phase: 'Implementacija', label: 'implementator', ...routeFor('implement'), schema: IMPL_SCHEMA,
  }))
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
    `ispunjen. Vrati pass/fail, razlog, popis staza izvan opsega i popis zabranjenih staza (prazno ako nema).\n\n` +
    OPSEG_UPUTA
  const verdict = await runAgent('verifikator (light)', verifyPrompt, {
    phase: 'Pregled', label: 'verifikator', ...routeFor('review'), schema: VERIFY_SCHEMA,
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
    ...opsegRetci(verdict),
    ...routingReportLines(),
    `Agenti po fazi: kriticar ${agentCounts.critic}, implementacija ${agentCounts.implementation}, pregled ${agentCounts.review} (ukupno ${agentCounts.critic + agentCounts.implementation + agentCounts.review})`,
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
    `nedostaju, bez sireg istrazivanja), (4) notProven: sto ovaj zadatak NECE moci dokazati (npr. Word, produkcija, ` +
    `puni gate), prazno samo ako je sve provjerljivo testom. SAMO CITAJ, nista ne mijenjaj.`
  const brief = await runAgent('brief', briefPrompt, {
    phase: 'Brief', label: 'brief', ...routeFor('brief'), schema: BRIEF_SCHEMA, agentType: 'lean-citac',
  })
  agentCounts.brief += 1
  const briefText = JSON.stringify(brief, null, 1)
  log(`Brief: ${brief.files.length} datoteka, ${brief.rules.length} pravila`)

  // 1b. Kriticar plana: jeftin, read-only; los plan zaustavlja run PRIJE skupog implementatora.
  const critic = await runCritic(briefText, [...files, ...(Array.isArray(brief.files) ? brief.files : [])])
  if (!critic.ok) return criticStopResult(critic)

  // 2. (opcionalno) jedan dizajner - jedan prijedlog, najmanji diff, bez drugog prijedloga i bez suca.
  let design = null
  if (designWanted) {
    const designPrompt =
      `ZADATAK:\n${task}\n\nBRIEF:\n${briefText}\n\nPredlozi NAJMANJI diff koji ispunjava kriterije, bez nove ` +
      `apstrakcije. SAMO CITAJ i predlozi, ne pisi kod. Vrati pristup, korake i datoteke koje ce se dirati.`
    design = await runAgent('dizajner', designPrompt, {
      phase: 'Brief', label: 'dizajner', model: 'sonnet', effort: 'medium', schema: DESIGN_SCHEMA, agentType: 'lean-citac',
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

  let impl = normalizeImpl(await runAgent('implementator', implPrompt(1, [], null), {
    phase: 'Implementacija', label: 'implementator', ...routeFor('implement'), schema: IMPL_SCHEMA,
  }))
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
    phase: 'Pregled', label: 'pregled', ...routeFor('review'), schema: REVIEW_SCHEMA,
  })).findings
  agentCounts.review += 1
  let blockers = review.filter((f) => f.severity === 'blocker' || f.severity === 'major')
  log(`Pregled: ${review.length} nalaza, ${blockers.length} blokatora`)

  if (blockers.length) {
    phase('Implementacija')
    const fixed = normalizeImpl(await runAgent('implementator (popravak)', implPrompt(2, blockers, impl), {
      phase: 'Implementacija', label: 'implementator:popravak', ...routeFor('implement'), schema: IMPL_SCHEMA,
    }))
    agentCounts.implementation += 1
    impl = { ...fixed, worktreePath: fixed.worktreePath || impl.worktreePath, commits: [...impl.commits, ...fixed.commits] }
    log(`Popravak: ${fixed.commits.length} dodatnih commita`)

    phase('Pregled')
    review = (await runAgent('pregled (ponovno)', reviewPrompt(2), {
      phase: 'Pregled', label: 'pregled:2', ...routeFor('review'), schema: REVIEW_SCHEMA,
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
        `omotaca. Ako node_modules nedostaje, napravi junction (vidi pravila). Nista ne mijenjaj u kodu.\n\n${OPSEG_UPUTA}\n\nPRAVILA:\n${PRAVILA}`
      : `U worktreeu ${impl.worktreePath} (grana ${impl.branch}) pokreni:\n` +
        `1. \`npm run orphan-scan\`\n` +
        `2. \`npx vitest run ${targetFiles.length ? targetFiles.join(' ') : '<datoteke koje diff pogadja>'} > gate.log 2>&1; echo EXIT=$? >> gate.log\`\n` +
        `Ovo je CILJANI gate (checkScope=targeted), ne puni \`npm run check\`: NE pokreci build ni oxlint, vrati ` +
        `\`buildOk: true\` s napomenom u testFilesLine da build nije pokretan. Procitaj iz gate.log retke ` +
        `"Test Files" i "Tests", popis FAIL datoteka i exit kod. Nista ne mijenjaj u kodu.\n\n${OPSEG_UPUTA}\n\nPRAVILA:\n${PRAVILA}`
  const gate = await runAgent('gate', gatePrompt, {
    phase: 'Gate', label: 'gate', ...routeFor('gate'), schema: GATE_SCHEMA,
  })
  agentCounts.gate += 1

  const blockersLeft = review.filter((f) => f.severity === 'blocker')
  const totalAgents = agentCounts.brief + agentCounts.critic + agentCounts.design + agentCounts.implementation + agentCounts.review + agentCounts.gate
  const report = [
    `Mode: standard (checkScope: ${checkScope}${designWanted ? ', design: da' : ''})`,
    `Zadatak: ${task}`,
    `Grana: ${impl.branch} (${impl.worktreePath})`,
    `Commiti: ${impl.commits.join(' | ')}`,
    `Gate: ${gate.testFilesLine} / ${gate.testsLine} / exit ${gate.exitCode} / build ${gate.buildOk ? 'OK' : 'PAO'}`,
    `Pregled: ${review.length} nalaza, ${blockersLeft.length} blokatora preostalo`,
    `Nije dokazano: ${impl.notProven.length ? impl.notProven.join('; ') : 'nista'}`,
    ...opsegRetci(gate),
    ...routingReportLines(),
    `Agenti po fazi: brief ${agentCounts.brief}, kriticar ${agentCounts.critic}, dizajn ${agentCounts.design}, implementacija ${agentCounts.implementation}, pregled ${agentCounts.review}, gate ${agentCounts.gate} (ukupno ${totalAgents})`,
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
      ...routingReportLines(),
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
      ...routingReportLines(),
      'STATUS: NIJE ZA PUSH',
    ].join('\n')
    log(report.split('\n').pop())
    return { mode, branch: null, worktreePath: null, commits: [], gate: null, review: null, report }
  }
  throw err
}
