// Tipizirana, testabilna jezgra generatora naslovnice akademskog rada (bez DOM-a, bez mreze).
// Slaze standardni hrvatski raspored naslovnice; glue (naslovnica-page.ts) crta pregled i tekst.
// Bez predloska raspored je genericki (uobicajeni hrvatski); s predloskom fakulteta
// (data/title-pages, vidi src/title-pages/template-schema.ts) redoslijed, obveznost i
// tipografija dolaze iz predloska. Grana bez predloska je NAMJERNO doslovno stara logika:
// regresijska sigurnost je strukturalna (tests/title-page.test.ts).
import type { TitlePageTemplate, TemplateElement } from '../title-pages/template-schema';

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

/** Tipografija jednog retka kad je naslovnica gradjena po predlosku fakulteta. */
export interface TitleLineStyle {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  uppercase?: boolean; // prezentacijski (w:caps / CSS text-transform); text ostaje netaknut
  align?: 'left' | 'center' | 'right';
}

export interface TitleLine {
  role: TitleRole;
  text: string;
  style?: TitleLineStyle; // samo uz predlozak
  group?: number;         // vertikalna zona iz predloska (razmak skupina)
}

export interface TitlePageModel {
  lines: TitleLine[];
  missing: string[]; // preporucena/obvezna, a prazna polja (za suptilan hint)
  templateId?: string; // id predloska kad je koristen
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

/** Hrvatske oznake uloga za missing hint kad obveznost dolazi iz predloska. */
const ROLE_LABELS_HR: Record<TitleRole, string> = {
  university: 'sveučilište',
  faculty: 'fakultet',
  study: 'studij',
  author: 'ime i prezime',
  title: 'naslov rada',
  subtitle: 'podnaslov',
  worktype: 'vrsta rada',
  mentor: 'mentor',
  comentor: 'komentor',
  placeyear: 'mjesto i godina',
};

type CleanFields = {
  university: string; faculty: string; study: string; author: string; title: string;
  subtitle: string; workType: string; mentor: string; comentor: string; place: string; year: string;
};

function cleanFields(input: TitlePageInput): CleanFields {
  return {
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
}

/** Tekst retka za ulogu; mentor/komentor s prefiksom titule, placeyear spojen. */
function textForRole(role: TitleRole, f: CleanFields, input: TitlePageInput): string {
  switch (role) {
    case 'university': return f.university;
    case 'faculty': return f.faculty;
    case 'study': return f.study;
    case 'author': return f.author;
    case 'title': return f.title;
    case 'subtitle': return f.subtitle;
    case 'worktype': return f.workType;
    case 'mentor': return f.mentor ? `${clean(input.mentorLabel) || 'Mentor'}: ${f.mentor}` : '';
    case 'comentor': return f.comentor ? `${clean(input.comentorLabel) || 'Komentor'}: ${f.comentor}` : '';
    case 'placeyear': return placeYear(f.place, f.year);
  }
}

/** Stil retka iz elementa predloska; font pada na defaultFont predloska (jedno mjesto
 *  razrjesenja, pa pregled i .docx citaju gotov style bez vlastitih fallbacka). */
function styleForElement(el: TemplateElement, template: TitlePageTemplate): TitleLineStyle | undefined {
  const style: TitleLineStyle = {};
  const font = el.font ?? template.defaultFont;
  if (font) style.font = font;
  if (el.sizePt !== undefined) style.sizePt = el.sizePt;
  if (el.bold) style.bold = true;
  if (el.italic) style.italic = true;
  if (el.uppercase) style.uppercase = true;
  if (el.align) style.align = el.align;
  return Object.keys(style).length ? style : undefined;
}

export function buildTitlePage(input: TitlePageInput, template?: TitlePageTemplate): TitlePageModel {
  const f = cleanFields(input);

  if (template) {
    const lines: TitleLine[] = [];
    const missing: string[] = [];
    const seenRoles = new Set<TitleRole>();
    for (const el of template.elements) {
      // Prvi element uloge dobiva korisnikov unos (uz fixedText kao popunu praznog polja).
      // Ponovljena uloga (npr. dvojezicni worktype ZAVRSNI RAD / BACHELOR THESIS ili studij u
      // dva retka) ima samo jedno korisnicko polje, pa dodatni elementi prikazuju ISKLJUCIVO
      // svoj fixedText; bez fixedTexta se preskacu da se korisnikov unos ne ponovi.
      const firstOfRole = !seenRoles.has(el.role);
      seenRoles.add(el.role);
      const text = firstOfRole
        ? textForRole(el.role, f, input) || clean(el.fixedText)
        : clean(el.fixedText);
      if (text) {
        lines.push({ role: el.role, text, style: styleForElement(el, template), group: el.group });
      } else if (el.required && firstOfRole) {
        missing.push(ROLE_LABELS_HR[el.role]);
      }
    }
    return { lines, missing, templateId: template.id };
  }

  const lines: TitleLine[] = [];
  const push = (role: TitleRole, text: string) => { if (text) lines.push({ role, text }); };

  push('university', f.university);
  push('faculty', f.faculty);
  push('study', f.study);
  push('author', f.author);
  push('title', f.title);
  push('subtitle', f.subtitle);
  push('worktype', f.workType);
  push('mentor', textForRole('mentor', f, input));
  push('comentor', textForRole('comentor', f, input));
  push('placeyear', placeYear(f.place, f.year));

  const missing = RECOMMENDED.filter(([key]) => !(f as Record<string, string>)[key]).map(([, label]) => label);

  return { lines, missing };
}

// Cisti tekst naslovnice za kopiranje: logicke skupine odvojene praznim retkom.
// Uppercase iz predloska je prezentacijski i NE primjenjuje se na copy tekst.
export function titlePageText(model: TitlePageModel): string {
  if (model.lines.some((l) => l.group !== undefined)) {
    // Predlozak: skupine dolaze iz group vrijednosti redaka, redoslijedom modela.
    const chunks: string[][] = [];
    let prevGroup: number | undefined;
    for (const line of model.lines) {
      if (!chunks.length || line.group !== prevGroup) chunks.push([]);
      chunks[chunks.length - 1].push(line.text);
      prevGroup = line.group;
    }
    return chunks.map((c) => c.join('\n')).join('\n\n');
  }
  const group = (roles: TitleRole[]) =>
    model.lines.filter(l => roles.includes(l.role)).map(l => l.text).join('\n');
  return [
    group(['university', 'faculty', 'study']),
    group(['author', 'title', 'subtitle', 'worktype']),
    group(['mentor', 'comentor']),
    group(['placeyear']),
  ].filter(Boolean).join('\n\n');
}
