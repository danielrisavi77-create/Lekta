# Mapa paketa — što je gdje

> Popis datoteka i skripti. Otvara se kad treba znati KOJA skripta radi što; ne
> treba za vođenje rada, pa ne stoji u `SKILL.md`.

## 3. ŠTO JE GDJE

```
references/dijelovi.md          OS DIJELOVA — od čega se rad sastoji, tko što provjerava;
                                registar je references/dijelovi.json, alat scripts/dijelovi.py
references/zasto.md             obrazloženja željeznih pravila 11–20 (stvarni radovi i kvarovi);
                                stoji izvan routera jer se čita jednom, a router svaku poruku
references/metodologija.md      dio `metodologija` — osam odjeljaka, uzorak, instrument,
                                operacionalizacija, etika, ograničenja
references/rasprava.md          dio `rasprava` — četiri poteza po nalazu, kontratumačenje,
                                granica prema zaključku
references/engleski.md          dijelovi `summary_en` i `naslovnica_druga` + blok za repozitorij
references/jezik.md             jezik rada: alat koji ga ne podržava se isključuje,
                                ne izmišlja nalaze
references/fusnote.md           disciplina navođenja u fusnoti (legal-footnote profili)
references/ucitavanje.json      UGOVOR O UČITAVANJU: što se u kojem modu mora pročitati,
                                pod kojim uvjetom, i što se nikad ne učitava pri radu
references/primjerci.md         obranjeni rad kao mjerilo oblika (pravilo 17); razlika
                                prema profilu je opservacija, ne kršenje
references/izracuni.md          šest pogrešaka u IZBORU formule i test za svaku
references/istrazivanje.md      traženje literature: baze, građenje upita, snowball,
                                zasićenje, plan čitanja po ulogama
references/razina.md            razina rada i predznanje čitatelja: što se definira, što se
                                pretpostavlja; registar references/razina.json
references/rubrika.md           kriteriji ocjenjivanja: pojas, što ga drži, što alat ne vidi;
                                registar je references/rubrika.json, alat scripts/jezik.py                razrješavanje jezika rada + guard koji alate isključuje
scripts/provjeri_fusnote.py     ibid., prvo puni pa skraćeni oblik, numeracija, sirotani
scripts/nalazi_trag.py          zabiljezi/analiza: koji se nalazi popravljaju, a koji
                                stoje kroz krugove — jedini podatak o tome što maknuti
scripts/ucitavanje.py           izračunaj popis štiva za OVAJ projekt i mod; uvjeti se
                                evaluiraju protiv .katedra/, nepoznat uvjet NE izbacuje
                                referencu (preskočeno štivo skuplje je od suvišnog)
scripts/primjerci.py            izmjeri/upisi/popis: mjeri obranjeni rad i uspoređuje ga
                                s profilom; ne skida ništa s interneta
scripts/provjeri_izracune.py    izbor formule: postotni bod, osnovica, CAGR, bazni vs
                                lančani indeks, nominalno vs realno, zbroj udjela
scripts/provjeri_jezik.py       hrvatski pravopis, gramatika i registar; pravilna jezgra
                                bez rječnika + neobavezan hunspell prolaz (--rjecnik)
scripts/tempo.py                planirane stranice naspram dana do roka, minus
                                administrativni rep; --strogo blokira na zaostatku
scripts/pretraga.py             pretraga i plan čitanja: init/upit/snowball/zasicenje/
                                citanje/status → .katedra/pretraga.json i citanje.json
scripts/razina.py               razina rada: --postavi/--citatelj/--tip, ispisuje šest obveza
                                koje ulaze u pisanje jednako kao kućni stil
scripts/provjeri_literaturu.py  popis literature protiv profila: oblik jedinice, uvlaka,
                                razmak, abecedni red po hrvatskoj kolaciji — nad .docx-om
scripts/provjeri_prikaze.py     slike i grafikoni kao SLIKE: efektivni dpi, širina naspram
                                teksta, razvučen omjer, kolabirana visina, skaliranje koje
                                mijenja veličinu pisma u grafikonu
scripts/rubrika.py
references/plan.md              mod 1 — Plan i program, sekcije 0–11
references/pisanje.md           mod 2, 3 — akademsko pisanje, struktura odlomka, self-check
references/stil_pipeline.md     mod 2, 3 — stilski pipeline, pragovi, harness za subagenta
references/audit.md             mod 4 — adapter na rad-audit (motor), NE kopija pipelinea
references/vjestine.md          mod 2/4/6 — satelitski skillovi: kada se zovu i kako se čita
                                njihov nalaz; registar je references/vjestine.json
references/rad_audit_contract.md  verzionirani Katedra ↔ rad-audit engine/result contract
references/obrana.md            mod 5 — 12 slajdova, scenarij, 15 pitanja, 5 brojki
references/predaja.md           mod 6 — preflight i hodogram unatrag od roka
references/povratak.md          mod 7 — rad se vratio uređen iz Worda; regresije, glas, odstupanja
references/stil_autora.md       glas autora: što svaki put popravi za nama (.katedra/stil_autora.json)
references/stanje_schema.md     oblik .katedra/ datoteka (stanje, perspectives, plan, zamjerke, verzije)
references/fakulteti/           admitted registry + canonical profili/overlayi + _support_catalog/_scale_policy
docs/PROMJENE.md          što je dodano i zašto
references/source_verification_schema.json  schema v1 za .katedra/izvori.json
references/grill_me.md          v1.1 — sokratski stress-test plana (advisory, ne blokira gate)
docs/v1_1_dodaci.md       v1.1 — opseg, status i ograničenja community dodataka; core patch log
references/originality_schema.json      schema v1 za originality_check.py --json izlaz
references/plan_stress_test_schema.json schema v1 za .katedra/plan_stress_test.json (grill_me.py)

scripts/napredak.py             AGREGATOR napretka (pravilo 29): četiri faze, score uz
                                pokrivenost, trend u .katedra/napredak_povijest.jsonl, --html
scripts/drift.py                SKILL.md: synced kartica naspram repo kopije (§ 0.0 pravilo b);
                                0 iste / 1 razišle se / 2 NIJE izmjereno — dvojka nije uredno
scripts/provjeri_zamke_proze.py šest tihih zamki proze uz check_ai_style (SKILL.md §3);
                                nikad blokira, --usporedi prije.json za prije/poslije
scripts/provjeri_vancouver.py   referentna provjera Vancouver (n) citata: siročad, redoslijed,
                                razmak; trajni dom dijalekta je citation_dialects.py
scripts/provjeri_dijelove.py    opseg po dijelovima iz profila (struktura.opseg.<tip>.dijelovi):
                                riječi, udio, znakovi sažetka, redoslijed, podsekcije, razmak_pt
scripts/provjeri_hks_fzs.py     ono što shema ne nosi za HKS-FZS (font tablica, „Tablica N",
                                Vancouver interpunkcija, N u sažetku, MeSH); ostalo → provjeri_dijelove
scripts/upute_u_profil.py       Upute fakulteta (PDF/DOCX/TXT) → kandidati s lokatorom i
                                confidence → skica profila po shemi; ništa bez citata.
                                Tijek: references/upute_u_profil.md
references/glas_fpzg.md         kućni glas FPZG-a (mod 2/3 kad je profil fpzg); bivši
                                skill fpzg-skill-pisanje, sada referenca
scripts/gate.py                 JEDAN ULAZ za provjere faze: --faza plan|pisanje|audit|predaja.
                                Svaki korak je ok / nalaz / preskočeno / alat pukao — zadnja
                                dva se izgovaraju, ne prešućuju (pravila 8 i 20). --suho
                                pokaže što bi se pokrenulo, bez pokretanja.
scripts/jezik.py                razrješavanje jezika rada + guard koji alate isključuje
scripts/provjeri_fusnote.py     ibid., prvo puni pa skraćeni oblik, numeracija, sirotani
scripts/nalazi_trag.py          zabiljezi/analiza: koji se nalazi popravljaju, a koji
                                stoje kroz krugove — jedini podatak o tome što maknuti
scripts/ucitavanje.py           izračunaj popis štiva za OVAJ projekt i mod; uvjeti se
                                evaluiraju protiv .katedra/, nepoznat uvjet NE izbacuje
                                referencu (preskočeno štivo skuplje je od suvišnog)
scripts/primjerci.py            izmjeri/upisi/popis: mjeri obranjeni rad i uspoređuje ga
                                s profilom; ne skida ništa s interneta
scripts/provjeri_izracune.py    izbor formule: postotni bod, osnovica, CAGR, bazni vs
                                lančani indeks, nominalno vs realno, zbroj udjela
scripts/provjeri_jezik.py       hrvatski pravopis, gramatika i registar; pravilna jezgra
                                bez rječnika + neobavezan hunspell prolaz (--rjecnik)
scripts/tempo.py                planirane stranice naspram dana do roka, minus
                                administrativni rep; --strogo blokira na zaostatku
scripts/pretraga.py             pretraga i plan čitanja: init/upit/snowball/zasicenje/
                                citanje/status → .katedra/pretraga.json i citanje.json
scripts/razina.py               razina rada: --postavi/--citatelj/--tip, ispisuje šest obveza
                                koje ulaze u pisanje jednako kao kućni stil
scripts/provjeri_literaturu.py  popis literature protiv profila: oblik jedinice, uvlaka,
                                razmak, abecedni red po hrvatskoj kolaciji — nad .docx-om
scripts/provjeri_prikaze.py     slike i grafikoni kao SLIKE: efektivni dpi, širina naspram
                                teksta, razvučen omjer, kolabirana visina, skaliranje koje
                                mijenja veličinu pisma u grafikonu
scripts/rubrika.py              AGREGATOR nad artefaktima (arg/pravila/dijelovi/evidence_gate/
                                zamjerke/stil/sazetak/zadatak): pojas + što ga drži. Ne uvodi
                                nijednu novu prosudbu i ne predviđa ocjenu mentora; kriterij
                                bez artefakta je ❔ i nikad se ne broji kao ispunjen
scripts/dijelovi.py             os dijelova: --sij iz profila, --status, --set, --provjeri.
                                Uvozi norm/SINONIMI iz check_rules.py, ne prepisuje ih
scripts/provjeri_engleski.py    engleski summary i ključne riječi protiv hrvatskog sažetka:
                                brojke, ispisani brojevi, broj ključnih riječi, duljina,
                                hrvatski ostaci. Kvalitetu prijevoda NE ocjenjuje
scripts/stanje_init.py          stvaranje i VALIDACIJA stanja (nikad ručno)
scripts/perspective_map.py      perspectives.json — mapiranje perspektiva prije outlinea/plana
scripts/plan_gate.py             zajednički machine gate za perspective map + plan completeness
scripts/plan_state.py           plan.json — init, import, next, mark, status, odstupanje, odobri
scripts/profile_resolver.py     compositional resolver: context → resolved profile
scripts/profile_registry.py     generate/check index.json samo iz admitted faculty bundleova
scripts/faculty_scale_gate.py    pilot/production readiness + admission gate
scripts/profile_rules.py        composition + JSON Pointer provenance/freshness API
scripts/provenance_report.py    read-only coverage/freshness report za resolved pravila
scripts/rukopis.py              RUKOPIS u markdownu (izvor istine): init iz plana, status,
                                parser markdowna za sastavljanje
scripts/build_docx.py           GENERIRA .docx kostur po profilu fakulteta (naslovnica, TOC polje,
                                rimska→arapska numeracija, prijelomi, natpis+prikaz+Izvor) — `--provjeri`
                                odmah pokrene check_rules nad vlastitim izlazom
scripts/check_placeholders.py   je li ostao ijedan [TREBA IZVOR] / [PROVJERI STR.] (odlomci, ćelije, fusnote)
scripts/check_rules.py          usklađenost .docx-a s pravilima fakulteta
scripts/fix_rules.py            POPRAVAK mehaničkih kršenja u postojećem radu
                                (samo oblik; tekst se provjereno ne dira)
scripts/provjeri_sazetak.py     sažetak protiv rada: broj poglavlja, pojmovi, brojke, ključne
                                riječi, parnjak u zaključku + paritetna tablica za oko (kvar 30)
scripts/check_argument.py       teza, zaključak + methodology-aware argument heuristics
scripts/consistency_check.py    read-only cross-chapter claim graph + contradiction signals
scripts/reviewer_simulation.py  read-only deterministic reviewer lenses
scripts/argument_methodology.py metodološki policyji za argument validator (B09)
scripts/check_ai_style.py       tragovi generiranog teksta — 4 dimenzije
scripts/check_paragraphs.py     geometrija odlomaka u STVARNOM prijelomu (render, ne procjena)
scripts/verify_rewrite.py       dokaz da delegirano prepisivanje nije izgubilo sadržaj + B13 safety gates
scripts/evidence_gate.py         Source Analysis Matrix + advisory/strict evidence gate
scripts/verify_sources.py       verification semantics + provider provjera + pokrivenost
scripts/source_semantics.py      verified/unverified/conflict/invalid + A/B/C/D/E/X + discovery metadata
scripts/extract_comments.py     komentari/tracked changes → versioned zamjerke.json
scripts/mentor_feedback_state.py mentor feedback revision/history state
scripts/diff_versions.py        snapshot, usporedba verzija, izgubljeni citati
scripts/artifact_state.py       centralni artifact hash/version manifest
scripts/state_migrations.py     monotone migracije stanje.json uz backup
scripts/user_profile.py         profil autora između radova (~/.katedra/)
scripts/vjestine.py             registar sposobnosti: razrješava satelitske skillove (rad-audit,
                                replikacija-pspp, fpzg-diplomski) i javi ako kojeg nema
scripts/engine.py               most na rad-audit: discovery + contract-driven entrypointi
scripts/rad_audit_contract.py    parser/validator engine contracta i DocumentAuditResulta
scripts/hr_text.py              zajednički sloj za hrvatski tekst (koriste ga ostale skripte)
scripts/citation_dialects.py    parser citatnih dijalekata (autor-godina, IEEE, pravna fusnota)
scripts/claim_ledger.py         claims.jsonl — tvrdnje i njihove veze na dokaze (B12)
scripts/evidence_model.py       identiteti i JSONL ugovori evidence/claim sloja
scripts/context.py              razrješavanje projektnog korijena + atomaran zapis stanja
scripts/review_policy.py        pravila read-only/mutation granice u modu 4
scripts/originality_check.py     v1.1 — advisory preklapanje rada s ingestiranim evidence izvorima
scripts/export_bibliography.py   v1.1 — izvoz .katedra/izvori.json u BibTeX/RIS
scripts/grill_me.py              v1.1 — sokratski stress-test plana (advisory, ne blokira gate)
scripts/revizije.py              v1.2 — tri podnaredbe nad .docx kroz životni ciklus revizije:
                                `prihvati` (Track Changes → čist tekst na razini XML-a, PRIJE
                                dijagnoze, 0.7a — python-docx inače tiho preskače <w:ins>/<w:del>),
                                `redline` (obojeni .docx između dvije verzije, za čovjeka — ne
                                zamjenjuje diff_versions.py), `toc` (procjena stranica keširanog
                                TOC polja preko LibreOffice+pypdf dok Update Field nije ručno
                                pokrenut u Wordu; ne zamjenjuje ga)
scripts/zamjerke.py              v1.2 — resolve/provjeri/grupiraj: zatvaranje zamjerki s tragom (status
                                otvoreno/rijeseno/djelomicno) i karta premještanja za strukturne zamjerke
```

Runtime skripte se pozivaju **iz project cwd-a**; cwd se ne mijenja u instalirani skill.
Adresiraj samo skriptu preko `<KATEDRA_SKILL>`, a project datoteke ostaju `./...`:
`python3 <KATEDRA_SKILL>/scripts/check_rules.py ./rad.docx --fakultet efzg --tip zavrsni`.

**Uklonjeno u v1.3:** `interaction_policy.py`, `agent_policy.py`, `eval_runner.py`,
`benchmark_runner.py`, `originality_eval.py`. Nijednu nije pozivao runtime, a `tests/` i
`evals/` se ne isporučuju pa su bez svojih gold-setova bile mrtve. Nezavisni audit
(`docs/audit.md`, Q16) preporučio je brisanje prve dvije izrijekom. U razvojnom checkoutu
i dalje postoje.

Faze A–G (citati, brojke, tipografija, Word polja) **nisu ovdje** — vlasnik im je
skill `rad-audit`, a zove ih `engine.py`. Ako u ovom popisu ikad osvane kopija
`pipeline.md` ili `audit_all.py`, netko je prekršio pravilo 10.
