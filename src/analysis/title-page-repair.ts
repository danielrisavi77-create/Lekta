import { firstPageParagraphs } from '../audits/structure';
import { normalizeAnchorText } from '../repair/anchor-text';
import { buildTitlePage, type TitlePageInput, type TitlePageModel } from '../tools/title-page';
import type { TitlePageTemplate } from '../title-pages/template-schema';

export interface TitlePageRepairValues extends TitlePageInput {
  university?: string;
  faculty?: string;
  study?: string;
}

export interface TitlePageRepairPlan {
  paragraphCount: number;
  values: TitlePageRepairValues;
  model: TitlePageModel;
  warnings: string[];
  outdated: boolean;
  logoRequired: boolean;
  logoAvailable: boolean;
}

const SUPPORTED_FIELDS: Array<keyof TitlePageRepairValues> = [
  'university', 'faculty', 'study', 'author', 'title', 'workType', 'mentor',
  'comentor', 'place', 'year', 'studentId',
];

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function lineText(lines: string[], pattern: RegExp): string {
  const line = lines.find((value) => pattern.test(value));
  if (!line) return '';
  return clean(line.replace(pattern, '$1'));
}

function yearFrom(lines: string[]): string {
  const hit = lines.join(' ').match(/\b(19\d{2}|20\d{2})\b/);
  return hit?.[1] ?? '';
}

/**
 * Mjesto iz retka koji nosi godinu, BEZ zavrsne interpunkcije.
 *
 * Redoslijed je bio obrnut i to se vidjelo u izlazu: `"Zagreb, 2026."` minus godina daje
 * `"Zagreb, ."`, pa je `[,.\-]+$` skidao samo tocku i ostavljao `"Zagreb,"`. `buildTitlePage` zatim
 * slaze `${place}, ${year}` i na naslovnicu je isao `"Zagreb,, 2026."` (izmjereno 2026-09-13 na
 * `pravo-integrirani-fusnote`, `pravo-socijalni-rad-fusnote`, `fpzg-novinarstvo-bibliografija` i
 * `word-veliki-neuredan`). Razmak zato ulazi u isti razred znakova koji se skida.
 */
function placeFrom(lines: string[], year: string): string {
  const candidate = lines.find((line) => year && line.includes(year)) ?? '';
  if (!candidate) return '';
  return clean(candidate.replace(year, '').replace(/[\s,.\-]+$/g, ''));
}

function inferValues(result: any, profile: any): TitlePageRepairValues {
  const front = firstPageParagraphs(result?.preview?.paragraphs ?? [])
    .filter((paragraph: any) => paragraph && typeof paragraph.text === 'string' && paragraph.text.trim())
    .map((paragraph: any) => clean(paragraph.text));
  const joined = front.join(' ');
  const year = yearFrom(front);
  const terms = Array.isArray(profile?.titlePageRequirements) ? profile.titlePageRequirements : [];
  const placeTerm = terms.find((entry: any) => /mjesto|zagreb|grad/i.test(String(entry?.label ?? '')));
  const placeHint = Array.isArray(placeTerm?.terms) ? clean(placeTerm.terms[0]) : '';
  const place = placeFrom(front, year) || (placeHint && new RegExp(placeHint, 'i').test(joined) ? placeHint : '');
  const workType = clean(profile?.titleWorkTerms?.[0]) || clean(result?.details?.titlePageWorkType);
  const title = clean(result?.documentStructure?.title);
  const author = clean(result?.documentStructure?.author);
  const mentor = lineText(front, /^\s*(?:mentor(?:ica)?|supervisor)\s*[:\-]?\s*(.+)$/i);
  const comentor = lineText(front, /^\s*(?:komentor(?:ica)?|co[- ]?mentor)\s*[:\-]?\s*(.+)$/i);
  const studentId = lineText(front, /^\s*(?:jmbag|mati(?:č|c)ni\s+broj)\s*[:\-]?\s*(.+)$/i);

  return {
    university: '',
    faculty: '',
    study: clean(result?.selection?.program),
    author,
    title,
    workType,
    mentor,
    comentor,
    place,
    year,
    studentId,
  };
}

