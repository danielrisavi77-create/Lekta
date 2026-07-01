# Lekta · Pipeline verifikacije pravila

Spec za izgradnju. Cilj: nijedno bodovano pravilo nije objavljeno ako nije sljedivo do službenog izvora, i to stanje ostaje istinito kroz vrijeme.

Veže se na: rule-compiler (Option A: ruleEntries -> effectiveRules), validator profila, golden harness, source registry i coverage matricu (sve već postoji u v2.3.0). Ovaj dokument je disciplina koja ta polja stvarno popuni i nikad ne laže. CLAUDE.md vrijedi za pravila rada.

## 1. Iskreni cilj i definicija verified

100% verified za svaki dokument doslovno nije moguće: dio pravila postavlja mentor pojedinačno i nema javnog izvora. Zato je ispravan, dostižan cilj:

> Nula BODOVANIH pravila koja nisu sljediva do službenog izvora.

Sve što se ne može potkrijepiti izvorom NE boduje se. Prikazuje se kao savjet uz link na službeni izvor ili provjeri kod mentora. To je obranjiva i poštena definicija 100%.

Pravilo je `verified` samo ako nosi sva polja iz ugovora (sekcija 2) i prošlo je ljudsku verifikaciju (sekcija 4, korak 5).

## 2. Ugovor o verifikaciji (polja po pravilu)

Proširi `ruleEntries` shemu tako da svako pravilo nosi:

- `ruleId`, `category`, `label`, `value`, `checkId` (postojeće)
- `machineCheckable` (postojeće)
- `authority`: razina autoriteta (vidi hijerarhiju dolje)
- `sourceId`: referenca na source registry (null nije dopušten za bodovano pravilo)
- `sourcePage`: točna stranica ili odjeljak izvora (null dok nije ručno potvrđeno; nikad se ne nagađa)
- `quote`: doslovni kratki citat iz izvora ili precizan lokator
- `status`: `draft` | `verified` | `needs-recheck` | `advisory` | `retired`
- `scored`: boolean, doprinosi li bodovanju
- `lastVerified`: datum zadnje ljudske potvrde
- `verifiedBy`: tko je potvrdio
- `reviewedBy`: drugi par očiju (obavezno za obvezujuća pravila)

Izvedeno pravilo: `scored = (status === 'verified' && authority je službeni && sourcePage != null)`. Sve s `status: advisory` ima `scored: false` i prikazuje se kao savjet s linkom.

## 3. Hijerarhija autoriteta (rješava sukobe)

Od najjačeg: obvezujući pravilnik (`binding`) > službena stranica studija ili programa (`program-page`) > opće fakultetske upute i citatni stil (`general`) > pisana uputa mentora ili kolegija (`mentor-or-course`).

Pri sukobu vrijednosti pobjeđuje viši autoritet. Studentski radovi NISU izvor pravila, služe isključivo regresijskom testiranju parsera (golden fixturi).

## 4. Pipeline po ćeliji (fakultet, jedinica, program, vrsta rada)

Oznaka: (A) automatski, (H) ljudski.

1. (A) Opseg. Enumeriraj ćeliju i popiši sve dokumente koji se mogu predati. To je redak coverage matrice.
2. (A) Prikupljanje izvora. Skupi službene izvore (pravilnik, stranica studija, opće upute, citatni stil, obrazac ili predložak). Svaki spremi kao NEPROMJENJIV snapshot (PDF plus URL plus datum dohvata plus hash) u source registry, dedupliciran.
3. (A) Ekstrakcija nacrta (Guidelines Ingestion). AI iz svakog izvora predloži DRAFT pravila: vrijednost plus doslovni citat plus stranica plus predloženi `authority` plus `checkId`. Status ostaje `draft`. Nikad se ne objavljuje automatski. AI je ubrzivač za nacrt, ne verifikator.
4. (A) Normalizacija i sukobi. Mapiraj nacrte na shemu (`checkId`), dedupliciraj kroz izvore, riješi sukobe po hijerarhiji, označi proturječja za čovjeka, detektiraj rupe (pravila koja engine provjerava, a nijedan izvor ne pokriva).
5. (H) Ljudska verifikacija (vrata, ne smije se automatizirati). Čovjek otvori svako pravilo uz snapshot izvora na citiranoj stranici, potvrdi da `value` odgovara `quote`, postavi `sourcePage`, `lastVerified`, `verifiedBy`, `status: verified`. Obvezujuća pravila traže i `reviewedBy` (drugi par očiju). Što se ne može potvrditi izvorom postaje `advisory` (savjet plus link) ili ispada. Svaka radnja piše zapis u ledger.
6. (A) Strojna validacija (CI vrata, sekcija 6). Profil se ne objavljuje ako ne prođe sve provjere.
7. (A) Objava i verzija. Profil je verzioniran, otisak već nosi verziju i datum pa rezultat bilježi po kojoj je verziji rad ocijenjen. Changelog po profilu. Serviran iz Supabasea, verzioniran.

Pravilo: shipaj samo ćelije koje su prošle vrata. Bolje deset 100% verificiranih ćelija nego pedeset nesigurnih.

## 5. Freshness petlja (da 100% ostane 100%)

Verifikacija je stanje koje trune, pa pipeline ima održavanje:

