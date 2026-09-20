# Lekta

Kompaktni kanonski vodič za cijeli repozitorij. Domenske upute zive uz kod i
Claude Code ih ucitava tek kad radi u toj putanji. Ne dodaj `@` importe scoped
vodiča u ovaj dokument.

## Projekt

Lekta je Vite aplikacija s TypeScript strict provjerom, Vitestom i happy-domom.
U pregledniku lokalno analizira `.docx` akademske radove prema verificiranim
profilima fakulteta. Nije Next.js projekt.

Analiza je lokalna. Placeni popravak, provjera izvora, narudzbe, waitlist, rokovi
i podsjetnici koriste zivi Supabase backend.

## Granica proizvoda

Lekta analizira i deterministicki popravlja FORMU. Nikad ne pise, prepravlja ili
ocjenjuje recenice, argumentaciju ni akademski sadrzaj, ni modelom ni drugim putem.
AI pisanje pripada odvojenom proizvodu i repozitoriju. Podaci smiju teci iz Lekte
prema njemu, nikad obrnuto; formalna mjerodavnost ostaje Lektina.

Osnovni mjerljivi ugovor je isti vidljivi autorski tekst prije i poslije Word
`Fields.Update()`. Dopustene, usko definirane iznimke i njihovi testovi nalaze se
u `src/repair/CLAUDE.md`.

## Izvori istine

- `ruleEntries` su autorski izvor istine za profilna pravila; `rules` je naslijedeni agregat.
- Analiza cita samo profil slozen kroz `src/profiles/compose-profile.ts`.
- Bodovana vrijednost mora odgovarati verificiranoj tvrdnji s izvorom, lokatorom i citatom.
- Nepotvrden `sourcePage` ostaje `null`; ne pogadaj ga.
- Studentski radovi sluze regresiji parsera, nikad kao izvor pravila.
- Identitet provjere je `check.id`, ne hrvatski naslov.

Detaljni ugovor i identiteti opisani su u `docs/decisions/SOURCE_OF_TRUTH.md`.

## Privatnost i klasifikacija

`data/classification.json` odreduje sto smije u javni bundle; zadnje podudarno
pravilo vrijedi. Neklasificirana nova putanja mora srusiti build.

Draft evidence, ledger, source registry i `data/profiles/verified-profiles.json`
nikad ne idu u preglednik. Ne uklanjaj `LEKTA-KANARINAC-*` ni top-level
`kanarinac`; writeri moraju sacuvati nepoznate top-level kljuceve.

Produkcija dohvaća pravila po profilu. Kvar dohvata smije otvoreno degradirati na
opcu provjeru, ali ne smije tiho bodovati djelomicni light profil.

## Izolacija i Git

Sav rad koji pise ide u vlastiti izolirani worktree ili clone izvan repozitorija.
Zajednicko stablo sluzi samo citanju i mjerenju. Vise pisaca u istom stablu nije dopusteno.

Prije commita provjeri obje strane ciljnih putanja:

```bash
git diff --stat -- <putanje>
git diff --cached --stat -- <putanje>
npm run orphan-scan
```

Commitaj s `git commit --only <putanje>`. Ne koristi `git add -A`, `git add .`,
`git commit --amend` ni obican commit koji uzima cijeli indeks. Ne prepravljaj
povijest dok druga sesija radi. Autorstvo se ne izvodi iz zajednickog Git identiteta.

Generirane artefakte regeneriraj samo u cistom izoliranom stablu. Izvor, artefakt
i njegov ratchet moraju biti u istom commitu.

## Tvrdi gate

Svaka promjena prije commita mora proci:

```bash
npm run check
npm run orphan-scan
```

`npm run check` pokrece lint, TypeScript, Edge provjeru, Vitest i Vite build.
Zahtijeva Deno; `check:edge` se ne preskace. Zeleni izlazni kod bez Vitest retka
`Test Files` nije dovoljan dokaz.

Stanje mastera je zasebno pitanje:

```bash
npm run master-ci
```

Ishod je zeleno, CRVENO s brojem uzastopnih padova ili NE ZNAM. Nepoznato nikad
ne tumaci kao zeleno.

