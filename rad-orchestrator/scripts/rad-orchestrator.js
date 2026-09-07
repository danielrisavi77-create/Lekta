// rad-orchestrator v1.3.0 — 2026-09-05 (tvrdi gate: faza se zatvara po gate.py izlaznom kodu i gate.json-u, ne po samoprijavi agenta) (paket se ne mijenja iz workflowa → .katedra/nalazi_paketa.md; lens budget: leće se ponavljaju samo kad se gate promijenio ili su prošli put imale nalaze; args.lens_budget=false isključuje; katedra-pkg <SLUG>_HOME; tolerantan na katedra-lite < v1.9; rad_docx mod)
export const meta = {
  name: 'rad-orchestrator',
  description: 'Vođa kroz faze rada koji zove STVARNE katedra-lite skripte (stanje_init → plan_state → rukopis → build_docx → gate → napredak); paralelni audit, bidirekcionalni flow, ceka_autora umjesto ping-ponga',
  phases: [
    { title: 'Setup', detail: 'Validacija args, init .katedra/ stanja' },
    { title: 'Plan', detail: 'PLAN I PROGRAM → plan.json → gate plan' },
    { title: 'Pisanje', detail: 'rukopis .md → build_docx → gate pisanje' },
    { title: 'Audit', detail: 'gate audit + paralelni lensovi + sinteza' },
    { title: 'Predaja', detail: 'gate predaja → snapshot → napredak HTML' },
  ],
}

// ─────────────────────────────────────────────────────────
// 0. ARGS — stvarni podaci iz glavne sesije, ne simulirani razgovor
// ─────────────────────────────────────────────────────────
const config = args || {}
const POTREBNA_POLJA = ['tip', 'tema', 'faza', 'fakultet']
const nedostaje = POTREBNA_POLJA.filter((p) => !config[p])
if (nedostaje.length > 0) {
  log(`❌ Nedostaju obavezna polja u args: ${nedostaje.join(', ')}`)
  return {
    greska: 'nedostaju_obavezna_polja', nedostaje,
    napomena: 'Prikupi tip, tema, faza, fakultet (opcionalno: empirijski, rok, full_auto, katedra_skill, project_root) razgovorom s korisnikom u glavnoj sesiji, pa pozovi Workflow s args.'
  }
}

// Normalizacija na vokabular katedra-lite (stanje_init.TIPOVI, registry slugovi)
const TIP_MAP = { seminar: 'seminarski', seminarski: 'seminarski', 'završni': 'zavrsni', zavrsni: 'zavrsni', diplomski: 'diplomski', esej: 'esej' }
const tip = TIP_MAP[String(config.tip).toLowerCase()] || 'seminarski'
const fakultetSlug = String(config.fakultet).toLowerCase()
const REGISTRY = ['fpzg', 'efzg', 'libertas']
const uRegistryju = REGISTRY.includes(fakultetSlug)
const empirijski = Boolean(config.empirijski)
const fullAuto = Boolean(config.full_auto)
const KATEDRA_SKILL = config.katedra_skill
if (!KATEDRA_SKILL) {
  log('❌ args.katedra_skill nedostaje — apsolutna putanja do instaliranog katedra-lite skilla (SKILL.md ga pronalazi: ls -d /root/.claude/skills/synced/*/katedra-lite ~/.claude/skills/katedra-lite).')
  return { greska: 'nedostaje_katedra_skill', napomena: 'Proslijedi args.katedra_skill = <putanja do katedra-lite>. Sateliti (rad-audit, rad-docx, fpzg-diplomski, replikacija-pspp) traže se kao susjedi te mape ili kroz args.sateliti_dir.' }
}
const SATELITI_DIR = config.sateliti_dir || KATEDRA_SKILL.replace(/\/+$/, '').replace(/\/[^/]+$/, '')
const RAD_DOCX_ULAZ = config.rad_docx || null   // postojeći gotov rad (mod 4/6) — bez plana i rukopisa
const PROJECT_ROOT = config.project_root || 'rad-workspace' // SKILL.md prosljeđuje APSOLUTNU putanju (agenti ne dijele cwd s glavnom sesijom)
const rokArg = config.rok || null

const trebaOdobrenjePlana = tip === 'zavrsni' || tip === 'diplomski'

phase('Setup')
log(`📋 ${tip} · "${config.tema}" · fakultet ${fakultetSlug}${uRegistryju ? '' : ' (izvan registryja)'} · start: ${config.faza} · KATEDRA_SKILL=${KATEDRA_SKILL}`)

// ─────────────────────────────────────────────────────────
// Zajednički blokovi prompta
// ─────────────────────────────────────────────────────────
const S = `${KATEDRA_SKILL}/scripts`
const K = './.katedra'

