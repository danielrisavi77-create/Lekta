export const meta = {
  name: 'deepen-faculties',
  description: 'ADITIVNO produbljuje vec portane fakultete: harvesta izvor za JEDNU metu (odsjek ili razina) i dodaje SAMO nove profile preko fan-out draftova, ne dirajuci postojece. Vraca port-specove za serijski merge.',
  whenToUse: 'Kad se postojecim fakultetima dodaju odsjecki profili ili nedostajuce razine bez rizika drifta na vec commitanim profilima.',
  phases: [{ title: 'Deepen', detail: 'harvest + draft + provjera, jedan agent po meti' }],
}

// Mete za ovaj deepen-batch. Svaka: fakultet + obitelj + TOCAN katalogski program (mora vec
// postojati u data/catalog za odsjeke) + slug za profileId. workType odreduje agent iz izvora.
const DEFAULT = [
  { fac: 'ffzg', facName: 'Filozofski fakultet', family: 'social', program: 'Pedagogija', slug: 'pedagogija', dept: 'Odsjek za pedagogiju' },
  { fac: 'ffzg', facName: 'Filozofski fakultet', family: 'social', program: 'Lingvistika', slug: 'lingvistika', dept: 'Odsjek za lingvistiku' },
  { fac: 'ffzg', facName: 'Filozofski fakultet', family: 'social', program: 'Komparativna književnost', slug: 'komparativna', dept: 'Odsjek za komparativnu knjizevnost' },
  { fac: 'ffzg', facName: 'Filozofski fakultet', family: 'social', program: 'Povijest umjetnosti', slug: 'povijest-umjetnosti', dept: 'Odsjek za povijest umjetnosti' },
  { fac: 'ffzg', facName: 'Filozofski fakultet', family: 'social', program: 'Arheologija', slug: 'arheologija', dept: 'Odsjek za arheologiju' },
  { fac: 'ffzg', facName: 'Filozofski fakultet', family: 'social', program: 'Etnologija i kulturna antropologija', slug: 'etnologija', dept: 'Odsjek za etnologiju i kulturnu antropologiju' },
  { fac: 'pmf', facName: 'Prirodoslovno-matematicki fakultet', family: 'stem', program: 'Geologija', slug: 'geologija', dept: 'Geoloski odsjek' },
  { fac: 'pmf', facName: 'Prirodoslovno-matematicki fakultet', family: 'stem', program: 'Geofizika', slug: 'geofizika', dept: 'Geofizicki odsjek' },
]
let requested = args
if (typeof requested === 'string') { try { requested = JSON.parse(requested) } catch { requested = null } }
const targets = Array.isArray(requested) && requested.length ? requested : DEFAULT

const SUMMARY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: { type: 'string' },
    found: { type: 'boolean' },
    reason: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    profileIds: { type: 'array', items: { type: 'string' } },
    scoredCount: { type: 'integer' },
    advisoryCount: { type: 'integer' },
    specPath: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['target', 'found', 'scoredCount', 'advisoryCount', 'notes'],
}

