// Routing korak 2: izbor providera, modela i efforta po fazi iz `config/agent-routing.json`.
//
// Cisti modul bez ovisnosti i bez I/O-a; config prima kao objekt. Blok izmedju oznaka
// `>>> DIJELJENO:select-route` i `<<< DIJELJENO:select-route` postoji DOSLOVNO isti i u
// `.claude/workflows/lekta-lean.js`, jer workflow skripte nemaju pristup datotekama ni importima
// (nema `fs`, nema `import`). `tests/select-route.test.ts` rusi build cim se dva bloka razidju.
//
// Ugovor: `selectRoute({ config, mode, size, protectedPaths, files, phase })` vraca
// `{ provider, model, effort, fallback, size, protected, source }`, nikad undefined vrijednosti
// za provider/effort. Model koji u configu nema `status: "verified"` se nikad ne vraca: baca se
// greska s imenom modela.

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

export {
  ROUTE_DEFAULTS,
  ROUTE_EFFORT_POLICY,
  ROUTE_PHASES,
  routeAgentModel,
  routeCheapestVerified,
  routeIsProtected,
  selectRoute,
}
