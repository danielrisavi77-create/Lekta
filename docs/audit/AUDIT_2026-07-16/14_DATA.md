# Integritet autorskih podataka i higijena repoa (D9)

data/** autorski podaci, ledger, provenijencija izvora, .gitignore i ugnijezdjeni repo.

Nalaza u ovoj skupini: 4.

### AUD-43 — lekta-pipeline/ je neregistrirani ugnijezdeni git repo s ~1.6GB baza; commit bi stvorio slomljeni gitlink ili (uz uklonjen nested .git) preplavio glavni repo.

- Severity (finder -> konacni): Medium -> **Medium** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-06
- Lokacija: `lekta-pipeline/korpus.db:0`
- Dokaz: git status: '?? lekta-pipeline/'. lekta-pipeline/ ima vlastiti .git i sadrzi korpus.db 1.4G, korpus-50k.db 166M, korpus-sample.db 13M. Glavni .gitignore vise NE ignorira ni lekta-pipeline/ ni *.sqlite*/*.db.
- Reprodukcija: 'git add lekta-pipeline' u glavnom repou -> git dodaje embedded repo kao gitlink bez .gitmodules (slomljena submodule referenca; klonovi ne dobivaju sadrzaj). Alternativno, ako netko obrise lekta-pipeline/.git da 'spljosti' pipeline u glavni repo, ~1.6GB .db fajlova vise nije zasticeno parent .gitignore-om i ulazi u index.
- Preporuka: Odluci: ili registriraj lekta-pipeline/ kao pravi git submodul (.gitmodules), ili ga eksplicitno dodaj u glavni .gitignore ('lekta-pipeline/'). U svakom slucaju dodaj '*.db'/'*.sqlite' u glavni .gitignore kao mrezu ispod.
- Verifikacija: Potvrdjeno: 'git status' -> '?? lekta-pipeline/'; lekta-pipeline/.git postoji (vlastiti repo); korpus.db 1.420.136.448 B (1.4G), korpus-50k.db 173.776.896 B, korpus-sample.db 13.172.736 B. Root .gitignore vise ne ignorira ni lekta-pipeline/ ni *.db. 'git add lekta-pipeline' bi stvorio gitlink bez .gitmodules, a spljostavanje bi uvuklo ~1.6GB. Realan footgun.

### AUD-42 — .gitignore izmjena uklonila je ignore za osjetljive training-pipeline izlaze i *.sqlite* indekse, cime veliki/osjetljivi artefakti vise nisu zasticeni od commita.

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-06
- Lokacija: `.gitignore:27`
- Dokaz: Uklonjeni blok (git diff HEAD): '# Lekta training pipeline: lokalni i osjetljivi izlazi' + 'training-pipeline/output/' + 'training-pipeline/sources/' + '*.sqlite' + '*.sqlite-shm' + '*.sqlite-wal'. U repou postoji aktivan Python training-pipeline/ (run_pipeline.py) i lekta-pipeline/ s korpus.db od 1.4G koji se aktivno pise.
- Reprodukcija: git diff HEAD -- .gitignore pokazuje uklonjenih 7 redaka; pokretanje training-pipeline/run_pipeline.py koji regenerira training-pipeline/output/ ili sources/ (harvestani, po komentaru 'osjetljivi' studentski materijali) ili bilo koji *.sqlite indeks -> ti fajlovi vise nisu ignorirani i uslijede u 'git add -A'. Trenutno te mape jos ne postoje pa je izlozenost latentna.
- Preporuka: Vrati u .gitignore glavnog repoa retke 'training-pipeline/output/', 'training-pipeline/sources/', '*.sqlite', '*.sqlite-shm', '*.sqlite-wal' te dodaj '*.db', '*.db-shm', '*.db-wal' (kojih parent nikad nije ni imao) da veliki korpusni indeksi nikad ne mogu uci u glavni repo, kao sto to vec radi nested lekta-pipeline/.gitignore.
- Verifikacija: git diff HEAD .gitignore potvrdjuje uklonjenih 7 redaka: 'training-pipeline/output/', 'training-pipeline/sources/', '*.sqlite', '*.sqlite-shm', '*.sqlite-wal'. Izlozenost je ipak LATENTNA: te mape trenutno ne postoje na disku, a lekta-pipeline korpus koristi *.db (korpus.db 1.4G), sto ni STARI .gitignore nije pokrivao (samo *.sqlite). Stvarni gubitak je zastita training-pipeline izlaza pri sljedecem run_pipeline.py. Snizeno na Low zbog latentnosti.

