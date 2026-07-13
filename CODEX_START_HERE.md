# Pokretanje Lekta pipelinea kroz Codex

## Jednokratna priprema

1. Otvori repozitorij `danielrisavi77-create/Lekta` u Codexu.
2. Odaberi granu `feature/training-pipeline`.
3. Za pristup privatnim izvornim repozitorijima u GitHubu otvori
   `Settings → Secrets and variables → Actions` i dodaj secret
   `LEKTA_REPOS_TOKEN`. Koristi read-only fine-grained token ograničen samo na
   repozitorije koje želiš inventarizirati. Token nikada ne lijepi u chat.
4. U Codex zalijepi sadržaj datoteke
   `docs/codex/LEKTA_TRAINING_PIPELINE_PROMPT.md`.

## Prva poruka nakon glavnog prompta

```text
Pokreni samo inventory fazu Lekta training pipelinea. Nemoj izvlačiti puni tekst,
pretvarati dokumente u DOCX niti graditi dataset. Pregledaj konfiguraciju izvora,
pokreni testove i napravi tablicu pronađenih PDF/DOCX datoteka po repozitoriju.
Zaustavi se prije build faze i reci mi za koje izvore trebam potvrditi prava korištenja.
```

## Nakon pregleda inventara

Za svaki repozitorij u `training-pipeline/source-repositories.json` ostavi
`review-required`, postavi `excluded` ili potvrdi jednu od dopuštenih osnova:
`owned`, `licensed`, `consented`, `public-domain`.

Zatim u Codex pošalji:

```text
Pokreni build fazu samo nad izvorima s potvrđenim pravima. Za prvi prolaz uzmi
najviše deset dokumenata i koristi odgovarajući verificirani Lekta profil. Sve
primjere ostavi na pending, provjeri anonimizaciju i ne commitaj nikakav dokument,
izvučeni tekst, raw analizu ni generirani dataset.
```

## Što ćeš vidjeti

- inventory izvještaj s brojem PDF/DOCX datoteka;
- popis dokumenata kojima treba OCR;
- sanitizirane rezultate Lekta analize;
- dataset kandidata sa statusom `pending`;
- popis lažno pozitivnih nalaza koje treba pregledati;
- lokalnu bazu znanja tek nakon ručnog odobrenja primjera.
