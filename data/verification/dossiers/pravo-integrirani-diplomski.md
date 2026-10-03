# AI-evidence worklist: pravo-integrirani-diplomski

Nema ljudskog reda odobravanja. Pravilo izlazi iz worklista tek uz valjan deterministicki dokazni paket.

Pravila za rad: 13.

## Stil citiranja
- Pravilo: `pravo-integrirani-diplomski--citation-style`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 5. Navodenje bibliografskih podataka (citiranje)
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `"pravo-fusnote"`
- Citat: "Bibliografski podatci o koristenim izvorima navode se u biljeskama (fusnotama) koje moraju biti numerirane."

## Font glavnog teksta
- Pravilo: `pravo-integrirani-diplomski--font`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `["Times New Roman"]`
- Citat: "Glavni tekst (...) font: Times New Roman"

## Velicina fonta glavnog teksta
- Pravilo: `pravo-integrirani-diplomski--font-size`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `[12]`
- Citat: "Glavni tekst (...) velicina fonta: 12"

## Font fusnota
- Pravilo: `pravo-integrirani-diplomski--footnote-font`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `["Times New Roman"]`
- Citat: "Biljeske (fusnote) (...) font: Times New Roman"

## Velicina fusnota
- Pravilo: `pravo-integrirani-diplomski--footnote-size`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `[10]`
- Citat: "Biljeske (fusnote) (...) velicina fonta: 10"

## Prored fusnota
- Pravilo: `pravo-integrirani-diplomski--footnote-spacing`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `1`
- Citat: "Biljeske (fusnote) (...) prored: 1 (razmak 0 i prije i poslije)"

## Oblikovanje naslova po razinama
- Pravilo: `pravo-integrirani-diplomski--heading-rules`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 3. Naslovi
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `{"size":12,"align":"left","numberRequired":true,"trailingDot":true,"romanLevelOneAllowed":true,"maxLevel":3,"levels":{"1":{"uppercase":true},"2":{"bold":true},"3":{"bold":true,"italic":true}}}`
- Citat: "naslov 1. razine: font 12, TISKANA SLOVA; naslov 2. razine: font 12, podebljano (bold); naslov 3. razine: font 12, podebljano i kurzivirano (bold i italik). Naslovi se poravnavaju slijeva (left aligned)."

## Poravnanje glavnog teksta
- Pravilo: `pravo-integrirani-diplomski--justify`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `true`
- Citat: "Glavni tekst (...) poravnanje s obiju strana (justified)"

## Oblik pravnih fusnota
- Pravilo: `pravo-integrirani-diplomski--legal-footnote-repair-rules`
- Status: `needs-ai-evidence`
- Razlozi: `unverified-rule`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: str. 1 (uvod: upute su preporuka, mentor ima prvenstvo), str. 5 (odjeljak 5. i 6.1.), str. 10-11 (6.2. op. cit. i ibid.)
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `{"mode":"legal-notes","marker":{"convertManualNumbers":true},"firstCitation":{"requireFullCitation":true,"standardize":true},"repeatedCitation":{"ibidPolicy":"immediate-previous"}}`
- Citat: "Ako student/ica nije dobio/la drugacije upute od mentora, ove upute se preporucuju koristiti za oblikovanje i uredjenje teksta i navodjenje izvora. (...) Bibliografski podatci o koristenim izvorima navode se u biljeskama (fusnotama) koje moraju biti numerirane. Biljeske se ubacuju automatski preko izbornika Reference (References) i opcije Umetni fusnotu (Insert footnote). (...) Ako se biljeske koje slijede jedna iza druge odnose na isto djelo, rabi se oznaka ibid."

## Prored glavnog teksta
- Pravilo: `pravo-integrirani-diplomski--line-spacing`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `1.5`
- Citat: "Glavni tekst (...) prored: 1,5 (razmak 0 i prije i poslije)"

## Numeriranje stranica
- Pravilo: `pravo-integrirani-diplomski--page-numbers`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4. Oblikovanje i uredenje teksta
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `true`
- Citat: "Stranice rada trebaju biti numerirane, odnosno na svakoj stranici (osim naslovnice) treba biti automatski umetnut broj stranice."

## Obvezni dijelovi rada
- Pravilo: `pravo-integrirani-diplomski--required-sections`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 4 (obvezni dijelovi rada) i odjeljak 2 (sadrzaj)
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `[{"key":"declaration","label":"izjava o izvornosti","terms":["izjava o izvornosti","izjava autora o izvornosti"]},{"key":"toc","label":"sadržaj","terms":["sadrzaj","contents","table of contents"]},{"key":"intro","label":"uvod","terms":["uvod","introduction"]},{"key":"body","label":"središnji dio","terms":["sredisnji dio","razrada","poglavlje","glava","chapter"]},{"key":"conclusion","label":"zaključak","terms":["zakljucak","conclusion"]},{"key":"refs","label":"izvori i literatura / bibliografija","terms":["izvori i literatura","popis izvora i literature","popis literature","bibliografija","literatura","references"]}]`
- Citat: "Rad mora imati uvodni dio, sredisnji dio (s vise poglavlja i/ili potpoglavlja) te zakljucni dio. Na kraju rada treba biti popis koristenih izvora i literature (bibliografija). Nakon naslovne stranice treba biti stranica sa sadrzajem."

## Sadrzaj
- Pravilo: `pravo-integrirani-diplomski--toc`
- Status: `needs-ai-evidence`
- Razlozi: `legacy-ai-batch-untrusted`
- Radnja: `run-ai-evidence-audit`
- Izvor: pravo-upute-oblikovanje-2024
- Autoritet: general
- Lokator: odjeljak 2. Sadrzaj
- Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`
- Vrijednost: `true`
- Citat: "Nakon naslovne stranice treba biti stranica sa sadrzajem."