### AUD-44 — manifest.json biljezi VERIFICATION_LEDGER s 2736 zapisa, a data/verification/ledger.json ih stvarno ima 3119; drift je tih jer ga nijedan test ne provjerava.

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `data/manifest.json:85`
- Dokaz: manifest: { "name": "VERIFICATION_LEDGER", "file": "data/verification/ledger.json", "entries": 2736 }. Stvarni ledger.json je array duljine 3119 (node: require(...).length === 3119).
- Reprodukcija: node -e "console.log(require('./data/verification/ledger.json').length)" -> 3119, dok manifest tvrdi 2736. verification-gate.test.ts (linija 65) provjerava manifest broj za SOURCE_REGISTRY, ali odmah do njega NE provjerava isti broj za VERIFICATION_LEDGER, pa je porast od 383 zapisa prosao nezapazeno. data-loaders.test.ts takoder ne provjerava ledger.
- Preporuka: Azuriraj manifest.json entries na 3119 i dodaj u verification-gate.test.ts count-assert za VERIFICATION_LEDGER (kakav vec postoji za SOURCE_REGISTRY) da drift ubuduce lomi check.
- Verifikacija: node -e require('./data/verification/ledger.json').length -> 3119; data/manifest.json:85 'entries: 2736'. Drift 383. verification-gate.test.ts:62 provjerava VERIFICATION_LEDGER=raw JSON, ali manifest-broj asertira SAMO za SOURCE_REGISTRY (linija 66-67 'SOURCE_REGISTRY toHaveLength row.entries'); za ledger nema ekvivalentne provjere manifest broja. Drift je tih.

### AUD-45 — Orfan provenijencijski PDF data/sources/algebra/algebra-pravilnik-2025.pdf: na disku, neregistriran u source-registry, bez pripadajuceg profila (Algebra je u katalogu status 'research').

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `data/sources/algebra/algebra-pravilnik-2025.pdf:0`
- Dokaz: git status: '?? data/sources/algebra/'. grep 'algebra' data/sources/source-registry.json -> 0 pogodaka; nijedan snapshotPath ne pokazuje na taj PDF. verified-profiles.json nema algebra profil. zagreb-catalog.json ima unit 'algebra' sa 'status':'research'. Za razliku od njega, 169 drugih source pravilnik PDF-ova JE tracked (git ls-files data/sources/*.pdf).
- Reprodukcija: Staticki: PDF postoji uz 169 vec-tracked source pravilnika (konvencija: sluzbeni pravilnici SU provenijencija u repou), ali ovaj nije ni commitan ni upisan u source-registry.json niti vezan uz ijedan profil, pa je labava/orfan datoteka.
- Preporuka: Ili upisi algebra izvor u data/sources/source-registry.json (id, snapshotPath, snapshotHash) i commitaj PDF kad se algebra profil promovira iz 'research', ili ga ukloni iz radnog stabla dok se profil ne izradi, da provenijencija ostane konzistentna (svaki source PDF <-> registry zapis).
- Verifikacija: data/sources/algebra/algebra-pravilnik-2025.pdf (385.981 B) postoji, untracked ('?? data/sources/algebra/'). grep 'algebra' source-registry.json -> 0. zagreb-catalog.json:511-521 ima unit 'algebra' status 'research'. Orfan/labava datoteka uz 169 tracked pravilnika. Potvrdjeno.