- Razdvoji stabilno od promjenjivog. Stabilno (format, citatni stil, generička struktura, obvezni dijelovi): tvrdi se i boduje, dug rok valjanosti, rijetka reprovjera. Promjenjivo (rokovi, procedura predaje, individualna mentorska pravila): NE boduje se, `advisory`, linkano na živi službeni izvor. Tako promjenjivo nikad nije obveza verifikacije.
- (A) Detekcija promjene izvora. Periodički posao ponovno dohvati svaki izvor i usporedi hash i URL. Ako se promijenio, automatski postavi pogođena pravila na `status: needs-recheck`, `scored: false`, i zapiše ledger `degraded`. Živi proizvod prestaje bodovati ta pravila dok ih čovjek ne reverificira.
- (H) Sezonski batch prije roka. Jednom godišnje, prije predaja, prođi profile. Par dana po sezoni, ne dnevni posao.
- (A do H) Feedback okidač. Kanal ova provjera je kriva iz aplikacije otvara ticket za reprovjeru. Najjeftiniji izvor ispravaka.

## 6. CI vrata (blokiraju objavu, testabilno)

Profil se NE objavljuje ako ijedno padne:

- [ ] Svako pravilo sa `scored: true` ima: `authority` u {binding, program-page, general}, `sourceId` != null, `sourcePage` != null, `quote` != null, `status: verified`, `lastVerified` unutar roka valjanosti (npr. stabilno 24 mjeseca).
- [ ] Svako `binding` pravilo ima `reviewedBy` (drugi par očiju).
- [ ] rule-compiler ne vraća nijedan diagnostic (svi `checkId` mapirani).
- [ ] Golden testovi parsera zeleni.
- [ ] Nema orphan `sourceId` (svaki referencirani izvor postoji u registru i ima snapshot plus hash).
- [ ] Nijedno `scored` pravilo nema izvor čiji se `snapshotHash` promijenio nakon `lastVerified` (freshness).
- [ ] Coverage matrica preračunata i spremljena.
- [ ] Nijedno pravilo bez izvora nije `scored` (advisory je dopušten, ali ne boduje).

Ovo je proširenje postojećeg validatora plus golden harnessa. CI ne dopušta crveno.

## 7. Source registry (proširenje)

```
SourceEntry {
  id, kind ('pravilnik'|'program-page'|'guidelines'|'citation-style'|'template'),
  title, url, publisher,
  fetchedAt, snapshotPath (nepromjenjiv PDF), snapshotHash,
  validityClass ('stable'|'volatile'),
  lastChecked
}
```

Snapshot je nepromjenjiv. `sourcePage` se uvijek odnosi na taj snapshot, ne na živi URL.

## 8. Verifikacijski ledger (append-only revizijski trag)

```
VerificationLedger {
  id, ruleId, profileId,
  action ('drafted'|'verified'|'rechecked'|'degraded'|'advisory'|'retired'),
  actor, timestamp,
  sourceId, sourcePage, quote,
  note
}
```

Svaka promjena `status` pravila MORA upisati zapis. Ledger je samo-dodavanje, ne mijenja se. Štiti pravno i operativno (tko je, kad, protiv kojeg citata proglasio pravilo).

## 9. Alati (da je ljudski dio brz, ne mučan)

- Verifikacijska konzola (interni admin): popis pravila u `draft` i `needs-recheck` po ćeliji; prikaz pravila uz snapshot izvora na citiranoj stranici (PDF viewer); gumb potvrdi koji upiše ledger i postavi `status: verified`, `sourcePage`, `lastVerified`, `verifiedBy`; drugo odobrenje za `binding`; akcije advisory i retire; prikaz diffa kad se izvor promijenio. Ovo pretvara verifikaciju iz kopanja po PDF-u u nekoliko klikova.
- Ledger pravila: revizijski trag po pravilu.
- Javna coverage matrica: po ćeliji postotak bodovano-verificiranog, datum zadnje verifikacije, broj advisory pravila, link. Transparentnost pretvara zastarjelo iz tihog laganja u poštenu ogradu i ujedno je marketing povjerenja.

## 10. Runbook za svaki novi fakultet (sažeto)

Enumeriraj ćeliju, prikupi i snapshotaj izvore, AI nacrt pravila, normaliziraj i riješi po autoritetu, čovjek verificira uz snapshot, CI vrata, objavi verzionirano, zakaži reprovjeru. Shipaj samo ćelije koje su prošle vrata.

## 11. Pravilo koje se ne relativizira

AI smije draftati pravila i detektirati promjene izvora. Čovjek je jedini koji pravilo proglašava `verified`. To je 5% rada koji je cijeli moat i jedini razlog zašto bi itko platio.

## 12. Acceptance (Definition of Done za izgradnju pipelinea)

- [ ] `ruleEntries` shema proširena poljima iz sekcije 2; validator ažuriran.
- [ ] CI gate skripta implementira sve provjere iz sekcije 6; objava profila s neverificiranim `scored` pravilom pada na CI.
- [ ] Source registry sprema nepromjenjiv snapshot plus hash; orphan provjera prolazi.
- [ ] Detektor promjene izvora degradira pogođena pravila na `needs-recheck` i `scored: false` kad se hash promijeni (test s promijenjenim fixturom).
- [ ] Verifikacijski ledger je append-only; svaka promjena statusa upisuje zapis.
- [ ] Verifikacijska konzola: tok potvrdi upisuje ledger i postavlja polja; `binding` traži dva odobravatelja.
- [ ] Engine boduje samo pravila sa `scored: true`; advisory se prikazuje kao savjet s linkom na izvor.
- [ ] Coverage matrica računa se iz verified plus scored pravila; advisory isključen iz bodovanja.
- [ ] Golden testovi i compiler diagnostics ugrađeni u isti CI.

## 13. Guardrails (uz CLAUDE.md)

- AI draftira i detektira promjene; čovjek jedini proglašava `verified`.
- Neverificirano se ne boduje, postaje advisory s linkom.
- Snapshot izvora je nepromjenjiv; `sourcePage` se nikad ne nagađa (null dok nije potvrđeno).
- Sukobi se rješavaju po hijerarhiji autoriteta.
- Hrvatski default, bez em i en crtica, produkcijski kod, mali commitovi, `npm run check` zelen.
