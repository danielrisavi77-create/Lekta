# Pakiranje

## Zakrpa ili puni paket

**Zakrpa** je pravilo. Puni paket samo kad se instalira iz nule ili kad platforma ne prima
zakrpu.

Razlog je mjerljiv: na jednoj je izmjeni od 10 datoteka puni paket imao 203 datoteke i
1,1 MB, a zakrpa 19 datoteka i 145 KB. Uz to puni paket **prepisuje** i ono što korisnik
nije tražio da se mijenja.

## Što zakrpa mora imati

1. samo promijenjene i nove datoteke, u izvornoj strukturi mapa;
2. `UPUTE.md` s tablicom: datoteka · novo ili mijenjano · **zašto**;
3. `primijeni.sh` koji radi sigurnosnu kopiju svake prepisane datoteke;
4. naredbe za provjeru poslije primjene — kako korisnik zna da je sjelo.

Treći je uvjet neizostavan. Zakrpa koja prepisuje bez kopije tjera korisnika da bira između
povjerenja i opreza.

## Ime i sudar imena

Ime skilla dolazi iz `name:` u frontmatteru, ne iz imena datoteke ni mape. Paket s istim
imenom **prepisuje** postojeću instalaciju.

Kad se objavljuje nasljednik pod novim imenom, tri stvari moraju u isti potez:

* `name:` u frontmatteru;
* opis, jer stari i novi skill inače dijele okidače i posao se pokreće dvaput;
* samoreference unutar paketa (`references/vjestine.json` i slično), koje inače pokazuju na
  skill koji je korisnik upravo isključio.

## Opis skilla

Opis je za usmjeravanje, ne za dokumentaciju. Sadrži što skill radi, okidače, i granice
(„za X idi na Y"). Protokol, verzije i povijest idu u tijelo `SKILL.md`.

Mjera: opis od 190 riječi znači da je u njega upalo ono što pripada tijelu. Ispod stotinu
riječi je udobno.
