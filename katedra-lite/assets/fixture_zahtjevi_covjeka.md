# Fixture — popis izvora za `verify_sources.py --zahtjevi-covjeka`

Ovo NIJE bibliografija stvarnog rada nego testna građa. Pet jedinica pokriva
sva tri puta kroz `radnja_za_izvor()` i oba stupnja hitnosti:

1. **Kekez (2018.)** — stvaran članak s točnim DOI-jem i točnim metapodacima.
   S mrežom se potvrđuje, pa u checklisti NE smije biti: to je provjera da
   zastavica filtrira `verified`, a ne da ispisuje cijeli popis.
2. **Državni zavod za statistiku (2023.)** — stvarna publikacija s URL-om koji
   ne postoji (modelira link rot i krivo prepisanu adresu). Vodi na `HITNO` i
   na URL granu radnje.
3. **Horvat (2024.)** — izmišljena jedinica s DOI-jem koji nije registriran
   (prefiks 10.9999). Namjerno nepostojeća i tako označena u samom zapisu;
   vodi na `HITNO` i na DOI granu radnje.
4. **Čavlek (1998.)** i **5. Šimić i Jurić (2011.)** — hrvatska knjiga i poglavlje
   u zborniku bez ijednog strojno provjerljivog identifikatora. Vode na
   `PROVJERI RUČNO` i na granu „NSK, Hrčak, CroRIS, pa mentor".

Ništa se ne izmišlja oko stvarnog identifikatora: jedinica 1 nosi metapodatke
koje Crossref stvarno vraća za taj DOI, a jedinice koje su izmišljene to i kažu.
Redoslijed je po hrvatskoj abecedi (Č < D < H < K < Š) da fixture ne proizvodi
nevezan nalaz o abecednom redu. Bez mreže (`--offline`) svih pet padne u
`PROVJERI RUČNO` — checklista ni tada nije prazna.

POPIS IZVORA

Čavlek, N. (1998.) Turoperatori i svjetski turizam. Zagreb: Golden marketing.

Državni zavod za statistiku (2023.) Statistički ljetopis Republike Hrvatske 2023. Zagreb: Državni zavod za statistiku. https://podaci.dzs.hr/media/ljetopis-2023-ne-postoji

Horvat, I. (2024.) Nepostojeća studija o mjerenju nemjerljivog. Časopis koji ne izlazi, 3(1), str. 44–58. https://doi.org/10.9999/nepostoji.2024.001

Kekez, A. (2018.) Public service reforms and clientelism: explaining variation of service delivery modes in Croatian social policy. Policy and Society, 37(3), str. 386–404. https://doi.org/10.1080/14494035.2018.1436505

Šimić, P. i Jurić, A. (2011.) Lokalna samouprava između propisa i prakse. U: Babić, M. (ur.) Zbornik radova s Trećeg savjetovanja o javnoj upravi. Split: Pravni fakultet, str. 133–151.
