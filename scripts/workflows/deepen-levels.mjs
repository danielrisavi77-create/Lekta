export const meta = {
  name: 'deepen-levels',
  description: 'ADITIVNO dodaje NEDOSTAJUCE RAZINE (doktorski/zavrsni/diplomski) vec portanim fakultetima. Jedan agent po (fakultet, razina); fanout draft + spec koji SMIJE dodati novi faculty-wide katalog program. Ne dira postojece profile.',
  whenToUse: 'Kad se postojecim fakultetima dodaje nova razina rada (npr. doktorski ili zavrsni) koja jos nema profil ni katalog program.',
  phases: [{ title: 'Levels', detail: 'harvest + draft + provjera, jedan agent po razini' }],
}

// Genitiv naziva fakulteta (iz kataloga) + puno ime, za gradnju program-stringova.
const FAC = {
  arh: { name: 'Arhitektonski fakultet', gen: 'Arhitektonskog fakulteta', family: 'stem' },
  erf: { name: 'Edukacijsko-rehabilitacijski fakultet', gen: 'Edukacijsko-rehabilitacijskog fakulteta', family: 'social' },
  efzg: { name: 'Ekonomski fakultet', gen: 'Ekonomskog fakulteta', family: 'social' },
  fer: { name: 'Fakultet elektrotehnike i racunarstva', gen: 'Fakulteta elektrotehnike i racunarstva', family: 'stem' },
  ffrz: { name: 'Fakultet filozofije i religijskih znanosti', gen: 'Fakulteta filozofije i religijskih znanosti', family: 'social' },
  fhs: { name: 'Fakultet hrvatskih studija', gen: 'Fakulteta hrvatskih studija', family: 'social' },
  fkit: { name: 'Fakultet kemijskog inzenjerstva i tehnologije', gen: 'Fakulteta kemijskog inženjerstva i tehnologije', family: 'stem' },
  fpz: { name: 'Fakultet prometnih znanosti', gen: 'Fakulteta prometnih znanosti', family: 'stem' },
  fsb: { name: 'Fakultet strojarstva i brodogradnje', gen: 'Fakulteta strojarstva i brodogradnje', family: 'stem' },
  sumfak: { name: 'Fakultet sumarstva i drvne tehnologije', gen: 'Fakulteta šumarstva i drvne tehnologije', family: 'stem' },
  fbf: { name: 'Farmaceutsko-biokemijski fakultet', gen: 'Farmaceutsko-biokemijskog fakulteta', family: 'biomed' },
  ffzg: { name: 'Filozofski fakultet', gen: 'Filozofskog fakulteta', family: 'social' },
  grad: { name: 'Gradevinski fakultet', gen: 'Građevinskog fakulteta', family: 'stem' },
  grf: { name: 'Graficki fakultet', gen: 'Grafičkog fakulteta', family: 'stem' },
  kbf: { name: 'Katolicki bogoslovni fakultet', gen: 'Katolickog bogoslovnog fakulteta', family: 'social' },
  kif: { name: 'Kinezioloski fakultet', gen: 'Kineziološkog fakulteta', family: 'social' },
  mef: { name: 'Medicinski fakultet', gen: 'Medicinskog fakulteta', family: 'biomed' },
  pbf: { name: 'Prehrambeno-biotehnoloski fakultet', gen: 'Prehrambeno-biotehnološkog fakulteta', family: 'stem' },
  pmf: { name: 'Prirodoslovno-matematicki fakultet', gen: 'Prirodoslovno-matematičkog fakulteta', family: 'stem' },
  sfzg: { name: 'Stomatoloski fakultet', gen: 'Stomatološkog fakulteta', family: 'biomed' },
  ttf: { name: 'Tekstilno-tehnoloski fakultet', gen: 'Tekstilno-tehnološkog fakulteta', family: 'stem' },
  ufzg: { name: 'Uciteljski fakultet', gen: 'Učiteljskog fakulteta', family: 'social' },
  vef: { name: 'Veterinarski fakultet', gen: 'Veterinarskog fakulteta', family: 'biomed' },
  alu: { name: 'Akademija likovnih umjetnosti', gen: 'Akademije likovnih umjetnosti', family: 'arts' },
  muza: { name: 'Muzicka akademija', gen: 'Muzičke akademije', family: 'arts' },
}

