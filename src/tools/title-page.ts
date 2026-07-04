// Tipizirana, testabilna jezgra generatora naslovnice akademskog rada (bez DOM-a, bez mreze).
// Slaze standardni hrvatski raspored naslovnice; glue (naslovnica-page.ts) crta pregled i tekst.
// Ne izmislja fakultetske predloske: raspored je uobicajeni, a tocan oblik uvijek se provjerava
// prema uputama studija (vidi napomenu u UI-u).

export interface TitlePageInput {
  university?: string; // npr. Sveučilište u Zagrebu
  faculty?: string;    // npr. Fakultet političkih znanosti
  study?: string;      // studij, odsjek ili smjer (opcionalno)
  author?: string;
  title?: string;
  subtitle?: string;
  workType?: string;   // npr. Diplomski rad
  mentor?: string;
  mentorLabel?: string;   // titula: 'Mentor' (zadano) ili 'Mentorica'
  comentor?: string;
  comentorLabel?: string; // 'Komentor' (zadano) ili 'Komentorica'
  place?: string;      // npr. Zagreb
  year?: string;       // npr. 2026
}

export type TitleRole =
  | 'university' | 'faculty' | 'study'
  | 'author' | 'title' | 'subtitle' | 'worktype'
  | 'mentor' | 'comentor' | 'placeyear';

export interface TitleLine { role: TitleRole; text: string; }

export interface TitlePageModel {
  lines: TitleLine[];
  missing: string[]; // preporucena, a prazna polja (za suptilan hint)
}

const RECOMMENDED: Array<[keyof TitlePageInput, string]> = [
  ['university', 'sveučilište'],
  ['faculty', 'fakultet'],
  ['author', 'ime i prezime'],
  ['title', 'naslov rada'],
  ['workType', 'vrsta rada'],
  ['mentor', 'mentor'],
  ['place', 'mjesto'],
  ['year', 'godina'],
];

function clean(v?: string): string {
  return (v || '').replace(/\s+/g, ' ').trim();
}

// Godina se prikazuje s tockom (hrvatski redni broj) ako je cisti broj.
function formatYear(year: string): string {
  return /^\d{3,4}$/.test(year) ? `${year}.` : year;
}

function placeYear(place: string, year: string): string {
  const y = year ? formatYear(year) : '';
  if (place && y) return `${place}, ${y}`;
  return place || y;
}

export function buildTitlePage(input: TitlePageInput): TitlePageModel {
  const f = {
    university: clean(input.university),
    faculty: clean(input.faculty),
    study: clean(input.study),
    author: clean(input.author),
    title: clean(input.title),
    subtitle: clean(input.subtitle),
    workType: clean(input.workType),
    mentor: clean(input.mentor),
    comentor: clean(input.comentor),
    place: clean(input.place),
    year: clean(input.year),
  };

  const lines: TitleLine[] = [];
  const push = (role: TitleRole, text: string) => { if (text) lines.push({ role, text }); };

  push('university', f.university);
  push('faculty', f.faculty);
  push('study', f.study);
  push('author', f.author);
  push('title', f.title);
  push('subtitle', f.subtitle);
  push('worktype', f.workType);
  if (f.mentor) push('mentor', `${clean(input.mentorLabel) || 'Mentor'}: ${f.mentor}`);
  if (f.comentor) push('comentor', `${clean(input.comentorLabel) || 'Komentor'}: ${f.comentor}`);
  push('placeyear', placeYear(f.place, f.year));

  const missing = RECOMMENDED.filter(([key]) => !(f as Record<string, string>)[key]).map(([, label]) => label);

  return { lines, missing };
}

// Cisti tekst naslovnice za kopiranje: logicke skupine odvojene praznim retkom.
export function titlePageText(model: TitlePageModel): string {
  const group = (roles: TitleRole[]) =>
    model.lines.filter(l => roles.includes(l.role)).map(l => l.text).join('\n');
  return [
    group(['university', 'faculty', 'study']),
    group(['author', 'title', 'subtitle', 'worktype']),
    group(['mentor', 'comentor']),
    group(['placeyear']),
  ].filter(Boolean).join('\n\n');
}
