/**
 * GLASOVI KOJE NOSI SVAKA STRANICA: Newsreader (govori) i Inter Tight (oznacava).
 *
 * Newsreader ima os opticke velicine, pa isti rez drzi i 3rem naslov i 0.9rem nadnaslov bez
 * razvlacenja; kurziv je zaseban rez i placa se zasebno (vidi biljesku dolje).
 *
 * Razdvojeno od `fonts-document.ts` 2026-09-05, kad je ulaz `/` sveden na dva glasa. Do tada je
 * `ui-boot.ts` uvozio svih pet obitelji za svaku stranicu, pa je i cisti ulaz za ucitavanje
 * dokumenta skidao podatkovni mono koji na njemu nema nijednu metu.
 *
 * KURZIV JE NAJSKUPLJA DATOTEKA NA ULAZU (~143 kB, vise od uspravnog reza od ~129 kB). Nosi ga
 * nadnaslov na papiru i naslovi stupaca u podnozju. Ako ikad zatreba rezati bajtove na `/`, ovo
 * je prvo mjesto: brisanje ovog retka trazi da ta dva mjesta predju na uspravni rez.
 */
import '@fontsource-variable/inter-tight'; // self-hostan glas sucelja (latin + latin-ext za hrvatski)
import '@fontsource-variable/newsreader/opsz.css'; // display serif s osi opticke velicine
import '@fontsource-variable/newsreader/opsz-italic.css'; // kurziv: nadnaslov, biljeska korektora
