# ARCHITECTURE_NOTES

Mapa stvarnog stanja za LEKTA V2 upgrade (referencira ju `LEKTA_UPGRADE_BRIEF.md`). Zivi
dokument; azurira se kad se otkrije nesto novo. Tvrdi izvor pravila i konvencija ostaje
`CLAUDE.md`; ovaj dokument je orijentacijska mapa, ne izvor istine za pravila.

## 1. Stack i granice

- Vite + TypeScript (strict), vitest + happy-dom. Bez frameworka, bez backenda za analizu.
- Analiza `.docx` je 100% lokalna (Web Worker `analyze-docx.worker.ts` + inline fallback).
- Monetizacija (paketi/narudzbe/placanje) preko Supabase Edge funkcija + Lemon Squeezy; danas
  ugasena u soft-launchu (`reportEndpoint:''`, `enabled:false` u `DEFAULT_PRODUCTION_CONFIG`,
  `src/ui/app.ts`).

## 2. Mapa datoteka (gdje sto zivi)

- **Analizator (parser + jezgra):** `src/docx/parser.ts` (OOXML), `src/analysis/analyze-docx.ts`
  (`analyzeDocx` + auditni helperi), most `src/analysis/analyze-docx-client.ts`, golden ulaz
  `src/analysis/golden-entry.ts` (`analyzeFixture`/`resolveProfile`).
- **Bodovanje / provjere:** `src/scoring/checks.ts` (`makeCheck`/`issue`/`categoryTotals`),
  auditi `src/audits/*` (`structure`, `register`, `submission-lint`), citati
  `src/citations/*` (`author-year`, `legal-citation`).
- **Rules engine (profili):** `src/profiles/*` (`profile-loader`, `rule-compiler` Option A
  `effectiveRules`, `profile-schema`, `profile-validator`); autorski podaci u `data/**`.
- **Repair engine:** `src/repair/*` (`zip-codec`, `xml-patch`, `fixers`, `apply-fixers`;
  vlastiti zip codec + ciljana OOXML zakrpa, bez DOM round-tripa) + UI izvedba
  `src/ui/repair-items.ts` (RepairableItem iz profila) + `src/ui/repair-panel.ts`.
- **Pregled dokumenta:** `src/preview/preview-anchors.ts` (sidra nalaza), `render-preview.ts`
  (citljivo/MVP), `render-facsimile.ts` (faksimil A4).
- **Triage (NOVO, Faza 1):** `src/analysis/triage.ts` + dijeljeni `src/analysis/check-fixer-map.ts`.
- **Paywall / entitlement:** `src/report/*` (`report`, `report-client`, `slot-logic`,
  `checkout`, `pricing`, `work-type-estimate`), auth `src/auth/session.ts`.
- **Supabase funkcije:** `supabase/functions/*` (`generate-report`, `create-checkout`, ...),
  migracije `supabase/migrations/*`.
- **UI orkestrator:** `src/ui/app.ts` (UI, narudzbe, placanje, QA). Ulaz `src/main.ts`.

## 3. Format nalaza (referentna tocka)

Rezultat `analyzeDocx` (jedan objekt): `score, checks[], issues[], categories, stats, details{}`
(+ `preview`, `documentStructure`, `profile*`, `settings`).

- **`Check`** (`src/scoring/checks.ts`): `{category, title, status('pass'|'warn'|'fail'), earned,
  max (0=informativno, ne boduje se), detail, issue|null, scored}`.
- **`Issue`**: `{severity('error'|'warning'|'info'), category, title, detail, where}`. Lokacija je
  slobodni tekst (`where`) i cesto ugradjeni `"odlomak N"` u `detail` (ne strukturirano polje).
- **`SubmissionFinding`** (`src/audits/submission-lint.ts`): `{paragraphIndex (1-based; 0=razina
  dokumenta), kind, severity, excerpt, message}`. Advisory, u `details.submissionLint`.
- **`details`** nosi (izbor): `missingReferences`/`uncitedReferences`/`incompleteReferences`
  (`.p` 1-based + doslovni tekst), `sections`, `introParagraphIndex`, `sadrzajParagraphIndex`,
  `hasTocField`, `legalCitationEngine`, `typoLint`, `registerLint`, `submissionLint`,
  `titlePageWorkType`, `mentorPresent`, i **NOVO `triage`** (v. §6).

Do Faze 1 **nijedan** nalaz nije nosio `fixability`/`fixId`/`groupKey`/`anchorId`/`locations`.
Triage model to dodaje kao zasebnu projekciju u `details.triage` (ne mijenja `Check`/`Issue`).

## 4. docx biblioteka: sto podrzava

- Citanje: `ZipReader` + `@xmldom/xmldom` DOMParser (isti u workeru i testovima).
- Pisanje/popravak: vlastiti `src/repair/zip-codec.ts` (single-deflate, `CompressionStream`) +
  `xml-patch.ts` (ciljana zakrpa atributa/cvorova, bez cijelog DOM round-tripa).
- **Word komentari: NISU podrzani** i NE gradimo ih (rizik > korist). Zato "changelog u dokumentu"
  iz briefa (F3.5) otpada; changelog ide kao **vanjski HTML**.
- Fixtures: `tests/helpers/docx-builder.ts` (`buildDocxFile`, `DocSpec`/`ParaSpec`, `raw` escape
  hatch), sinteticki golden `scripts/gen-golden-fixtures.ts`. Ne radimo novi `scripts/make-fixtures`.

## 5. Granica BESPLATNO / PLACENO (kljucno za cijeli upgrade)