const LEVEL = {
  doctoral: { wt: 'doctoral', slug: 'doktorski', prog: (g) => `Doktorski studij ${g}` },
  final: { wt: 'final', slug: 'zavrsni', prog: (g) => `Prijediplomski studiji ${g} (zavrsni rad)` },
  graduate: { wt: 'graduate', slug: 'diplomski', prog: (g) => `Diplomski studiji ${g}` },
}

// Sve fakultete bez doktorskog -> doktorski meta. Plus odabrane nedostajuce razine.
const DOCTORAL = Object.keys(FAC) // svi u FAC nemaju doktorski (agr/fpzg/geof/pravo izostavljeni iz mape)
const EXTRA = [
  ['pbf', 'final'], ['erf', 'final'], ['grf', 'graduate'],
  ['arh', 'final'], ['alu', 'final'], ['muza', 'final'],
]

function mk(fac, levelKey) {
  const f = FAC[fac], L = LEVEL[levelKey]
  return { fac, facName: f.name, family: f.family, workType: L.wt, slug: L.slug, program: L.prog(f.gen) }
}

const DEFAULT = [
  ...DOCTORAL.map((fac) => mk(fac, 'doctoral')),
  ...EXTRA.map(([fac, lv]) => mk(fac, lv)),
]
let requested = args
if (typeof requested === 'string') { try { requested = JSON.parse(requested) } catch { requested = null } }
const targets = Array.isArray(requested) && requested.length ? requested : DEFAULT

const SUMMARY = {
  type: 'object', additionalProperties: false,
  properties: {
    target: { type: 'string' }, found: { type: 'boolean' }, reason: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    profileIds: { type: 'array', items: { type: 'string' } },
    scoredCount: { type: 'integer' }, advisoryCount: { type: 'integer' },
    specPath: { type: 'string' }, notes: { type: 'string' },
  },
  required: ['target', 'found', 'scoredCount', 'advisoryCount', 'notes'],
}

