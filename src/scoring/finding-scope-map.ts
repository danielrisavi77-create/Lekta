/**
 * GDJE NALAZ ZIVI, IZVEDENO IZ STABILNOG `checkId`.
 *
 * Izmjereno 2026-09-08 preko svih 19 golden fixtura, 233 nalaza:
 *
 *     sidro (zna odlomak)      13    6%
 *     cijeli dokument           0    0%
 *     lokacija nepoznata      220   94%
 *
 * Onih 94% nije bila istina nego IZOSTANAK ODGOVORA: margina vrijedi za svaku stranicu, a
 * korisniku je pisalo "Lokacija se za ovaj nalaz ne moze pouzdano odrediti". To je losije od
 * sutnje, jer zvuci kao da Lekta ne zna nesto sto zapravo zna.
 *
 * ZASTO PO `checkId`, A NE PO `issue.where`: `where` je slobodan tekst za oko (15 razlicitih
 * vrijednosti, a 109 od 233 nalaza ga uopce nema). `checkId` je registriran, jezicno neovisan i
 * hijerarhijski (`check-id-registry.ts`), pa je preslikavanje POPIS, ne pogadjanje. Isti razlog
 * zbog kojeg `check-fixer-map.ts` vec kljuci po `checkId`, a ne po hrvatskom naslovu.
 *
 * TRI ISHODA, i razlika medju njima je tvrdnja prema korisniku:
 *   document   nalaz vrijedi za CIJELI rad (margine, dominantni font, prored, opseg). Tocno, i
 *              korisnik zna da nema smisla traziti mjesto.
 *   region     znamo PODRUCJE ali ne odlomak (naslovnica, sadrzaj, popis literature). Iskrenije
 *              od "ne znam", a ne tvrdi preciznost sidra.
 *   null       nemamo nista; pozivatelj zadrzava zatecenu formulaciju.
 *
 * ZIVI U `src/scoring`, NE U `src/ui`: tumaci namespace `check-id-registry.ts`, dakle identitet
 * PROVJERE, a ne nacin prikaza. Iskreno: selidbu je potaknuo ratchet `src/ui`, ali granica je
 * ionako ovdje ispravnija; crtanje (`scopeHtml`) ostaje u UI sloju.
 *
 * NE IZMISLJA SE SIDRO. Sidro znaci "ovaj odlomak" i mora doci iz motora (`triage.locations` ili
 * `collectIssueAnchors`). Ova mapa ga nikad ne proizvodi, jer bi pogodjen indeks odlomka bio
 * tvrdnja o mjestu u TUDJEM dokumentu koju nista ne potkrepljuje.
 */

export type MappedScope =
  | { kind: 'document' }
  | { kind: 'region'; label: string };

/**
 * Prefiks -> opseg. Redoslijed je vazan samo utoliko sto se trazi NAJDULJI pogodak, pa
 * `page.numbers.` moze imati drukciju presudu od `page.` ako ikad zatreba.
 */
const PO_PREFIKSU: ReadonlyArray<readonly [string, MappedScope]> = [
  // Oblikovanje tijela rada: font, velicina, prored, poravnanje, razmaci. Mjeri se nad DOMINANTOM
  // cijelog dokumenta, pa je "cijeli rad" doslovno tocno.
  ['format.', { kind: 'document' }],
  // Postavke stranice: margine, format, brojevi stranica. Vrijede za svaku stranicu.
  ['page.', { kind: 'document' }],
  // Opseg (rijeci, kartice, stranice) je svojstvo cjeline.
  ['scope.', { kind: 'document' }],
  // Podrucja koja se u dokumentu daju naci, ali nemamo indeks odlomka.
  ['title.', { kind: 'region', label: 'naslovna stranica' }],
  ['toc.', { kind: 'region', label: 'sadržaj' }],
  ['reference.', { kind: 'region', label: 'popis literature' }],
  ['method.', { kind: 'region', label: 'metodologija' }],
];

/**
 * `manual.*` NAMJERNO nije u mapi: to su rucne provjere predaje (potpisi, obrasci, rokovi), koje
 * nisu mjesto u dokumentu nego korak u postupku. Proglasiti ih "cijelim dokumentom" znacilo bi
 * reci da se odnose na tekst, a ne odnose se.
 *
 * `citation.*`, `footnote.*`, `structure.*`, `element.*` i `legal.*` takodjer ostaju vani: oni
 * IMAJU tocno mjesto, samo ga motor za taj nalaz nije uvijek izvukao. Presuda "cijeli dokument"
 * bila bi tvrdnja da mjesta nema, a ono postoji; `unavailable` je ondje istinitiji odgovor.
 */
export function scopeForCheckId(checkId: string | null | undefined): MappedScope | null {
  const id = String(checkId || '').trim();
  if (!id) return null;
  let najbolji: readonly [string, MappedScope] | null = null;
  for (const par of PO_PREFIKSU) {
    if (!id.startsWith(par[0])) continue;
    if (!najbolji || par[0].length > najbolji[0].length) najbolji = par;
  }
  return najbolji ? najbolji[1] : null;
}