Brief pretpostavlja da su popravci besplatni. **Nisu.** Ispravna granica:

- **BESPLATNO (dijagnoza):** svi nalazi + vrsta + lokacija ("odlomak N", skok) + brojaci
  auto/assisted/manual. BEZ doslovnog isjecka i BEZ tocne upute ("recept"). Gate
  `recipeUnlocked()` (`app.ts`) vec skriva recept izvan demo/punog izvjestaja (WS-1, gotovo).
- **PLACENO (popravak):** petlja odabir -> pregled -> primjena -> ponovna provjera -> **score
  delta**, izvrsena **server-side** iza entitlementa (`slot-logic`/`generate-report` obrazac,
  cijena po vrsti rada u `pricing.ts`). Klijentski `src/repair/*` NIJE put isporuke placenog
  popravka. Brojaci auto/assisted iz besplatnog sloja su ujedno teaser za placeni popravak.

Privatnost mreznog puta: `sanitizeAnalysisResult` (`src/report/report.ts`) whitelista `details`
na 4 kljuca (`profileFingerprint/ruleAuthority/profileDefinitionId/sources`), pa `details.triage`
(koji sadrzi isjecke) **nikad ne ide na mrezu**. Jedini put koji salje sadrzaj dokumenta danas je
rucna narudzba (`submitOrder`, uz privolu).

## 6. Triage model (Faza 1, NOVO)

`buildTriage(result) -> { findings: TriageFinding[], counts:{auto,assisted,manual,total} }`
(`src/analysis/triage.ts`). Cist, golden-safe (ide u `details.triage`; golden-normalize snapshota
samo score/profile/stats/checks/issues). Opseg: nalazi se izvode iz `result.checks` (bodovani
ne-pass ILI informativni s issueom); savjetodavni linteri (typo/register/submission) imaju svoj
prikaz i NE ulaze u triage brojace.

**Klasifikacija (izvedena iz postojeceg couplinga, ne izmisljena):**

| Razina | Znacenje | Izvor klasifikacije | Primjeri |
|---|---|---|---|
| `auto` | popravak ne dira sadrzaj (svojstva oblikovanja) | `check-fixer-map.ts` `AUTO_CHECK_FIXER` (zivi fixer) | margine, format papira, font, velicina, prored, poravnanje, razmak odlomka/fusnota, polozaj broja stranice, prazni odlomci |
| `assisted` | siguran, ali mijenja strukturu; treba potvrdu | `STRUCTURAL_RULES` (triage) | Word stilovi naslova, numeriranje od Uvoda, natpisi tablica/slika, abecedni poredak literature, popisi ilustracija |
| `manual` | traži ljudsku odluku; Lekta daje uputu | default | citat bez zapisa / zapis bez citata, potpunost/nepotpuni izvori, oblik poveznica, izvori uz elemente, minimalan broj izvora, ručna završna provjera |

`fixId` (FixerId) se postavlja za auto (i za assisted numeriranje `page-numbering-fixer`);
`groupKey` grupira assisted nalaze za grupne akcije (`caption.table`, `page.numbering`, ...).
`locations[]` = `{paragraphIndex, footnoteId?, anchorId('loc-p{N}'|'loc-fn{N}'), excerpt}`,
izvedene iz `preview-anchors` (`collectIssueAnchors`/`collectFootnoteAnchors` + strukturirani
ref flagovi). Nalazi bez pouzdanog sidra dobivaju `locations: []` (UI bez gumba skoka).

Dijeljeni izvor istine za auto tier: `src/analysis/check-fixer-map.ts` (`CHECK_TITLES`,
`PAPER_SIZE_TITLE_PREFIX`, `AUTO_CHECK_FIXER`, `autoFixerForCheckTitle`). `repair-items.ts` ga
uvozi (bivsi lokalni `CHECK_TITLE`/`PAPER_SIZE_PREFIX`), pa nema dvostrukog vodjenja.

## 7. Sigurnosni status (brief "blokeri" — vec rijeseni)

- **Izlozeni admin `?setup=1`:** gejtan (`app.ts`): `__DEV_TOOLS__` (skinut u produkcijskom buildu)
  + query param + `setupAllowed()` (localhost/127.0.0.1 ILI vlastiti `localStorage['lekta.admin']`).
  Panel uredjuje samo klijentski `productionConfig`; nema serverske eskalacije. NIJE blocker.
- **Client-side paywall bypass:** server je autoritativan (`slot-logic` u Edge funkciji; pravi
  `fullReport`, `traceToken`, `coverageTier`, garancija su serverski potpisani). Klijentski
  display-gate lokalno-vec-izracunatog detalja je mekan, ali WS-1 (dijagnoza bez recepta) i
  server-side repair (engine se ne isporucuje klijentu) to pokrivaju. NIJE blocker.
- **CSP:** postoji (`public/_headers`), ali `connect-src 'self' https:` je preširok; suzavanje na
  allowlist je Faza 3 ovog plana (vec oznaceno kao odgodjeno u komentaru datoteke).

## 8. Redoslijed upgrade programa

Prvo besplatni sloj + akvizicija: Faza 1 (triage model, GOTOVO) -> Faza 2 (triage UI) ->
Faza 3 (dokaziva privatnost) -> Faza 4 (SEO) -> Faza 5 (regresija/izlaz). Placeni server-side
loop + assisted rutine + pravno + deploy = odgodjeni track (postojeci WS-2..WS-7). Interni alat
za pravila (brief F6) ostaje agent-based (`rule-drafter`), izvan ovog programa.
