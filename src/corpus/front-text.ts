/**
 * Tekst prvih stranica dokumenta, za prepoznavanje ustanove i vrste rada s naslovnice.
 *
 * IZDVOJENO IZ `scripts/corpus-ingest.mts` 2026-08-24 da se moze testirati: skripta na vrhu modula
 * poziva `await main()`, pa bi je uvoz u test POKRENUO.
 *
 * KVAR KOJI JE IZDVAJANJE IZAZVALO: runovi su se spajali RAZMAKOM. Word razlomi naslovnicu na
 * runove cim se dio drukcije oblikuje ili ga provjera pravopisa presijece, pa je "Završni rad"
 * izlazio kao "Završni  rad" (dva razmaka) i uzorak `/zavr[šs]ni rad/i` vise nije pogadjao. Isto se
 * dogadjalo s imenima ustanova i s brojkama ("2024 ./ 25 .").
 *
 * Ispravno je: runovi se spajaju NICIM (razmak koji stvarno postoji zapisan je unutar `<w:t>`), a
 * razmak se umece samo na granici ODLOMKA, inace bi se zadnja rijec jednog i prva rijec sljedeceg
 * odlomka slijepile.
 *
 * Izmjereno na 246 stvarnih radova, spajanje razmakom -> spajanje nicim:
 *   ustanova prepoznata            107 -> 122
 *   vrsta rada prepoznata           63 ->  68
 *   OBOJE (uvjet za profil)         47 ->  52
 *
 * Uzorci tolerantni na razmak (`\s+` umjesto razmaka) MJERENI su i ne dodaju nista preko ovoga
 * (52 -> 52), jer sazimanje razmaka ovdje vec rjesava isti slucaj. Zato se ne uvode.
 */

/** Koliko XML-a se uopce gleda; naslovnica je na pocetku, ostatak samo trosi vrijeme. */
const XML_HEAD = 200_000;

/** Koliko teksta vraca; uzorci ustanove i vrste rada zive na prve dvije-tri stranice. */
const TEXT_LIMIT = 3000;

export function frontText(documentXml: string): string {
  const head = documentXml.slice(0, XML_HEAD);
  const paragraphs: string[] = [];
  for (const para of head.split(/<\/w:p>/)) {
    const texts = [...para.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    if (texts.length) paragraphs.push(texts.join(''));
  }
  return paragraphs.join(' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);
}
