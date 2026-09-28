# T70: rusenje WebKita u `workspace-entry.spec.ts` (mobile-webkit, Windows)

Stanje 28. 9. 2026. Mjerio izvrsitelj na radnoj stanici (Windows 10 Pro, 16 GB RAM), u
izoliranom mjernom stablu `D:\lekta-worktrees\t70` (grana `wf/t70-webkit-flaky`, nista
commitano ni pushano). O brisanju tog stabla odlucuje vlasnik.

## 1. Okolina

| Stavka | Vrijednost |
| --- | --- |
| Playwright | 1.63.0 |
| WebKit | build 2359, `browserVersion` 26.6 (`playwright-core/browsers.json`) |
| Projekt | `mobile-webkit` (iPhone 13), `LEKTA_UX_ALL_BROWSERS=1` |
| Izvodjenje | pod `with-gate-lock`, nakon `gate-preflight --check-only` |

## 2. Reprodukcija

| Prolaz | Rezultat |
| --- | --- |
| cijela datoteka, `--repeat-each=10` | 3 pada od 100, svi u testu `:142` ("dugo ime datoteke se skracuje") |
| samo `:142`, `--repeat-each=10` | 1 od 10 |
| samo `:142`, rok 30 s umjesto 5 s | 1 od 10; u 9 uspjesnih traka dolazi za oko 0,6 s |

Pad je `expect(locator('#radDocBar')).toBeVisible()` s `Received: undefined`: Playwright od
stranice ne dobiva nijedan odgovor. Duzi rok ne pomaze, dakle nije sporost.

## 3. Uzrok: proces WebKita se rusi

Privremeni `console.log` trag (samo u mjernom stablu) u `setFile`, `admitFile` i
`inspectDocxIntake` pokazao je da zapis u neuspjelom prolazu stane na razlicitim mjestima:
kod `await file.arrayBuffer()` u ulaznim vratima, pa kod `zip.text('word/document.xml')`.

Sonda odziva (`page.evaluate` svakih 0,5 s s rokom od 2 s) dala je izravan signal:
`Error: page.evaluate: Target crashed`. Proces WebKita se rusi tijekom obrade uploada.

## 4. Iskljuceni uzroci

| Hipoteza | Pokus | Rezultat |
| --- | --- | --- |
| Utrka registracije handlera u `/rad/` (izvorna biljeska T70) | citanje `src/routes/workspace/main.ts` | izmedju `data-lekta-ready` (`initAnalyzerApp`) i `wireDocumentBar` nema `await`; Playwright ne moze umetnuti upload izmedju |
| Istodobni `Blob.arrayBuffer()` nad istim `File` (brza statistika, detekcija, ulazna vrata) | jedno citanje bajtova po datoteci (WeakMap), 60 prolaza | 1 od 60, pa u sondi 2 od 60, i dalje `Target crashed` |
| `DecompressionStream('deflate-raw')` | `fflate.inflateSync` umjesto `DecompressionStream` u `ZipReader`, 60 prolaza | 3 od 60, i dalje `Target crashed` |

Zakljucak: nestabilnost Playwrightova WebKita na Windowsu pod opterecenjem obrade uploada.
Ovo NIJE dokaz kvara u Safariju: rusenje nije vezano ni uz jedan API koji Lekta koristi, a
zamjena oba sumnjiva puta ga ne uklanja.

## 5. Samostalna reprodukcija se ne rusi

Uz rijec vlasnika napravljena je reprodukcija izvan repozitorija, bez Lektina koda i podataka:
staticna stranica, sinteticki docx od 170 KB s nasumicnim rijecima, tri istodobna
`file.arrayBuffer()` citanja, `DecompressionStream('deflate-raw')` i `DOMParser` nad
`document.xml`, Playwright 1.63.0 `mobile-webkit`, `--repeat-each=60`. Rezultat: 60 od 60
prolazi, nijedno rusenje.

Rusenje dakle ovisi o tezini stvarne stranice (dev posluzitelj sa stotinama modula, fontovi,
memorija), a ne o tim API-jima samima. Bez minimalne reprodukcije upstream issue nema sto
pokazati, a cijela Lekta se ne prilaze. Issue zato NIJE otvoren.

Hipoteza za kasnije (T88 ili nastavak T70): isti test izmjeriti nad produkcijskim buildom
(`vite preview`, kao `playwright.dist.config.ts`) umjesto dev posluzitelja, jer teret stotina
nezapakiranih modula moze biti uzrok.

## 6. Linux CI je drugi mehanizam (T88)

Run 36357206409, job 108727208327 (attempt 1): `[webkit] tests/ux/desktop-flow.spec.ts:135`,
`locator.click` na `#previewModeFaksimil` ceka 300 s uz "element is not visible". Nema
rusenja. U attempt 2 prolazi ("1 flaky"). Isti dan je Firefox bio flaky na
`workspace-entry.spec.ts:309` (#193). Ti nalazi idu u T88, ne u T70.

## 7. Odluka i otvoreno

- Test ostaje u matrici, bez retry maskiranja (poznata iznimka u
  `docs/verification/AGENT_VERIFICATION.md`).
- Upstream issue prema microsoft/playwright nije otvoren: samostalna reprodukcija 0 od 60.
  Ponovno se razmatra tek uz reprodukciju koja se rusi bez Lektina koda.
- Mjerno stablo `D:\lekta-worktrees\t70` ima samo mjerne izmjene (trag, sonda, WeakMap,
  fflate); ne smije se koristiti za gate ni dokaz.
