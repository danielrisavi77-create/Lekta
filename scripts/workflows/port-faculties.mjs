export const meta = {
  name: 'port-faculties',
  description: 'Paralelno harvestira sluzbene izvore, draftira scored/advisory pravila i adversarijalno provjerava citate po fakultetu (AGR predlozak). Vraca port-specove za serijski merge.',
  whenToUse: 'Kad se u produkciju dodaje nekoliko fakulteta odjednom (pilot ili batch). Ne mijenja dijeljene datoteke - to radi scripts/port-faculty.mjs nakon workflowa.',
  phases: [
    { title: 'Port', detail: 'harvest + draft + adversarijalna provjera, jedan agent po fakultetu' },
  ],
}

// Fakulteti za ovaj batch (args nadjaca; DEFAULT je trenutni batch). Svaki: katalog id + puno ime + obitelj.
const DEFAULT = [
  { id: 'fbf', name: 'Farmaceutsko-biokemijski fakultet', family: 'biomed' },
  { id: 'sfzg', name: 'Stomatološki fakultet', family: 'biomed' },
  { id: 'fpz', name: 'Fakultet prometnih znanosti', family: 'stem' },
  { id: 'geof', name: 'Geodetski fakultet', family: 'stem' },
  { id: 'grf', name: 'Grafički fakultet', family: 'stem' },
  { id: 'rgnf', name: 'Rudarsko-geološko-naftni fakultet', family: 'stem' },
  { id: 'erf', name: 'Edukacijsko-rehabilitacijski fakultet', family: 'social' },
  { id: 'ufzg', name: 'Učiteljski fakultet', family: 'social' },
]
// args moze stici kao array ILI kao JSON-string (ovisno o harnessu); parsiraj oboje.
let requested = args
if (typeof requested === 'string') { try { requested = JSON.parse(requested) } catch { requested = null } }
const faculties = Array.isArray(requested) && requested.length ? requested : DEFAULT

const SUMMARY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    faculty: { type: 'string' },
    found: { type: 'boolean' },
    reason: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    profileIds: { type: 'array', items: { type: 'string' } },
    scoredCount: { type: 'integer' },
    advisoryCount: { type: 'integer' },
    specPath: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['faculty', 'found', 'scoredCount', 'advisoryCount', 'notes'],
}

