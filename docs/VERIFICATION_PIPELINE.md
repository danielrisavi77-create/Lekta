# Lekta · Pipeline verifikacije pravila

Spec za izgradnju. Cilj: nijedno bodovano pravilo nije objavljeno ako nije sljedivo do službenog izvora, i to stanje ostaje istinito kroz vrijeme.

Veže se na: rule-compiler (Option A: ruleEntries -> effectiveRules), validator profila, golden harness, source registry i coverage matricu (sve već postoji u v2.3.0). Ovaj dokument je disciplina koja ta polja stvarno popuni i nikad ne laže. CLAUDE.md vrijedi za pravila rada.

## 1. Iskreni cilj i definicija verified

100% verified za svaki dokument doslovno nije moguće: dio pravila postavlja mentor pojedinačno i nema javnog izvora. Zato je ispravan, dostižan cilj:

> Nula BODOVANIH pravila koja nisu sljediva do službenog izvora.

Sve što se ne može potkrijepiti izvorom NE boduje se. Prikazuje se kao savjet uz link na službeni izvor ili provjeri kod mentora. To je obranjiva i poštena definicija 100%.

Pravilo je `verified` samo ako nosi sva polja iz ugovora (sekcija 2) i prođe ljudski potvrđen legacy postupak ili novi deterministički AI-evidence audit (sekcija 4). Ljudski audit nije uvjet.

## 2. Ugovor o verifikaciji (polja po pravilu)

Proširi `ruleEntries` shemu tako da svako pravilo nosi:

- `ruleId`, `category`, `label`, `value`, `checkId` (postojeće)
- `machineCheckable` (postojeće)
- `authority`: razina autoriteta (vidi hijerarhiju dolje)
- `sourceId`: referenca na source registry (null nije dopušten za bodovano pravilo)
- `sourcePage`: točna stranica ili odjeljak izvora (null dok nije dokazano; nikad se ne nagađa)
- `quote`: doslovni kratki citat iz izvora ili precizan lokator
- `status`: `draft` | `verified` | `needs-recheck` | `advisory` | `retired`
- `scored`: boolean, doprinosi li bodovanju
- `lastVerified`: datum zadnjeg prihvaćenog audita
- `verifiedBy`: akter potvrde (`ai-evidence-audit` ili čovjek u legacy postupku)
- `reviewedBy`: drugi par očiju za ljudski legacy postupak; nije potreban uz valjan AI-evidence audit
- `confirmedVia` i privatni `aiEvidence`: dokazna metoda i strukturirani AI-audit paket, kad se koristi automatizirani put

Izvedeno pravilo: `scored = (status === 'verified' && authority je službeni && sourcePage != null)`. Sve s `status: advisory` ima `scored: false` i prikazuje se kao savjet s linkom.

## 3. Hijerarhija autoriteta (rješava sukobe)

Od najjačeg: obvezujući pravilnik (`binding`) > službena stranica studija ili programa (`program-page`) > opće fakultetske upute i citatni stil (`general`) > pisana uputa mentora ili kolegija (`mentor-or-course`).

Pri sukobu vrijednosti pobjeđuje viši autoritet. Studentski radovi NISU izvor pravila, služe isključivo regresijskom testiranju parsera (golden fixturi).

## 4. Pipeline po ćeliji (fakultet, jedinica, program, vrsta rada)

Oznaka: (A) automatski, (H) ljudski.

1. (A) Opseg. Enumeriraj ćeliju i popiši sve dokumente koji se mogu predati. To je redak coverage matrice.
2. (A) Prikupljanje izvora. Skupi službene izvore (pravilnik, stranica studija, opće upute, citatni stil, obrazac ili predložak). Svaki spremi kao NEPROMJENJIV snapshot (PDF plus URL plus datum dohvata plus hash) u source registry, dedupliciran.
3. (A) Ekstrakcija nacrta (Guidelines Ingestion). AI iz svakog izvora predloži DRAFT pravila: vrijednost, doslovni citat, lokator, `authority`, `checkId`, scope i modality. Status ostaje `draft`.
4. (A) Normalizacija i sukobi. Mapiraj nacrte na shemu (`checkId`), dedupliciraj kroz izvore i provjeri sukobe po hijerarhiji. Nejasan opseg/modalitet ili proturječje znači `insufficient`, ne ljudski red čekanja i ne automatsko prihvaćanje.
5. (A) AI-evidence audit. Za svako pravilo deterministički veži profil, rule ID, službeni source ID/URL, datum dohvata, SHA-256 izvornih snapshot bajtova, lokator, doslovni citat, ciljnu vrijednost, scope, modality, sva tri prolaza i razriješeni izvršni manifest s ulaznim/izlaznim hashom. Tekst za citat mora doći iz ekstrakcije istih bajtova kroz pouzdani formatni adapter; hash izdvojenog teksta nije zamjena za hash PDF/DOC/DOCX datoteke. Samostalno `agree: true` ili samoprijavljeni `pass` nije dokaz. Valjan paket postavlja `status: verified`, `confirmedVia: ai-evidence-audit`, `verifiedHash`, `lastVerified` i jedan `ai-confirmed` ledger zapis. Nepotpun ili zastario paket ostaje nebodovan s kodiranim razlogom.
6. (H, opcionalno) Legacy ručna potvrda. Postojeća konzola može potvrditi pravilo bez AI paketa; `reviewedBy` ostaje obvezan za obvezujuća pravila na tom putu. Ovaj put nije blocker za automatizirani audit.
7. (A) Strojna validacija (CI vrata, sekcija 6). Profil se ne objavljuje ako ne prođe sve provjere.
8. (A) Objava i verzija. Profil je verzioniran, otisak već nosi verziju i datum pa rezultat bilježi po kojoj je verziji rad ocijenjen. Changelog po profilu. Serviran iz Supabasea, verzioniran.

