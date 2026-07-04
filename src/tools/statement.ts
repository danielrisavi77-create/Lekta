// Tipizirana, testabilna jezgra generatora Izjave o izvornosti (bez DOM-a, bez mreze).
// Slaze uobicajeni tekst izjave o izvornosti / akademskoj cestitosti. Fakulteti mogu
// propisati vlastitu formulaciju; to je i dalje na korisniku (vidi napomenu u UI-u).

export type StatementHeading = 'Izjava o izvornosti' | 'Izjava o akademskoj čestitosti';

export interface StatementInput {
  heading?: StatementHeading;
  author?: string;
  workType?: string; // npr. Diplomski rad
  title?: string;
  place?: string;    // npr. Zagreb
  date?: string;     // slobodan tekst, npr. 3. srpnja 2026.
}

export interface StatementModel {
  heading: string;
  body: string;        // puni odlomak izjave s uvrstenim podacima
  placeDate: string;   // npr. "Zagreb, 3. srpnja 2026."
  signatureName: string;
  missing: string[];   // preporucena, a prazna polja
}

const RECOMMENDED: Array<[keyof StatementInput, string]> = [
  ['author', 'ime i prezime'],
  ['workType', 'vrsta rada'],
  ['title', 'naslov rada'],
  ['place', 'mjesto'],
  ['date', 'datum'],
];

function clean(v?: string): string {
  return (v || '').replace(/\s+/g, ' ').trim();
}

// Pokazna zamjenica prema rodu vrste rada (heuristika po zavrsetku glave imenice, tj.
// zadnje rijeci): -a -> ova (radnja, disertacija, teza), -o/-e -> ovo (izvjesce, djelo),
// inace -> ovaj (rad, seminar, clanak, projekt). Bez ovoga "ovaj disertacija" je negramatican.
function demonstrative(workType: string): string {
  const head = workType.trim().split(/\s+/).pop() || '';
  if (/a$/.test(head)) return 'ova';
  if (/[oe]$/.test(head)) return 'ovo';
  return 'ovaj';
}

function joinPlaceDate(place: string, date: string): string {
  if (place && date) return `${place}, ${date}`;
  return place || date;
}

export function buildStatement(input: StatementInput): StatementModel {
  const heading: string = input.heading === 'Izjava o akademskoj čestitosti'
    ? 'Izjava o akademskoj čestitosti'
    : 'Izjava o izvornosti';

  const author = clean(input.author);
  const workType = clean(input.workType);
  const title = clean(input.title);
  const place = clean(input.place);
  const date = clean(input.date);

  const wt = workType ? workType.toLowerCase() : 'rad';
  const dem = demonstrative(wt);
  const titlePart = title ? ` pod naslovom „${title}“` : '';
  const body =
    `Izjavljujem da je ${dem} ${wt}${titlePart} rezultat isključivo mojega vlastitog rada, ` +
    `koji se temelji na mojim istraživanjima i oslanja se na objavljenu literaturu, a što pokazuju ` +
    `korištene bilješke i bibliografija. Izjavljujem da nijedan dio rada nije napisan na nedopušten način, ` +
    `odnosno da nije prepisan iz necitiranoga rada te da nijedan dio rada ne krši bilo čija autorska prava. ` +
    `Izjavljujem, također, da nijedan dio rada nije iskorišten za bilo koji drugi rad pri bilo kojoj drugoj ` +
    `visokoškolskoj, znanstvenoj ili radnoj ustanovi.`;

  const missing = RECOMMENDED.filter(([key]) => !clean(input[key])).map(([, label]) => label);

  return { heading, body, placeDate: joinPlaceDate(place, date), signatureName: author, missing };
}

// Cisti tekst izjave za kopiranje.
export function statementText(model: StatementModel): string {
  const parts = [model.heading, '', model.body, ''];
  if (model.placeDate) parts.push(model.placeDate);
  if (model.signatureName) parts.push('', model.signatureName);
  return parts.join('\n');
}