const OKVIR = `RADNI OKVIR (vrijedi za sve naredbe):
- Projekt korisnikova rada je mapa '${PROJECT_ROOT}/' (APSOLUTNA putanja). Prvo: mkdir -p ${PROJECT_ROOT} && cd ${PROJECT_ROOT}
- SVE katedra-lite naredbe pokreći IZ te mape (cwd = korijen rada), skriptu adresiraj apsolutno:
    python3 ${S}/<skripta>.py ...
  Nikad ne cd-aj u ${S}. Nikad ne piši .katedra/*.json ručno — samo kroz skripte.
- PRIJE prve katedra-lite naredbe u SVAKOM Bash pozivu izvezi putanje satelita (vjestine.py ih čita iz env-a):
    export RAD_AUDIT_HOME=${SATELITI_DIR}/rad-audit/scripts RAD_DOCX_HOME=${SATELITI_DIR}/rad-docx FPZG_DIPLOMSKI_HOME=${SATELITI_DIR}/fpzg-diplomski REPLIKACIJA_PSPP_HOME=${SATELITI_DIR}/replikacija-pspp
  (ako neki ne postoji, vjestine.py --provjeri to kaže — deklariraj kao ograničenje, ne blefiraj)
${RAD_DOCX_ULAZ ? `- POSTOJEĆI RAD (mod 4/6): ${PROJECT_ROOT}/rad.docx je IZVOR ISTINE, nema plan.json ni .katedra/poglavlja/. NIKAD ne pokreći build_docx.py ni rukopis.py. Popravci idu ISKLJUČIVO na kopiju: snapshot → fix_rules.py --out / apply_safe_fixes.py / sigurni_popravci_hr.py → verify_rewrite.py prije poslije → revizije.py redline. Sadržajni nalazi (struktura, argument, izvori) su treba_autora, ne mijenjaju se.` : ''}
- Ako naredba padne, pročitaj njezinu poruku (skripte objašnjavaju što treba) i ispravi ulaz. Ne blefiraj da je prošla.
- Na kraju svake faze: ako postoji ${S}/napredak.py → python3 ${S}/napredak.py --zabiljezi --json ${K}/napredak.json
  i u sazetak uključi score, pokrivenost i "najviše diže sljedeće". Ako ne postoji (katedra-lite < v1.9) → score=null, pokrivenost=null i zabilježi "napredak.py nedostaje" u naredbe_pale — NE izmišljaj score.
- Pomoćne skripte v1.9 (provjeri_vancouver.py, provjeri_hks_fzs.py, sigurni_popravci_hr.py) koristi SAMO ako postoje u ${S}/; inače preskoči taj korak i zabilježi.
- Željezna pravila katedra-lite vrijede: ništa se ne izmišlja; što nema izvor → [TREBA IZVOR]; stranica koja se ne može potvrditi → [PROVJERI STR.].
- PAKET SE NE MIJENJA IZ WORKFLOWA: nikad ne uređuj datoteke u ${S}/ ni u ${SATELITI_DIR}/ (skripte, reference, profili). Ako je paket kriv (kvar, lažni nalaz, nedostajuća grana), zapiši u ${K}/nalazi_paketa.md (simptom / uzrok / predloženi diff / dokaz prije–poslije na ovom radu) i nastavi u smanjenom opsegu; zakrpa ide kroz skill katedra (učenje) poslije, uz reviziju. Popis takvih nalaza uključi u sazetak.
${config.odluke_autora ? `- ODLUKE AUTORA (odgovori korisnika na pitanja iz prethodnog kruga — PRIMIJENI ih prije bilo čega drugog, zabilježi u tablici PRETPOSTAVKI/ODLUKA i ne postavljaj ista pitanja ponovno):
${String(config.odluke_autora).split('\n').map((l) => '    ' + l).join('\n')}
- Za [PROVJERI STR.]: smiješ preuzeti javno dostupan PDF izvora (Hrčak/DOI/službeni dokument) i pročitati ga s pdftotext; broj stranice upiši SAMO ako je vidljiv u zaglavlju/podnožju te stranice (pravilo 28). Ako se ne može potvrditi — marker ostaje.` : ''}
${fullAuto ? `- AUTOPILOT (korisnik je unaprijed autorizirao rad s defaultima, SKILL.md §0.1): otvorena polja koja ne mijenjaju sadržaj rada — kolegij, nositelj, mentor, upute kolegija, izjava o AI alatima, prijava teme — NE zaustavljaju rad. Deklariraj ih u tablici PRETPOSTAVKI u sazetku i nastavi. Teza koju si sam izveo iz plana je pretpostavka, ne pitanje. Markeri [TREBA IZVOR]/[PROVJERI STR.] ostaju u tekstu i idu u tablicu RUČNO PROVJERI — nisu razlog za treba_autora sve do faze predaje. treba_autora=true SAMO kad bez autora nije moguće nastaviti (npr. predaja gate blokira zbog neriješenih markera, ili nedostaje sadržajna odluka koja mijenja tezu).` : '- Otvorena polja (kolegij, mentor, upute) koja korisnik nije dao: postavi treba_autora=true s konkretnim pitanjima — ne pretpostavljaj.'}`

const fakultetFlag = uRegistryju ? `--fakultet ${fakultetSlug}` : `--fakultet-izvan-registryja ${fakultetSlug}`
const profilFlag = uRegistryju ? `--profil ${K}/resolved_profile.json` : `--fakultet ${fakultetSlug}`
const rokNaredba = rokArg ? `--rok ${rokArg}` : `--rok "$(date -d '+42 days' +%F)"`

const FAZA_REZULTAT_SCHEMA = {
  type: 'object',
  properties: {
    sazetak: { type: 'string', description: 'Što je STVARNO napravljeno: koje naredbe prošle, koje datoteke nastale, score/pokrivenost iz napredak.py' },
    artefakti: { type: 'array', items: { type: 'string' }, description: 'Putanje datoteka stvarno kreiranih/izmijenjenih' },
    naredbe_pale: { type: 'array', items: { type: 'string' }, description: 'Naredbe koje su vratile grešku i nisu se dale ispraviti (prazno ako su sve prošle)' },
    problem_pronaden: { type: 'boolean', description: 'STRUKTURNI problem koji potječe iz ranije faze (rad ne prati plan, nedostaje poglavlje)' },
    povratak_na_fazu: { type: 'string', enum: ['plan', 'pisanje', 'audit', 'predaja', 'nema'] },
    kontekst_problema: { type: 'string', description: 'Konkretan opis za raniju fazu; prazno ako nema' },
    treba_autora: { type: 'boolean', description: 'Postoje nalazi koje NIJEDNA automatizirana faza ne smije riješiti (nedostaje izvor za tvrdnju, sadržajna odluka, mentorov zahtjev). To NIJE strukturni problem i NE vraća se na raniju fazu.' },
    pitanja_za_autora: { type: 'array', items: { type: 'string' }, description: 'Konkretna pitanja/odluke koje autor mora dati da se nastavi' },
    score: { type: ['integer', 'null'], description: 'health_score iz napredak.py, null ako nema' },
    pokrivenost: { type: ['number', 'null'] },
    gate_koraci: { type: 'array', items: { type: 'object', properties: { naziv: { type: 'string' }, stanje: { type: 'string', enum: ['ok', 'nalaz', 'preskoceno', 'pukao'] }, otisak: { type: 'string', description: 'kratak sažetak nalaza koraka (≤80 znakova) — isti nalaz mora dati isti otisak' } }, required: ['naziv', 'stanje', 'otisak'] }, description: 'SAMO audit priprema: svaki korak iz gate.json; lens budget uspoređuje ovo s prošlim prolazom' }
  },
  required: ['sazetak', 'artefakti', 'naredbe_pale', 'problem_pronaden', 'povratak_na_fazu', 'kontekst_problema', 'treba_autora', 'pitanja_za_autora', 'score', 'pokrivenost']
}