/**
 * TEKST NASLOVNICE JE AUTOROV; PREDLOZAK ODREDJUJE RASPORED.
 *
 * Do 2026-09-13 su vrijednosti naslovnice dolazile iz triju izvora koji s prvom stranicom nisu
 * morali imati veze: `documentStructure.title` (a to su Wordovi metapodaci iz `docProps`),
 * `selection.program` (prazan izvan sucelja) i `titleWorkTerms` iz profila. Sve sto se tako ne
 * mapira ispadne iz modela, a fixer zamjenjuje raspon odlomaka, pa je ispadanje znacilo BRISANJE.
 *
 * Izmjereno 2026-09-13, dva razreda na dva stvarna primjerka:
 *
 *   `tests/fixtures/docx/pravo-integrirani-fusnote.docx`
 *       na stranici pise "NASLOV DIPLOMSKOGA RADA", a `docProps` nosi "Radni naslov iz predloska";
 *       popravak je autorov naslov zamijenio metapodatkom, a redak sa studijem obrisao.
 *   `tests/fixtures/docx-authored/pravo--final--prijediplomski--neuredan.docx`
 *       studij, ime autora i naslov rada nisu prepoznati NIJEDNIM izvorom (rucni sadrzaj iznad
 *       naslovnice obara detekciju strukture), pa bi sva tri retka nestala.
 *
 * Poravnanje ispod ne IZMISLJA nista: uzima tekst koji na stranici vec stoji i pridruzuje mu ulogu
 * iz predloska. Dva su koraka i oba su odbijajuca kad dokaz ne stoji.
 */

/** Uloge predloska koje imaju slobodno polje s DOSLOVNIM tekstom retka (bez prefiksa i spajanja). */
const ROLE_VALUE_KEY: Record<string, keyof TitlePageRepairValues> = {
  university: 'university',
  faculty: 'faculty',
  study: 'study',
  author: 'author',
  title: 'title',
  worktype: 'workType',
};

/**
 * Usporedba BEZ dijakritike, uz normalizaciju sidara.
 *
 * Postoji zato sto je razlika izmedju "zavrsni rad" (profilni pojam, bez dijakritike) i "završni
 * rad" (kako pise u radu) inace dovoljna da redak ostane nemapiran i bude obrisan. Folding se
 * koristi ISKLJUCIVO za prepoznavanje uloge; u dokument uvijek ide tekst KAKO GA JE AUTOR NAPISAO.
 */
