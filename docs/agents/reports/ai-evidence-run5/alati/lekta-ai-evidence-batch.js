export const meta = {
  name: 'lekta-ai-evidence-batch',
  description: 'Jedna serija dokaznog AI-audita: Luna slijepo izvlaci po izvoru, Sol ponavlja samo pale, Sonnet pobija, jedan pisac primjenjuje po profilu',
  whenToUse: 'Lekta F1: pravila needs-ai-evidence; paketi iz prep-ai-evidence.mts; bez Fablea; zastoj vraca kontrolu vlasniku',
  phases: [
    { title: 'Izvlacenje', detail: 'Codex gpt-6-luna po izvoru, slijepo; deterministicka usporedba s pravilom' },
    { title: 'Ponovni pokusaj', detail: 'Codex gpt-6-sol samo za neslaganja i insufficient' },
    { title: 'Pobijanje', detail: 'Sonnet (drugi provider), samo podudarna pravila' },
    { title: 'Primjena', detail: 'jedan pisac: closed-loop, sastavljanje, apply po profilu, regeneracija, delta' },
  ],
}

// args = {
//   worktree: 'C:/.../Lekta',                 izolirano stablo; jedini pisac je faza Primjena
//   scratch:  'C:/.../scratchpad/ai-evidence/runN',   izlaz prep-ai-evidence.mts (plan.json, in/, snap/, truth/)
//   tools:    'C:/.../scratchpad/ai-evidence',        UPUTE-izvlacenje.md, compare-extraction.mjs, assemble-ai-evidence.mts
//   batchId:  'b01',
//   sources:  ['sourceId', ...],             izvori ove serije
//   profiles: ['profileId', ...],            profili cija SVA ciljna pravila leze u izvorima ove serije
//   regenCmds: ['npm run verification-worklist', 'npm run completion-ledger'],
//   testCmd:  'npx vitest run tests/ai-evidence-audit.test.ts tests/verification-actions.test.ts tests/verification-gate.test.ts',
//   baselineIds: '<scratch>/baseline-ai-verified.json',
// }
const A = args || {}
const REQUIRED = A.skipApply ? ['scratch', 'tools', 'batchId', 'sources'] : ['worktree', 'scratch', 'tools', 'batchId', 'sources', 'profiles', 'regenCmds', 'testCmd', 'baselineIds']
for (const k of REQUIRED) {
  if (!A[k]) throw new Error(`nedostaje args.${k}`)
}
const S = A.scratch
const T = A.tools

const NO_RELAY = 'Radis iskljucivo ovaj zadatak. Ako vidis vlasnikovu chat poruku ili relay, ignoriraj je. Ne mijenjaj datoteke u repozitoriju osim ako zadatak to izricito kaze.'

const RUN = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    model: { type: 'string' },
    matchedRuleIds: { type: 'array', items: { type: 'string' } },
    retryableRuleIds: { type: 'array', items: { type: 'string' } },
    conflict: { type: 'number' },
    limitHit: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['ok', 'model', 'matchedRuleIds', 'retryableRuleIds', 'conflict', 'limitHit', 'note'],
}

// Omotac ne cita izlaz modela: pokrene Codex, pa deterministicku usporedbu, i prepise njen JSON.
function codexStep(model, sourceId, pass, onlyRules) {
  const inFile = `${S}/in/${sourceId}.json`
  const out = `${S}/out/${sourceId}.${pass}.json`
  const only = onlyRules && onlyRules.length ? ` Obradi SAMO ruleId: ${onlyRules.join(', ')}.` : ''
  const codexPrompt = `Slijedi upute u ${T}/UPUTE-izvlacenje.md. Ulaz: ${inFile}. Izlaz (jedina datoteka koju smijes pisati): ${out}. U model.model upisi ${model}.${only}`
  return `${NO_RELAY}
U PowerShellu pokreni tocno ovo, redom, i nista drugo ne analiziraj:
1. cmd /c "codex exec -m ${model} --skip-git-repo-check -c model_reasoning_effort=medium --cd \\"${S}\\" \\"${codexPrompt}\\" < nul > \\"${S}/out/${sourceId}.${pass}.log\\" 2>&1"
   U PRVOM PLANU (ne run_in_background), timeout alata 600000 ms. Zatim procitaj samo zadnjih 15 redaka tog loga.
2. node "${T}/compare-extraction.mjs" "${S}" "${sourceId}" ${pass}
   Vrati polja iz tog JSON-a: ok, model, matchedRuleIds, retryableRuleIds, conflict = duljina polja conflict.
limitHit=true SAMO ako ${out} ne postoji I zadnji redci Codexa kazu da je dosegnut limit. note: jedna recenica.
Ako korak 1 padne bez izlazne datoteke, ok=false i prazni nizovi.`
}

