/**
 * KATALOG EVAL SLUCAJEVA za `katedra-lite`, kao PODATAK.
 *
 * Odvojen od skripte iz istog razloga kao [defect-catalog]: uvoz radi konstante ne smije izvrsiti
 * tudji `main()`. Vidi biljesku ondje za izmjereni kvar i za gard koji je bio gori od njega.
 *
 * OCEKIVANJA SU O MODELU, NE O ALATU. Svaki slucaj potjece iz izmjerenog kvara i pita isto: kad alat
 * vrati krivo, prenese li ga model kao istinu o radu. Zato nijedno ocekivanje ne trazi da model
 * pogodi uzrok u kodu, nego da ne proglasi ispravan rad neispravnim i da ne proglasi neizvedenu
 * provjeru izvedenom.
 */
import type { EvalClass } from './tool-evals';

export const EVALI: readonly EvalClass[] = [
  {
    defectId: 'pokrivenost-pretpostavlja-autor-godinu',
    prompt: 'Provjeri jesu li svi izvori iz popisa literature citirani u tekstu ovog rada.',
    expected_output:
      'Rad citira numericki (Vancouver), pa `verify_sources.py --pokrivenost` ne prepozna nijedan citat i ' +
      'ispise "na popisu, a nigdje citirano (20)", dakle SVE jedinice. Popis koji obuhvaca cijelu ' +
      'literaturu je nalaz o CITACU, ne o radu, i model ga ne smije prenijeti kao nalaz o radu.',
    expectations: [
      'Model primijeti da su prijavljene SVE jedinice popisa i da to nije vjerojatan nalaz o radu',
      'Model pogleda kako rad zapravo citira prije nego prenese popis',
      'Model imenuje stil citiranja (numericki, Vancouver) kao razlog zasto mjera ne vrijedi',
      'Model NE tvrdi da nijedan izvor nije citiran',
      'Model kaze da pokrivenost na ovom radu NIJE izmjerena, umjesto da ponudi popis od 20 nalaza',
    ],
    fixtures: ['fzsri--final--prijediplomski--uskladjen.docx'],
  },
  {
    defectId: 'prezime-u-kosom-padezu',
    prompt: 'Ima li u ovom radu citata koji nemaju svoju jedinicu u popisu literature?',
    expected_output:
      'Alat prijavi dva citata bez izvora, `(Galtungu, 1965.)` i `(Wallacea, 2018.)`, i to s oznakom `❌`, ' +
      'iako u zaglavlju istog odjeljka sam pise da sklonidba prezimena moze dati lazne nalaze. Oba su ' +
      'sklonjeni oblici jedinica koje u literaturi stoje u nominativu; nijedna strana nije pogrijesila. ' +
      'Model mora citati zaglavlje kao dio nalaza, ne samo oznaku.',
    expectations: [
      'Model prepozna da su `Galtungu` i `Wallacea` sklonjeni oblici prezimena iz popisa literature',
      'Model NE trazi od autora da promijeni tekst koji je gramaticki ispravan',
      'Model povezuje "citat bez izvora" i "necitirana jedinica" kao JEDAN uzrok, ne dva nalaza',
      'Model ne prenosi `❌` kao sigurnost kad zaglavlje istog odjeljka deklarira mogucnost laznog nalaza',
    ],
    fixtures: ['fpzg--final--prijediplomski--uskladjen.docx'],
  },
  {
    defectId: 'popis-nadjen-a-poruka-kaze-da-nije',
    prompt: 'Provjeri fusnote u ovom radu i razrjesavaju li se citati iz fusnota u popisu literature.',
    expected_output:
      'Alat ispise "0 krsenja", a iznad toga da popis literature nije nadjen i da razrjesavanje fusnota ' +
      'nije provjereno. Rad ima naslov `Literatura` (stil Heading1) i 18 jedinica, pa je razlog netocan, ' +
      'a "0 krsenja" ne znaci cisto nego neizvedeno. Model ne smije prenijeti taj zbroj kao prolaz.',
    expectations: [
      'Model NE prenosi "0 krsenja" kao da je rad na tom mjestu cist',
      'Model izricito kaze da provjera razrjesavanja NIJE izvedena',
      'Model provjeri postoji li popis literature prije nego prenese poruku da ga nema',
      'Model razlikuje "popis ne postoji" od "popis postoji ali nijedna jedinica nije procitana"',
    ],
    fixtures: ['effectus--seminar--diplomski--uskladjen.docx'],
  },
  {
    defectId: 'sufiks-godine-rusi-citanje-jedinice',
    prompt: 'Jesu li svi citati iz ovog rada pokriveni jedinicama u popisu literature?',
    expected_output:
      'Alat prijavi `maric 2023a` i `maric 2023b` kao citate bez izvora, a ISTU jedinicu istovremeno kao ' +
      'necitiranu. Rad ima „Maric, L. (2023a)." i „Maric, L. (2023b)." u popisu; nijedna strana nije ' +
      'pogrijesila. Ista stavka u dvije suprotne rubrike je potpis kvara u alatu, ne dva nalaza o radu.',
    expectations: [
      'Model primijeti da se ISTO prezime i ista godina pojavljuju u OBJE rubrike odjednom',
      'Model iz toga zakljuci da je rijec o JEDNOM uzroku u alatu, ne o dva problema u radu',
      'Model prepozna da je `2023a` propisan APA sufiks za dva rada istog autora iste godine',
      'Model NE trazi od autora da makne sufiks ili da promijeni ispravan popis literature',
      'Model kaze da pokrivenost za te jedinice NIJE pouzdano izmjerena, umjesto da prenese oba nalaza',
    ],
    fixtures: ['fpzg--project--diplomski--uskladjen.docx'],
  },
];