function prompt(t) {
  const key = `${t.fac}-${t.slug}`
  const vrsta = t.workType === 'doctoral' ? 'doktorski rad / disertacija' : t.workType === 'final' ? 'zavrsni (prijediplomski) rad' : 'diplomski rad'
  return `Ti si "faculty-porter" koji ADITIVNO dodaje JEDNU NEDOSTAJUCU RAZINU vec portanom fakultetu u Lekta (ThesisReady) po AGR zlatnom standardu.

META: ${t.facName} - RAZINA: ${vrsta} (workType "${t.workType}"), katalog unit "${t.fac}", obitelj "${t.family}".
NOVI FACULTY-WIDE PROGRAM (dodaje se u katalog): "${t.program}"

PRVO PROCITAJ (obavezno): CLAUDE.md; docs/VERIFICATION_PIPELINE.md; data/profiles/${t.fac}/drafts/${t.fac}.json (postojeci profili - da vidis oblik i NE dupliciras).

INVARIJANTE:
- ADITIVNO: dodajes SAMO profil za ovu razinu. NE diraj postojeci ${t.fac}.json ni dijeljene datoteke.
- Boduje se (scored) SAMO imperativ ("mora","treba","obvezno") s DOSLOVNIM citatom + lokatorom. Preporuka -> advisory.
- Citat MORA biti verbatim podniz ekstrahiranog teksta (grep). NE izmisljaj citate ni sourcePage.
- scored pravilo MORA biti machineCheckable:true. Ako razina ima samo ne-strojna pravila (npr. samo required-sections/citation koji su machineCheckable:false) ILI izvor delegira oblikovanje na predlozak/Sveuciliste bez konkretnih vrijednosti -> NE stvaraj profil, vrati found:false. (Doktorski cesto delegira na sveucilisni predlozak DR.SC. - tada found:false.)
- Bez em/en crtica; hrvatski; ASCII-friendly.

KORAK 1 - NADJI SLUZBENI IZVOR ZA OVU RAZINU:
- WebSearch: za doktorski "${t.facName} upute za oblikovanje doktorskog rada/disertacije", "pravilnik o doktorskom studiju ${t.facName}"; za zavrsni "${t.facName} upute za izradu zavrsnog rada"; za diplomski "${t.facName} upute diplomski rad".
- Sluzbena domena (poddomena unizg.hr / sluzbeni site). Odbaci studentske/forum izvore i izvore drugih fakulteta.
- Ako nema izvora za OVU razinu, ili izvor delegira na predlozak/nema konkretnih format-vrijednosti -> found:false, stani.

KORAK 2 - SNAPSHOT (Bash): mkdir -p data/sources/${t.fac}; curl -L --fail -o data/sources/${t.fac}/${key}-<godina>.pdf "<URL>"; sha256sum; pdftotext -layout ...pdf ...txt. Ako scan/prazno -> preskoci; ako svi -> found:false.

KORAK 3 - KLASIFICIRAJ: dimenzije koje izvor spominje (font, font-size, line-spacing, margins, paper-size, page-numbers, justify, toc, page-count/word-count, citation-style, required-sections) -> value + imperativ(scored)/preporuka(advisory) + verbatim quote + sourcePage.

KORAK 4 - GREP: za svako scored grep -F ~40 znakova citata u .txt; ne nadje -> advisory/izbaci.

KORAK 5 - FANOUT DRAFT (Write): data/profiles/${t.fac}/drafts/${key}.json = {"profileId":"${t.fac}-${t.slug}","entries":[...],"generatedAt":"2026-07-02"}.
- entry: ruleId "${t.fac}-${t.slug}--<checkId>", checkId, value, category, label, machineCheckable, authority ("program-page" za upute; "binding" NE koristi - ako je pravilnik, svejedno stavi "program-page" jer owner-bulk-approval zaobilazi dual-review), sourceId, sourcePage, quote, status. scored: status:"verified",scored:true,verifiedHash:"<sha256>",lastVerified:"2026-07-02",verifiedBy:"owner-bulk-approval",reviewedBy:null. advisory: status:"advisory",... bez scored/verifiedHash.

KORAK 6 - PORT-SPEC (Write) discovery/port-specs/${key}.json:
{ "faculty":"${t.fac}","unit":null,
  "catalogPrograms":["${t.program}"],   // NOVI faculty-wide program; reducer ga dodaje u katalog; IDENTICAN profil.programs
  "sources":[ {id,kind,title,url,publisher,fetchedAt:"2026-07-02",snapshotPath:"data/sources/${t.fac}/<id>.pdf",snapshotHash,validityClass:"stable" (ILI "volatile" ako je HTML ziva stranica),lastChecked:"2026-07-02",note} ],
  "profiles":[ {id:"${t.fac}-${t.slug}",unitId:"${t.fac}",programs:["${t.program}"],workTypes:["${t.workType}"],status:"partial",profileLabel:"${t.facName}, ${vrsta}",verifiedAt:"2026-07-02",documentDate:"<ako postoji>",rules:{/* zivi podskup */},facts:[...],note:"...",sources:[{title,url}],sourceHierarchy:[...],ruleAuthority:"official-program-guidelines",normativeScope:[...],advisoryScope:[...]} ],
  "ledger":[ {id:"led-${t.fac}-${t.slug}--<checkId>-<action>-2026-07-02",ruleId,profileId:"${t.fac}-${t.slug}",action,actor:"owner-bulk-approval",timestamp:"2026-07-02",sourceId,sourcePage,quote,note:"Deepen-levels workflow."} ]
}
- recommendedCitation jedan od: fpzg,pravo-fusnote,pravo-social-author,apa7,harvard,chicago-author,chicago-notes,mla9,vancouver,ieee,custom.

NE diraj dijeljene datoteke ni postojeci ${t.fac}.json. Pisi samo u data/sources/${t.fac}/, data/profiles/${t.fac}/drafts/${key}.json, discovery/port-specs/${key}.json.
Vrati JSON sazetak (target="${key}", found, sourceIds, profileIds, scoredCount, advisoryCount, specPath, notes s izvorima/skipovima/dvojbama).`
}

phase('Levels')
log(`Deepen-levels mete: ${targets.map((t) => `${t.fac}-${t.slug}`).join(', ')}`)
const results = await parallel(
  targets.map((t) => () =>
    agent(prompt(t), { label: `lvl:${t.fac}-${t.slug}`, phase: 'Levels', schema: SUMMARY, agentType: 'general-purpose' })
  )
)

const ok = results.filter(Boolean)
const found = ok.filter((r) => r.found)
log(`Zavrseno: ${found.length}/${targets.length} meta s izvorom.`)
return {
  targets: targets.map((t) => `${t.fac}-${t.slug}`),
  found: found.map((r) => r.target),
  skipped: ok.filter((r) => !r.found).map((r) => ({ target: r.target, reason: r.reason })),
  totals: { scored: found.reduce((n, r) => n + (r.scoredCount || 0), 0), advisory: found.reduce((n, r) => n + (r.advisoryCount || 0), 0) },
  specPaths: found.map((r) => r.specPath).filter(Boolean),
  perTarget: ok,
}