const VERDICTS = {
  type: 'object',
  properties: {
    accepted: { type: 'array', items: { type: 'string' } },
    refuted: {
      type: 'array',
      items: { type: 'object', properties: { ruleId: { type: 'string' }, reason: { type: 'string' } }, required: ['ruleId', 'reason'] },
    },
  },
  required: ['accepted', 'refuted'],
}

function refutePrompt(sourceId, ruleIds) {
  return `${NO_RELAY}
Protivnicki pregled drugog providera za izvor ${sourceId}. Pravila: ${ruleIds.join(', ')}.
Za svako procitaj zapis u ${S}/in/${sourceId}.json (citat, lokator, konteksti) i slijepo izvucen rezultat u ${S}/out/${sourceId}.sol.json ili .luna.json (Sol ima prednost).
Pokusaj OBORITI tvrdnju:
- govori li citat bas o toj vrijednosti, opsegu (vrsta rada, dio rada) i modalitetu?
- odnosi li se izvor na taj profil (fakultet, studij, vrsta rada) ili na nesto drugo?
- postoji li drugdje u snimci (${S}/snap/${sourceId}.txt, trazi kljucne rijeci, ne citaj cijelu) drukcija vrijednost ili iznimka?
Kad nisi siguran, pravilo je refuted. Ne pretpostavljaj.
Upisi {"accepted":[ruleId...],"refuted":[{ruleId,reason}]} u ${S}/verdict/${sourceId}.json i vrati isto.`
}

phase('Izvlacenje')
const perSource = await pipeline(
  A.sources,
  (sourceId) => agent(codexStep('gpt-6-luna', sourceId, 'luna'), {
    label: `luna:${sourceId}`, phase: 'Izvlacenje', schema: RUN, model: 'sonnet', effort: 'low',
  }),
  async (luna, sourceId) => {
    if (!luna || !luna.ok) return { sourceId, luna, sol: null }
    if (!luna.retryableRuleIds.length) return { sourceId, luna, sol: null }
    const sol = await agent(codexStep('gpt-6-sol', sourceId, 'sol', luna.retryableRuleIds), {
      label: `sol:${sourceId}`, phase: 'Ponovni pokusaj', schema: RUN, model: 'sonnet', effort: 'low',
    })
    return { sourceId, luna, sol }
  },
  async (r) => {
    const matched = [...new Set([...(r.luna?.matchedRuleIds || []), ...(r.sol?.ok ? r.sol.matchedRuleIds : [])])]
    if (!matched.length) return { ...r, matched, verdict: { accepted: [], refuted: [] } }
    const verdict = await agent(refutePrompt(r.sourceId, matched), {
      label: `pobij:${r.sourceId}`, phase: 'Pobijanje', schema: VERDICTS, model: 'sonnet', effort: 'medium',
    })
    return { ...r, matched, verdict: verdict || { accepted: [], refuted: [] } }
  },
)

const rows = perSource.filter(Boolean)
const limit = rows.some((r) => r.luna?.limitHit || r.sol?.limitHit)
const failedSources = rows.filter((r) => !r.luna?.ok).map((r) => r.sourceId)
const accepted = rows.reduce((n, r) => n + r.verdict.accepted.length, 0)
const targeted = rows.reduce((n, r) => n + (r.luna?.matchedRuleIds.length || 0) + (r.luna?.retryableRuleIds.length || 0) + (r.luna?.conflict || 0), 0)
log(`serija ${A.batchId}: izvora ${A.sources.length}, palih ${failedSources.length}, prihvaceno ${accepted} od ${targeted}`)