function prompt(t) {
  const key = `${t.fac}-${t.slug}`
  return `Ti si "faculty-porter" za JEDAN ODSJEK/METU vec portanog fakulteta i ADITIVNO ga dodajes u Lekta (ThesisReady) po AGR zlatnom standardu.

META: ${t.facName} (${t.dept}) - katalog unit "${t.fac}", obitelj "${t.family}".
KATALOSKI PROGRAM (tocno, vec postoji u katalogu): "${t.program}"

PRVO PROCITAJ (obavezno):
- CLAUDE.md (tvrda pravila, hijerarhija izvora, "ne izmisljaj pravila")
- docs/VERIFICATION_PIPELINE.md (kad je pravilo scored)
- data/profiles/${t.fac}/drafts/${t.fac}.json (POSTOJECI agregirani draft ovog fakulteta - da vidis oblik i da NE dupliciras)

INVARIJANTE (krsis li ih, posao je neispravan):
- ADITIVNO: dodajes SAMO nove profile za ovaj odsjek. NE diraj postojeci ${t.fac}.json ni druge dijeljene datoteke.
- Boduje se (scored) SAMO pravilo ciji je izvor IMPERATIVAN ("mora", "treba", "obvezan", "numeriraju se") i za koje imas DOSLOVNI citat + lokator. Preporuka -> "advisory".
- Citat MORA biti doslovni podniz ekstrahiranog teksta (provjeri grep-om). NE izmisljaj citate ni sourcePage.
- Bez em/en crtica; hrvatski; ASCII-friendly.
- scored pravilo MORA biti machineCheckable:true. Ako meta ima samo ne-strojna pravila (npr. samo required-sections koje je machineCheckable:false), NE stvaraj taj profil (vrati found:false ili izostavi razinu) - inace rusi coverage invariantu.

KORAK 1 - NADJI ODSJECKI IZVOR:
- WebSearch: "${t.facName} ${t.dept} upute za izradu diplomskog rada", "${t.program} diplomski rad upute oblikovanje", "...zavrsni rad".
- Preferiraj sluzbenu poddomenu odsjeka (npr. ${t.fac}.unizg.hr/<odsjek> ili odsjecki site). Odbaci studentske/forum/scribd izvore i izvore DRUGIH fakulteta.
- Ako odsjek nema vlastiti izvor s tehnickim pravilima -> vrati {found:false, reason:"..."} i stani (ne posezi za faculty-wide izvorom, on je vec pokriven ili ne postoji).

KORAK 2 - SNAPSHOT (Bash):
- mkdir -p data/sources/${t.fac}
- curl -L --fail -o data/sources/${t.fac}/${key}-<vrsta>-<godina>.pdf "<URL>"
- sha256sum ... (hash u snapshotHash I verifiedHash scored pravila)
- pdftotext -layout ...pdf ...txt ; ako je .txt prazan (scan) -> preskoci; ako su svi scan/nedostupni -> found:false.

KORAK 3 - KLASIFICIRAJ: za dimenzije koje izvor spominje odredi value + imperativ(scored)/preporuka(advisory) + verbatim quote + sourcePage. checkId-evi: font, font-size, line-spacing, margins, paper-size, page-numbers, justify, toc, page-count ILI word-count, citation-style, required-sections. Odredi razine (graduate/final/doctoral) koje izvor pokriva.

KORAK 4 - GREP SAMOPROVJERA: za svako scored pravilo grep -F ~40 znakova citata u .txt; ne nadje li -> advisory ili izbaci. Zabiljezi u notes.

KORAK 5 - FAN-OUT DRAFT (Write), JEDAN FILE PO NOVOM PROFILU:
- data/profiles/${t.fac}/drafts/${key}-<level>.json = {"profileId":"${t.fac}-${t.slug}-<level>","entries":[ ...entries... ],"generatedAt":"2026-07-02"}
  (fan-out oblik {profileId,entries}; NE agregirani, da ne dira postojeci ${t.fac}.json)
- Svaki entry: ruleId "<profileId>--<checkId>", checkId, value, category, label, machineCheckable, authority "program-page" (odsjecke Upute su program-razina), sourceId, sourcePage, quote, status. scored: status:"verified",scored:true,verifiedHash:"<sha256>",lastVerified:"2026-07-02",verifiedBy:"owner-bulk-approval",reviewedBy:null. advisory: status:"advisory",lastVerified:"2026-07-02",verifiedBy:"owner-bulk-approval",reviewedBy:null.

KORAK 6 - PORT-SPEC (Write) na discovery/port-specs/${key}.json:
{
  "faculty":"${t.fac}", "unit":null,
  "catalogPrograms":["${t.program}"],   // TOCAN odsjecki program (vec u katalogu); IDENTICAN profil.programs
  "sources":[ { id, kind, title, url, publisher, fetchedAt:"2026-07-02", snapshotPath:"data/sources/${t.fac}/<id>.pdf", snapshotHash, validityClass:"stable", lastChecked:"2026-07-02", note } ],
  "profiles":[ {
     id:"${t.fac}-${t.slug}-<level>", unitId:"${t.fac}", programs:["${t.program}"],
     workTypes:["graduate"|"final"|"doctoral"], status:"partial",
     profileLabel:"${t.facName} (${t.dept}), <vrsta rada>", verifiedAt:"2026-07-02", documentDate:"<ako postoji>",
     rules:{ /* zivi engine podskup koji izvor daje */ },
     facts:[...], note:"...", sources:[{title,url}], sourceHierarchy:[...],
     ruleAuthority:"official-program-guidelines", normativeScope:[...], advisoryScope:[...]
  } ],
  "ledger":[ { id:"led-<profileId>--<checkId>-<action>-2026-07-02", ruleId, profileId, action:("verified"|"advisory"), actor:"owner-bulk-approval", timestamp:"2026-07-02", sourceId, sourcePage, quote, note:"Deepen workflow (odsjecki profil)." } ]
}
- recommendedCitation jedan od: fpzg, pravo-fusnote, pravo-social-author, apa7, harvard, chicago-author, chicago-notes, mla9, vancouver, ieee, custom.

NE diraj dijeljene datoteke ni postojeci ${t.fac}.json. Pisi ISKLJUCIVO u data/sources/${t.fac}/, data/profiles/${t.fac}/drafts/${key}-*.json i discovery/port-specs/${key}.json.

Vrati JSON sazetak (target="${key}", found, sourceIds, profileIds, scoredCount, advisoryCount, specPath, notes). U notes: izvori nadjeni/preskoceni, koliko spusteno u advisory, dvojbe.`
}

phase('Deepen')
log(`Deepen mete: ${targets.map((t) => `${t.fac}-${t.slug}`).join(', ')}`)
const results = await parallel(
  targets.map((t) => () =>
    agent(prompt(t), { label: `deepen:${t.fac}-${t.slug}`, phase: 'Deepen', schema: SUMMARY, agentType: 'general-purpose' })
  )
)

const ok = results.filter(Boolean)
const found = ok.filter((r) => r.found)
log(`Zavrseno: ${found.length}/${targets.length} meta s izvorom.`)
return {
  targets: targets.map((t) => `${t.fac}-${t.slug}`),
  found: found.map((r) => r.target),
  skipped: ok.filter((r) => !r.found).map((r) => ({ target: r.target, reason: r.reason })),
  totals: {
    scored: found.reduce((n, r) => n + (r.scoredCount || 0), 0),
    advisory: found.reduce((n, r) => n + (r.advisoryCount || 0), 0),
  },
  specPaths: found.map((r) => r.specPath).filter(Boolean),
  perTarget: ok,
}
