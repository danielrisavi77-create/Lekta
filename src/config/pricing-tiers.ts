/**
 * CJENOVNI PAKETI, izdvojeni iz `src/ui/app.ts` 2026-09-03.
 *
 * Razlog je ruta: stranicu `/saznaj-vise/` cine devet landing sekcija, a samo DVIJE trebaju JS
 * (`#checkGrid` i `#pricingGrid`). Dok je ovaj popis zivio u `app.ts`, ta bi ruta morala uvesti
 * cijeli analizator da bi ispisala cjenik, sto je suprotno od cilja da svaka ruta ucitava samo
 * svoje.
 *
 * Podatak je CIST: nema DOM-a, nema ovisnosti, nema uvoza. `CHECK_ITEMS` je vec bio takav
 * (`config/config-loader`), pa je ovo bio jedini komad koji je nedostajao.
 */

export const PRICING_TIERS = [
 {id:'free',name:'Besplatna provjera',price:'0 €',desc:'Lokalna dijagnoza dokumenta s nalazima, lokacijama, dokazima i osnovnim Word uputama.',features:['Ocjena i pregled po kategorijama','Puni lokalni popis nalaza i uputa','Bez registracije, dokument ostaje na uređaju'],cta:{href:'/',label:'Provjeri besplatno'}},
 {id:'perwork',name:'Popravljeni dokument',price:'od 3,99 €',featured:true,desc:'Plaćeni popravljen DOCX nakon ponovne provjere, cijena prema vrsti rada.',features:['Sve iz besplatne dijagnoze','Popravljeni DOCX s ponovnom analizom i pregledom stvarnih promjena','Odabir zahvata određuje opseg popravka. Cijena ne ovisi o broju odabranih zahvata.','Tehnička provjera spremnosti (oblikovanje, struktura, citiranje) i preflight PDF-a','Diplomski i doktorski: 14 dana ponovnih provjera nakon ispravka, uključeno','Seminarski 3,99 · Završni 5,99 · Diplomski 9,99 · Doktorski 24,99 €'],cta:{href:'/',label:'Provjeri rad'}},
 {id:'manual',name:'Ručno uređivanje',price:'od 39 €',desc:'Ljudska obrada dokumenta kad ti treba gotov rezultat.',features:['Tehničko oblikovanje Word dokumenta','Provjera citatnica i literature','Revizija i prioritetna obrada'],cta:{order:'format',label:'Naruči uređivanje'}}
];;