function foldedText(value: string): string {
  return normalizeAnchorText(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/**
 * Usklađivanje vrijednosti s onim sto na prvoj stranici doista pise.
 *
 * Korak 1 (PRAVOPIS AUTORA): kad se redak stranice i redak modela razlikuju samo u dijakritici ili
 * velicini slova, vrijednost preuzima autorov zapis. Velika slova ostaju stvar predloska, jer ih on
 * postize stilom (`w:caps`), ne prepisivanjem teksta.
 *
 * Korak 2 (PORAVNANJE): uloge koje nakon toga nemaju POKRIVEN redak pridruzuju se preostalim
 * redcima stranice, redom. Uvjeti su kumulativni i svaki je odbijajuci:
 *   - gleda se samo raspon IZMEDJU prvog i zadnjeg prepoznatog retka (sve iznad toga nije
 *     naslovnica nego, primjerice, rucno pisan sadrzaj),
 *   - broj slobodnih redaka mora biti TOCNO jednak broju nepokrivenih obaveznih uloga,
 *   - najvise cetiri takve uloge.
 * Kad se ne poklopi, ne pridruzuje se nista i fixer ce kasnije odbiti popravak; to je namjerno
 * jeftinija steta od popravka koji obrise ime autora.
 */
function reconcileWithFront(
  front: readonly string[],
  values: TitlePageRepairValues,
  template: TitlePageTemplate,
): TitlePageRepairValues {
  const out: TitlePageRepairValues = { ...values };
  const claimedBy = (lineText: string): number => front.findIndex((p) => foldedText(lineText).includes(foldedText(p)) && foldedText(p) !== '');

  for (const line of buildModel(out, template).lines) {
    const key = ROLE_VALUE_KEY[line.role];
    if (!key) continue;
    const hit = front.find((p) => foldedText(p) === foldedText(line.text));
    if (hit && normalizeAnchorText(hit) !== normalizeAnchorText(line.text)) out[key] = hit;
  }

  const model = buildModel(out, template);
  const claimed = new Set<number>();
  for (const line of model.lines) {
    const index = claimedBy(line.text);
    if (index >= 0) claimed.add(index);
  }
  if (!claimed.size) return out;
  const first = Math.min(...claimed);
  const last = Math.max(...claimed);
  const free = front
    .map((text, index) => ({ text, index }))
    .filter((p) => p.index > first && p.index < last && !claimed.has(p.index));
  // Uloga je nepokrivena kad nema retka ILI kad njezin redak na stranici ne postoji: u oba slucaja
  // bi popravak upisao tekst kojega u radu nema. Drugi slucaj je bas `docProps` naslov.
  const openRoles = template.elements.filter((element) => {
    const key = ROLE_VALUE_KEY[element.role];
    if (!element.required || !key) return false;
    const line = model.lines.find((candidate) => candidate.role === element.role);
    return !line || claimedBy(line.text) < 0;
  });
  if (!free.length || free.length !== openRoles.length || openRoles.length > 4) return out;
  openRoles.forEach((element, i) => {
    const key = ROLE_VALUE_KEY[element.role];
    if (key) out[key] = free[i].text;
  });
  return out;
}

/**
 * Sastavlja asistirani plan za naslovnicu. Plan se nudi samo za verificirani službeni
 * predložak i pouzdano omeđenu prvu stranicu. Tekst se ne šalje u analizu niti se mijenja
 * prije korisničke potvrde.
 */
export function buildTitlePageRepairPlan(
  result: any,
  profile: any,
  template: TitlePageTemplate | null,
): TitlePageRepairPlan | null {
  if (!template || template.status !== 'verified' || template.provenance.status !== 'official') return null;
  if (profile?.checkTitlePage !== true) return null;

  const paragraphs = firstPageParagraphs(result?.preview?.paragraphs ?? []);
  const textParagraphs = paragraphs.filter((paragraph: any) => paragraph && typeof paragraph.text === 'string' && paragraph.text.trim());
  if (!paragraphs.length || !textParagraphs.length || !paragraphs.confident) return null;
  if (paragraphs.some((paragraph: any) => paragraph?.cell)) return null;

  const front = textParagraphs.map((paragraph: any) => clean(paragraph.text)).filter(Boolean);
  const values = reconcileWithFront(front, inferValues(result, profile), template);
  const model = buildModel(values, template);
  const warnings: string[] = [];
  if (template.level !== null && template.level !== (result?.settings?.workType ?? result?.selection?.workType)) {
    warnings.push('Predložak je preuzet iz druge vrste rada istog fakulteta. Provjeri ga prije primjene.');
  }
  if (template.supersededBy || template.outdated === true) {
    warnings.push('Za ovaj profil postoji novija ili označena zastarjela verzija naslovnice.');
  }
  if (template.logoRequired === true) {
    warnings.push(template.logoAvailable === true
      ? 'Službeni logo je obvezan prema profilu, ali neće biti umetnut bez zasebno verificirane datoteke.'
      : 'Službeni profil traži logo. Lekta ga neće umetnuti bez verificiranog službenog izvora.');
  }
  const missingSupported = template.elements
    .filter((element) => element.required && SUPPORTED_FIELDS.includes(element.role as keyof TitlePageRepairValues))
    .some((element) => !model.lines.some((line) => line.role === element.role));
  if (missingSupported) warnings.push('Neka obvezna polja naslovnice nisu prepoznata. Potvrdi ih u obrascu prije primjene.');

  return {
    paragraphCount: paragraphs.length,
    values,
    model,
    warnings,
    outdated: template.supersededBy !== undefined || template.outdated === true,
    logoRequired: template.logoRequired === true,
    logoAvailable: template.logoAvailable === true,
  };
}

function buildModel(values: TitlePageRepairValues, template: TitlePageTemplate): TitlePageModel {
  return buildTitlePage(values, template);
}
