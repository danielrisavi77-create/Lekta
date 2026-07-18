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
  studentId?: string;  // JMBAG / maticni broj studenta (opcionalno; trazi ga ~30 predlozaka)
  course?: string;     // naziv kolegija/predmeta (opcionalno; seminarski radovi)
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
  | 'author' | 'studentId' | 'course' | 'title' | 'subtitle' | 'worktype'
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

// FAQ (naslovnica.html) tvrdi da je mentor "gotovo uvijek" obvezan kod zavrsnih/diplomskih, ali
// da kod seminarskih ovisi o kolegiju; projektni radovi cesto uopce nemaju mentora. Bez ovog
// uvjeta genericka (bez predloska) grana bi svejedno prikazala "Preporuceno dodati: mentor" za
// te dvije vrste rada i proturjecila vlastitom FAQ-u.
function mentorRecommended(workType: string): boolean {
  const wt = workType.toLowerCase();
  return !wt.includes('seminar') && !wt.includes('projekt');
}

/** Hrvatske oznake uloga za missing hint kad obveznost dolazi iz predloska. */
const ROLE_LABELS_HR: Record<TitleRole, string> = {
  university: 'sveučilište',
  faculty: 'fakultet',
  study: 'studij',
  author: 'ime i prezime',
  studentId: 'JMBAG',
  course: 'kolegij',
  title: 'naslov rada',
  subtitle: 'podnaslov',
  worktype: 'vrsta rada',
  mentor: 'mentor',
  comentor: 'komentor',
  placeyear: 'mjesto i godina',
};

type CleanFields = {
  university: string; faculty: string; study: string; author: string; studentId: string;
  course: string; title: string; subtitle: string; workType: string; mentor: string;
  comentor: string; place: string; year: string;
};

function cleanFields(input: TitlePageInput): CleanFields {
  return {
    university: clean(input.university),
    faculty: clean(input.faculty),
    study: clean(input.study),
    author: clean(input.author),
    studentId: clean(input.studentId),
    course: clean(input.course),
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
    case 'studentId': return f.studentId ? `JMBAG: ${f.studentId}` : '';
    case 'course': return f.course ? `Kolegij: ${f.course}` : '';
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

/** Ponovljena uloga (npr. dvojezicni worktype ZAVRSNI RAD / BACHELOR THESIS, ili studij u dva
 *  retka: fiksna institucijska fraza + stvarni naziv studija) ima samo JEDNO korisnicko polje.
 *  Ovo bira koji element uloge to polje prima: prvi NELOCKANI obavezni element, inace prvi
 *  nelockani element; ako su svi elementi uloge locked (nepromjenjiva fraza bez slobodnog
 *  polja, npr. biotech-final gdje su i institucijska fraza i naziv studija fiksni), uloga
 *  uopce ne cita korisnikov unos. Za ulogu s jednim elementom to je uvijek taj element
 *  (ponasanje kao prije uvodjenja locked). */
function pickRecipients(elements: TemplateElement[]): Set<TemplateElement> {
  const byRole = new Map<TitleRole, TemplateElement[]>();
  for (const el of elements) {
    if (el.locked && el.fixedText) continue;
    const arr = byRole.get(el.role);
    if (arr) arr.push(el); else byRole.set(el.role, [el]);
  }
  const recipients = new Set<TemplateElement>();
  for (const candidates of byRole.values()) {
    recipients.add(candidates.find((el) => el.required) ?? candidates[0]);
  }
  return recipients;
}

/** Ubaci novi redak iza ZADNJEG retka neke od uloga (redom prioriteta), nasljedujuci
 *  njegovu grupu; bez pogotka redak ide na kraj. Za studentId/course koji nemaju element
 *  u predlosku (v1 predlosci ih ne modeliraju), pa se sidre uz srodnu ulogu. */
function insertAfterRole(lines: TitleLine[], anchors: TitleRole[], line: TitleLine): void {
  for (const anchor of anchors) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].role === anchor) {
        lines.splice(i + 1, 0, { ...line, group: lines[i].group });
        return;
      }
    }
  }
  lines.push(line);
}

export function buildTitlePage(input: TitlePageInput, template?: TitlePageTemplate): TitlePageModel {
  const f = cleanFields(input);

  if (template) {
    const lines: TitleLine[] = [];
    const missing: string[] = [];
    const recipients = pickRecipients(template.elements);
    const roleOccurrences = new Map<TitleRole, number>();
    for (const el of template.elements) roleOccurrences.set(el.role, (roleOccurrences.get(el.role) ?? 0) + 1);
    for (const el of template.elements) {
      const text = recipients.has(el)
        ? textForRole(el.role, f, input) || clean(el.fixedText)
        : clean(el.fixedText);
      if (text) {
        lines.push({ role: el.role, text, style: styleForElement(el, template), group: el.group });
      } else if (el.required) {
        // Generickog ROLE_LABELS_HR ne moze razlikovati "Naziv studija" od "Smjer studija":
        // za ponovljenu ulogu missing hint koristi vlastiti el.label kad postoji.
        const isDuplicateRole = (roleOccurrences.get(el.role) ?? 0) > 1;
        missing.push(isDuplicateRole && el.label ? clean(el.label) : ROLE_LABELS_HR[el.role]);
      }
    }
    // JMBAG/kolegij: v1 predlosci ih ne modeliraju kao elemente (samo notes), pa se popunjeni
    // unos sidri uz srodnu ulogu (JMBAG ispod imena, kolegij uz studij) s fontom predloska.
    const injectedStyle: TitleLineStyle | undefined = template.defaultFont ? { font: template.defaultFont } : undefined;
    if (f.studentId) {
      insertAfterRole(lines, ['author'], { role: 'studentId', text: textForRole('studentId', f, input), style: injectedStyle });
    }
    if (f.course) {
      insertAfterRole(lines, ['study', 'faculty'], { role: 'course', text: textForRole('course', f, input), style: injectedStyle });
    }
    return { lines, missing, templateId: template.id };
  }

  const lines: TitleLine[] = [];
  const push = (role: TitleRole, text: string) => { if (text) lines.push({ role, text }); };

  push('university', f.university);
  push('faculty', f.faculty);
  push('study', f.study);
  push('course', textForRole('course', f, input));
  push('author', f.author);
  push('studentId', textForRole('studentId', f, input));
  push('title', f.title);
  push('subtitle', f.subtitle);
  push('worktype', f.workType);
  push('mentor', textForRole('mentor', f, input));
  push('comentor', textForRole('comentor', f, input));
  push('placeyear', placeYear(f.place, f.year));

  const missing = RECOMMENDED
    .filter(([key]) => key !== 'mentor' || mentorRecommended(f.workType))
    .filter(([key]) => !(f as Record<string, string>)[key])
    .map(([, label]) => label);

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
    group(['university', 'faculty', 'study', 'course']),
    group(['author', 'studentId', 'title', 'subtitle', 'worktype']),
    group(['mentor', 'comentor']),
    group(['placeyear']),
  ].filter(Boolean).join('\n\n');
}