Pravilo: shipaj samo ćelije koje su prošle vrata. Bolje deset 100% verificiranih ćelija nego pedeset nesigurnih.

## 5. Freshness petlja (da 100% ostane 100%)

Verifikacija je stanje koje trune, pa pipeline ima održavanje:

- Razdvoji stabilno od promjenjivog. Stabilno (format, citatni stil, generička struktura, obvezni dijelovi): tvrdi se i boduje, dug rok valjanosti, rijetka reprovjera. Promjenjivo (rokovi, procedura predaje, individualna mentorska pravila): NE boduje se, `advisory`, linkano na živi službeni izvor. Tako promjenjivo nikad nije obveza verifikacije.
- (A) Detekcija promjene izvora. Periodički posao ponovno dohvati svaki izvor i usporedi hash i URL. Ako se promijenio, automatski postavi pogođena pravila na `status: needs-recheck`, `scored: false`, i zapiše ledger `degraded`. Živi proizvod prestaje bodovati ta pravila dok se ne dostavi novi valjan AI-evidence paket ili se ne iskoristi legacy ručni put.
- (H) Sezonski batch prije roka. Jednom godišnje, prije predaja, prođi profile. Par dana po sezoni, ne dnevni posao.
- (A do H) Feedback okidač. Kanal ova provjera je kriva iz aplikacije otvara ticket za reprovjeru. Najjeftiniji izvor ispravaka.

## 6. CI vrata (blokiraju objavu, testabilno)

Profil se NE objavljuje ako ijedno padne:

- [ ] Svako pravilo sa `scored: true` ima: `authority` u {binding, program-page, general}, `sourceId` != null, `sourcePage` != null, `quote` != null, `status: verified`, `lastVerified` unutar roka valjanosti (npr. stabilno 24 mjeseca).
- [ ] Svako `binding` pravilo ima `reviewedBy` na legacy ljudskom putu ili potpuni valjani AI-evidence paket.
- [ ] Svako pravilo s `confirmedVia: ai-evidence-audit` prolazi provjeru hash-a izvornih bajtova, citata u tekstu iz istog snapshota, vrijednosti, scopea, modalityja i razriješenog izvršnog manifesta.
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

## 9. Alati za audit i legacy ručni put

- Audit alat (interni): pripremi strukturirani AI-evidence paket i manifest, zatim ga deterministički validira. Neispravan paket pokazuje konkretne kodirane razloge i ne šalje pravilo na ljudski red.
- Verifikacijska konzola (interni admin): legacy ručni put ostaje dostupan; za njega vrijede dva odobravatelja kod `binding`. Nije potreban za AI-evidence paket.
- Ledger pravila: revizijski trag po pravilu.
- Javna coverage matrica: po ćeliji postotak bodovano-verificiranog, datum zadnje verifikacije, broj advisory pravila, link. Transparentnost pretvara zastarjelo iz tihog laganja u poštenu ogradu i ujedno je marketing povjerenja.

## 10. Runbook za svaki novi fakultet (sažeto)

Enumeriraj ćeliju, prikupi i snapshotaj izvore, AI pripremi pravila i dokazni paket, deterministički provjeri paket, pokreni CI vrata, objavi verzionirano i zakaži reprovjeru. Legacy ljudska potvrda je opcionalna. Shipaj samo ćelije koje su prošle vrata.

## 11. Pravilo koje se ne relativizira

Službeni izvor je jedini temelj bodovanog pravila. `verified` smije postaviti legacy ljudski postupak ili deterministički validator potpunog AI-evidence paketa. AI-izlaz, slaganje prolaza ili vlastita tvrdnja o uspjehu bez izvora, hashova i izvršnog manifesta nikad nisu dovoljni.

## 12. Acceptance (Definition of Done za izgradnju pipelinea)

- [ ] `ruleEntries` shema proširena poljima iz sekcije 2; validator ažuriran.
- [ ] CI gate skripta implementira sve provjere iz sekcije 6; objava profila s neverificiranim `scored` pravilom pada na CI.
- [ ] Source registry sprema nepromjenjiv snapshot plus hash; orphan provjera prolazi.
- [ ] Detektor promjene izvora degradira pogođena pravila na `needs-recheck` i `scored: false` kad se hash promijeni (test s promijenjenim fixturom).
- [ ] Verifikacijski ledger je append-only; svaka promjena statusa upisuje zapis.
- [ ] AI-evidence tok prihvaća samo potpun paket, uklanja ljudski audit kao uvjet i piše append-only `ai-confirmed` zapis; legacy ljudski tok i dalje traži dva odobravatelja za `binding`.
- [ ] Engine boduje samo pravila sa `scored: true`; advisory se prikazuje kao savjet s linkom na izvor.
- [ ] Coverage matrica računa se iz verified plus scored pravila; advisory isključen iz bodovanja.
- [ ] Golden testovi i compiler diagnostics ugrađeni u isti CI.

## 13. Guardrails (uz CLAUDE.md)

- Službeni izvor je jedini temelj pravila; valjan AI-evidence paket ili legacy ljudska potvrda može postaviti `verified`.
- Neverificirano se ne boduje, postaje advisory s linkom.
- Snapshot izvora je nepromjenjiv; `sourcePage` se nikad ne nagađa (null dok nije potvrđeno).
- Sukobi se rješavaju po hijerarhiji autoriteta.
- Hrvatski default, bez em i en crtica, produkcijski kod, mali commitovi, `npm run check` zelen.