// ─────────────────────────────────────────────────────────
// 1. INIT — .katedra/stanje.json kroz stanje_init (nikad ručno)
// ─────────────────────────────────────────────────────────
const init = await agent(
  `${OKVIR}

ZADATAK — inicijaliziraj projekt rada kroz katedra-lite skripte (mehanički, bez pisanja sadržaja):

1. mkdir -p ${PROJECT_ROOT} && cd ${PROJECT_ROOT}
2. Ako ${K}/stanje.json već postoji: python3 ${S}/stanje_init.py --validate ; ako je valjan, NE radi init ponovno — samo po potrebi --set tema="${config.tema}".
   Inače:
   ${RAD_DOCX_ULAZ
     ? `cp "${RAD_DOCX_ULAZ}" ./rad.docx && python3 ${S}/stanje_init.py --mod audit --tip ${tip} --tema "${config.tema}" ${fakultetFlag} ${rokNaredba} --ima rad_docx${uRegistryju ? '' : ' --ogranicenje "fakultet izvan registryja: upute nisu priložene ili su iz sažimača — formalni nalazi savjetodavni"'} ; python3 ${S}/diff_versions.py --snapshot ./rad.docx --biljeska "izvornik korisnika, prije audita"`
     : `python3 ${S}/stanje_init.py --mod novi-rad --tip ${tip} --tema "${config.tema}" ${fakultetFlag} ${rokNaredba}`}
3. ${uRegistryju
    ? `python3 ${S}/profile_resolver.py --fakultet ${fakultetSlug} --tip ${tip} --profile-out ${K}/resolved_profile.json --provenance-out ${K}/resolved_profile.provenance.json`
    : `// fakultet nije u registryju. Ako postoji profil-datoteka za ${fakultetSlug} (args.profil_datoteka ili ${KATEDRA_SKILL}/references/fakulteti/${fakultetSlug}.json): python3 ${S}/profile_resolver.py --fakultet ${fakultetSlug} --tip ${tip} --profil-datoteka <ta datoteka> --profile-out ${K}/resolved_profile.json --provenance-out ${K}/resolved_profile.provenance.json (samostojni, ADVISORY). Inače: bez profila; gateovi koji ga traže bit će "preskočeno" (pravilo 8), ne izmišljaj profil.`}
4. python3 ${S}/dijelovi.py --sij ${uRegistryju ? `--profil ${K}/resolved_profile.json` : ''} --tip ${tip}  (ako padne bez profila, zabilježi i nastavi)
5. python3 ${S}/napredak.py --zabiljezi --json ${K}/napredak.json

Vrati JSON prema shemi (problem_pronaden=false, treba_autora=false, povratak_na_fazu="nema").`,
  { label: 'Init .katedra/', phase: 'Setup', schema: FAZA_REZULTAT_SCHEMA, agentType: 'general-purpose', effort: 'low' }
)
if (!init) { log('❌ Init agent nije vratio rezultat — prekid.'); return { status: 'agent_bez_rezultata', faza: 'init' } }
log(`🗂️ init: ${init.sazetak.slice(0, 160)}${init.naredbe_pale.length ? ' | PALE: ' + init.naredbe_pale.join('; ') : ''}`)

// ─────────────────────────────────────────────────────────
// 2. PROMPTOVI FAZA — stvarne naredbe, stvarni artefakti
// ─────────────────────────────────────────────────────────
const FAZA_REDOSLIJED = ['plan', 'pisanje', 'audit', 'predaja']
const FAZA_NAZIV = { plan: 'Plan', pisanje: 'Pisanje', audit: 'Audit', predaja: 'Predaja' }

function promptPlan() {
  return `${OKVIR}

Korisnik piše ${tip} rad na temu "${config.tema}". FAZA: PLAN (katedra-lite mod 1).

0. IDEMPOTENTNOST: cd ${PROJECT_ROOT}; python3 ${S}/plan_state.py status. Ako plan.json već ima poglavlja rada (ne sekcije dokumenta) i ./plan.md postoji → NE radi init/import ponovno; preskoči na korak 5 (odobrenje) i 6 (gate). Ako je plan djelomičan/kriv → ispravi plan.md i ponovi import s --force.
   Ako ${K}/resolved_profile.json ne postoji: python3 ${S}/profile_resolver.py --fakultet ${fakultetSlug} --tip ${tip} --profile-out ${K}/resolved_profile.json --provenance-out ${K}/resolved_profile.provenance.json
1. cd ${PROJECT_ROOT}; pozovi Skill tool sa skill='katedra-lite' i pročitaj references/plan.md (mod 1). NE zovi 'plan-i-program' (mrtav alias).
2. python3 ${S}/ucitavanje.py --mod 1   (pročitaj što skripta kaže da moraš pročitati na ovom projektu)
3. Napiši ./plan.md u PLAN I PROGRAM formatu. OBAVEZNO: struktura poglavlja ide unutar ograde
   <!-- STRUKTURA:POCETAK --> ... <!-- STRUKTURA:KRAJ -->
   kao tablica | Broj | Naslov | Stranice | Sadržaj | Izvori | s retcima poput
   | 1.1 | Uvod: kontekst, teza, istraživačko pitanje | 2 | ... | ... |
   Brojevi potpoglavlja X.Y, stranice po potpoglavlju realne za ${tip} rad. Izvan ograde: teza,
   istraživačko pitanje, vremenska linija do roka iz stanje.json, popis literature (samo izvori koje si
   stvarno našao web-pretragom, s URL-om; bez izmišljanja), otvorena polja (mentor, kolegij...) kao "za nadopuniti".
4. python3 ${S}/plan_state.py init --teza "<teza iz plan.md>" --budzet <zbroj stranica>
   python3 ${S}/plan_state.py import ./plan.md
   python3 ${S}/plan_state.py status      — provjeri da su uvezena TVOJA poglavlja rada, ne sekcije dokumenta; ako nisu, popravi ogradu/tablicu i ponovi import s --force.
5. ${trebaOdobrenjePlana
    ? `Za ${tip} rad plan mora proći gate: python3 ${S}/perspective_map.py --help pa napravi perspectives.json po uputi; python3 ${S}/plan_gate.py ; zatim ${fullAuto ? `python3 ${S}/plan_state.py odobri --actor full-auto (korisnik je unaprijed autorizirao full auto)` : 'NE odobravaj plan sam — odobrenje daje korisnik. Postavi treba_autora=true s pitanjem "Odobravaš li plan iz plan.md?" i pitanjima o otvorenim poljima.'}`
    : `Seminarski/esej po pravilu 1 ne traži puni plan gate: python3 ${S}/stanje_init.py --set plan_odobren=true`}
6. python3 ${S}/gate.py --faza plan --tip ${tip} --json ${K}/gate.json ; python3 ${S}/nalazi_trag.py zabiljezi --gate ${K}/gate.json
   (koraci "preskočeno"/"pukao" se izgovaraju u sazetku, ne prešućuju)
7. python3 ${S}/napredak.py --zabiljezi --json ${K}/napredak.json

Vrati JSON prema shemi.`
}

function promptPisanje() {
  return `${OKVIR}

Korisnik piše ${tip} rad na temu "${config.tema}". FAZA: PISANJE (katedra-lite mod 2). Markdown u ${K}/poglavlja/ je IZVOR ISTINE, .docx se iz njega sastavlja.

1. cd ${PROJECT_ROOT}; python3 ${S}/stanje_init.py --set mod=pisanje ; python3 ${S}/ucitavanje.py --mod 2
2. Pozovi Skill tool sa skill='fpzg-skill-pisanje' (akademski stil, citiranje) — pročitaj i references/pisanje.md i references/razina.md iz katedra-lite.
3. python3 ${S}/plan_state.py status ; python3 ${S}/plan_state.py next
   Ako ${K}/poglavlja/ ne postoji: python3 ${S}/rukopis.py init  (kostur NN-slug.md iz plana). python3 ${S}/rukopis.py status
4. Ako su sva potpoglavlja već "napisano" a postoje ODLUKE AUTORA ili kontekst povratka: ovo je REVIZIJA — uredi postojeće .md (Edit) prema odlukama (teza/okvir/definicije/imena/stranice), ne piši ispočetka, i ponovno pokreni check_ai_style nad izmijenjenim datotekama.
   Inače, za SVAKO potpoglavlje iz plana koje nije napisano: napiši stvaran akademski tekst na hrvatskom u odgovarajuću
   datoteku ${K}/poglavlja/NN-slug.md (Write/Edit), prema opsegu stranica iz plana (~300 riječi/stranica).
   Citati autor-godina samo za izvore iz plan.md; tvrdnja bez izvora → [TREBA IZVOR]. Nikakav placeholder tekst.
   Nakon svakog: python3 ${S}/plan_state.py mark <X.Y> --status napisano --rijeci <broj riječi>
5. Sastavi docx: python3 ${S}/build_docx.py ${profilFlag} --tip ${tip} --tema "${config.tema}" --plan ${K}/plan.json --rukopis --out ./rad.docx
   pa python3 ${S}/stanje_init.py --set datoteke.rad_docx=true
6. python3 ${S}/check_ai_style.py ./rad.docx --json ${K}/stil.json (ako postoji) i python3 ${S}/provjeri_zamke_proze.py ./rad.docx (ako postoji) — popravi u .md, ne u docx, pa ponovno build_docx.
7. python3 ${S}/gate.py --faza pisanje --rad ./rad.docx ${uRegistryju ? `--profil ${K}/resolved_profile.json` : ''} --tip ${tip} --json ${K}/gate.json ; python3 ${S}/nalazi_trag.py zabiljezi --gate ${K}/gate.json
8. python3 ${S}/napredak.py --zabiljezi --json ${K}/napredak.json

STRUKTURNI problem (→ problem_pronaden=true, povratak_na_fazu="plan"): plan nema potpoglavlje bez kojeg tema ne stoji, ili je struktura neprikladna za ${tip}.
Vrati JSON prema shemi.`
}

function promptAuditPriprema() {
  return `${OKVIR}

FAZA: AUDIT — priprema (mehanički). Korisnik ima ${tip} rad "${config.tema}".

1. cd ${PROJECT_ROOT}; ${RAD_DOCX_ULAZ ? '(postojeći rad — build_docx se NE pokreće)' : 'ako ./rad.docx ne postoji ili je stariji od ' + K + '/poglavlja/*.md:'} python3 ${S}/build_docx.py ${profilFlag} --tip ${tip} --tema "${config.tema}" --plan ${K}/plan.json --rukopis --out ./rad.docx
2. python3 ${S}/diff_versions.py --snapshot ./rad.docx --biljeska "prije audita"
3. python3 ${S}/stanje_init.py --set datoteke.rad_docx=true ; python3 ${S}/stanje_init.py --set mod=audit
4. python3 ${S}/gate.py --faza audit --rad ./rad.docx ${uRegistryju ? `--profil ${K}/resolved_profile.json` : ''} --tip ${tip} --json ${K}/gate.json
   python3 ${S}/nalazi_trag.py zabiljezi --gate ${K}/gate.json
5. python3 ${S}/nalazi_trag.py analiza --faza audit  (što preživljava kroz krugove)

U sazetak stavi: sažetak gate.json (ok/nalaz/preskočeno/pukao, što blokira) i koje su datoteke nalaza nastale u ${K}/ (stil.json, pravila.json, arg.json...).
U gate_koraci stavi SVAKI korak iz gate.json: naziv, stanje (ok|nalaz|preskoceno|pukao) i otisak = deterministički kratak sažetak nalaza tog koraka (npr. "3 nalaza: font, prored, TOC" — isti nalazi → isti otisak; ok → "ok"). Lens budget po tome odlučuje koje se leće ponavljaju.
Vrati JSON prema shemi (problem_pronaden=false, treba_autora=false).`
}

const NALAZ_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    nalazi: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ozbiljnost: { type: 'string', enum: ['kritično', 'srednje', 'kozmetičko'] },
          kategorija: { type: 'string', enum: ['mehanicko', 'strukturno', 'treba_autora'], description: 'mehanicko = agent smije popraviti u .md; strukturno = rad ne prati plan; treba_autora = nedostaje izvor/sadržajna odluka koju samo autor može dati' },
          datoteka: { type: 'string', description: 'koja .md datoteka u .katedra/poglavlja/' },
          opis: { type: 'string' },
          citat: { type: 'string' },
          preporuka: { type: 'string' }
        },
        required: ['ozbiljnost', 'kategorija', 'opis', 'preporuka']
      }
    }
  },
  required: ['lens', 'nalazi']
}

function auditLensovi() {
  const l = [
    { naziv: 'Sadržaj i logika', koraci: /argument|teza|logik|plan|dijel|zadat|rubrik|proturje/i, uputa: `Pozovi Skill tool sa skill='rad-audit' (dio o logici/argumentaciji). Pročitaj ${K}/plan.json i ${K}/arg.json ako postoji.`, fokus: 'Prati li argumentacija plan, logičke rupe, teza ↔ zaključak. Nedostaje li poglavlje iz plana → kategorija strukturno.' },
    { naziv: 'Citati i reference', koraci: /citat|literatur|izvor|referenc|evidence|fusnot|siro/i, uputa: `Pozovi Skill tool sa skill='rad-audit' (dio o citiranju). Pročitaj ${K}/gate.json korake o izvorima/literaturi.`, fokus: 'Tvrdnje bez izvora, [TREBA IZVOR], nedosljedan stil, siročad. Tvrdnja kojoj FALI izvor a agent ga ne smije izmisliti → kategorija treba_autora.' },
    { naziv: 'Plagijat i AI-tekst', koraci: /generiran|\bai\b|stil|ponavlj|zamk|original|preklap/i, uputa: `Pročitaj ${K}/stil.json ako postoji (check_ai_style) i ${K}/gate.json korak "tragovi generiranog teksta".`, fokus: 'Predvidljive fraze, ponavljanja, generički prijelazi. Uglavnom mehanicko.' },
    { naziv: 'Formatiranje i jezik', koraci: /pravopis|tipograf|profil|pravil|format|jezik|odloma|prikaz|slik|geometr/i, uputa: `Pročitaj ${K}/gate.json korake pravopis/tipografija/profil i ${K}/pravila.json ako postoji.`, fokus: 'Navodnici, brojevi, jedinice, terminologija. Mehanicko osim ako profil fakulteta traži odluku autora.' }
  ]
  if (empirijski) l.push({ naziv: 'Empirijska provjera', koraci: /izracun|brojk|formul|statist|replik|model/i, uputa: `Pozovi Skill tool sa skill='replikacija-pspp'.`, fokus: 'Brojke i statističke tvrdnje: provjerljive i konzistentne? Brojka bez podataka → treba_autora.' })
  return l
}

function promptLens(lens, priprema) {
  return `Korisnik ima ${tip} rad "${config.tema}". Rukopis (IZVOR ISTINE): ${PROJECT_ROOT}/${K}/poglavlja/*.md ; sastavljen ./rad.docx ; gate izvještaj ${PROJECT_ROOT}/${K}/gate.json.
Sažetak gate prolaza: ${priprema.sazetak.slice(0, 900)}

Ti si SPECIJALIZIRANI AUDIT LENS: **${lens.naziv}**. Samo svoja dimenzija — ostale pokrivaju drugi lensovi paralelno.
1. cd ${PROJECT_ROOT}; pročitaj ${RAD_DOCX_ULAZ ? 'tekst iz ./rad.docx (python-docx ili ' + S + '/../../rad-audit/scripts/extract_text.py) — stvaran tekst; nalaze veži uz poglavlje/odlomak, ne uz .md datoteku' : 'SVE ' + K + '/poglavlja/*.md (Read) — stvaran tekst, ne pretpostavljaj'}.
2. ${lens.uputa}
3. ${lens.fokus}
4. Za svaki nalaz: datoteka, doslovan citat, preporuka, i KATEGORIJA (mehanicko / strukturno / treba_autora). Bez nalaza → prazan niz, ne izmišljaj.
Vrati JSON prema shemi.`
}

function promptSinteza(sviNalazi, priprema) {
  return `${OKVIR}

FAZA: AUDIT — sinteza. ${tip} rad "${config.tema}". Nalazi iz paralelnih lensova (JSON):
${JSON.stringify(sviNalazi, null, 1)}

Gate sažetak: ${priprema.sazetak.slice(0, 600)}

1. cd ${PROJECT_ROOT}; napiši ./audit-report.md: nalazi po ozbiljnosti, s kategorijom, datotekom, citatom, preporukom, lensom; na vrhu sažetak gate.json.
2. ${RAD_DOCX_ULAZ
     ? `Nalaze "mehanicko" ISPRAVI SAMO na kopiji: python3 ${S}/fix_rules.py ./rad.docx --profil ${K}/resolved_profile.json --tip ${tip} --out ./rad_v2a.docx ; python3 $RAD_AUDIT_HOME/apply_safe_fixes.py ./rad_v2a.docx ./rad_v2b.docx ; python3 ${S}/sigurni_popravci_hr.py ./rad_v2b.docx ./rad_v2.docx (ako postoji) ; python3 ${S}/verify_rewrite.py --zahvat stil --profil ${K}/resolved_profile.json --require-snapshot --project-root . ./rad.docx ./rad_v2.docx ; python3 ${S}/revizije.py redline ./rad.docx ./rad_v2.docx ./rad_v2_redline.docx ; python3 ${S}/diff_versions.py --snapshot ./rad_v2.docx --biljeska "v2 sigurni popravci". Izvornik ./rad.docx se NE mijenja.`
     : `Nalaze kategorije "mehanicko" ISPRAVI u ${K}/poglavlja/*.md (Edit) — NIKAD u docx. Zabilježi u izvještaju što je ispravljeno.`}
3. ${RAD_DOCX_ULAZ ? '(postojeći rad — bez build_docx; gate na ./rad_v2.docx)' : 'Ponovno sastavi:'} python3 ${S}/build_docx.py ${profilFlag} --tip ${tip} --tema "${config.tema}" --plan ${K}/plan.json --rukopis --out ./rad.docx
   python3 ${S}/gate.py --faza audit --rad ./rad.docx ${uRegistryju ? `--profil ${K}/resolved_profile.json` : ''} --tip ${tip} --json ${K}/gate.json ; python3 ${S}/nalazi_trag.py zabiljezi --gate ${K}/gate.json
4. python3 ${S}/napredak.py --zabiljezi --json ${K}/napredak.json
5. Odluči:
   - ima li nalaza "strukturno" (rad ne prati plan / nedostaje poglavlje) → problem_pronaden=true, povratak_na_fazu="pisanje" (sadržaj) ili "plan" (struktura), kontekst_problema konkretan;
   - ima li nalaza "treba_autora" (kritičnih ili srednjih) → treba_autora=true i pitanja_za_autora = konkretna pitanja (npr. "Poglavlje 5: navedi izvor za tvrdnju '...' ili je ukloni"). Ovo NE vraća na raniju fazu — automatizirane faze to ne mogu riješiti, ping-pong je besmislen.
   - inače oboje false.
Vrati JSON prema shemi.`
}

function promptPredaja() {
  return `${OKVIR}

FAZA: PREDAJA (katedra-lite mod 6). ${tip} rad "${config.tema}".

1. cd ${PROJECT_ROOT}; pročitaj ./audit-report.md. Ako sadrži neriješene KRITIČNE nalaze kategorije treba_autora → NE formatiraj: treba_autora=true, pitanja_za_autora iz izvještaja, i stani (ne vraćaj na audit — to je ping-pong).
   Ako sadrži neriješene KRITIČNE nalaze kategorije mehanicko/strukturno → problem_pronaden=true, povratak_na_fazu="audit".
2. python3 ${S}/stanje_init.py --set mod=predaja ; python3 ${S}/ucitavanje.py --mod 6
3. ${fakultetSlug === 'fpzg'
    ? `Pozovi Skill tool sa skill='fpzg-diplomski' — rukopis u ${K}/poglavlja/ dijeli konvencije ([[PB]], [[SEC]]); izradi predajni docx po FPZG kućnom stilu u ./rad-final.docx. Ako satelit ne može, deklariraj i koristi build_docx.`
    : `python3 ${S}/build_docx.py ${profilFlag} --tip ${tip} --tema "${config.tema}" --plan ${K}/plan.json --rukopis --out ./rad-final.docx --provjeri`}
4. python3 ${S}/gate.py --faza predaja --rad ./rad-final.docx ${uRegistryju ? `--profil ${K}/resolved_profile.json` : ''} --tip ${tip} --json ${K}/gate.json ; python3 ${S}/nalazi_trag.py zabiljezi --gate ${K}/gate.json
   Ako gate blokira: razvrstaj blokirajuće korake — [TREBA IZVOR]/[PROVJERI STR.] u tekstu, zamjerke mentora, nedostajući obavezni dio koji traži sadržaj → treba_autora=true s pitanjima; pravopis/format/popis literature → problem_pronaden=true, povratak_na_fazu="audit".
5. python3 ${S}/diff_versions.py --snapshot ./rad-final.docx --biljeska "predajna verzija"
   mkdir -p ${K}/isporuke && cp ./rad-final.docx ${K}/isporuke/$(date +%F)-rad.docx   (pravilo 15)
6. python3 ${S}/rubrika.py --opsirno --json ${K}/rubrika.json
   python3 ${S}/napredak.py --zabiljezi --json ${K}/napredak.json --html ./napredak.html
7. Na kraju sazetka tablica "RUČNO PROVJERI" (pravilo 7): sva [PROVJERI STR.], pretpostavke za mentora, pravila fakulteta za potvrdu.
Vrati JSON prema shemi.`
}

function sPovratkom(prompt, kontekst) {
  if (!kontekst) return prompt
  return `⚠️ VRAĆENO IZ KASNIJE FAZE zbog: "${kontekst}"
Prvo riješi TOČNO to (u ${K}/poglavlja/*.md ili plan.md + plan_state import --force), pa nastavi normalno.

${prompt}`
}

// ─────────────────────────────────────────────────────────
// 3. AUDIT — priprema (gate) → paralelni lensovi → sinteza
// ─────────────────────────────────────────────────────────
// Lens budget (v1.2): drugi i svaki idući audit ponavlja samo leće čiji su se gate koraci
// promijenili od prošlog prolaza ili koje su prošli put imale nalaze (popravak se mora
// potvrditi). Ostale leće ne troše agenta — njihovi prošli nalazi ulaze u sintezu označeni
// `iz_proslog_prolaza`. args.lens_budget=false → sve leće uvijek.
let zadnjiAudit = null
const LENS_BUDGET = config.lens_budget !== false

function koraciZaLens(lens, koraci) {
  return (koraci || []).filter((k) => lens.koraci && lens.koraci.test(k.naziv || ''))
    .map((k) => `${k.naziv}|${k.stanje}|${k.otisak}`).sort().join('\n')
}

function odlukaBudgeta(lensovi, priprema) {
  if (!LENS_BUDGET) return { pokreni: lensovi, preskoci: [], razlog: 'lens_budget isključen' }
  if (!zadnjiAudit) return { pokreni: lensovi, preskoci: [], razlog: 'prvi audit' }
  const nemaPodataka = !(priprema.gate_koraci || []).length || !(zadnjiAudit.gate_koraci || []).length
  if (nemaPodataka) return { pokreni: lensovi, preskoci: [], razlog: 'priprema nije vratila gate_koraci' }
  const pokreni = [], preskoci = []
  for (const l of lensovi) {
    const prije = koraciZaLens(l, zadnjiAudit.gate_koraci)
    const sada = koraciZaLens(l, priprema.gate_koraci)
    const imaoNalaze = (zadnjiAudit.nalaziPoLensu[l.naziv] || []).length > 0
    if (prije !== sada || imaoNalaze) pokreni.push(l)
    else preskoci.push(l)
  }
  return { pokreni, preskoci, razlog: 'gate otisak + prošli nalazi' }
}

async function izvrsiAudit(kontekst) {
  const priprema = await agent(sPovratkom(promptAuditPriprema(), kontekst),
    { label: 'Audit: gate + snapshot', phase: 'Audit', schema: FAZA_REZULTAT_SCHEMA, agentType: 'general-purpose', effort: 'low' })
  log(`🔧 audit priprema: ${priprema.sazetak.slice(0, 200)}`)

  const lensovi = auditLensovi()
  const { pokreni, preskoci, razlog } = odlukaBudgeta(lensovi, priprema)
  log(`🔎 lens budget (${razlog}): pokrećem ${pokreni.length}/${lensovi.length}${preskoci.length ? ' — preskačem: ' + preskoci.map((l) => l.naziv).join(', ') : ''}`)
  const rez = pokreni.length ? await parallel(pokreni.map((l) => () => agent(promptLens(l, priprema),
    { label: `Lens: ${l.naziv}`, phase: 'Audit', schema: NALAZ_SCHEMA, agentType: 'general-purpose' }))) : []
  const valid = rez.filter(Boolean)
  const nalaziPoLensu = {}
  for (const l of pokreni) nalaziPoLensu[l.naziv] = []
  for (const r of valid) nalaziPoLensu[r.lens] = (r.nalazi || []).map((n) => ({ ...n, lens: r.lens }))
  for (const l of preskoci) nalaziPoLensu[l.naziv] = (zadnjiAudit.nalaziPoLensu[l.naziv] || []).map((n) => ({ ...n, iz_proslog_prolaza: true }))
  const svi = Object.values(nalaziPoLensu).flat()
  const poKat = svi.reduce((a, n) => { a[n.kategorija] = (a[n.kategorija] || 0) + 1; return a }, {})
  log(`📊 ${svi.length} nalaza (${valid.length}/${pokreni.length} leća vratilo rezultat, ${preskoci.length} iz prošlog prolaza) — ${JSON.stringify(poKat)}`)
  zadnjiAudit = { gate_koraci: priprema.gate_koraci || [], nalaziPoLensu }

  const sinteza = await agent(promptSinteza(svi, priprema),
    { label: 'Audit: sinteza + odluka', phase: 'Audit', schema: FAZA_REZULTAT_SCHEMA, agentType: 'general-purpose', effort: 'high' })
  sinteza.artefakti = [...new Set([...(priprema.artefakti || []), ...(sinteza.artefakti || [])])]
  sinteza.lens_budget = { pokrenuto: pokreni.map((l) => l.naziv), preskoceno: preskoci.map((l) => l.naziv) }
  return sinteza
}

// ─────────────────────────────────────────────────────────
// 4. STATE MACHINE — bidirekcionalno, s guardovima i ceka_autora
// ─────────────────────────────────────────────────────────
const MAX_POSJETA_PO_FAZI = 3

// ─────────────────────────────────────────────────────────
// TVRDI GATE — skripta, ne samoprijava agenta
// ─────────────────────────────────────────────────────────
// Do v1.2.1 je orkestrator napredovao isključivo po poljima koja agent sam
// vrati (`problem_pronaden`). Dovoljno je bilo da agent vrati false i faza
// „predaja" je kretala iako je `gate.py --faza audit` vratio 1, a run je
// završavao statusom `zavrseno`. `gate.json` se spominjao samo unutar teksta
// prompta i nikad se nije čitao.
//
// Workflow sandbox nema fs, pa gate provjerava agent kojemu je to JEDINI
// zadatak: pokreni jednu naredbu, prepiši njezin izlaz, ne popravljaj ništa.
// Odluku donosi skripta ispod, ne on.
const GATE_SCHEMA = {
  type: 'object',
  properties: {
    izlazni_kod: { type: 'integer', description: 'echo $? nakon gate.py — doslovno, ne procijenjeno' },
    blokira: { type: 'array', items: { type: 'string' }, description: 'sazetak.blokira iz gate.json' },
    nepokrenuto: { type: 'array', items: { type: 'string' }, description: 'sazetak.nepokrenuto iz gate.json (blokirajući koraci koji se NISU pokrenuli)' },
    zadnji_redak: { type: 'string', description: 'zadnji redak ispisa gate.py, doslovno' },
    gate_json_procitan: { type: 'boolean', description: 'je li .katedra/gate.json stvarno postojao i pročitan' },
  },
  required: ['izlazni_kod', 'blokira', 'nepokrenuto', 'zadnji_redak', 'gate_json_procitan'],
}

async function provjeriGate(faza, naziv) {
  const r = await agent(
    `${OKVIR}

ZADATAK — samo izmjeri gate. NE popravljaj ništa, NE pokreći druge skripte, NE mijenjaj nijednu datoteku.

1. cd ${PROJECT_ROOT}
2. python3 ${S}/gate.py --faza ${faza} --rad ./rad.docx --kat ${K} --json ${K}/gate.json ; echo "IZLAZNI_KOD=$?"
3. cat ${K}/gate.json

Vrati DOSLOVNO:
- izlazni_kod: broj iza IZLAZNI_KOD=
- blokira: polje sazetak.blokira iz gate.json
- nepokrenuto: polje sazetak.nepokrenuto iz gate.json (ako ga starija verzija nema, vrati prazno polje)
- zadnji_redak: zadnji redak ispisa gate.py
- gate_json_procitan: true samo ako si datoteku stvarno pročitao

Ako naredba padne jer skripta ne postoji, vrati izlazni_kod 127 i gate_json_procitan false.
Ne tumači nalaze, ne predlažaj popravke, ne sažimaj. Ovo je mjerenje, ne audit.`,
    { label: `gate:${faza}`, phase: naziv, schema: GATE_SCHEMA, agentType: 'general-purpose', effort: 'low' }
  )
  return r
}

const MAX_UKUPNO_ITERACIJA = 12
const MAX_UZASTOPNO_BEZ_NAPRETKA = 3

let idx = FAZA_REDOSLIJED.indexOf(config.faza)
if (idx === -1) idx = 0
let kontekstPovratka = null
let iteracija = 0
let uzastopnoBezNapretka = 0
const posjeceno = {}
const povijest = []
const sviArtefakti = []

function zavrsi(status, extra) {
  return { status, config: { tip, tema: config.tema, fakultet: fakultetSlug, empirijski, project_root: PROJECT_ROOT, katedra_skill: KATEDRA_SKILL },
    povijest, svi_artefakti: [...new Set(sviArtefakti)], ukupno_iteracija: iteracija, posjeceno_po_fazi: posjeceno, ...extra }
}

while (idx < FAZA_REDOSLIJED.length && iteracija < MAX_UKUPNO_ITERACIJA) {
  iteracija++
  const faza = FAZA_REDOSLIJED[idx]
  posjeceno[faza] = (posjeceno[faza] || 0) + 1
  const naziv = FAZA_NAZIV[faza]
  phase(naziv)
  log(`▶️ ${naziv} (posjet #${posjeceno[faza]})${kontekstPovratka ? ' — nakon povratka' : ''}`)

  let r
  if (faza === 'audit') {
    r = await izvrsiAudit(kontekstPovratka)
  } else {
    const p = faza === 'plan' ? promptPlan() : faza === 'pisanje' ? promptPisanje() : promptPredaja()
    r = await agent(sPovratkom(p, kontekstPovratka),
      { label: `${naziv} (posjet ${posjeceno[faza]})`, phase: naziv, schema: FAZA_REZULTAT_SCHEMA, agentType: 'general-purpose', effort: faza === 'pisanje' ? 'high' : 'medium' })
  }
  if (!r) { log(`⚠️ ${naziv}: agent nije vratio rezultat — prekid`); return zavrsi('agent_bez_rezultata', { faza }) }

  povijest.push({ faza, posjet: posjeceno[faza], lens_budget: r.lens_budget, sazetak: r.sazetak, artefakti: r.artefakti, naredbe_pale: r.naredbe_pale, score: r.score, pokrivenost: r.pokrivenost, vraceno_iz: kontekstPovratka })
  if (Array.isArray(r.artefakti)) sviArtefakti.push(...r.artefakti)
  log(`📄 ${naziv}: score ${r.score ?? '—'} / pokrivenost ${r.pokrivenost ?? '—'} | artefakti: ${(r.artefakti || []).length}${(r.naredbe_pale || []).length ? ' | PALE: ' + r.naredbe_pale.join('; ') : ''}`)
  kontekstPovratka = null

  // Treća kategorija: treba autora → vrati kontrolu glavnoj sesiji, bez rollbacka
  if (r.treba_autora) {
    log(`✋ ${naziv}: nalazi koje samo autor može riješiti — zaustavljam i vraćam pitanja glavnoj sesiji.`)
    return zavrsi('ceka_autora', { zaustavljeno_u_fazi: faza, pitanja_za_autora: r.pitanja_za_autora || [], kontekst: r.kontekst_problema,
      napomena: 'Postavi pitanja korisniku u glavnoj sesiji; nakon odgovora (unesenih u .katedra/poglavlja ili plan.md) ponovno pozovi workflow s args.faza=' + faza + '.' })
  }

  const cilj = r.problem_pronaden && r.povratak_na_fazu !== 'nema' ? FAZA_REDOSLIJED.indexOf(r.povratak_na_fazu) : -1
  if (cilj !== -1 && cilj < idx) {
    uzastopnoBezNapretka++
    const ciljFaza = r.povratak_na_fazu
    const zapelo = (posjeceno[ciljFaza] || 0) >= MAX_POSJETA_PO_FAZI || uzastopnoBezNapretka >= MAX_UZASTOPNO_BEZ_NAPRETKA
    if (zapelo) {
      const razlog = uzastopnoBezNapretka >= MAX_UZASTOPNO_BEZ_NAPRETKA ? `${uzastopnoBezNapretka} uzastopna rollbacka bez dovršene faze` : `faza '${ciljFaza}' već posjećena ${posjeceno[ciljFaza]}x`
      log(`🛑 Deadlock: ${razlog} — vraćam kontrolu glavnoj sesiji.`)
      return zavrsi('ceka_stvaran_input', { razlog_zaustavljanja: razlog, pitanje_za_korisnika: r.kontekst_problema })
    }
    log(`↩️ ${naziv} → ${FAZA_NAZIV[ciljFaza]}: ${r.kontekst_problema}`)
    kontekstPovratka = r.kontekst_problema
    idx = cilj
  } else {
    // Faza se NE zatvara na agentovu riječ. Gate je jedini svjedok.
    const g = await provjeriGate(faza, naziv)
    if (!g) {
      log(`⚠️ ${naziv}: provjera gatea nije vratila rezultat — prekid (ne napredujem naslijepo).`)
      return zavrsi('gate_neizmjeren', { faza })
    }
    const pao = g.izlazni_kod !== 0 || (g.blokira || []).length > 0 || (g.nepokrenuto || []).length > 0
    povijest.push({ faza, posjet: posjeceno[faza], gate: { izlazni_kod: g.izlazni_kod, blokira: g.blokira, nepokrenuto: g.nepokrenuto } })
    if (pao) {
      uzastopnoBezNapretka++
      log(`⛔ gate ${faza}: kod ${g.izlazni_kod} | blokira: ${(g.blokira || []).join(', ') || '—'} | NIJE POKRENUTO: ${(g.nepokrenuto || []).join(', ') || '—'}`)
      if (uzastopnoBezNapretka >= MAX_UZASTOPNO_BEZ_NAPRETKA || posjeceno[faza] >= MAX_POSJETA_PO_FAZI) {
        log(`🛑 gate faze '${faza}' i dalje blokira nakon ${posjeceno[faza]} prolaza — vraćam kontrolu glavnoj sesiji.`)
        return zavrsi('gate_blokira', {
          zaustavljeno_u_fazi: faza,
          blokira: g.blokira, nepokrenuto: g.nepokrenuto, izlazni_kod: g.izlazni_kod,
          napomena: (g.nepokrenuto || []).length
            ? 'Koraci pod "nepokrenuto" nemaju ulaz. Provjera koja se nije pokrenula nije provjera koja je prošla: ili joj daj ulaz, ili je izuzmi imenom kroz gate.py --dopusti-preskok korak=razlog.'
            : 'Riješi nalaze pod "blokira" pa ponovno pozovi workflow s args.faza=' + faza,
        })
      }
      log(`🔁 ${naziv}: ponavljam fazu jer gate blokira (pokušaj ${posjeceno[faza] + 1})`)
      kontekstPovratka = `gate ${faza} blokira: ${[...(g.blokira || []), ...(g.nepokrenuto || []).map((x) => x + ' (nije pokrenuto)')].join('; ')}`
      continue
    }
    if (!g.gate_json_procitan) {
      log(`⚠️ ${naziv}: gate javlja prolaz, ali gate.json nije pročitan — to nije dokaz. Prekid.`)
      return zavrsi('gate_bez_dokaza', { faza, zadnji_redak: g.zadnji_redak })
    }
    uzastopnoBezNapretka = 0
    log(`✅ ${naziv} dovršena — gate čist (kod 0, ništa nepokrenuto)`)
    idx++
  }
}

if (iteracija >= MAX_UKUPNO_ITERACIJA) log(`⚠️ MAX_UKUPNO_ITERACIJA (${MAX_UKUPNO_ITERACIJA}) — zaustavljam.`)
log(`🎓 Gotovo. Artefakti: ${new Set(sviArtefakti).size}. Dashboard: ${PROJECT_ROOT}/napredak.html`)
return zavrsi(iteracija >= MAX_UKUPNO_ITERACIJA ? 'max_iteracija' : 'zavrseno', {})
