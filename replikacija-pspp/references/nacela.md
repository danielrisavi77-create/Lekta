# Načela

Ovaj prilog nije ukras. On je tvrdnja: *brojke u ovom radu su točne i evo kako
se to provjerava*. Zato vrijede pravila stroža nego za ostatak rada.

## 1. Ništa se ne prepisuje rukom

Vrijednost u tablici usporedbe dolazi iz PSPP-ova strojno čitljivog ispisa, ne
iz nečijeg čitanja PDF-a. Prepisivanje je najčešći izvor pogreške u prilozima
ove vrste i jedini koji se može ukloniti u cijelosti.

## 2. Snimka mora biti iz programa

Slika koja u radu stoji kao ispis programa mora nastati u tom programu. Izrezan
PDF kojemu je docrtana naslovna traka nije snimka nego krivotvorina, bez obzira
na to što su brojke točne. Ako sučelje nije dostupno, u prilog ide ispis i tako
se i opiše.

## 3. Ono što se ne može dobiti, ne izmišlja se

PSPP ne ispisuje Cohenov d. U tablici tada stoji ili „ne ispisuje se”, ili
vrijednost izračunata iz PSPP-ovih vlastitih skupnih statistika uz izričitu
napomenu da je tako dobivena. Trećeg puta nema.

## 4. Zaokruživanje nije neslaganje, ali se mora objasniti

PSPP alfu ispisuje na dvije decimale, rad je navodi na tri. To nije odstupanje
nego različita točnost zapisa, i u prilogu mora pisati zašto. Mjerodavna je
grublja od dviju vrijednosti: 24,5 i 24,51 su ista veličina, 0,300 i 0,299 nisu
ako rad tvrdi tri decimale.

Razlika u prvoj decimali ili u predznaku nikad nije zaokruživanje. To je nalaz
i ide u ispravak rada, ne u fusnotu priloga.

## 5. Suhi prolaz prije nego što se išta zapiše

Svaki korak koji se od studenta traži mora se prvo reproducirati u kodu. Taj
prolaz redovito otkrije da rad radi nešto što u metodologiji ne piše — filtar
koji izostavlja premalu skupinu, inačicu testa koja ne pretpostavlja jednakost
varijanci, metodu koja se zove drukčije nego što jest. Sve to su ispravci
teksta, ne priloga.

## 6. Tri mjesta na kojima zadane postavke lažu

Ovo se ponavlja iz rada u rad i vrijedi ga provjeriti prije nego što se zaključi
da se brojke ne poklapaju.

| Postavka | Što program radi zadano | Što rad obično traži |
|---|---|---|
| usporedba skupina | Studentov t-test | Welchov, jer skupine nisu jednake veličine |
| analiza varijance | uzima sve skupine | izostavlja skupine s manje od pet ispitanika |
| glavne komponente | rotacija, često paralelna analiza | Kaiserov kriterij, bez rotacije |

Ako neka od tih odluka u radu nije zapisana, to nije stvar priloga nego
metodologije i tekst treba dopuniti.

## 7. Vrijednost priloga je u tome da ga je autor prošao

Automatizacija radi posao, ali pred povjerenstvom stoji student. Ako ga netko
zamoli da uživo otvori bazu i pokaže odakle je došao onaj F, odgovor mora biti
u prstima. Zato uz rad idu i sintaksa i baza: da se sve može ponoviti za
dvadeset minuta, na bilo čijem računalu.