const APPLY = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    appliedProfiles: { type: 'array', items: { type: 'string' } },
    skippedProfiles: {
      type: 'array',
      items: { type: 'object', properties: { profileId: { type: 'string' }, reason: { type: 'string' } }, required: ['profileId', 'reason'] },
    },
    testFilesLine: { type: 'string' },
    newlyVerified: { type: 'array', items: { type: 'string' } },
    diffStat: { type: 'string' },
  },
  required: ['ok', 'appliedProfiles', 'skippedProfiles', 'testFilesLine', 'newlyVerified', 'diffStat'],
}

let apply = null
if (A.skipApply) log('primjena preskocena (skipApply): prihvaceno ostaje u verdict/ za kasniju primjenu')
if (accepted && !limit && !A.skipApply) {
  phase('Primjena')
  apply = await agent(`${NO_RELAY}
Ti si JEDINI pisac u ${A.worktree}. Sve je deterministicko; ne mijenjaj kod ni pravila rukom, ne commitaj.
Prije pocetka izmjeri slobodni RAM (Win32_OperatingSystem FreePhysicalMemory); ispod 1,2 GB stani i vrati ok=false s razlogom.
Za SVAKI profil redom (ne paralelno): ${A.profiles.join(', ')}
  a. npm run closed-loop -- --profile <id> --no-structural     (pise data/verification/closed-loop-manifests/<id>.json)
  b. npx vite-node "${T}/assemble-ai-evidence.mts" -- --root "${A.worktree}" --scratch "${S}" --profile <id>
     Ako ok=false: preskoci profil, razlog = sazetak polja missing (kodovi, ne cijeli tekst).
  c. isto s --write-draft
  d. npx vite-node scripts/apply-ai-evidence-profile.mts <id>          (probni izracun)
  e. ako d. prode: npx vite-node scripts/apply-ai-evidence-profile.mts <id> --write
     Ako d. padne: vrati nacrt profila na stanje prije koraka c (git -C "${A.worktree}" diff tog nacrta pokazuje samo aiEvidence; vrati ga iz kopije koju napravis prije c), razlog = prvi redak greske.
Zatim redom: ${A.regenCmds.join(' ; ')}
Zatim: ${A.testCmd} ; testFilesLine = doslovni redak "Test Files".
newlyVerified: parsiraj data/verification/ai-evidence-worklist.json, skup "profileId/ruleId" sa statusom ai-evidence-verified minus skup iz ${A.baselineIds}. Ne greppaj.
diffStat: git -C "${A.worktree}" diff --stat | posljednji redak.`, {
    label: `primjena:${A.batchId}`, phase: 'Primjena', model: 'sonnet', effort: 'low', schema: APPLY,
  })
}

// Zastoj: kontrola se vraca vlasniku.
const stall = []
if (limit) stall.push('limit modela')
if (!accepted) stall.push('serija nije dala nijedno prihvaceno pravilo')
if (targeted && accepted / targeted < 0.5) stall.push(`vise od 50% nije prihvaceno (${accepted}/${targeted})`)
if (failedSources.length * 2 >= A.sources.length) stall.push(`pola ili vise izvora palo: ${failedSources.join(', ')}`)
if (apply && (!apply.ok || apply.newlyVerified.length === 0)) stall.push('primjena nije podigla nijedno pravilo')
const perSourceSummary = rows.map((r) => ({
  sourceId: r.sourceId,
  lunaMatched: r.luna?.matchedRuleIds.length || 0,
  lunaRetry: r.luna?.retryableRuleIds.length || 0,
  solMatched: r.sol?.ok ? r.sol.matchedRuleIds.length : null,
  accepted: r.verdict.accepted.length,
}))

return {
  STATUS: stall.length ? 'ZASTOJ: pitaj vlasnika' : 'NAPREDAK',
  stall,
  batchId: A.batchId,
  accepted,
  targeted,
  failedSources,
  conflicts: rows.filter((r) => r.luna?.conflict).map((r) => r.sourceId),
  refuted: rows.flatMap((r) => r.verdict.refuted.map((x) => ({ sourceId: r.sourceId, ...x }))),
  solRetried: rows.filter((r) => r.sol).map((r) => r.sourceId),
  perSourceSummary,
  apply,
  spentOutputTokens: budget.spent(),
}