## Verifikacijska disciplina

- Svaki novi gard ima cisti baseline i mutaciju u `tests/gate-mutations.test.ts`.
- Novi mehanizam ima vlastiti izravni signal; nizvodno poboljsanje nije dokaz uzroka.
- Generator testa mora dokazati da proizvodi ciljanu klasu ulaza.
- Idempotencija se dokazuje dvama prolazima; drugi mora biti no-op.
- Podatke parsiraj, ne greppaj. Djelomican pad pipelinea mora oboriti mjerenje.
- Tekstualne usporedbe normaliziraju CR; binarne fixture usporeduju sirove bajtove.
- Ne koristi `git status`, izlazni kod ili ukupan broj kao odgovor na drugo pitanje.

Detalji i povijesni razlozi su u `docs/verification/AGENT_VERIFICATION.md` i
`docs/incidents/`.

## Domenski gateovi

- Parser, audit ili citations: prvo golden koji biljezi zateceno ponasanje.
- Repair ili OOXML isporuka: Tier 0 nije dokaz otvaranja u Wordu; prati scoped vodič.
- Migracije: iskljucivo `supabase db push`; MCP `apply_migration` nije dopusten.
- Migracije: prefiks od `0200` navise; `0104` do `0199` drzi Katedra na dijeljenom stagingu
  (`db push` bi sudar tiho preskocio). Gard: `tests/migration-numbering.test.ts`.
- Netrivijalne promjene u repair, citations, docx ili security kodu traze
  adversarijalni pregled drugog alata prije commita. Nalaz je advisory i mora se re-verificirati.

## Koordinacija i drugo misljenje

Astra, Fable ili `grok-audit` vodi zadatak i audit; Opus, Sonnet, Sol ili Grok
implementira kod. Po zadatku su aktivni jedan koordinator i jedan pisac. Ugovor i
lokalne naredbe su u `docs/agents/README.md`, a zajednicki red zadataka u
`docs/agents/tasks.json`.

Pregled dolazi od drugog providera: Astra pregledava Claude implementacije, Fable
pregledava Sol. Grok (`--agent grok`) implementira, `--agent grok-audit` koordinira
i pregledava Sol/Opus/Sonnet; Grokovu implementaciju pregledava Astra ili Fable,
nikad drugi Grok, a `--subscription` ne ukljucuje Grok. Modelski rezultat nije dokaz
prolaza. Sva pravila izolacije,
verifikacije i commitanja ostaju obvezna. Ako je instaliran Codex plugin, njegovi
nalazi su advisory i svaki se mora neovisno potvrditi prije primjene.

## Routing

- `src/repair/CLAUDE.md`: deterministicki popravak, vidljivi tekst, delivery i Word oracle.
- `src/citations/CLAUDE.md`: citatni parser, izvori, modalitet, scope i drift.
- `src/docx/CLAUDE.md`: OOXML parser, golden fixture i integritet paketa.
- `supabase/CLAUDE.md`: migracije, Edge Functions, sigurnost i deploy dokaz.
- `scripts/autonomy/CLAUDE.md`: projekcije, mjerenja, mutacije i resursni gateovi.

Inventar migriranih pravila je u `docs/decisions/CLAUDE_V2_RULE_INVENTORY.md`.
Povijesni v1 vodič ostaje u `docs/incidents/CLAUDE_V1_FULL_CONTEXT_2026-09-18.md`.
Aktualni backlog je u `docs/roadmap/PRODUCTION_BACKLOG.md` i issue trackeru.

## Konvencije

- Hrvatski je zadani jezik domenskog sadrzaja i komentara.
- Ne koristi em ni en crtice u tekstu.
- `src/` ostaje TypeScript strict bez `@ts-nocheck`; novi logicki kod izbjegava `any`.
- Ne uvodi nove `localStorage` hackove; koristi postojece sigurne omotace.
- Produkcijski kod, male fokusirane promjene, svaki korak zelen.

## Zavrsna provjera

Prije tvrdnje da je zadatak gotov navedi tocne naredbe i svjeze rezultate. Ako
okolina nije mogla izvrsiti obvezan gate, rezultat je neprovjeren, ne zelen.