function prompt(fac) {
  return `Ti si "faculty-porter" za JEDAN fakultet Sveucilista u Zagrebu i portas ga u produkciju Lekta (ThesisReady) TOCNO po AGR zlatnom standardu.

FAKULTET: ${fac.name} (katalog id: "${fac.id}", obitelj: "${fac.family}")

PRVO PROCITAJ ove datoteke da uhvatis kucni stil (obavezno, ne preskaci):
- CLAUDE.md (tvrda pravila, hijerarhija izvora, "ne izmisljaj pravila")
- docs/VERIFICATION_PIPELINE.md (kad je pravilo scored)
- scripts/add-agr-profile.mjs (predlozak: izvor + profil + ledger)
- data/profiles/unizg-agr/drafts/unizg-agr.json (predlozak fan-out drafta: scored vs advisory oblik)

INVARIJANTE (krsis li ih, posao je neispravan):
- Boduje se (scored) SAMO pravilo ciji je izvor IMPERATIVAN ("mora", "treba", "obvezan", "numeriraju se") i za koje imas DOSLOVNI citat + lokator. Preporuka ("preporuca se", "u pravilu", "predlaze se") -> status "advisory".
- Citat MORA biti doslovni podniz izvornog teksta. Ako ga ne mozes verbatim naci u ekstrahiranom tekstu, NE koristi to pravilo kao scored (spusti u advisory ili izostavi). NE izmisljaj citate ni sourcePage.
- Bez em/en crtica; hrvatski; ASCII-friendly (dijakritika u citatima smije ostati ako je u izvoru).

KORAK 1 - NADJI SLUZBENI IZVOR:
- WebSearch: "${fac.name} upute za izradu diplomskog rada" i "...zavrsnog rada", "...pravilnik o zavrsnom radu".
- Preferiraj sluzbenu domenu (poddomena unizg.hr ili sluzbeni fakultetski site). Odbaci studentske/forum izvore.
- Cilj: 1 do 3 sluzbena PDF-a (npr. Upute za diplomski, Upute za zavrsni, Pravilnik/DR.SC. za doktorski).

KORAK 2 - SNAPSHOT (Bash):
- mkdir -p data/sources/${fac.id}
- Za svaki izvor: curl -L --fail -o data/sources/${fac.id}/<id>.pdf "<URL>"  (id oblika ${fac.id}-<vrsta>-<godina>, npr ${fac.id}-upute-diplomski-2023)
- sha256sum data/sources/${fac.id}/<id>.pdf   (hash ide u snapshotHash I u verifiedHash scored pravila)
- pdftotext -layout data/sources/${fac.id}/<id>.pdf data/sources/${fac.id}/<id>.txt
- Ako je .txt prazan/scan (nema teksta): to je skeniran izvor -> preskoci ga (OCR nije dostupan). Ako su SVI izvori skenirani/nedostupni: vrati {found:false, reason:"..."} i stani.

KORAK 3 - CITAJ I KLASIFICIRAJ:
- Procitaj .txt. Za svaku dimenziju koju izvor SPOMINJE odredi vrijednost + je li imperativ (scored) ili preporuka (advisory):
  checkId-evi: font, font-size, line-spacing, margins, paper-size, page-numbers, justify (obostrano poravnanje), toc, page-count (stranice) ILI word-count (rijeci), citation-style, required-sections.
- Za svaku: exact quote (verbatim iz .txt), sourcePage (broj stranice ili naziv odjeljka iz teksta).
- Odredi razine rada koje izvor pokriva (graduate=diplomski, final=zavrsni/prijediplomski, doctoral=doktorski) -> jedan profil po razini/izvoru.

KORAK 4 - ADVERSARIJALNA SAMOPROVJERA (Bash grep):
- Za SVAKO pravilo koje kanis oznaciti scored: grep -F prvih ~40 znakova citata u .txt datoteci. Ako grep ne nadje -> citat nije verbatim -> spusti pravilo u advisory ili izbaci. Zabiljezi u notes koliko si ih spustio.

KORAK 5 - UPISI FAN-OUT DRAFT (Write):
- data/profiles/${fac.id}/drafts/${fac.id}.json u oblику {profileId?, ...} ALI posto ima vise profila po fakultetu, koristi AGREGIRANI oblik: {"profiles": {"<profileId>": [ ...entries... ], ...}, "generatedAt":"2026-07-02", "source":"..."}.
  (recompute-coverage podrzava i {profiles:{}} i {profileId,entries}. Za vise profila koristi {profiles:{}}.)
- Svaki entry TOCNO kao u AGR draftu: ruleId "<profileId>--<checkId>", checkId, value, category(format|structure|scope|citation), label, machineCheckable, authority ("program-page" za fakultetske Upute; "binding" samo za pravilnik/odluku; "general" za opce), sourceId, sourcePage, quote, status.
  - scored pravilo: status:"verified", scored:true, verifiedHash:"<sha256 izvora>", lastVerified:"2026-07-02", verifiedBy:"owner-bulk-approval", reviewedBy:null.
  - advisory pravilo: status:"advisory", lastVerified:"2026-07-02", verifiedBy:"owner-bulk-approval", reviewedBy:null (bez scored/verifiedHash).

KORAK 6 - UPISI PORT-SPEC (Write) na discovery/port-specs/${fac.id}.json:
{
  "faculty": "${fac.id}",
  "unit": null,  // katalog vec ima unit "${fac.id}"; stavi objekt SAMO ako ga nema
  "catalogPrograms": [ "<faculty-wide program string po razini>", ... ],
     // Koristi GENITIV naziva fakulteta: "Diplomski studiji <genitiv>", "Prijediplomski studiji <genitiv> (zavrsni rad)", "Doktorski studij <genitiv>".
     // npr "${fac.name}" -> genitiv (Ekonomski fakultet -> Ekonomskog fakulteta; Fakultet strojarstva i brodogradnje -> Fakulteta strojarstva i brodogradnje).
     // OVI stringovi MORAJU biti IDENTICNI profil.programs (inace UI ne poklopi profil)
  "sources": [ { source-registry unos: id, kind("guidelines"|"regulation"), title, url, publisher, fetchedAt:"2026-07-02", snapshotPath:"data/sources/${fac.id}/<id>.pdf", snapshotHash, validityClass:"stable", lastChecked:"2026-07-02", note } ],
  "profiles": [ {
     id:"${fac.id}-<level>", unitId:"${fac.id}", programs:["<isti faculty-wide string kao u catalogPrograms>"],
     workTypes:["graduate"|"final"|"doctoral"], status:"partial",
     profileLabel:"${fac.name}, <vrsta rada>", verifiedAt:"2026-07-02", documentDate:"<datum izvora ako postoji>",
     rules:{ /* ZIVI ENGINE PODSKUP: font:[..], size:[N], spacing:N, margins:{top,right,bottom,left}, requireToc:bool, requirePageNumbers:bool, requireA4:bool, checkJustify:bool, checkMargins:bool, recommendedCitation:"<valjan option>" - popuni SAMO ono sto izvor daje; requiredSections u rules SU {key,label,terms} objekti ili izostavi */ },
     facts:[...], note:"...", sources:[{title,url}], sourceHierarchy:[...],
     ruleAuthority:"official-program-guidelines", normativeScope:[/* scored dimenzije */], advisoryScope:[/* advisory dimenzije */]
  } ],
  "ledger": [ { id:"led-<profileId>--<checkId>-<action>-2026-07-02", ruleId, profileId, action:("verified"|"advisory"), actor:"owner-bulk-approval", timestamp:"2026-07-02", sourceId, sourcePage, quote, note:"Port pilot workflow." } ]
}
- recommendedCitation MORA biti jedan od: fpzg, pravo-fusnote, pravo-social-author, apa7, harvard, chicago-author, chicago-notes, mla9, vancouver, ieee, custom. STEM tehnicki najcesce "ieee" ili "harvard"; ako izvor propisuje autor-godina bez imena stila -> "harvard"; ako fusnote -> "chicago-notes"; ako nejasno -> "custom".

NEMOJ dirati nijednu dijeljenu datoteku (source-registry, verified-profiles, ledger, catalog, manifest, coverage). Pisi ISKLJUCIVO u data/sources/${fac.id}/, data/profiles/${fac.id}/drafts/ i discovery/port-specs/${fac.id}.json.

Vrati JSON sazetak (faculty, found, sourceIds, profileIds, scoredCount, advisoryCount, specPath, notes). U notes napisi: koje izvore si nasao/preskocio, koliko pravila spustio u advisory na grep-provjeri, i sve dvojbe za ljudski pregled.`
}

phase('Port')
log(`Batch: ${faculties.map((f) => f.id).join(', ')}`)
const results = await parallel(
  faculties.map((fac) => () =>
    agent(prompt(fac), { label: `port:${fac.id}`, phase: 'Port', schema: SUMMARY, agentType: 'general-purpose' })
  )
)

const ok = results.filter(Boolean)
const found = ok.filter((r) => r.found)
log(`Zavrseno: ${found.length}/${faculties.length} fakulteta s izvorom. Port-specovi u discovery/port-specs/.`)
return {
  faculties: faculties.map((f) => f.id),
  found: found.map((r) => r.faculty),
  skipped: ok.filter((r) => !r.found).map((r) => ({ faculty: r.faculty, reason: r.reason })),
  totals: {
    scored: found.reduce((n, r) => n + (r.scoredCount || 0), 0),
    advisory: found.reduce((n, r) => n + (r.advisoryCount || 0), 0),
  },
  specPaths: found.map((r) => r.specPath).filter(Boolean),
  perFaculty: ok,
}
