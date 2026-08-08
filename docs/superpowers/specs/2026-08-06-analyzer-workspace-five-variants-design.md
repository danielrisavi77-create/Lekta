# Analyzer workspace, pet vizualnih varijanti

## Cilj

Omogućiti brzu usporedbu pet različitih vizualnih smjerova za isti upload-first analyzer workspace. Varijante su izolirani demo artefakti i ne mijenjaju live analizator.

## Zajednički UX ugovor

- Početno stanje prikazuje upload kao primarni korak.
- Klik, Enter ili Space na uploadu otkrivaju kontekst rada u istom panelu.
- Pokretanje provjere prelazi u obradu, a zatim u demo rezultat bez promjene stranice.
- Sve varijante koriste isti tekst, iste demo podatke i iste state hookove.
- Mobilni prikaz slaže workspace u jednu kolonu, bez horizontalnog overflowa.

## Vizualne varijante

1. **Editorial instrument**: osnovni Lekta papir, veći serifni naslov, crveni korektorski akcenti i urednički ritam.
2. **Blueprint lab**: hladnija plava mreža, tehničke oznake, sken linije i više analitičkog HUD karaktera.
3. **Magazine layout**: asimetrične proporcije, snažan naslov, veći negativni prostor i art-direction osjećaj.
4. **Dark cockpit**: tamni paneli, kontrolirano crveno i plavo svjetlo, visok kontrast i premium dashboard karakter.
5. **Tactile desk**: slojevi papira, štambilji, ravnalo, sticky note detalji i fizički korektorski stol.

Varijante mijenjaju samo tokene, dekorativne slojeve i naglaske. Ne mijenjaju poslovnu logiku, podatke ni pristupačnost.

## Arhitektura

- `analyzer-workspace-demo.html` ostaje jedinstveni sadržajni i interaktivni demo.
- `analyzer-workspace-demo.ts` čita `?variant=` i postavlja `data-demo-variant` na glavni element.
- `analyzer-workspace-demo.css` definira zajedničke stilove i scoped override tokene za pet naziva varijanti.
- `analyzer-workspace-variants.html` prikazuje svih pet demoa u galeriji s linkom za otvaranje pojedinačne varijante.
- Live `index.html` i `src/ui/app.ts` ostaju netaknuti.

## Provjera prihvaćanja

- Galerija ima točno pet označenih varijanti.
- Svaka iframe varijanta učitava isti demo s drugim query parametrom.
- Svaka varijanta ima isti upload-first tok i rezultat 87.
- Axe nema critical ili serious probleme na galeriji ni na pojedinačnom demou.
- Reduced-motion preskače tranzicije u svim varijantama.
