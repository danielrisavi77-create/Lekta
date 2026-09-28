# Upute: slijepo izvlacenje tvrdnje iz sluzbenog izvora (Lekta, dokazni AI-audit)

Radis samo ovaj zadatak. Ne mijenjaj nijednu datoteku osim izlazne datoteke koju ti prompt imenuje.
Ne pokreci testove, git, npm ni mrezne pozive. Ne citaj druge dijelove repozitorija.

## Ulaz

Ulazna datoteka je JSON paket jednog sluzbenog izvora:

- `source`: `id`, `url`, `fetchedAt`, `snapshotHash`, `snapshotTextPath` (izvadak teksta snimke).
- `rules[]`: po pravilu `profileId`, `ruleId`, `checkId`, `label`, `sourcePage` (lokator), `quote`
  (citat koji profil tvrdi), `valueShape` (samo OBLIK vrijednosti, npr. `string`, `number`,
  `{"top":"number","bottom":"number"}`), `contexts[]` (odlomci snimke oko svakog pojavljivanja citata).
- Vrijednost, modalitet i opseg koje profil tvrdi NAMJERNO nisu u paketu. Ne pokusavaj ih pogoditi
  iz naziva datoteka ni iz drugih izvora.

## Zadatak po pravilu

1. Procitaj `contexts` tog pravila. Ako ti treba siri kontekst (iznimke, drugi dio rada), trazi u
   `snapshotTextPath` kljucne rijeci; ne citaj cijelu snimku od pocetka do kraja.
2. Samo iz teksta izvora odredi:
   - `value`: vrijednost u TOCNO zadanom `valueShape` obliku. Ako je `valueShape` niz (npr. `["number"]`),
     vrati niz (`[10]`), ne gol broj. Jedinice: margine i razmaci u cm kao broj, velicina fonta u pt kao broj,
     prored kao broj (1.5), format papira kao "A4", naziv fonta doslovno kako ga izvor pise. Ako paket za
     pravilo daje `allowedValues`, vrijednost MORA biti jedna od njih (to su Lektini identifikatori, npr.
     citatni stil `chicago-notes`); ako izvor ne odgovara jednoznacno nijednoj, `verdict` je `insufficient`.
   - `modality` (ista pravila kao Lektin deterministicki `propose_claim_modality.py`), iz recenice koja NOSI
     tu vrijednost, ne iz cijelog odlomka:
     `prohibition` = ne smije, ne moze, zabranjeno, nije dopusteno;
     `obligation` = SAMO mora, duzan, obvezno/obavezno, nuzno je;
     `condition` = ukoliko, ako se, u slucaju, ovisno o, po dogovoru;
     `recommendation` = preporucuje se, pozeljno, u pravilu, okvirno, obicno, neka bude, primjerice;
     `permission` = moze, smije, dopusteno je (bez "ne" ispred);
     `directive` = treba, potrebno je, pise se, koristi se, iznosi, TE goli indikativ ili natuknica bez modalne
     rijeci ("Font: Times New Roman", "Rad se pise na A4"). "Treba" NIJE obligation.
     Ako recenica nosi vise oznaka, uzmi NAJSLABIJU po redu prohibition > obligation > condition >
     recommendation > permission > directive (najslabija je zadnja koja se pojavljuje u tom redu).
   - `scope`: jedno od `whole`, `body`, `heading`, `caption`, `table`, `footnote`, `bibliography`, `code`,
     `title-page`. Polaziste je narav osi: font, font-size, line-spacing, justify = `body`; margins,
     paper-size, toc, page-numbers, page-count, word-count, required-sections, citation-style = `whole`;
     footnote-* = `footnote`; heading-rules = `heading`; reference-count = `bibliography`. Drugi opseg uzmi
     SAMO ako recenica koja nosi vrijednost izricito imenuje drugi dio rada (naslovnica, fusnote, literatura,
     tablice, natpisi, naslovi) i ne imenuje dio koji odgovara naravi osi.
3. Ako tekst ne daje jednoznacan odgovor za bilo koje od tri polja, stavi to polje na `null` i
   `verdict` na `insufficient`. Ne popunjavaj pretpostavkom. Null je ispravan i postovan ishod.
4. Ako izvor na drugom mjestu daje drukciju vrijednost za istu os ili iznimku za tu vrstu rada,
   `verdict` je `conflict` i u `note` navedi oba mjesta.

## Izlaz

Jedna JSON datoteka, bez komentara i bez teksta izvan JSON-a:

```json
{
  "sourceId": "...",
  "model": { "provider": "OpenAI", "model": "<tocan naziv modela kojim radis, npr. gpt-6-luna>", "version": "codex-cli <verzija>" },
  "rules": [
    {
      "profileId": "...",
      "ruleId": "...",
      "value": "A4",
      "modality": "directive",
      "scope": "whole",
      "verdict": "extracted",
      "evidenceQuote": "doslovni odlomak iz snimke na kojem temeljis value/modality/scope",
      "note": "jedna recenica: zasto ta vrijednost, modalitet i opseg"
    }
  ]
}
```

- `verdict`: `extracted`, `insufficient` ili `conflict`.
- `evidenceQuote` mora biti doslovno prepisan iz snimke (dopusteno je samo sazeti razmake i prijelome redaka).
- Svako pravilo iz ulaza pojavljuje se tocno jednom. Ako prompt kaze "Obradi SAMO ruleId ...", izlaz sadrzi samo njih.
- Ne pisi skriveno rezoniranje; `note` je jedna recenica.
