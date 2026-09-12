# Protokol korisnickog pilota (T15)

Kvalitativno istrazivanje PREPREKA u osnovnom toku, s 5 do 8 korisnika razlicite razine iskustva. Nije statisticki
dokaz trzisnog uspjeha i ne smije se tako citati: pet ljudi ne kaze koliko ce ih koristiti proizvod, kaze GDJE se
zaglave.

## Tko sudjeluje

- 5 do 8 studenata koji trenutno pisu ili su nedavno predali zavrsni, diplomski ili seminarski rad.
- Namjerno razlicito iskustvo: barem dvoje kojima Word nije blizak, barem jedno s iskustvom formatiranja "po uputi".
- Barem jedan sudionik koristi mobitel kao primarni uredjaj (tok se u pilotu izvodi i na telefonu).
- Sudionik donosi VLASTITI rad (kopiju). Ako nema, dobiva sintetski rad iz `tests/fixtures/docx/` uz napomenu da je
  generiran; tada se zadaci 4 i 5 izvode nad pripremljenim parovima fixturea.

## Priprema

- Cist preglednik (bez lokalne sesije), zabiljezena verzija: `dist/build-info.json` (commit) ili `npm run dev` uz
  `git rev-parse HEAD`.
- Zapisnicar biljezi vrijeme, korak, sto je korisnik rekao, sto je kliknuo. Bez snimanja ekrana bez izricite privole;
  sadrzaj rada se NE zapisuje (nazivi datoteka, naslovi i tekst ostaju izvan zapisnika).
- Moderator ne pomaze tijekom osnovnog pokusaja. Pomoc tek kad korisnik izricito odustane; trenutak odustajanja se
  biljezi kao zastoj.

## Zadaci

Svaki zadatak ima cilj koji korisnik mora IZRECI, ne samo kliknuti. Zapisuju se: zastoj (gdje i koliko), kriva
pretpostavka (sto je mislio da ce se dogoditi), trazena pomoc, gubitak stanja (osvjezenje, povratak, zatvaranje).

| # | zadatak | uspjeh je kad korisnik | mjeri se |
| --- | --- | --- | --- |
| 1 | Ucitaj dokument, odaberi odgovarajuci profil i objasni prvi vazan nalaz. | imenuje svoj fakultet i vrstu rada na kartici profila i vlastitim rijecima kaze sto prvi nalaz trazi | vrijeme do rezultata, je li profil detektiran ili birao rucno, je li nalaz procitan kao "greska u sadrzaju" (kriva pretpostavka) |
| 2 | Odaberi ponudjene zahvate i objasni sto ce se poslati i izmijeniti. | u planu ispravaka iskljuci ili ukljuci barem jedan zahvat i kaze da dokument ODLAZI na posluzitelj tek na "Popravi", te da se sadrzaj ne mijenja | razumije li razliku "sigurni" / "treba odluku" / "rucno", zastoj na privoli |
| 3 | Nakon popravka pronadji kopiju i navedi preostale obveze. | preuzme popravljenu kopiju (ili izvornik kad je to preporuceno) i nabroji sto ostaje za rucni rad iz sazetka ishoda | cita li "rijeseno N od M" ispravno, brka li broj zahvata s brojem provjera |
| 4 (podplan D) | Ucitaj uredjenu verziju i pronadji rijesen i nov problem. | kroz "Ucitaj novu verziju ovog rada" dobije sazetak i pokaze jedan rijesen i jedan nov nalaz | razumije li pitanje o povezivanju verzija, tumaci li "neizvjesno" kao rijeseno (kriva pretpostavka) |
| 5 (podplan E) | Pronadji mentorov komentar i razlikuj vlastitu potvrdu od strojne provjere. | oznaci sadrzajni komentar kao obradjen i kaze da to NIJE potvrda da je primjedba rijesena | brka li "obradjeno" s "provjereno" |

Zadaci 4 i 5 traze pripremljen par dokumenata (verzija A i B istog rada) i dokument s komentarima; za sudionike bez
vlastitog para koriste se `lo-fpzg-zavrsni-neuskladjen.docx` / `lo-fpzg-zavrsni-uskladjen.docx` i
`synthetic-mentor-komentari.docx`.

## Zavrsna pitanja (nakon svih zadataka)

1. Sto ti ova ocjena znaci? (Trazi se: "tehnicka provjera oblikovanja", NE "rad je prihvacen".)
2. Sto je otislo s tvog racunala i kad?
3. Sto bi napravio sljedece s ovim rezultatom?

Odgovor na prvo pitanje je kriterij prihvacanja plana: korisnik mora moci objasniti rezultat BEZ zakljucka da
tehnicka ocjena jamci prihvacanje rada. Ako ijedan sudionik to zakljuci, copy na ekranu rezultata ide na popravak.

## Obrada nalaza

- Svaka prepreka dobiva redak: korak, opis, koliko sudionika, ozbiljnost (blokira / usporava / smeta), i PROMJENU koja
  je uklanja (konkretna datoteka ili copy), te ponovnu provjeru pogodjenog koraka nakon promjene.
- Prepreka koja onemogucuje osnovni tok (zadaci 1 do 3) blokira izdanje dok nije uklonjena ili dok vlasnik izricito
  ne odluci o opsegu isporuke (zapis u `release-readiness.md`).
- Prepreke u zadacima 4 i 5 ne blokiraju osnovni tok, ali ulaze u odluku o opsegu podplana D odnosno E.

## Stanje

Pilot NIJE proveden do 2026-09-12: trazi stvarne sudionike, sto je vlasnikova radnja. Protokol, fixture parovi i
zapisnicka tablica su spremni; strojni preduvjeti (T02 do T14) su izvedeni i pokriveni testovima, pa se pilot ne
mjeri nad tokom koji vec pada na stroju.
